# Дизайн: аварийная срочная заявка

## Цель
Дать коменданту возможность отметить заявку как «аварийную срочную» при создании. Такие заявки визуально выделяются красным фоном в списках у всех ролей. Никакого другого влияния на бизнес-процесс не предусмотрено.

## Решения, принятые после уточнений
- Галочка доступна **только при создании** заявки. Изменять флаг позже нельзя.
- Выделение — **светло-красный фон всей строки / карточки** (`#fef2f2`).
- На сортировку, фильтрацию, push-уведомления, печать, аудит и права доступа срочность не влияет.

## Архитектура

### Backend
1. **Модель** `backend/app/models.py`, таблица `requests`:
   - Добавить `is_emergency = Column(Boolean, default=False, nullable=False, server_default='false')`.
2. **Миграция** Alembic:
   - Добавить колонку `requests.is_emergency` с `server_default='false'` для существующих записей.
3. **Схемы** `backend/app/schemas.py`:
   - `RequestCreate`: `is_emergency: bool = False`.
   - `RequestResponse`: `is_emergency: bool`.
   - `RequestListItem`: `is_emergency: bool`.
4. **Роутер** `backend/app/routers/requests.py`:
   - `build_request_response` и `build_request_list_item` включают `is_emergency` в ответ.
   - `create_request` передаёт `is_emergency` из `RequestCreate` в модель (по умолчанию `False`).

### Frontend
1. **Форма создания** `frontend/src/pages/RequestNewPage.jsx`:
   - Добавить состояние `isEmergency` и чекбокс «Аварийная срочная заявка».
   - Передавать `is_emergency` в `requestsAPI.create`.
2. **Общий список** `frontend/src/pages/RequestsListPage.jsx`:
   - Для строки таблицы (`<tr>`) и мобильной карточки (`<div style={styles.card} ...>`) при `req.is_emergency` добавлять `background: '#fef2f2'`.
3. **Мои заявки** `frontend/src/pages/MyRequestsPage.jsx`:
   - Аналогично подсвечивать строки при `req.is_emergency`.

## Данные
- Поле `is_emergency` имеет тип `BOOLEAN NOT NULL DEFAULT FALSE`.
- Для всех существующих заявок значение будет `FALSE`.
- API возвращает поле в ответах на создание, получение и список заявок.

## Ограничения и исключения
- Флаг не включается в схемы обновления `RequestUpdate` и `AdminRequestUpdate`.
- Флаг не участвует в запросах печати, отчётов, push-уведомлений и аудита.
- Фильтр по срочности не добавляется.
- Сортировка списков не меняется (срочные заявки не поднимаются автоматически).

## Тестирование и проверка
1. Запустить `pytest backend/tests` и убедиться, что тесты заявок проходят.
2. Вручную проверить:
   - Комендант создаёт заявку с галочкой → в `/requests` строка красная.
   - Заявка без галочки отображается обычным фоном.
   - В `/my-requests` срочная заявка тоже выделена красным.
   - Проверить под ролями `director`, `admin`, `contractor`, что выделение видно.
