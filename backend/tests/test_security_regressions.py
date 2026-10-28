"""Регрессионные тесты безопасности: BE-01, BE-03, BE-04."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Building, Service, Work, Request
from app.core.security import get_password_hash
from app.core.config import validate_secret_key, DEFAULT_SECRET_KEY

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_security.db"
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
    Base.metadata.drop_all(bind=engine)
    if _old_db_override is not None:
        app.dependency_overrides[get_db] = _old_db_override
    else:
        app.dependency_overrides.pop(get_db, None)


def _login(username: str) -> str:
    login = client.post("/api/auth/login", json={"username": username, "password": "pass"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------- BE-01: комендант не может редактировать/удалять отчёты ----------

def test_comendant_cannot_update_work():
    db = TestingSessionLocal()
    comendant = User(username="sec_comendant_upd", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    contractor = User(username="sec_contractor_upd", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="30", name="Корпус 30", is_active=True)
    db.add_all([comendant, contractor, building])
    db.commit()
    work = Work(user_id=contractor.id, building_id=building.id, work_date=date(2026, 6, 10),
                description="Работа", materials_total_price=Decimal("0"), total_price=Decimal("0"))
    db.add(work)
    db.commit()
    db.refresh(work)

    response = client.put(
        f"/api/works/{work.id}",
        headers=_headers(_login("sec_comendant_upd")),
        json={"description": "Попытка коменданта изменить отчёт"},
    )
    assert response.status_code == 403, response.text
    db.close()


def test_comendant_cannot_delete_work():
    db = TestingSessionLocal()
    comendant = User(username="sec_comendant_del", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    contractor = User(username="sec_contractor_del", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="31", name="Корпус 31", is_active=True)
    db.add_all([comendant, contractor, building])
    db.commit()
    work = Work(user_id=contractor.id, building_id=building.id, work_date=date(2026, 6, 10),
                description="Работа", materials_total_price=Decimal("0"), total_price=Decimal("0"))
    db.add(work)
    db.commit()
    db.refresh(work)

    response = client.delete(f"/api/works/{work.id}", headers=_headers(_login("sec_comendant_del")))
    assert response.status_code == 403, response.text
    # Работа не удалена
    assert db.query(Work).filter(Work.id == work.id).first() is not None
    db.close()


# ---------- BE-03: SECRET_KEY ----------

def test_secret_key_default_raises():
    with pytest.raises(RuntimeError, match="SECRET_KEY не задан или равен значению по умолчанию"):
        validate_secret_key(DEFAULT_SECRET_KEY)


def test_secret_key_empty_raises():
    with pytest.raises(RuntimeError, match="SECRET_KEY не задан или равен значению по умолчанию"):
        validate_secret_key("")


def test_secret_key_custom_passes():
    validate_secret_key("a" * 48)  # не должно бросить исключение


# ---------- BE-04: гонки ----------

def _make_request_with_service(db, prefix: str):
    comendant = User(username=f"{prefix}_comendant", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    contractor = User(username=f"{prefix}_contractor", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number=prefix, name=f"Корпус {prefix}", is_active=True)
    service = Service(name="Услуга", unit="шт", price=Decimal("100.00"), is_active=True)
    db.add_all([comendant, contractor, building, service])
    db.commit()
    req = Request(building_id=building.id, service_id=service.id, description="Заявка",
                  status="new", created_by=comendant.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)
    return comendant, contractor, building, service, req


def test_duplicate_work_for_request_returns_409():
    db = TestingSessionLocal()
    _, contractor, building, service, req = _make_request_with_service(db, "40")
    token = _login("40_contractor")
    payload = {
        "building_id": building.id,
        "work_date": "2026-06-10",
        "description": "Отчёт по заявке",
        "request_id": req.id,
        "services": [{"service_id": service.id, "quantity": "1.00"}],
    }
    first = client.post("/api/works", headers=_headers(token), json=payload)
    assert first.status_code == 200, first.text

    # Подрядчик при создании отчёта завершает заявку — возвращаем статус для проверки дубля
    req.status = "in_progress"
    db.commit()

    second = client.post("/api/works", headers=_headers(token), json=payload)
    assert second.status_code == 409, second.text
    assert "уже существует" in second.json()["detail"]
    # Дубль не создан
    assert db.query(Work).filter(Work.request_id == req.id).count() == 1
    db.close()


def test_take_already_taken_request_returns_409():
    db = TestingSessionLocal()
    _, contractor, _, _, req = _make_request_with_service(db, "41")
    other = User(username="41_contractor2", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    db.add(other)
    db.commit()

    first = client.put(f"/api/requests/{req.id}/take", headers=_headers(_login("41_contractor")))
    assert first.status_code == 200, first.text

    second = client.put(f"/api/requests/{req.id}/take", headers=_headers(_login("41_contractor2")))
    assert second.status_code == 409, second.text

    db.refresh(req)
    assert req.assigned_to == contractor.id
    db.close()


def test_take_completed_request_returns_409():
    db = TestingSessionLocal()
    _, contractor, _, _, req = _make_request_with_service(db, "42")
    req.status = "completed"
    db.commit()

    response = client.put(f"/api/requests/{req.id}/take", headers=_headers(_login("42_contractor")))
    assert response.status_code == 409, response.text
    db.close()
