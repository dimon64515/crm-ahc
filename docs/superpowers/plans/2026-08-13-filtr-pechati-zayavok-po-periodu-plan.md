# Фильтр периода при печати заявок — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить фильтрацию заявок по дате создания и дате завершения, выбор всех отфильтрованных заявок одной кнопкой и печать через существующий эндпоинт.

**Architecture:** Расширить `GET /api/requests` четырьмя query-параметрами дат; на двух страницах фронтенда добавить поля ввода дат и кнопку «Выбрать все по фильтру», которая заполняет `selectedIds` ID отображённых заявок. Эндпоинт печати остаётся без изменений.

**Tech Stack:** FastAPI, SQLAlchemy, React (JSX), inline-стили, pytest.

## Global Constraints

- Язык интерфейса и комментариев — русский.
- Функциональность доступна только `director` и `admin`.
- Минимальные изменения: не трогаем формат DOCX-шаблона и эндпоинт `POST /api/requests/print`.
- Следуем существующим паттернам фильтрации по датам в проекте (`datetime.combine` с `time.min` / `time.max`).
- `selectedIds` сбрасывается при изменении любого фильтра, чтобы в выборку не попали заявки вне текущего фильтра.

---

## File Structure

| Файл | Ответственность |
|------|-----------------|
| `backend/app/routers/requests.py` | Расширение `GET /api/requests` параметрами `created_from`, `created_to`, `completed_from`, `completed_to` и фильтрация по `Request.created_at` / `Request.completed_at`. |
| `backend/tests/test_requests.py` | Тесты фильтрации заявок по датам создания и завершения. |
| `frontend/src/pages/RequestsListPage.jsx` | Поля дат, кнопка «Выбрать все по фильтру», передача дат в `requestsAPI.list`. |
| `frontend/src/pages/DashboardPage.jsx` | То же самое в компоненте `RequestsDashboard`. |

---

### Task 1: Backend — фильтрация списка заявок по датам

**Files:**
- Modify: `backend/app/routers/requests.py:153-189`
- Test: `backend/tests/test_requests.py`

**Interfaces:**
- Consumes: `GET /api/requests?status=&building_id=&created_from=&created_to=&completed_from=&completed_to=`
- Produces: список заявок, отфильтрованный по переданным диапазонам дат.

- [ ] **Step 1: Write the failing test**

В `backend/tests/test_requests.py` добавить тест:

```python
def test_list_requests_filter_by_created_and_completed_dates():
    db = TestingSessionLocal()
    director = User(username="director_dates", hashed_password=get_password_hash("pass"), role="director", is_active=True)
    comendant = User(username="comendant_dates", hashed_password=get_password_hash("pass"), role="comendant", is_active=True)
    building = Building(number="20", name="Корпус 20", is_active=True)
    db.add_all([director, comendant, building])
    db.commit()

    today = datetime.utcnow().date()
    req_old = Request(
        building_id=building.id, description="Старая", status="completed", created_by=comendant.id,
        created_at=datetime.combine(today - timedelta(days=10), datetime.min.time()),
        completed_at=datetime.combine(today - timedelta(days=5), datetime.min.time()),
        due_date=today + timedelta(days=5), extended_count=0,
    )
    req_new = Request(
        building_id=building.id, description="Новая", status="new", created_by=comendant.id,
        created_at=datetime.combine(today, datetime.min.time()),
        due_date=today + timedelta(days=5), extended_count=0,
    )
    db.add_all([req_old, req_new])
    db.commit()

    login = client.post("/api/auth/login", json={"username": "director_dates", "password": "pass"})
    token = login.json()["access_token"]

    # Фильтр по дате создания — должна остаться только новая
    response = client.get(
        "/api/requests",
        headers={"Authorization": f"Bearer {token}"},
        params={"created_from": today.isoformat(), "created_to": today.isoformat()},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["description"] == "Новая"

    # Фильтр по дате завершения — должна остаться только старая
    response = client.get(
        "/api/requests",
        headers={"Authorization": f"Bearer {token}"},
        params={"completed_from": (today - timedelta(days=5)).isoformat(), "completed_to": (today - timedelta(days=5)).isoformat()},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["description"] == "Старая"

    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_requests.py::test_list_requests_filter_by_created_and_completed_dates -v`

Expected: FAIL with parameter not recognized or filter not applied.

- [ ] **Step 3: Write minimal implementation**

