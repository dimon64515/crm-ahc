import os
import tempfile
from unittest.mock import patch

from app.routers.backups import resolve_photo_path


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
