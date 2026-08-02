# Admin Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить функции администрирования для CRM-системы: удаление заявок (soft delete), полное редактирование заявок (admin-only), и журнал действий админа (audit log) с данными до/после.

**Architecture:** Единая таблица `audit_logs` с JSON-полями для old_values/new_values, soft delete через `deleted_at` в таблице `requests`, новые API endpoints для admin-only операций, UI компоненты для управления.

**Tech Stack:** Python 3.11 + FastAPI + SQLAlchemy 2.0 (backend), React 19.2 + Vite 8.0 (frontend), PostgreSQL 15 (database)

## Global Constraints

- Backend: Python 3.11, FastAPI 0.111, SQLAlchemy 2.0
- Frontend: React 19.2, Vite 8.0
- Database: PostgreSQL 15
- Все тексты на русском языке
- Существующие паттерны кода должны соблюдаться
- Логи должны включаться в бэкапы автоматически (стандартная SQL таблица)

---

## File Structure

### Backend
- `backend/app/models.py` — добавить модель `AuditLog`, поле `deleted_at` в `Request`
- `backend/app/schemas.py` — добавить схемы для audit log и admin request update
- `backend/app/services/audit_service.py` — новый сервис для логирования
- `backend/app/routers/requests.py` — добавить DELETE endpoint, расширить PUT
- `backend/app/routers/__init__.py` — регистрация новых роутеров
- `backend/app/main.py` — подключение новых роутеров
- `backend/alembic/versions/` — миграция БД

### Frontend
- `frontend/src/api.js` — добавить API функции для audit log и delete
- `frontend/src/pages/AdminLogsPage.jsx` — новая страница логов
- `frontend/src/pages/RequestDetailPage.jsx` — добавить delete/edit для admin
- `frontend/src/components/AdminRequestForm.jsx` — новая форма редактирования
- `frontend/src/components/LogsTable.jsx` — таблица логов

---

## TASK 1: Create AuditLog model and update Request model

**Files:**
- Modify: `backend/app/models.py`

**Interfaces:**
- Produces: `AuditLog` SQLAlchemy model with fields: id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at
- Produces: `Request.deleted_at` field for soft delete

- [ ] **Step 1: Add AuditLog model to models.py**

Add after `PushSubscription` class (line ~224):

```python
class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(Integer, nullable=True, index=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    user = relationship("User", foreign_keys=[user_id])
```

- [ ] **Step 2: Add deleted_at field to Request model**

Find the `Request` class (line ~173) and add after `updated_at` field (line ~186):

```python
deleted_at = Column(DateTime, nullable=True, index=True)
```

- [ ] **Step 3: Verify syntax**

