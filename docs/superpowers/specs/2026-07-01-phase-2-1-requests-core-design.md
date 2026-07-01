# Этап 2.1 — Ядро заявок: спецификация

> **Goal:** Добавить в CRM АХЧ подсистему заявок: вахтёр создаёт заявку (корпус, описание, до 5 фото), директор/админ/исполнитель видят список, исполнитель берёт в работу и завершает, админ продлевает срок. Email, печать и push — в Этапе 2.2.

## Global Constraints

- Backend: Python 3.11+, FastAPI 0.111.0, SQLAlchemy 2.0.30, Pydantic 2.7.1.
- Frontend: React 19.2.6, Vite 8.0.12, Axios 1.16.1.
- База данных: PostgreSQL 15, миграции через Alembic.
- Все строки, сообщения об ошибках и комментарии — на русском языке.
- Существующие роли: `contractor`, `director`, `admin`. Новая роль: `watchman` (вахтёр).
- Минимальные изменения существующей архитектуры; новые функции — через новые роутеры `/api/requests` и новые страницы frontend.

---

## 1. Модель данных

### 1.1. `requests`

| Поле | Тип | Описание |
|---|---|---|
| `id` | Integer PK | Идентификатор |
| `building_id` | Integer FK | Корпус |
| `description` | Text | Описание проблемы |
| `status` | String(20) | `new`, `in_progress`, `completed` |
| `created_by` | Integer FK | Вахтёр, создавший заявку |
| `assigned_to` | Integer FK, nullable | Исполнитель, назначенный на заявку |
| `due_date` | Date | Срок исполнения |
| `extended_count` | Integer, default 0 | Сколько раз продляли |
| `created_at` | DateTime | Дата создания |
| `updated_at` | DateTime | Дата обновления |

### 1.2. `request_photos`

| Поле | Тип | Описание |
|---|---|---|
| `id` | Integer PK | Идентификатор |
| `request_id` | Integer FK | Заявка |
| `filename` | String(255) | Имя файла |
| `original_name` | String(255) | Оригинальное имя |
| `file_path` | String(500) | Путь к файлу |
| `file_size` | Integer | Размер в байтах |
| `mime_type` | String(50) | MIME-тип |
| `created_at` | DateTime | Дата загрузки |

Связи:
- `request.building` → `Building`
- `request.creator` → `User` (роль `watchman`)
- `request.executor` → `User` (роль `contractor`, `director` или `admin`)
- `request.photos` → `RequestPhoto` (cascade delete)

---

## 2. Роли и права

| Действие | watchman | contractor | director | admin |
|---|---|---|---|---|
| Создать заявку | ✅ | ❌ | ❌ | ❌ |
| Видеть список своих заявок | ✅ | ❌ | ❌ | ❌ |
| Видеть все заявки | ❌ | ✅ | ✅ | ✅ |
| Взять заявку в работу | ❌ | ✅ | ✅ | ✅ |
| Завершить заявку | ❌ | ✅ | ✅ | ✅ |
| Назначить исполнителя | ❌ | ❌ | ✅ | ✅ |
| Продлить срок | ❌ | ❌ | ❌ | ✅ |

---

## 3. Поток статусов

```
new ──(take/assign)──> in_progress ──(complete)──> completed
```

- Перевод в `in_progress` возможен при наличии `assigned_to`.
- При `take` исполнитель сам становится `assigned_to`.
- При `assign` директор/админ выбирают исполнителя и статус переходит в `in_progress`.
- Завершить (`completed`) может текущий исполнитель, директор или админ.

---

## 4. Сроки и продление

- `due_date = date(created_at) + 5 дней`.
- Продление: `POST /api/requests/{id}/extend`, доступно только `admin`.
- При продлении: `due_date += 5 дней`, `extended_count += 1`.
- В UI отображать:
  - срок исполнения;
  - счётчик продлений `extended_count`;
  - просрочку (цвет/бейдж), если `today > due_date` и статус не `completed`.

---

## 5. API Endpoints

Все endpoints под префиксом `/api/requests`.

### 5.1. Создание заявки

`POST /api/requests`

