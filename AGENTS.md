# AGENTS.md — Справка для AI-ассистентов

> Этот файл предназначен для AI-агентов, работающих с проектом. Вся документация, комментарии в коде, сообщения пользовательского интерфейса и пользовательские запросы ведутся на **русском языке** — при внесении изменений придерживайтесь того же стиля.
>
> Файл составлен на основе актуального состояния кода. Часть документации в `docs/` описывает желаемое/устаревшее поведение; при расхождении доверяйте коду и этому файлу.

---

## Обзор проекта

**CRM АХЧ** — кастомная CRM-система для заместителя директора по административно-хозяйственной части (АХЧ). Продакшен-домен: `https://report.fanat-mv.ru`.

Приложение предназначено для:

- учёта работ подрядчиков на объектах (корпусах);
- управления справочниками материалов и видов работ/услуг;
- формирования отчётности (табличный отчёт, сводный отчёт, акт сдачи-приёмки в Word) и выгрузки в Excel;
- хранения фотофиксации и документов по работам;
- создания резервных копий (полных и фото).

---

## Технологический стек

| Слой | Технологии |
|------|------------|
| **Frontend** | React 19.2.6 + Vite 8.0.12 + React Router 7.15.1 |
| **Backend** | Python 3.11+ + FastAPI 0.111.0 + SQLAlchemy 2.0.30 |
| **База данных** | PostgreSQL 15 |
| **Миграции БД** | Alembic 1.13.1. Конфиг — `backend/alembic.ini`, скрипты — `backend/alembic/versions/` |
| **Аутентификация** | JWT (python-jose 3.3.0 + passlib/bcrypt 1.7.4) |
| **Excel** | pandas 2.2.2 + openpyxl 3.1.2 |
| **Word** | python-docx 1.2.0 (генерация акта сдачи-приёмки) |
| **Обработка изображений** | Pillow 10.3.0 |
| **HTTP-клиент (frontend)** | Axios 1.16.1 |
| **UI-компоненты** | react-select 5.10.2 (выпадающие списки с поиском) |
| **Веб-сервер** | Nginx (reverse proxy + статика) |
| **Управление процессом** | systemd (`crm-backend.service`) |

Прочие зависимости backend: `uvicorn[standard]==0.30.0`, `psycopg2-binary==2.9.9`, `pydantic==2.7.1`, `pydantic-settings==2.2.1`, `python-multipart==0.0.9`, `python-dotenv==1.0.1`.

