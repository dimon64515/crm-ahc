# Мобильный вид списка заявок — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать страницу `/requests` удобной на мобильных устройствах: кнопки действий видны без горизонтальной прокрутки, добавить backend-сортировку по умолчанию и выделение просроченных заявок.

**Architecture:** Минимальные изменения в существующем коде. Для экранов ≤768 px в `RequestsListPage.jsx` уже есть ветка карточек, нужно только дописать недостающие CSS-стили inline-объекта `styles`. Backend сортировка реализуется в `backend/app/routers/requests.py` через SQLAlchemy `order_by`. Просрочка считается на фронтенде по `due_date`.

**Tech Stack:** React 19 + inline styles, FastAPI + SQLAlchemy, pytest.

## Global Constraints

- Все строки и комментарии в коде — на русском языке (согласно `AGENTS.md`).
- Backend запросы строятся через `db.query(Model)`.
- Фронтенд использует inline-стили в объекте `styles`.
- Сортировка по умолчанию: нераспределённые заявки (`executor_id IS NULL`) сверху, затем распределённые; внутри группы `created_at` DESC.
- Просроченная заявка: `due_date < сегодня` и `status !== 'completed'`.

---

## File Structure

- `frontend/src/pages/RequestsListPage.jsx` — существующая страница списка заявок. Дописать стили карточек и функцию проверки просрочки.
- `backend/app/routers/requests.py` — endpoint `GET /api/requests`. Изменить `order_by`.
- `backend/tests/test_requests.py` — добавить тест на сортировку списка.

---

### Task 1: Backend-сортировка заявок по умолчанию

**Files:**
- Modify: `backend/app/routers/requests.py:173`
- Test: `backend/tests/test_requests.py`

**Interfaces:**
- Consumes: SQLAlchemy `Request.executor_id`, `Request.created_at`.
- Produces: `GET /api/requests` возвращает items в порядке: сначала нераспределённые, затем распределённые, внутри группы новые сверху.

- [ ] **Step 1: Написать тест на сортировку**

```python
def test_list_requests_default_sorting(client, director_token, db):
    from datetime import date, timedelta
    from app.models import Request, Building

    building = db.query(Building).first()
    # Создаём распределённую заявку с более поздней датой
    assigned = Request(
        building_id=building.id,
        description="assigned old",
        status="in_progress",
        created_by=director_token["user_id"],
        assigned_to=director_token["user_id"],
        due_date=date.today() + timedelta(days=5),
        extended_count=0,
    )
    # Создаём нераспределённую заявку с более ранней датой
    unassigned = Request(
        building_id=building.id,
        description="unassigned new",
        status="new",
        created_by=director_token["user_id"],
        due_date=date.today() + timedelta(days=5),
        extended_count=0,
    )
    db.add(assigned)
    db.add(unassigned)
    db.commit()
    db.refresh(assigned)
    db.refresh(unassigned)

    response = client.get("/api/requests", headers={"Authorization": f"Bearer {director_token['token']}"})
    assert response.status_code == 200
    items = response.json()["items"]
    ids = [item["id"] for item in items]
    # Нераспределённая должна быть выше распределённой
    assert ids.index(unassigned.id) < ids.index(assigned.id)
```

- [ ] **Step 2: Запустить тест, убедиться что он падает**

Run: `cd /home/dimon64515/projects/crm/backend && PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py::test_list_requests_default_sorting -v`
Expected: FAIL (AssertionError или порядок не тот)

- [ ] **Step 3: Изменить сортировку в endpoint'е**

В `backend/app/routers/requests.py` строка 173 заменить:

```python
items = query.order_by(Request.created_at.desc()).all()
```

на:

```python
items = query.order_by(Request.assigned_to.asc().nullsfirst(), Request.created_at.desc()).all()
```

> Примечание: если используемая версия PostgreSQL/SQLAlchemy не поддерживает `nullsfirst()`, можно использовать `case((Request.assigned_to == None, 0), else_=1).asc()`.

- [ ] **Step 4: Запустить тест, убедиться что проходит**

Run: `cd /home/dimon64515/projects/crm/backend && PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py::test_list_requests_default_sorting -v`
Expected: PASS

- [ ] **Step 5: Запустить все тесты requests**

Run: `cd /home/dimon64515/projects/crm/backend && PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/test_requests.py -v`
Expected: все PASS

- [ ] **Step 6: Commit**

```bash
cd /home/dimon64515/projects/crm
git add backend/app/routers/requests.py backend/tests/test_requests.py
git commit -m "feat(requests): сортировка списка заявок по умолчанию"
```

