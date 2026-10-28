# Инструкция по развёртыванию

> Этот документ описывает **фактическую** схему развёртывания CRM на продакшен-сервере. Данные собраны с реальных конфигов сервера (systemd, nginx, cron) и должны считаться эталоном.

## Инфраструктура

- **Сервер:** VPS, хостинг нескольких сервисов (в т.ч. `bot.fanat-mv.ru`)
- **Домен:** `report.fanat-mv.ru`
- **ОС:** Ubuntu 24.04
- **Код:** репозиторий `/home/dimon64515/projects/crm`, владелец `dimon64515`
- **Nginx:** установлен и настроен, конфиг подключён через `sites-enabled`

> **Устаревший путь:** раньше код размещался в `/var/www/crm` (владелец `www-data`). Директория `/var/www/crm` — мёртвая копия от 3 августа, **не используется** и в будущем будет удалена. Все упоминания `/var/www/crm` и `User=www-data` в старых инструкциях игнорировать.

## Занятые порты (проверено на сервере)

```
22    — SSH
80    — HTTP (Nginx)
443   — HTTPS (Nginx)
4173  — Другой сервис (bot.fanat-mv.ru)
5432  — PostgreSQL (localhost only)
8090  — CRM Backend (127.0.0.1 only)
```

## Структура директорий на сервере

```
/home/dimon64515/projects/crm/     # Рабочая копия репозитория (git pull отсюда)
├── backend/
│   ├── app/               # Исходный код FastAPI
│   ├── venv/              # Виртуальное окружение Python
│   ├── .env               # Переменные окружения (права 600, владелец dimon64515)
│   ├── alembic.ini
│   └── requirements.txt
├── frontend/
│   └── dist/              # Продакшен-сборка React (отдаётся nginx'ом)
├── uploads/               # Файловое хранилище (фото, документы, бэкапы)
│   ├── photos/
│   ├── files/
│   ├── temp/
│   └── backups/           # Полные бэкапы, создаваемые через UI приложения
└── docker-compose.yml     # НЕ используется и НЕ поддерживается (см. ниже)
```

## Важно про Docker

`docker-compose.yml` в репозитории **не используется и не поддерживается**: в репозитории нет Dockerfile для backend/frontend, поэтому сборка контейнеров невозможна. Реальный продакшен работает по схеме «systemd + nginx + venv/npm» из этого документа. Не пытайтесь разворачивать систему через docker-compose.

## База данных

- PostgreSQL 16 (Ubuntu), слушает только localhost (`5432`).
- БД: `crm_db`, креды — в `backend/.env` (параметр `DATABASE_URL`, файл с правами 600).
- Миграции: Alembic, применяются из `backend/` командой `alembic upgrade head`.

## Backend (systemd)

Реальный юнит — `/etc/systemd/system/crm-backend.service` (текст приведён полностью, соответствует серверу):

```ini
[Unit]
Description=CRM AHC Backend (FastAPI)
After=network.target postgresql.service

[Service]
Type=simple
User=dimon64515
Group=dimon64515
WorkingDirectory=/home/dimon64515/projects/crm/backend
Environment=PATH=/home/dimon64515/projects/crm/backend/venv/bin
Environment=PYTHONPATH=/home/dimon64515/projects/crm/backend
ExecStart=/home/dimon64515/projects/crm/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8090
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Ключевые моменты:

- Сервис работает **от пользователя `dimon64515`** (не `www-data`).
- Переменные окружения подтягиваются из `backend/.env` приложением самостоятельно (pydantic-settings), `EnvironmentFile` в юните не используется.
- uvicorn слушает только `127.0.0.1:8090`, наружу смотрит nginx.

Управление:

```bash
sudo systemctl status crm-backend
sudo systemctl restart crm-backend
sudo journalctl -u crm-backend -f
```

Health-check: `GET /api/health` → `{"status":"ok","version":"..."}`.

```bash
curl http://127.0.0.1:8090/api/health
curl https://report.fanat-mv.ru/api/health
```

## Frontend (Nginx)

- Сборка: `npm ci && npm run build` в `frontend/`, результат — `frontend/dist`.
- nginx отдаёт статику из `/home/dimon64515/projects/crm/frontend/dist` и проксирует `/api/` на `127.0.0.1:8090`.
- Активный конфиг: `/etc/nginx/sites-enabled/report.fanat-mv.ru`. Эталонная копия в репозитории — `docs/nginx-report.fanat-mv.ru.conf` (должна совпадать с серверным файлом).
- `index.html` отдаётся с запретом кэширования, обновления фронтенда подхватываются без очистки кэша.

После сборки достаточно проверить `curl -I https://report.fanat-mv.ru/` — перезапуск nginx не нужен.

