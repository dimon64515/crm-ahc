from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import pandas as pd

from app.database import get_db
from app.models import Material
from app.schemas import MaterialCreate, MaterialResponse, ImportResult
from app.core.dependencies import require_admin, get_current_user

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("", response_model=dict)
def list_materials(
    search: str = None,
    page: int = 1,
    per_page: int = 50,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    query = db.query(Material).filter(Material.is_active == True)
    if search:
        query = query.filter(Material.name.ilike(f"%{search}%"))
    
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    
    return {
        "items": [
            {
                "id": m.id,
                "name": m.name,
                "unit": m.unit,
                "price": float(m.price),
                "is_active": m.is_active,
                "created_at": m.created_at,
                "updated_at": m.updated_at,
            }
            for m in items
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/{material_id}", response_model=MaterialResponse)
def get_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Материал не найден")
    return material


@router.post("/import", response_model=ImportResult)
def import_materials(
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
            
            existing = db.query(Material).filter(Material.name == name).first()
            if existing:
                existing.unit = unit
                existing.price = price
                existing.is_active = True
                result["updated"] += 1
            else:
                db.add(Material(name=name, unit=unit, price=price))
                result["created"] += 1
        except Exception as e:
            result["errors"] += 1
            result["error_details"].append(f"Строка {idx + 2}: {str(e)}")
    
    db.commit()
    result["message"] = f"Импорт завершён. Создано: {result['created']}, обновлено: {result['updated']}, ошибок: {result['errors']}"
    return result


@router.post("", response_model=MaterialResponse)
def create_material(
    data: MaterialCreate,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    material = Material(**data.model_dump())
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


@router.put("/{material_id}", response_model=MaterialResponse)
def update_material(
    material_id: int,
    data: MaterialCreate,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Материал не найден")
    for key, value in data.model_dump().items():
        setattr(material, key, value)
    db.commit()
    db.refresh(material)
    return material


@router.delete("/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Материал не найден")
    material.is_active = False
    db.commit()
    return {"success": True}
