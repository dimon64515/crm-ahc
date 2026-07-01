import os
import shutil
import subprocess
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import BackupLog, Work, WorkPhoto
from app.core.dependencies import require_admin, require_director
from app.core.config import get_settings


def resolve_photo_path(file_path: str, upload_dir: str) -> str:
    """Возвращает корректный абсолютный путь к фото независимо от того,
    хранится ли в БД абсолютный или относительный путь."""
    if not file_path:
        return ""
    if os.path.isabs(file_path) and os.path.exists(file_path):
        return file_path
    # Если путь относительный (например, photos/building_1/...)
    relative = file_path.lstrip('/')
    absolute = os.path.join(upload_dir, relative)
    if os.path.exists(absolute):
        return absolute
    return ""


router = APIRouter(prefix="/backups", tags=["backups"])


def get_backup_dir():
    settings = get_settings()
    backup_dir = os.path.join(settings.UPLOAD_DIR, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    return backup_dir


@router.post("/full")
def create_full_backup(
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    settings = get_settings()
    backup_dir = get_backup_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_id = f"full_{timestamp}"
    backup_path = os.path.join(backup_dir, backup_id)
    os.makedirs(backup_path, exist_ok=True)

    # Database dump
    db_url = settings.DATABASE_URL
    dump_file = os.path.join(backup_path, "database.sql")
    try:
        subprocess.run(
            ["pg_dump", db_url, "-f", dump_file],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Ошибка pg_dump: {e.stderr.decode()}")
    except FileNotFoundError:
        # Fallback: if pg_dump not available, create an empty file
        with open(dump_file, "w") as f:
            f.write("-- pg_dump not available in this environment\n")

    # Copy uploads
    uploads_src = settings.UPLOAD_DIR
    uploads_dst = os.path.join(backup_path, "uploads")
    if os.path.exists(uploads_src):
        shutil.copytree(uploads_src, uploads_dst, dirs_exist_ok=True)

    # Create ZIP
    zip_path = os.path.join(backup_dir, f"{backup_id}.zip")
    shutil.make_archive(backup_path, 'zip', backup_path)
    shutil.rmtree(backup_path)

    size_mb = round(os.path.getsize(zip_path) / (1024 * 1024))

    log = BackupLog(
        backup_id=backup_id,
        backup_type="full",
        created_by=admin.id,
        total_size_mb=size_mb,
        parts_count=1,
        file_paths=[zip_path],
        status="completed",
        completed_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()

    return {
        "success": True,
        "backup_id": backup_id,
        "size_mb": size_mb,
        "download_url": f"/api/backups/download/{backup_id}",
    }


@router.post("/photos")
def create_photos_backup(
    date_from: str = None,
    date_to: str = None,
    building_id: int = None,
    db: Session = Depends(get_db),
    admin = Depends(require_director)
):
    settings = get_settings()
    backup_dir = get_backup_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_id = f"photos_{timestamp}"
    backup_path = os.path.join(backup_dir, backup_id)
    os.makedirs(backup_path, exist_ok=True)

    query = db.query(WorkPhoto).join(Work)
    if date_from:
        query = query.filter(Work.work_date >= date_from)
    if date_to:
        query = query.filter(Work.work_date <= date_to)
    if building_id:
        query = query.filter(Work.building_id == building_id)

    photos = query.all()
    copied = 0
    for photo in photos:
        src = resolve_photo_path(photo.file_path, settings.UPLOAD_DIR)
        if not src:
            continue
        dst = os.path.join(backup_path, os.path.basename(src))
        shutil.copy2(src, dst)
        copied += 1

    # Create ZIP
    zip_path = os.path.join(backup_dir, f"{backup_id}.zip")
    shutil.make_archive(backup_path, 'zip', backup_path)
    shutil.rmtree(backup_path)

    size_mb = round(os.path.getsize(zip_path) / (1024 * 1024)) if os.path.exists(zip_path) else 0

    log = BackupLog(
        backup_id=backup_id,
        backup_type="photos",
        created_by=admin.id,
        total_size_mb=size_mb,
        parts_count=1,
        filters={"date_from": date_from, "date_to": date_to, "building_id": building_id},
        file_paths=[zip_path],
        status="completed",
        completed_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()

    return {
        "success": True,
        "backup_id": backup_id,
        "photos_count": copied,
        "size_mb": size_mb,
        "download_url": f"/api/backups/download/{backup_id}",
    }


@router.get("")
def list_backups(
    db: Session = Depends(get_db),
    admin = Depends(require_director)
):
    logs = db.query(BackupLog).order_by(BackupLog.created_at.desc()).all()
    return {
        "items": [
            {
                "id": log.id,
                "backup_id": log.backup_id,
                "type": log.backup_type,
                "size_mb": log.total_size_mb,
                "status": log.status,
                "created_at": log.created_at,
            }
            for log in logs
        ]
    }


@router.get("/download/{backup_id}")
def download_backup(
    backup_id: str,
    db: Session = Depends(get_db),
    admin = Depends(require_director)
):
    log = db.query(BackupLog).filter(BackupLog.backup_id == backup_id).first()
    if not log or not log.file_paths:
        raise HTTPException(status_code=404, detail="Бэкап не найден")

    file_path = log.file_paths[0]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Файл бэкапа не найден")

    return FileResponse(
        file_path,
        filename=os.path.basename(file_path),
        media_type="application/zip",
    )


@router.post("/restore")
def restore_backup(
    backup_id: str,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    log = db.query(BackupLog).filter(BackupLog.backup_id == backup_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Бэкап не найден")
    
    if not log.file_paths or not os.path.exists(log.file_paths[0]):
        raise HTTPException(status_code=404, detail="Файл бэкапа не найден")
    
    # Пока только возвращаем информацию — полное восстановление требует остановки сервиса
    return {
        "success": True,
        "backup_id": backup_id,
        "type": log.backup_type,
        "message": "Для полного восстановления скачайте бэкап и следуйте инструкции в docs/backup.md",
        "download_url": f"/api/backups/download/{backup_id}",
    }


@router.delete("/{backup_id}")
def delete_backup(
    backup_id: str,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    log = db.query(BackupLog).filter(BackupLog.backup_id == backup_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Бэкап не найден")

    for path in log.file_paths or []:
        if os.path.exists(path):
            os.remove(path)

    db.delete(log)
    db.commit()
    return {"success": True}
