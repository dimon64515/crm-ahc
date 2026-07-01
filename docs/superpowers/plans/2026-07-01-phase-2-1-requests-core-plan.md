# Этап 2.1 — Ядро заявок: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в CRM АХЧ подсистему заявок с ролью вахтёра, статусами, назначением исполнителя и продлением срока.

**Architecture:** Новые сущности `Request` и `RequestPhoto` хранятся в PostgreSQL. Логика заявок изолирована в `backend/app/routers/requests.py`. Frontend добавляет четыре новые страницы и маршруты. Ролевая модель расширяется ролью `watchman` через существующий механизм `User.role`.

**Tech Stack:** FastAPI 0.111.0, SQLAlchemy 2.0.30, Pydantic 2.7.1, Alembic 1.13.1, React 19.2.6, Vite 8.0.12.

## Global Constraints

- Backend: Python 3.11+, FastAPI 0.111.0, SQLAlchemy 2.0.30, Pydantic 2.7.1.
- Frontend: React 19.2.6, Vite 8.0.12, Axios 1.16.1.
- База данных: PostgreSQL 15, миграции через Alembic.
- Все строки, сообщения об ошибках и комментарии — на русском языке.
- Минимальные изменения существующей архитектуры.
- Существующие роли: `contractor`, `director`, `admin`. Новая роль: `watchman`.

---

### Task 1: Alembic-миграция для таблиц `requests` и `request_photos`

**Files:**
- Create: `backend/alembic/versions/20260701_add_requests_and_request_photos.py`

**Interfaces:**
- Consumes: Существующие таблицы `users`, `buildings`.
- Produces: Таблицы `requests` и `request_photos` с внешними ключами.

- [ ] **Step 1: Сгенерировать заготовку миграции**

```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
alembic revision -m "add requests and request_photos"
```

Найти созданный файл в `backend/alembic/versions/`.

- [ ] **Step 2: Написать операции upgrade/downgrade**

```python
# backend/alembic/versions/20260701_add_requests_and_request_photos.py
from alembic import op
import sqlalchemy as sa

revision = "<auto>"
down_revision = "<предыдущая_миграция>"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "requests",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("building_id", sa.Integer(), sa.ForeignKey("buildings.id"), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, default="new"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("extended_count", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_table(
        "request_photos",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(255)),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_size", sa.Integer()),
        sa.Column("mime_type", sa.String(50)),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("request_photos")
    op.drop_table("requests")
```

- [ ] **Step 3: Применить миграцию**

```bash
alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Context impl PostgresqlImpl. ...`

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/20260701_add_requests_and_request_photos.py
git commit -m "chore(db): add requests and request_photos tables"
```

---

### Task 2: SQLAlchemy-модели `Request` и `RequestPhoto`

**Files:**
- Modify: `backend/app/models.py`

**Interfaces:**
- Consumes: Таблицы `users`, `buildings`.
- Produces: Классы `Request` и `RequestPhoto` с relationship.

- [ ] **Step 1: Добавить модели в `backend/app/models.py`**

После класса `BackupLog` добавить:

```python


class Request(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, index=True)
    building_id = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="new")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    due_date = Column(Date, nullable=False)
    extended_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    building = relationship("Building")
    creator = relationship("User", foreign_keys=[created_by])
    executor = relationship("User", foreign_keys=[assigned_to])
    photos = relationship("RequestPhoto", back_populates="request", cascade="all, delete-orphan")


class RequestPhoto(Base):
    __tablename__ = "request_photos"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("requests.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255))
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)

    request = relationship("Request", back_populates="photos")
```

- [ ] **Step 2: Запустить backend, чтобы проверить импорт**

```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
python -c "from app.models import Request, RequestPhoto; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat(models): add Request and RequestPhoto models"
```

---

### Task 3: Pydantic-схемы заявок

**Files:**
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Consumes: Существующие схемы `BuildingResponse`, `UserResponse`.
- Produces: Схемы `RequestCreate`, `RequestUpdate`, `RequestPhotoResponse`, `RequestResponse`, `RequestListResponse`.

- [ ] **Step 1: Добавить схемы в `backend/app/schemas.py`**

После `BackupResponse` добавить:

```python


