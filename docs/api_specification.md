# Спецификация API

## Базовый URL

```
https://report.fanat-mv.ru/api
```

## Аутентификация

Все endpoints (кроме `/auth/login`) требуют заголовок:

```
Authorization: Bearer <jwt_token>
```

## Общие форматы ответов

### Успешный ответ

```json
{
  "success": true,
  "data": { ... }
}
```

### Ошибка

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Описание ошибки",
    "details": { ... }
  }
}
```

### Коды ошибок

| Код | HTTP Status | Описание |
|-----|-------------|----------|
| `UNAUTHORIZED` | 401 | Не авторизован |
| `FORBIDDEN` | 403 | Нет прав доступа |
| `NOT_FOUND` | 404 | Ресурс не найден |
| `VALIDATION_ERROR` | 422 | Ошибка валидации данных |
| `FILE_TOO_LARGE` | 413 | Файл слишком большой |
| `INVALID_FILE_FORMAT` | 415 | Неподдерживаемый формат файла |
| `IMPORT_ERROR` | 400 | Ошибка импорта Excel |
| `INTERNAL_ERROR` | 500 | Внутренняя ошибка сервера |

---

## 1. Аутентификация

### POST /auth/login

Вход в систему.

**Request:**
```json
{
  "username": "contractor1",
  "password": "secure_password"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in": 86400,
    "user": {
      "id": 1,
      "username": "contractor1",
      "full_name": "Иванов Иван Иванович",
      "role": "contractor"
    }
  }
}
```

### GET /auth/me

Информация о текущем пользователе.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "contractor1",
    "full_name": "Иванов Иван Иванович",
    "email": "ivan@example.com",
    "role": "contractor",
    "is_active": true
  }
}
```

---

## 2. Пользователи (только admin)

### GET /users

Список пользователей.

**Query params:**
- `role` — фильтр по роли (`contractor`, `director`, `admin`)
- `search` — поиск по имени/логину
- `page` — страница (default: 1)
- `per_page` — количество на странице (default: 20)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "username": "contractor1",
        "full_name": "Иванов И.И.",
        "role": "contractor",
        "is_active": true,
        "created_at": "2025-01-15T10:00:00"
      }
    ],
    "total": 15,
    "page": 1,
    "per_page": 20
  }
}
```

### POST /users

Создание пользователя.

**Request:**
```json
{
  "username": "contractor2",
  "password": "temp_password",
  "full_name": "Петров Петр Петрович",
  "email": "petr@example.com",
  "role": "contractor",
  "phone": "+7-999-123-45-67"
}
```

### PUT /users/{id}

Редактирование пользователя.

### DELETE /users/{id}

Удаление пользователя (soft delete — `is_active = false`).

---

## 3. Корпуса

### GET /buildings

Список корпусов.

**Query params:**
- `search` — поиск по номеру/названию
- `is_active` — фильтр по активности (без параметра возвращаются все корпуса)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "number": "12",
      "name": "Корпус 12",
      "address": "ул. Примерная, д. 1"
    },
    {
      "id": 2,
      "number": "15А",
      "name": "Корпус 15А",
      "address": "ул. Примерная, д. 2"
    }
  ]
}
```

### POST /buildings (admin)

Создание корпуса.

**Request:**
```json
{
  "number": "20",
  "name": "Корпус 20",
  "address": "ул. Новая, д. 5"
}
```

### PUT /buildings/{id} (admin)

Редактирование корпуса.

### DELETE /buildings/{id} (admin)

Удаление корпуса (soft delete, `is_active = false`).

### PUT /buildings/{id}/activate (admin)

Активация ранее деактивированного корпуса (`is_active = true`).

---

## 4. Справочник услуг / видов работ

### GET /services

Список видов работ.

**Query params:**
- `search` — поиск по названию (autocomplete)
- `is_active` — фильтр (default: true)
- `page` — страница
- `per_page` — количество (default: 50)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "name": "Монтаж трубы",
        "unit": "м",
        "price": 350.00,
        "is_active": true
      }
    ],
    "total": 150
  }
}
```

### GET /services/{id}

Детали вида работы.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Монтаж трубы",
    "unit": "м",
    "price": 350.00,
    "is_active": true,
    "created_at": "2025-01-01T00:00:00",
    "updated_at": "2025-05-20T10:00:00"
  }
}
```

### POST /services/import (admin)

Импорт видов работ из Excel.

**Content-Type:** `multipart/form-data`

**Request:**
- `file` — файл .xlsx

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_rows": 150,
    "created": 45,
    "updated": 105,
    "errors": 0,
    "message": "Импорт завершён успешно"
  }
}
```

### POST /services (admin)

Ручное создание записи.

### PUT /services/{id} (admin)

Ручное редактирование.

### DELETE /services/{id} (admin)

Soft delete.

---

## 5. Справочник материалов

### GET /materials

Список материалов.

**Query params:**
- `search` — поиск по названию (autocomplete)
- `is_active` — фильтр (default: true)
- `page` — страница
- `per_page` — количество (default: 50)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "name": "Труба из полипропилена армированная стекловолокном 20 мм",
        "unit": "Метр",
        "price": 217.06,
        "is_active": true
      }
    ],
    "total": 500
  }
}
```

