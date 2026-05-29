import os
import shutil
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageOps
import io

from fastapi import UploadFile

from app.core.config import get_settings

settings = get_settings()


def ensure_dir(path: str):
    Path(path).mkdir(parents=True, exist_ok=True)


def compress_image(image_bytes: bytes, max_size_mb: float = 1.0, max_dimension: int = 1920) -> bytes:
    """Сжимает изображение до заданного размера."""
    max_size_bytes = max_size_mb * 1024 * 1024
    
    img = Image.open(io.BytesIO(image_bytes))
    
    # Применяем EXIF-ориентацию, чтобы фото не было перевернуто
    img = ImageOps.exif_transpose(img)
    
    # Конвертируем любой режим в RGB (включая CMYK, Grayscale и т.д.)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    if max(img.size) > max_dimension:
        ratio = max_dimension / max(img.size)
        new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
        img = img.resize(new_size, Image.LANCZOS)
    
    quality = 95
    output = io.BytesIO()
    
    while quality > 50:
        output.seek(0)
        output.truncate()
        img.save(output, format='JPEG', quality=quality, optimize=True)
        
        if output.tell() <= max_size_bytes:
            break
        
        quality -= 5
    
    return output.getvalue()


def save_upload_file(upload_file: UploadFile, dest_path: str) -> dict:
    """Сохраняет файл и возвращает метаданные."""
    content = upload_file.file.read()
    
    with open(dest_path, 'wb') as f:
        f.write(content)
    
    return {
        "filename": os.path.basename(dest_path),
        "original_name": upload_file.filename,
        "file_path": dest_path,
        "file_size": len(content),
        "mime_type": upload_file.content_type,
    }


def save_photo(upload_file: UploadFile, building_number: str) -> dict:
    """Сохраняет фото с сжатием."""
    content = upload_file.file.read()
    
    # Сжатие
    compressed = compress_image(content)
    
    # Формирование имени файла
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = "jpg"
    filename = f"{timestamp}_{os.urandom(4).hex()}.{ext}"
    
    # Путь: uploads/photos/building_{number}/
    dest_dir = os.path.join(settings.UPLOAD_DIR, "photos", f"building_{building_number}")
    ensure_dir(dest_dir)
    
    dest_path = os.path.join(dest_dir, filename)
    
    with open(dest_path, 'wb') as f:
        f.write(compressed)
    
    return {
        "filename": filename,
        "original_name": upload_file.filename,
        "file_path": dest_path,
        "file_size": len(compressed),
        "mime_type": "image/jpeg",
    }


def save_work_file(upload_file: UploadFile, work_id: int) -> dict:
    """Сохраняет документ к работе."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(c for c in upload_file.filename if c.isalnum() or c in '._-').rstrip()
    filename = f"{timestamp}_{safe_name}"
    
    dest_dir = os.path.join(settings.UPLOAD_DIR, "works", str(work_id), "files")
    ensure_dir(dest_dir)
    
    dest_path = os.path.join(dest_dir, filename)
    return save_upload_file(upload_file, dest_path)


def delete_file(file_path: str):
    """Удаляет файл с диска."""
    if os.path.exists(file_path):
        os.remove(file_path)


def get_file_url(file_path: str) -> str:
    """Возвращает URL для доступа к файлу."""
    if not file_path:
        return ""
    # Преобразуем абсолютный путь в относительный URL
    upload_dir = settings.UPLOAD_DIR
    if file_path.startswith(upload_dir):
        relative = file_path[len(upload_dir):].lstrip('/')
        return f"/uploads/{relative}"
    return ""
