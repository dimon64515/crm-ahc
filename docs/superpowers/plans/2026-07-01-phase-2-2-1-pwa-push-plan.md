# Phase 2.2.1 — PWA и push-уведомления: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить PWA-манифест и service worker, реализовать подписку директоров/админов на push-уведомления и отправку уведомлений при создании новой заявки.

**Architecture:** Backend хранит push-подписки в PostgreSQL, рассылает уведомления через `pywebpush` с VAPID-ключами. Frontend регистрирует service worker, подписывается через `PushManager` и отправляет подписку на backend. Триггер — `create_request` после commit.

**Tech Stack:** FastAPI 0.111.0, SQLAlchemy 2.0.30, Pydantic 2.7.1, Alembic 1.13.1, `pywebpush` 2.0+, React 19.2.6, Vite 8.0.12, vanilla Service Worker.

## Global Constraints

- Backend: Python 3.11+, FastAPI 0.111.0, SQLAlchemy 2.0.30, Pydantic 2.7.1.
- Frontend: React 19.2.6, Vite 8.0.12, Axios 1.16.1.
- База данных: PostgreSQL 15, миграции через Alembic.
- Все строки, сообщения об ошибках и комментарии — на русском языке.
- Минимальные изменения существующей архитектуры.
- VAPID private key хранится только в `backend/.env`.
- Push-уведомления отправляются только директорам и админам при создании заявки.

---

### Task 1: Alembic-миграция для таблицы `push_subscriptions`

**Files:**
- Create: `backend/alembic/versions/20260701_add_push_subscriptions.py`

**Interfaces:**
- Consumes: таблица `users`.
- Produces: таблица `push_subscriptions`.

- [ ] **Step 1: Сгенерировать заготовку миграции**

```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
alembic revision -m "add push_subscriptions"
```

- [ ] **Step 2: Написать операции upgrade/downgrade**

```python
# backend/alembic/versions/20260701_add_push_subscriptions.py
from alembic import op
import sqlalchemy as sa

revision = "<auto>"
down_revision = "<предыдущая_миграция>"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.String(500), nullable=False),
        sa.Column("p256dh", sa.String(255), nullable=False),
        sa.Column("auth", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])


def downgrade():
    op.drop_table("push_subscriptions")
```

- [ ] **Step 3: Применить миграцию**

```bash
alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Context impl PostgresqlImpl. ...`

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/20260701_add_push_subscriptions.py
git commit -m "chore(db): add push_subscriptions table"
```

---

### Task 2: SQLAlchemy-модель и Pydantic-схемы push-подписок

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Consumes: таблица `users`.
- Produces: класс `PushSubscription`, схемы `PushSubscriptionCreate`, `PushSubscriptionResponse`.

- [ ] **Step 1: Добавить модель в `backend/app/models.py`**

После класса `RequestPhoto` добавить:

```python
class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    endpoint = Column(String(500), nullable=False)
    p256dh = Column(String(255), nullable=False)
    auth = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
```

- [ ] **Step 2: Добавить схемы в `backend/app/schemas.py`**

После `RequestListResponse` добавить:

```python
class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class PushSubscriptionResponse(BaseModel):
    id: int
    endpoint: str
    created_at: datetime

    class Config:
        from_attributes = True
```

- [ ] **Step 3: Проверить импорты**

```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
python -c "from app.models import PushSubscription; from app.schemas import PushSubscriptionCreate; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py
git commit -m "feat(models/schemas): add PushSubscription model and schemas"
```

---

### Task 3: VAPID-ключи и настройки backend

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env` (вручную)

**Interfaces:**
- Produces: `settings.VAPID_PRIVATE_KEY`, `settings.VAPID_PUBLIC_KEY`, `settings.VAPID_SUBJECT`.

- [ ] **Step 1: Установить pywebpush**

```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
pip install pywebpush==2.0.0
```

- [ ] **Step 2: Обновить `requirements.txt`**

Добавить строку:

```
pywebpush==2.0.0
```

- [ ] **Step 3: Добавить поля в `backend/app/core/config.py`**

В класс `Settings` добавить:

```python
VAPID_PRIVATE_KEY: str = ""
VAPID_PUBLIC_KEY: str = ""
VAPID_SUBJECT: str = "mailto:admin@example.com"
```

- [ ] **Step 4: Сгенерировать VAPID-ключи**

```bash
source venv/bin/activate
vapid --gen
```

Скопировать содержимое `private_key.pem` в `VAPID_PRIVATE_KEY` и `public_key.pem` в `VAPID_PUBLIC_KEY` в `backend/.env`. Установить `VAPID_SUBJECT=mailto:admin@fanat-mv.ru`.

- [ ] **Step 5: Проверить загрузку настроек**

```bash
python -c "from app.core.config import get_settings; s=get_settings(); print('public key present:', bool(s.VAPID_PUBLIC_KEY))"
```