> **Примечание:** в `frontend/package.json` присутствует `date-fns` ^4.3.0, однако в исходном коде приложения импортов `date-fns` не обнаружено — зависимость может быть неиспользуемой.

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
│   │   ├── main.py              # Точка входа, подключение роутеров, CORS, static files
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
│   │   ├── index.css            # Глобальные стили: CSS-переменные, layout, таблицы, print
│   │   ├── App.css              # Остаточные стили Vite-шаблона (в основном не используются)
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx  # Глобальный контекст авторизации (localStorage)
│   │   ├── components/
│   │   │   └── Layout.jsx       # Навигация и обёртка страниц
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── WorkFormPage.jsx      # Форма подрядча (создание работы)
│   │   │   ├── WorkDetailPage.jsx    # Просмотр/редактирование записи о работе
│   │   │   ├── MyWorksPage.jsx       # Список записей текущего пользователя
│   │   │   ├── DashboardPage.jsx     # Дашборд директора (детальный + сводный отчёты)
│   │   │   ├── PhotoBackupPage.jsx   # Создание и скачивание архива фото
│   │   │   └── SettingsPage.jsx      # Настройки (пользователи, корпуса, справочники, бэкапы)
│   │   └── assets/              # Статические изображения шаблона Vite
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js           # Конфиг Vite (плагин react)
│   ├── eslint.config.js         # Конфиг ESLint (flat config)
│   └── index.html               # HTML-шаблон со встроенными базовыми стилями
│
├── docs/                        # Подробная документация на русском
│   ├── architecture.md          # Архитектура и схема потоков данных (частично устарела)
│   ├── database_schema.md       # ER-диаграмма и SQL DDL
│   ├── api_specification.md     # Спецификация endpoint'ов (часть деталей — желаемый формат)
│   ├── form_specification.md    # Спецификация формы подрядчика
│   ├── materials_import.md      # Формат импорта справочников из Excel
│   ├── reports.md               # Отчёты и дашборд
│   ├── backup.md                # Бэкапы и архивирование (часть деталей — желаемый формат)
│   ├── deployment.md            # Инструкция по развёртыванию на сервере
│   └── nginx-report.fanat-mv.ru.conf  # Пример конфигурации Nginx
│
├── uploads/                     # Локальное файловое хранилище
│   ├── photos/                  # Фото по корпусам: uploads/photos/building_{N}/
│   ├── files/                   # Документы
│   ├── works/                   # Документы по работам: uploads/works/{work_id}/files/
│   ├── temp/                    # Временные файлы
│   ├── backups/                 # Архивы бэкапов
│   └── .gitkeep
│
├── database/                    # Зарезервированная директория (в текущем коде не используется)
│   └── migrations/              # Пустая; актуальные миграции находятся в backend/alembic/versions/
│
├── docker-compose.yml           # Docker Compose для локальной разработки (PostgreSQL + backend + frontend)
├── package.json                 # Корневой package.json (содержит только devDependency ctx7)
├── package-lock.json
├── README.md                    # Общее описание и быстрый старт
└── AGENTS.md                    # Этот файл
```

> **Важные нюансы структуры:**
> - Директории `backend/app/models/` и `backend/app/schemas/` существуют, но **пусты**. Все модели и схемы собраны в `backend/app/models.py` и `backend/app/schemas.py` соответственно.
> - Директория `database/migrations/` пуста; реальные миграции Alembic лежат в `backend/alembic/versions/`.
> - `docker-compose.yml` ссылается на `build: ./backend` и `build: ./frontend`, но в репозитории **отсутствуют Dockerfile** для backend и frontend. Для полноценного использования `docker-compose build` потребуется предварительно добавить соответствующие Dockerfile.
> - Корневой `package.json` содержит только зависимость `ctx7` (инструмент AI-ассистента) и не относится к runtime приложения.

---

## Ролевая модель

Система использует три фиксированные роли:

| Роль | Ключ | Права |
|------|------|-------|
| **Подрядчик** | `contractor` | Заполнение формы работ (`/works/new`), просмотр своих записей (`/my-works`, `/works/:id`), прикрепление фото и файлов к существующим записям. Не видит дашборд, цены и настройки. |
| **Директор** | `director` | Просмотр дашборда (`/dashboard`) с детальным и сводным отчётами, фильтры, выгрузка Excel и акта в Word, создание и скачивание архива фото (`/photo-backup`). Не может редактировать записи и цены. |
| **Администратор** | `admin` | Всё, что у директора, плюс управление пользователями, корпусами, импорт справочников из Excel, ручная корректировка цен в записях (`PUT /works/{id}/prices`), создание полных бэкапов и управление архивами (`/settings/backups`). |

Проверка прав реализована через зависимости FastAPI в `backend/app/core/dependencies.py`:

- `require_admin` — только `admin`
- `require_director` — `director` и `admin`
- `require_contractor` — `contractor`, `director` и `admin`
- `get_current_user` — любой авторизованный пользователь

> **Важно:** в текущем коде редактирование цен работы (`PUT /works/{id}/prices`, а также inline-редактирование на фронтенде) доступно только `admin`. В `docs/reports.md` указано, что редактировать цены может `director`, но это не соответствует текущей реализации.

---

## Сборка, запуск и команды

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

**Конфигурация:** читается из `backend/.env` через `pydantic-settings` (`backend/app/core/config.py`). Ключевые переменные:

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

Конфигурация поднимает PostgreSQL (порт 5432), backend (порт 8090) и frontend (порт 3000). **Внимание:** в репозитории отсутствуют Dockerfile для backend и frontend, поэтому для полноценного использования `docker-compose build` потребуется предварительно добавить соответствующие Dockerfile.

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
- **Миграции:** `Base.metadata.create_all(bind=engine)` в `main.py` закомментирован; в продакшене и при локальной разработке используется Alembic (`alembic upgrade head`).

### Frontend

- **Стили:** проект использует **смешанный подход**:
  - Глобальные стили определены в `frontend/src/index.css` (CSS-переменные, базовая типографика, таблицы, layout-навигация, адаптивность, print-стили).
  - `frontend/src/App.css` — в основном остаточные стили Vite-шаблона (`.hero`, `.counter` и т.д.), не используемые в рабочих страницах.
  - Страницы и компоненты используют **inline-стили** в объектах JavaScript (`const styles = { ... }`) в том же файле, что и компонент.
  - В `frontend/index.html` встроены базовые CSS-правила (box-sizing, focus-visible, скроллбар, print).
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
| `/my-works` | contractor, director, admin | Список записей текущего пользователя (с возможностью добавить фото) |
| `/dashboard` | director, admin | Дашборд с таблицей работ, фильтрами, Excel-экспортом, сводным отчётом и актом |
| `/photo-backup` | director, admin | Создание и скачивание архива фотографий |
| `/settings` | admin | Настройки: пользователи, корпуса, виды работ, материалы, бэкапы |
| `/` | — | Редирект на `/login` |

---

## Основные бизнес-правила

1. **Фото при загрузке автоматически сжимаются:**
   - максимальный размер после сжатия — 1 МБ (`MAX_PHOTO_SIZE`);
   - максимальное разрешение — 1920 px по длинной стороне;
   - формат выхода — JPEG, качество подбирается циклом от 95 % до 50 % с шагом 5 %;
   - применяется коррекция EXIF-ориентации (`ImageOps.exif_transpose`) и конвертация в RGB.

2. **Ограничения на файлы:**
   - максимум 20 фото на одну работу (`MAX_PHOTOS_PER_WORK`);
   - максимальный размер одного файла — 10 МБ (`MAX_FILE_SIZE`);
   - для фото проверяется `content_type.startswith('image/')`;
   - документы сохраняются без проверки расширения на уровне backend (валидация, если есть, выполняется на frontend).

3. **Историчность цен:** при создании работы цены услуг и материалов фиксируются в записях `works` и `work_materials`. Изменение цены в справочнике НЕ пересчитывает старые записи. Администратор может вручную скорректировать цены в записи через `PUT /works/{id}/prices`.

4. **Soft delete:** справочники (`buildings`, `services`, `materials`) и пользователи удаляются логически (`is_active = False`). Корпуса дополнительно имеют endpoint активации `PUT /buildings/{id}/activate`. Физически удаляются только записи о работах (`works`) — каскадно удаляются связанные фото, файлы и материалы.

5. **Импорт справочников:** загрузка `.xlsx` с тремя колонками: наименование, единица измерения, цена. При совпадении наименования запись обновляется (и активируется), иначе создаётся новая. Первая строка — заголовки (игнорируется). Цена приводится: запятые заменяются на точки, пробелы удаляются.

6. **Отчёты:**
   - `GET /reports/export` — детальный Excel-отчёт по работам с фото в ячейках;
   - `GET /reports/summary` и `GET /reports/summary/export` — сводный отчёт с группировкой по корпусу, виду работ, дате или подрядчику;
   - `GET /reports/act` — генерация акта сдачи-приёмки в формате `.docx` с суммой прописью.

7. **Бэкапы:**
   - **Полный бэкап** — дамп БД через `pg_dump` + копирование всей директории uploads, всё в один ZIP-архив. Создаётся только администратором через `/api/backups/full`.
   - **Бэкап фото** — ZIP-архив фотографий с фильтрами (период дат работ, корпус). Доступен директору и администратору через `/api/backups/photos`.
   - Endpoint `POST /api/backups/restore` **не выполняет реальное восстановление**, а возвращает информацию и ссылку на скачивание бэкапа. Полное восстановление требует ручных действий по инструкции `docs/backup.md`.
   - В отличие от описания в `docs/backup.md`, текущий код создаёт **один ZIP-файл** на бэкап, а не разбивает его на части по 300 МБ.

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
- Inline-стили в объектах `const styles = { ... }` в том же файле, что и компонент (для страниц и форм).
- Глобальные CSS-классы допустимы для повторяющихся элементов интерфейса (навигация, таблицы), но избегайте добавления тяжёлых CSS-фреймворков.
- Имена компонентов — `PascalCase`, файлы компонентов — `PascalCase.jsx`.
- API-вызовы централизованы в `api.js`.
- Все пользовательские строки и комментарии — на **русском языке**.

---

## Тестирование

В рамках Phase 1 в `backend/tests/` добавлены backend-тесты на FastAPI `TestClient`. Для запуска:

```bash
cd backend
source venv/bin/activate
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/ -v
```

Рекомендации:

- Backend: `pytest` + `httpx`/`TestClient` из FastAPI + `pytest-asyncio`.
- Frontend: `vitest` (уже есть в экосистеме Vite) + `@testing-library/react`.
- Перед PR запускать `npm run lint` для frontend.

---

## Безопасность

- **JWT Secret Key** должен быть случайным и длиной не менее 32 символов. Хранится только в `backend/.env`.
- **Пароли** никогда не хранятся в открытом виде — только bcrypt-хеши.
- **Загрузка файлов:** для фото проверяется `content_type`; для импорта справочников проверяется расширение `.xlsx`.
- **CORS:** в продакшене `ALLOWED_ORIGINS` должен содержать только продакшен-домен.
- **Файлы .env:** `backend/.env` и `frontend/.env` исключены из коммитов (см. `.gitignore`).
- **Авторизация:** в `AuthContext.jsx` токен хранится в `localStorage`; при 401 от API токен удаляется и выполняется редирект на `/login`.

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

- `docs/architecture.md` — схема компонентов и потоков данных (внимание: некоторые детали устарели, например React Router версии, UI-библиотеки, разбиение моделей/схем по файлам).
- `docs/api_specification.md` — спецификация REST API (часть деталей описывает желаемый формат ответа, отличный от текущей реализации).
- `docs/database_schema.md` — ER-диаграмма и SQL DDL.
- `docs/deployment.md` — пошаговая инструкция по развёртыванию.
- `docs/backup.md` — логика бэкапов и восстановления (часть деталей — желаемый формат, не реализованный в текущем коде).
- `docs/materials_import.md` — формат Excel для импорта справочников.
- `docs/form_specification.md` — макет и логика формы подрядчика.
- `docs/reports.md` — описание дашборда и отчётов.
