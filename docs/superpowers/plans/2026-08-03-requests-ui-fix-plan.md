# Исправление UI модуля заявок — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить баги (двоение заявок, невозможность завершения) и улучшить UX для подрядчиков (вкладки статусов, убранное меню)

**Architecture:** Единый компонент RequestsPage с адаптивным UX под роль + рефакторинг RequestDetailPage (убрать меню "⋯")

**Tech Stack:** React 19.2, Vite 8, React Router 7, FastAPI (без изменений)

## Global Constraints

- Весь UI на русском языке
- Стек: React 19.2 + Vite 8 + React Router 7
- Бэкенд без изменений
- Обратная совместимость: director/admin/comendant интерфейсы не меняются

---

## File Structure

**Изменяемые файлы:**
- `frontend/src/pages/RequestsListPage.jsx` → `frontend/src/pages/RequestsPage.jsx` (ренейм + рефакторинг)
- `frontend/src/pages/RequestDetailPage.jsx` (убрать ActionsMenu, добавить защиту)
- `frontend/src/pages/RequestNewPage.jsx` (добавить защиту от двойного сабмита)
- `frontend/src/components/Layout.jsx` (изменить роут для contractor)
- `frontend/src/App.jsx` (изменить роут для contractor)

**Сохраняемые файлы:**
- `frontend/src/pages/MyRequestsPage.jsx` (без изменений для comendant)

---

### Task 1: Исправить двойное сохранение заявок в RequestNewPage

**Files:**
- Modify: `frontend/src/pages/RequestNewPage.jsx:38-63`

**Interfaces:**
- Produces: Защищённый от двойного клика handleSubmit

- [ ] **Step 1: Добавить раннюю проверку в handleSubmit**

В начале функции `handleSubmit` добавить проверку `if (submitting) return;` до `setSubmitting(true)`:

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  if (submitting) return;  // <-- Добавить эту строку
  setSubmitting(true);
  // ... остальной код без изменений
};
```

- [ ] **Step 2: Проверить работу**

Запустить frontend, создать заявку, попытаться быстро дважды нажать "Создать заявку".
Ожидается: создаётся только одна заявка.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/RequestNewPage.jsx
git commit -m "fix: prevent double submission on request creation"
```

---

### Task 2: Создать RequestsPage на базе RequestsListPage

**Files:**
- Modify: `frontend/src/pages/RequestsListPage.jsx` (переименовать в RequestsPage.jsx)
- Create: `frontend/src/pages/RequestsPage.jsx`

**Interfaces:**
- Produces: RequestsPage компонент с адаптивным UX под роль

- [ ] **Step 1: Переименовать файл**

```bash
cd /home/dimon64515/projects/crm/frontend/src/pages
mv RequestsListPage.jsx RequestsPage.jsx
```

- [ ] **Step 2: Обновить импорты в RequestsPage**

Заменить `RequestsListPage` на `RequestsPage` в начале файла:

```javascript
// Было:
export default function RequestsListPage() {

// Стало:
export default function RequestsPage() {
```

- [ ] **Step 3: Добавить логику вкладок для contractor**

После строки 161 добавить определение `isContractorTabs`:

```javascript
// После строки 161:
const isContractorTabs = user?.role === 'contractor';
```

- [ ] **Step 4: Добавить фильтрацию "В работе" для contractor**

Заменить логику загрузки в `loadRequests` (строки 201-223):

```javascript
const loadRequests = useCallback(async () => {
  setLoading(true);
  setError('');
  try {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.building_id) params.building_id = filters.building_id;
    const res = await requestsAPI.list(params);
    let items = res.data.items || [];

    // Для подрядчика: фильтруем "В работе" и "Завершённые" только по своим заявкам
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
}, [filters.status, filters.building_id, isContractor, user?.id]);
```

- [ ] **Step 5: Убрать ActionsMenu для contractor в рендере**

В мобильных карточках (строки 476-488) добавить условие `!isContractor`:

```javascript
// Было:
{!isContractor && (
  <ActionsMenu
    req={req}
    ...
  />
)}

// Остаётся без изменений, просто проверяем что логика правильная
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RequestsPage.jsx
git commit -m "refactor: rename RequestsListPage to RequestsPage, add contractor tabs logic"
```

---

### Task 3: Убрать ActionsMenu, перенести кнопки в RequestDetailPage

**Files:**
- Modify: `frontend/src/pages/RequestDetailPage.jsx:373-447`

**Interfaces:**
- Consumes: requestsAPI методы (take, complete, extend)
- Produces: Рефакторенный блок действий без меню

- [ ] **Step 1: Удалить импорт ActionsMenu если есть**

Проверить импорты в начале файла, убедиться что нет `ActionsMenu`

- [ ] **Step 2: Рефакторить блок действий**

Заменить блок `actionsCard` (строки 373-447) на упрощённый вариант:

```javascript
{(canTake || canCreateWork || canComplete || canExtend) && (
  <div style={styles.actionsCard}>
    <h2 style={styles.actionsTitle}>Действия</h2>
    <div style={styles.actionsColumn}>
      {canTake && (
        <button
          onClick={() => handleAction(requestsAPI.take, id)}
          disabled={actionLoading}
          style={styles.primaryBtn}
        >
          {actionLoading ? '…' : 'Взять в работу'}
        </button>
      )}
      {canCreateWork && (
        <button
          onClick={() => navigate(`/works/new?request_id=${id}`)}
          disabled={actionLoading}
          style={styles.primaryBtn}
        >
          {actionLoading ? '…' : 'Оформить отчет'}
        </button>
      )}
      {canComplete && (
        <button
          onClick={() => handleAction(requestsAPI.complete, id)}
          disabled={actionLoading}
          style={styles.successBtn}
        >
          {actionLoading ? '…' : 'Завершить'}
        </button>
      )}
      {canExtend && (
        <button
          onClick={() => handleAction(requestsAPI.extend, id)}
          disabled={actionLoading}
          style={styles.secondaryBtn}
        >
          {actionLoading ? '…' : 'Продлить срок'}
        </button>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 3: Добавить стиль actionsColumn**

В объект `styles` добавить:

```javascript
actionsColumn: { display: 'flex', flexDirection: 'column', gap: '10px' },
```

- [ ] **Step 4: Удалить компонент ActionsMenu если он есть в файле**

Найти и удалить определение `ActionsMenu` если оно есть в этом файле

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/RequestDetailPage.jsx
git commit -m "refactor: remove ActionsMenu, move all buttons to card"
```

---

### Task 4: Добавить защиту от двойного нажатия в RequestDetailPage

**Files:**
- Modify: `frontend/src/pages/RequestDetailPage.jsx:140-153`

**Interfaces:**
- Consumes: actionLoading state
- Produces: Защищённый handleAction

- [ ] **Step 1: Добавить раннюю проверку в handleAction**

```javascript
const handleAction = async (action, ...args) => {
  if (actionLoading) return;  // <-- Добавить эту строку
  setActionLoading(true);
  setError('');
  try {
    await action(...args);
    showMessage('Действие выполнено успешно');
    await loadRequest();
  } catch (e) {
    const detail = e.response?.data?.detail || 'Ошибка выполнения действия';
    showMessage(detail, true);
  } finally {
    setActionLoading(false);
  }
};
```

- [ ] **Step 2: Добавить переход после "Взять в работу"**

Изменить обработчик для `take` действия:

```javascript
// В handleAction или отдельно для take:
if (action === requestsAPI.take) {
  await action(...args);
  navigate(`/requests/${id}`);  // Остаться в карточке
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/RequestDetailPage.jsx
git commit -m "fix: prevent double action clicks, stay on card after take"
```

---

### Task 5: Обновить App.jsx для нового компонента RequestsPage

**Files:**
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Produces: Обновлённые роуты

- [ ] **Step 1: Найти и заменить импорт RequestsListPage**

В App.jsx заменить:

```javascript
// Было:
import RequestsListPage from './pages/RequestsListPage';

// Стало:
import RequestsPage from './pages/RequestsPage';
```

- [ ] **Step 2: Заменить использование компонента в роутах**

Найти `<Route path="/requests" element={<RequestsListPage />} />` и заменить на:

```javascript
<Route path="/requests" element={<RequestsPage />} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "refactor: update App.jsx to use RequestsPage"
```

---

### Task 6: Настроить роутинг для contractor — главная страница заявки

**Files:**
- Modify: `frontend/src/components/Layout.jsx` или `frontend/src/App.jsx`

**Interfaces:**
- Consumes: user.role
- Produces: Перенаправление contractor на /requests

- [ ] **Step 1: Проверить текущий роут для contractor**

Посмотреть в App.jsx или Layout.jsx как настроен главный роут для contractor

- [ ] **Step 2: Добавить перенаправление для contractor**

В App.jsx добавить:

```javascript
{user?.role === 'contractor' && (
  <Route path="/" element={<Navigate to="/requests" replace />} />
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: redirect contractor root to requests page"
```

---

### Task 7: Убрать кнопку "Новая работа" для contractor

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx` или `frontend/src/components/Layout.jsx`

**Interfaces:**
- Consumes: user.role
- Produces: Скрытая кнопка для contractor

- [ ] **Step 1: Найти где рендерится кнопка "Новая работа"**

Найти в DashboardPage.jsx или Layout.jsx

- [ ] **Step 2: Добавить условие скрытия для contractor**

```javascript
{user.role !== 'contractor' && (
  // Кнопка "Новая работа" или ссылка на /works/new
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx # или Layout.jsx
git commit -m "feat: hide 'New work' button for contractors"
```

---

## Task Dependencies

```
Task 1 (независимая)
Task 2 → Task 5
Task 3 → Task 4
Task 6 (независимая)
Task 7 (независимая)
```

## Testing Checklist

После завершения всех задач:

- [ ] Создать заявку — проверить отсутствие дублей при быстром двойном клике
- [ ] Contractor: открыть "/" — должен перейти на "/requests"
- [ ] Contractor: "/requests" — видит вкладки (Новые/В работе/Завершённые)
- [ ] Contractor: вкладка "В работе" — только свои заявки
- [ ] Flow завершения: Взять в работу → остаться в карточке → Создать отчет → Завершить
- [ ] Director/Admin: интерфейс не изменился
- [ ] Comendant: "Мои заявки" работает как раньше
