# Архитектура системы

## Общая схема

```
┌─────────────────┐      HTTPS       ┌─────────────────┐
│   Пользователь  │ ◄──────────────► │  report.fanat   │
│  (Браузер)      │                  │    -mv.ru       │
└─────────────────┘                  └────────┬────────┘
                                              │
                                       Nginx (80/443)
                                              │
                         ┌────────────────────┼────────────────────┐
                         │                    │                    │
                         ▼                    ▼                    ▼
                  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                  │  Frontend   │    │   Backend   │    │  PostgreSQL │
                  │   React     │    │   FastAPI   │    │   localhost │
                  │  (статика)  │    │   :8090     │    │   :5432     │
                  └─────────────┘    └──────┬──────┘    └─────────────┘
                                            │
                                            ▼
                                     ┌─────────────┐
                                     │ File Store  │
                                     │  /uploads   │
                                     │ (фото/файлы)│
                                     └─────────────┘
```

## Компоненты

### 1. Frontend (React + Vite)

**Порт:** раздаётся Nginx как статика

**Основные разделы:**
- `/login` — страница входа
- `/works/new` — форма подрядчика (создание работы)
- `/dashboard` — дашборд директора (таблица работ)
- `/dashboard/summary` — сводный отчёт
- `/settings/materials` — загрузка справочника материалов
- `/settings/services` — загрузка справочника услуг
- `/settings/users` — управление пользователями (админ)

**Технологии:**
- React 18 с хуками
- React Router 6 (маршрутизация)
- Axios (HTTP-клиент)
- React Query / SWR (управление серверным состоянием)
- Material-UI / Ant Design (UI-компоненты)
- React-Select (выпадающие списки с поиском)

### 2. Backend (FastAPI)

**Порт:** `8090` (localhost, закрыт снаружи)

**Структура:**
```
backend/app/
├── main.py              # Точка входа, подключение роутеров
├── core/
│   ├── config.py        # Настройки (env vars)
│   ├── security.py      # JWT, хеширование паролей
│   └── dependencies.py  # Зависимости (get_db, get_current_user)
├── models/
│   ├── user.py
│   ├── contractor.py
│   ├── building.py
│   ├── work.py
│   ├── work_photo.py
│   ├── work_file.py
│   ├── material.py
│   ├── service.py        # Виды работ/услуги
│   └── work_material.py  # Связь работ с материалами
├── schemas/
│   └── # Pydantic модели для валидации
├── routers/
│   ├── auth.py
│   ├── users.py
│   ├── buildings.py
│   ├── works.py
│   ├── materials.py
│   ├── services.py
│   └── reports.py
├── services/
│   ├── excel_import.py   # Импорт из xlsx
│   ├── file_storage.py   # Работа с файлами
│   └── report_export.py  # Экспорт в xlsx
└── database.py           # Подключение к PostgreSQL
```

### 3. База данных (PostgreSQL)

**Порт:** `5432` (свободен на сервере)

- Хранит все данные системы
- SQLAlchemy ORM для работы из Python
- Alembic для миграций

### 4. Хранилище файлов

**Путь:** `/var/www/crm/uploads/`

**Структура:**
```
uploads/
├── works/
│   └── {work_id}/
│       ├── files/       # Документы
│       └── photos/      # Фото
├── photos/
│   └── building_{number}/  # Фото по корпусам
├── temp/
│   ├── excel_imports/   # Временные файлы импорта
│   └── archives/        # Временные архивы бэкапов
└── backups/
    ├── full/            # Полные бэкапы системы
    └── photos/          # Архивы фото
```

**Правила для фото:**
- Сохраняются в папку по номеру корпуса: `uploads/photos/building_{number}/`
- Имя файла: `YYYYMMDD_HHMMSS_{original_name}.ext`
- Пример: `uploads/photos/building_12/20250527_143022_photo1.jpg`
- **Сжатие:** При загрузке фото автоматически сжимается до 1 МБ (JPEG качество 85%, max 1920px по длинной стороне)

### 5. Nginx (Reverse Proxy)

**Конфигурация:** `/etc/nginx/sites-enabled/report.fanat-mv.ru`

```nginx
server {
    listen 80;
    server_name report.fanat-mv.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name report.fanat-mv.ru;

    # SSL сертификаты (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/report.fanat-mv.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/report.fanat-mv.ru/privkey.pem;

    # Frontend (статика)
    location / {
        root /var/www/crm/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8090/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Загруженные файлы
    location /uploads/ {
        alias /var/www/crm/uploads/;
        expires 7d;
    }
}
```