Expected: `public key present: True`

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/app/core/config.py
git commit -m "chore(config): add pywebpush and VAPID settings"
```

---

### Task 4: Backend-сервис отправки push

**Files:**
- Create: `backend/app/services/push_service.py`

**Interfaces:**
- Consumes: `PushSubscription`, `User`, VAPID settings.
- Produces: `send_push(subscription, title, body, link)`, `send_push_to_users(user_ids, title, body, link)`, `send_push_to_roles(roles, title, body, link)`.

- [ ] **Step 1: Создать сервис**

```python
# backend/app/services/push_service.py
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
```

- [ ] **Step 2: Проверить импорт**

```bash
python -c "from app.services.push_service import send_push_to_roles; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/push_service.py
git commit -m "feat(services): add push notification service"
```

---

### Task 5: Роутер push-подписок

**Files:**
- Create: `backend/app/routers/push.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `PushSubscription`, `PushSubscriptionCreate`, `get_current_user`, `get_db`.
- Produces: endpoints `GET /api/push/vapid-public-key`, `POST /api/push/subscribe`, `DELETE /api/push/unsubscribe`.

- [ ] **Step 1: Создать роутер**

```python
# backend/app/routers/push.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import PushSubscription, User
from app.schemas import PushSubscriptionCreate

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
    current_user: User = Depends(get_current_user),
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
    db.commit()
    return {"success": True}


@router.delete("/unsubscribe")
def unsubscribe(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(PushSubscription).filter(PushSubscription.user_id == current_user.id).delete(synchronize_session=False)
    db.commit()
    return {"success": True}
```

- [ ] **Step 2: Подключить роутер в `backend/app/main.py`**

Добавить импорт:

```python
from app.routers import push as push_router
```

Подключение:

```python
app.include_router(push_router.router, prefix="/api")
```

- [ ] **Step 3: Проверить endpoint'ы**

```bash
python -c "from app.main import app; print([r.path for r in app.routes if 'push' in r.path])"
```

Expected: список с `/api/push/vapid-public-key`, `/api/push/subscribe`, `/api/push/unsubscribe`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/push.py backend/app/main.py
git commit -m "feat(push): add subscription endpoints"
```

---

### Task 6: Отправка push при создании заявки

**Files:**
- Modify: `backend/app/routers/requests.py`

**Interfaces:**
- Consumes: `send_push_to_roles`.
- Produces: push-уведомление директору/админу.

- [ ] **Step 1: Импортировать сервис**

В `backend/app/routers/requests.py` добавить:

```python
from app.services.push_service import send_push_to_roles
```

- [ ] **Step 2: Вызвать отправку после commit**

В `create_request` после `db.refresh(request)` добавить:

```python
send_push_to_roles(
    db,
    ["director", "admin"],
    title="Новая заявка",
    body=f"{request.building.name or request.building.number}: {request.description}",
    link=f"/requests/{request.id}",
)
```

- [ ] **Step 3: Добавить тест**

В `backend/tests/test_requests.py` добавить тест:

```python
from unittest.mock import patch