### GET /materials/{id}

Детали материала.

### POST /materials/import (admin)

Импорт материалов из Excel.

**Content-Type:** `multipart/form-data`

**Request:**
- `file` — файл .xlsx

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_rows": 500,
    "created": 120,
    "updated": 380,
    "errors": 2,
    "error_details": [
      "Строка 45: отсутствует цена",
      "Строка 128: дублирующее наименование"
    ]
  }
}
```

### POST /materials (admin)

Ручное создание.

### PUT /materials/{id} (admin)

Ручное редактирование.

### DELETE /materials/{id} (admin)

Soft delete.

---

## 6. Работы (основной модуль)

### POST /works

Создание записи о работе.

**Request:**
```json
{
  "building_id": 1,
  "work_date": "2025-05-27",
  "service_id": 5,
  "service_quantity": 15.5,
  "description": "Замена трубопровода в подвале",
  "materials": [
    {
      "material_id": 12,
      "quantity": 15.5
    },
    {
      "material_id": 34,
      "quantity": 3
    }
  ]
}
```

**Валидация:**
- `building_id` — обязательно
- `work_date` — обязательно, не в будущем
- `service_id` — обязательно
- `service_quantity` — обязательно, > 0
- `description` — обязательно, минимум 5 символов
- `materials` — опционально, каждый элемент должен иметь `material_id` и `quantity > 0`

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "building": {
      "id": 1,
      "number": "12",
      "name": "Корпус 12"
    },
    "work_date": "2025-05-27",
    "service": {
      "id": 5,
      "name": "Монтаж трубы",
      "unit": "м"
    },
    "service_quantity": 15.5,
    "service_unit_price": 350.00,
    "service_total_price": 5425.00,
    "description": "Замена трубопровода в подвале",
    "materials": [
      {
        "material_id": 12,
        "name": "Труба ПП 20 мм",
        "unit": "Метр",
        "quantity": 15.5,
        "unit_price": 217.06,
        "total_price": 3364.43
      },
      {
        "material_id": 34,
        "name": "Фитинг угловой",
        "unit": "шт",
        "quantity": 3,
        "unit_price": 89.50,
        "total_price": 268.50
      }
    ],
    "materials_total_price": 3632.93,
    "total_price": 9057.93,
    "photos_count": 0,
    "files_count": 0,
    "created_at": "2025-05-27T14:30:22",
    "created_by": {
      "id": 1,
      "full_name": "Иванов И.И."
    }
  }
}
```

### GET /works

Список работ.

**Примечание:** подрядчик (`contractor`) видит только свои записи. `director` и `admin` видят все записи.

**Query params:**

**Query params:**
- `date_from` — дата с (YYYY-MM-DD)
- `date_to` — дата по (YYYY-MM-DD)
- `building_id` — фильтр по корпусу
- `service_id` — фильтр по виду работ
- `user_id` — фильтр по подрядчику
- `search` — поиск по описанию
- `page` — страница (default: 1)
- `per_page` — количество (default: 50)
- `sort_by` — сортировка (`date`, `created`, `price`)
- `sort_order` — направление (`asc`, `desc`)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "total": 250,
    "page": 1,
    "per_page": 50,
    "summary": {
      "total_works": 250,
      "total_service_price": 125000.00,
      "total_materials_price": 89000.00,
      "total_price": 214000.00
    }
  }
}
```

### GET /works/{id}

Детали работы.

### PUT /works/{id}

Частичное редактирование работы: описание, дата работы, количество услуги.

**Доступ:**
- `contractor` — только свои записи (`work.user_id == current_user.id`)
- `admin` — любые записи
- `director` — только просмотр, редактирование недоступно

**Request:**
```json
{
  "description": "Обновлённое описание",
  "service_quantity": 20.5,
  "work_date": "2025-05-28"
}
```

### DELETE /works/{id}

Удаление работы.

**Доступ:**
- `contractor` — только свои записи
- `admin` — любые записи
- `director` — только просмотр, удаление недоступно

---

## 7. Фото и файлы

### POST /works/{id}/photos

Загрузка фото.

**Content-Type:** `multipart/form-data`

**Request:**
- `files` — массив файлов (до 20 шт., до 10 МБ каждый)

**Доступ:**
- `contractor` — может загружать фото только к своим записям (`work.user_id == current_user.id`)
- `director`, `admin` — могут загружать фото к любым записям

**Response (200):
```json
{
  "success": true,
  "data": {
    "uploaded": 3,
    "photos": [
      {
        "id": 1,
        "filename": "20250527_143022_a1b2c3.jpg",
        "original_name": "IMG_001.jpg",
        "file_path": "/uploads/photos/building_12/20250527_143022_a1b2c3.jpg",
        "file_size": 2048000,
        "url": "https://report.fanat-mv.ru/uploads/photos/building_12/20250527_143022_a1b2c3.jpg"
      }
    ]
  }
}
```

### POST /works/{id}/files

Загрузка документов.

**Content-Type:** `multipart/form-data`

**Request:**
- `files` — массив файлов

**Response (200):** аналогично фото.

### DELETE /works/{work_id}/photos/{photo_id}

Удаление фото.

### DELETE /works/{work_id}/files/{file_id}

Удаление файла.

---

## 8. Отчёты

### GET /reports/summary

Сводный отчёт (группировка).

**Query params:**
- `date_from` — дата с
- `date_to` — дата по
- `group_by` — группировка (`building`, `service`, `date`, `contractor`)
- `building_id` — фильтр по корпусу

**Response (200):**
```json
{
  "success": true,
  "data": {
    "group_by": "building",
    "items": [
      {
        "group_key": "12",
        "group_name": "Корпус 12",
        "works_count": 45,
        "service_total": 75000.00,
        "materials_total": 52000.00,
        "total": 127000.00
      },
      {
        "group_key": "15А",
        "group_name": "Корпус 15А",
        "works_count": 32,
        "service_total": 50000.00,
        "materials_total": 37000.00,
        "total": 87000.00
      }
    ],
    "totals": {
      "works_count": 77,
      "service_total": 125000.00,
      "materials_total": 89000.00,
      "total": 214000.00
    }
  }
}
```

### GET /reports/export

Выгрузка таблицы работ в Excel.

**Query params:**
- `date_from` — дата с
- `date_to` — дата по
- `building_id` — фильтр по корпусу
- `service_id` — фильтр по виду работ
- `user_id` — фильтр по подрядчику

**Response:** `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

