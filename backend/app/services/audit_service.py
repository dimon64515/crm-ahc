import logging
from datetime import datetime, date
from typing import Any, Optional
from app.models import AuditLog

logger = logging.getLogger(__name__)


def serialize_for_log(obj: Any) -> Any:
    """Сериализует SQLAlchemy объект или структуру в JSON-совместимый формат."""
    if obj is None:
        return None
    if hasattr(obj, '__table__'):
        # SQLAlchemy model
        result = {}
        for column in obj.__table__.columns:
            value = getattr(obj, column.name)
            if isinstance(value, datetime):
                value = value.isoformat()
            elif isinstance(value, date):
                value = value.isoformat()
            result[column.name] = value
        return result
    if isinstance(obj, list):
        return [serialize_for_log(item) for item in obj]
    if isinstance(obj, dict):
        return {k: serialize_for_log(v) for k, v in obj.items()}
    return obj


def log_action(
    db,
    user_id: int,
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> Optional[AuditLog]:
    """Записывает действие в audit log.

    Args:
        db: SQLAlchemy сессия
        user_id: ID пользователя, совершившего действие
        action: Тип действия (created, updated, deleted, etc.)
        entity_type: Тип сущности (request, work, user, etc.)
        entity_id: ID сущности (если применимо)
        old_values: Значения до изменения (сериализованные в dict)
        new_values: Значения после изменения (сериализованные в dict)
        ip_address: IP адрес пользователя (опционально)

    Returns:
        AuditLog объект или None при ошибке
    """
    try:
        log_entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=serialize_for_log(old_values),
            new_values=serialize_for_log(new_values),
            ip_address=ip_address,
            created_at=datetime.utcnow(),
        )
        db.add(log_entry)
        db.flush()
        return log_entry
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")
        # Не прерываем основную операцию при ошибке логирования
        return None
