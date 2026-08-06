# AGENTS.md Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разбить разросшийся `AGENTS.md` на тематические инструкции (`AGENTS_BACKEND.md`, `AGENTS_FRONTEND.md`, `AGENTS_DEPLOY.md`) и превратить `AGENTS.md` в лёгкий роутер, устранив warning о превышении 32 KB.

**Architecture:** Создаём три новых тематических AGENTS-файла в корне проекта. `AGENTS.md` сокращается до обзора проекта, ролевой модели, минимальной структуры и ссылок на детальные гиды. Дублирование soft delete устраняется.

**Tech Stack:** Markdown, shell (`wc`, `grep`).

## Global Constraints
- Все пользовательские строки и комментарии — на русском языке.
- Все новые AGENTS-файлы размещаются в корне проекта (`/home/dimon64515/projects/crm/`).
- `AGENTS.md` должен быть меньше 32 768 байт после рефакторинга.
- Вся информация из старого `AGENTS.md` должна быть сохранена в одном из новых файлов.

---

### Task 1: Create `AGENTS_BACKEND.md`

**Files:**
- Create: `/home/dimon64515/projects/crm/AGENTS_BACKEND.md`
- Source: `/home/dimon64515/projects/crm/AGENTS.md` (lines 23-42, 162-211 backend parts, 215-233, 268-307 business rules, 311-320 Python style, 352-359 security)

**Interfaces:**
- Consumes: Existing `AGENTS.md` content.
- Produces: `AGENTS_BACKEND.md` with backend-focused guidance.

- [ ] **Step 1: Create file header**

```markdown
# AGENTS_BACKEND.md — Справка для работы с backend

> Правила и контекст для AI-агентов, изменяющих backend CRM АХЧ.
```

- [ ] **Step 2: Copy and adapt backend technology stack**

Include the technology stack table focused on backend and the list of additional backend dependencies from `AGENTS.md` lines 23-42.

- [ ] **Step 3: Copy backend architecture section**

Include the backend architecture bullet points from `AGENTS.md` lines 215-233.

- [ ] **Step 4: Copy backend business rules**

Include business rules from `AGENTS.md` lines 268-307, removing the duplicate soft-delete point (keep only one).

- [ ] **Step 5: Copy backend style and security notes**

Include Python style rules (lines 311-320) and security bullets (lines 352-359).

- [ ] **Step 6: Verify file created and size reasonable**

Run:
```bash
wc -c /home/dimon64515/projects/crm/AGENTS_BACKEND.md
```
Expected: file exists, size roughly 8-12 KB.

---

### Task 2: Create `AGENTS_FRONTEND.md`

**Files:**
- Create: `/home/dimon64515/projects/crm/AGENTS_FRONTEND.md`
- Source: `/home/dimon64515/projects/crm/AGENTS.md` (lines 78-102 structure notes, 234-244 frontend architecture, 248-264 routes, 321-330 React style, optional note about date-fns)

**Interfaces:**
- Consumes: Existing `AGENTS.md` content.
- Produces: `AGENTS_FRONTEND.md` with frontend-focused guidance.

- [ ] **Step 1: Create file header**

```markdown
# AGENTS_FRONTEND.md — Справка для работы с frontend

> Правила и контекст для AI-агентов, изменяющих frontend CRM АХЧ.
```

- [ ] **Step 2: Copy frontend structure notes**

Include relevant frontend structure bullets from `AGENTS.md` lines 78-102 and structure notes lines 134-137 as applicable.

- [ ] **Step 3: Copy frontend architecture section**

Include frontend architecture bullets from `AGENTS.md` lines 234-244.

- [ ] **Step 4: Copy frontend routes table**

Include the routes table from `AGENTS.md` lines 248-264.

- [ ] **Step 5: Copy React style conventions**

Include the JavaScript/React style rules from `AGENTS.md` lines 321-330.

- [ ] **Step 6: Verify file created and size reasonable**

Run:
```bash
wc -c /home/dimon64515/projects/crm/AGENTS_FRONTEND.md
```
Expected: file exists, size roughly 4-6 KB.

---

### Task 3: Create `AGENTS_DEPLOY.md`

**Files:**
- Create: `/home/dimon64515/projects/crm/AGENTS_DEPLOY.md`
- Source: `/home/dimon64515/projects/crm/AGENTS.md` (lines 162-211 commands, 334-348 testing, 363-373 deployment)

**Interfaces:**
- Consumes: Existing `AGENTS.md` content.
- Produces: `AGENTS_DEPLOY.md` with deployment, testing, and run commands.