В `backend/app/routers/requests.py` в функции `list_requests` после параметров `date_from`/`date_to` добавить четыре новых параметра и соответствующие фильтры:

```python
@router.get("", response_model=RequestListResponse)
def list_requests(
    status: str = None,
    building_id: int = None,
    date_from: str = None,
    date_to: str = None,
    created_from: str = None,
    created_to: str = None,
    completed_from: str = None,
    completed_to: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_executor)
):
    query = db.query(Request).options(
        joinedload(Request.building),
        joinedload(Request.creator),
        joinedload(Request.executor),
        selectinload(Request.photos),
    ).filter(Request.deleted_at.is_(None))
    if status:
        query = query.filter(Request.status == status)
    if building_id:
        query = query.filter(Request.building_id == building_id)
    if date_from:
        try:
            date_from_parsed = datetime.strptime(date_from, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат date_from, ожидается YYYY-MM-DD")
        query = query.filter(Request.created_at >= datetime.combine(date_from_parsed, datetime.min.time()))
    if date_to:
        try:
            date_to_parsed = datetime.strptime(date_to, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат date_to, ожидается YYYY-MM-DD")
        query = query.filter(Request.created_at <= datetime.combine(date_to_parsed, datetime.max.time()))
    if created_from:
        try:
            created_from_parsed = datetime.strptime(created_from, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат created_from, ожидается YYYY-MM-DD")
        query = query.filter(Request.created_at >= datetime.combine(created_from_parsed, datetime.min.time()))
    if created_to:
        try:
            created_to_parsed = datetime.strptime(created_to, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат created_to, ожидается YYYY-MM-DD")
        query = query.filter(Request.created_at <= datetime.combine(created_to_parsed, datetime.max.time()))
    if completed_from:
        try:
            completed_from_parsed = datetime.strptime(completed_from, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат completed_from, ожидается YYYY-MM-DD")
        query = query.filter(Request.completed_at >= datetime.combine(completed_from_parsed, datetime.min.time()))
    if completed_to:
        try:
            completed_to_parsed = datetime.strptime(completed_to, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат completed_to, ожидается YYYY-MM-DD")
        query = query.filter(Request.completed_at <= datetime.combine(completed_to_parsed, datetime.max.time()))

    items = query.order_by(Request.assigned_to.asc().nullsfirst(), Request.created_at.desc()).all()
    return {
        "items": [build_request_list_item(r, db) for r in items],
        "total": len(items),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_requests.py::test_list_requests_filter_by_created_and_completed_dates -v`

Expected: PASS

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && pytest tests/test_requests.py -v`

Expected: все тесты проходят.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/requests.py backend/tests/test_requests.py
git commit -m "feat(backend): фильтрация списка заявок по датам создания и завершения"
```

---

### Task 2: Frontend — фильтры дат и выбор по фильтру на странице «Заявки»

**Files:**
- Modify: `frontend/src/pages/RequestsListPage.jsx`

**Interfaces:**
- Consumes: `requestsAPI.list({ status, building_id, created_from, created_to, completed_from, completed_to })`
- Produces: UI с полями дат и кнопкой «Выбрать все по фильтру», обновлённый `selectedIds`.

- [ ] **Step 1: Update state and loading logic**

Изменить инициализацию `filters`:

```jsx
const [filters, setFilters] = useState({
  status: 'new',
  building_id: '',
  created_from: '',
  created_to: '',
  completed_from: '',
  completed_to: '',
});
```

В `loadRequests` добавить передачу новых параметров:

```jsx
const loadRequests = useCallback(async () => {
  setLoading(true);
  setError('');
  try {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.building_id) params.building_id = filters.building_id;
    if (filters.created_from) params.created_from = filters.created_from;
    if (filters.created_to) params.created_to = filters.created_to;
    if (filters.completed_from) params.completed_from = filters.completed_from;
    if (filters.completed_to) params.completed_to = filters.completed_to;
    const res = await requestsAPI.list(params);
    let items = res.data.items || [];

    if (isContractor && (filters.status === 'in_progress' || filters.status === 'completed')) {
      items = items.filter(req => req.executor?.id === user.id);
    }

    setItems(items);
  } catch (e) {
    setError(e.response?.data?.detail || 'Ошибка загрузки заявок');
    setItems([]);
  } finally {
    setLoading(false);
  }
}, [filters, isContractor, user]);
```