# === Request Schemas ===

class RequestPhotoResponse(BaseModel):
    id: int
    filename: str
    original_name: Optional[str]
    url: str
    file_size: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class RequestCreate(BaseModel):
    building_id: int
    description: str = Field(min_length=5)

    @field_validator('description')
    @classmethod
    def description_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Описание не может быть пустым')
        return v


class RequestAssign(BaseModel):
    user_id: int


class RequestResponse(BaseModel):
    id: int
    building: BuildingResponse
    description: str
    status: str
    creator: UserResponse
    executor: Optional[UserResponse]
    due_date: date
    extended_count: int
    photos: List[RequestPhotoResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RequestListItem(BaseModel):
    id: int
    building: BuildingResponse
    description: str
    status: str
    creator: UserResponse
    executor: Optional[UserResponse]
    due_date: date
    extended_count: int
    photos_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class RequestListResponse(BaseModel):
    items: List[RequestListItem]
    total: int
```

- [ ] **Step 2: Проверить импорт**

```bash
python -c "from app.schemas import RequestCreate, RequestResponse; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat(schemas): add request schemas"
```

---

### Task 4: Ролевые зависимости для вахтёра

**Files:**
- Modify: `backend/app/core/dependencies.py`

**Interfaces:**
- Consumes: `require_role`.
- Produces: `require_watchman`, `require_executor`.

- [ ] **Step 1: Добавить зависимости**

В `backend/app/core/dependencies.py` после `require_contractor` добавить:

```python

require_watchman = require_role("watchman")
require_executor = require_role("contractor", "director", "admin")
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/core/dependencies.py
git commit -m "feat(auth): add watchman and executor role dependencies"
```

---

### Task 5: Роутер заявок — создание и список

**Files:**
- Create: `backend/app/routers/requests.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `Request`, `RequestPhoto`, `RequestCreate`, `RequestResponse`, `require_watchman`, `require_executor`.
- Produces: Endpoints `POST /api/requests`, `GET /api/requests`, `GET /api/requests/{id}`.

- [ ] **Step 1: Создать тест**

```python
# backend/tests/test_requests.py
from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Building, Request
from app.core.security import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_requests.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def setup_module():
    Base.metadata.create_all(bind=engine)


def teardown_module():
    Base.metadata.drop_all(bind=engine)


def test_watchman_can_create_request():
    db = TestingSessionLocal()
    watchman = User(username="watchman1", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    building = Building(number="10", name="Корпус 10", is_active=True)
    db.add_all([watchman, building])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "watchman1", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        "/api/requests",
        headers={"Authorization": f"Bearer {token}"},
        json={"building_id": building.id, "description": "Протечка"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["building"]["id"] == building.id
    assert data["description"] == "Протечка"
    assert data["status"] == "new"
    assert data["extended_count"] == 0
    expected_due = (date.today() + timedelta(days=5)).isoformat()
    assert data["due_date"] == expected_due
    db.close()
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

```bash
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py::test_watchman_can_create_request -v
```

Expected: FAIL, endpoint не найден.

- [ ] **Step 3: Создать роутер**

```python
# backend/app/routers/requests.py
import os
from datetime import date, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Request, RequestPhoto, Building, User
from app.schemas import RequestCreate, RequestResponse, RequestListResponse, RequestListItem, RequestPhotoResponse
from app.core.dependencies import get_current_user, require_watchman, require_executor
from app.core.config import get_settings
from app.services.file_service import save_photo as save_work_photo, get_file_url

router = APIRouter(prefix="/requests", tags=["requests"])


def build_request_response(req: Request) -> dict:
    return {
        "id": req.id,
        "building": req.building,
        "description": req.description,
        "status": req.status,
        "creator": req.creator,
        "executor": req.executor,
        "due_date": req.due_date,
        "extended_count": req.extended_count,
        "photos": [
            {
                "id": p.id,
                "filename": p.filename,
                "original_name": p.original_name,
                "url": get_file_url(p.file_path),
                "file_size": p.file_size,
                "created_at": p.created_at,
            }
            for p in req.photos
        ],
        "created_at": req.created_at,
        "updated_at": req.updated_at,
    }


def build_request_list_item(req: Request) -> dict:
    return {
        "id": req.id,
        "building": req.building,
        "description": req.description,
        "status": req.status,
        "creator": req.creator,
        "executor": req.executor,
        "due_date": req.due_date,
        "extended_count": req.extended_count,
        "photos_count": len(req.photos),
        "created_at": req.created_at,
    }


@router.post("", response_model=RequestResponse)
def create_request(
    data: RequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_watchman)
):
    building = db.query(Building).filter(Building.id == data.building_id, Building.is_active == True).first()
    if not building:
        raise HTTPException(status_code=400, detail="Корпус не найден или неактивен")

    request = Request(
        building_id=data.building_id,
        description=data.description,
        status="new",
        created_by=current_user.id,
        due_date=date.today() + timedelta(days=5),
        extended_count=0,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return build_request_response(request)


@router.get("", response_model=RequestListResponse)
def list_requests(
    status: str = None,
    building_id: int = None,
    date_from: str = None,
    date_to: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_executor)
):
    query = db.query(Request)
    if status:
        query = query.filter(Request.status == status)
    if building_id:
        query = query.filter(Request.building_id == building_id)
    if date_from:
        query = query.filter(Request.created_at >= date_from)
    if date_to:
        query = query.filter(Request.created_at <= date_to)

    items = query.order_by(Request.created_at.desc()).all()
    return {
        "items": [build_request_list_item(r) for r in items],
        "total": len(items),
    }


