# AGENTS.md — Справка для AI-ассистентов

> Этот файл предназначен для AI-агентов, работающих с проектом. Вся документация, комментарии в коде, сообщения пользовательского интерфейса и пользовательские запросы ведутся на **русском языке** — при внесении изменений придерживайтесь того же стиля.

---

## Обзор проекта

**CRM АХЧ** — кастомная CRM-система для заместителя директора по административно-хозяйственной части (АХЧ). Приложение предназначено для:

- учёта работ подрядчиков на объектах (корпусах);
- управления справочниками материалов и видов работ/услуг;
- формирования отчётности и выгрузки в Excel;
- хранения фотофиксации и документов по работам;
- создания резервных копий (полных и фото).

**Продакшен-домен:** `https://report.fanat-mv.ru`

---

## Технологический стек

| Слой | Технологии |
|------|------------|
| **Frontend** | React 19.2 + Vite 8 + React Router 7.15 |
| **Backend** | Python 3.11+ + FastAPI 0.111 + SQLAlchemy 2.0 |
| **База данных** | PostgreSQL 15 |
| **Миграции БД** | Alembic (конфиг в `backend/alembic.ini`, скрипты в `backend/alembic/versions/`) |
| **Аутентификация** | JWT (python-jose + passlib/bcrypt) |
| **Excel** | pandas 2.2 + openpyxl 3.1 |
| **Обработка изображений** | Pillow (PIL) |
| **HTTP-клиент (frontend)** | Axios 1.16 |
| **UI-компоненты** | react-select 5.10 (выпадающие списки с поиском), остальное — нативный React + inline-стили |
| **Веб-сервер** | Nginx (reverse proxy + статика) |
| **Управление процессом** | systemd (`crm-backend.service`) |

---

## Структура проекта

```
crm/
├── backend/                     # FastAPI-приложение
│   ├── alembic/                 # Миграции Alembic
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/            # Файлы миграций
│   ├── app/
│   │   ├── main.py              # Точка входа, подключение роутеров и middleware
│   │   ├── database.py          # Подключение к PostgreSQL (create_engine, SessionLocal, Base)
│   │   ├── models.py            # ВСЕ SQLAlchemy-модели в одном файле
│   │   ├── schemas.py           # ВСЕ Pydantic-схемы в одном файле
│   │   ├── core/
│   │   │   ├── config.py        # Настройки через pydantic-settings (читает .env)
│   │   │   ├── security.py      # JWT: создание/проверка токена, хеширование паролей
│   │   │   └── dependencies.py  # Зависимости FastAPI: get_current_user, require_role
│   │   ├── routers/             # API-роутеры
│   │   │   ├── auth.py
│   │   │   ├── users.py
│   │   │   ├── buildings.py
│   │   │   ├── services.py
│   │   │   ├── materials.py
│   │   │   ├── works.py
│   │   │   ├── reports.py
│   │   │   └── backups.py
│   │   └── services/            # Сервисный слой
│   │       └── file_service.py  # Сохранение/сжатие файлов, генерация URL
│   ├── requirements.txt         # Зависимости Python
│   └── .env                     # Переменные окружения (не коммитить!)
│
├── frontend/                    # React-приложение (Vite)
│   ├── src/
│   │   ├── main.jsx             # Точка входа (ReactDOM.createRoot)
│   │   ├── App.jsx              # Маршрутизация и защищённые маршруты
│   │   ├── api.js               # Axios-инстанс и методы API (централизованно)
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx  # Глобальный контекст авторизации (localStorage)
│   │   ├── components/
│   │   │   └── Layout.jsx       # Навигация и обёртка страниц
│   │   └── pages/
│   │       ├── LoginPage.jsx
│   │       ├── WorkFormPage.jsx      # Форма подрядчика (создание работы)
│   │       ├── WorkDetailPage.jsx    # Просмотр/редактирование записи о работе
│   │       ├── DashboardPage.jsx     # Дашборд директора (детальный + сводный отчёты)
│   │       └── SettingsPage.jsx      # Настройки (пользователи, корпуса, справочники, бэкапы)
│   ├── package.json
│   ├── vite.config.js           # Конфиг Vite (плагин react)
│   ├── eslint.config.js         # Конфиг ESLint (flat config)
│   └── index.html               # HTML-шаблон со встроенными базовыми стилями
│
├── docs/                        # Подробная документация на русском
│   ├── architecture.md          # Архитектура и схема потоков данных (частично устарела)
│   ├── database_schema.md       # ER-диаграмма и SQL DDL
│   ├── api_specification.md     # Спецификация всех endpoint'ов
│   ├── form_specification.md    # Спецификация формы подрядчика
│   ├── materials_import.md      # Формат импорта справочников из Excel
│   ├── reports.md               # Отчёты и дашборд
│   ├── backup.md                # Бэкапы и архивирование
│   ├── deployment.md            # Инструкция по развёртыванию на сервере
│   └── nginx-report.fanat-mv.ru.conf  # Пример конфигурации Nginx
│
├── uploads/                     # Локальное файловое хранилище
│   ├── photos/                  # Фото по корпусам: uploads/photos/building_{N}/
│   ├── files/                   # Документы
│   ├── temp/                    # Временные файлы
│   └── backups/                 # Архивы бэкапов
│
├── docker-compose.yml           # Docker Compose для локальной разработки (PostgreSQL + backend + frontend)
└── README.md                    # Общее описание и быстрый старт
```

