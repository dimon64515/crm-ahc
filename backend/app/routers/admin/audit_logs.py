from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import AuditLog, User
from app.schemas import AuditLogsListResponse
from app.core.dependencies import require_admin

router = APIRouter(prefix="/admin/audit-logs", tags=["admin"])


@router.get("", response_model=AuditLogsListResponse)
def list_audit_logs(
    entity_type: Optional[str] = Query(None, description="Тип сущности"),
    entity_id: Optional[int] = Query(None, description="ID сущности"),
    action: Optional[str] = Query(None, description="Тип действия"),
    user_id: Optional[int] = Query(None, description="ID пользователя"),
    date_from: Optional[str] = Query(None, description="Дата начала (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Дата конца (YYYY-MM-DD)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Получение журнала действий с фильтрацией и пагинацией. Только для администраторов."""
    query = db.query(AuditLog).options(joinedload(AuditLog.user))

    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if date_from:
        try:
            date_from_parsed = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(AuditLog.created_at >= date_from_parsed)
        except ValueError:
            pass  # Invalid date format, ignore filter
    if date_to:
        try:
            date_to_parsed = datetime.strptime(date_to, "%Y-%m-%d")
            # Set to end of day
            date_to_parsed = date_to_parsed + timedelta(days=1) - timedelta(seconds=1)
            query = query.filter(AuditLog.created_at <= date_to_parsed)
        except ValueError:
            pass  # Invalid date format, ignore filter

    total = query.count()

    logs = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return AuditLogsListResponse(
        items=logs,
        total=total,
        page=page,
        per_page=per_page,
    )