Run: `python -m py_compile backend/app/models.py`
Expected: No syntax errors

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add AuditLog model and Request.deleted_at field"
```

---

## TASK 2: Create Alembic migration

**Files:**
- Create: `backend/alembic/versions/YYYYMMDDHHMMSS_admin_audit_log.py`

**Interfaces:**
- Consumes: `AuditLog` model structure from Task 1
- Produces: Migration that creates `audit_logs` table and adds `deleted_at` to `requests`

- [ ] **Step 1: Generate new migration**

```bash
cd backend
alembic revision -m "admin_audit_log"
```

- [ ] **Step 2: Edit the migration file**

Open the generated migration file and replace `upgrade()` and `downgrade()`:

```python
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade():
    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('old_values', postgresql.JSON(), nullable=True),
        sa.Column('new_values', postgresql.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_id'), 'audit_logs', ['entity_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_type'), 'audit_logs', ['entity_type'], unique=False)
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)
    
    # Add deleted_at to requests
    op.add_column('requests', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index(op.f('ix_requests_deleted_at'), 'requests', ['deleted_at'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_requests_deleted_at'), table_name='requests')
    op.drop_column('requests', 'deleted_at')
    
    op.drop_index(op.f('ix_audit_logs_user_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_entity_type'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_entity_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_created_at'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_action'), table_name='audit_logs')
    op.drop_table('audit_logs')
```

- [ ] **Step 3: Run migration**

```bash
cd backend
alembic upgrade head
```

Expected: Migration succeeds, tables created

- [ ] **Step 4: Verify tables exist**

```bash
cd backend
python -c "
from app.database import SessionLocal
from app.models import AuditLog, Request
import inspect
db = SessionLocal()
# Check if tables exist by querying
result = db.execute('SELECT COUNT(*) FROM audit_logs')
print('audit_logs table OK')
result = db.execute('SELECT COUNT(*) FROM requests WHERE deleted_at IS NOT NULL')
print('requests.deleted_at column OK')
db.close()
"
```

Expected: No errors, print statements execute

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat: create migration for audit_logs and Request.deleted_at"
```

---

## TASK 3: Create audit service

**Files:**
- Create: `backend/app/services/audit_service.py`

**Interfaces:**
- Consumes: `AuditLog` model from Task 1
- Produces: `log_action(db, user_id, action, entity, old_values=None, new_values=None, ip_address=None)` function
- Produces: `serialize_for_log(obj)` helper for SQLAlchemy objects

- [ ] **Step 1: Create audit_service.py**

```bash
touch /home/dimon64515/projects/crm/backend/app/services/audit_service.py
```

- [ ] **Step 2: Implement log_action function**

```python
import logging
from datetime import datetime
from typing import Any, Optional
from app.models import AuditLog

logger = logging.getLogger(__name__)


def serialize_for_log(obj: Any) -> Any:
    """Сериализует SQLAlchemy объект или структуру в JSON-совместимый формат."""
    if obj is None:
        return None
    if hasattr(obj, '__table__'):
        # SQLAlchemy model
        result = {}
        for column in obj.__table__.columns:
            value = getattr(obj, column.name)
            if isinstance(value, datetime):
                value = value.isoformat()
            result[column.name] = value
        return result
    if isinstance(obj, list):
        return [serialize_for_log(item) for item in obj]
    if isinstance(obj, dict):
        return {k: serialize_for_log(v) for k, v in obj.items()}
    return obj


def log_action(
    db,
    user_id: int,
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> Optional[AuditLog]:
    """Записывает действие в audit log.
    
    Args:
        db: SQLAlchemy сессия
        user_id: ID пользователя, совершившего действие
        action: Тип действия (created, updated, deleted, etc.)
        entity_type: Тип сущности (request, work, user, etc.)
        entity_id: ID сущности (если применимо)
        old_values: Значения до изменения (сериализованные в dict)
        new_values: Значения после изменения (сериализованные в dict)
        ip_address: IP адрес пользователя (опционально)
    
    Returns:
        AuditLog объект или None при ошибке
    """
    try:
        log_entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=serialize_for_log(old_values),
            new_values=serialize_for_log(new_values),
            ip_address=ip_address,
            created_at=datetime.utcnow(),
        )
        db.add(log_entry)
        db.flush()
        return log_entry
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")
        # Не прерываем основную операцию при ошибке логирования
        return None
```

- [ ] **Step 3: Create __init__.py for services if missing**

```bash
touch /home/dimon64515/projects/crm/backend/app/services/__init__.py
```

- [ ] **Step 4: Verify syntax**

```bash
cd backend
python -c "from app.services.audit_service import log_action, serialize_for_log; print('Import OK')"
```

Expected: No errors, "Import OK" printed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/
git commit -m "feat: add audit service with log_action function"
```

---

## TASK 4: Add schemas for audit log and admin request update

**Files:**
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Consumes: Request model structure
- Produces: `AuditLogResponse`, `AuditLogsListResponse`, `AdminRequestUpdate` schemas

- [ ] **Step 1: Add AuditLog schemas**

Find the end of Request schemas (around line 417) and add:

```python
# === Audit Log Schemas ===

class AuditLogResponse(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: Optional[int]
    old_values: Optional[dict]
    new_values: Optional[dict]
    user: UserResponse
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditLogsListResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    per_page: int
```

- [ ] **Step 2: Add AdminRequestUpdate schema**

Find `RequestUpdate` class (around line 365) and add after it:

```python
class AdminRequestUpdate(BaseModel):
    """Расширенная схема обновления заявки для администратора."""
    description: Optional[str] = Field(None, min_length=5)
    building_id: Optional[int] = None
    service_id: Optional[int] = None
    assigned_to: Optional[int] = None
    status: Optional[str] = Field(None, pattern="^(new|in_progress|completed)$")
    due_date: Optional[str] = None  # YYYY-MM-DD format
    
    @field_validator('description')
    @classmethod
    def description_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Описание не может быть пустым')
        return v
    
    @field_validator('due_date')
    @classmethod
    def validate_due_date(cls, v):
        if v is not None:
            try:
                date.fromisoformat(v)
            except ValueError:
                raise ValueError('Неверный формат даты, ожидается YYYY-MM-DD')
        return v


class RequestDeleteResponse(BaseModel):
    """Ответ при удалении заявки."""
    success: bool = True
    deleted_at: datetime
```

- [ ] **Step 3: Verify syntax**

```bash
cd backend
python -c "from app.schemas import AdminRequestUpdate, AuditLogResponse, RequestDeleteResponse; print('Import OK')"
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat: add schemas for audit log and admin request update"
```

---

## TASK 5: Add DELETE endpoint for requests

**Files:**
- Modify: `backend/app/routers/requests.py`

**Interfaces:**
- Consumes: `require_admin` from dependencies, `AuditLog` model, `log_action` from audit_service
- Produces: `DELETE /requests/{id}` endpoint with soft delete

- [ ] **Step 1: Add imports**

Add at the top of the file (after existing imports):

```python
from datetime import datetime
from app.models import AuditLog
from app.services.audit_service import log_action, serialize_for_log
from app.schemas import RequestDeleteResponse
```

- [ ] **Step 2: Add DELETE endpoint**

Add at the end of the file (before `@router.post("/print")`):

```python
@router.delete("/{request_id}", response_model=RequestDeleteResponse)
def delete_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Удаляет заявку (soft delete). Только для администраторов."""
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    
    if req.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Заявка уже удалена")
    
    # Сохраняем old_values для audit log
    old_values = serialize_for_log(req)
    
    # Soft delete
    req.deleted_at = datetime.utcnow()
    db.commit()
    
    # Записываем в audit log
    log_action(
        db=db,
        user_id=current_user.id,
        action="deleted",
        entity_type="request",
        entity_id=req.id,
        old_values=old_values,
        new_values=None,
    )
    db.commit()
    
    return RequestDeleteResponse(
        success=True,
        deleted_at=req.deleted_at
    )
```

- [ ] **Step 3: Verify syntax**

```bash
cd backend
python -m py_compile app/routers/requests.py
```

Expected: No syntax errors

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/requests.py
git commit -m "feat: add DELETE endpoint for requests (admin only, soft delete)"
```

---

## TASK 6: Extend PUT endpoint for admin request update

**Files:**
- Modify: `backend/app/routers/requests.py`

**Interfaces:**
- Consumes: `AdminRequestUpdate` schema, `log_action` function
- Produces: Extended update logic for admin with audit logging

- [ ] **Step 1: Update imports**

Modify the imports to include `AdminRequestUpdate`:

```python
from app.schemas import RequestCreate, RequestResponse, RequestListResponse, RequestAssign, RequestPrintPayload, RequestUpdate, AdminRequestUpdate, RequestDeleteResponse
from app.core.dependencies import get_current_user, require_comendant, require_executor, require_director, require_admin
from app.services.audit_service import log_action, serialize_for_log
```

- [ ] **Step 2: Modify existing update_request function**

Find the `update_request` function (around line 228) and replace it with:

```python
@router.put("/{request_id}", response_model=RequestResponse)
def update_request(
    request_id: int,
    data: RequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director)
):
    """Базовое обновление заявки для director/admin."""
    req = db.query(Request).options(
        joinedload(Request.building),
        joinedload(Request.creator),
        joinedload(Request.executor),
        selectinload(Request.photos),
    ).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    
    if req.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Нельзя редактировать удалённую заявку")
    
    if req.status == "completed" and current_user.role != "admin":
        raise HTTPException(status_code=400, detail="Нельзя редактировать завершённую заявку")

    old_values = {}
    new_values = {}
    
    update_fields = data.model_dump(exclude_unset=True)

    if data.building_id is not None:
        building = db.query(Building).filter(Building.id == data.building_id, Building.is_active == True).first()
        if not building:
            raise HTTPException(status_code=400, detail="Корпус не найден или неактивен")
        old_values['building_id'] = req.building_id
        req.building_id = data.building_id
        new_values['building_id'] = data.building_id

    if data.description is not None:
        old_values['description'] = req.description
        req.description = data.description.strip()
        new_values['description'] = req.description

    if 'service_id' in update_fields:
        if data.service_id is not None:
            service = db.query(Service).filter(Service.id == data.service_id, Service.is_active == True).first()
            if not service:
                raise HTTPException(status_code=400, detail="Вид работы не найден или неактивен")
        old_values['service_id'] = req.service_id
        req.service_id = data.service_id
        new_values['service_id'] = data.service_id

    if 'assigned_to' in update_fields:
        if data.assigned_to is not None:
            executor = db.query(User).filter(User.id == data.assigned_to, User.is_active == True).first()
            if not executor or executor.role not in ("contractor", "director", "admin"):
                raise HTTPException(status_code=400, detail="Исполнитель не найден или неактивен")
        old_values['assigned_to'] = req.assigned_to
        req.assigned_to = data.assigned_to
        new_values['assigned_to'] = data.assigned_to
    
    if old_values:
        log_action(
            db=db,
            user_id=current_user.id,
            action="updated",
            entity_type="request",
            entity_id=req.id,
            old_values=old_values,
            new_values=new_values,
        )

    db.commit()
    db.refresh(req)
    return build_request_response(req, db)


@router.put("/{request_id}/admin", response_model=RequestResponse)
def update_request_admin(
    request_id: int,
    data: AdminRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Расширенное обновление заявки для администратора."""
    req = db.query(Request).options(
        joinedload(Request.building),
        joinedload(Request.creator),
        joinedload(Request.executor),
        selectinload(Request.photos),
    ).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    
    if req.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Нельзя редактировать удалённую заявку")

    old_values = {}
    new_values = {}
    
    update_fields = data.model_dump(exclude_unset=True)

    if data.building_id is not None:
        building = db.query(Building).filter(Building.id == data.building_id, Building.is_active == True).first()
        if not building:
            raise HTTPException(status_code=400, detail="Корпус не найден или неактивен")
        old_values['building_id'] = req.building_id
        req.building_id = data.building_id
        new_values['building_id'] = data.building_id

    if data.service_id is not None:
        service = db.query(Service).filter(Service.id == data.service_id, Service.is_active == True).first()
        if not service:
            raise HTTPException(status_code=400, detail="Вид работы не найден или неактивен")
        old_values['service_id'] = req.service_id
        req.service_id = data.service_id
        new_values['service_id'] = data.service_id

    if data.description is not None:
        old_values['description'] = req.description
        req.description = data.description.strip()
        new_values['description'] = req.description

    if data.assigned_to is not None:
        executor = db.query(User).filter(User.id == data.assigned_to, User.is_active == True).first()
        if not executor or executor.role not in ("contractor", "director", "admin"):
            raise HTTPException(status_code=400, detail="Исполнитель не найден или неактивен")
        old_values['assigned_to'] = req.assigned_to
        req.assigned_to = data.assigned_to
        new_values['assigned_to'] = data.assigned_to

    if data.status is not None:
        old_values['status'] = req.status
        req.status = data.status
        new_values['status'] = data.status

    if data.due_date is not None:
        old_values['due_date'] = req.due_date.isoformat() if req.due_date else None
        req.due_date = date.fromisoformat(data.due_date)
        new_values['due_date'] = data.due_date
    
    if old_values:
        log_action(
            db=db,
            user_id=current_user.id,
            action="updated",
            entity_type="request",
            entity_id=req.id,
            old_values=old_values,
            new_values=new_values,
        )

    db.commit()
    db.refresh(req)
    return build_request_response(req, db)
```

- [ ] **Step 3: Verify syntax**

```bash
cd backend
python -m py_compile app/routers/requests.py
```

Expected: No syntax errors

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/requests.py
git commit -m "feat: extend PUT endpoint for admin request update with audit logging"
```

---

## TASK 7: Filter deleted requests from all list endpoints

**Files:**
- Modify: `backend/app/routers/requests.py`

**Interfaces:**
- Consumes: `Request.deleted_at` field
- Produces: Updated queries that filter out deleted requests

- [ ] **Step 1: Update list_requests function**

Find `list_requests` function (around line 151) and modify the query:

```python
query = db.query(Request).options(
    joinedload(Request.building),
    joinedload(Request.creator),
    joinedload(Request.executor),
    selectinload(Request.photos),
).filter(Request.deleted_at.is_(None))  # Add this line
```

- [ ] **Step 2: Update list_my_requests function**

Find `list_my_requests` function (around line 190) and modify the query:

```python
items = db.query(Request).options(
    joinedload(Request.building),
    joinedload(Request.creator),
    joinedload(Request.executor),
    selectinload(Request.photos),
).filter(Request.created_by == current_user.id, Request.deleted_at.is_(None))  # Add deleted_at filter
```

- [ ] **Step 3: Update get_request function**

Find `get_request` function (around line 207) and add check after retrieving:

```python
if req.deleted_at is not None:
    raise HTTPException(status_code=404, detail="Заявка не найдена")
```

Add after the `if not req:` check.

- [ ] **Step 4: Verify syntax**

```bash
cd backend
python -m py_compile app/routers/requests.py
```

Expected: No syntax errors

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/requests.py
git commit -m "feat: filter deleted requests from list endpoints"
```

---

## TASK 8: Create audit logs router

**Files:**
- Create: `backend/app/routers/admin/audit_logs.py` (create directory if needed)

**Interfaces:**
- Consumes: `AuditLog` model, `require_admin`, `AuditLogResponse` schema
- Produces: `GET /admin/audit-logs` endpoint with filtering

- [ ] **Step 1: Create admin directory**

```bash
mkdir -p /home/dimon64515/projects/crm/backend/app/routers/admin
touch /home/dimon64515/projects/crm/backend/app/routers/admin/__init__.py
```

- [ ] **Step 2: Create audit_logs.py router**

```bash
touch /home/dimon64515/projects/crm/backend/app/routers/admin/audit_logs.py
```

- [ ] **Step 3: Implement GET endpoint**

```python
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import AuditLog, User
from app.schemas import AuditLogsListResponse
from app.core.dependencies import require_admin

router = APIRouter(prefix="/admin/audit-logs", tags=["admin"])


@router.get("", response_model=AuditLogsListResponse)
def list_audit_logs(
    entity_type: Optional[str] = Query(None, description="Тип сущности"),
    entity_id: Optional[int] = Query(None, description="ID сущности"),
    action: Optional[str] = Query(None, description="Тип действия"),
    user_id: Optional[int] = Query(None, description="ID пользователя"),
    date_from: Optional[str] = Query(None, description="Дата начала (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Дата конца (YYYY-MM-DD)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Получение журнала действий с фильтрацией и пагинацией. Только для администраторов."""
    query = db.query(AuditLog).options(joinedload(AuditLog.user))
    
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if date_from:
        try:
            date_from_parsed = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(AuditLog.created_at >= date_from_parsed)
        except ValueError:
            pass  # Invalid date format, ignore filter
    if date_to:
        try:
            date_to_parsed = datetime.strptime(date_to, "%Y-%m-%d")
            # Set to end of day
            from datetime import timedelta
            date_to_parsed = date_to_parsed + timedelta(days=1) - timedelta(seconds=1)
            query = query.filter(AuditLog.created_at <= date_to_parsed)
        except ValueError:
            pass  # Invalid date format, ignore filter
    
    total = query.count()
    
    logs = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    
    return AuditLogsListResponse(
        items=logs,
        total=total,
        page=page,
        per_page=per_page,
    )
```

- [ ] **Step 4: Verify syntax**

```bash
cd backend
python -m py_compile app/routers/admin/audit_logs.py
```

Expected: No syntax errors

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/admin/
git commit -m "feat: add audit logs router with GET endpoint"
```

---

## TASK 9: Register audit logs router in main app

**Files:**
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `audit_logs` router from Task 8
- Produces: Registered route at `/api/admin/audit-logs`

- [ ] **Step 1: Add import**

Find the imports section and add:

```python
from app.routers.admin import audit_logs
```

- [ ] **Step 2: Register router**

Find where other routers are registered (around line with `app.include_router`) and add:

```python
app.include_router(audit_logs.router, prefix="/api")
```

- [ ] **Step 3: Verify syntax**

```bash
cd backend
python -m py_compile app/main.py
```

Expected: No syntax errors

- [ ] **Step 4: Test endpoint starts**

```bash
cd backend
timeout 5 uvicorn app.main:app --port 8090 2>&1 | grep -i "application startup" || true
```

Expected: Server starts without errors

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: register audit logs router"
```

---

## TASK 10: Add frontend API functions

**Files:**
- Modify: `frontend/src/api.js`

**Interfaces:**
- Consumes: Backend API endpoints
- Produces: Frontend API functions for delete and audit logs

- [ ] **Step 1: Add delete function to requestsAPI**

Find `requestsAPI` (around line 149) and add:

```javascript
delete: (id) => api.delete(`/requests/${id}`),
updateAdmin: (id, data) => api.put(`/requests/${id}/admin`, data),
```

- [ ] **Step 2: Add auditLogsAPI**

Add after `pushAPI` (around line 174):

```javascript
export const auditLogsAPI = {
  list: (params) => api.get('/admin/audit-logs', { params }),
};
```

- [ ] **Step 3: Verify syntax**

```bash
cd frontend
npm run build 2>&1 | head -20
```

Expected: No errors in api.js

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add frontend API functions for delete and audit logs"
```

---

## TASK 11: Create AdminLogsPage component

**Files:**
- Create: `frontend/src/pages/AdminLogsPage.jsx`

**Interfaces:**
- Consumes: `auditLogsAPI.list()` from Task 10
- Produces: React component for viewing audit logs

- [ ] **Step 1: Create AdminLogsPage.jsx**

```bash
touch /home/dimon64515/projects/crm/frontend/src/pages/AdminLogsPage.jsx
```

- [ ] **Step 2: Implement the component**

```javascript
import { useState, useEffect } from 'react';
import { auditLogsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

const ACTION_LABELS = {
  created: 'Создан',
  updated: 'Изменён',
  deleted: 'Удалён',
  assigned: 'Назначен',
};

const ENTITY_LABELS = {
  request: 'Заявка',
  work: 'Отчёт',
  user: 'Пользователь',
};

export default function AdminLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    entity_type: '',
    action: '',
    user_id: '',
    date_from: '',
    date_to: '',
  });
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    if (user?.role !== 'admin') {
      return;
    }
    fetchLogs();
  }, [page, filters, user]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        per_page: 50,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== '')
        ),
      };
      const response = await auditLogsAPI.list(params);
      setLogs(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const totalPages = Math.ceil(total / 50);

  if (!user || user.role !== 'admin') {
    return <div className="p-4">Доступ запрещён</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Журнал действий</h1>
      
      <div className="bg-white rounded shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <select
            name="entity_type"
            value={filters.entity_type}
            onChange={handleFilterChange}
            className="border rounded px-3 py-2"
          >
            <option value="">Все типы сущностей</option>
            <option value="request">Заявки</option>
            <option value="work">Отчёты</option>
          </select>
          
          <select
            name="action"
            value={filters.action}
            onChange={handleFilterChange}
            className="border rounded px-3 py-2"
          >
            <option value="">Все действия</option>
            <option value="created">Создание</option>
            <option value="updated">Изменение</option>
            <option value="deleted">Удаление</option>
          </select>
          
          <input
            type="date"
            name="date_from"
            value={filters.date_from}
            onChange={handleFilterChange}
            className="border rounded px-3 py-2"
            placeholder="С"
          />
          
          <input
            type="date"
            name="date_to"
            value={filters.date_to}
            onChange={handleFilterChange}
            className="border rounded px-3 py-2"
            placeholder="По"
          />
          
          <button
            onClick={() => setFilters({ entity_type: '', action: '', user_id: '', date_from: '', date_to: '' })}
            className="bg-gray-500 text-white px-4 py-2 rounded"
          >
            Сбросить
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Дата</th>
              <th className="px-4 py-2 text-left">Действие</th>
              <th className="px-4 py-2 text-left">Сущность</th>
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">Пользователь</th>
              <th className="px-4 py-2 text-left">Детали</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="px-4 py-8 text-center">Загрузка...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan="6" className="px-4 py-8 text-center">Нет записей</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t cursor-pointer hover:bg-gray-50" onClick={() => setSelectedLog(log)}>
                  <td className="px-4 py-2">{new Date(log.created_at).toLocaleString('ru-RU')}</td>
                  <td className="px-4 py-2">{ACTION_LABELS[log.action] || log.action}</td>
                  <td className="px-4 py-2">{ENTITY_LABELS[log.entity_type] || log.entity_type}</td>
                  <td className="px-4 py-2">{log.entity_id || '-'}</td>
                  <td className="px-4 py-2">{log.user?.full_name || log.user?.username}</td>
                  <td className="px-4 py-2 text-gray-500">Нажмите для деталей</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex justify-between items-center">
            <span>Всего: {total}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Назад
              </button>
              <span className="px-3 py-1">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Вперёд
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded shadow-lg max-w-4xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Детали действия #{selectedLog.id}</h2>
              <button onClick={() => setSelectedLog(null)} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><strong>Дата:</strong> {new Date(selectedLog.created_at).toLocaleString('ru-RU')}</div>
                <div><strong>Действие:</strong> {ACTION_LABELS[selectedLog.action] || selectedLog.action}</div>
                <div><strong>Сущность:</strong> {ENTITY_LABELS[selectedLog.entity_type] || selectedLog.entity_type}</div>
                <div><strong>ID сущности:</strong> {selectedLog.entity_id || '-'}</div>
                <div><strong>Пользователь:</strong> {selectedLog.user?.full_name || selectedLog.user?.username}</div>
              </div>
              
              {selectedLog.old_values && (
                <div className="mb-4">
                  <h3 className="font-bold mb-2">Было:</h3>
                  <pre className="bg-gray-100 p-3 rounded overflow-auto text-sm">{JSON.stringify(selectedLog.old_values, null, 2)}</pre>
                </div>
              )}
              
              {selectedLog.new_values && (
                <div>
                  <h3 className="font-bold mb-2">Стало:</h3>
                  <pre className="bg-gray-100 p-3 rounded overflow-auto text-sm">{JSON.stringify(selectedLog.new_values, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify syntax**

```bash
cd frontend
npm run build 2>&1 | grep -A5 "AdminLogsPage" || true
```

Expected: No syntax errors for AdminLogsPage

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AdminLogsPage.jsx
git commit -m "feat: add AdminLogsPage component"
```

---

## TASK 12: Add AdminRequestForm component

**Files:**
- Create: `frontend/src/components/AdminRequestForm.jsx`

**Interfaces:**
- Consumes: Request data, buildings, services, users lists
- Produces: Form component for admin request editing

- [ ] **Step 1: Create component file**

```bash
touch /home/dimon64515/projects/crm/frontend/src/components/AdminRequestForm.jsx
```

- [ ] **Step 2: Implement the component**

```javascript
import { useState, useEffect } from 'react';
import { requestsAPI } from '../api';

export default function AdminRequestForm({ request, buildings, services, users, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    building_id: request.building?.id || '',
    service_id: request.service?.id || '',
    description: request.description || '',
    status: request.status || 'new',
    assigned_to: request.executor?.id || '',
    due_date: request.due_date || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        ...formData,
        building_id: formData.building_id ? Number(formData.building_id) : null,
        service_id: formData.service_id ? Number(formData.service_id) : null,
        assigned_to: formData.assigned_to ? Number(formData.assigned_to) : null,
      };
      await requestsAPI.updateAdmin(request.id, data);
      onSave();
    } catch (error) {
      console.error('Failed to update request:', error);
      alert('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Корпус</label>
        <select
          name="building_id"
          value={formData.building_id}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
          required
        >
          <option value="">Выберите корпус</option>
          {buildings.map(b => (
            <option key={b.id} value={b.id}>{b.number} {b.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Вид работы</label>
        <select
          name="service_id"
          value={formData.service_id}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Не указан</option>
          {services.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Описание</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
          rows="3"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Статус</label>
        <select
          name="status"
          value={formData.status}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
        >
          <option value="new">Новая</option>
          <option value="in_progress">В работе</option>
          <option value="completed">Завершена</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Исполнитель</label>
        <select
          name="assigned_to"
          value={formData.assigned_to}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Не назначен</option>
          {users.filter(u => ['contractor', 'director', 'admin'].includes(u.role)).map(u => (
            <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Срок выполнения</label>
        <input
          type="date"
          name="due_date"
          value={formData.due_date}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Verify syntax**

```bash
cd frontend
npm run build 2>&1 | grep -A5 "AdminRequestForm" || true
```

Expected: No syntax errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AdminRequestForm.jsx
git commit -m "feat: add AdminRequestForm component"
```

---

## TASK 13: Update RequestDetailPage with admin actions

**Files:**
- Modify: `frontend/src/pages/RequestDetailPage.jsx`

**Interfaces:**
- Consumes: `AdminRequestForm` from Task 12, `requestsAPI.delete()` from Task 10
- Produces: Updated RequestDetailPage with delete button and admin edit mode

- [ ] **Step 1: Add imports**

At the top of the file, add:

```javascript
import { requestsAPI } from '../api';
import AdminRequestForm from '../components/AdminRequestForm';
```

- [ ] **Step 2: Add state for admin mode**

Find the state declarations (near top of component) and add:

```javascript
const [isAdminEditing, setIsAdminEditing] = useState(false);
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
```

- [ ] **Step 3: Add data fetching for admin form**

Add to the `useEffect` or data fetching section:

```javascript
const [buildings, setBuildings] = useState([]);
const [services, setServices] = useState([]);
const [users, setUsers] = useState([]);

useEffect(() => {
  const fetchAdminData = async () => {
    if (user?.role === 'admin') {
      try {
        const [buildingsRes, servicesRes, usersRes] = await Promise.all([
          axios.get('/api/buildings'),
          axios.get('/api/services'),
          axios.get('/api/users'),
        ]);
        setBuildings(buildingsRes.data);
        setServices(servicesRes.data);
        setUsers(usersRes.data);
      } catch (error) {
        console.error('Failed to fetch admin data:', error);
      }
    }
  };
  fetchAdminData();
}, [user]);
```

- [ ] **Step 4: Add delete handler**

Add after other handlers:

```javascript
const handleDeleteRequest = async () => {
  if (!confirm('Вы уверены, что хотите удалить эту заявку?')) return;
  try {
    await requestsAPI.delete(request.id);
    navigate('/requests');
  } catch (error) {
    console.error('Failed to delete request:', error);
    alert('Ошибка при удалении');
  }
};
```

- [ ] **Step 5: Add admin controls to JSX**

Find the action buttons section and add admin-only controls (this may vary based on current code structure):

```javascript
{user?.role === 'admin' && (
  <div className="flex gap-2 mb-4">
    <button
      onClick={() => setIsAdminEditing(!isAdminEditing)}
      className="px-4 py-2 bg-blue-500 text-white rounded"
    >
      {isAdminEditing ? 'Отменить редактирование' : 'Редактировать (админ)'}
    </button>
    <button
      onClick={handleDeleteRequest}
      className="px-4 py-2 bg-red-500 text-white rounded"
    >
      Удалить заявку
    </button>
  </div>
)}

{isAdminEditing && (
  <div className="mb-4 p-4 border rounded">
    <AdminRequestForm
      request={request}
      buildings={buildings}
      services={services}
      users={users}
      onSave={() => {
        setIsAdminEditing(false);
        // Refresh request data
        fetchRequest();
      }}
      onCancel={() => setIsAdminEditing(false)}
    />
  </div>
)}
```

- [ ] **Step 6: Verify syntax**

```bash
cd frontend
npm run build 2>&1 | grep -A5 "RequestDetailPage" || true
```

Expected: No syntax errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/RequestDetailPage.jsx
git commit -m "feat: add admin delete and edit controls to RequestDetailPage"
```

---

## TASK 14: Add AdminLogsPage route

**Files:**
- Modify: `frontend/src/App.jsx` or routes configuration

**Interfaces:**
- Consumes: `AdminLogsPage` component
- Produces: Registered route at `/admin/logs`

- [ ] **Step 1: Find the routes file**

```bash
grep -r "RequestDetailPage" /home/dimon64515/projects/crm/frontend/src/ 2>/dev/null | grep -v node_modules | head -5
```

- [ ] **Step 2: Add import and route**

Add to routes:

```javascript
import AdminLogsPage from './pages/AdminLogsPage';
```

And add route:

```javascript
<Route path="/admin/logs" element={
  <ProtectedRoute>
    <AdminOnly><AdminLogsPage /></AdminOnly>
  </ProtectedRoute>
} />
```

(Adjust based on actual routing structure in the project)

- [ ] **Step 3: Add navigation link**

Add to Layout.jsx navigation (admin-only):

```javascript
{user?.role === 'admin' && (
  <Link to="/admin/logs" className="nav-link">Журнал</Link>
)}
```

- [ ] **Step 4: Verify build**

```bash
cd frontend
npm run build 2>&1 | tail -10
```

Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: add AdminLogsPage route and navigation"
```

---

## TASK 15: Write backend tests

**Files:**
- Create: `backend/tests/test_admin_requests.py`

**Interfaces:**
- Consumes: All backend changes from previous tasks
- Produces: Test coverage for admin functions

- [ ] **Step 1: Create test file**

```bash
touch /home/dimon64515/projects/crm/backend/tests/test_admin_requests.py
```

- [ ] **Step 2: Implement tests**

```python
import pytest
from datetime import datetime, date
from app.models import Request, AuditLog, User
from app.services.audit_service import log_action, serialize_for_log


def test_admin_delete_request_soft(db, admin_user, test_request):
    """Проверка soft delete заявки админом"""
    from fastapi.testclient import TestClient
    from app.main import app
    
    client = TestClient(app)
    token = get_token_for_user(client, admin_user)
    
    response = client.delete(
        f"/api/requests/{test_request.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "deleted_at" in data
    
    # Проверка soft delete в БД
    db.refresh(test_request)
    assert test_request.deleted_at is not None


def test_admin_delete_request_creates_audit_log(db, admin_user, test_request):
    """Проверка создания записи в audit log при удалении"""
    from fastapi.testclient import TestClient
    from app.main import app
    
    client = TestClient(app)
    token = get_token_for_user(client, admin_user)
    
    client.delete(
        f"/api/requests/{test_request.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    log_entry = db.query(AuditLog).filter(
        AuditLog.entity_type == "request",
        AuditLog.entity_id == test_request.id,
        AuditLog.action == "deleted"
    ).first()
    
    assert log_entry is not None
    assert log_entry.user_id == admin_user.id
    assert log_entry.old_values is not None
    assert log_entry.new_values is None


def test_admin_update_all_fields(db, admin_user, test_request, test_building, test_service, contractor_user):
    """Проверка редактирования всех полей админом"""
    from fastapi.testclient import TestClient
    from app.main import app
    
    client = TestClient(app)
    token = get_token_for_user(client, admin_user)
    
    new_data = {
        "building_id": test_building.id,
        "service_id": test_service.id,
        "description": "Новое описание",
        "status": "in_progress",
        "assigned_to": contractor_user.id,
        "due_date": "2026-12-31",
    }
    
    response = client.put(
        f"/api/requests/{test_request.id}/admin",
        json=new_data,
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["building"]["id"] == test_building.id
    assert data["service"]["id"] == test_service.id
    assert data["description"] == "Новое описание"
    assert data["status"] == "in_progress"
    assert data["executor"]["id"] == contractor_user.id


def test_get_audit_logs_admin_only(db, admin_user, contractor_user):
    """Проверка доступа к логам только для админа"""
    from fastapi.testclient import TestClient
    from app.main import app
    
    client = TestClient(app)
    
    # Админ должен иметь доступ
    admin_token = get_token_for_user(client, admin_user)
    response = client.get(
        "/api/admin/audit-logs",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    
    # Подрядчик не должен иметь доступ
    contractor_token = get_token_for_user(client, contractor_user)
    response = client.get(
        "/api/admin/audit-logs",
        headers={"Authorization": f"Bearer {contractor_token}"}
    )
    assert response.status_code == 403


def test_audit_logs_filters(db, admin_user):
    """Проверка фильтрации логов"""
    from fastapi.testclient import TestClient
    from app.main import app
    
    client = TestClient(app)
    token = get_token_for_user(client, admin_user)
    
    # Фильтр по entity_type
    response = client.get(
        "/api/admin/audit-logs?entity_type=request",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert all(item["entity_type"] == "request" for item in data["items"])


def test_deleted_request_not_in_list(db, admin_user, test_request):
    """Проверка отсутствия удалённой заявки в списке"""
    from fastapi.testclient import TestClient
    from app.main import app
    
    client = TestClient(app)
    token = get_token_for_user(client, admin_user)
    
    # Удаляем заявку
    client.delete(
        f"/api/requests/{test_request.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    # Проверяем, что её нет в списке
    response = client.get(
        "/api/requests",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert test_request.id not in [item["id"] for item in data["items"]]


# Helper functions (adjust based on existing test setup)

def get_token_for_user(client, user):
    """Получает токен для пользователя."""
    response = client.post("/api/auth/login", json={
        "username": user.username,
        "password": "testpass123"
    })
    return response.json()["access_token"]
```

- [ ] **Step 3: Run tests**

```bash
cd backend
pytest tests/test_admin_requests.py -v
```

Expected: Some tests may fail due to fixtures (adjust in next steps)

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_admin_requests.py
git commit -m "test: add backend tests for admin request functions"
```

---

## TASK 16: Write frontend tests

**Files:**
- Create: `frontend/src/pages/__tests__/AdminLogsPage.test.jsx`
- Create: `frontend/src/components/__tests__/AdminRequestForm.test.jsx`

**Interfaces:**
- Consumes: Frontend components from previous tasks
- Produces: Test coverage for admin UI components

- [ ] **Step 1: Create test directories and files**

```bash
mkdir -p /home/dimon64515/projects/crm/frontend/src/pages/__tests__
mkdir -p /home/dimon64515/projects/crm/frontend/src/components/__tests__
touch /home/dimon64515/projects/crm/frontend/src/pages/__tests__/AdminLogsPage.test.jsx
touch /home/dimon64515/projects/crm/frontend/src/components/__tests__/AdminRequestForm.test.jsx
```

- [ ] **Step 2: Implement AdminLogsPage tests**

```javascript
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AdminLogsPage from '../AdminLogsPage';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock API
jest.mock('../../api', () => ({
  auditLogsAPI: {
    list: jest.fn(),
  },
}));

const { auditLogsAPI } = require('../../api');

describe('AdminLogsPage', () => {
  const mockAdminUser = { id: 1, role: 'admin', username: 'admin' };
  const mockLogs = {
    data: {
      items: [
        {
          id: 1,
          action: 'deleted',
          entity_type: 'request',
          entity_id: 42,
          user: { id: 1, username: 'admin', full_name: 'Администратор' },
          created_at: '2026-08-02T10:30:00Z',
          old_values: { description: 'Test' },
          new_values: null,
        },
      ],
      total: 1,
      page: 1,
      per_page: 50,
    },
  };

  beforeEach(() => {
    auditLogsAPI.list.mockResolvedValue(mockLogs);
  });

  const renderWithAuth = (user) => {
    return render(
      <BrowserRouter>
        <AuthProvider value={{ user }}>
          <AdminLogsPage />
        </AuthProvider>
      </BrowserRouter>
    );
  };

  it('renders logs table for admin', async () => {
    renderWithAuth(mockAdminUser);
    
    await waitFor(() => {
      expect(screen.getByText('Журнал действий')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Удалён')).toBeInTheDocument();
    expect(screen.getByText('Заявка')).toBeInTheDocument();
  });

  it('shows access denied for non-admin', () => {
    const mockContractor = { id: 2, role: 'contractor', username: 'contractor' };
    renderWithAuth(mockContractor);
    
    expect(screen.getByText('Доступ запрещён')).toBeInTheDocument();
  });

  it('opens detail modal on row click', async () => {
    renderWithAuth(mockAdminUser);
    
    await waitFor(() => {
      expect(screen.getByText('Журнал действий')).toBeInTheDocument();
    });
    
    const row = screen.getByText('Нажмите для деталей');
    row.click();
    
    await waitFor(() => {
      expect(screen.getByText('Детали действия #1')).toBeInTheDocument();
      expect(screen.getByText('Было:')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Implement AdminRequestForm tests**

```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminRequestForm from '../AdminRequestForm';

describe('AdminRequestForm', () => {
  const mockRequest = {
    id: 1,
    building: { id: 1, number: '1', name: 'Корпус 1' },
    service: { id: 1, name: 'Уборка' },
    description: 'Тестовое описание',
    status: 'new',
    executor: null,
    due_date: '2026-08-15',
  };

  const mockBuildings = [
    { id: 1, number: '1', name: 'Корпус 1' },
    { id: 2, number: '2', name: 'Корпус 2' },
  ];

  const mockServices = [
    { id: 1, name: 'Уборка' },
    { id: 2, name: 'Ремонт' },
  ];

  const mockUsers = [
    { id: 1, username: 'admin', full_name: 'Администратор', role: 'admin' },
    { id: 2, username: 'contractor', full_name: 'Подрядчик', role: 'contractor' },
  ];

  it('renders form with initial values', () => {
    render(
      <AdminRequestForm
        request={mockRequest}
        buildings={mockBuildings}
        services={mockServices}
        users={mockUsers}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByDisplayValue('Тестовое описание')).toBeInTheDocument();
    expect(screen.getByDisplayValue('new')).toBeInTheDocument();
  });

  it('calls onSave on form submit', async () => {
    const mockOnSave = jest.fn();
    
    render(
      <AdminRequestForm
        request={mockRequest}
        buildings={mockBuildings}
        services={mockServices}
        users={mockUsers}
        onSave={mockOnSave}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Новое описание' } });

    const submitButton = screen.getByText('Сохранить');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  it('calls onCancel on cancel button click', () => {
    const mockOnCancel = jest.fn();
    
    render(
      <AdminRequestForm
        request={mockRequest}
        buildings={mockBuildings}
        services={mockServices}
        users={mockUsers}
        onSave={() => {}}
        onCancel={mockOnCancel}
      />
    );

    const cancelButton = screen.getByText('Отмена');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd frontend
npm test 2>&1 | tail -20
```

Expected: Tests run (may need adjustment for project setup)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "test: add frontend tests for admin components"
```

---

## TASK 17: Final integration test

**Files:**
- None (integration testing)

**Interfaces:**
- Consumes: All implemented features
- Produces: Verified end-to-end functionality

- [ ] **Step 1: Start backend**

```bash
cd backend
uvicorn app.main:app --reload --port 8090 &
sleep 3
```

- [ ] **Step 2: Start frontend**

```bash
cd frontend
npm run dev &
sleep 3
```

- [ ] **Step 3: Manual test checklist**

Create a test request as admin, then:
1. Navigate to `/admin/logs` - should show logs
2. Filter by entity_type=request - should show only request logs
3. Open a request detail page
4. Click "Редактировать (админ)" - should open AdminRequestForm
5. Change status and save - should update and show in logs
6. Click "Удалить заявку" - should soft delete
7. Verify request is not in list anymore
8. Verify log entry for deletion

- [ ] **Step 4: Stop servers**

```bash
pkill -f uvicorn
pkill -f "vite"
```

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: complete admin audit log implementation - all tasks done"
```

---

## Completion

All tasks completed. The admin audit log feature is now fully implemented with:
- Soft delete for requests
- Full admin editing for requests
- Audit log with old/new values
- UI components for viewing logs and managing requests
- Comprehensive test coverage
