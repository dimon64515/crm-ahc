from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import Building
from app.schemas import BuildingCreate, BuildingResponse
from app.core.dependencies import require_admin, get_current_user

router = APIRouter(prefix="/buildings", tags=["buildings"])


@router.get("", response_model=List[BuildingResponse])
def list_buildings(
    search: str = None,
    is_active: bool = True,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    query = db.query(Building).filter(Building.is_active == is_active)
    if search:
        query = query.filter(Building.number.ilike(f"%{search}%"))
    return query.order_by(Building.number).all()


@router.post("", response_model=BuildingResponse)
def create_building(
    data: BuildingCreate,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    building = Building(**data.model_dump())
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


@router.put("/{building_id}", response_model=BuildingResponse)
def update_building(
    building_id: int,
    data: BuildingCreate,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Корпус не найден")
    for key, value in data.model_dump().items():
        setattr(building, key, value)
    db.commit()
    db.refresh(building)
    return building


@router.delete("/{building_id}")
def delete_building(
    building_id: int,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Корпус не найден")
    building.is_active = False
    db.commit()
    return {"success": True, "message": "Корпус деактивирован"}
