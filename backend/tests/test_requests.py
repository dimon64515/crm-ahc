from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Building, Request
from app.core.security import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_requests.db"
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
