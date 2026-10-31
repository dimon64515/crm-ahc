# Emergency Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить флаг «Аварийная срочная заявка» при создании заявки комендантом и выделять такие заявки светло-красным фоном в списках для всех ролей.

**Architecture:** Добавляем булево поле `is_emergency` в модель `Request`, схемы создания/ответа/элемента списка и в ответы API. На фронтенде добавляем чекбокс в форму создания и подсветку строк в таблицах/карточках.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Pydantic 2, Alembic, React 19, Vite.

## Global Constraints
- Backend: Python 3.11+, FastAPI 0.111.0, SQLAlchemy 2.0.30, PostgreSQL 15, Alembic 1.13.1.
- Frontend: React 19.2.6, Vite 8.0.12, Axios 1.16.1, inline-стили.
- Строки и комментарии — на русском языке.
- API-вызовы frontend централизованы в `frontend/src/api.js`.
- Тесты backend: `pytest` + FastAPI `TestClient`.

---

### Task 1: Backend — добавить тесты для флага `is_emergency`

**Files:**
- Modify: `backend/tests/test_requests.py`

**Interfaces:**
- Consumes: `POST /api/requests`, `GET /api/requests`, `GET /api/requests/my`.
- Produces: новые тестовые функции, проверяющие поле `is_emergency` в ответах.

- [ ] **Step 1: Write the failing tests**

Вставить в конец `backend/tests/test_requests.py` (перед `def test_list_requests_default_sorting` или в конец файла):

```python
def test_comendant_can_create_emergency_request():
    db = TestingSessionLocal()
    comendant = User(username="comendant_emergency", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    director = User(username="director_emergency", hashed_password=get_password_hash("pass"), role="director", is_active=True)
    building = Building(number="90", name="Корпус 90", is_active=True)
    db.add_all([comendant, director, building])
    db.commit()

    comendant_login = client.post("/api/auth/login", json={"username": "comendant_emergency", "password": "pass"})
    comendant_token = comendant_login.json()["access_token"]
    director_login = client.post("/api/auth/login", json={"username": "director_emergency", "password": "pass"})
    director_token = director_login.json()["access_token"]

    response = client.post(
        "/api/requests",
        headers={"Authorization": f"Bearer {comendant_token}"},
        json={"building_id": building.id, "description": "Прорыв трубы", "is_emergency": True},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["description"] == "Прорыв трубы"
    assert data["is_emergency"] is True

    # Проверяем, что флаг приходит в общем списке заявок (доступен директору)
    list_response = client.get(
        "/api/requests",
        headers={"Authorization": f"Bearer {director_token}"},
    )
    assert list_response.status_code == 200, list_response.text
    items = list_response.json()["items"]
    assert any(item["id"] == data["id"] and item["is_emergency"] is True for item in items)

    # Проверяем, что флаг приходит в /requests/my
    my_response = client.get(
        "/api/requests/my",
        headers={"Authorization": f"Bearer {comendant_token}"},
    )
    assert my_response.status_code == 200, my_response.text
    my_items = my_response.json()["items"]
    assert any(item["id"] == data["id"] and item["is_emergency"] is True for item in my_items)
    db.close()


def test_request_defaults_to_non_emergency():
    db = TestingSessionLocal()
    comendant = User(username="comendant_default", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="91", name="Корпус 91", is_active=True)
    db.add_all([comendant, building])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "comendant_default", "password": "pass"})
    token = login.json()["access_token"]

    response = client.post(
        "/api/requests",
        headers={"Authorization": f"Bearer {token}"},
        json={"building_id": building.id, "description": "Обычная заявка"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["is_emergency"] is False
    db.close()
```

- [ ] **Step 2: Run the failing tests**

Run:
```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py::test_comendant_can_create_emergency_request tests/test_requests.py::test_request_defaults_to_non_emergency -v
```

Expected: FAIL — `is_emergency` неизвестен схеме/модели.

- [ ] **Step 3: Commit the tests**

```bash
git add backend/tests/test_requests.py
git commit -m "test: добавлены тесты для флага is_emergency"
```

---

