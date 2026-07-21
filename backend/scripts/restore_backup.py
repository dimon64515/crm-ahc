#!/usr/bin/env python3
"""
Скрипт восстановления CRM из полного бэкапа.

Запускается вручную на сервере:
    python scripts/restore_backup.py --backup-id full_20260721_120000 --yes
    python scripts/restore_backup.py --backup-id full_20260721_120000 --dry-run

Перед восстановлением:
  - создаёт pre-backup текущего состояния;
  - останавливает backend;
  - восстанавливает БД из дампа;
  - восстанавливает файлы из архива.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

# Добавляем корень backend в PYTHONPATH для импорта config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import get_settings


PART_SUFFIX = ".part{idx}.zip"
UPLOAD_SUBDIRS = ["photos", "files", "works", "request_photos"]


def log(msg: str):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")


def run(cmd: list[str], check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    log(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, check=check, capture_output=capture, text=True)


def find_backup_parts(backup_id: str) -> list[str]:
    """Ищет части бэкапа: сначала в uploads/backups, затем в uploads/backups/imports."""
    settings = get_settings()
    locations = [
        os.path.join(settings.UPLOAD_DIR, "backups"),
        os.path.join(settings.UPLOAD_DIR, "backups", "imports"),
    ]
    parts = []
    for loc in locations:
        if not os.path.isdir(loc):
            continue
        found = sorted(
            [os.path.join(loc, f) for f in os.listdir(loc)
             if f.startswith(backup_id) and f.endswith(".zip")]
        )
        if found:
            parts = found
            break
    if not parts:
        raise FileNotFoundError(f"Части бэкапа {backup_id} не найдены")
    return parts


def combine_parts(parts: list[str], dest: str) -> None:
    with open(dest, "wb") as out:
        for part in parts:
            with open(part, "rb") as src:
                shutil.copyfileobj(src, out)


def extract_archive(zip_path: str, dest_dir: str) -> None:
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(dest_dir)


def parse_db_url(db_url: str) -> tuple[str, str, str, str, str]:
    parsed = urlparse(db_url)
    user = parsed.username or ""
    password = parsed.password or ""
    host = parsed.hostname or "localhost"
    port = str(parsed.port or 5432)
    dbname = parsed.path.lstrip("/")
    return user, password, host, port, dbname


def pg_env(password: str) -> dict:
    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password
    return env


def create_db_dump(db_url: str, dump_path: str) -> None:
    log(f"Создание дампа текущей БД: {dump_path}")
    subprocess.run(["pg_dump", db_url, "-f", dump_path], check=True, capture_output=True)


def restore_db_dump(db_url: str, dump_path: str) -> None:
    user, password, host, port, dbname = parse_db_url(db_url)
    env = pg_env(password)

    log(f"Пересоздание базы данных {dbname}")
    # Закрываем активные соединения
    subprocess.run(
        ["psql", "-h", host, "-p", port, "-U", user, "-d", "postgres",
         "-c", f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{dbname}' AND pid <> pg_backend_pid();"],
        check=False,
        env=env,
        capture_output=True,
    )

    # Удаляем и создаём базу заново
    subprocess.run(
        ["dropdb", "-h", host, "-p", port, "-U", user, "--if-exists", dbname],
        check=True,
        env=env,
    )
    subprocess.run(
        ["createdb", "-h", host, "-p", port, "-U", user, dbname],
        check=True,
        env=env,
    )

    log(f"Восстановление дампа из {dump_path}")
    with open(dump_path, "r") as f:
        subprocess.run(
            ["psql", "-h", host, "-p", port, "-U", user, "-d", dbname],
            stdin=f,
            check=True,
            env=env,
        )


def copy_pre_backup(upload_dir: str, pre_dir: str) -> None:
    """Копирует текущие uploads (кроме backups) в pre-backup."""
    os.makedirs(pre_dir, exist_ok=True)
    for subdir in UPLOAD_SUBDIRS:
        src = os.path.join(upload_dir, subdir)
        if not os.path.exists(src):
            continue
        dst = os.path.join(pre_dir, subdir)
        shutil.copytree(src, dst, dirs_exist_ok=True)


def restore_files(extract_dir: str, upload_dir: str) -> None:
    """Заменяет поддиректории uploads на содержимое архива."""
    for subdir in UPLOAD_SUBDIRS:
        src = os.path.join(extract_dir, subdir)
        if not os.path.exists(src):
            continue
        dst = os.path.join(upload_dir, subdir)
        if os.path.exists(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        log(f"Восстановлена директория: {dst}")


def main():
    parser = argparse.ArgumentParser(description="Восстановление CRM из бэкапа")
    parser.add_argument("--backup-id", required=True, help="ID бэкапа (например, full_20260721_120000)")
    parser.add_argument("--yes", action="store_true", help="Подтвердить восстановление без запроса")
    parser.add_argument("--dry-run", action="store_true", help="Проверить бэкап, не восстанавливая данные")
    args = parser.parse_args()

    settings = get_settings()
    db_url = settings.DATABASE_URL
    upload_dir = settings.UPLOAD_DIR

    parts = find_backup_parts(args.backup_id)
    log(f"Найдено частей бэкапа: {len(parts)}")

    temp_zip = os.path.join(upload_dir, f"backups", f".{args.backup_id}.restore.zip")
    extract_dir = os.path.join(upload_dir, f"backups", f".{args.backup_id}.restore")

    try:
        log("Склеивание частей архива")
        combine_parts(parts, temp_zip)

        log("Распаковка архива")
        os.makedirs(extract_dir, exist_ok=True)
        extract_archive(temp_zip, extract_dir)

        metadata_path = os.path.join(extract_dir, "metadata.json")
        if not os.path.exists(metadata_path):
            raise ValueError("В архиве отсутствует metadata.json")

        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        log(f"Тип бэкапа: {metadata.get('backup_type')}, версия: {metadata.get('version')}")

        if metadata.get("backup_type") != "full":
            raise ValueError("Скрипт поддерживает только полные бэкапы")

        dump_path = os.path.join(extract_dir, "database_dump.sql")
        if not os.path.exists(dump_path):
            raise ValueError("В архиве отсутствует database_dump.sql")

        if args.dry_run:
            log("Dry-run: бэкап корректен, восстановление не выполнялось")
            return

        if not args.yes:
            answer = input("ВНИМАНИЕ: текущие данные будут заменены. Продолжить? [yes/no]: ")
            if answer.strip().lower() != "yes":
                log("Восстановление отменено")
                return

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pre_dir = os.path.join(upload_dir, "backups", f"pre_restore_{timestamp}")
        pre_dump = os.path.join(pre_dir, "database_pre_restore.sql")

        log(f"Создание pre-backup: {pre_dir}")
        os.makedirs(pre_dir, exist_ok=True)
        create_db_dump(db_url, pre_dump)
        copy_pre_backup(upload_dir, pre_dir)

        log("Остановка backend")
        run(["systemctl", "stop", "crm-backend"], check=False)

        try:
            log("Восстановление базы данных")
            restore_db_dump(db_url, dump_path)

            log("Восстановление файлов")
            restore_files(extract_dir, upload_dir)
        finally:
            log("Запуск backend")
            run(["systemctl", "start", "crm-backend"], check=False)

        log(f"Восстановление завершено. Pre-backup сохранён: {pre_dir}")

    finally:
        if os.path.exists(temp_zip):
            os.remove(temp_zip)
        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)


if __name__ == "__main__":
    main()