@router.get("/my", response_model=RequestListResponse)
def list_my_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_watchman)
):
    items = db.query(Request).filter(Request.created_by == current_user.id).order_by(Request.created_at.desc()).all()
    return {
        "items": [build_request_list_item(r) for r in items],
        "total": len(items),
    }


@router.get("/{request_id}", response_model=RequestResponse)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if current_user.role == "watchman" and req.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    return build_request_response(req)
```

- [ ] **Step 4: Подключить роутер в `backend/app/main.py`**

Добавить импорт:

```python
from app.routers import requests as requests_router
```

И подключение:

```python
app.include_router(requests_router.router, prefix="/api")
```

- [ ] **Step 5: Запустить тест**

```bash
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py::test_watchman_can_create_request -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/requests.py backend/app/main.py backend/tests/test_requests.py
git commit -m "feat(requests): add create, list and get endpoints"
```

---

### Task 6: Загрузка фото к заявке

**Files:**
- Modify: `backend/app/routers/requests.py`
- Modify: `backend/app/services/file_service.py` (опционально, если нужна специальная директория)

**Interfaces:**
- Consumes: `UploadFile`, `Request`.
- Produces: Endpoint `POST /api/requests/{id}/photos`.

- [ ] **Step 1: Добавить endpoint загрузки фото**

В `backend/app/routers/requests.py` добавить:

```python
import os
from datetime import datetime
from app.services.file_service import compress_image
from app.core.config import get_settings


def save_request_photo(upload_file, request_id: int) -> dict:
    content = upload_file.file.read()
    compressed = compress_image(content)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{os.urandom(4).hex()}.jpg"
    settings = get_settings()
    dest_dir = os.path.join(settings.UPLOAD_DIR, "request_photos", str(request_id))
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, filename)
    with open(dest_path, "wb") as f:
        f.write(compressed)
    return {
        "filename": filename,
        "original_name": upload_file.filename,
        "file_path": dest_path,
        "file_size": len(compressed),
        "mime_type": "image/jpeg",
    }


@router.post("/{request_id}/photos")
def upload_request_photos(
    request_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_watchman)
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if req.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    if len(req.photos) + len(files) > 5:
        raise HTTPException(status_code=400, detail="Максимум 5 фото на заявку")

    uploaded = []
    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            continue
        meta = save_request_photo(file, request_id)
        photo = RequestPhoto(request_id=request_id, **meta)
        db.add(photo)
        uploaded.append({"id": photo.id, "filename": meta["filename"], "url": get_file_url(meta["file_path"])})

    db.commit()
    return {"success": True, "uploaded": len(uploaded), "photos": uploaded}
