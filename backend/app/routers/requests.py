import os
from datetime import date, timedelta, datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Request, RequestPhoto, Building, User
from app.schemas import RequestCreate, RequestResponse, RequestListResponse, RequestListItem, RequestPhotoResponse
from app.core.dependencies import get_current_user, require_watchman, require_executor
from app.core.config import get_settings
from app.services.file_service import compress_image, get_file_url

router = APIRouter(prefix="/requests", tags=["requests"])


def build_request_response(req: Request) -> dict:
    return {
        "id": req.id,
        "building": req.building,
        "description": req.description,
        "status": req.status,
        "creator": req.creator,
        "executor": req.executor,
        "due_date": req.due_date,
        "extended_count": req.extended_count,
        "photos": [
            {
                "id": p.id,
                "filename": p.filename,
                "original_name": p.original_name,
                "url": get_file_url(p.file_path),
                "file_size": p.file_size,
                "created_at": p.created_at,
            }
            for p in req.photos
        ],
        "created_at": req.created_at,
        "updated_at": req.updated_at,
    }


def build_request_list_item(req: Request) -> dict:
    return {
        "id": req.id,
        "building": req.building,
        "description": req.description,
        "status": req.status,
        "creator": req.creator,
        "executor": req.executor,
        "due_date": req.due_date,
        "extended_count": req.extended_count,
        "photos_count": len(req.photos),
        "created_at": req.created_at,
    }


def save_request_photo(upload_file, request_id: int) -> dict:
    content = upload_file.file.read()
    compressed = compress_image(content)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{os.urandom(4).hex()}.jpg"
    settings = get_settings()
    dest_dir = os.path.join(settings.UPLOAD_DIR, "request_photos", str(request_id))
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, filename)
    with open(dest_path, "wb") as f:
        f.write(compressed)
    return {
        "filename": filename,
        "original_name": upload_file.filename,
        "file_path": dest_path,
        "file_size": len(compressed),
        "mime_type": "image/jpeg",
    }


@router.post("", response_model=RequestResponse)
def create_request(
    data: RequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_watchman)
):
    building = db.query(Building).filter(Building.id == data.building_id, Building.is_active == True).first()
    if not building:
        raise HTTPException(status_code=400, detail="Корпус не найден или неактивен")

    request = Request(
        building_id=data.building_id,
        description=data.description,
        status="new",
        created_by=current_user.id,
        due_date=date.today() + timedelta(days=5),
        extended_count=0,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return build_request_response(request)


@router.get("", response_model=RequestListResponse)
def list_requests(
    status: str = None,
    building_id: int = None,
    date_from: str = None,
    date_to: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_executor)
):
    query = db.query(Request)
    if status:
        query = query.filter(Request.status == status)
    if building_id:
        query = query.filter(Request.building_id == building_id)
    if date_from:
        query = query.filter(Request.created_at >= date_from)
    if date_to:
        query = query.filter(Request.created_at <= date_to)

    items = query.order_by(Request.created_at.desc()).all()
    return {
        "items": [build_request_list_item(r) for r in items],
        "total": len(items),
    }


@router.get("/my", response_model=RequestListResponse)
def list_my_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_watchman)
):
    items = db.query(Request).filter(Request.created_by == current_user.id).order_by(Request.created_at.desc()).all()
    return {
        "items": [build_request_list_item(r) for r in items],
        "total": len(items),
    }


@router.get("/{request_id}", response_model=RequestResponse)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if current_user.role == "watchman" and req.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    return build_request_response(req)


@router.post("/{request_id}/photos")
def upload_request_photos(
    request_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_watchman)
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if req.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    if len(req.photos) + len(files) > 5:
        raise HTTPException(status_code=400, detail="Максимум 5 фото на заявку")

    uploaded = []
    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            continue
        meta = save_request_photo(file, request_id)
        photo = RequestPhoto(request_id=request_id, **meta)
        db.add(photo)
        db.flush()
        uploaded.append({"id": photo.id, "filename": meta["filename"], "url": get_file_url(meta["file_path"])})

    db.commit()
    return {"success": True, "uploaded": len(uploaded), "photos": uploaded}
