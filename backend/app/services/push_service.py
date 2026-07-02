import json
import logging

from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import PushSubscription, User

logger = logging.getLogger(__name__)
settings = get_settings()


def send_push(subscription: PushSubscription, title: str, body: str, link: str) -> bool:
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return False

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                },
            },
            data=json.dumps({"title": title, "body": body, "link": link}),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
        )
        return True
    except WebPushException as e:
        logger.warning(f"Push failed for subscription {subscription.id}: {e}")
        if e.response and e.response.status_code in (404, 410):
            return False
        return False


def send_push_to_users(db: Session, user_ids: list[int], title: str, body: str, link: str) -> None:
    subs = db.query(PushSubscription).filter(PushSubscription.user_id.in_(user_ids)).all()
    dead = []
    for sub in subs:
        ok = send_push(sub, title, body, link)
        if not ok:
            dead.append(sub.id)
    if dead:
        db.query(PushSubscription).filter(PushSubscription.id.in_(dead)).delete(synchronize_session=False)
        db.commit()


def send_push_to_roles(db: Session, roles: list[str], title: str, body: str, link: str) -> None:
    user_ids = [u.id for u in db.query(User.id).filter(User.role.in_(roles), User.is_active == True).all()]
    if user_ids:
        send_push_to_users(db, user_ids, title, body, link)
