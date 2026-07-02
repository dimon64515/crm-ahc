import base64

from cryptography.hazmat.primitives import serialization
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import require_director
from app.database import get_db
from app.models import PushSubscription, User
from app.schemas import PushSubscriptionCreate, PushSubscriptionUnsubscribe
from app.services.push_service import send_push_to_roles

router = APIRouter(prefix="/push", tags=["push"])
settings = get_settings()


def _public_key_to_base64url(pem_key: str) -> str:
    """Конвертирует PEM-публичный ключ VAPID в формат base64url для PushManager."""
    public_key = serialization.load_pem_public_key(pem_key.encode("utf-8"))
    raw = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


@router.get("/vapid-public-key")
def vapid_public_key():
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=500, detail="VAPID public key не настроен")
    try:
        public_key = _public_key_to_base64url(settings.VAPID_PUBLIC_KEY)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Некорректный VAPID public key: {e}")
    return {"public_key": public_key}


@router.post("/subscribe")
def subscribe(
    data: PushSubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    existing = db.query(PushSubscription).filter(
        PushSubscription.user_id == current_user.id,
        PushSubscription.endpoint == data.endpoint,
    ).first()
    if existing:
        existing.p256dh = data.p256dh
        existing.auth = data.auth
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=data.endpoint,
            p256dh=data.p256dh,
            auth=data.auth,
        )
        db.add(sub)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(PushSubscription).filter(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == data.endpoint,
        ).first()
        if existing:
            existing.p256dh = data.p256dh
            existing.auth = data.auth
            db.commit()
        else:
            raise

    return {"success": True}


@router.delete("/unsubscribe")
def unsubscribe(
    data: PushSubscriptionUnsubscribe,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    db.query(PushSubscription).filter(
        PushSubscription.user_id == current_user.id,
        PushSubscription.endpoint == data.endpoint,
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True}


@router.post("/test-send")
def test_send_push(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    """Отправляет тестовое push-уведомление всем подписчикам director/admin."""
    send_push_to_roles(
        db,
        ["director", "admin"],
        title="Тестовое уведомление",
        body=f"Отправлено пользователем {current_user.username}",
        link="/requests",
    )
    return {"success": True}
