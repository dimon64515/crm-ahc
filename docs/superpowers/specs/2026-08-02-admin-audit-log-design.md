# Дизайн: Admin Audit Log и расширенное управление заявками

**Дата:** 2026-08-02
**Статус:** Проект
**Автор:** Claude

## Обзор

Добавление функций администрирования для CRM-системы:
1. **Удаление заявок** (soft delete, admin-only)
2. **Полное редактирование заявок** (admin-only, все поля кроме технических)
3. **Полное редактирование отчётов** (уже существует, верификация)
4. **Audit log** — журнал действий админа с данными до/после

**Важное требование:** Логи должны включаться в резервные копии и восстанавливаться из них.

---

## Архитектура

### База данных

**Новая модель `AuditLog`:**

```python
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(50), nullable=False)  # created, updated, deleted, assigned, etc.
    entity_type = Column(String(50), nullable=False, index=True)  # "request", "work", "user", etc.
    entity_id = Column(Integer, nullable=True, index=True)
    old_values = Column(JSON)  # значения до изменения
    new_values = Column(JSON)  # значения после изменения
    ip_address = Column(String(50), nullable=True)  # опционально, для будущего использования
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", foreign_keys=[user_id])
```

**Изменения в `Request`:**

```python
# Добавить поле для soft delete
deleted_at = Column(DateTime, nullable=True, index=True)
```

### Backend

**Новый сервис:**
- `app/services/audit_service.py` — функции для записи логов:
  - `log_action(db, user_id, action, entity, old_values=None, new_values=None)`

**Изменения в роутерах:**
- `requests.py` — добавить `DELETE /{id}` endpoint (admin-only, soft delete)
- `requests.py` — расширить `PUT /{id}` для admin (все поля кроме id, created_at, created_by)
- Новый роутер `admin/audit_logs.py` — `GET /admin/audit-logs` endpoint (admin-only)

### Frontend

**Новые/изменённые страницы:**
- `frontend/src/pages/RequestDetailPage.jsx` — кнопка "Удалить" (admin-only)
- `frontend/src/pages/RequestDetailPage.jsx` — режим редактирования всех полей (admin-only)
- `frontend/src/pages/AdminLogsPage.jsx` — новая страница для просмотра логов (admin-only)

**Компоненты:**
- `frontend/src/components/AdminRequestForm.jsx` — форма с расширенными полями
- `frontend/src/components/LogsTable.jsx` — таблица логов с фильтрами
- Модальное окно подтверждения удаления

---

## API Design

### DELETE /api/requests/{id} (admin only)

Удаляет заявку (soft delete).

**Запрос:** `DELETE /api/requests/{id}`

**Ответ при успехе:**
```json
{
  "success": true,
  "deleted_at": "2026-08-02T10:30:00Z"
}
```

**Ошибки:**
- `404` — заявка не найдена
- `403` — недостаточно прав
- `400` — заявка уже удалена

**Логируется:**
- `action: "deleted"`
- `entity_type: "request"`
- `entity_id: request.id`
- `old_values` — все поля заявки (JSON)

---

### PUT /api/requests/{id} (admin extended)

Редактирование всех полей заявки администратором.

**Запрос:** `PUT /api/requests/{id}`

**Тело (AdminRequestUpdate):**
```json
{
  "building_id": 1,
  "service_id": 5,
  "description": "Обновлённое описание",
  "status": "in_progress",
  "assigned_to": 3,
  "due_date": "2026-08-15"
}
```

**Поля доступные для редактирования админом:**
- `building_id` — корпус
- `service_id` — вид работы
- `description` — описание
- `status` — статус (включая completed)
- `assigned_to` — исполнитель
- `due_date` — срок выполнения

**Поля НЕ доступные для редактирования:**
- `id` — первичный ключ
- `created_at` — время создания
- `created_by` — создатель

**Ответ:** `RequestResponse`

**Логируется:**
- `action: "updated"`
- `entity_type: "request"`
- `entity_id: request.id`
- `old_values` — только изменённые поля
- `new_values` — новые значения изменённых полей

---

### GET /api/admin/audit-logs (admin only)

Получение журнала действий с фильтрацией и пагинацией.

**Запрос:** `GET /api/admin/audit-logs`

