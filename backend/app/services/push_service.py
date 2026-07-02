import json
import logging

from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import PushSubscription, User

logger = logging.getLogger(__name__)
settings = get_settings()


def send_push(subscription: PushSubscription, title: str, body: str, link: str) -> tuple[bool, bool]:
    """Отправляет push-уведомление на одну подписку.

    Возвращает кортеж (успех, мёртвая_подписка):
    - успех — True, если уведомление доставлено;
    - мёртвая_подписка — True, если сервер ответил 404 или 410
      и подписку следует удалить.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return False, False

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
        return True, False
    except WebPushException as e:
        logger.warning(f"Ошибка отправки push для подписки {subscription.id}: {e}")
        status_code = getattr(getattr(e, "response", None), "status_code", None)
        is_dead = status_code in (404, 410)
        return False, is_dead


def send_push_to_users(db: Session, user_ids: list[int], title: str, body: str, link: str) -> None:
    """Отправляет уведомление указанным пользователям и удаляет только мёртвые подписки (404/410)."""
    subs = db.query(PushSubscription).filter(PushSubscription.user_id.in_(user_ids)).all()
    dead = []
    for sub in subs:
        ok, is_dead = send_push(sub, title, body, link)
        if is_dead:
            dead.append(sub.id)
        elif not ok:
            # Временные ошибки не удаляем, просто пропускаем.
            continue
    if dead:
        db.query(PushSubscription).filter(PushSubscription.id.in_(dead)).delete(synchronize_session=False)
        db.commit()


def send_push_to_roles(db: Session, roles: list[str], title: str, body: str, link: str) -> None:
    """Отправляет уведомление всем активным пользователям с указанными ролями."""
    user_ids = [u.id for u in db.query(User.id).filter(User.role.in_(roles), User.is_active == True).all()]
    if user_ids:
        send_push_to_users(db, user_ids, title, body, link)
