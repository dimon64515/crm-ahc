# AGENTS_BACKEND.md — Справка для работы с backend

> Правила и контекст для AI-агентов, изменяющих backend CRM АХЧ.

---

## Технологический стек (backend)

| Компонент | Технологии |
|-----------|------------|
| Язык | Python 3.11+ |
| Фреймворк | FastAPI 0.111.0 |
| ORM | SQLAlchemy 2.0.30 |
| База данных | PostgreSQL 15 |
| Миграции | Alembic 1.13.1 |
| Аутентификация | JWT (python-jose 3.3.0 + passlib/bcrypt 1.7.4) |
| Excel | pandas 2.2.2 + openpyxl 3.1.2 |
| Word | python-docx 1.2.0 |
| Обработка изображений | Pillow 10.3.0 |
| Сервер | uvicorn[standard]==0.30.0 |

Прочие зависимости: `psycopg2-binary==2.9.9`, `pydantic==2.7.1`, `pydantic-settings==2.2.1`, `python-multipart==0.0.9`, `python-dotenv==1.0.1`.

---

## Архитектура backend

- **Модели:** все SQLAlchemy-модели объявлены в `backend/app/models.py`. Модели: `User`, `Building`, `Service`, `Material`, `Work`, `WorkService`, `WorkMaterial`, `WorkPhoto`, `WorkFile`, `BackupLog`, `Request`, `RequestPhoto`, `PushSubscription`, `AuditLog`.
- **Схемы:** все Pydantic-схемы в `backend/app/schemas.py`. Для ответов БД используется `Config.from_attributes = True`.
- **Роутеры:** каждый модуль в `backend/app/routers/` — отдельный `APIRouter`. В `main.py` роутеры подключаются через `app.include_router(..., prefix="/api")`.
- **Сервисы:** вспомогательная логика в `backend/app/services/`: `file_service.py`, `request_print_service.py`, `push_service.py`, `audit_service.py`.
- **Безопасность:** пароли хешируются через `bcrypt`; JWT подписывается алгоритмом `HS256` на 1440 минут (24 ч); токен передаётся в `Authorization: Bearer <token>`.

---

## Бизнес-правила (backend)

1. **Фото при загрузке сжимаются:** максимум 1 МБ (`MAX_PHOTO_SIZE`), 1920 px по длинной стороне, JPEG качеством 95–50 %, коррекция EXIF-ориентации, RGB.
2. **Ограничения файлов:** до 20 фото на работу (`MAX_PHOTOS_PER_WORK`); один файл до 10 МБ (`MAX_FILE_SIZE`); фото проверяются по `content_type.startswith('image/')`.
3. **Заявки и отчёты:** заявки создают `comendant`; подрядчик берёт в работу и создаёт отчёт только по назначенной заявке; одна заявка → один отчёт (`Work`); `PUT /requests/{id}/complete` завершает заявку и при необходимости создаёт минимальный отчёт.
4. **Историчность цен:** цены фиксируются в `works`, `work_services`, `work_materials`. Изменение цены в справочнике не пересчитывает старые записи. Администратор корректирует цены через `PUT /works/{id}/prices`.
5. **Soft delete:** справочники, пользователи и заявки удаляются логически (`is_active = False` или `deleted_at`). Физически удаляются только записи о работах (`works`) — каскадно удаляются связанные фото, файлы, материалы и услуги. Корпуса имеют endpoint активации `PUT /buildings/{id}/activate`.
6. **Импорт справочников:** `.xlsx` с колонками «наименование, единица измерения, цена». При совпадении наименования запись обновляется и активируется, иначе создаётся. Цена приводится: запятая → точка, пробелы удаляются.
7. **Отчёты:** `GET /reports/export` — детальный Excel; `GET /reports/summary` и `/reports/summary/export` — сводный; `GET /reports/act` — акт в `.docx`.
8. **Бэкапы:** полный бэкап — `pg_dump` + uploads в ZIP (`/api/backups/full`); фото-бэкап — ZIP с фильтрами (`/api/backups/photos`); `POST /api/backups/restore` возвращает ссылку, но не восстанавливает.

---

## Права доступа (dependencies)

В `backend/app/core/dependencies.py`:

- `require_admin` — только `admin`
- `require_director` — `director` и `admin`
- `require_contractor` — `contractor`, `director` и `admin`
- `get_current_user` — любой авторизованный

---

## Стиль кода (Python)

- Код оформляйте в соответствии с PEP 8.
- Все строковые литералы, сообщения об ошибках и комментарии — на русском языке.
- SQLAlchemy-запросы строятся через метод `db.query(Model)`.
- Для валидации используются Pydantic-схемы из `schemas.py`.
- Функции роутеров принимают `db: Session = Depends(get_db)`.
- Роутеры используют `APIRouter` с `prefix` и `tags`.