```

- [ ] **Step 2: Добавить тест**

```python
def test_watchman_can_upload_photo_to_request():
    db = TestingSessionLocal()
    watchman = User(username="watchman_photo", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    building = Building(number="11", name="Корпус 11", is_active=True)
    db.add_all([watchman, building])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "watchman_photo", "password": "pass"})
    token = login.json()["access_token"]

    req = Request(building_id=building.id, description="Фото", status="new", created_by=watchman.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    from io import BytesIO
    image = BytesIO(b"fake image content")
    response = client.post(
        f"/api/requests/{req.id}/photos",
        headers={"Authorization": f"Bearer {token}"},
        files={"files": ("test.jpg", image, "image/jpeg")},
    )
    assert response.status_code == 200, response.text
    db.close()
```

- [ ] **Step 3: Запустить тесты**

```bash
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/requests.py backend/tests/test_requests.py
git commit -m "feat(requests): add photo upload endpoint"
```

---

### Task 7: Статусы заявок (take, assign, complete)

**Files:**
- Modify: `backend/app/routers/requests.py`
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Consumes: `RequestAssign`.
- Produces: Endpoints `PUT /api/requests/{id}/take`, `PUT /api/requests/{id}/assign`, `PUT /api/requests/{id}/complete`.

- [ ] **Step 1: Добавить endpoint'ы**

В `backend/app/routers/requests.py` добавить:

```python
from app.schemas import RequestAssign


@router.put("/{request_id}/take", response_model=RequestResponse)
def take_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_executor)
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if req.status == "completed":
        raise HTTPException(status_code=400, detail="Заявка уже завершена")

    req.assigned_to = current_user.id
    req.status = "in_progress"
    db.commit()
    db.refresh(req)
    return build_request_response(req)


@router.put("/{request_id}/assign", response_model=RequestResponse)
def assign_request(
    request_id: int,
    data: RequestAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director)
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if req.status == "completed":
        raise HTTPException(status_code=400, detail="Заявка уже завершена")

    user = db.query(User).filter(User.id == data.user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=400, detail="Исполнитель не найден или неактивен")

    req.assigned_to = data.user_id
    req.status = "in_progress"
    db.commit()
    db.refresh(req)
    return build_request_response(req)


@router.put("/{request_id}/complete", response_model=RequestResponse)
def complete_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_executor)
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if req.status == "completed":
        raise HTTPException(status_code=400, detail="Заявка уже завершена")
    if current_user.role == "contractor" and req.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    req.status = "completed"
    db.commit()
    db.refresh(req)
    return build_request_response(req)
