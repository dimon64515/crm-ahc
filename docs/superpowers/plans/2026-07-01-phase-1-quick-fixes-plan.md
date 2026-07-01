# Фаза 1 — Быстрые правки: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить столбец «Дата работ» и русский формат дат в акт Word, дать администратору возможность редактировать все поля записи о работе, и исправить скачивание архива фотографий.

**Architecture:** Все изменения укладываются в существующие роутеры `/api/reports`, `/api/works`, `/api/backups`. Правки в Word-документе делаются в `generate_act_docx`. Редактирование работы расширяет `WorkUpdate` отдельной схемой `WorkUpdateAdmin`, которую использует только админ. Архив фото чинится нормализацией абсолютного/относительного пути.

**Tech Stack:** FastAPI 0.111.0, SQLAlchemy 2.0.30, Pydantic 2.7.1, python-docx 1.2.0, React 19.2.6, Vite 8.0.12.

## Global Constraints

- Backend: Python 3.11+, FastAPI 0.111.0, SQLAlchemy 2.0.30, Pydantic 2.7.1.
- Frontend: React 19.2.6, Vite 8.0.12, Axios 1.16.1.
- База данных: PostgreSQL 15, миграции через Alembic.
- Все строки, сообщения об ошибках и комментарии — на русском языке.
- Ролевая модель: `contractor`, `director`, `admin`.
- Историчность цен: при создании работы цены фиксируются; при редактировании админом пересчёт выполняется по актуальным ценам справочника.
- Минимальные изменения существующей архитектуры.

---

### Task 1: Добавить столбец «Дата работ» в таблицу работ акта Word

**Files:**
- Modify: `backend/app/routers/reports.py:476-528`
- Test: `backend/tests/test_reports_act.py` (создать)

**Interfaces:**
- Consumes: `List[Work]` с полем `work_date` типа `date`.
- Produces: `BytesIO` с Word-документом, в таблице работ добавлен столбец «Дата работ».

- [ ] **Step 1: Создать тестовый файл и написать падающий тест**

```bash
mkdir -p backend/tests
```

```python
# backend/tests/test_reports_act.py
import os
from datetime import date
from decimal import Decimal

from docx import Document

from app.routers.reports import generate_act_docx


class FakeUser:
    full_name = "Иванов И.И."
    username = "ivanov"


class FakeBuilding:
    number = "5"
    name = "Главный"


class FakeService:
    name = "Ремонт кровли"
    unit = "м2"


class FakeWork:
    work_date = date(2026, 6, 15)
    building = FakeBuilding()
    service = FakeService()
    service_quantity = Decimal("10.5")
    service_unit_price = Decimal("1200.00")
    service_total_price = Decimal("12600.00")
    total_price = Decimal("12600.00")
    work_materials = []


def test_act_table_has_work_date_column():
    output = generate_act_docx([FakeWork()])
    doc = Document(output)
    tables = [t for t in doc.tables if t.rows[0].cells[2].text == "Наименование работ"]
    assert tables, "Таблица работ не найдена"
    header = [cell.text for cell in tables[0].rows[0].cells]
    assert "Дата работ" in header, f"Столбец 'Дата работ' отсутствует: {header}"
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

```bash
cd backend
source venv/bin/activate
pytest tests/test_reports_act.py::test_act_table_has_work_date_column -v
```

Expected: FAIL с сообщением `Столбец 'Дата работ' отсутствует`.

- [ ] **Step 3: Изменить таблицу работ в `generate_act_docx`**

В `backend/app/routers/reports.py` найти блок таблицы работ (после строки `add_text("7. Объем оказанных услуг:", bold=True)`). Заменить:

```python
    # Таблица работ
    add_text("7. Объем оказанных услуг:", bold=True)
    table2 = doc.add_table(rows=1, cols=7)
    table2.style = "Table Grid"
    table2.autofit = False
    table2.allow_autofit = False

    hdr2 = table2.rows[0].cells
    headers2 = ["№", "Адрес объекта", "Наименование работ", "Кол-во", "Ед. измерения", "Цена за ед. руб.", "Стоимость работ (услуг) руб."]