Обновить зависимость `useCallback` с `[filters.status, filters.building_id, isContractor, user]` на `[filters, isContractor, user]`.

- [ ] **Step 2: Reset selection on filter change**

Заменить:

```jsx
useEffect(() => {
  setSelectedIds([]);
}, [items.length]);
```

на:

```jsx
useEffect(() => {
  setSelectedIds([]);
}, [filters]);
```

- [ ] **Step 3: Add select-all-by-filter helper**

После `toggleAll` добавить:

```jsx
const selectAllByFilter = () => {
  if (selectedIds.length === items.length) {
    setSelectedIds([]);
  } else {
    setSelectedIds(items.map((r) => r.id));
  }
};
```

- [ ] **Step 4: Add date inputs and select button to UI**

В блоке с заголовком (`styles.header`) рядом с кнопкой печати добавить кнопку выбора:

```jsx
<div style={styles.header}>
  <h1 style={styles.title}>Заявки</h1>
  {canPrint && (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <button
        onClick={selectAllByFilter}
        disabled={items.length === 0}
        style={{
          ...styles.secondaryBtn,
          opacity: items.length === 0 ? 0.5 : 1,
          cursor: items.length === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        {selectedIds.length === items.length && items.length > 0 ? 'Снять выбор' : 'Выбрать все по фильтру'}
      </button>
      <button
        onClick={handlePrint}
        disabled={selectedIds.length === 0}
        style={{
          ...styles.printBtn,
          opacity: selectedIds.length === 0 ? 0.5 : 1,
          cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        🖨 Печать ({selectedIds.length})
      </button>
    </div>
  )}
</div>
```

Найти существующий блок фильтров со статусом и корпусом (после `styles.tabBar`) и добавить поля дат. Например, после селекта корпуса:

```jsx
<input
  type="date"
  placeholder="Создана с"
  value={filters.created_from}
  onChange={(e) => setFilters({ ...filters, created_from: e.target.value })}
  style={styles.filterInput}
/>
<input
  type="date"
  placeholder="Создана по"
  value={filters.created_to}
  onChange={(e) => setFilters({ ...filters, created_to: e.target.value })}
  style={styles.filterInput}
/>
<input
  type="date"
  placeholder="Завершена с"
  value={filters.completed_from}
  onChange={(e) => setFilters({ ...filters, completed_from: e.target.value })}
  style={styles.filterInput}
/>
<input
  type="date"
  placeholder="Завершена по"
  value={filters.completed_to}
  onChange={(e) => setFilters({ ...filters, completed_to: e.target.value })}
  style={styles.filterInput}
/>
```

- [ ] **Step 5: Verify manually**

1. Открыть страницу `/requests` как `director` или `admin`.
2. Установить диапазон дат создания — список должен обновиться.
3. Нажать «Выбрать все по фильтру» — счётчик печати должен стать равным количеству отображённых заявок.
4. Снять/поставить отдельный чекбокс — счётчик меняется.
5. Нажать «Печать» — должен скачаться ZIP.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RequestsListPage.jsx
git commit -m "feat(frontend): фильтр по периоду и выбор всех заявок на странице заявок"
```

---

### Task 3: Frontend — фильтры дат и выбор по фильтру на дашборде

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx`

**Interfaces:**
- Consumes: `requestsAPI.list({ status, building_id, created_from, created_to, completed_from, completed_to })`
- Produces: UI с полями дат и кнопкой «Выбрать все по фильтру» в `RequestsDashboard`, обновлённый `selectedIds`.

- [ ] **Step 1: Update state and loading logic**

Изменить состояние фильтров в `RequestsDashboard`:

```jsx
const [filterStatus, setFilterStatus] = useState('');
const [filterBuilding, setFilterBuilding] = useState('');
const [filterCreatedFrom, setFilterCreatedFrom] = useState('');
const [filterCreatedTo, setFilterCreatedTo] = useState('');
const [filterCompletedFrom, setFilterCompletedFrom] = useState('');
const [filterCompletedTo, setFilterCompletedTo] = useState('');
```

Заменить `load` на:

