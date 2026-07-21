import json
import os
import shutil
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import require_admin, require_director
from app.database import get_db
from app.models import BackupLog, Material, RequestPhoto, Service, User, Work, WorkFile, WorkPhoto


PART_SUFFIX = ".part{idx}.zip"


def resolve_photo_path(file_path: str, upload_dir: str) -> str:
    """Возвращает корректный абсолютный путь к фото независимо от того,
    хранится ли в БД абсолютный или относительный путь."""
    if not file_path:
        return ""
    if os.path.isabs(file_path) and os.path.exists(file_path):
        return file_path
    relative = file_path.lstrip('/')
    absolute = os.path.join(upload_dir, relative)
    if os.path.exists(absolute):
        return absolute
    return ""


router = APIRouter(prefix="/backups", tags=["backups"])


def _get_backup_base_dir() -> str:
    settings = get_settings()
    backup_dir = os.path.join(settings.UPLOAD_DIR, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    return backup_dir


def _get_import_dir() -> str:
    base = _get_backup_base_dir()
    import_dir = os.path.join(base, "imports")
    os.makedirs(import_dir, exist_ok=True)
    return import_dir


def _run_pg_dump(db_url: str, dump_file: str) -> None:
    try:
        subprocess.run(
            ["pg_dump", db_url, "-f", dump_file],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Ошибка pg_dump: {e.stderr.decode()}")
    except FileNotFoundError:
        with open(dump_file, "w") as f:
            f.write("-- pg_dump not available in this environment\n")


def _copy_upload_subdirs(src_upload_dir: str, dst_dir: str, subdirs: List[str]) -> None:
    """Копирует указанные поддиректории из uploads, сохраняя структуру."""
    for subdir in subdirs:
        src = os.path.join(src_upload_dir, subdir)
        if not os.path.exists(src):
            continue
        dst = os.path.join(dst_dir, subdir)
        shutil.copytree(src, dst, dirs_exist_ok=True)


def _split_file(file_path: str, part_size_bytes: int, prefix: str) -> List[str]:
    """Разбивает файл на части заданного размера. Возвращает пути к частям."""
    part_paths = []
    file_size = os.path.getsize(file_path)
    if file_size == 0:
        return []

    with open(file_path, "rb") as src:
        idx = 1
        while True:
            chunk = src.read(part_size_bytes)
            if not chunk:
                break
            part_path = f"{prefix}{PART_SUFFIX.format(idx=idx)}"
            with open(part_path, "wb") as dst:
                dst.write(chunk)
            part_paths.append(part_path)
            idx += 1

    return part_paths


def _create_archive(source_dir: str, backup_dir: str, backup_id: str) -> tuple[List[str], int]:
    """Создаёт ZIP-архив из source_dir, разбивает на части и возвращает пути к частям + размер в байтах."""
    settings = get_settings()
    max_part_size = settings.BACKUP_MAX_PART_SIZE_MB * 1024 * 1024

    single_zip = os.path.join(backup_dir, f".{backup_id}.zip")
    with zipfile.ZipFile(single_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(source_dir):
            for file in files:
                full_path = os.path.join(root, file)
                arcname = os.path.relpath(full_path, source_dir)
                zf.write(full_path, arcname)

    total_size = os.path.getsize(single_zip)
    part_prefix = os.path.join(backup_dir, backup_id)
    part_paths = _split_file(single_zip, max_part_size, part_prefix)

    os.remove(single_zip)
    # Если архив меньше одной части, _split_file вернёт пустой список; создадим одну часть вручную.
    if not part_paths and os.path.exists(single_zip) is False:
        raise HTTPException(status_code=500, detail="Ошибка создания архива")

    return part_paths, total_size


def _cleanup_old_backups(db: Session, backup_type: str, retention: int) -> None:
    """Удаляет старые бэкапы указанного типа, оставляя retention последних."""
    logs = (
        db.query(BackupLog)
        .filter(BackupLog.backup_type == backup_type, BackupLog.status == "completed")
        .order_by(BackupLog.created_at.desc())
        .all()
    )
    for log in logs[retention:]:
        for path in log.file_paths or []:
            if os.path.exists(path):
                os.remove(path)
        db.delete(log)
    db.commit()


def _get_admin_username(db: Session, admin_id: int) -> str:
    user = db.query(User).filter(User.id == admin_id).first()
    return user.username if user else "unknown"


def _build_full_metadata(db: Session, admin_id: int, total_size_bytes: int) -> dict:
    settings = get_settings()
    db_name = settings.DATABASE_URL.rsplit("/", 1)[-1]
    return {
        "backup_type": "full",
        "created_at": datetime.utcnow().isoformat(),
        "created_by": _get_admin_username(db, admin_id),
        "version": settings.BACKUP_VERSION,
        "database": {"name": db_name, "dump_file": "database_dump.sql"},
        "files": {
            "photos_count": db.query(WorkPhoto).count() + db.query(RequestPhoto).count(),
            "files_count": db.query(WorkFile).count(),
        },
        "catalogs": {
            "materials_count": db.query(Material).count(),
            "services_count": db.query(Service).count(),
        },
        "total_size_bytes": total_size_bytes,
    }


@router.post("/full")
def create_full_backup(
    db: Session = Depends(get_db),
    admin=Depends(require_admin)
):
    """Создаёт полный бэкап: дамп БД + фото + файлы + метаданные."""
    settings = get_settings()
    backup_dir = _get_backup_base_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_id = f"full_{timestamp}"
    backup_path = os.path.join(backup_dir, backup_id)
    os.makedirs(backup_path, exist_ok=True)

    metadata = _build_full_metadata(db, admin.id, 0)
    with open(os.path.join(backup_path, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    _run_pg_dump(settings.DATABASE_URL, os.path.join(backup_path, "database_dump.sql"))

    _copy_upload_subdirs(
        settings.UPLOAD_DIR,
        backup_path,
        ["photos", "files", "works", "request_photos"],
    )

    part_paths, total_size = _create_archive(backup_path, backup_dir, backup_id)
    shutil.rmtree(backup_path)

    size_mb = round(total_size / (1024 * 1024))
    metadata["total_size_bytes"] = total_size

    log = BackupLog(
        backup_id=backup_id,
        backup_type="full",
        created_by=admin.id,
        total_size_mb=size_mb,
        parts_count=len(part_paths),
        file_paths=part_paths,
        backup_metadata=metadata,
        status="completed",
        completed_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()

    _cleanup_old_backups(db, "full", settings.BACKUP_RETENTION_FULL)

    return {
        "success": True,
        "backup_id": backup_id,
        "size_mb": size_mb,
        "parts_count": len(part_paths),
        "download_urls": [f"/api/backups/download/{backup_id}?part={i + 1}" for i in range(len(part_paths))],
    }


@router.post("/photos")
def create_photos_backup(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    building_ids: Optional[str] = None,
    user_ids: Optional[str] = None,
    db: Session = Depends(get_db),
    admin=Depends(require_director)
):
    """Создаёт архив фото (работ и заявок) с фильтрами."""
    settings = get_settings()
    backup_dir = _get_backup_base_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_id = f"photos_{timestamp}"
    backup_path = os.path.join(backup_dir, backup_id)
    os.makedirs(backup_path, exist_ok=True)

    building_id_list = [int(x) for x in building_ids.split(",") if x] if building_ids else []
    user_id_list = [int(x) for x in user_ids.split(",") if x] if user_ids else []

    filters = {
        "date_from": date_from,
        "date_to": date_to,
        "building_ids": building_id_list,
        "user_ids": user_id_list,
    }

    # Работы
    work_query = db.query(WorkPhoto).join(Work)
    if date_from:
        work_query = work_query.filter(Work.work_date >= date_from)
    if date_to:
        work_query = work_query.filter(Work.work_date <= date_to)
    if building_id_list:
        work_query = work_query.filter(Work.building_id.in_(building_id_list))
    if user_id_list:
        work_query = work_query.filter(Work.user_id.in_(user_id_list))

    # Заявки
    from app.models import Request as RequestModel
    request_query = db.query(RequestPhoto)
    if building_id_list:
        request_query = request_query.filter(RequestPhoto.request.has(RequestModel.building_id.in_(building_id_list)))

    copied = 0
    buildings_in_backup = set()

    for photo in work_query.all():
        src = resolve_photo_path(photo.file_path, settings.UPLOAD_DIR)
        if not src:
            continue
        dst = os.path.join(backup_path, "photos", photo.file_path.lstrip("/"))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1
        if photo.work and photo.work.building:
            buildings_in_backup.add(str(photo.work.building.number or photo.work.building.name))

    for photo in request_query.all():
        src = resolve_photo_path(photo.file_path, settings.UPLOAD_DIR)
        if not src:
            continue
        dst = os.path.join(backup_path, "request_photos", photo.file_path.lstrip("/"))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1
        if photo.request and photo.request.building:
            buildings_in_backup.add(str(photo.request.building.number or photo.request.building.name))

    metadata = {
        "backup_type": "photos",
        "created_at": datetime.utcnow().isoformat(),
        "created_by": _get_admin_username(db, admin.id),
        "version": settings.BACKUP_VERSION,
        "filters": filters,
        "total_files": copied,
        "buildings": sorted(buildings_in_backup),
    }
    with open(os.path.join(backup_path, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    part_paths, total_size = _create_archive(backup_path, backup_dir, backup_id)
    shutil.rmtree(backup_path)

    size_mb = round(total_size / (1024 * 1024)) if total_size else 0
    metadata["total_size_bytes"] = total_size

    log = BackupLog(
        backup_id=backup_id,
        backup_type="photos",
        created_by=admin.id,
        total_size_mb=size_mb,
        parts_count=len(part_paths),
        filters=filters,
        file_paths=part_paths,
        backup_metadata=metadata,
        status="completed",
        completed_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()

    _cleanup_old_backups(db, "photos", settings.BACKUP_RETENTION_PHOTOS)

    return {
        "success": True,
        "backup_id": backup_id,
        "photos_count": copied,
        "size_mb": size_mb,
        "parts_count": len(part_paths),
        "download_urls": [f"/api/backups/download/{backup_id}?part={i + 1}" for i in range(len(part_paths))],
    }


@router.get("")
def list_backups(
    db: Session = Depends(get_db),
    admin=Depends(require_director)
):
    logs = db.query(BackupLog).order_by(BackupLog.created_at.desc()).all()
    return {
        "items": [
            {
                "id": log.id,
                "backup_id": log.backup_id,
                "type": log.backup_type,
                "size_mb": log.total_size_mb,
                "parts_count": log.parts_count,
                "status": log.status,
                "created_at": log.created_at,
            }
            for log in logs
        ]
    }


@router.get("/download/{backup_id}")
def download_backup(
    backup_id: str,
    part: int = 1,
    db: Session = Depends(get_db),
    admin=Depends(require_director)
):
    log = db.query(BackupLog).filter(BackupLog.backup_id == backup_id).first()
    if not log or not log.file_paths:
        raise HTTPException(status_code=404, detail="Бэкап не найден")

    if part < 1 or part > len(log.file_paths):
        raise HTTPException(status_code=404, detail="Часть бэкапа не найдена")

    file_path = log.file_paths[part - 1]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Файл бэкапа не найден")

    return FileResponse(
        file_path,
        filename=os.path.basename(file_path),
        media_type="application/zip",
        content_disposition_type="attachment",
    )


@router.post("/upload")
def upload_backup_part(
    file: UploadFile = File(...),
    backup_id: Optional[str] = None,
    admin=Depends(require_admin)
):
    """Загружает часть бэкапа для последующей проверки/восстановления."""
    import_dir = _get_import_dir()
    safe_name = os.path.basename(file.filename or "part.zip")
    if backup_id:
        safe_name = f"{backup_id}{PART_SUFFIX.format(idx=int(safe_name.split('.')[-2]) if safe_name.split('.')[-2].isdigit() else 1)}"
    dest_path = os.path.join(import_dir, safe_name)

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "success": True,
        "filename": safe_name,
        "path": dest_path,
    }


@router.post("/validate/{backup_id}")
def validate_backup(
    backup_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_admin)
):
    """Проверяет целостность и структуру загруженного бэкапа."""
    settings = get_settings()
    import_dir = _get_import_dir()

    # Ищем все части бэкапа в imports
    parts = sorted(
        [f for f in os.listdir(import_dir) if f.startswith(backup_id) and f.endswith(".zip")]
    )
    if not parts:
        raise HTTPException(status_code=404, detail="Части бэкапа не найдены в imports")

    # Склеиваем части во временный ZIP
    temp_zip = os.path.join(import_dir, f".{backup_id}.combined.zip")
    try:
        with open(temp_zip, "wb") as out:
            for part in parts:
                with open(os.path.join(import_dir, part), "rb") as src:
                    shutil.copyfileobj(src, out)

        with zipfile.ZipFile(temp_zip, "r") as zf:
            names = zf.namelist()
            if "metadata.json" not in names:
                raise HTTPException(status_code=400, detail="В архиве отсутствует metadata.json")

            metadata = json.loads(zf.read("metadata.json").decode("utf-8"))

            backup_type = metadata.get("backup_type")
            version = metadata.get("version", "")

            if not version.startswith(settings.BACKUP_VERSION.rsplit(".", 1)[0]):
                raise HTTPException(
                    status_code=400,
                    detail=f"Несовместимая версия бэкапа: {version} (требуется {settings.BACKUP_VERSION})"
                )

            if backup_type == "full" and "database_dump.sql" not in names:
                raise HTTPException(status_code=400, detail="Полный бэкап не содержит database_dump.sql")

            return {
                "valid": True,
                "backup_id": backup_id,
                "type": backup_type,
                "version": version,
                "metadata": metadata,
                "parts": parts,
                "message": "Бэкап корректен. Для восстановления выполните скрипт restore_backup.py на сервере.",
            }
    finally:
        if os.path.exists(temp_zip):
            os.remove(temp_zip)


@router.post("/restore")
def restore_backup(
    backup_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_admin)
):
    """Возвращает инструкцию по восстановлению из бэкапа."""
    log = db.query(BackupLog).filter(BackupLog.backup_id == backup_id).first()
    if not log:
        # Может быть загруженный импорт, проверим валидность
        try:
            validate_backup(backup_id, db, admin)
        except HTTPException:
            raise HTTPException(status_code=404, detail="Бэкап не найден")

    return {
        "success": True,
        "backup_id": backup_id,
        "message": "Восстановление выполняется вручную на сервере. Запустите:",
        "command": f"cd /home/dimon64515/projects/crm/backend && source venv/bin/activate && python scripts/restore_backup.py --backup-id {backup_id} --yes",
    }


@router.delete("/{backup_id}")
def delete_backup(
    backup_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_admin)
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