- Доступ: `watchman`
- Тело:
  ```json
  {
    "building_id": 1,
    "description": "Протечка крыши",
    "photos": ["<base64 или multipart>"]
  }
  ```
- Ограничения:
  - `description` обязательно, минимум 5 символов;
  - `building_id` обязательно, корпус должен быть активен;
  - фото необязательны, максимум 5;
  - фото сжимаются до 1 МБ, max 1920px, JPEG.

### 5.2. Список заявок

`GET /api/requests`

- Доступ: `contractor`, `director`, `admin`
- Query params:
  - `status` — фильтр по статусу;
  - `building_id` — фильтр по корпусу;
  - `assigned_to` — фильтр по исполнителю;
  - `date_from`, `date_to` — фильтр по дате создания.
- Для `watchman` отдельный endpoint: `GET /api/requests/my`.

### 5.3. Детали заявки

`GET /api/requests/{id}`

- Доступ: вахтёр видит только свои; остальные видят любые.

### 5.4. Взять в работу

`PUT /api/requests/{id}/take`

- Доступ: `contractor`, `director`, `admin`
- Действие: `assigned_to = current_user.id`, `status = in_progress`.
- Ошибка, если статус уже `completed`.

### 5.5. Завершить

`PUT /api/requests/{id}/complete`

- Доступ: `contractor`, `director`, `admin`
- Действие: `status = completed`.
- Исполнитель может завершить только назначенную на него заявку.
- Директор/админ могут завершить любую.

### 5.6. Назначить исполнителя

`PUT /api/requests/{id}/assign`

- Доступ: `director`, `admin`
- Тело:
  ```json
  { "user_id": 5 }
  ```
- Действие: `assigned_to = user_id`, `status = in_progress`.
- Целевой пользователь должен быть активен.

### 5.7. Продлить срок

`POST /api/requests/{id}/extend`

- Доступ: `admin`
- Действие: `due_date += 5 дней`, `extended_count += 1`.

---

## 6. Frontend

### 6.1. Маршруты

| Путь | Доступ | Описание |
|---|---|---|
| `/requests/new` | `watchman` | Форма создания заявки |
| `/requests` | `contractor`, `director`, `admin` | Список всех заявок |
| `/requests/:id` | все роли (с ограничениями) | Детали заявки |
| `/my-requests` | `watchman` | Мои заявки со статусами |

### 6.2. Форма заявки

Поля:
- Корпус (выпадающий список активных корпусов);
- Описание (textarea);
- Фото (до 5 шт., превью, удаление до отправки).

После создания — редирект на `/my-requests` с сообщением «Заявка создана».

### 6.3. Список заявок

Колонки:
- ID;
- Дата создания;
- Корпус;
- Описание (обрезанное);
- Статус (бейдж);
- Срок;
- Исполнитель;
- Действия (взять/назначить/завершить/продлить в зависимости от роли).

Фильтры: статус, корпус, период.

### 6.4. Детали заявки

- Полная информация;
- Фото;
- История действий (статус + кто + когда);
- Кнопки действий в зависимости от роли.

---

## 7. Загрузка фото

- Используется существующий `file_service.compress_image` и `save_photo`.
- Путь: `uploads/request_photos/{request_id}/{filename}`.
- Максимум 5 фото на заявку.
- URL для доступа: `/uploads/request_photos/{request_id}/{filename}`.

---

## 8. Миграции

Необходима новая Alembic-миграция:
- Создание таблиц `requests` и `request_photos`.
- Добавление роли `watchman` в таблицу `users` (на уровне приложения, не БД-ограничения).

---

## 9. Тестирование

- Backend: `pytest` с `TestClient`.
  - Создание заявки вахтёром.
  - Ограничение прав: подрядчик не может создать заявку.
  - Взятие в работу, завершение, назначение.
  - Продление срока только админом.
  - Просроченная заявка отображается корректно.
- Frontend: `npm run lint && npm run build`.

---

## 10. Out of Scope (Этап 2.2)

- Email-уведомления о новых заявках и смене статусов.
- Печать заявок в Word (одиночная и массовая).
- Push-уведомления и PWA.