### Task 2: Backend — добавить поле `is_emergency` в модель и схемы

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Consumes: SQLAlchemy `Boolean`, Pydantic `bool`.
- Produces: `Request.is_emergency`, `RequestCreate.is_emergency`, `RequestResponse.is_emergency`, `RequestListItem.is_emergency`.

- [ ] **Step 1: Update the model**

In `backend/app/models.py`, inside `class Request`, after `extended_count` add:

```python
    is_emergency = Column(Boolean, default=False, nullable=False, server_default='false')
```

- [ ] **Step 2: Update the schemas**

In `backend/app/schemas.py`:

1. In `class RequestCreate`, after `description`, add:

```python
    is_emergency: bool = False
```

2. In `class RequestResponse`, after `extended_count`, add:

```python
    is_emergency: bool
```

3. In `class RequestListItem`, after `extended_count`, add:

```python
    is_emergency: bool
```

- [ ] **Step 3: Run the tests again**

Run:
```bash
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py::test_comendant_can_create_emergency_request tests/test_requests.py::test_request_defaults_to_non_emergency -v
```

Expected: still FAIL — поле не заполняется/не возвращается роутером.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py
git commit -m "feat(backend): модель и схемы для is_emergency"
```

---

### Task 3: Backend — пробросить `is_emergency` через роутер

**Files:**
- Modify: `backend/app/routers/requests.py`

**Interfaces:**
- Consumes: `RequestCreate.is_emergency`.
- Produces: `is_emergency` в `build_request_response`, `build_request_list_item`, сохранение при создании.

- [ ] **Step 1: Update response builders**

In `build_request_response`, after `"extended_count": req.extended_count,` add:

```python
        "is_emergency": req.is_emergency,
```

In `build_request_list_item`, after `"extended_count": req.extended_count,` add:

```python
        "is_emergency": req.is_emergency,
```

- [ ] **Step 2: Update create_request**

In `create_request`, update the `Request(...)` instantiation to include:

```python
        is_emergency=data.is_emergency,
```

- [ ] **Step 3: Run the tests**

Run:
```bash
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py::test_comendant_can_create_emergency_request tests/test_requests.py::test_request_defaults_to_non_emergency -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/requests.py
git commit -m "feat(backend): проброс is_emergency при создании и в ответах"
```

---

### Task 4: Backend — создать миграцию Alembic

**Files:**
- Create: `backend/alembic/versions/<alembic-generated>.py`

**Interfaces:**
- Consumes: таблица `requests`.
- Produces: миграция добавления колонки `is_emergency`.

- [ ] **Step 1: Generate the migration**

Run:
```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
alembic revision -m "add request is_emergency"
```

Note the generated filename, e.g. `backend/alembic/versions/20260820_add_request_is_emergency.py`.

- [ ] **Step 2: Edit the migration bodies**

Open the generated migration file and replace the `upgrade()` and `downgrade()` functions (keep the auto-generated revision metadata at the top) with:

```python
def upgrade() -> None:
    op.add_column(
        'requests',
        sa.Column('is_emergency', sa.Boolean(), server_default='false', nullable=False)
    )


def downgrade() -> None:
    op.drop_column('requests', 'is_emergency')
