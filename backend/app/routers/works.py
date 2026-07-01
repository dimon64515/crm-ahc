from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal

from app.database import get_db
from app.models import Work, WorkPhoto, WorkFile, WorkMaterial, Building, Service, Material, User
from app.schemas import (
    WorkCreate, WorkResponse, WorkListResponse, WorkListItem,
    WorkPhotoResponse, WorkFileResponse, WorkMaterialResponse,
    WorkUpdatePrices, WorkUpdate, WorkUpdateAdmin
)
from app.core.dependencies import get_current_user, require_contractor, require_director, require_admin
from app.services.file_service import save_photo, save_work_file, delete_file, get_file_url

router = APIRouter(prefix="/works", tags=["works"])


def build_work_response(work: Work) -> dict:
    """Строит полный ответ о работе."""
    return {
        "id": work.id,
        "building": work.building,
        "work_date": work.work_date,
        "service": work.service,
        "service_quantity": work.service_quantity,
        "service_unit_price": work.service_unit_price,
        "service_total_price": work.service_total_price,
        "description": work.description,
        "materials": [
            {
                "material_id": wm.material_id,
                "name": wm.material.name,
                "unit": wm.material.unit,
                "quantity": wm.quantity,
                "unit_price": wm.unit_price,
                "total_price": wm.total_price,
            }
            for wm in work.work_materials
        ],
        "materials_total_price": work.materials_total_price,
        "total_price": work.total_price,
        "photos": [
            {
                "id": p.id,
                "filename": p.filename,
                "original_name": p.original_name,
                "url": get_file_url(p.file_path),
                "file_size": p.file_size,
                "created_at": p.created_at,
            }
            for p in work.photos
        ],
        "files": [
            {
                "id": f.id,
                "filename": f.filename,
                "original_name": f.original_name,
                "url": get_file_url(f.file_path),
                "file_size": f.file_size,
                "created_at": f.created_at,
            }
            for f in work.files
        ],
        "created_at": work.created_at,
        "created_by": work.user,
    }


def build_work_list_item(work: Work) -> dict:
    """Строит краткий ответ для списка."""
    return {
        "id": work.id,
        "building": work.building,
        "work_date": work.work_date,
        "service": work.service,
        "service_quantity": work.service_quantity,
        "service_unit_price": work.service_unit_price,
        "service_total_price": work.service_total_price,
        "description": work.description,
        "materials_total_price": work.materials_total_price,
        "total_price": work.total_price,
        "photos_count": len(work.photos),
        "files_count": len(work.files),
        "created_at": work.created_at,
        "created_by": work.user,
    }