- [ ] **Step 1: Create file header**

```markdown
# AGENTS_DEPLOY.md — Справка по запуску, тестированию и деплою

> Инструкции для AI-агентов по локальному запуску, тестированию и развёртыванию CRM АХЧ.
```

- [ ] **Step 2: Copy build/run commands**

Include backend local setup, frontend local setup, and Docker Compose sections from `AGENTS.md` lines 162-211.

- [ ] **Step 3: Copy testing section**

Include testing instructions from `AGENTS.md` lines 334-348.

- [ ] **Step 4: Copy deployment section**

Include deployment bullets from `AGENTS.md` lines 363-373.

- [ ] **Step 5: Verify file created and size reasonable**

Run:
```bash
wc -c /home/dimon64515/projects/crm/AGENTS_DEPLOY.md
```
Expected: file exists, size roughly 4-6 KB.

---

### Task 4: Rewrite `AGENTS.md` as a router

**Files:**
- Modify: `/home/dimon64515/projects/crm/AGENTS.md`

**Interfaces:**
- Consumes: Content moved to `AGENTS_BACKEND.md`, `AGENTS_FRONTEND.md`, `AGENTS_DEPLOY.md`.
- Produces: Lightweight `AGENTS.md` under 32 KB.

- [ ] **Step 1: Preserve project overview**

Keep the project overview from `AGENTS.md` lines 9-20.

- [ ] **Step 2: Keep minimal role table**

Keep the role table from `AGENTS.md` lines 143-150 (simplify descriptions if needed).

- [ ] **Step 3: Add router section**

Replace detailed sections with a router block:

```markdown
## Роутер для AI-агентов

- Работаешь с backend (API, модели, бизнес-логика) — читай `AGENTS_BACKEND.md`.
- Работаешь с frontend (компоненты, маршруты, стили) — читай `AGENTS_FRONTEND.md`.
- Настраиваешь запуск, тесты или деплой — читай `AGENTS_DEPLOY.md`.
```

- [ ] **Step 4: Keep useful links**

Keep the useful links section from `AGENTS.md` lines 377-386.

- [ ] **Step 5: Verify size is under limit**

Run:
```bash
wc -c /home/dimon64515/projects/crm/AGENTS.md
```
Expected: size < 32768 bytes (target < 10000 bytes).

---

### Task 5: Verify cross-references and content completeness

**Files:**
- Read: `/home/dimon64515/projects/crm/AGENTS.md`
- Read: `/home/dimon64515/projects/crm/AGENTS_BACKEND.md`
- Read: `/home/dimon64515/projects/crm/AGENTS_FRONTEND.md`
- Read: `/home/dimon64515/projects/crm/AGENTS_DEPLOY.md`

**Interfaces:**
- Consumes: All four AGENTS files.
- Produces: Confirmation that no information was lost.

- [ ] **Step 1: Check that AGENTS.md links to all three detail files**

Run:
```bash
grep -E "AGENTS_BACKEND|AGENTS_FRONTEND|AGENTS_DEPLOY" /home/dimon64515/projects/crm/AGENTS.md
```
Expected: all three filenames appear.

- [ ] **Step 2: Check that no duplicate soft-delete point remains**

Run:
```bash
grep -n "soft delete\|Soft delete\|is_active = False" /home/dimon64515/projects/crm/AGENTS_BACKEND.md
```
Expected: one clear mention, not duplicated.

- [ ] **Step 3: Confirm total size reduction**

Run:
```bash
wc -c /home/dimon64515/projects/crm/AGENTS.md /home/dimon64515/projects/crm/AGENTS_BACKEND.md /home/dimon64515/projects/crm/AGENTS_FRONTEND.md /home/dimon64515/projects/crm/AGENTS_DEPLOY.md
```
Expected: `AGENTS.md` < 32768 bytes; combined size roughly matches old size (information preserved).

---

## Self-Review

**Spec coverage:**
- Create `AGENTS_BACKEND.md` → Task 1
- Create `AGENTS_FRONTEND.md` → Task 2
- Create `AGENTS_DEPLOY.md` → Task 3
- Rewrite `AGENTS.md` as router → Task 4
- Remove soft delete duplication → Tasks 1 and 4
- Verify sizes and cross-references → Task 5

**Placeholder scan:** No TBD/TODO placeholders. Each step includes exact paths and expected outcomes.

**Type consistency:** N/A — plan manipulates Markdown files only.
