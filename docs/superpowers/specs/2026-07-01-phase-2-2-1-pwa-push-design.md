# Phase 2.2.1 — PWA и push-уведомления: дизайн

## Цель

Добавить в CRM АХЧ возможность установить приложение на главный экран (PWA) и получать push-уведомления о новых заявках для ролей `director` и `admin`.

## Scope

- PWA: манифест, иконки, theme-color, viewport.
- Service Worker: регистрация, обработка `push` и `notificationclick`.
- Push-подписка: frontend запрашивает permission, подписывается через `PushManager`, отправляет подписку на backend.
- Push-отправка: backend хранит подписки, рассылает уведомления при создании заявки.
- Триггер: событие «создана новая заявка» → уведомление директору и админу.

## Что НЕ входит

- Офлайн-работа приложения (кэширование статики — только для PWA installability).
- Push по другим событиям (взята/завершена/назначена) — out of scope для 2.2.1.
- Email-уведомления и печатные формы — отдельные этапы 2.2.2 и 2.2.3.

## Архитектура

### Backend

**Новая таблица** `push_subscriptions`:

| Поле | Тип | Описание |
|------|-----|----------|
| id | Integer PK | |
| user_id | Integer FK → users.id | Кому принадлежит подписка |
| endpoint | String | URL push-сервиса браузера |
| p256dh | String | Публичный ключ подписки |
| auth | String | Auth secret подписки |
| created_at | DateTime | |

**Модель** `PushSubscription` в `backend/app/models.py`.

**Схемы** в `backend/app/schemas.py`:
- `PushSubscriptionCreate` — endpoint, p256dh, auth.
- `PushSubscriptionResponse` — id, endpoint (без auth).

**Роутер** `backend/app/routers/push.py`:
- `POST /api/push/subscribe` — сохранить/обновить подписку текущего пользователя.
- `DELETE /api/push/unsubscribe` — удалить подписку текущего пользователя.
- `GET /api/push/vapid-public-key` — отдать VAPID public key.

**Сервис** `backend/app/services/push_service.py`:
- `send_push_to_users(user_ids: list[int], title: str, body: str, link: str)` — выбирает подписки, шлёт через `pywebpush`, удаляет "мертвые" (410/404).
- `send_push_to_roles(roles: list[str], ...)` — обёртка над ролями.

**Интеграция** — в `backend/app/routers/requests.py::create_request` после `db.commit()` вызываем `send_push_to_roles(["director", "admin"], title="Новая заявка", body=request.description, link=f"/requests/{request.id}")`.

**VAPID**:
- Генерация ключей: `vapid --gen` (или через Python `py_vapid`).
- Private key — `backend/.env` (`VAPID_PRIVATE_KEY`).
- Public key — `backend/.env` (`VAPID_PUBLIC_KEY`) и отдаётся frontend.
- Subject — `mailto:` или `https://report.fanat-mv.ru` (`VAPID_SUBJECT`).

### Frontend

**PWA манифест** `frontend/public/manifest.json`:
- `name`: "CRM АХЧ"
- `short_name`: "CRM"
- `start_url`: "/"
- `display`: "standalone"
- `theme_color`: "#2563eb"
- `background_color`: "#ffffff"
- `icons`: 192x192, 512x512 (SVG/PNG).

**Service Worker** `frontend/public/sw.js`:
- `self.addEventListener('push', ...)` — показать `Notification` с title/body/link.
- `self.addEventListener('notificationclick', ...)` — открыть/фокусировать клиента и перейти по `link`.

**Регистрация SW** в `frontend/src/main.jsx`:
- `navigator.serviceWorker.register('/sw.js')` в production-сборке (условно, если `'serviceWorker' in navigator`).

**API методы** в `frontend/src/api.js`:
- `pushAPI.subscribe(data)` → POST `/push/subscribe`
- `pushAPI.unsubscribe()` → DELETE `/push/unsubscribe`
- `pushAPI.getVapidPublicKey()` → GET `/push/vapid-public-key`

**UI**:
- В `Layout.jsx` добавить кнопку «Включить уведомления» (или иконку колокольчика) для `director`/`admin`.
- При клике:
  1. `Notification.requestPermission()`.
  2. Получить VAPID public key.
  3. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
  4. Отправить endpoint/p256dh/auth на backend.
- При отказе/отключении — `pushManager.unsubscribe()` + DELETE на backend.

## Поток данных

1. Пользователь (director/admin) открывает сайт, нажимает «Включить уведомления».
2. Браузер запрашивает разрешение, создаёт push-подписку.
3. Frontend POST `/api/push/subscribe` с данными подписки.
4. Backend сохраняет подписку в `push_subscriptions`.
5. Вахтёр создаёт заявку через `POST /api/requests`.
6. Backend после commit вызывает `send_push_to_roles(["director", "admin"], ...)`.
7. `pywebpush` шлёт уведомления всем активным подпискам.
8. Service worker на устройствах пользователей ловит `push` и показывает системное уведомление.

## Безопасность

- VAPID private key только в `.env` backend.
- Подписка привязана к авторизованному пользователю через JWT.
- Endpoint и ключи подписки не считаются секретными, но возвращаем их только владельцу.
- При 410/404 от push-сервера подписка удаляется из БД.

## Технологический стек

- Backend: Python 3.11, FastAPI, SQLAlchemy, `pywebpush` 2.0+.
- Frontend: React 19, Vite 8, vanilla Service Worker (без дополнительных библиотек).

## Тестирование

- Backend: pytest с моком `webpush` из `pywebpush`, проверка создания/удаления подписки.
- Frontend: `npm run lint && npm run build`.
- Ручное тестирование: включить уведомления, создать заявку, убедиться что пришло push.

## Риски и ограничения

- iOS Safari поддерживает push только начиная с iOS 16.4 и только для установленных на экран PWA.
- Push не дойдёт, если пользователь не дал разрешение.
- Service Worker не работает в режиме Vite dev по HTTPS? Работает по HTTP на localhost; для внешнего IP требуется HTTPS. Для тестирования на сервере — через Nginx/HTTPS.

## Примечание по dev-окружению

- В dev (localhost) push работает по HTTP.
- На сервере (report.fanat-mv.ru) push требует HTTPS и установленного домена.
