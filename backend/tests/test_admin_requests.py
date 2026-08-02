from datetime import date, timedelta, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Building, Request, AuditLog, Service
from app.core.security import get_password_hash
import app.routers.requests as requests_module

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_admin_requests.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


client = TestClient(app)
_old_db_override = None
_old_session_local = None


def setup_module():
    global _old_db_override, _old_session_local
    _old_db_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    _old_session_local = requests_module.SessionLocal
    requests_module.SessionLocal = TestingSessionLocal
    Base.metadata.create_all(bind=engine)


def teardown_module():
    global _old_db_override, _old_session_local
    Base.metadata.drop_all(bind=engine)
    if _old_db_override is not None:
        app.dependency_overrides[get_db] = _old_db_override
    else:
        app.dependency_overrides.pop(get_db, None)
    if _old_session_local is not None:
        requests_module.SessionLocal = _old_session_local


def get_token_for_user(client, user):
    """Получает токен для пользователя."""
    response = client.post("/api/auth/login", json={
        "username": user.username,
        "password": "testpass123"
    })
    return response.json()["access_token"]


def test_admin_delete_request_soft():
    """Проверка soft delete заявки админом."""
    db = TestingSessionLocal()
    admin = User(username="admin_del_soft", hashed_password=get_password_hash("testpass123"), role="admin", is_active=True)
    comendant = User(username="comendant_del_soft", hashed_password=get_password_hash("testpass123"), role="comendant", is_active=True)
    building = Building(number="10", name="Корпус 10", is_active=True)
    db.add_all([admin, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Удалить", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    token = get_token_for_user(client, admin)

    response = client.delete(
        f"/api/requests/{req.id}",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "deleted_at" in data

    # Проверка soft delete в БД
    db.refresh(req)
    assert req.deleted_at is not None
    db.close()


def test_admin_delete_request_creates_audit_log():
    """Проверка создания записи в audit log при удалении."""
    db = TestingSessionLocal()
    admin = User(username="admin_del_audit", hashed_password=get_password_hash("testpass123"), role="admin", is_active=True)
    comendant = User(username="comendant_del_audit", hashed_password=get_password_hash("testpass123"), role="comendant", is_active=True)
    building = Building(number="11", name="Корпус 11", is_active=True)
    db.add_all([admin, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Удалить с логом", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    token = get_token_for_user(client, admin)

    response = client.delete(
        f"/api/requests/{req.id}",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200

    log_entry = db.query(AuditLog).filter(
        AuditLog.entity_type == "request",
        AuditLog.entity_id == req.id,
        AuditLog.action == "deleted"
    ).first()

    assert log_entry is not None
    assert log_entry.user_id == admin.id
    assert log_entry.old_values is not None
    assert log_entry.new_values is None
    db.close()


def test_admin_update_all_fields():
    """Проверка редактирования всех полей админом."""
    db = TestingSessionLocal()
    admin = User(username="admin_update_all", hashed_password=get_password_hash("testpass123"), role="admin", is_active=True)
    comendant = User(username="comendant_update_all", hashed_password=get_password_hash("testpass123"), role="comendant", is_active=True)
    contractor = User(username="contractor_update_all", hashed_password=get_password_hash("testpass123"), role="contractor", is_active=True)
    building = Building(number="12", name="Корпус 12", is_active=True)
    service = Service(name="Услуга для обновления", unit="шт", price=Decimal("500.00"), is_active=True)
    db.add_all([admin, comendant, contractor, building, service])
    db.commit()
    db.refresh(service)

    req = Request(building_id=building.id, description="Старое описание", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    token = get_token_for_user(client, admin)

    new_data = {
        "building_id": building.id,
        "service_id": service.id,
        "description": "Новое описание",
        "status": "in_progress",
        "assigned_to": contractor.id,
        "due_date": "2026-12-31",
    }

    response = client.put(
        f"/api/requests/{req.id}/admin",
        json=new_data,
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["building"]["id"] == building.id
    assert data["service"]["id"] == service.id
    assert data["description"] == "Новое описание"
    assert data["status"] == "in_progress"
    assert data["executor"]["id"] == contractor.id
    db.close()


def test_get_audit_logs_admin_only():
    """Проверка доступа к логам только для админа."""
    db = TestingSessionLocal()
    admin = User(username="admin_logs_only", hashed_password=get_password_hash("testpass123"), role="admin", is_active=True)
    contractor = User(username="contractor_logs_only", hashed_password=get_password_hash("testpass123"), role="contractor", is_active=True)
    db.add_all([admin, contractor])
    db.commit()

    # Админ должен иметь доступ
    admin_token = get_token_for_user(client, admin)
    response = client.get(
        "/api/admin/audit-logs",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200

    # Подрядчик не должен иметь доступ
    contractor_token = get_token_for_user(client, contractor)
    response = client.get(
        "/api/admin/audit-logs",
        headers={"Authorization": f"Bearer {contractor_token}"}
    )
    assert response.status_code == 403
    db.close()


def test_audit_logs_filters():
    """Проверка фильтрации логов."""
    db = TestingSessionLocal()
    admin = User(username="admin_logs_filter", hashed_password=get_password_hash("testpass123"), role="admin", is_active=True)
    comendant = User(username="comendant_logs_filter", hashed_password=get_password_hash("testpass123"), role="comendant", is_active=True)
    building = Building(number="13", name="Корпус 13", is_active=True)
    db.add_all([admin, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Фильтр", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()

    token = get_token_for_user(client, admin)

    # Фильтр по entity_type
    response = client.get(
        "/api/admin/audit-logs?entity_type=request",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    if data["items"]:
        assert all(item["entity_type"] == "request" for item in data["items"])
    db.close()


def test_deleted_request_not_in_list():
    """Проверка отсутствия удалённой заявки в списке."""
    db = TestingSessionLocal()
    admin = User(username="admin_del_list", hashed_password=get_password_hash("testpass123"), role="admin", is_active=True)
    comendant = User(username="comendant_del_list", hashed_password=get_password_hash("testpass123"), role="comendant", is_active=True)
    building = Building(number="14", name="Корпус 14", is_active=True)
    db.add_all([admin, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Удалить из списка", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    token = get_token_for_user(client, admin)

    # Удаляем заявку
    response = client.delete(
        f"/api/requests/{req.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200

    # Проверяем, что её нет в списке
    response = client.get(
        "/api/requests",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert req.id not in [item["id"] for item in data["items"]]
    db.close()


def test_admin_can_update_status():
    """Проверка изменения статуса заявки админом."""
    db = TestingSessionLocal()
    admin = User(username="admin_status", hashed_password=get_password_hash("testpass123"), role="admin", is_active=True)
    comendant = User(username="comendant_status", hashed_password=get_password_hash("testpass123"), role="comendant", is_active=True)
    building = Building(number="15", name="Корпус 15", is_active=True)
    db.add_all([admin, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Сменить статус", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    token = get_token_for_user(client, admin)

    response = client.put(
        f"/api/requests/{req.id}/admin",
        json={"status": "in_progress"},
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "in_progress"
    db.close()


def test_admin_can_update_due_date():
    """Проверка изменения срока выполнения заявки админом."""
    db = TestingSessionLocal()
    admin = User(username="admin_duedate", hashed_password=get_password_hash("testpass123"), role="admin", is_active=True)
    comendant = User(username="comendant_duedate", hashed_password=get_password_hash("testpass123"), role="comendant", is_active=True)
    building = Building(number="16", name="Корпус 16", is_active=True)
    db.add_all([admin, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Сменить срок", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    token = get_token_for_user(client, admin)

    new_due_date = (date.today() + timedelta(days=10)).isoformat()
    response = client.put(
        f"/api/requests/{req.id}/admin",
        json={"due_date": new_due_date},
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["due_date"] == new_due_date
    db.close()


def test_contractor_cannot_delete_request():
    """Проверка того, что подрядчик не может удалять заявки."""
    db = TestingSessionLocal()
    contractor = User(username="contractor_no_delete", hashed_password=get_password_hash("testpass123"), role="contractor", is_active=True)
    comendant = User(username="comendant_no_delete", hashed_password=get_password_hash("testpass123"), role="comendant", is_active=True)
    building = Building(number="17", name="Корпус 17", is_active=True)
    db.add_all([contractor, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Не удалить", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    token = get_token_for_user(client, contractor)

    response = client.delete(
        f"/api/requests/{req.id}",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 403
    db.close()


def test_director_cannot_delete_request():
    """Проверка того, что директор не может удалять заявки."""
    db = TestingSessionLocal()
    director = User(username="director_no_delete", hashed_password=get_password_hash("testpass123"), role="director", is_active=True)
    comendant = User(username="comendant_dir_no_del", hashed_password=get_password_hash("testpass123"), role="comendant", is_active=True)
    building = Building(number="18", name="Корпус 18", is_active=True)
    db.add_all([director, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Не удалить", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    token = get_token_for_user(client, director)

    response = client.delete(
        f"/api/requests/{req.id}",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 403
    db.close()