**Параметры запроса:**
- `entity_type` — фильтр по типу сущности (request, work, user)
- `entity_id` — фильтр по ID сущности
- `action` — фильтр по действию (created, updated, deleted, assigned)
- `user_id` — фильтр по пользователю-исполнителю
- `date_from` — начало периода (YYYY-MM-DD)
- `date_to` — конец периода (YYYY-MM-DD)
- `page` — страница (по умолчанию 1)
- `per_page` — записей на странице (по умолчанию 50, максимум 200)

**Ответ:**
```json
{
  "items": [
    {
      "id": 1,
      "action": "deleted",
      "entity_type": "request",
      "entity_id": 42,
      "old_values": {
        "id": 42,
        "description": "Старое описание",
        "status": "completed",
        "building": {
          "id": 1,
          "number": "1",
          "name": "Корпус 1"
        }
      },
      "new_values": null,
      "user": {
        "id": 1,
        "username": "admin",
        "full_name": "Администратор"
      },
      "created_at": "2026-08-02T10:30:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "per_page": 50
}
```

**Ошибки:**
- `403` — недостаточно прав (не admin)

---

## Потоки данных

### Поток удаления заявки

```
[Admin] → DELETE /requests/{id}
           ↓
    [require_admin] проверка прав
           ↓
    [Проверка существования заявки]
           ↓
    [Проверка: deleted_at уже установлен?]
           ↓
    [Сохранение old_values → AuditLog]
           ↓
    [Установка request.deleted_at = now()]
           ↓
    [Коммит в БД]
           ↓
    [Ответ success + deleted_at]
```

### Поток редактирования заявки (admin)

```
[Admin] → PUT /requests/{id} с AdminRequestUpdate
           ↓
    [require_admin] проверка прав
           ↓
    [Проверка существования заявки]
           ↓
    [Проверка: deleted_at не установлен?]
           ↓
    [Сохранение текущего состояния → old_values]
           ↓
    [Применение изменений к разрешённым полям]
           ↓
    [Сохранение new_values → AuditLog]
           ↓
    [Коммит в БД]
           ↓
    [Ответ RequestResponse]
```

### Поток просмотра логов

```
[Admin] → GET /admin/audit-logs?entity_type=request
           ↓
    [require_admin] проверка прав
           ↓
    [Применение фильтров к query]
           ↓
    [Order by created_at DESC]
           ↓
    [Пагинация offset/limit]
           ↓
    [JSON-ответ с логами]
```

### Интеграция с бэкапами

Система бэкапов работает с PostgreSQL через `pg_dump` и `pg_restore`. Таблица `audit_logs` будет:

1. **Автоматически включена в полные бэкапы** — это стандартная таблица
2. **Восстанавливаться при восстановлении БД** — через миграции Alembic
3. **Экспортироваться при Download backups** — часть схемы `public`

Никаких дополнительных действий не требуется — стандартный SQL в дампе.

---

## Frontend компоненты

### RequestDetailPage.jsx — изменения

```jsx
// В секции действий (только для admin)
{currentUser?.role === 'admin' && (
  <ActionButton 
    onClick={handleDeleteRequest}
    variant="danger"
  >
    Удалить заявку
  </ActionButton>
)}

// В секции редактирования
{currentUser?.role === 'admin' && isEditing && (
  <AdminRequestForm
    request={request}
    buildings={buildings}
    services={services}
    users={users}
    onSave={handleAdminSave}
    onCancel={handleCancelEdit}
  />
)}
```

### AdminRequestForm.jsx — новый компонент

Форма с расширенными полями:
- Корпус (выбор из списка)
- Вид работы (выбор из списка)
- Описание (textarea)
- Статус (select: new, in_progress, completed)
- Исполнитель (выбор из списка пользователей с ролями contractor/director/admin)
- Срок выполнения (date input)

### AdminLogsPage.jsx — новая страница

```jsx
// Фильтры
<Filters>
  <FilterSelect name="entity_type" options={entityTypes} />
  <FilterSelect name="action" options={actions} />
  <FilterSelect name="user_id" options={users} />
  <DateRange name="date" />
</Filters>

// Таблица
<LogsTable
  columns={[
    { key: 'created_at', label: 'Дата' },
    { key: 'action', label: 'Действие' },
    { key: 'entity_type', label: 'Сущность' },
    { key: 'entity_id', label: 'ID' },
    { key: 'user', label: 'Пользователь' },
    { key: 'details', label: 'Детали' }
  ]}
  data={logs.items}
  onRowClick={showLogDetails}
/>

// Пагинация
<Pagination
  total={logs.total}
  page={logs.page}
  perPage={logs.per_page}
  onChange={handlePageChange}
/>
```