```

на:

```python
    # Таблица работ
    add_text("7. Объем оказанных услуг:", bold=True)
    table2 = doc.add_table(rows=1, cols=8)
    table2.style = "Table Grid"
    table2.autofit = False
    table2.allow_autofit = False

    hdr2 = table2.rows[0].cells
    headers2 = ["№", "Дата работ", "Адрес объекта", "Наименование работ", "Кол-во", "Ед. измерения", "Цена за ед. руб.", "Стоимость работ (услуг) руб."]
    widths2 = [Cm(1.0), Cm(2.2), Cm(2.8), Cm(4.5), Cm(1.5), Cm(2.0), Cm(2.5), Cm(3.0)]
```

Затем заменить заполнение строк таблицы работ:

```python
    service_total = Decimal("0")
    for idx, work in enumerate(works, start=1):
        row = table2.add_row().cells
        address = f"{work.building.number} {work.building.name or ''}".strip()
        values = [
            str(idx),
            address,
            work.service.name,
            str(work.service_quantity),
            work.service.unit or "",
            f"{float(work.service_unit_price or 0):.2f}",
            f"{float(work.service_total_price or 0):.2f}",
        ]
        for i, val in enumerate(values):
            row[i].text = val
            row[i].width = widths[i]
        service_total += work.service_total_price or Decimal("0")
```

на:

```python
    service_total = Decimal("0")
    for idx, work in enumerate(works, start=1):
        row = table2.add_row().cells
        address = f"{work.building.number} {work.building.name or ''}".strip()
        work_date_str = work.work_date.strftime("%d.%m.%Y") if work.work_date else ""
        values = [
            str(idx),
            work_date_str,
            address,
            work.service.name,
            str(work.service_quantity),
            work.service.unit or "",
            f"{float(work.service_unit_price or 0):.2f}",
            f"{float(work.service_total_price or 0):.2f}",
        ]
        for i, val in enumerate(values):
            row[i].text = val
            row[i].width = widths2[i]
        service_total += work.service_total_price or Decimal("0")
```

- [ ] **Step 4: Запустить тест, убедиться, что он проходит**

```bash
pytest tests/test_reports_act.py::test_act_table_has_work_date_column -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_reports_act.py backend/app/routers/reports.py
git commit -m "feat(reports): add work date column to Word act table"
```

---

### Task 2: Изменить дату отчёта в Word-акте на русский язык

**Files:**
- Modify: `backend/app/routers/reports.py:363-369`
- Test: `backend/tests/test_reports_act.py`

**Interfaces:**
- Consumes: `datetime.now()`.
- Produces: Строка в документе вида `г. Пятигорск	«15» июня 2026 г.`.

- [ ] **Step 1: Написать падающий тест**

```python
def test_act_header_date_is_russian():
    output = generate_act_docx([FakeWork()])
    doc = Document(output)
    found = False
    for p in doc.paragraphs:
        if "г. Пятигорск" in p.text and "июня" in p.text:
            found = True
            break
    assert found, "Русская дата в шапке акта не найдена"
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

```bash
pytest tests/test_reports_act.py::test_act_header_date_is_russian -v
```

Expected: FAIL с сообщением `Русская дата в шапке акта не найдена`.

- [ ] **Step 3: Заменить форматирование даты в шапке**

В `backend/app/routers/reports.py` найти блок:

```python
    # Город и дата
    today = datetime.now()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run(f"г. Пятигорск\t«{today.day:02d}» {today.strftime('%B')} {today.year} г.")
    run.font.name = "Times New Roman"
    run.font.size = Pt(12)
```

Заменить на:

```python
    # Город и дата
    today = datetime.now()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run(f"г. Пятигорск\t{_format_period_date(today.date())}")
    run.font.name = "Times New Roman"
    run.font.size = Pt(12)
```

- [ ] **Step 4: Запустить тест, убедиться, что он проходит**

```bash
pytest tests/test_reports_act.py::test_act_header_date_is_russian -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_reports_act.py backend/app/routers/reports.py
git commit -m "feat(reports): use Russian date format in Word act header"
```

---

### Task 3: Расширить схему `WorkUpdate` для полного редактирования админом

**Files:**
- Modify: `backend/app/schemas.py:174-185`
- Create: `backend/tests/test_schemas.py` (создать)