@router.post("", response_model=WorkResponse)
def create_work(
    data: WorkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_contractor)
):
    # Проверка существования связанных записей
    building = db.query(Building).filter(Building.id == data.building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Корпус не найден")
    
    service = db.query(Service).filter(Service.id == data.service_id, Service.is_active == True).first()
    if not service:
        raise HTTPException(status_code=404, detail="Вид работы не найден")
    
    # Расчёт сумм
    service_total = Decimal(str(data.service_quantity)) * service.price
    materials_total = Decimal('0')
    
    work = Work(
        user_id=current_user.id,
        building_id=data.building_id,
        service_id=data.service_id,
        work_date=data.work_date,
        description=data.description,
        service_quantity=data.service_quantity,
        service_unit_price=service.price,
        service_total_price=service_total,
        materials_total_price=materials_total,
        total_price=service_total,
    )
    db.add(work)
    db.flush()  # Получаем work.id
    
    # Проверка дублей материалов
    material_ids = [m.material_id for m in data.materials]
    if len(material_ids) != len(set(material_ids)):
        raise HTTPException(status_code=400, detail="Материалы не должны дублироваться")

    # Добавление материалов
    for mat_data in data.materials:
        material = db.query(Material).filter(Material.id == mat_data.material_id, Material.is_active == True).first()
        if not material:
            continue
        
        mat_total = mat_data.quantity * material.price
        work_material = WorkMaterial(
            work_id=work.id,
            material_id=mat_data.material_id,
            quantity=mat_data.quantity,
            unit_price=material.price,
            total_price=mat_total,
        )
        db.add(work_material)
        materials_total += mat_total
    
    work.materials_total_price = materials_total
    work.total_price = service_total + materials_total
    
    db.commit()
    db.refresh(work)
    
    return build_work_response(work)


@router.get("", response_model=WorkListResponse)
def list_works(
    date_from: str = None,
    date_to: str = None,
    building_id: str = None,
    service_id: str = None,
    user_id: str = None,
    search: str = None,
    sort_by: str = None,
    sort_order: str = 'desc',
    page: int = 1,
    per_page: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Work)
    
    if current_user.role == 'contractor':
        query = query.filter(Work.user_id == current_user.id)
    
    if date_from:
        query = query.filter(Work.work_date >= date_from)
    if date_to:
        query = query.filter(Work.work_date <= date_to)
    if building_id:
        query = query.filter(Work.building_id == int(building_id))
    if service_id:
        query = query.filter(Work.service_id == int(service_id))
    if user_id:
        query = query.filter(Work.user_id == int(user_id))
    if search:
        query = query.filter(Work.description.ilike(f"%{search}%"))
    
    total = query.count()
    
    # Сортировка
    sort_field = {
        'date': Work.work_date,
        'created': Work.created_at,
        'price': Work.total_price,
    }.get(sort_by, Work.created_at)
    
    if sort_order == 'asc':
        query = query.order_by(sort_field.asc())
    else:
        query = query.order_by(sort_field.desc())
    
    works = query.offset((page - 1) * per_page).limit(per_page).all()
    
    return {
        "items": [build_work_list_item(w) for w in works],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/{work_id}", response_model=WorkResponse)
def get_work(
    work_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    work = db.query(Work).filter(Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Работа не найдена")
    if current_user.role not in ('admin', 'director') and work.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return build_work_response(work)


@router.put("/{work_id}", response_model=WorkResponse)
def update_work(
    work_id: int,
    data: WorkUpdateAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    work = db.query(Work).filter(Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Работа не найдена")

    if current_user.role == 'director':
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    if current_user.role == 'contractor' and work.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    if current_user.role == 'admin':
        # Полное редактирование для администратора
        if data.building_id is not None:
            building = db.query(Building).filter(Building.id == data.building_id).first()
            if not building:
                raise HTTPException(status_code=404, detail="Корпус не найден")
            work.building_id = data.building_id

        if data.service_id is not None:
            service = db.query(Service).filter(Service.id == data.service_id, Service.is_active == True).first()
            if not service:
                raise HTTPException(status_code=404, detail="Вид работы не найден")
            work.service_id = data.service_id
            work.service_unit_price = service.price

        if data.user_id is not None:
            user = db.query(User).filter(User.id == data.user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="Пользователь не найден")
            work.user_id = data.user_id

        if data.materials is not None:
            material_ids = [m.material_id for m in data.materials]
            if len(material_ids) != len(set(material_ids)):
                raise HTTPException(status_code=400, detail="Материалы не должны дублироваться")

            # Удаляем старые материалы
            for wm in work.work_materials:
                db.delete(wm)
            db.flush()

            materials_total = Decimal('0')
            for mat_data in data.materials:
                material = db.query(Material).filter(Material.id == mat_data.material_id, Material.is_active == True).first()
                if not material:
                    continue
                mat_total = mat_data.quantity * material.price
                work_material = WorkMaterial(
                    work_id=work.id,
                    material_id=mat_data.material_id,
                    quantity=mat_data.quantity,
                    unit_price=material.price,
                    total_price=mat_total,
                )
                db.add(work_material)
                materials_total += mat_total
            work.materials_total_price = materials_total

    # Общие поля, доступные админу и подрядчику
    if data.description is not None:
        work.description = data.description
    if data.work_date is not None:
        work.work_date = data.work_date
    if data.service_quantity is not None:
        work.service_quantity = data.service_quantity

    # Пересчёт сумм
    work.service_total_price = work.service_quantity * work.service_unit_price
    work.total_price = work.service_total_price + (work.materials_total_price or Decimal('0'))

    db.commit()
    db.refresh(work)
    return build_work_response(work)


@router.delete("/{work_id}")
def delete_work(
    work_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    work = db.query(Work).filter(Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Работа не найдена")
    
    if current_user.role == 'director':
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    if current_user.role == 'contractor' and work.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    for photo in work.photos:
        delete_file(photo.file_path)
    for file in work.files:
        delete_file(file.file_path)
    
    db.delete(work)
    db.commit()
    return {"success": True}


@router.delete("/{work_id}/photos/{photo_id}")
def delete_photo(
    work_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    photo = db.query(WorkPhoto).filter(WorkPhoto.id == photo_id, WorkPhoto.work_id == work_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Фото не найдено")
    
    work = db.query(Work).filter(Work.id == work_id).first()
    if current_user.role not in ('admin', 'director') and work.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    delete_file(photo.file_path)
    db.delete(photo)
    db.commit()
    return {"success": True}


@router.delete("/{work_id}/files/{file_id}")
def delete_work_file_endpoint(
    work_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = db.query(WorkFile).filter(WorkFile.id == file_id, WorkFile.work_id == work_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="Файл не найден")
    
    work = db.query(Work).filter(Work.id == work_id).first()
    if current_user.role not in ('admin', 'director') and work.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    delete_file(file.file_path)
    db.delete(file)
    db.commit()
    return {"success": True}


@router.post("/{work_id}/photos")
def upload_photos(
    work_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_contractor)
):
    work = db.query(Work).filter(Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Работа не найдена")
    
    if current_user.role == 'contractor' and work.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    if len(work.photos) + len(files) > 20:
        raise HTTPException(status_code=400, detail="Максимум 20 фото на работу")
    
    uploaded = []
    for file in files:
        if not file.content_type or not file.content_type.startswith('image/'):
            continue
        
        meta = save_photo(file, work.building.number)
        photo = WorkPhoto(work_id=work_id, **meta)
        db.add(photo)
        uploaded.append({
            "id": photo.id,
            "filename": meta["filename"],
            "url": get_file_url(meta["file_path"]),
        })
    
    db.commit()
    return {"success": True, "uploaded": len(uploaded), "photos": uploaded}


@router.post("/{work_id}/files")
def upload_files(
    work_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_contractor)
):
    work = db.query(Work).filter(Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Работа не найдена")
    
    uploaded = []
    for file in files:
        meta = save_work_file(file, work_id)
        f = WorkFile(work_id=work_id, **meta)
        db.add(f)
        uploaded.append({
            "id": f.id,
            "filename": meta["filename"],
            "url": get_file_url(meta["file_path"]),
        })
    
    db.commit()
    return {"success": True, "uploaded": len(uploaded), "files": uploaded}


@router.put("/{work_id}/prices")
def update_work_prices(
    work_id: int,
    data: WorkUpdatePrices,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    work = db.query(Work).filter(Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Работа не найдена")
    
    # Обновление цены работы
    if data.service_unit_price is not None:
        work.service_unit_price = data.service_unit_price
        work.service_total_price = work.service_quantity * data.service_unit_price
    
    # Обновление цен материалов
    materials_total = Decimal('0')
    for mat_update in data.materials:
        wm = db.query(WorkMaterial).filter(
            WorkMaterial.work_id == work_id,
            WorkMaterial.material_id == mat_update.get("material_id")
        ).first()
        if wm:
            wm.unit_price = Decimal(str(mat_update.get("unit_price", wm.unit_price)))
            wm.total_price = wm.quantity * wm.unit_price
            materials_total += wm.total_price
    
    # Пересчёт итогов
    work.materials_total_price = materials_total
    work.total_price = work.service_total_price + materials_total
    
    db.commit()
    db.refresh(work)
    
    return {
        "success": True,
        "service_unit_price": work.service_unit_price,
        "service_total_price": work.service_total_price,
        "materials_total_price": work.materials_total_price,
        "total_price": work.total_price,
    }
