from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import require_director
from app.database import get_db
from app.models import PushSubscription, User
from app.schemas import PushSubscriptionCreate, PushSubscriptionUnsubscribe

router = APIRouter(prefix="/push", tags=["push"])
settings = get_settings()


@router.get("/vapid-public-key")
def vapid_public_key():
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=500, detail="VAPID public key не настроен")
    return {"public_key": settings.VAPID_PUBLIC_KEY}


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