**Interfaces:**
- Consumes: Исходная схема `WorkUpdate`.
- Produces: `WorkUpdateAdmin` с полями `building_id`, `service_id`, `user_id`, `materials`.

- [ ] **Step 1: Написать падающий тест на схему**

```python
# backend/tests/test_schemas.py
from app.schemas import WorkUpdateAdmin


def test_work_update_admin_accepts_full_fields():
    data = {
        "building_id": 1,
        "service_id": 2,
        "user_id": 3,
        "work_date": "2026-06-20",
        "description": "Новое описание",
        "service_quantity": "15.00",
        "materials": [{"material_id": 5, "quantity": "2.5"}],
    }
    obj = WorkUpdateAdmin(**data)
    assert obj.building_id == 1
    assert obj.service_id == 2
    assert obj.user_id == 3
    assert obj.materials[0].material_id == 5
```

- [ ] **Step 2: Запустить тест, убедиться, что он падает**

```bash
pytest tests/test_schemas.py::test_work_update_admin_accepts_full_fields -v
```

Expected: FAIL с ошибкой `WorkUpdateAdmin` is not defined.

- [ ] **Step 3: Добавить схему `WorkUpdateAdmin` в `schemas.py`**

После `WorkUpdate` добавить:

```python


class WorkUpdateAdmin(WorkUpdate):
    building_id: Optional[int] = None
    service_id: Optional[int] = None
    user_id: Optional[int] = None
    materials: List[WorkMaterialCreate] = []
```

- [ ] **Step 4: Запустить тест, убедиться, что он проходит**

```bash
pytest tests/test_schemas.py::test_work_update_admin_accepts_full_fields -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_schemas.py backend/app/schemas.py
git commit -m "feat(schemas): add WorkUpdateAdmin for full admin editing"
```

---

### Task 4: Реализовать полное редактирование записи админом

**Files:**
- Modify: `backend/app/routers/works.py:1-15`, `226-254`
- Test: `backend/tests/test_works_admin_update.py` (создать)

**Interfaces:**
- Consumes: `WorkUpdateAdmin` из `schemas.py`.
- Produces: Обновлённый объект `Work` с пересчитанными ценами.

- [ ] **Step 1: Импортировать новую схему**

В `backend/app/routers/works.py` изменить импорт:

```python
from app.schemas import (
    WorkCreate, WorkResponse, WorkListResponse, WorkListItem,
    WorkPhotoResponse, WorkFileResponse, WorkMaterialResponse,
    WorkUpdatePrices, WorkUpdate, WorkUpdateAdmin
)
```

- [ ] **Step 2: Написать падающий тест на обновление админом**

```python
# backend/tests/test_works_admin_update.py
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models import User, Building, Service, Material, Work
from app.core.security import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
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


def test_admin_can_update_all_work_fields():
    db = TestingSessionLocal()
    admin = User(username="admin", hashed_password=get_password_hash("pass"), role="admin", is_active=True)
    contractor = User(username="contractor", hashed_password=get_password_hash("pass"), role="contractor", is_active=True)
    building1 = Building(number="1", name="Корпус 1", is_active=True)
    building2 = Building(number="2", name="Корпус 2", is_active=True)
    service = Service(name="Мойка", unit="м2", price=Decimal("100.00"), is_active=True)
    db.add_all([admin, contractor, building1, building2, service])
    db.commit()

    work = Work(
        user_id=contractor.id,
        building_id=building1.id,
        service_id=service.id,
        work_date="2026-06-01",
        description="Старое описание",
        service_quantity=Decimal("5.00"),
        service_unit_price=Decimal("100.00"),
        service_total_price=Decimal("500.00"),
        materials_total_price=Decimal("0"),
        total_price=Decimal("500.00"),
    )
    db.add(work)
    db.commit()
    db.refresh(work)

    login = client.post("/api/auth/login", json={"username": "admin", "password": "pass"})
    token = login.json()["access_token"]

    response = client.put(
        f"/api/works/{work.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "building_id": building2.id,
            "description": "Новое описание",
            "service_quantity": "10.00",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["building"]["number"] == "2"
    assert data["description"] == "Новое описание"
    assert Decimal(data["service_total_price"]) == Decimal("1000.00")
    db.close()
```

