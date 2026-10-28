# AGENTS_DEPLOY.md — Справка по запуску, тестированию и деплою

> Инструкции для AI-агентов по локальному запуску, тестированию и развёртыванию CRM АХЧ.

---

## Конфигурация

Настройки читаются из `backend/.env` через `pydantic-settings` (`backend/app/core/config.py`).

Ключевые переменные:

- `DATABASE_URL` — подключение к PostgreSQL
- `SECRET_KEY` — ключ для подписи JWT (минимум 32 символа)
- `UPLOAD_DIR` — абсолютный путь к директории uploads
- `ALLOWED_ORIGINS` — список CORS-источников через запятую
- `ACCESS_TOKEN_EXPIRE_MINUTES` — время жизни JWT. Дефолт в коде (`backend/app/core/config.py`) — 43200 минут (30 дней); фактическое значение задаётся в `backend/.env`.
- `MAX_FILE_SIZE` — максимальный размер файла (по умолчанию 10 МБ)
- `MAX_PHOTO_SIZE` — максимальный размер фото после сжатия (по умолчанию 1 МБ)
- `MAX_PHOTOS_PER_WORK` — максимум фото на одну работу (по умолчанию 20)
- `APP_NAME` — название приложения (по умолчанию "CRM АХЧ")
- `DEBUG` — режим отладки (по умолчанию False)

---

## Backend (локально)

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Перед первым запуском — применить миграции
alembic upgrade head

# Запуск в режиме разработки
uvicorn app.main:app --reload --port 8090
```

---

## Frontend (локально)

```bash
cd frontend
npm install
npm run dev          # dev-сервер Vite (обычно http://localhost:5173)
npm run build        # продакшен-сборка в dist/
npm run lint         # проверка ESLint
npm run preview      # превью продакшен-сборки
```

**API-URL:** задаётся через `VITE_API_URL`. В продакшене `frontend/.env` содержит `VITE_API_URL=/api`.

---

## Docker Compose

**Не используется и не поддерживается.** В репозитории нет Dockerfile для backend/frontend, поэтому `docker-compose.yml` неработоспособен и существует только как исторический артефакт. Реальный продакшен разворачивается по схеме «systemd + nginx + venv/npm» (см. ниже и `docs/deployment.md`).

---

## Тестирование

Backend-тесты на FastAPI `TestClient` находятся в `backend/tests/`.

```bash
cd backend
source venv/bin/activate
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/ -v
```

Рекомендации:

- Backend: `pytest` + `httpx`/`TestClient` из FastAPI + `pytest-asyncio`.
- Frontend: `vitest` + `@testing-library/react`.
- Перед PR запускать `npm run lint` для frontend.

---

## Деплой

Полная инструкция — в `docs/deployment.md`. Кратко:

1. На сервере код находится в `/home/dimon64515/projects/crm` (владелец `dimon64515`). Путь `/var/www/crm` — устаревшая мёртвая копия, не используется.
2. Backend запускается systemd-сервисом `crm-backend.service` от пользователя `dimon64515` (uvicorn на `127.0.0.1:8090`, health-check `GET /api/health`).
3. Nginx раздаёт статику из `frontend/dist` и проксирует `/api/` на backend (`127.0.0.1:8090`). Активный конфиг — `/etc/nginx/sites-enabled/report.fanat-mv.ru`, эталон в репозитории — `docs/nginx-report.fanat-mv.ru.conf`.
4. SSL — Let's Encrypt (certbot, автопродление через `certbot.timer`).
5. БД — PostgreSQL 16, только localhost (`5432`), креды в `backend/.env` (права 600).
6. Обновление (деплой) — единым скриптом `./scripts/deploy.sh` из корня репозитория (опции `--backend-only`, `--frontend-only`); подробности и ручной fallback — в `docs/deployment.md`, раздел «Обновление системы».
7. Бэкапы БД: ежедневный pg_dump в 03:47 (cron `/etc/cron.d/crm-db-backup`, скрипт `/usr/local/sbin/crm-db-backup.sh`) → `/var/backups/crm/`, ротация 14, лог `backup.log`. Полные бэкапы (БД + файлы) — через UI приложения в `uploads/backups/`.

---

## Безопасность

- **JWT Secret Key** должен быть случайным и длиной не менее 32 символов. Хранится только в `backend/.env`.
- **Пароли** хранятся только в виде bcrypt-хешей.
- **Загрузка файлов:** для фото проверяется `content_type`; для импорта справочников проверяется расширение `.xlsx`.
- **CORS:** в продакшене `ALLOWED_ORIGINS` должен содержать только продакшен-домен.
- **Файлы `.env`:** `backend/.env` и `frontend/.env` исключены из коммитов.
- **Авторизация:** токен хранится в `localStorage`; при 401 выполняется редирект на `/login`.
