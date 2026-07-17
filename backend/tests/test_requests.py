import zipfile
from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import ANY, patch

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Building, Request, PushSubscription, Service, Work
from app.core.security import get_password_hash
import app.routers.requests as requests_module

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_requests.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def make_jpeg_bytes() -> bytes:
    img = Image.new("RGB", (10, 10), color="red")
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


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


def test_comendant_can_create_request():
    db = TestingSessionLocal()
    comendant = User(username="comendant1", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="10", name="Корпус 10", is_active=True)
    db.add_all([comendant, building])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "comendant1", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        "/api/requests",
        headers={"Authorization": f"Bearer {token}"},
        json={"building_id": building.id, "description": "Протечка"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["building"]["id"] == building.id
    assert data["description"] == "Протечка"
    assert data["status"] == "new"
    assert data["extended_count"] == 0
    expected_due = (date.today() + timedelta(days=5)).isoformat()
    assert data["due_date"] == expected_due
    db.close()


def test_comendant_can_upload_photo_to_request():
    db = TestingSessionLocal()
    comendant = User(username="comendant_photo", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="11", name="Корпус 11", is_active=True)
    db.add_all([comendant, building])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "comendant_photo", "password": "pass"})
    token = login.json()["access_token"]

    req = Request(building_id=building.id, description="Фото", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    image = BytesIO(make_jpeg_bytes())
    response = client.post(
        f"/api/requests/{req.id}/photos",
        headers={"Authorization": f"Bearer {token}"},
        files={"files": ("test.jpg", image, "image/jpeg")},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["success"] is True
    assert data["uploaded"] == 1
    assert len(data["photos"]) == 1
    db.close()


def test_executor_can_take_request():
    db = TestingSessionLocal()
    comendant = User(username="comendant_take", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    contractor = User(username="contractor_take", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="12", name="Корпус 12", is_active=True)
    db.add_all([comendant, contractor, building])
    db.commit()

    req = Request(building_id=building.id, description="Взять", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "contractor_take", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}/take",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "in_progress"
    assert response.json()["executor"]["id"] == contractor.id
    db.close()


def test_director_can_assign_request():
    db = TestingSessionLocal()
    director = User(username="director_assign", hashed_password=get_password_hash("pass"), role="director", is_active=True)
    contractor = User(username="contractor_assign", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    comendant = User(username="comendant_assign", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="13", name="Корпус 13", is_active=True)
    db.add_all([director, contractor, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Назначить", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "director_assign", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}/assign",
        headers={"Authorization": f"Bearer {token}"},
        json={"user_id": contractor.id},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "in_progress"
    assert data["executor"]["id"] == contractor.id
    db.close()


def test_contractor_can_complete_own_request():
    db = TestingSessionLocal()
    comendant = User(username="comendant_complete", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    contractor = User(username="contractor_complete", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="14", name="Корпус 14", is_active=True)
    service = Service(name="Мелкий ремонт", unit="шт", price=Decimal("300.00"), is_active=True)
    db.add_all([comendant, contractor, building, service])
    db.commit()
    db.refresh(service)

    req = Request(building_id=building.id, description="Завершить", status="in_progress", created_by=comendant.id,
                  assigned_to=contractor.id, service_id=service.id, due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "contractor_complete", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "completed"
    db.close()


def test_contractor_cannot_complete_alien_request():
    db = TestingSessionLocal()
    comendant = User(username="comendant_alien", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    contractor_a = User(username="contractor_a", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    contractor_b = User(username="contractor_b", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="15", name="Корпус 15", is_active=True)
    db.add_all([comendant, contractor_a, contractor_b, building])
    db.commit()

    req = Request(building_id=building.id, description="Чужая", status="in_progress", created_by=comendant.id,
                  assigned_to=contractor_a.id, due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "contractor_b", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403, response.text
    db.close()


def test_admin_can_extend_request():
    db = TestingSessionLocal()
    admin = User(username="admin_extend", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    comendant = User(username="comendant_extend", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="13", name="Корпус 13", is_active=True)
    db.add_all([admin, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Продлить", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "admin_extend", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        f"/api/requests/{req.id}/extend",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["extended_count"] == 1
    db.close()


def test_create_request_schedules_push_background_task():
    with TestingSessionLocal() as db:
        comendant = User(username="comendant_push", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
        director = User(username="director_push", hashed_password=get_password_hash("pass"), role="director", is_active=True)
        building = Building(number="20", name="Корпус 20", is_active=True)
        db.add_all([comendant, director, building])
        db.commit()

        sub = PushSubscription(user_id=director.id, endpoint="https://push.example/x", p256dh="x", auth="y")
        db.add(sub)
        db.commit()

        with patch("app.routers.requests._send_push_on_new_request") as mock_send:
            login = client.post("/api/auth/login", json={"username": "comendant_push", "password": "pass"})
            token = login.json()["access_token"]
            response = client.post(
                "/api/requests",
                headers={"Authorization": f"Bearer {token}"},
                json={"building_id": building.id, "description": "Тест push"},
            )
            assert response.status_code == 200, response.text
            request_id = response.json()["id"]
            mock_send.assert_called_once_with(
                ["director", "admin"],
                title="Новая заявка",
                body="Корпус 20: Тест push",
                link=f"/requests/{request_id}",
            )


def test_create_request_background_task_sends_push_to_directors_and_admins():
    import app.services.push_service as push_service_module

    old_private = push_service_module.settings.VAPID_PRIVATE_KEY
    old_public = push_service_module.settings.VAPID_PUBLIC_KEY
    push_service_module.settings.VAPID_PRIVATE_KEY = "private"
    push_service_module.settings.VAPID_PUBLIC_KEY = "public"
    webpush_calls = []

    def fake_webpush(subscription_info, **kwargs):
        webpush_calls.append(subscription_info)

    try:
        with TestingSessionLocal() as db:
            # Очищаем подписки от предыдущих тестов, чтобы не слать лишние push.
            db.query(PushSubscription).delete(synchronize_session=False)
            db.commit()

            comendant = User(username="comendant_push_int", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
            director = User(username="director_push_int", hashed_password=get_password_hash("pass"), role="director", is_active=True)
            admin = User(username="admin_push_int", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
            contractor = User(username="contractor_push_int", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
            building = Building(number="21", name="Корпус 21", is_active=True)
            db.add_all([comendant, director, admin, contractor, building])
            db.commit()

            director_sub = PushSubscription(user_id=director.id, endpoint="https://push.example/director", p256dh="dp", auth="da")
            admin_sub = PushSubscription(user_id=admin.id, endpoint="https://push.example/admin", p256dh="ap", auth="aa")
            contractor_sub = PushSubscription(user_id=contractor.id, endpoint="https://push.example/contractor", p256dh="cp", auth="ca")
            db.add_all([director_sub, admin_sub, contractor_sub])
            db.commit()

            with patch("app.services.push_service.webpush", side_effect=fake_webpush):
                login = client.post("/api/auth/login", json={"username": "comendant_push_int", "password": "pass"})
                token = login.json()["access_token"]
                response = client.post(
                    "/api/requests",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"building_id": building.id, "description": "Интеграционный тест push"},
                )
                assert response.status_code == 200, response.text

            endpoints = {call["endpoint"] for call in webpush_calls}
            assert endpoints == {"https://push.example/director", "https://push.example/admin"}
    finally:
        push_service_module.settings.VAPID_PRIVATE_KEY = old_private
        push_service_module.settings.VAPID_PUBLIC_KEY = old_public


def test_director_can_print_requests_zip():
    db = TestingSessionLocal()
    director = User(username="director_print", hashed_password=get_password_hash("pass"), role="director", is_active=True)
    comendant = User(username="comendant_print", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="30", name="Корпус 30", address="ул. Лермонтова, 5", is_active=True)
    db.add_all([director, comendant, building])
    db.commit()

    req1 = Request(building_id=building.id, description="Протечка", status="new", created_by=comendant.id,
                   due_date=date.today() + timedelta(days=5), extended_count=0)
    req2 = Request(building_id=building.id, description="Замена лампочки", status="in_progress", created_by=comendant.id,
                   due_date=date.today() + timedelta(days=5), extended_count=1)
    db.add_all([req1, req2])
    db.commit()
    db.refresh(req1)
    db.refresh(req2)

    login = client.post("/api/auth/login", json={"username": "director_print", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        "/api/requests/print",
        headers={"Authorization": f"Bearer {token}"},
        json={"ids": [req1.id, req2.id]},
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert 'attachment; filename="zayavki_' in response.headers["content-disposition"]

    zip_bytes = BytesIO(response.content)
    with zipfile.ZipFile(zip_bytes, "r") as zf:
        names = zf.namelist()
        assert f"zayavka_{req1.id}.docx" in names
        assert f"zayavka_{req2.id}.docx" in names
        assert len(names) == 2
    db.close()


def test_contractor_can_print_assigned_requests():
    db = TestingSessionLocal()
    director = User(username="director_contractor_print", hashed_password=get_password_hash("pass"), role="director", is_active=True)
    contractor = User(username="contractor_print_ok", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    other_contractor = User(username="other_contractor_print", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    comendant = User(username="comendant_contractor_print", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="50", name="Корпус 50", is_active=True)
    db.add_all([director, contractor, other_contractor, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Моя заявка", status="in_progress", created_by=comendant.id,
                  assigned_to=contractor.id, due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "contractor_print_ok", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        "/api/requests/print",
        headers={"Authorization": f"Bearer {token}"},
        json={"ids": [req.id]},
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    db.close()


def test_contractor_cannot_print_other_requests():
    db = TestingSessionLocal()
    contractor = User(username="contractor_print_other", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    other_contractor = User(username="contractor_owner", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    comendant = User(username="comendant_other_print", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="51", name="Корпус 51", is_active=True)
    db.add_all([contractor, other_contractor, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Чужая заявка", status="in_progress", created_by=comendant.id,
                  assigned_to=other_contractor.id, due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "contractor_print_other", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        "/api/requests/print",
        headers={"Authorization": f"Bearer {token}"},
        json={"ids": [req.id]},
    )
    assert response.status_code == 403, response.text
    db.close()


def test_contractor_cannot_print_requests():
    db = TestingSessionLocal()
    contractor = User(username="contractor_print", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    comendant = User(username="comendant_print2", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="31", name="Корпус 31", is_active=True)
    db.add_all([contractor, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Тест", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "contractor_print", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        "/api/requests/print",
        headers={"Authorization": f"Bearer {token}"},
        json={"ids": [req.id]},
    )
    assert response.status_code == 403, response.text
    db.close()


def test_director_can_update_request():
    db = TestingSessionLocal()
    director = User(username="director_update", hashed_password=get_password_hash("pass"), role="director", is_active=True)
    comendant = User(username="comendant_update", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building1 = Building(number="40", name="Корпус 40", is_active=True)
    building2 = Building(number="41", name="Корпус 41", is_active=True)
    db.add_all([director, comendant, building1, building2])
    db.commit()

    req = Request(building_id=building1.id, description="Старое описание", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "director_update", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"description": "Новое описание", "building_id": building2.id},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["description"] == "Новое описание"
    assert data["building"]["id"] == building2.id
    db.close()


def test_comendant_cannot_update_request():
    db = TestingSessionLocal()
    comendant = User(username="comendant_update_forbidden", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="42", name="Корпус 42", is_active=True)
    db.add_all([comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Описание", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "comendant_update_forbidden", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"description": "Попытка изменить"},
    )
    assert response.status_code == 403, response.text
    db.close()


def test_cannot_update_completed_request():
    db = TestingSessionLocal()
    admin = User(username="admin_update", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    comendant = User(username="comendant_update2", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="43", name="Корпус 43", is_active=True)
    db.add_all([admin, comendant, building])
    db.commit()

    req = Request(building_id=building.id, description="Описание", status="completed", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "admin_update", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"description": "Попытка изменить завершённую"},
    )
    assert response.status_code == 400, response.text
    db.close()


def test_print_missing_request_returns_404():
    db = TestingSessionLocal()
    admin = User(username="admin_print", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    db.add(admin)
    db.commit()

    login = client.post("/api/auth/login", json={"username": "admin_print", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        "/api/requests/print",
        headers={"Authorization": f"Bearer {token}"},
        json={"ids": [99999]},
    )
    assert response.status_code == 404, response.text
    db.close()


def test_director_can_assign_request_with_service():
    db = TestingSessionLocal()
    director = User(username="director_assign_svc", hashed_password=get_password_hash("pass"), role="director", is_active=True)
    contractor = User(username="contractor_assign_svc", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    comendant = User(username="comendant_assign_svc", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="60", name="Корпус 60", is_active=True)
    service = Service(name="Ремонт кровли", unit="м2", price=Decimal("1200.00"), is_active=True)
    db.add_all([director, contractor, comendant, building, service])
    db.commit()
    db.refresh(service)

    req = Request(building_id=building.id, description="Назначить с услугой", status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "director_assign_svc", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}/assign",
        headers={"Authorization": f"Bearer {token}"},
        json={"user_id": contractor.id, "service_id": service.id},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "in_progress"
    assert data["executor"]["id"] == contractor.id
    assert data["service"]["id"] == service.id
    db.close()


def test_complete_request_without_service_returns_400():
    db = TestingSessionLocal()
    comendant = User(username="comendant_complete_no_svc", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    contractor = User(username="contractor_complete_no_svc", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="61", name="Корпус 61", is_active=True)
    db.add_all([comendant, contractor, building])
    db.commit()

    req = Request(building_id=building.id, description="Без услуги", status="in_progress", created_by=comendant.id,
                  assigned_to=contractor.id, due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "contractor_complete_no_svc", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400, response.text
    db.close()


def test_complete_request_creates_work():
    db = TestingSessionLocal()
    comendant = User(username="comendant_complete_work", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    contractor = User(username="contractor_complete_work", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="62", name="Корпус 62", is_active=True)
    service = Service(name="Замена лампочки", unit="шт", price=Decimal("250.00"), is_active=True)
    db.add_all([comendant, contractor, building, service])
    db.commit()
    db.refresh(service)

    req = Request(building_id=building.id, description="Заменить лампочку", status="in_progress", created_by=comendant.id,
                  assigned_to=contractor.id, service_id=service.id, due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "contractor_complete_work", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "completed"

    work = db.query(Work).filter(Work.request_id == req.id).first()
    assert work is not None
    assert work.user_id == contractor.id
    assert work.building_id == building.id
    assert work.service_id == service.id
    assert work.service_quantity == 1
    assert work.service_unit_price == service.price
    assert work.total_price == service.price
    assert work.description == req.description
    db.close()