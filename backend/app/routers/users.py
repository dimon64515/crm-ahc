from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserResponse
from app.core.dependencies import require_admin
from app.core.security import get_password_hash

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=dict)
def list_users(
    role: str = None,
    search: str = None,
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if search:
        query = query.filter(
            (User.username.ilike(f"%{search}%")) |
            (User.full_name.ilike(f"%{search}%"))
        )
    
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    
    return {
        "items": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "full_name": u.full_name,
                "phone": u.phone,
                "role": u.role,
                "is_active": u.is_active,
                "created_at": u.created_at,
            }
            for u in items
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("", response_model=UserResponse)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    # Проверка уникальности
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Логин уже занят")
    
    user = User(
        username=data.username,
        email=data.email,
        phone=data.phone,
        hashed_password=get_password_hash(data.password),
        role=data.role,
        full_name=data.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserCreate,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    user.username = data.username
    user.email = data.email
    user.phone = data.phone
    user.full_name = data.full_name
    user.role = data.role
    if data.password:
        user.hashed_password = get_password_hash(data.password)
    
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.is_active = False
    db.commit()
    return {"success": True}