Файл: `works_report_2025-05-01_2025-05-27.xlsx`

### GET /reports/summary/export

Выгрузка сводного отчёта в Excel.

**Query params:**
- `date_from` — дата с
- `date_to` — дата по
- `group_by` — группировка (`building`, `service`, `date`, `contractor`)

**Response:** Excel-файл.

---

## 9. Редактирование цен (только admin)

### PUT /works/{id}/prices

Редактирование цен в записи работы.

**Доступ:** только `admin`

**Request:**
```json
{
  "service_unit_price": 400.00,
  "materials": [
    {
      "material_id": 12,
      "unit_price": 250.00
    }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "service_unit_price": 400.00,
    "service_total_price": 6200.00,
    "materials_total_price": 4143.43,
    "total_price": 10343.43
  }
}
```

**Примечание:** При изменении цены автоматически пересчитываются `service_total_price`, `materials_total_price` и `total_price`.

---

## 10. Бэкапы

### POST /backups/photos

Создание архива фотографий.

**Доступ:** `director`, `admin`

**Request:**
```json
{
  "date_from": "2025-01-01",
  "date_to": "2025-05-27",
  "building_id": 12,
  "split_size_mb": 300
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "backup_id": "bkp_20250527_143022",
    "total_files": 1250,
    "total_size_mb": 850,
    "parts": 3,
    "files": [
      {
        "part": 1,
        "filename": "photos_backup_20250527_143022_part1.zip",
        "size_mb": 300,
        "url": "/api/backups/download/bkp_20250527_143022/part1"
      },
      {
        "part": 2,
        "filename": "photos_backup_20250527_143022_part2.zip",
        "size_mb": 300,
        "url": "/api/backups/download/bkp_20250527_143022/part2"
      },
      {
        "part": 3,
        "filename": "photos_backup_20250527_143022_part3.zip",
        "size_mb": 250,
        "url": "/api/backups/download/bkp_20250527_143022/part3"
      }
    ]
  }
}
```

### POST /backups/full

Создание полного бэкапа системы.

**Доступ:** `admin`

**Request:**
```json
{
  "include_photos": true,
  "include_files": true,
  "split_size_mb": 300
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "backup_id": "full_20250527_143022",
    "contents": {
      "database_dump": "backup.sql",
      "photos_count": 1250,
      "files_count": 340,
      "materials_export": "materials.xlsx",
      "services_export": "services.xlsx"
    },
    "total_size_mb": 1250,
    "parts": 5,
    "files": [
      {
        "part": 1,
        "filename": "full_backup_20250527_143022_part1.zip",
        "size_mb": 300,
        "url": "/api/backups/download/full_20250527_143022/part1"
      }
    ]
  }
}
```

### POST /backups/restore

Восстановление системы из бэкапа.

**Content-Type:** `multipart/form-data`

**Request:**
- `files` — части архива бэкапа (все part-файлы)
- `backup_type` — `"full"` или `"photos"`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "restored": {
      "database": true,
      "photos_count": 1250,
      "files_count": 340,
      "materials_count": 500,
      "services_count": 150
    },
    "message": "Восстановление завершено успешно"
  }
}
```

### GET /backups

История бэкапов.

**Доступ:** `director`, `admin`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "full_20250527_143022",
        "type": "full",
        "created_at": "2025-05-27T14:30:22",
        "created_by": "admin",
        "size_mb": 1250,
        "parts": 5,
        "status": "completed"
      }
    ]
  }
}
```

### DELETE /backups/{backup_id}

Удаление архива бэкапа.

**Доступ:** `admin`

### GET /backups/download/{backup_id}

Скачивание архива.

**Доступ:** `director`, `admin`