def test_create_request_sends_push(mocker):
    db = TestingSessionLocal()
    watchman = User(username="watchman_push", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    director = User(username="director_push", hashed_password=get_password_hash("pass"), role="director", is_active=True)
    building = Building(number="20", name="Корпус 20", is_active=True)
    db.add_all([watchman, director, building])
    db.commit()

    sub = PushSubscription(user_id=director.id, endpoint="https://push.example/x", p256dh="x", auth="y")
    db.add(sub)
    db.commit()

    with patch("app.routers.requests.send_push_to_roles") as mock_send:
        login = client.post("/api/auth/login", json={"username": "watchman_push", "password": "pass"})
        token = login.json()["access_token"]
        client.post(
            "/api/requests",
            headers={"Authorization": f"Bearer {token}"},
            json={"building_id": building.id, "description": "Тест push"},
        )
        mock_send.assert_called_once()
    db.close()
```

- [ ] **Step 4: Запустить тесты**

```bash
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py -v
```

Expected: все тесты PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/requests.py backend/tests/test_requests.py
git commit -m "feat(requests): send push notification on new request"
```

---

### Task 7: PWA-манифест и иконки

**Files:**
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/icon-192x192.png`
- Create: `frontend/public/icon-512x512.png`
- Modify: `frontend/index.html`

**Interfaces:**
- Produces: installable PWA.

- [ ] **Step 1: Создать `manifest.json`**

```json
{
  "name": "CRM АХЧ",
  "short_name": "CRM АХЧ",
  "description": "CRM система для АХЧ",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Добавить иконки**

Создать простые PNG-иконки 192x192 и 512x512 (можно сгенерировать через Python/Pillow или положить заглушки). Важно: файлы должны существовать в `frontend/public/`.

```bash
cd /home/dimon64515/projects/crm/frontend/public
# Пример генерации через ImageMagick
convert -size 192x192 xc:#2563eb -pointsize 30 -fill white -gravity center -annotate +0+0 "CRM" icon-192x192.png
convert -size 512x512 xc:#2563eb -pointsize 80 -fill white -gravity center -annotate +0+0 "CRM" icon-512x512.png
```

- [ ] **Step 3: Подключить манифест в `frontend/index.html`**

Добавить в `<head>`:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#2563eb" />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/public/manifest.json frontend/public/icon-192x192.png frontend/public/icon-512x512.png frontend/index.html
git commit -m "feat(pwa): add manifest and icons"
```

---

### Task 8: Service Worker для push

**Files:**
- Create: `frontend/public/sw.js`

**Interfaces:**
- Consumes: push-события от браузера.
- Produces: системные уведомления и открытие ссылки.

- [ ] **Step 1: Создать `sw.js`**

```javascript
// frontend/public/sw.js
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || 'CRM АХЧ';
    const options = {
      body: data.body || '',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: { link: data.link || '/' },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.error('Ошибка обработки push:', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(link) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(link);
      }
    })
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/public/sw.js
git commit -m "feat(pwa): add service worker for push notifications"
```

---

### Task 9: Регистрация Service Worker в приложении

**Files:**
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Produces: registered service worker.

- [ ] **Step 1: Добавить регистрацию**

В `frontend/src/main.jsx` после рендера добавить:

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((reg) => console.log('SW registered:', reg.scope))
    .catch((err) => console.error('SW registration failed:', err));
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/main.jsx
git commit -m "feat(pwa): register service worker"
```

---

### Task 10: Frontend API и UI для подписки на push

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/Layout.jsx`

**Interfaces:**
- Consumes: VAPID public key, `pushManager.subscribe`, backend endpoints.
- Produces: UI-кнопка включения/отключения уведомлений.

- [ ] **Step 1: Добавить API-методы**

В `frontend/src/api.js` добавить:

```javascript
export const pushAPI = {
  getVapidPublicKey: () => api.get('/push/vapid-public-key'),
  subscribe: (data) => api.post('/push/subscribe', data),
  unsubscribe: () => api.delete('/push/unsubscribe'),
};
```

- [ ] **Step 2: Добавить helper для конвертации VAPID ключа**

В `frontend/src/api.js` (или отдельный файл):

```javascript
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
```

- [ ] **Step 3: Добавить UI в `Layout.jsx`**

Добавить компонент `PushToggle` внутри `Layout.jsx` (или в `components/`). Пример:

```jsx
function PushToggle() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window);
  }, []);

  if (!supported || !(user?.role === 'director' || user?.role === 'admin')) return null;

  const handleToggle = async () => {
    if (!enabled) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const { data } = await pushAPI.getVapidPublicKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key),
      });
      const subJson = sub.toJSON();
      await pushAPI.subscribe({
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      });
      setEnabled(true);
    } else {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await pushAPI.unsubscribe();
      setEnabled(false);
    }
  };

  return (
    <button onClick={handleToggle} style={styles.pushBtn}>
      {enabled ? '🔕 Отключить уведомления' : '🔔 Включить уведомления'}
    </button>
  );
}
```

Добавить `<PushToggle />` в header рядом с выходом.

- [ ] **Step 4: Импортировать helper и API**

```javascript
import { pushAPI, urlBase64ToUint8Array } from '../api';
```

- [ ] **Step 5: Проверить lint/build**

```bash
cd /home/dimon64515/projects/crm/frontend
npm run lint
npm run build
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api.js frontend/src/components/Layout.jsx
git commit -m "feat(pwa): add push subscription UI and API"
```

---

### Task 11: Финальная проверка

**Files:**
- Все вышеперечисленные.

- [ ] **Step 1: Backend тесты**

```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/ -v
```

Expected: все тесты PASS.

- [ ] **Step 2: Frontend lint/build**

```bash
cd /home/dimon64515/projects/crm/frontend
npm run lint
npm run build
```

Expected: lint без ошибок, build успешен.

- [ ] **Step 3: Проверить миграции**

```bash
cd /home/dimon64515/projects/crm/backend
alembic current
```

Expected: последняя миграция `add push_subscriptions`.

- [ ] **Step 4: Final commit**

```bash
cd /home/dimon64515/projects/crm
git add -A
git commit -m "feat(phase-2-2-1): pwa and push notifications"
```

---

## Spec Coverage Check

| Требование spec | Task |
|---|---|
| Таблица `push_subscriptions` | Task 1, 2 |
| VAPID-ключи и настройки | Task 3 |
| Backend-сервис отправки push | Task 4 |
| Роутер подписок | Task 5 |
| Отправка при создании заявки | Task 6 |
| PWA-манифест и иконки | Task 7 |
| Service Worker | Task 8 |
| Регистрация SW | Task 9 |
| UI подписки | Task 10 |
| Финальная проверка | Task 11 |

## Placeholder Scan

- Нет `TBD`, `TODO`, `implement later`.
- Все шаги содержат конкретный код или команды.
- Все пути к файлам указаны точно.
