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
- `ACCESS_TOKEN_EXPIRE_MINUTES` — время жизни JWT (по умолчанию 1440 = 24 часа)
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

```bash
docker-compose up -d
```

Конфигурация поднимает PostgreSQL (порт 5432), backend (порт 8090) и frontend (порт 3000). **Внимание:** в репозитории отсутствуют Dockerfile для backend и frontend, поэтому для `docker-compose build` потребуется предварительно добавить их.

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

1. На сервере в `/var/www/crm/` размещаются `frontend/dist`, `backend/app`, `uploads/`.
2. Nginx раздаёт статику фронтенда и проксирует `/api/` на backend (`localhost:8090`).
3. Backend запускается через systemd-сервис `crm-backend.service` (uvicorn на `127.0.0.1:8090`).
4. SSL — Let's Encrypt (certbot).
5. PostgreSQL слушает только localhost (`5432`).
6. Обновление backend: `git pull → pip install → alembic upgrade head → systemctl restart crm-backend`.
7. Обновление frontend: `git pull → npm install → npm run build`.

---

## Безопасность

- **JWT Secret Key** должен быть случайным и длиной не менее 32 символов. Хранится только в `backend/.env`.
- **Пароли** хранятся только в виде bcrypt-хешей.
- **Загрузка файлов:** для фото проверяется `content_type`; для импорта справочников проверяется расширение `.xlsx`.
- **CORS:** в продакшене `ALLOWED_ORIGINS` должен содержать только продакшен-домен.
- **Файлы `.env`:** `backend/.env` и `frontend/.env` исключены из коммитов.
- **Авторизация:** токен хранится в `localStorage`; при 401 выполняется редирект на `/login`.