```

- [ ] **Step 3: Verify migration applies (optional, local SQLite/PostgreSQL)**

If a local database is available:
```bash
alembic upgrade head
alembic downgrade -1
alembic upgrade head
```

Expected: no errors.

- [ ] **Step 4: Commit**

Run:
```bash
cd /home/dimon64515/projects/crm
NEW_FILE=$(ls -t backend/alembic/versions/*.py | head -n1)
git add "$NEW_FILE"
git commit -m "feat(backend): миграция добавления is_emergency в requests"
```

---

### Task 5: Frontend — добавить чекбокс в форму создания заявки

**Files:**
- Modify: `frontend/src/pages/RequestNewPage.jsx`

**Interfaces:**
- Consumes: `requestsAPI.create` (already accepts `is_emergency` from backend).
- Produces: состояние `isEmergency`, чекбокс в форме, передача флага в API.

- [ ] **Step 1: Add state and checkbox**

At the top of the component, after `const [uploadStage, setUploadStage] = useState('');`, add:

```jsx
  const [isEmergency, setIsEmergency] = useState(false);
```

Replace the create call inside `handleSubmit`:

```jsx
      const res = await requestsAPI.create({ building_id: parseInt(buildingId), description, is_emergency: isEmergency });
```

Insert the checkbox between the description field and the photos field:

```jsx
        <div style={styles.field}>
          <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isEmergency}
              onChange={(e) => setIsEmergency(e.target.checked)}
              disabled={submitting}
            />
            Аварийная срочная заявка
          </label>
        </div>
```

- [ ] **Step 2: Run frontend build/lint**

Run:
```bash
cd /home/dimon64515/projects/crm/frontend
npm run lint
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/RequestNewPage.jsx
git commit -m "feat(frontend): чекбокс аварийной срочной заявки в форме создания"
```

---

### Task 6: Frontend — выделить срочные заявки в общем списке

**Files:**
- Modify: `frontend/src/pages/RequestsListPage.jsx`

**Interfaces:**
- Consumes: `req.is_emergency` из API.
- Produces: красный фон строки таблицы и мобильной карточки.

- [ ] **Step 1: Highlight table rows**

In the desktop table body, update the `<tr>` mapping `items`:

```jsx
                <tr key={req.id} style={req.is_emergency ? { ...styles.row, backgroundColor: '#fef2f2' } : styles.row}>
```

- [ ] **Step 2: Highlight mobile cards**

In the mobile card mapping, update the outer `<div>`:

```jsx
            <div
              key={req.id}
              style={{
                ...styles.card,
                cursor: "pointer",
                ...(req.is_emergency ? { background: '#fef2f2' } : {}),
              }}
              onClick={() => navigate(`/requests/${req.id}`)}
            >
```

- [ ] **Step 3: Run frontend build/lint**

Run:
```bash
cd /home/dimon64515/projects/crm/frontend
npm run lint
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RequestsListPage.jsx
git commit -m "feat(frontend): выделение срочных заявок в общем списке"
```

---

### Task 7: Frontend — выделить срочные заявки в «Мои заявки»

**Files:**
- Modify: `frontend/src/pages/MyRequestsPage.jsx`

**Interfaces:**
- Consumes: `req.is_emergency` из API.
- Produces: красный фон строки таблицы.

- [ ] **Step 1: Highlight rows**

Update the `<tr>` mapping `items`:

```jsx
                <tr
                  key={req.id}
                  onClick={() => navigate(`/requests/${req.id}`)}
                  style={req.is_emergency ? { ...styles.row, backgroundColor: '#fef2f2' } : styles.row}
                >
```

- [ ] **Step 2: Run frontend build/lint**

Run:
```bash
cd /home/dimon64515/projects/crm/frontend
npm run lint
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/MyRequestsPage.jsx
git commit -m "feat(frontend): выделение срочных заявок в Мои заявки"
```

---

### Task 8: Final verification

**Files:**
- All changed files.

- [ ] **Step 1: Run full backend test suite**

Run:
```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend lint and build**

Run:
```bash
cd /home/dimon64515/projects/crm/frontend
npm run lint
npm run build
```

Expected: no errors, `dist/` created.

- [ ] **Step 3: Manual checklist (run dev servers if needed)**

1. Зайти как комендант, создать заявку с галочкой «Аварийная срочная заявка».
2. Перейти в `/my-requests` — заявка подсвечена красным.
3. Зайти как директор/админ/подрядчик в `/requests` — заявка подсвечена красным.
4. Создать обычную заявку — она не подсвечена.

- [ ] **Step 4: Commit any fixes and finalize**

If any fixes were needed, commit them. Otherwise, mark task complete.

---

## Self-Review Checklist

- [ ] **Spec coverage:** Every requirement from `docs/superpowers/specs/2026-08-20-emergency-request-design.md` maps to a task.
- [ ] **No placeholders:** No TODO/TBD/vague steps remain.
- [ ] **Type consistency:** `is_emergency` is `bool` in model, schemas, and frontend.
- [ ] **Testability:** Backend tests added; frontend verified via lint/build and manual checklist.