### Логирование в модалке

При клике на строку лога — открывается модалка с `old_values` и `new_values` в читаемом формате.

### Маршрутизация

```jsx
// Добавить в routes.jsx
{
  path: "/admin/logs",
  element: <AdminOnly><AdminLogsPage /></AdminOnly>
}
```

---

## Обработка ошибок

| Ситуация | Код | Сообщение | Действие |
|----------|-----|-----------|----------|
| Заявка не найдена | 404 | "Заявка не найдена" | - |
| Недостаточно прав | 403 | "Недостаточно прав доступа" | - |
| Заявка уже удалена | 400 | "Заявка уже удалена" | - |
| Неверный статус при редактировании | 400 | "Невозможно редактировать удалённую заявку" | - |
| Неверный building_id | 400 | "Корпус не найден или неактивен" | - |
| Неверный service_id | 400 | "Вид работы не найден или неактивен" | - |
| Неверный assigned_to | 400 | "Исполнитель не найден, неактивен или не является подрядчиком" | - |
| Ошибка записи лога | 500 | "Ошибка при записи лога" | Операция продолжается, ошибка логируется |
| Неверный формат даты | 400 | "Неверный формат даты" | - |

---

## Безопасность

1. **Только admin** — все новые endpoints используют `require_admin`
2. **Soft delete** — заявка не удаляется физически, сохраняется в логах
3. **Audit log** — каждое действие админа записывается с `old_values`/`new_values`
4. **Фильтрация удалённых** — во всех списках заявок добавляется `WHERE deleted_at IS NULL`
5. **Проверки** — редактирование/удаление только существующих заявок

---

## Тестирование

### Backend тесты

```python
# tests/test_admin_requests.py
def test_admin_delete_request_soft():
    """Проверка soft delete заявки админом"""
    ...

def test_admin_delete_request_creates_audit_log():
    """Проверка создания записи в audit log при удалении"""
    ...

def test_admin_update_all_fields():
    """Проверка редактирования всех полей админом"""
    ...

def test_admin_update_creates_audit_log():
    """Проверка создания записи в audit log при редактировании"""
    ...

def test_get_audit_logs_admin_only():
    """Проверка доступа к логам только для админа"""
    ...

def test_audit_logs_filters():
    """Проверка фильтрации логов"""
    ...

def test_deleted_request_not_in_list():
    """Проверка отсутствия удалённой заявки в списке"""
    ...
```

### Frontend тесты

```jsx
// RequestDetailPage.test.jsx
describe('AdminRequestActions', () => {
  it('renders delete button for admin', () => {});
  it('does not render delete button for non-admin', () => {});
  it('opens admin form for admin', () => {});
});

// AdminLogsPage.test.jsx
describe('AdminLogsPage', () => {
  it('renders logs table', () => {});
  it('filters by entity_type', () => {});
  it('shows log details modal', () => {});
});
```

---

## Миграции базы данных

### Alembic миграция

```python
# migrations/versions/YYYYMMDD_admin_audit_log.py

def upgrade():
    # Создаём таблицу audit_logs
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('old_values', sa.JSON(), nullable=True),
        sa.Column('new_values', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_entity_type'), 'audit_logs', ['entity_type'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_id'), 'audit_logs', ['entity_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)

    # Добавляем deleted_at в requests
    op.add_column('requests', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index(op.f('ix_requests_deleted_at'), 'requests', ['deleted_at'], unique=False)

def downgrade():
    op.drop_index(op.f('ix_requests_deleted_at'), table_name='requests')
    op.drop_column('requests', 'deleted_at')
    op.drop_index(op.f('ix_audit_logs_created_at'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_entity_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_entity_type'), table_name='audit_logs')
    op.drop_table('audit_logs')
```

---

## Порядок реализации

1. **Backend - база**
   - Модель `AuditLog`
   - Миграция
   - Сервис `audit_service.py`

2. **Backend - заявки**
   - DELETE endpoint для requests
   - Расширение PUT endpoint для admin
   - Интеграция с audit logging

3. **Backend - логи**
   - GET /admin/audit-logs endpoint
   - Схемы для ответа

4. **Frontend**
   - AdminOnly HOC/компонент
   - Кнопка удаления в RequestDetailPage
   - Форма AdminRequestForm
   - Страница AdminLogsPage
   - Навигация в Layout

5. **Тесты**
   - Backend тесты
   - Frontend тесты

---

## Открытые вопросы

Нет. Все требования уточнены.