## SSL

- Сертификат Let's Encrypt (certbot).
- Автопродление настроено: systemd-таймер `certbot.timer` (проверяется через `systemctl list-timers | grep certbot`).

## Бэкапы

### База данных (автоматический ежедневный дамп)

Ежедневно в **03:47** cron запускает `/usr/local/sbin/crm-db-backup.sh` (задание в `/etc/cron.d/crm-db-backup`, stderr дублируется в syslog через `logger`).

Что делает скрипт:

1. Читает `DATABASE_URL` из `backend/.env` (права 600, поэтому задача выполняется от `root`).
2. Делает `pg_dump` в custom-формате (`-Fc`) в `/var/backups/crm/crm_db_YYYYMMDD_HHMMSS.dump`.
3. Проверяет целостность дампа через `pg_restore --list`; при ошибке дамп удаляется.
4. Ротация: хранятся последние **14** успешных дампов.
5. Лог: `/var/backups/crm/backup.log`.

Проверка:

```bash
sudo cat /var/backups/crm/backup.log
sudo ls -lh /var/backups/crm/
```

Восстановление из дампа (в БД crm_db):

```bash
sudo -u postgres pg_restore -d crm_db --clean --if-exists /var/backups/crm/crm_db_<дата>.dump
```

### Полные бэкапы приложения (через UI)

Полные бэкапы (БД + файлы) создаются через интерфейс администратора и сохраняются в `uploads/backups/`. Детали — в `docs/backup.md`.

### Загруженные файлы

Загруженные пользователями файлы (`uploads/photos`, `uploads/files` и т.д.) отдельного системного бэкапа не имеют — они входят в полные бэкапы через UI. При необходимости архивируйте `uploads/` вручную.

## Обновление системы

Деплой выполняется единым скриптом `scripts/deploy.sh` из корня репозитория (на сервере — от пользователя `dimon64515`):

```bash
cd /home/dimon64515/projects/crm
./scripts/deploy.sh                    # полный деплой (backend + frontend)
./scripts/deploy.sh --backend-only     # только backend
./scripts/deploy.sh --frontend-only    # только frontend
```

Что делает скрипт: `git pull --ff-only` → backend (`pip install` в venv, `alembic upgrade head`, `systemctl restart crm-backend` с health-check до 30 сек) → frontend (`npm ci`, `npm run build`). Если backend после перезапуска не отвечает на `GET /api/health`, скрипт печатает хвост журнала и команду ручного отката.

**Ручная последовательность** (fallback, если скрипт недоступен):

```bash
# Backend
cd /home/dimon64515/projects/crm/backend
git pull --ff-only
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
sudo systemctl restart crm-backend
curl http://127.0.0.1:8090/api/health   # проверка

# Frontend
cd /home/dimon64515/projects/crm/frontend
git pull --ff-only
npm ci
npm run build
# nginx подхватит новые файлы из dist автоматически
curl -I https://report.fanat-mv.ru/      # проверка
```

## Откат

При неудачном деплое скрипт печатает команду отката на коммит, с которого начинался деплой (`git checkout <хеш>` + повторный `./scripts/deploy.sh`). Откат вручную:

```bash
# Backend
cd /home/dimon64515/projects/crm/backend
git checkout <хеш-коммита>
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head   # или alembic downgrade <ревизия> при необходимости
sudo systemctl restart crm-backend

# Frontend
cd /home/dimon64515/projects/crm/frontend
git checkout <хеш-коммита>
npm ci && npm run build
```

Откат данных — из дампа `/var/backups/crm/` (`pg_restore --clean --if-exists`) или из полного бэкапа через UI.

## Мониторинг

### Логи

```bash
# Backend
sudo journalctl -u crm-backend -f

# Бэкапы БД
sudo tail -f /var/backups/crm/backup.log

# Nginx
sudo tail -f /var/log/nginx/error.log
```

### Проверка состояния

```bash
sudo systemctl is-active crm-backend postgresql nginx
curl https://report.fanat-mv.ru/api/health

# SSH-брутфорс: fail2ban (jail sshd)
sudo fail2ban-client status sshd

# Свободное место
df -h
```

## Безопасность сервера (кратко)

- SSH: парольный вход **выключен** (только ключи), установлен fail2ban с jail `sshd` (`sudo fail2ban-client status sshd`).
- `backend/.env` — права 600, владелец `dimon64515`; в git не коммитится.
- PostgreSQL доступен только с localhost.
- Backend слушает только `127.0.0.1:8090`, наружу смотрит nginx.