```jsx
const load = useCallback(async () => {
  setLoading(true);
  try {
    const params = {};
    if (filterStatus) params.status = filterStatus;
    if (filterBuilding) params.building_id = filterBuilding;
    if (filterCreatedFrom) params.created_from = filterCreatedFrom;
    if (filterCreatedTo) params.created_to = filterCreatedTo;
    if (filterCompletedFrom) params.completed_from = filterCompletedFrom;
    if (filterCompletedTo) params.completed_to = filterCompletedTo;
    const res = await requestsAPI.list(params);
    setItems(res.data.items || []);
  } catch (e) {
    setItems([]);
  } finally {
    setLoading(false);
  }
}, [filterStatus, filterBuilding, filterCreatedFrom, filterCreatedTo, filterCompletedFrom, filterCompletedTo]);
```

- [ ] **Step 2: Reset selection on filter change**

Заменить:

```jsx
useEffect(() => {
  setSelectedIds([]);
}, [items.length, filterStatus, filterBuilding]);
```

на:

```jsx
useEffect(() => {
  setSelectedIds([]);
}, [filterStatus, filterBuilding, filterCreatedFrom, filterCreatedTo, filterCompletedFrom, filterCompletedTo]);
```

- [ ] **Step 3: Add select-all-by-filter helper**

После `toggleAll` добавить:

```jsx
const selectAllByFilter = () => {
  if (selectedIds.length === items.length) {
    setSelectedIds([]);
  } else {
    setSelectedIds(items.map((r) => r.id));
  }
};
```

- [ ] **Step 4: Add date inputs and select button to UI**

В блоке фильтров (`styles.filters`) после селекта корпуса добавить четыре поля дат:

```jsx
<input
  type="date"
  placeholder="Создана с"
  value={filterCreatedFrom}
  onChange={(e) => setFilterCreatedFrom(e.target.value)}
  style={styles.filterInput}
/>
<input
  type="date"
  placeholder="Создана по"
  value={filterCreatedTo}
  onChange={(e) => setFilterCreatedTo(e.target.value)}
  style={styles.filterInput}
/>
<input
  type="date"
  placeholder="Завершена с"
  value={filterCompletedFrom}
  onChange={(e) => setFilterCompletedFrom(e.target.value)}
  style={styles.filterInput}
/>
<input
  type="date"
  placeholder="Завершена по"
  value={filterCompletedTo}
  onChange={(e) => setFilterCompletedTo(e.target.value)}
  style={styles.filterInput}
/>
```

Заменить блок кнопки печати на группу из двух кнопок:

```jsx
{canPrint && (
  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
    <button
      onClick={selectAllByFilter}
      disabled={items.length === 0}
      style={{
        ...styles.secondaryBtn,
        opacity: items.length === 0 ? 0.5 : 1,
        cursor: items.length === 0 ? 'not-allowed' : 'pointer',
      }}
    >
      {selectedIds.length === items.length && items.length > 0 ? 'Снять выбор' : 'Выбрать все по фильтру'}
    </button>
    <button
      onClick={handlePrint}
      disabled={selectedIds.length === 0}
      style={{
        ...styles.secondaryBtn,
        opacity: selectedIds.length === 0 ? 0.5 : 1,
        cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
      }}
    >
      🖨 Печать ({selectedIds.length})
    </button>
  </div>
)}
```

- [ ] **Step 5: Verify manually**

1. Открыть дашборд, перейти на вкладку «Заявки» как `director` или `admin`.
2. Установить диапазон дат — список обновляется.
3. Нажать «Выбрать все по фильтру» — счётчик печати соответствует отображённым заявкам.
4. Снять/добавить отдельный чекбокс — счётчик меняется.
5. Нажать «Печать» — скачивается ZIP.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx
git commit -m "feat(frontend): фильтр по периоду и выбор всех заявок на дашборде"
```

---

## Self-Review

**Spec coverage:**
- Фильтр по дате создания — Task 1 (backend) + Task 2/3 (frontend params).
- Фильтр по дате завершения — Task 1 (backend) + Task 2/3 (frontend params).
- Кнопка «Выбрать все по фильтру» — Task 2/3.
- Сохранение чекбоксов для ручной корректировки — Task 2/3.
- Применение на `/requests` и дашборде — Task 2 и Task 3.
- Доступ только `director`/`admin` — уже обеспечен существующим `canPrint`.

**Placeholder scan:**
- Нет TBD/TODO, все шаги содержат конкретный код и команды.

**Type consistency:**
- Параметры `created_from`, `created_to`, `completed_from`, `completed_to` единообразны в backend и frontend.
- Имена state/handler'ов во frontend различаются между компонентами, но это соответствует существующему стилю каждого компонента.