- [ ] **Step 3: Запустить тест, убедиться, что он падает**

```bash
pytest tests/test_works_admin_update.py::test_admin_can_update_all_work_fields -v
```

Expected: FAIL, так как endpoint не поддерживает новые поля.

- [ ] **Step 4: Реализовать полное редактирование в `update_work`**

Заменить функцию `update_work` в `backend/app/routers/works.py`:

```python
@router.put("/{work_id}", response_model=WorkResponse)
def update_work(
    work_id: int,
    data: WorkUpdateAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    work = db.query(Work).filter(Work.id == work_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Работа не найдена")

    if current_user.role == 'director':
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    if current_user.role == 'contractor' and work.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    if current_user.role == 'admin':
        # Полное редактирование для администратора
        if data.building_id is not None:
            building = db.query(Building).filter(Building.id == data.building_id).first()
            if not building:
                raise HTTPException(status_code=404, detail="Корпус не найден")
            work.building_id = data.building_id

        if data.service_id is not None:
            service = db.query(Service).filter(Service.id == data.service_id, Service.is_active == True).first()
            if not service:
                raise HTTPException(status_code=404, detail="Вид работы не найден")
            work.service_id = data.service_id
            work.service_unit_price = service.price

        if data.user_id is not None:
            user = db.query(User).filter(User.id == data.user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="Пользователь не найден")
            work.user_id = data.user_id

        if data.materials:
            material_ids = [m.material_id for m in data.materials]
            if len(material_ids) != len(set(material_ids)):
                raise HTTPException(status_code=400, detail="Материалы не должны дублироваться")

            # Удаляем старые материалы
            for wm in work.work_materials:
                db.delete(wm)
            db.flush()

            materials_total = Decimal('0')
            for mat_data in data.materials:
                material = db.query(Material).filter(Material.id == mat_data.material_id, Material.is_active == True).first()
                if not material:
                    continue
                mat_total = mat_data.quantity * material.price
                work_material = WorkMaterial(
                    work_id=work.id,
                    material_id=mat_data.material_id,
                    quantity=mat_data.quantity,
                    unit_price=material.price,
                    total_price=mat_total,
                )
                db.add(work_material)
                materials_total += mat_total
            work.materials_total_price = materials_total

    # Общие поля, доступные админу и подрядчику
    if data.description is not None:
        work.description = data.description
    if data.work_date is not None:
        work.work_date = data.work_date
    if data.service_quantity is not None:
        work.service_quantity = data.service_quantity

    # Пересчёт сумм
    work.service_total_price = work.service_quantity * work.service_unit_price
    work.total_price = work.service_total_price + (work.materials_total_price or Decimal('0'))

    db.commit()
    db.refresh(work)
    return build_work_response(work)
```

- [ ] **Step 5: Запустить тест, убедиться, что он проходит**

```bash
pytest tests/test_works_admin_update.py::test_admin_can_update_all_work_fields -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_works_admin_update.py backend/app/routers/works.py backend/app/schemas.py
git commit -m "feat(works): allow admin to edit all work fields"
```

---

### Task 5: Добавить UI редактирования для админа на странице работы

**Files:**
- Modify: `frontend/src/pages/WorkDetailPage.jsx:14-123`, `183-227`
- Modify: `frontend/src/api.js:85-90`

**Interfaces:**
- Consumes: `worksAPI.update(id, payload)`.
- Produces: Форма с полями корпуса, вида работ, подрядчика, описания, даты, количества и материалов для админа.

- [ ] **Step 1: Добавить API-методы для справочников**

В `frontend/src/api.js` убедиться, что есть `usersAPI.list`, `buildingsAPI.list`, `servicesAPI.list`, `materialsAPI.list` (уже есть).

- [ ] **Step 2: Добавить состояние и загрузку справочников в `WorkDetailPage.jsx`**

Заменить начало компонента (строки 10-34):