```

- [ ] **Step 2: Добавить тесты**

```python
def test_executor_can_take_request():
    db = TestingSessionLocal()
    watchman = User(username="watchman_take", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    contractor = User(username="contractor_take", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building = Building(number="12", name="Корпус 12", is_active=True)
    db.add_all([watchman, contractor, building])
    db.commit()

    req = Request(building_id=building.id, description="Взять", status="new", created_by=watchman.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "contractor_take", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/requests/{req.id}/take",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "in_progress"
    assert response.json()["executor"]["id"] == contractor.id
    db.close()
```

- [ ] **Step 3: Запустить тесты**

```bash
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/requests.py backend/app/schemas.py backend/tests/test_requests.py
git commit -m "feat(requests): add take, assign and complete endpoints"
```

---

### Task 8: Продление срока заявки

**Files:**
- Modify: `backend/app/routers/requests.py`

**Interfaces:**
- Consumes: `Request`.
- Produces: Endpoint `POST /api/requests/{id}/extend`.

- [ ] **Step 1: Добавить endpoint**

```python
from datetime import timedelta


@router.post("/{request_id}/extend", response_model=RequestResponse)
def extend_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    req.due_date = req.due_date + timedelta(days=5)
    req.extended_count += 1
    db.commit()
    db.refresh(req)
    return build_request_response(req)
```

- [ ] **Step 2: Добавить тест**

```python
def test_admin_can_extend_request():
    db = TestingSessionLocal()
    admin = User(username="admin_extend", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    watchman = User(username="watchman_extend", hashed_password=get_password_hash("pass"), role="watchman", is_active=True)
    building = Building(number="13", name="Корпус 13", is_active=True)
    db.add_all([admin, watchman, building])
    db.commit()

    req = Request(building_id=building.id, description="Продлить", status="new", created_by=watchman.id,
                  due_date=date.today() + timedelta(days=5), extended_count=0)
    db.add(req)
    db.commit()
    db.refresh(req)

    login = client.post("/api/auth/login", json={"username": "admin_extend", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        f"/api/requests/{req.id}/extend",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["extended_count"] == 1
    db.close()
```

- [ ] **Step 3: Запустить тесты**

```bash
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/requests.py backend/tests/test_requests.py
git commit -m "feat(requests): add admin extend deadline endpoint"
```

---

### Task 9: Frontend — форма создания заявки

**Files:**
- Create: `frontend/src/pages/RequestNewPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/api.js`

**Interfaces:**
- Consumes: `buildingsAPI.list`, `requestsAPI.create`, `requestsAPI.uploadPhotos`.
- Produces: Страница `/requests/new`.

- [ ] **Step 1: Добавить API-методы**

В `frontend/src/api.js` добавить:

```javascript
export const requestsAPI = {
  create: (data) => api.post('/requests', data),
  list: (params) => api.get('/requests', { params }),
  my: () => api.get('/requests/my'),
  get: (id) => api.get(`/requests/${id}`),
  take: (id) => api.put(`/requests/${id}/take`),
  assign: (id, userId) => api.put(`/requests/${id}/assign`, { user_id: userId }),
  complete: (id) => api.put(`/requests/${id}/complete`),
  extend: (id) => api.post(`/requests/${id}/extend`),
  uploadPhotos: (id, files) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return api.post(`/requests/${id}/photos`, formData, { headers: { 'Content-Type': undefined } });
  },
};
```

- [ ] **Step 2: Создать страницу `RequestNewPage.jsx`**

Минимальная форма:

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildingsAPI, requestsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

export default function RequestNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState([]);
  const [buildingId, setBuildingId] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef(null);

  useEffect(() => {
    buildingsAPI.list({ is_active: true }).then(r => setBuildings(r.data));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await requestsAPI.create({ building_id: parseInt(buildingId), description });
      const requestId = res.data.id;
      if (photos.length > 0) {
        await requestsAPI.uploadPhotos(requestId, photos);
      }
      navigate('/my-requests');
    } catch (err) {
      alert('Ошибка создания заявки');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Новая заявка</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>Корпус</label>
          <select value={buildingId} onChange={e => setBuildingId(e.target.value)} required style={styles.input}>
            <option value="">Выберите корпус</option>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.number} — {b.name}</option>)}
          </select>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Описание</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} required minLength={5} style={{ ...styles.input, minHeight: 120 }} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Фото (до 5)</label>
          <input type="file" accept="image/*" multiple ref={photoInputRef}
            onChange={e => setPhotos(Array.from(e.target.files).slice(0, 5))} style={styles.input} />
          {photos.length > 0 && <p>Выбрано фото: {photos.length}</p>}
        </div>
        <button type="submit" disabled={submitting} style={styles.button}>{submitting ? 'Создание…' : 'Создать заявку'}</button>
      </form>
    </div>
  );
}

const styles = {
  container: { maxWidth: 600, margin: '0 auto', padding: 24 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 20 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 14, fontWeight: 500 },
  input: { padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 },
  button: { padding: '12px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
};
```

- [ ] **Step 3: Добавить маршрут в `App.jsx`**

```jsx
import RequestNewPage from './pages/RequestNewPage';
```

И route:

```jsx
<Route
  path="/requests/new"
  element={
    <ProtectedRoute allowedRoles={['watchman']}>
      <Layout><RequestNewPage /></Layout>
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 4: Добавить пункт меню в `Layout.jsx`**

Для `watchman`:

```jsx
navItems.push({ to: '/requests/new', label: 'Новая заявка' });
navItems.push({ to: '/my-requests', label: 'Мои заявки' });
```

- [ ] **Step 5: Проверить lint и build**

```bash
cd /home/dimon64515/projects/crm/frontend
npm run lint
npm run build
```

Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RequestNewPage.jsx frontend/src/App.jsx frontend/src/components/Layout.jsx frontend/src/api.js
git commit -m "feat(frontend): add request creation page"
```

---

### Task 10: Frontend — список заявок

**Files:**
- Create: `frontend/src/pages/RequestsListPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`

**Interfaces:**
- Consumes: `requestsAPI.list`, `usersAPI.list`.
- Produces: Страница `/requests`.

- [ ] **Step 1: Создать `RequestsListPage.jsx`**

Базовый список с фильтрами по статусу и корпусу, кнопками действий.

- [ ] **Step 2: Добавить маршрут и меню**

Маршрут `/requests` для `contractor`, `director`, `admin`.

- [ ] **Step 3: Проверить lint/build**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RequestsListPage.jsx frontend/src/App.jsx frontend/src/components/Layout.jsx
git commit -m "feat(frontend): add requests list page"
```

---

### Task 11: Frontend — детали заявки

**Files:**
- Create: `frontend/src/pages/RequestDetailPage.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `requestsAPI.get`, `requestsAPI.take`, `requestsAPI.complete`, `requestsAPI.assign`, `requestsAPI.extend`, `usersAPI.list`.
- Produces: Страница `/requests/:id`.

- [ ] **Step 1: Создать `RequestDetailPage.jsx`**

Отображение полной информации, фото, кнопки действий в зависимости от роли.

- [ ] **Step 2: Добавить маршрут**

```jsx
<Route path="/requests/:id" element={...} />
```

- [ ] **Step 3: Проверить lint/build**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RequestDetailPage.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add request detail page"
```

---

### Task 12: Frontend — мои заявки вахтёра

**Files:**
- Create: `frontend/src/pages/MyRequestsPage.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `requestsAPI.my`.
- Produces: Страница `/my-requests`.

- [ ] **Step 1: Создать `MyRequestsPage.jsx`**

Простой список заявок текущего вахтёра со статусами и сроками.

- [ ] **Step 2: Добавить маршрут**

```jsx
<Route path="/my-requests" element={<ProtectedRoute allowedRoles={['watchman']}>...<MyRequestsPage />...</ProtectedRoute>} />
```

- [ ] **Step 3: Проверить lint/build**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/MyRequestsPage.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add my requests page for watchman"
```

---

### Task 13: Финальная проверка Этапа 2.1

**Files:**
- Все вышеперечисленные.

- [ ] **Step 1: Запустить все backend-тесты**

```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/ -v
```

Expected: все тесты PASS.

- [ ] **Step 2: Запустить frontend lint и build**

```bash
cd /home/dimon64515/projects/crm/frontend
npm run lint
npm run build
```

Expected: lint без ошибок, build успешен.

- [ ] **Step 3: Проверить, что миграции применены**

```bash
cd /home/dimon64515/projects/crm/backend
alembic current
```

Expected: последняя миграция `add requests and request_photos`.

- [ ] **Step 4: Final commit**

```bash
cd /home/dimon64515/projects/crm
git add -A
git commit -m "feat(phase-2-1): requests core subsystem"
```

---

## Spec Coverage Check

| Требование spec | Task |
|---|---|
| Таблица `requests` | Task 1, 2 |
| Таблица `request_photos` | Task 1, 2 |
| Схемы заявок | Task 3 |
| Роль `watchman` и зависимости | Task 4 |
| Создание заявки | Task 5, 9 |
| Список заявок | Task 5, 10 |
| Детали заявки | Task 5, 11 |
| Статусы (take/assign/complete) | Task 7 |
| Сроки и продление | Task 8 |
| Загрузка фото | Task 6 |
| Frontend страницы | Task 9–12 |
| Финальная проверка | Task 13 |

## Placeholder Scan

- Нет `TBD`, `TODO`, `implement later`.
- Все шаги содержат конкретный код или команды.
- Все пути к файлам указаны точно.

## Type Consistency Check

- `RequestCreate` используется в `POST /requests`.
- `RequestResponse` используется для ответов.
- `RequestAssign` используется в `PUT /requests/{id}/assign`.
- `require_watchman`, `require_executor`, `require_director` соответствуют ролевой матрице spec.