---

### Task 2: Mobile-стили карточек и выделение просроченных заявок

**Files:**
- Modify: `frontend/src/pages/RequestsListPage.jsx`

**Interfaces:**
- Consumes: `req.due_date`, `req.status`.
- Produces: inline styles `styles.cards`, `styles.card`, `styles.cardHeader`, `styles.cardTitleRow`, `styles.cardId`, `styles.cardBuilding`, `styles.cardBody`, `styles.cardField`, `styles.cardLabel`, `styles.cardActions`, `styles.actionsGroup`, `styles.overdueText`, `styles.overdueField`; функция `isOverdue(req)`.

- [ ] **Step 1: Добавить функцию проверки просрочки**

В `frontend/src/pages/RequestsListPage.jsx` после `formatDate` добавить:

```javascript
const isOverdue = (req) => {
  if (!req.due_date || req.status === 'completed') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(req.due_date);
  due.setHours(0, 0, 0, 0);
  return due < today;
};
```

- [ ] **Step 2: Добавить стили карточек в объект styles**

В конец объекта `styles` (перед закрывающей скобкой) добавить:

```javascript
  cards: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '14px' },
  cardHeader: { marginBottom: '10px' },
  cardTitleRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' },
  cardId: { fontWeight: 700, fontSize: '15px', color: '#111827' },
  cardBuilding: { fontSize: '14px', color: '#4b5563', fontWeight: 500 },
  cardBody: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' },
  cardField: { fontSize: '14px', color: '#374151', lineHeight: '1.4', wordBreak: 'break-word' },
  cardLabel: { color: '#6b7280', fontWeight: 500, marginRight: '4px' },
  cardActions: { marginTop: '4px' },
  actionsGroup: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  overdueText: { color: '#dc2626', fontWeight: 600 },
  overdueField: { color: '#dc2626' },
```

- [ ] **Step 3: Подсветить просроченный срок в карточке**

В мобильной ветке заменить строку:

```javascript
<div style={styles.cardField}><span style={styles.cardLabel}>Срок:</span> {formatDate(req.due_date)} · продлений: {req.extended_count || 0}</div>
```

на:

```javascript
<div style={{ ...styles.cardField, ...(isOverdue(req) ? styles.overdueField : {}) }}>
  <span style={styles.cardLabel}>Срок:</span>
  {formatDate(req.due_date)} · продлений: {req.extended_count || 0}
  {isOverdue(req) && <span style={{ ...styles.overdueText, marginLeft: '8px' }}>Просрочено</span>}
</div>
```

- [ ] **Step 4: Подсветить просроченный срок в таблице**

В десктопной строке таблицы:

```javascript
<td className="tabular-nums" style={isOverdue(req) ? { color: '#dc2626', fontWeight: 600 } : {}}>{formatDate(req.due_date)}</td>
```

- [ ] **Step 5: Проверить lint frontend**

Run: `cd /home/dimon64515/projects/crm/frontend && npm run lint`
Expected: без ошибок

- [ ] **Step 6: Commit**

```bash
cd /home/dimon64515/projects/crm
git add frontend/src/pages/RequestsListPage.jsx
git commit -m "feat(requests): мобильные карточки и подсветка просрочки"
```

---

### Task 3: Сборка и деплой фронтенда

**Files:**
- Build output: `frontend/dist/`

- [ ] **Step 1: Собрать production-билд**

Run: `cd /home/dimon64515/projects/crm/frontend && npm run build`
Expected: `dist/` обновлён, ошибок нет.

- [ ] **Step 2: Запушить изменения**

```bash
cd /home/dimon64515/projects/crm
git push
```

- [ ] **Step 3: Проверить на сервере**

Открыть `https://report.fanat-mv.ru/requests` на мобильном устройстве или в режиме мобильного эмулятора в браузере.

Проверить:
- Карточки отображаются корректно.
- Кнопки «Открыть», «Назначить» и др. видны без горизонтальной прокрутки.
- Просроченные заявки выделены красным.
- Backend возвращает нераспределённые заявки выше распределённых.

---

## Self-Review

**Spec coverage:**
- Mobile breakpoint и карточки — Task 2.
- Backend-сортировка по умолчанию — Task 1.
- Выделение просроченных — Task 2.

**Placeholder scan:**
- Нет TBD/TODO.
- Все команды и пути указаны точно.

**Type consistency:**
- `Request.assigned_to` используется для определения распределённости; в frontend `req.executor` используется для отображения, но сортировка backend по `assigned_to` коррелирует с `executor` через joinedload.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-21-mobile-requests-list.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