---

## Ролевая модель

Система использует три фиксированные роли:

| Роль | Ключ | Права |
|------|------|-------|
| **Подрядчик** | `contractor` | Заполнение формы работ (`/works/new`), прикрепление фото/файлов, просмотр своих записей (`/works/:id`). Не видит дашборд, цены и настройки. |
| **Директор** | `director` | Просмотр дашборда (`/dashboard`) с детальным и сводным отчётами, фильтры, выгрузка Excel, редактирование цен в отчётах. |
| **Администратор** | `admin` | Всё, что у директора, плюс управление пользователями, корпусами, импорт справочников из Excel, создание бэкапов (`/settings`). |

Проверка прав реализована через зависимости FastAPI:
- `require_admin` — только admin
- `require_director` — director и admin
- `require_contractor` — contractor, director и admin
- `get_current_user` — любой авторизованный пользователь

---

## Запуск и сборка

### Backend (локально)

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

**Конфигурация:** читается из `backend/.env` через `pydantic-settings`. Ключевые переменные:
- `DATABASE_URL` — подключение к PostgreSQL
- `SECRET_KEY` — ключ для подписи JWT (минимум 32 символа)
- `UPLOAD_DIR` — абсолютный путь к директории uploads
- `ALLOWED_ORIGINS` — список CORS-источников через запятую
- `ACCESS_TOKEN_EXPIRE_MINUTES` — время жизни JWT (по умолчанию 1440 = 24 часа)
- `MAX_FILE_SIZE` — максимальный размер файла (по умолчанию 10 МБ)
- `MAX_PHOTO_SIZE` — максимальный размер фото после сжатия (по умолчанию 1 МБ)
- `MAX_PHOTOS_PER_WORK` — максимум фото на одну работу (по умолчанию 20)

### Frontend (локально)

```bash
cd frontend
npm install
npm run dev          # dev-сервер Vite (обычно http://localhost:5173)
npm run build        # продакшен-сборка в dist/
npm run lint         # проверка ESLint
npm run preview      # превью продакшен-сборки
```

**API-URL:** задаётся через `VITE_API_URL` (env Vite). В продакшене `frontend/.env` содержит `VITE_API_URL=/api`.

### Docker Compose (локальная разработка)

```bash
docker-compose up -d
```

Поднимает PostgreSQL (порт 5432), backend (порт 8090) и frontend (порт 3000).

---

## Архитектура кода

### Backend

- **Модели:** все SQLAlchemy-модели объявлены в `backend/app/models.py`. Используется `declarative_base()`, связи через `relationship()`. Модели: `User`, `Building`, `Service`, `Material`, `Work`, `WorkMaterial`, `WorkPhoto`, `WorkFile`, `BackupLog`.
- **Схемы:** все Pydantic-схемы в `backend/app/schemas.py`. Для ответов БД используется `Config.from_attributes = True`.
- **Роутеры:** каждый модуль в `backend/app/routers/` — отдельный `APIRouter`. В `main.py` роутеры подключаются через `app.include_router(..., prefix="/api")`. Все endpoints доступны под префиксом `/api`.
- **Сервисы:** вспомогательная логика в `backend/app/services/`. На данный момент там только `file_service.py` (сохранение фото с сжатием, сохранение файлов, удаление, генерация URL).
- **Безопасность:**
  - Пароли хешируются через `bcrypt` (passlib).
  - JWT-токены подписываются алгоритмом `HS256`, время жизни по умолчанию 1440 минут (24 часа).
  - Токен передаётся в заголовке `Authorization: Bearer <token>`.
  - В `main.py` есть health check: `GET /api/health`.

### Frontend

- **Стили:** в проекте используются **inline-стили** в объектах JavaScript. Нет CSS-in-JS библиотек, нет Material-UI/Ant Design/Tailwind. Есть глобальные стили в `index.html` (базовые правила) и `index.css`/`App.css` (минимальные). При добавлении новых компонентов сохраняйте подход с inline-стилями: `const styles = { ... }` в том же файле.
- **Состояние:** глобальное состояние авторизации — через React Context (`AuthContext`). Локальное состояние страниц — через `useState`/`useEffect`.
- **HTTP-клиент:** централизованный Axios в `api.js` с перехватчиками для добавления токена и обработки 401 (редирект на `/login`).
- **Маршрутизация:** `BrowserRouter`. Защита маршрутов через `ProtectedRoute` в `App.jsx`.
- **Формы:** используется `react-select` и `AsyncSelect` для выпадающих списков с поиском (корпуса, виды работ, материалы).

---

## Маршруты frontend

