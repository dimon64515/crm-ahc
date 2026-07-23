# Рефакторинг колонки «Действия» в таблице заявок — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переработать колонку «Действия» на странице «Заявки»: убрать дублирующие select'ы «Исполнитель»/«Услуга», перенести их в свои колонки с инлайн-редактированием, оставить в «Действиях» одну основную кнопку по статусу и меню «⋯» для вторичных действий.

**Architecture:** Расширить backend-схему `RequestUpdate` и endpoint `PUT /requests/{id}` полями `service_id`/`assigned_to`. На frontend вынести логику действий в два маленьких компонента (`PrimaryActionButton`, `ActionsMenu`), а редактирование услуги/исполнителя реализовать непосредственно в ячейках таблицы через `requestsAPI.update`.

**Tech Stack:** FastAPI 0.111.0 + SQLAlchemy 2.0.30 (backend), React 19.2.6 + Vite 8.0.12 (frontend), Python 3.11+, PostgreSQL 15.

## Global Constraints

- Все строковые литералы и комментарии — на русском языке.
- Backend-валидация: нельзя редактировать завершённую заявку; исполнитель должен быть активным и иметь роль `contractor`/`director`/`admin`; услуга должна быть активной.
- `director` и `admin` могут редактировать колонки «Услуга» и «Исполнитель»; остальные роли видят текст.
- Сохранить текущую бизнес-логику: `take`, `assign`, `complete`, `extend`, `print`.
- Меню «⋯» должно закрываться по клику вне себя и по Escape, иметь `aria-label="Ещё действия"`, `role="menu"`, `role="menuitem"`.

---

## File Structure

- `backend/app/schemas.py` — расширить `RequestUpdate`.
- `backend/app/routers/requests.py` — расширить `update_request`.
- `frontend/src/pages/RequestsListPage.jsx` — основной компонент, в котором перерабатывается таблица и карточки.
- `frontend/src/api.js` — `requestsAPI.update` уже существует, изменений не требует.

---

### Task 1: Расширить схему `RequestUpdate`

**Files:**
- Modify: `backend/app/schemas.py:365-375`

**Interfaces:**
- Consumes: существующий `RequestUpdate`.
- Produces: `RequestUpdate` с дополнительными полями `service_id: Optional[int] = None` и `assigned_to: Optional[int] = None`.

- [ ] **Step 1: Добавить поля в схему**

```python
class RequestUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=5)
    building_id: Optional[int] = None
    service_id: Optional[int] = None
    assigned_to: Optional[int] = None

    @field_validator('description')
    @classmethod
    def description_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Описание не может быть пустым')
        return v
```

- [ ] **Step 2: Проверить синтаксис**

Run:
```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
python -m py_compile app/schemas.py
```

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
cd /home/dimon64515/projects/crm
git add backend/app/schemas.py
git commit -m "feat(requests): extend RequestUpdate with service_id and assigned_to"
```

---

### Task 2: Расширить `PUT /requests/{request_id}`

**Files:**
- Modify: `backend/app/routers/requests.py:218-248`

**Interfaces:**
- Consumes: `RequestUpdate` из Task 1, модели `User`, `Service`.
- Produces: endpoint, который обновляет `req.service_id` и `req.assigned_to` при валидных данных.

- [ ] **Step 1: Прочитать текущую функцию `update_request`**

Run:
```bash
cd /home/dimon64515/projects/crm/backend
grep -n "def update_request" app/routers/requests.py
```

Expected: строка ~218.

- [ ] **Step 2: Вставить обработку новых полей перед `db.commit()`**

```python
    if data.service_id is not None:
        service = db.query(Service).filter(Service.id == data.service_id, Service.is_active == True).first()
        if not service:
            raise HTTPException(status_code=400, detail="Вид работы не найден или неактивен")
        req.service_id = data.service_id

    if data.assigned_to is not None:
        executor = db.query(User).filter(User.id == data.assigned_to, User.is_active == True).first()
        if not executor or executor.role not in ("contractor", "director", "admin"):
            raise HTTPException(status_code=400, detail="Исполнитель не найден или неактивен")
        req.assigned_to = data.assigned_to