## Аутентификация и авторизация

### JWT-токены

1. Пользователь вводит логин/пароль
2. Backend проверяет учётные данные
3. Возвращает `access_token` (время жизни: 24 часа)
4. Frontend хранит токен в `localStorage`
5. Каждый запрос включает заголовок: `Authorization: Bearer <token>`

### Ролевая модель

```python
class UserRole(str, Enum):
    CONTRACTOR = "contractor"    # Подрядчик
    DIRECTOR = "director"        # Зам. директор по АХЧ
    ADMIN = "admin"              # Администратор
```

### Права доступа

| Действие | Подрядчик | Директор | Админ |
|----------|-----------|----------|-------|
| Вход в систему | ✅ | ✅ | ✅ |
| Заполнение формы работ | ✅ | ❌ | ❌ |
| Просмотр дашборда | ❌ | ✅ | ✅ |
| Редактирование цен в отчёте | ❌ | ✅ | ❌ |
| Выгрузка в Excel | ❌ | ✅ | ✅ |
| Импорт справочников | ❌ | ❌ | ✅ |
| Управление пользователями | ❌ | ❌ | ✅ |

## Потоки данных

### Создание работы подрядчиком

```
[Браузер] ──POST /api/works──► [FastAPI]
                                    │
                                    ├──► [PostgreSQL] Сохранение работы
                                    ├──► [PostgreSQL] Сохранение материалов (work_materials)
                                    ├──► [ФС] Сохранение фото в папку корпуса
                                    └──► [ФС] Сохранение файлов
                                    │
                                    ◄── JSON (200 OK)
```

### Импорт справочника

```
[Браузер] ──POST /api/materials/import──► [FastAPI]
                                               │
                                               ├──► [ФС] Временное сохранение xlsx
                                               ├──► [Python] Чтение Excel (openpyxl/pandas)
                                               ├──► [Валидация] Проверка структуры
                                               ├──► [PostgreSQL] UPDATE/INSERT материалов
                                               └──► [ФС] Удаление временного файла
                                               │
                                               ◄── JSON (отчёт об импорте)
```

### Формирование отчёта

```
[Браузер] ──GET /api/reports/summary?date_from=...──► [FastAPI]
                                                            │
                                                            ├──► [PostgreSQL] SQL-запрос с GROUP BY
                                                            ├──► [Python] Формирование DataFrame
                                                            └──► [Python] Экспорт в xlsx (openpyxl)
                                                            │
                                                            ◄── File (xlsx)
```

### Бэкап фото

```
[Браузер] ──POST /api/backups/photos──► [FastAPI]
                                              │
                                              ├──► [PostgreSQL] Получение списка фото по фильтру
                                              ├──► [Python] Создание ZIP-архива
                                              ├──► [Python] Разбиение на части по 300 МБ
                                              └──► [ФС] Сохранение в uploads/backups/photos/
                                              │
                                              ◄── JSON (ссылки на части архива)
```

### Полный бэкап системы

```
[Браузер] ──POST /api/backups/full──► [FastAPI]
                                          │
                                          ├──► [PostgreSQL] pg_dump (SQL-дамп БД)
                                          ├──► [Python] Копирование uploads/
                                          ├──► [Python] Создание ZIP с дампом + файлами + справочники
                                          ├──► [Python] Разбиение на части по 300 МБ
                                          └──► [ФС] Сохранение в uploads/backups/full/
                                          │
                                          ◄── JSON (ссылки на части архива)
```

### Восстановление из бэкапа

```
[Браузер] ──POST /api/backups/restore──► [FastAPI]
                                              │
                                              ├──► [Python] Распаковка архива
                                              ├──► [PostgreSQL] Восстановление из SQL-дампа
                                              ├──► [ФС] Копирование файлов в uploads/
                                              └──► [Python] Валидация целостности
                                              │
                                              ◄── JSON (результат восстановления)
```

## Технические ограничения

- **Максимальный размер файла:** 10 МБ
- **Максимум фото в одной работе:** 20 шт.
- **Форматы фото:** JPG, JPEG, PNG
- **Сжатие фото:** Автоматическое до 1 МБ (JPEG 85%, 1920px)
- **Форматы файлов:** PDF, DOC, DOCX, XLS, XLSX
- **Максимальный размер Excel для импорта:** 5 МБ
- **Размер части архива бэкапа:** 300 МБ (split ZIP)
