from decimal import Decimal
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Building, Service, Work, WorkService
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


def test_create_work_with_multiple_services():
    db = TestingSessionLocal()
    contractor = User(username="multi_contractor", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="15", name="Корпус 15", is_active=True)
    service_a = Service(name="Услуга A", unit="м2", price=Decimal("100.00"), is_active=True)
    service_b = Service(name="Услуга B", unit="шт", price=Decimal("250.00"), is_active=True)
    db.add_all([contractor, building, service_a, service_b])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "multi_contractor", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        "/api/works",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "building_id": building.id,
            "work_date": "2026-06-10",
            "description": "Работа с двумя услугами",
            "services": [
                {"service_id": service_a.id, "quantity": "3.00"},
                {"service_id": service_b.id, "quantity": "2.00"},
            ],
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["services"]) == 2
    assert Decimal(data["services"][0]["total_price"]) == Decimal("300.00")
    assert Decimal(data["services"][1]["total_price"]) == Decimal("500.00")
    assert Decimal(data["total_price"]) == Decimal("800.00")
    db.close()


def test_create_work_with_duplicate_services_returns_400():
    db = TestingSessionLocal()
    contractor = User(username="dup_contractor", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="16", name="Корпус 16", is_active=True)
    service = Service(name="Услуга", unit="м2", price=Decimal("100.00"), is_active=True)
    db.add_all([contractor, building, service])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "dup_contractor", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        "/api/works",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "building_id": building.id,
            "work_date": "2026-06-10",
            "description": "Работа с дублями",
            "services": [
                {"service_id": service.id, "quantity": "1.00"},
                {"service_id": service.id, "quantity": "2.00"},
            ],
        },
    )
    assert response.status_code == 400, response.text
    assert "дублироваться" in response.json()["detail"]
    db.close()


def test_list_works_filter_by_service_id():
    db = TestingSessionLocal()
    contractor = User(username="filter_contractor", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="17", name="Корпус 17", is_active=True)
    service_a = Service(name="Услуга A", unit="м2", price=Decimal("100.00"), is_active=True)
    service_b = Service(name="Услуга B", unit="шт", price=Decimal("200.00"), is_active=True)
    db.add_all([contractor, building, service_a, service_b])
    db.commit()

    work_a = Work(user_id=contractor.id, building_id=building.id, work_date=date(2026, 6, 10), description="A", materials_total_price=Decimal("0"), total_price=Decimal("100.00"))
    work_b = Work(user_id=contractor.id, building_id=building.id, work_date=date(2026, 6, 11), description="B", materials_total_price=Decimal("0"), total_price=Decimal("200.00"))
    db.add_all([work_a, work_b])
    db.commit()
    db.refresh(work_a)
    db.refresh(work_b)

    db.add_all([
        WorkService(work_id=work_a.id, service_id=service_a.id, quantity=Decimal("1.00"), unit_price=Decimal("100.00"), total_price=Decimal("100.00")),
        WorkService(work_id=work_b.id, service_id=service_b.id, quantity=Decimal("1.00"), unit_price=Decimal("200.00"), total_price=Decimal("200.00")),
    ])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "filter_contractor", "password": "pass"})
    token = login.json()["access_token"]

    response = client.get(
        f"/api/works?service_id={service_a.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == work_a.id
    db.close()
