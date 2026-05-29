from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import pandas as pd

from app.database import get_db
from app.models import Service
from app.schemas import ServiceCreate, ServiceResponse, ImportResult
from app.core.dependencies import require_admin, get_current_user

router = APIRouter(prefix="/services", tags=["services"])


@router.get("", response_model=dict)
def list_services(
    search: str = None,
    page: int = 1,
    per_page: int = 50,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    query = db.query(Service).filter(Service.is_active == True)
    if search:
        query = query.filter(Service.name.ilike(f"%{search}%"))
    
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    
    return {
        "items": [
            {
                "id": s.id,
                "name": s.name,
                "unit": s.unit,
                "price": float(s.price),
                "is_active": s.is_active,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
            }
            for s in items
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/{service_id}", response_model=ServiceResponse)
def get_service(
    service_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Вид работы не найден")
    return service


@router.post("/import", response_model=ImportResult)
def import_services(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    if not file.filename.endswith('.xlsx'):
        raise HTTPException(status_code=400, detail="Требуется файл .xlsx")
    
    df = pd.read_excel(file.file, header=0)
    result = {"total_rows": len(df), "created": 0, "updated": 0, "errors": 0, "error_details": []}
    
    for idx, row in df.iterrows():
        try:
            name = str(row.iloc[0]).strip()
            unit = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else None
            price_str = str(row.iloc[2]).strip().replace(',', '.').replace(' ', '')
            
            if not name:
                result["errors"] += 1
                result["error_details"].append(f"Строка {idx + 2}: пустое наименование")
                continue
            
            price = float(price_str)
            if price < 0:
                raise ValueError()
            
            existing = db.query(Service).filter(Service.name == name).first()
            if existing:
                existing.unit = unit
                existing.price = price
                existing.is_active = True
                result["updated"] += 1
            else:
                db.add(Service(name=name, unit=unit, price=price))
                result["created"] += 1
        except Exception as e:
            result["errors"] += 1
            result["error_details"].append(f"Строка {idx + 2}: {str(e)}")
    
    db.commit()
    result["message"] = f"Импорт завершён. Создано: {result['created']}, обновлено: {result['updated']}, ошибок: {result['errors']}"
    return result


@router.post("", response_model=ServiceResponse)
def create_service(
    data: ServiceCreate,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    service = Service(**data.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.put("/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: int,
    data: ServiceCreate,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Вид работы не найден")
    for key, value in data.model_dump().items():
        setattr(service, key, value)
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{service_id}")
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Вид работы не найден")
    service.is_active = False
    db.commit()
    return {"success": True}
