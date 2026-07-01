from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Building, Request
from app.core.security import get_password_hash

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


def test_watchman_can_create_request():
    db = TestingSessionLocal()
    watchman = User(username="watchman1", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    building = Building(number="10", name="Корпус 10", is_active=True)
    db.add_all([watchman, building])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "watchman1", "password": "pass"})
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


def test_watchman_can_upload_photo_to_request():
    db = TestingSessionLocal()
    watchman = User(username="watchman_photo", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    building = Building(number="11", name="Корпус 11", is_active=True)
    db.add_all([watchman, building])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "watchman_photo", "password": "pass"})
    token = login.json()["access_token"]

    req = Request(building_id=building.id, description="Фото", status="new", created_by=watchman.id,
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
    watchman = User(username="watchman_take", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    contractor = User(username="contractor_take", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="12", name="Корпус 12", is_active=True)
    db.add_all([watchman, contractor, building])
    db.commit()

    req = Request(building_id=building.id, description="Взять", status="new", created_by=watchman.id,
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
    watchman = User(username="watchman_assign", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    building = Building(number="13", name="Корпус 13", is_active=True)
    db.add_all([director, contractor, watchman, building])
    db.commit()

    req = Request(building_id=building.id, description="Назначить", status="new", created_by=watchman.id,
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
    watchman = User(username="watchman_complete", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    contractor = User(username="contractor_complete", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="14", name="Корпус 14", is_active=True)
    db.add_all([watchman, contractor, building])
    db.commit()

    req = Request(building_id=building.id, description="Завершить", status="in_progress", created_by=watchman.id,
                  assigned_to=contractor.id, due_date=date.today() + timedelta(days=5), extended_count=0)
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
    watchman = User(username="watchman_alien", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    contractor_a = User(username="contractor_a", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    contractor_b = User(username="contractor_b", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="15", name="Корпус 15", is_active=True)
    db.add_all([watchman, contractor_a, contractor_b, building])
    db.commit()

    req = Request(building_id=building.id, description="Чужая", status="in_progress", created_by=watchman.id,
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
    watchman = User(username="watchman_extend", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    building = Building(number="13", name="Корпус 13", is_active=True)
    db.add_all([admin, watchman, building])
    db.commit()

    req = Request(building_id=building.id, description="Продлить", status="new", created_by=watchman.id,
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