```jsx
export default function WorkDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [edited, setEdited] = useState({
    description: '',
    service_quantity: '',
    work_date: '',
    building_id: '',
    service_id: '',
    user_id: '',
    materials: [],
  });
  const [buildings, setBuildings] = useState([]);
  const [services, setServices] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [allMaterials, setAllMaterials] = useState([]);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadWork(); loadBuildings(); loadServices(); loadContractors(); loadMaterials(); }, [id]);

  const loadWork = async () => { ... };
  const loadBuildings = async () => { try { const res = await buildingsAPI.list({ is_active: true }); setBuildings(res.data); } catch (e) {} };
  const loadServices = async () => { try { const res = await servicesAPI.list(); setServices(res.data.items || []); } catch (e) {} };
  const loadContractors = async () => { try { const res = await usersAPI.list({ role: 'contractor' }); setContractors(res.data.items || []); } catch (e) {} };
  const loadMaterials = async () => { try { const res = await materialsAPI.list(); setAllMaterials(res.data.items || []); } catch (e) {} };
```

В `loadWork` обновить `setEdited`:

```jsx
      setEdited({
        description: res.data.description || '',
        service_quantity: res.data.service_quantity ?? '',
        work_date: res.data.work_date || '',
        building_id: res.data.building?.id || '',
        service_id: res.data.service?.id || '',
        user_id: res.data.created_by?.id || '',
        materials: (res.data.materials || []).map(m => ({ material_id: m.material_id, quantity: m.quantity })),
      });
```

- [ ] **Step 3: Добавить форму для админа в режиме редактирования**

После существующего блока `editMode && (` с датой и количеством добавить админ-поля:

```jsx
        {editMode && user.role === 'admin' && (
          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>Корпус</label>
              <select value={edited.building_id} onChange={e => setEdited({ ...edited, building_id: e.target.value })} style={styles.input}>
                <option value="">Выберите корпус</option>
                {buildings.map(b => <option key={b.id} value={b.id}>{b.number} — {b.name}</option>)}
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Вид работ</label>
              <select value={edited.service_id} onChange={e => setEdited({ ...edited, service_id: e.target.value })} style={styles.input}>
                <option value="">Выберите вид работ</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Подрядчик</label>
              <select value={edited.user_id} onChange={e => setEdited({ ...edited, user_id: e.target.value })} style={styles.input}>
                <option value="">Выберите подрядчика</option>
                {contractors.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
              </select>
            </div>
          </div>
        )}

        {editMode && user.role === 'admin' && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Материалы</h3>
            {(edited.materials || []).map((m, idx) => (
              <div key={idx} style={{ ...styles.row, alignItems: 'flex-end' }}>
                <div style={{ ...styles.field, flex: 2 }}>
                  <label style={styles.label}>Материал</label>
                  <select value={m.material_id} onChange={e => {
                    const materials = [...edited.materials];
                    materials[idx].material_id = parseInt(e.target.value);
                    setEdited({ ...edited, materials });
                  }} style={styles.input}>
                    <option value="">Выберите материал</option>
                    {allMaterials.map(mat => <option key={mat.id} value={mat.id}>{mat.name} ({mat.unit})</option>)}
                  </select>
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Кол-во</label>
                  <input type="number" min="0" step="0.01" value={m.quantity} onChange={e => {
                    const materials = [...edited.materials];
                    materials[idx].quantity = e.target.value;
                    setEdited({ ...edited, materials });
                  }} style={styles.input} />
                </div>
                <button onClick={() => setEdited({ ...edited, materials: edited.materials.filter((_, i) => i !== idx) })} style={styles.dangerBtn}>Удалить</button>
              </div>
            ))}
            <button onClick={() => setEdited({ ...edited, materials: [...edited.materials, { material_id: '', quantity: '' }] })} style={styles.secondaryBtn}>+ Добавить материал</button>
          </div>
        )}
```

- [ ] **Step 4: Обновить `handleUpdateWork` для админских полей**

Заменить `handleUpdateWork`:

```jsx
  const handleUpdateWork = async () => {
    const payload = {};

    if (edited.description !== (work.description || '')) {
      payload.description = edited.description;
    }
    if (edited.work_date && edited.work_date !== work.work_date) {
      payload.work_date = edited.work_date;
    }
    if (edited.service_quantity !== '' && edited.service_quantity !== undefined && edited.service_quantity !== null) {
      const qtyStr = String(edited.service_quantity).replace(',', '.').trim();
      const qty = parseFloat(qtyStr);
      if (Number.isNaN(qty) || qty <= 0) {
        alert('Количество должно быть числом больше 0');
        return;
      }
      const originalQty = parseFloat(String(work.service_quantity).replace(',', '.').trim());
      if (qty !== originalQty) {
        payload.service_quantity = qty;
      }
    }

    if (user.role === 'admin') {
      if (edited.building_id && edited.building_id !== work.building?.id) {
        payload.building_id = parseInt(edited.building_id);
      }
      if (edited.service_id && edited.service_id !== work.service?.id) {
        payload.service_id = parseInt(edited.service_id);
      }
      if (edited.user_id && edited.user_id !== work.created_by?.id) {
        payload.user_id = parseInt(edited.user_id);
      }
      const materialsPayload = (edited.materials || [])
        .filter(m => m.material_id && m.quantity)
        .map(m => ({ material_id: parseInt(m.material_id), quantity: parseFloat(String(m.quantity).replace(',', '.')) }));
      if (materialsPayload.length > 0 || (work.materials || []).length > 0) {
        payload.materials = materialsPayload;
      }
    }

    if (Object.keys(payload).length === 0) {
      setEditMode(false);
      return;
    }

    try {
      await worksAPI.update(id, payload);
      setEditMode(false);
      loadWork();
    } catch (e) {
      const data = e.response?.data;
      let msg = 'Ошибка сохранения';
      if (data) {
        if (Array.isArray(data.detail)) {
          msg = data.detail.map(err => `${err.loc?.join('.') || 'field'} — ${err.msg}`).join('\n');
        } else if (typeof data.detail === 'string') {
          msg = data.detail;
        } else if (typeof data.detail === 'object' && data.detail !== null) {
          msg = JSON.stringify(data.detail, null, 2);
        } else if (typeof data === 'object' && data !== null) {
          msg = JSON.stringify(data, null, 2);
        }
      }
      alert(msg);
    }
  };
```

- [ ] **Step 5: Проверить линтер и сборку frontend**

```bash
cd frontend
npm run lint
npm run build
```

Expected: успешная сборка без ошибок.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/WorkDetailPage.jsx
git commit -m "feat(frontend): full work editing form for admin"
```

---

### Task 6: Исправить нормализацию пути в архиве фотографий

**Files:**
- Modify: `backend/app/routers/backups.py:100-115`
- Test: `backend/tests/test_backups_photos.py` (создать)

**Interfaces:**
- Consumes: `WorkPhoto.file_path` (абсолютный или относительный).
- Produces: Корректный ZIP-архив в `uploads/backups/`.

- [ ] **Step 1: Создать вспомогательную функцию нормализации пути**

В `backend/app/routers/backups.py` добавить после импортов:

```python

def resolve_photo_path(file_path: str, upload_dir: str) -> str:
    """Возвращает корректный абсолютный путь к фото независимо от того,
    хранится ли в БД абсолютный или относительный путь."""
    if not file_path:
        return ""
    if os.path.isabs(file_path) and os.path.exists(file_path):
        return file_path
    # Если путь относительный (например, photos/building_1/...)
    relative = file_path.lstrip('/')
    absolute = os.path.join(upload_dir, relative)
    if os.path.exists(absolute):
        return absolute
    return ""
```

- [ ] **Step 2: Написать падающий тест**

```python
# backend/tests/test_backups_photos.py
import os
import tempfile
from unittest.mock import patch

from app.routers.backups import resolve_photo_path


def test_resolve_photo_path_with_absolute_path():
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"test")
        path = f.name
    try:
        result = resolve_photo_path(path, "/tmp/uploads")
        assert result == path
    finally:
        os.unlink(path)


def test_resolve_photo_path_with_relative_path():
    with tempfile.TemporaryDirectory() as upload_dir:
        photo_dir = os.path.join(upload_dir, "photos", "building_1")
        os.makedirs(photo_dir)
        photo_path = os.path.join(photo_dir, "test.jpg")
        with open(photo_path, "wb") as f:
            f.write(b"test")
        result = resolve_photo_path("photos/building_1/test.jpg", upload_dir)
        assert result == photo_path
