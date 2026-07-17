from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal

from app.database import get_db
from app.models import Work, WorkPhoto, WorkFile, WorkMaterial, WorkService, Building, Service, Material, User, Request
from app.schemas import (
    WorkCreate, WorkResponse, WorkListResponse, WorkListItem,
    WorkPhotoResponse, WorkFileResponse, WorkMaterialResponse, WorkServiceResponse,
    WorkUpdatePrices, WorkUpdateAdmin
)
from app.core.dependencies import get_current_user, require_contractor, require_director, require_admin
from app.services.file_service import save_photo, save_work_file, delete_file, get_file_url

router = APIRouter(prefix="/works", tags=["works"])


def _build_services_response(work_services):
    return [
        {
            "service_id": ws.service_id,
            "name": ws.service.name,
            "unit": ws.service.unit,
            "quantity": ws.quantity,
            "unit_price": ws.unit_price,
            "total_price": ws.total_price,
        }
        for ws in work_services
    ]


def build_work_response(work: Work) -> dict:
    """Строит полный ответ о работе."""
    return {
        "id": work.id,
        "building": work.building,
        "work_date": work.work_date,
        "services": _build_services_response(work.work_services),
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
        "request_id": work.request_id,
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
        "services": _build_services_response(work.work_services),
        "description": work.description,
        "materials_total_price": work.materials_total_price,
        "total_price": work.total_price,
        "request_id": work.request_id,
        "photos_count": len(work.photos),
        "files_count": len(work.files),
        "created_at": work.created_at,
        "created_by": work.user,
    }


def _validate_services(db: Session, services_data: List):
    """Проверяет список услуг на дубли и активность."""
    service_ids = [s.service_id for s in services_data]
    if len(service_ids) != len(set(service_ids)):
        raise HTTPException(status_code=400, detail="Услуги не должны дублироваться")

    services = db.query(Service).filter(Service.id.in_(service_ids)).all()
    found_ids = {s.id for s in services}
    for service_id in service_ids:
        if service_id not in found_ids:
            raise HTTPException(status_code=400, detail=f"Услуга с id {service_id} не найдена")
    for service in services:
        if not service.is_active:
            raise HTTPException(status_code=400, detail=f"Услуга с id {service.id} неактивна")
    return services