```

Полный вид функции должен быть:

```python
@router.put("/{request_id}", response_model=RequestResponse)
def update_request(
    request_id: int,
    data: RequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director)
):
    req = db.query(Request).options(
        joinedload(Request.building),
        joinedload(Request.creator),
        joinedload(Request.executor),
        selectinload(Request.photos),
    ).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if req.status == "completed":
        raise HTTPException(status_code=400, detail="Нельзя редактировать завершённую заявку")

    if data.building_id is not None:
        building = db.query(Building).filter(Building.id == data.building_id, Building.is_active == True).first()
        if not building:
            raise HTTPException(status_code=400, detail="Корпус не найден или неактивен")
        req.building_id = data.building_id

    if data.description is not None:
        req.description = data.description.strip()

    if data.service_id is not None:
        service = db.query(Service).filter(Service.id == data.service_id, Service.is_active == True).first()
        if not service:
            raise HTTPException(status_code=400, detail="Вид работы не найден или неактивен")
        req.service_id = data.service_id

    if data.assigned_to is not None:
        executor = db.query(User).filter(User.id == data.assigned_to, User.is_active == True).first()
        if not executor or executor.role not in ("contractor", "director", "admin"):
            raise HTTPException(status_code=400, detail="Исполнитель не найден или неактивен")
        req.assigned_to = data.assigned_to

    db.commit()
    db.refresh(req)
    return build_request_response(req)
```

- [ ] **Step 3: Проверить синтаксис и импорты**

Run:
```bash
cd /home/dimon64515/projects/crm/backend
source venv/bin/activate
python -m py_compile app/routers/requests.py
```

Expected: exit 0, no output. Убедиться, что `User` и `Service` уже импортированы в `app/routers/requests.py`.

- [ ] **Step 4: Прогнать backend-тесты, если они есть**

Run:
```bash
cd /home/dimon64515/projects/crm/backend
PYTHONPATH=/home/dimon64515/projects/crm/backend pytest tests/ -v -k request 2>&1 | tail -40
```

Expected: все тесты проходят (или отсутствуют тесты на этот endpoint).

- [ ] **Step 5: Commit**

```bash
cd /home/dimon64515/projects/crm
git add backend/app/routers/requests.py
git commit -m "feat(requests): allow updating service_id and assigned_to via PUT"
```

---

### Task 3: Inline select'ы «Услуга» и «Исполнитель» в таблице

**Files:**
- Modify: `frontend/src/pages/RequestsListPage.jsx`

**Interfaces:**
- Consumes: `requestsAPI.update`, списки `users` и `services`, объект `req`.
- Produces: две inline-функции рендера ячеек: `renderServiceCell(req)` и `renderExecutorCell(req)`.

- [ ] **Step 1: Добавить функцию обновления поля заявки**

Внутри компонента `RequestsListPage`, после `handleAssign` добавить:

```jsx
  const handleUpdateField = async (requestId, field, value) => {
    setActionId(requestId);
    try {
      await requestsAPI.update(requestId, { [field]: value ? parseInt(value, 10) : null });
      await loadRequests();
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка обновления заявки');
    } finally {
      setActionId(null);
    }
  };
```

- [ ] **Step 2: Добавить функции рендера ячеек**

```jsx
  const renderServiceCell = (req) => {
    if (!canAssign) return req.service?.name || '—';
    return (
      <select
        value={req.service?.id || ''}
        onChange={(e) => handleUpdateField(req.id, 'service_id', e.target.value)}
        disabled={actionId === req.id || req.status === 'completed'}
        style={styles.inlineSelect}
      >
        <option value="">Не выбрана</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    );
  };

  const renderExecutorCell = (req) => {
    if (!canAssign) return req.executor?.full_name || req.executor?.username || '—';
    return (
      <select
        value={req.executor?.id || ''}
        onChange={(e) => handleUpdateField(req.id, 'assigned_to', e.target.value)}
        disabled={actionId === req.id || req.status === 'completed'}
        style={styles.inlineSelect}
      >
        <option value="">Не назначен</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
        ))}
      </select>
    );
  };
