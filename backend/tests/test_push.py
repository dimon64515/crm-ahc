from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from pywebpush import WebPushException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import get_password_hash
from app.database import Base, get_db
from app.main import app
from app.models import PushSubscription, User
from app.services.push_service import send_push_to_users

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_push.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

client = TestClient(app)
_old_db_override = None


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def setup_module():
    global _old_db_override
    _old_db_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)


def teardown_module():
    global _old_db_override
    Base.metadata.drop_all(bind=engine)
    if _old_db_override is not None:
        app.dependency_overrides[get_db] = _old_db_override
    else:
        app.dependency_overrides.pop(get_db, None)


def _create_director(db, username):
    user = User(
        username=username,
        hashed_password=get_password_hash("pass"),
        role="director",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login_director(username):
    login = client.post("/api/auth/login", json={"username": username, "password": "pass"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def test_vapid_public_key_returns_key_when_configured():
    import app.routers.push as push_module

    old_key = push_module.settings.VAPID_PUBLIC_KEY
    push_module.settings.VAPID_PUBLIC_KEY = "test-public-key"
    try:
        response = client.get("/api/push/vapid-public-key")
        assert response.status_code == 200, response.text
        assert response.json() == {"public_key": "test-public-key"}
    finally:
        push_module.settings.VAPID_PUBLIC_KEY = old_key


def test_vapid_public_key_returns_500_when_not_configured():
    import app.routers.push as push_module

    old_key = push_module.settings.VAPID_PUBLIC_KEY
    push_module.settings.VAPID_PUBLIC_KEY = ""
    try:
        response = client.get("/api/push/vapid-public-key")
        assert response.status_code == 500, response.text
        assert "VAPID public key" in response.json()["detail"]
    finally:
        push_module.settings.VAPID_PUBLIC_KEY = old_key


def test_subscribe_creates_subscription():
    with TestingSessionLocal() as db:
        user = _create_director(db, "director_push_create")
        token = _login_director("director_push_create")

        response = client.post(
            "/api/push/subscribe",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "endpoint": "https://push.example/1",
                "p256dh": "p256dh-value",
                "auth": "auth-value",
            },
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"success": True}

        subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
        assert len(subs) == 1
        assert subs[0].endpoint == "https://push.example/1"


def test_subscribe_updates_existing_subscription():
    with TestingSessionLocal() as db:
        user = _create_director(db, "director_push_update")
        existing = PushSubscription(
            user_id=user.id,
            endpoint="https://push.example/2",
            p256dh="old-p256dh",
            auth="old-auth",
        )
        db.add(existing)
        db.commit()

        token = _login_director("director_push_update")
        response = client.post(
            "/api/push/subscribe",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "endpoint": "https://push.example/2",
                "p256dh": "new-p256dh",
                "auth": "new-auth",
            },
        )
        assert response.status_code == 200, response.text

        subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
        assert len(subs) == 1
        assert subs[0].p256dh == "new-p256dh"
        assert subs[0].auth == "new-auth"


def test_unsubscribe_removes_all_user_subscriptions():
    with TestingSessionLocal() as db:
        user = _create_director(db, "director_push_unsubscribe")
        db.add_all(
            [
                PushSubscription(
                    user_id=user.id,
                    endpoint="https://push.example/a",
                    p256dh="a",
                    auth="a",
                ),
                PushSubscription(
                    user_id=user.id,
                    endpoint="https://push.example/b",
                    p256dh="b",
                    auth="b",
                ),
            ]
        )
        db.commit()

        token = _login_director("director_push_unsubscribe")
        response = client.delete(
            "/api/push/unsubscribe",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"success": True}

        subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
        assert len(subs) == 0


def test_send_push_to_users_deletes_dead_subscriptions_and_keeps_others():
    import app.services.push_service as push_service_module

    old_private = push_service_module.settings.VAPID_PRIVATE_KEY
    old_public = push_service_module.settings.VAPID_PUBLIC_KEY
    push_service_module.settings.VAPID_PRIVATE_KEY = "private"
    push_service_module.settings.VAPID_PUBLIC_KEY = "public"
    try:
        with TestingSessionLocal() as db:
            user = User(
                username="push_receiver",
                hashed_password=get_password_hash("pass"),
                role="director",
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            sub_ok = PushSubscription(
                user_id=user.id,
                endpoint="https://push.example/ok",
                p256dh="p256dh-ok",
                auth="auth-ok",
            )
            sub_404 = PushSubscription(
                user_id=user.id,
                endpoint="https://push.example/404",
                p256dh="p256dh-404",
                auth="auth-404",
            )
            sub_410 = PushSubscription(
                user_id=user.id,
                endpoint="https://push.example/410",
                p256dh="p256dh-410",
                auth="auth-410",
            )
            sub_500 = PushSubscription(
                user_id=user.id,
                endpoint="https://push.example/500",
                p256dh="p256dh-500",
                auth="auth-500",
            )
            db.add_all([sub_ok, sub_404, sub_410, sub_500])
            db.commit()

            def fake_webpush(subscription_info, **kwargs):
                endpoint = subscription_info["endpoint"]
                if endpoint.endswith("/ok"):
                    return None
                if endpoint.endswith("/404"):
                    raise WebPushException("Not Found", response=SimpleNamespace(status_code=404))
                if endpoint.endswith("/410"):
                    raise WebPushException("Gone", response=SimpleNamespace(status_code=410))
                if endpoint.endswith("/500"):
                    raise WebPushException("Server Error", response=SimpleNamespace(status_code=500))
                raise WebPushException("Unexpected")

            with patch("app.services.push_service.webpush", side_effect=fake_webpush):
                send_push_to_users(db, [user.id], "Тест", "Тело", "/requests/1")

            remaining = {
                sub.endpoint
                for sub in db.query(PushSubscription)
                .filter(PushSubscription.user_id == user.id)
                .all()
            }
            assert remaining == {"https://push.example/ok", "https://push.example/500"}
    finally:
        push_service_module.settings.VAPID_PRIVATE_KEY = old_private
        push_service_module.settings.VAPID_PUBLIC_KEY = old_public
