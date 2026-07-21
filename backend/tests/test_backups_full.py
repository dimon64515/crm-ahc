import json
import os
import tempfile
import zipfile
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.database import Base, get_db
from app.main import app
from app.models import BackupLog, User
from app.core.security import get_password_hash


SQLALCHEMY_DATABASE_URL = "sqlite:///./test_full_backup.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

client = TestClient(app)
_old_db_override = None


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


_original_upload_dir = None


def setup_module():
    global _old_db_override, _original_upload_dir
    _old_db_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)
    _original_upload_dir = os.environ.get("UPLOAD_DIR")


def teardown_module():
    global _old_db_override
    Base.metadata.drop_all(bind=engine)
    if _old_db_override is not None:
        app.dependency_overrides[get_db] = _old_db_override
    else:
        app.dependency_overrides.pop(get_db, None)
    if _original_upload_dir is not None:
        os.environ["UPLOAD_DIR"] = _original_upload_dir
    elif "UPLOAD_DIR" in os.environ:
        del os.environ["UPLOAD_DIR"]
    get_settings.cache_clear()


def _temp_settings(upload_dir: str):
    get_settings.cache_clear()
    os.environ["UPLOAD_DIR"] = upload_dir
    os.environ["BACKUP_MAX_PART_SIZE_MB"] = "1000"
    return get_settings()


def _create_admin(db):
    admin = User(
        username="admin_backup",
        hashed_password=get_password_hash("pass"),
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def _auth_token(username):
    login = client.post("/api/auth/login", json={"username": username, "password": "pass"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def test_create_full_backup():
    db = TestingSessionLocal()
    admin = _create_admin(db)

    with tempfile.TemporaryDirectory() as upload_dir:
        _temp_settings(upload_dir)

        # Подготовим небольшой файл в uploads
        photo_dir = os.path.join(upload_dir, "photos", "building_1")
        os.makedirs(photo_dir)
        with open(os.path.join(photo_dir, "test.jpg"), "wb") as f:
            f.write(b"photo")

        token = _auth_token(admin.username)
        response = client.post(
            "/api/backups/full",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["success"] is True
        assert data["backup_id"].startswith("full_")
        assert data["parts_count"] >= 1

        log = db.query(BackupLog).filter(BackupLog.backup_id == data["backup_id"]).first()
        assert log is not None
        assert log.backup_type == "full"
        assert log.parts_count == data["parts_count"]
        assert log.file_paths
        assert os.path.exists(log.file_paths[0])

        # Проверим содержимое первой части
        with zipfile.ZipFile(log.file_paths[0], "r") as zf:
            names = zf.namelist()
            assert "metadata.json" in names
            assert "database_dump.sql" in names
            assert "photos/building_1/test.jpg" in names
            metadata = json.loads(zf.read("metadata.json").decode("utf-8"))
            assert metadata["backup_type"] == "full"
            assert metadata["version"]

    db.close()


def test_validate_uploaded_backup():
    db = TestingSessionLocal()
    admin = User(
        username="admin_backup_validate",
        hashed_password=get_password_hash("pass"),
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    with tempfile.TemporaryDirectory() as upload_dir:
        _temp_settings(upload_dir)

        # Создадим корректный архив в памяти
        backup_id = "uploaded_full_001"
        buf = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        buf.close()
        try:
            with zipfile.ZipFile(buf.name, "w") as zf:
                zf.writestr("metadata.json", json.dumps({
                    "backup_type": "full",
                    "version": get_settings().BACKUP_VERSION,
                    "created_at": datetime.utcnow().isoformat(),
                }))
                zf.writestr("database_dump.sql", "-- dump")

            token = _auth_token(admin.username)
            with open(buf.name, "rb") as f:
                upload = client.post(
                    "/api/backups/upload",
                    headers={"Authorization": f"Bearer {token}"},
                    files={"file": (f"{backup_id}.part1.zip", f, "application/zip")},
                )
            assert upload.status_code == 200, upload.text

            validate = client.post(
                f"/api/backups/validate/{backup_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert validate.status_code == 200, validate.text
            data = validate.json()
            assert data["valid"] is True
            assert data["type"] == "full"
        finally:
            if os.path.exists(buf.name):
                os.unlink(buf.name)

    db.close()
