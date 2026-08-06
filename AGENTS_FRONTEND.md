# AGENTS_FRONTEND.md — Справка для работы с frontend

> Правила и контекст для AI-агентов, изменяющих frontend CRM АХЧ.

---

## Технологический стек (frontend)

| Компонент | Технологии |
|-----------|------------|
| Фреймворк | React 19.2.6 |
| Сборка | Vite 8.0.12 |
| Маршрутизация | React Router 7.15.1 |
| HTTP-клиент | Axios 1.16.1 |
| Выпадающие списки | react-select 5.10.2 |

> **Примечание:** в `frontend/package.json` присутствует `date-fns` ^4.3.0, однако в исходном коде приложения импортов `date-fns` не обнаружено — зависимость может быть неиспользуемой.

---

## Структура frontend

- `frontend/src/main.jsx` — точка входа.
- `frontend/src/App.jsx` — маршрутизация и защищённые маршруты.
- `frontend/src/api.js` — централизованный Axios с токеном и обработкой 401.
- `frontend/src/index.css` — глобальные стили.
- `frontend/src/contexts/AuthContext.jsx` — глобальный контекст авторизации (localStorage).
- `frontend/src/components/Layout.jsx` — навигация и обёртка страниц.
- `frontend/src/pages/` — страницы приложения.

---

## Архитектура frontend

- **Стили:** смешанный подход. Глобальные стили в `index.css`, inline-стили в объектах `const styles = { ... }` внутри компонентов.
- **Состояние:** авторизация через React Context; локальное состояние страниц — `useState`/`useEffect`.
- **HTTP:** централизованный Axios в `api.js` добавляет токен и при 401 удаляет его с редиректом на `/login`.
- **Маршрутизация:** `BrowserRouter`, защита через `ProtectedRoute` в `App.jsx`.
- **Формы:** используются `react-select` и `AsyncSelect` для выпадающих списков с поиском.

---

## Маршруты frontend

| Путь | Доступ | Описание |
|------|--------|----------|
| `/login` | Все | Страница входа |
| `/requests` | contractor, director, admin | Список заявок |
| `/requests/new` | comendant | Создание заявки |
| `/requests/:id` | comendant, contractor, director, admin | Просмотр заявки |
| `/my-requests` | comendant | Заявки текущего коменданта |
| `/works/new` | contractor, director, admin | Создание отчёта |
| `/works/:id` | contractor, director, admin | Детали работы |
| `/my-works` | contractor, director, admin | Записи текущего пользователя |
| `/dashboard` | director, admin | Дашборд и отчёты |
| `/photo-backup` | director, admin | Архив фото |
| `/settings` | admin | Настройки |
| `/admin/logs` | admin | Журнал аудита |
| `/` | — | Редирект на `/login` |

---

## Стиль кода (JavaScript / React)

- ES-модули (`type: "module"` в `package.json`).
- JSX-расширение у компонентов (`.jsx`).
- Inline-стили в объектах `const styles = { ... }` в том же файле.
- Глобальные CSS-классы допустимы для повторяющихся элементов.
- Имена компонентов — `PascalCase`, файлы — `PascalCase.jsx`.
- API-вызовы централизованы в `api.js`.
- Все пользовательские строки и комментарии — на русском языке.
