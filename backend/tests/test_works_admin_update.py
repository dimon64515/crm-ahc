from decimal import Decimal
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Building, Service, Material, Work, WorkMaterial
from app.core.security import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
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


def setup_module():
    global _old_db_override
    _old_db_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)


def teardown_module():
    global _old_db_override
    Base.metadata.drop_all(bind=engine)
    if _old_db_override is not None:
        app.dependency_overrides[get_db] = _old_db_override
    else:
        app.dependency_overrides.pop(get_db, None)


def test_admin_can_update_all_work_fields():
    db = TestingSessionLocal()
    admin = User(username="admin", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    contractor = User(username="contractor", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building1 = Building(number="1", name="Корпус 1", is_active=True)
    building2 = Building(number="2", name="Корпус 2", is_active=True)
    service = Service(name="Мойка", unit="м2", price=Decimal("100.00"), is_active=True)
    db.add_all([admin, contractor, building1, building2, service])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building1.id,
        service_id=service.id,
        work_date=date(2026, 6, 1),
        description="Старое описание",
        service_quantity=Decimal("5.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("500.00"),
        materials_total_price=Decimal("0"),
        total_price=Decimal("500.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    login = client.post("/api/auth/login", json={"username": "admin", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "building_id": building2.id,
            "description": "Новое описание",
            "service_quantity": "10.00",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["building"]["number"] == "2"
    assert data["description"] == "Новое описание"
    assert Decimal(data["service_total_price"]) == Decimal("1000.00")
    db.close()


def test_admin_update_service_and_materials_recalculates_prices():
    db = TestingSessionLocal()
    admin = User(username="admin2", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    contractor = User(username="contractor2", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="10", name="Корпус 10", is_active=True)
    service_old = Service(name="Старая услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    service_new = Service(name="Новая услуга", unit="м2", price=Decimal("200.00"), is_active=True)
    material1 = Material(name="Материал 1", unit="шт", price=Decimal("50.00"), is_active=True)
    material2 = Material(name="Материал 2", unit="шт", price=Decimal("30.00"), is_active=True)
    db.add_all([admin, contractor, building, service_old, service_new, material1, material2])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building.id,
        service_id=service_old.id,
        work_date=date(2026, 6, 1),
        description="Описание",
        service_quantity=Decimal("5.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("500.00"),
        materials_total_price=Decimal("0"),
        total_price=Decimal("500.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    login = client.post("/api/auth/login", json={"username": "admin2", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "service_id": service_new.id,
            "service_quantity": "10.00",
            "materials": [
                {"material_id": material1.id, "quantity": "2.00"},
                {"material_id": material2.id, "quantity": "1.00"},
            ],
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["service"]["name"] == "Новая услуга"
    assert Decimal(data["service_unit_price"]) == Decimal("200.00")
    assert Decimal(data["service_total_price"]) == Decimal("2000.00")
    assert Decimal(data["materials_total_price"]) == Decimal("130.00")
    assert Decimal(data["total_price"]) == Decimal("2130.00")
    assert len(data["materials"]) == 2
    db.close()


def test_admin_can_clear_all_materials():
    db = TestingSessionLocal()
    admin = User(username="admin3", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    contractor = User(username="contractor5", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="40", name="Корпус 40", is_active=True)
    service = Service(name="Услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    material = Material(name="Материал", unit="шт", price=Decimal("50.00"), is_active=True)
    db.add_all([admin, contractor, building, service, material])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building.id,
        service_id=service.id,
        work_date=date(2026, 6, 1),
        description="Описание",
        service_quantity=Decimal("2.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("200.00"),
        materials_total_price=Decimal("100.00"),
        total_price=Decimal("300.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    work_material = WorkMaterial(work_id=work.id, material_id=material.id, quantity=Decimal("2.00"), unit_price=Decimal("50.00"), total_price=Decimal("100.00"))
    db.add(work_material)
    db.commit()

    login = client.post("/api/auth/login", json={"username": "admin3", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"materials": []},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["materials"]) == 0
    assert Decimal(data["materials_total_price"]) == Decimal("0")
    assert Decimal(data["total_price"]) == Decimal("200.00")
    db.close()


def test_director_cannot_update_work():
    db = TestingSessionLocal()
    director = User(username="director1", hashed_password=get_password_hash("pass"), role="director", is_active=True)
    contractor = User(username="contractor3", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="20", name="Корпус 20", is_active=True)
    service = Service(name="Услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    db.add_all([director, contractor, building, service])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building.id,
        service_id=service.id,
        work_date=date(2026, 6, 1),
        description="Описание",
        service_quantity=Decimal("1.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("100.00"),
        materials_total_price=Decimal("0"),
        total_price=Decimal("100.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    login = client.post("/api/auth/login", json={"username": "director1", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"description": "Попытка изменить"},
    )
    assert response.status_code == 403
    db.close()


def test_contractor_update_ignores_admin_fields():
    db = TestingSessionLocal()
    contractor = User(username="contractor4", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building_a = Building(number="30", name="Корпус 30", is_active=True)
    building_b = Building(number="31", name="Корпус 31", is_active=True)
    service_a = Service(name="Услуга A", unit="м2", price=Decimal("100.00"), is_active=True)
    service_b = Service(name="Услуга B", unit="м2", price=Decimal("200.00"), is_active=True)
    db.add_all([contractor, building_a, building_b, service_a, service_b])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building_a.id,
        service_id=service_a.id,
        work_date=date(2026, 6, 1),
        description="Описание",
        service_quantity=Decimal("2.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("200.00"),
        materials_total_price=Decimal("0"),
        total_price=Decimal("200.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    login = client.post("/api/auth/login", json={"username": "contractor4", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "building_id": building_b.id,
            "service_id": service_b.id,
            "description": "Новое описание подрядчика",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["description"] == "Новое описание подрядчика"
    assert data["building"]["number"] == "30"
    assert data["service"]["name"] == "Услуга A"
    db.close()


def test_admin_partial_update_preserves_materials():
    """Регрессионный тест: частичное обновление админом не должно удалять материалы."""
    db = TestingSessionLocal()
    admin = User(username="admin_partial", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    contractor = User(username="contractor_partial", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="50", name="Корпус 50", is_active=True)
    service = Service(name="Услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    material = Material(name="Материал", unit="шт", price=Decimal("50.00"), is_active=True)
    db.add_all([admin, contractor, building, service, material])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building.id,
        service_id=service.id,
        work_date=date(2026, 6, 1),
        description="Старое описание",
        service_quantity=Decimal("2.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("200.00"),
        materials_total_price=Decimal("100.00"),
        total_price=Decimal("300.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    work_material = WorkMaterial(
        work_id=work.id,
        material_id=material.id,
        quantity=Decimal("2.00"),
        unit_price=Decimal("50.00"),
        total_price=Decimal("100.00"),
    )
    db.add(work_material)
    db.commit()

    login = client.post("/api/auth/login", json={"username": "admin_partial", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"description": "Новое описание"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["description"] == "Новое описание"
    assert len(data["materials"]) == 1
    assert data["materials"][0]["material_id"] == material.id
    assert Decimal(data["materials"][0]["total_price"]) == Decimal("100.00")
    assert Decimal(data["materials_total_price"]) == Decimal("100.00")
    assert Decimal(data["total_price"]) == Decimal("300.00")
    db.close()


def test_admin_update_inactive_material_returns_400_and_preserves_materials():
    """Регрессионный тест: обновление с неактивным material_id должно вернуть 400 и оставить старые материалы."""
    db = TestingSessionLocal()
    admin = User(username="admin_inactive", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    contractor = User(username="contractor_inactive", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="60", name="Корпус 60", is_active=True)
    service = Service(name="Услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    active_material = Material(name="Активный материал", unit="шт", price=Decimal("50.00"), is_active=True)
    inactive_material = Material(name="Неактивный материал", unit="шт", price=Decimal("30.00"), is_active=False)
    db.add_all([admin, contractor, building, service, active_material, inactive_material])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building.id,
        service_id=service.id,
        work_date=date(2026, 6, 1),
        description="Описание",
        service_quantity=Decimal("2.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("200.00"),
        materials_total_price=Decimal("100.00"),
        total_price=Decimal("300.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    work_material = WorkMaterial(
        work_id=work.id,
        material_id=active_material.id,
        quantity=Decimal("2.00"),
        unit_price=Decimal("50.00"),
        total_price=Decimal("100.00"),
    )
    db.add(work_material)
    db.commit()

    login = client.post("/api/auth/login", json={"username": "admin_inactive", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "materials": [
                {"material_id": active_material.id, "quantity": "1.00"},
                {"material_id": inactive_material.id, "quantity": "1.00"},
            ],
        },
    )
    assert response.status_code == 400, response.text

    # Проверяем, что существующие материалы не изменились
    db.refresh(work)
    assert len(work.work_materials) == 1
    assert work.work_materials[0].material_id == active_material.id
    assert Decimal(work.work_materials[0].total_price) == Decimal("100.00")
    db.close()


def test_admin_update_duplicate_material_returns_400():
    """Регрессионный тест: обновление с дублирующимся material_id должно вернуть 400."""
    db = TestingSessionLocal()
    admin = User(username="admin_dup", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    contractor = User(username="contractor_dup", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="70", name="Корпус 70", is_active=True)
    service = Service(name="Услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    material = Material(name="Материал", unit="шт", price=Decimal("50.00"), is_active=True)
    db.add_all([admin, contractor, building, service, material])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building.id,
        service_id=service.id,
        work_date=date(2026, 6, 1),
        description="Описание",
        service_quantity=Decimal("1.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("100.00"),
        materials_total_price=Decimal("0"),
        total_price=Decimal("100.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    login = client.post("/api/auth/login", json={"username": "admin_dup", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "materials": [
                {"material_id": material.id, "quantity": "1.00"},
                {"material_id": material.id, "quantity": "2.00"},
            ],
        },
    )
    assert response.status_code == 400, response.text
    db.close()


def test_admin_update_inactive_building_returns_400():
    db = TestingSessionLocal()
    admin = User(username="admin_inactive_bld", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    contractor = User(username="contractor_inactive_bld", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building_active = Building(number="80", name="Активный корпус", is_active=True)
    building_inactive = Building(number="81", name="Неактивный корпус", is_active=False)
    service = Service(name="Услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    db.add_all([admin, contractor, building_active, building_inactive, service])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building_active.id,
        service_id=service.id,
        work_date=date(2026, 6, 1),
        description="Описание",
        service_quantity=Decimal("1.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("100.00"),
        materials_total_price=Decimal("0"),
        total_price=Decimal("100.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    login = client.post("/api/auth/login", json={"username": "admin_inactive_bld", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"building_id": building_inactive.id},
    )
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "Корпус не найден или неактивен"
    db.close()


def test_admin_update_non_contractor_user_returns_400():
    db = TestingSessionLocal()
    admin = User(username="admin_non_contractor", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    contractor = User(username="contractor_real", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    director = User(username="director_non_contractor", hashed_password=get_password_hash("pass"), role="director", is_active=True)
    building = Building(number="90", name="Корпус 90", is_active=True)
    service = Service(name="Услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    db.add_all([admin, contractor, director, building, service])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building.id,
        service_id=service.id,
        work_date=date(2026, 6, 1),
        description="Описание",
        service_quantity=Decimal("1.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("100.00"),
        materials_total_price=Decimal("0"),
        total_price=Decimal("100.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    login = client.post("/api/auth/login", json={"username": "admin_non_contractor", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"user_id": director.id},
    )
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "Подрядчик не найден или неактивен"
    db.close()


def test_admin_update_future_work_date_returns_400():
    db = TestingSessionLocal()
    admin = User(username="admin_future", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    contractor = User(username="contractor_future", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="100", name="Корпус 100", is_active=True)
    service = Service(name="Услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    db.add_all([admin, contractor, building, service])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building.id,
        service_id=service.id,
        work_date=date(2026, 6, 1),
        description="Описание",
        service_quantity=Decimal("1.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("100.00"),
        materials_total_price=Decimal("0"),
        total_price=Decimal("100.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    login = client.post("/api/auth/login", json={"username": "admin_future", "password": "pass"})
    token = login.json()["access_token"]

    future_date = (date.today() + timedelta(days=1)).isoformat()
    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"work_date": future_date},
    )
    assert response.status_code == 422, response.text
    errors = response.json()["detail"]
    assert any("Дата работы не может быть в будущем" in str(err.get("msg", "")) for err in errors)
    db.close()


def test_contractor_update_future_work_date_returns_400():
    db = TestingSessionLocal()
    contractor = User(username="contractor_future2", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="101", name="Корпус 101", is_active=True)
    service = Service(name="Услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    db.add_all([contractor, building, service])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building.id,
        service_id=service.id,
        work_date=date(2026, 6, 1),
        description="Описание",
        service_quantity=Decimal("1.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("100.00"),
        materials_total_price=Decimal("0"),
        total_price=Decimal("100.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    login = client.post("/api/auth/login", json={"username": "contractor_future2", "password": "pass"})
    token = login.json()["access_token"]

    future_date = (date.today() + timedelta(days=1)).isoformat()
    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"work_date": future_date},
    )
    assert response.status_code == 422, response.text
    errors = response.json()["detail"]
    assert any("Дата работы не может быть в будущем" in str(err.get("msg", "")) for err in errors)
    db.close()