| Путь | Доступ | Описание |
|------|--------|----------|
| `/login` | Все | Страница входа |
| `/works/new` | contractor, director, admin | Форма создания новой работы |
| `/works/:id` | contractor, director, admin | Просмотр деталей работы, фото, файлы |
| `/dashboard` | director, admin | Дашборд с таблицей работ, фильтрами, Excel-экспортом |
| `/settings` | admin | Настройки: пользователи, корпуса, виды работ, материалы, бэкапы |
| `/` | — | Редирект на `/login` |

---

## Основные бизнес-правила

1. **Фото при загрузке автоматически сжимаются:**
   - максимальный размер после сжатия — 1 МБ;
   - максимальное разрешение — 1920 px по длинной стороне;
   - формат выхода — JPEG, качество подбирается циклом от 95 % до 50 % с шагом 5 %.

2. **Ограничения на файлы:**
   - максимум 20 фото на одну работу;
   - максимальный размер одного файла — 10 МБ;
   - принимаются изображения (JPG/PNG) и документы (PDF, DOC, DOCX, XLS, XLSX).

3. **Историчность цен:** при создании работы цены услуг и материалов фиксируются в записях `works` и `work_materials`. Изменение цены в справочнике НЕ пересчитывает старые записи.

4. **Soft delete:** справочники (`buildings`, `services`, `materials`) и пользователи удаляются логически (`is_active = False`). Физически удаляются только записи о работах (`works`) — каскадом удаляются связанные фото, файлы и материалы.

5. **Импорт справочников:** загрузка `.xlsx` с тремя колонками: наименование, единица измерения, цена. При совпадении наименования запись обновляется, иначе создаётся новая. Первая строка — заголовки (игнорируется).

6. **Бэкапы:**
   - **Полный бэкап** — дамп БД через `pg_dump` + копирование uploads + справочники в Excel, всё в ZIP, разбиение на части по 300 МБ.
   - **Бэкап фото** — ZIP-архив фотографий с фильтрами (период, корпус, подрядчик), разбиение на части по 300 МБ.
   - Управление бэкапами — только для роли `admin` в разделе `/settings/backups`.

---

## Тестирование

На текущий момент в проекте **отсутствуют автоматические тесты** (unit, integration, e2e). При добавлении тестов рекомендуется:

- Backend: `pytest` + `httpx`/`TestClient` из FastAPI + `pytest-asyncio`.
- Frontend: `vitest` (уже есть в экосистеме Vite) + `@testing-library/react`.
- Перед PR запускать `npm run lint` для frontend.

---

## Стиль кода и соглашения

### Python (Backend)

- Код оформляйте в соответствии с PEP 8.
- Все строковые литералы, сообщения об ошибках и комментарии — на **русском языке**.
- SQLAlchemy-запросы строятся через метод `db.query(Model)`.
- Для валидации входных данных используются Pydantic-схемы из `schemas.py`.
- Функции роутеров принимают `db: Session = Depends(get_db)`.
- Роутеры используют `APIRouter` с `prefix` и `tags`.

### JavaScript / React (Frontend)

- ES-модули (`type: "module"` в `package.json`).
- JSX-расширение у компонентов (`.jsx`).
- Inline-стили в объектах `const styles = { ... }` в том же файле, что и компонент.
- Имена компонентов — `PascalCase`, файлы компонентов — `PascalCase.jsx`.
- API-вызовы централизованы в `api.js`.
- Все пользовательские строки и комментарии — на **русском языке**.

---

## Безопасность

- **JWT Secret Key** должен быть случайным и длиной не менее 32 символов. Хранится только в `backend/.env`.
- **Пароли** никогда не хранятся в открытом виде — только bcrypt-хеши.
- **Загрузка файлов:** проверяется `content_type`, расширение `.xlsx` для импорта.
- **CORS:** в продакшене `ALLOWED_ORIGINS` должен содержать только продакшен-домен.
- **Файлы .env:** `backend/.env` и `frontend/.env` исключены из коммитов (проверьте `.gitignore`).

---

## Деплой

Полная инструкция находится в `docs/deployment.md`. Кратко:

1. На сервере в `/var/www/crm/` размещаются `frontend/dist`, `backend/app`, `uploads/`.
2. Nginx раздаёт статику фронтенда и проксирует `/api/` на backend (`localhost:8090`).
3. Backend запускается через systemd-сервис `crm-backend.service` (uvicorn на `127.0.0.1:8090`).
4. SSL — Let's Encrypt (certbot).
5. PostgreSQL слушает только localhost (`5432`).
6. Обновление backend: `git pull → pip install → alembic upgrade head → systemctl restart crm-backend`.
7. Обновление frontend: `git pull → npm install → npm run build` (Nginx подхватывает новые файлы автоматически).

---

## Полезные ссылки внутри проекта

- `docs/architecture.md` — схема компонентов и потоков данных (внимание: некоторые детали устарели, например описание структуры каталогов backend)
- `docs/api_specification.md` — полная спецификация REST API
- `docs/database_schema.md` — ER-диаграмма и SQL DDL
- `docs/deployment.md` — пошаговая инструкция по развёртыванию
- `docs/backup.md` — логика бэкапов и восстановления
- `docs/materials_import.md` — формат Excel для импорта справочников
- `docs/form_specification.md` — макет и логика формы подрядчика
- `docs/reports.md` — описание дашборда и отчётов