def _recalc_totals(work: Work):
    """Пересчитывает итоговые суммы работы."""
    service_total = sum((ws.total_price or Decimal('0')) for ws in work.work_services)
    work.total_price = service_total + (work.materials_total_price or Decimal('0'))


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

    services = _validate_services(db, data.services)
    service_map = {s.id: s for s in services}

    # Проверка дублей материалов
    material_ids = [m.material_id for m in data.materials]
    if len(material_ids) != len(set(material_ids)):
        raise HTTPException(status_code=400, detail="Материалы не должны дублироваться")

    work = Work(
        user_id=current_user.id,
        building_id=data.building_id,
        request_id=data.request_id,
        work_date=data.work_date,
        description=data.description,
        materials_total_price=Decimal('0'),
        total_price=Decimal('0'),
    )
    db.add(work)
    db.flush()  # Получаем work.id

    # Добавление услуг
    service_total = Decimal('0')
    for svc_data in data.services:
        service = service_map[svc_data.service_id]
        svc_total = svc_data.quantity * service.price
        work_service = WorkService(
            work_id=work.id,
            service_id=svc_data.service_id,
            quantity=svc_data.quantity,
            unit_price=service.price,
            total_price=svc_total,
        )
        db.add(work_service)
        service_total += svc_total

    # Добавление материалов
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
        query = query.join(WorkService).filter(WorkService.service_id == int(service_id))
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

    if current_user.role in ('director', 'contractor'):
        raise HTTPException(status_code=403, detail="Редактирование записей доступно только администратору")

    if current_user.role == 'admin':
        # Полное редактирование для администратора
        if data.building_id is not None:
            building = db.query(Building).filter(Building.id == data.building_id).first()
            if not building or not building.is_active:
                raise HTTPException(status_code=400, detail="Корпус не найден или неактивен")
            work.building_id = data.building_id

        if data.user_id is not None:
            user = db.query(User).filter(User.id == data.user_id).first()
            if not user or not user.is_active or user.role != "contractor":
                raise HTTPException(status_code=400, detail="Подрядчик не найден или неактивен")
            work.user_id = data.user_id

        if data.request_id is not None:
            if data.request_id == 0:
                work.request_id = None
            else:
                request = db.query(Request).filter(Request.id == data.request_id).first()
                if not request:
                    raise HTTPException(status_code=404, detail="Заявка не найдена")
                work.request_id = data.request_id

        if data.services is not None:
            services = _validate_services(db, data.services)
            service_map = {s.id: s for s in services}

            # Удаляем старые услуги
            for ws in work.work_services:
                db.delete(ws)
            db.flush()

            for svc_data in data.services:
                service = service_map[svc_data.service_id]
                svc_total = svc_data.quantity * service.price
                work_service = WorkService(
                    work_id=work.id,
                    service_id=svc_data.service_id,
                    quantity=svc_data.quantity,
                    unit_price=service.price,
                    total_price=svc_total,
                )
                db.add(work_service)
            db.flush()

        if data.materials is not None:
            material_ids = [m.material_id for m in data.materials]
            if len(material_ids) != len(set(material_ids)):
                raise HTTPException(status_code=400, detail="Материалы не должны дублироваться")

            # Валидация всех запрошенных материалов перед удалением старых
            materials = db.query(Material).filter(Material.id.in_(material_ids)).all()
            found_ids = {m.id for m in materials}
            for material_id in material_ids:
                if material_id not in found_ids:
                    raise HTTPException(status_code=400, detail=f"Материал с id {material_id} не найден")
            for material in materials:
                if not material.is_active:
                    raise HTTPException(status_code=400, detail=f"Материал с id {material.id} неактивен")

            # Удаляем старые материалы
            for wm in work.work_materials:
                db.delete(wm)
            db.flush()

            materials_total = Decimal('0')
            for mat_data in data.materials:
                material = next(m for m in materials if m.id == mat_data.material_id)
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
            db.flush()

    # Общие поля, доступные админу
    if data.description is not None:
        work.description = data.description
    if data.work_date is not None:
        work.work_date = data.work_date

    db.flush()
    db.refresh(work)
    _recalc_totals(work)
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

    # Обновление цен услуг
    if data.services:
        for svc_update in data.services:
            svc_id = svc_update.get("service_id")
            new_price = svc_update.get("unit_price")
            if svc_id is None or new_price is None:
                continue
            ws = db.query(WorkService).filter(
                WorkService.work_id == work_id,
                WorkService.service_id == svc_id
            ).first()
            if ws:
                ws.unit_price = Decimal(str(new_price))
                ws.total_price = ws.quantity * ws.unit_price
    elif data.service_unit_price is not None and len(work.work_services) == 1:
        # Legacy: если работа содержит ровно одну услугу
        ws = work.work_services[0]
        ws.unit_price = data.service_unit_price
        ws.total_price = ws.quantity * ws.unit_price

    # Обновление цен материалов
    if data.materials:
        for mat_update in data.materials:
            wm = db.query(WorkMaterial).filter(
                WorkMaterial.work_id == work_id,
                WorkMaterial.material_id == mat_update.get("material_id")
            ).first()
            if wm:
                wm.unit_price = Decimal(str(mat_update.get("unit_price", wm.unit_price)))
                wm.total_price = wm.quantity * wm.unit_price

    # Пересчёт итогов
    materials_total = sum((wm.total_price or Decimal('0')) for wm in work.work_materials)
    work.materials_total_price = materials_total
    _recalc_totals(work)

    db.commit()
    db.refresh(work)

    service_total = sum((ws.total_price or Decimal('0')) for ws in work.work_services)
    return {
        "success": True,
        "service_total_price": service_total,
        "materials_total_price": work.materials_total_price,
        "total_price": work.total_price,
    }
