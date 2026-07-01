from decimal import Decimal
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Building, Service, Material, Work
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


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def setup_module():
    Base.metadata.create_all(bind=engine)


def teardown_module():
    Base.metadata.drop_all(bind=engine)


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