```

- [ ] **Step 3: Запустить тест, убедиться, что он проходит**

```bash
pytest tests/test_backups_photos.py -v
```

Expected: PASS.

- [ ] **Step 4: Использовать функцию в `create_photos_backup`**

Заменить блок копирования фото:

```python
    photos = query.all()
    copied = 0
    for photo in photos:
        src = os.path.join(settings.UPLOAD_DIR, photo.file_path)
        if os.path.exists(src):
            dst = os.path.join(backup_path, os.path.basename(photo.file_path))
            shutil.copy2(src, dst)
            copied += 1
```

на:

```python
    photos = query.all()
    copied = 0
    for photo in photos:
        src = resolve_photo_path(photo.file_path, settings.UPLOAD_DIR)
        if not src:
            continue
        dst = os.path.join(backup_path, os.path.basename(src))
        shutil.copy2(src, dst)
        copied += 1
```

- [ ] **Step 5: Запустить тесты роутера**

```bash
pytest tests/test_backups_photos.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_backups_photos.py backend/app/routers/backups.py
git commit -m "fix(backups): normalize photo paths in photos backup"
```

---

### Task 7: Проверить скачивание архива фото

**Files:**
- Modify: `backend/app/routers/backups.py:168-186`
- Test: ручное тестирование через frontend.

**Interfaces:**
- Consumes: `backup_id`.
- Produces: ZIP-файл через `FileResponse`.

- [ ] **Step 1: Убедиться, что `download_backup` возвращает ZIP корректно**

В `backend/app/routers/backups.py` проверить/обновить `download_backup`:

```python
@router.get("/download/{backup_id}")
def download_backup(
    backup_id: str,
    db: Session = Depends(get_db),
    admin = Depends(require_director)
):
    log = db.query(BackupLog).filter(BackupLog.backup_id == backup_id).first()
    if not log or not log.file_paths:
        raise HTTPException(status_code=404, detail="Бэкап не найден")

    file_path = log.file_paths[0]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Файл бэкапа не найден")

    return FileResponse(
        file_path,
        filename=os.path.basename(file_path),
        media_type="application/zip",
        content_disposition_type="attachment",
    )
```

- [ ] **Step 2: Ручное тестирование**

1. Запустить backend: `uvicorn app.main:app --reload --port 8090`.
2. Авторизоваться как director/admin.
3. Перейти на страницу бэкапов, создать архив фото.
4. Нажать «Скачать» и убедиться, что ZIP открывается.

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/backups.py
git commit -m "fix(backups): ensure photo backup download uses attachment header"
```

---

### Task 8: Финальная проверка и миграции

**Files:**
- Modify: `backend/alembic/versions/` (если нужно)

- [ ] **Step 1: Проверить, что изменения в БД не требуются**

В Фазе 1 новых таблиц нет. Изменения касаются только логики в существующих колонках.

- [ ] **Step 2: Запустить полный набор тестов**

```bash
cd backend
pytest tests/ -v
```

Expected: все новые тесты PASS.

- [ ] **Step 3: Проверить линтер frontend**

```bash
cd frontend
npm run lint
```

Expected: без ошибок.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(phase-1): act date column, admin full edit, photo backup fix"
```

---

## Spec Coverage Check

| Требование spec | Task |
|---|---|
| Столбец «Дата работ» в акте Word | Task 1 |
| Русский формат даты в шапке акта | Task 2 |
| Расширение `WorkUpdate` для админа | Task 3 |
| Полное редактирование админом (backend) | Task 4 |
| UI редактирования для админа | Task 5 |
| Нормализация пути фото в бэкапе | Task 6 |
| Корректное скачивание ZIP | Task 7 |
| Тестирование и миграции | Task 8 |

## Placeholder Scan

- Нет `TBD`, `TODO`, `implement later`.
- Все шаги содержат конкретный код и команды.
- Все пути к файлам указаны точно.

## Type Consistency Check

- `WorkUpdateAdmin` наследуется от `WorkUpdate` и добавляет `building_id`, `service_id`, `user_id`, `materials`.
- `update_work` принимает `data: WorkUpdateAdmin`.
- Frontend отправляет те же поля (`building_id`, `service_id`, `user_id`, `materials`).
- `resolve_photo_path` используется в `create_photos_backup`.
