# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Проект

CRM-система для заместителя директора по АХЧ — учёт работ подрядчиков на корпусах, управление справочниками, отчётность. Продакшен: `https://report.fanat-mv.ru`

**ВАЖНО:** Весь код, документация, UI и пользовательские запросы — на **русском языке**.

## Стек

- **Frontend:** React 19.2 + Vite 8.0 + React Router 7.15
- **Backend:** Python 3.11 + FastAPI 0.111 + SQLAlchemy 2.0
- **База данных:** PostgreSQL 15
- **Аутентификация:** JWT (python-jose)

## Команды разработки

### Backend
```bash
cd backend
pip install -r requirements.txt
alembic upgrade head        # Применить миграции
uvicorn app.main:app --reload --port 8090
```

### Frontend
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
npm run build               # Сборка в dist/
npm run lint                # ESLint
```

### Тесты
```bash
cd backend
pytest tests/ -v            # Backend тесты
```

## Архитектура

### Backend — монолитный FastAPI
- **models.py** — все SQLAlchemy модели в одном файле (User, Building, Service, Material, Work, Request, ...)
- **schemas.py** — все Pydantic схемы
- **routers/** — API роутеры (auth, users, buildings, services, materials, works, requests, reports, backups)
- **core/** — конфигурация (config.py), JWT (security.py), зависимости (dependencies.py)
- **services/** — бизнес-логика (file_service.py, push_service, request_print_service)

### Frontend — React + Vite
- **api.js** — централизованный Axios-инстанс
- **contexts/AuthContext.jsx** — глобальная авторизация (localStorage)
- **components/Layout.jsx** — навигация
- **pages/** — страницы (LoginPage, WorkFormPage, DashboardPage, SettingsPage, Request*, MyWorksPage, ...)
- **Стили:** глобальные в index.css, inline-стили для компонентов

### Модули
- **works** — записи выполненных работ подрядчиков (историчность цен, soft delete)
- **requests** — заявки на работы с push-уведомлениями и назначением исполнителей
- **reports** — Excel-экспорт, сводный отчёт, акт в Word
- **backups** — полные бэкапы (БД + uploads) и бэкапы фото

## Ролевая модель

| Роль | Ключ | Доступ |
|------|------|--------|
| Подрядчик | contractor | Форма работ, свои записи, фото |
| Директор | director | Дашборд, отчёты, бэкапы фото |
| Администратор | admin | Всё + настройки, цены, полные бэкапы |
| Комендант | comendant | Заявки: создание, назначение |
| Исполнитель | executor | Заявки: выполнение, закрытие |

## Конфигурация

Backend читает `backend/.env` через `pydantic-settings`:
- `DATABASE_URL` — PostgreSQL
- `SECRET_KEY` — JWT (минимум 32 символа)
- `UPLOAD_DIR` — путь к uploads
- `ALLOWED_ORIGINS` — CORS через запятую
- `MAX_PHOTO_SIZE` — макс. размер фото после сжатия (1 МБ)
- `MAX_PHOTOS_PER_WORK` — макс. фото на работу (20)

Frontend: `VITE_API_URL` в `frontend/.env` (прод: `/api`)

## Специфичные моменты

1. **Фото сжимаются** при загрузке — max 1920px, JPEG, качество 95%→50% циклом
2. **Цены историчны** — изменение в справочнике не пересчитывает старые записи
3. **Soft delete** для справочников (`is_active = False`)
4. **Импорт Excel** — обновление по наименованию, цена: запятые→точки
5. **Push-уведомления** — Web Push через pywebpush (новые заявки, переназначения)
6. **Акт в Word** — python-docx с суммой прописью

## Полезные файлы

- `AGENTS.md` — подробная справка для AI-ассистентов
- `docs/` — архитектура, БД, API, деплой
- `.superpowers/sdd/progress.md` — прогресс subagent-driven разработки
- `docs/superpowers/` — планы и спецификации фич
  - `specs/2026-07-01-phase-2-1-requests-core-design.md` — дизайн модуля заявок
  - `specs/2026-07-01-phase-2-2-1-pwa-push-design.md` — PWA и push-уведомления
  - `specs/2026-07-23-refactor-requests-actions-column-design.md` — рефакторинг таблицы заявок
  - `plans/` — соответствующие планы реализации с чек-листами
- `.gitignore` — исключает .env, node_modules, __pycache__

## Локальная разработка

Docker Compose поднимает PostgreSQL + backend + frontend:
```bash
docker-compose up -d
```
ВНИМАНИЕ: Dockerfile для backend/frontend отсутствуют в репозитории.

## Активные задачи

Текущее состояние разработки отслеживается в `.superpowers/sdd/progress.md`. При работе с задачами используйте планы из `docs/superpowers/plans/` — они содержат детальные шаги реализации и чек-листы.
