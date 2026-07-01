import os
import tempfile
from datetime import datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import BackupLog, User
from app.core.security import get_password_hash
from app.routers.backups import resolve_photo_path


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


def test_resolve_photo_path_with_absolute_path():
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"test")
        path = f.name
    try:
        result = resolve_photo_path(path, "/tmp/uploads")
        assert result == path
    finally:
        os.unlink(path)


def test_resolve_photo_path_with_relative_path():
    with tempfile.TemporaryDirectory() as upload_dir:
        photo_dir = os.path.join(upload_dir, "photos", "building_1")
        os.makedirs(photo_dir)
        photo_path = os.path.join(photo_dir, "test.jpg")
        with open(photo_path, "wb") as f:
            f.write(b"test")
        result = resolve_photo_path("photos/building_1/test.jpg", upload_dir)
        assert result == photo_path


def test_download_backup_returns_attachment_header():
    db = TestingSessionLocal()
    director = User(
        username="director_backup_dl",
        hashed_password=get_password_hash("pass"),
        role="director",
        is_active=True,
    )
    db.add(director)
    db.commit()
    db.refresh(director)

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as f:
        f.write(b"PK")
        zip_path = f.name

    try:
        backup = BackupLog(
            backup_id="test_photos_001",
            backup_type="photos",
            created_by=director.id,
            total_size_mb=1,
            parts_count=1,
            file_paths=[zip_path],
            status="completed",
            completed_at=datetime.utcnow(),
        )
        db.add(backup)
        db.commit()

        login = client.post("/api/auth/login", json={"username": "director_backup_dl", "password": "pass"})
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]

        response = client.get(
            "/api/backups/download/test_photos_001",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text

        content_disposition = response.headers.get("content-disposition", "")
        assert "attachment" in content_disposition
        assert os.path.basename(zip_path) in content_disposition
    finally:
        if os.path.exists(zip_path):
            os.unlink(zip_path)
    db.close()