```

- [ ] **Step 3: Добавить стиль `inlineSelect` в объект `styles`**

```jsx
  inlineSelect: { padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', maxWidth: '180px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' },
```

- [ ] **Step 4: Заменить отображение текста в колонках на новые функции**

В desktop-таблице:
- строка `<td>{req.service?.name || '—'}</td>` заменить на `<td>{renderServiceCell(req)}</td>`
- строка `<td>{req.executor?.full_name || req.executor?.username || '—'}</td>` заменить на `<td>{renderExecutorCell(req)}</td>`

В мобильной карточке:
- строку `<div style={styles.cardField}><span style={styles.cardLabel}>Услуга:</span> {req.service?.name || '—'}</div>` заменить на `<div style={styles.cardField}><span style={styles.cardLabel}>Услуга:</span> {renderServiceCell(req)}</div>`
- строку `<div style={styles.cardField}><span style={styles.cardLabel}>Исполнитель:</span> {req.executor?.full_name || req.executor?.username || '—'}</div>` заменить на `<div style={styles.cardField}><span style={styles.cardLabel}>Исполнитель:</span> {renderExecutorCell(req)}</div>`

- [ ] **Step 5: Проверить, что компонент собирается**

Run:
```bash
cd /home/dimon64515/projects/crm/frontend
npm run build 2>&1 | tail -20
```

Expected: `✓ built in ...ms`.

- [ ] **Step 6: Commit**

```bash
cd /home/dimon64515/projects/crm
git add frontend/src/pages/RequestsListPage.jsx
git commit -m "feat(requests): inline editing for service and executor columns"
```

---

### Task 4: Компоненты `PrimaryActionButton` и `ActionsMenu`

**Files:**
- Modify: `frontend/src/pages/RequestsListPage.jsx`

**Interfaces:**
- Consumes: `req`, `user`, `actionId`, существующие обработчики.
- Produces: локальные компоненты `PrimaryActionButton` и `ActionsMenu` внутри `RequestsListPage`.

- [ ] **Step 1: Добавить компонент `PrimaryActionButton` внутри `RequestsListPage`**

Перед `return` добавить:

```jsx
  const PrimaryActionButton = ({ req }) => {
    if (req.status === 'new' && canTake) {
      return (
        <button
          onClick={() => handleAction(requestsAPI.take, req.id)}
          disabled={actionId === req.id}
          style={styles.actionBtn}
        >
          {actionId === req.id ? '…' : 'Взять в работу'}
        </button>
      );
    }
    if (req.status === 'in_progress' && canComplete(req)) {
      return (
        <button
          onClick={() => handleAction(requestsAPI.complete, req.id)}
          disabled={actionId === req.id}
          style={styles.successBtn}
        >
          {actionId === req.id ? '…' : 'Завершить'}
        </button>
      );
    }
    return null;
  };
```

- [ ] **Step 2: Добавить компонент `ActionsMenu` внутри `RequestsListPage`**

```jsx
  const ActionsMenu = ({ req }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target)) {
          setIsOpen(false);
        }
      };
      const handleEscape = (e) => {
        if (e.key === 'Escape') setIsOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }, []);

    const handlePrintOne = async () => {
      setIsOpen(false);
      try {
        const res = await requestsAPI.print([req.id]);
        const blob = new Blob([res.data], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `zayavka_${req.id}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (e) {
        alert(e.response?.data?.detail || 'Ошибка формирования печатной формы');
      }
    };

    const handleAssignMenu = async () => {
      setIsOpen(false);
      if (!req.assigned_to) {
        alert('Сначала выберите исполнителя в колонке «Исполнитель»');
        return;
      }
      setActionId(req.id);
      try {
        await requestsAPI.assign(req.id, req.assigned_to, req.service?.id);
        await loadRequests();
      } catch (e) {
        alert(e.response?.data?.detail || 'Ошибка назначения исполнителя');
      } finally {
        setActionId(null);
      }
    };

    return (
      <div style={styles.menuContainer} ref={menuRef}>
        <button
          type="button"
          aria-label="Ещё действия"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((v) => !v)}
          disabled={actionId === req.id}
          style={styles.menuBtn}
        >
          ⋯
        </button>
        {isOpen && (
          <div style={styles.menuDropdown} role="menu">
            <Link to={`/requests/${req.id}`} style={styles.menuItem} role="menuitem" onClick={() => setIsOpen(false)}>
              Открыть
            </Link>
            {canAssign && req.status === 'new' && (
              <button type="button" style={styles.menuItem} role="menuitem" onClick={handleAssignMenu}>
                Назначить
              </button>
            )}
            {canPrint && (
              <button type="button" style={styles.menuItem} role="menuitem" onClick={handlePrintOne}>
                Печать
              </button>
            )}
            {canExtend(req) && (
              <button type="button" style={styles.menuItem} role="menuitem" onClick={() => { setIsOpen(false); handleAction(requestsAPI.extend, req.id); }}>
                Продлить
              </button>
            )}
          </div>
        )}
      </div>
    );
  };
```

- [ ] **Step 3: Добавить стили меню в объект `styles`**

```jsx
  menuContainer: { position: 'relative', display: 'inline-block' },
  menuBtn: { width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', fontWeight: 700, color: '#4b5563' },
  menuDropdown: { position: 'absolute', right: 0, top: '38px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10, minWidth: '160px', overflow: 'hidden', textAlign: 'left' },
  menuItem: { display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', fontSize: '13px', textAlign: 'left', cursor: 'pointer', color: '#374151', textDecoration: 'none', boxSizing: 'border-box' },
```

- [ ] **Step 4: Commit**

```bash
cd /home/dimon64515/projects/crm
git add frontend/src/pages/RequestsListPage.jsx
git commit -m "feat(requests): add PrimaryActionButton and ActionsMenu components"
```

---

### Task 5: Интегрировать компоненты в таблицу и карточки, упростить `renderActions`

**Files:**
- Modify: `frontend/src/pages/RequestsListPage.jsx`

**Interfaces:**
- Consumes: `PrimaryActionButton`, `ActionsMenu` из Task 4.
- Produces: переработанная колонка «Действия» и мобильная карточка.

- [ ] **Step 1: Удалить из `renderActions` устаревшие элементы**

Функция `renderActions` должна стать:

```jsx
  const renderActions = (req) => (
    <div style={styles.actionsRow}>
      <PrimaryActionButton req={req} />
      <ActionsMenu req={req} />
    </div>
  );
```

Убрать параметр `actionStyle`, ссылку «Открыть», select'ы «Исполнитель»/«Услуга», кнопки «Назначить», «Продлить», «Завершить».

- [ ] **Step 2: Обновить стили действий**

Заменить в объекте `styles`:
- `actionsGroup` удалить или заменить на:

```jsx
  actionsRow: { display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' },
```

- `smallLink` можно оставить, если используется elsewhere, иначе удалить.
- `selectAssign` можно удалить, так как select'ы переехали в колонки.

- [ ] **Step 3: Обновить ячейку «Действия» в desktop-таблице**

```jsx
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', width: '1%' }}>
                    {renderActions(req)}
                  </td>
```

- [ ] **Step 4: Обновить мобильную карточку**

В блоке `<div style={styles.cardActions}>{renderActions(req)}</div>` ничего менять не нужно, если `renderActions` уже обновлён.

- [ ] **Step 5: Убрать неиспользуемый state `selectedAssignments`**

Удалить:
```jsx
  const [selectedAssignments, setSelectedAssignments] = useState({});
```

и функцию `handleAssign`, если она больше не используется.

- [ ] **Step 6: Собрать фронтенд**

Run:
```bash
cd /home/dimon64515/projects/crm/frontend
npm run build 2>&1 | tail -20
```

Expected: `✓ built in ...ms`.

- [ ] **Step 7: Commit**

```bash
cd /home/dimon64515/projects/crm
git add frontend/src/pages/RequestsListPage.jsx
git commit -m "feat(requests): integrate primary action and kebab menu, simplify actions column"
```

---

### Task 6: Перезапустить backend и задеплоить фронтенд

**Files:**
- Run commands on server.

**Interfaces:**
- Consumes: изменения из Task 1-2 (backend) и Task 3-5 (frontend).
- Produces: работающее приложение с новым поведением.

- [ ] **Step 1: Перезапустить backend**

Run:
```bash
sudo systemctl restart crm-backend.service
sleep 2
systemctl is-active crm-backend.service
```

Expected: `active`.

- [ ] **Step 2: Проверить health check**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8090/api/health
```

Expected: `200`.

- [ ] **Step 3: Проверить, что frontend/dist обновлён**

Run:
```bash
ls -la /home/dimon64515/projects/crm/frontend/dist
```

Expected: свежие файлы `index.html`, `assets/index-*.js`, `assets/index-*.css`.

- [ ] **Step 4: Перезагрузить nginx (опционально, для очистки кэша)**

Run:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

Expected: `syntax is ok`, `test is successful`, reload без ошибок.

---

### Task 7: Верификация

**Files:**
- Browser / API calls.

- [ ] **Step 1: Проверить backend endpoint через curl**

Run (заменить `<token>` на реальный JWT админа/директора и `<request_id>` на существующий id):
```bash
curl -s -X PUT http://127.0.0.1:8090/api/requests/<request_id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"service_id": 1, "assigned_to": 2}' | python3 -m json.tool
```

Expected: ответ содержит обновлённые `service` и `executor`.

- [ ] **Step 2: Проверить UI в браузере**

Открыть `https://report.fanat-mv.ru/requests` под ролью `director`/`admin`.

Проверить:
- В ячейке «Действия» только кнопка + иконка «⋯».
- В колонках «Услуга» и «Исполнитель» есть select'ы.
- Изменение в select'е сразу сохраняется (страница не перезагружается, статус не меняется).
- Меню «⋯» открывается/закрывается, пункты работают.
- При статусе `new` основная кнопка — «Взять в работу».
- При статусе `in_progress` основная кнопка — «Завершить».
- При статусе `completed` основной кнопки нет.

- [ ] **Step 3: Проверить мобильный вид**

В браузере включить мобильный viewport (<=768px).

Проверить:
- Карточки не имеют горизонтального скролла.
- Select'ы «Услуга»/«Исполнитель» доступны в карточке.
- Меню «⋯» открывается и не обрезается.

- [ ] **Step 4: Push всех коммитов**

```bash
cd /home/dimon64515/projects/crm
git push
```

---

## Self-Review Checklist

- [ ] Spec coverage: каждый пункт spec найден в плане.
- [ ] Placeholder scan: нет TBD/TODO/«implement later».
- [ ] Type consistency: названия полей `service_id`, `assigned_to`, `requestsAPI.update`, `requestsAPI.assign` совпадают с реальным кодом.
