# Инструкция по развёртыванию

## Инфраструктура

- **Сервер:** Текущий VPS (уже работает `bot.fanat-mv.ru`)
- **Домен:** `report.fanat-mv.ru`
- **ОС:** Linux (предположительно Ubuntu/Debian)
- **Nginx:** Уже установлен и настроен

## Занятые порты

```
22    — SSH
53    — DNS
80    — HTTP (Nginx)
443   — HTTPS (Nginx)
2096  — Другой сервис
4173  — Другой сервис
8081  — bot.fanat-mv.ru (другой сервис)
8088  — Другой сервис
8443  — Другой сервис
8444  — Другой сервис
50177 — Другой сервис
```

## Выделенные порты для CRM

| Сервис | Порт | Доступ |
|--------|------|--------|
| PostgreSQL | 5432 | localhost only |
| FastAPI Backend | 8090 | localhost only |
| Frontend (статика) | — | через Nginx |

## Структура директорий на сервере

```
/var/www/crm/
├── frontend/
│   └── dist/              # Сборка React-приложения
├── backend/
│   ├── app/               # Исходный код FastAPI
│   ├── venv/              # Виртуальное окружение Python
│   └── requirements.txt
├── uploads/
│   ├── photos/
│   │   └── building_{N}/  # Фото по корпусам
│   ├── files/             # Документы
│   └── temp/              # Временные файлы
└── .env                   # Переменные окружения
```

## Переменные окружения (.env)

```bash
# Database
DATABASE_URL=postgresql://crm_user:secure_password@localhost:5432/crm_db

# JWT
SECRET_KEY=your-super-secret-random-key-min-32-chars
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# App
APP_NAME=CRM АХЧ
DEBUG=False
UPLOAD_DIR=/var/www/crm/uploads
MAX_FILE_SIZE=10485760

# CORS
ALLOWED_ORIGINS=https://report.fanat-mv.ru
```

## Установка и настройка

### 1. PostgreSQL

```bash
# Установка (если не установлен)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Запуск
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Создание БД и пользователя
sudo -u postgres psql

CREATE DATABASE crm_db;
CREATE USER crm_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE crm_db TO crm_user;
\q
```

### 2. Python + FastAPI

```bash
# Установка Python (если нет)
sudo apt install python3 python3-pip python3-venv

# Создание окружения
cd /var/www/crm/backend
python3 -m venv venv
source venv/bin/activate

# Установка зависимостей
pip install -r requirements.txt

# Применение миграций
alembic upgrade head

# Создание первого администратора
python -c "from app.core.security import get_password_hash; print(get_password_hash('admin_password'))"
# Вставить хеш в БД
```

### 3. Nginx конфигурация

Создать файл `/etc/nginx/sites-available/report.fanat-mv.ru`:

```nginx
server {
    listen 80;
    server_name report.fanat-mv.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name report.fanat-mv.ru;

    # SSL
    ssl_certificate /etc/letsencrypt/live/report.fanat-mv.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/report.fanat-mv.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Logs
    access_log /var/log/nginx/crm_access.log;
    error_log /var/log/nginx/crm_error.log;

    # Frontend (React статика)
    location / {
        root /var/www/crm/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # Кэширование статики
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8090/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты для загрузки файлов
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 50M;
    }

    # Загруженные файлы
    location /uploads/ {
        alias /var/www/crm/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

Активация:

```bash
sudo ln -s /etc/nginx/sites-available/report.fanat-mv.ru /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. SSL сертификат (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d report.fanat-mv.ru
```

### 5. Systemd сервис для backend

Создать файл `/etc/systemd/system/crm-backend.service`:

```ini
[Unit]
Description=CRM AHC Backend (FastAPI)
After=network.target postgresql.service

[Service]
Type=exec
User=www-data
Group=www-data
WorkingDirectory=/var/www/crm/backend
Environment="PATH=/var/www/crm/backend/venv/bin"
EnvironmentFile=/var/www/crm/.env
ExecStart=/var/www/crm/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8090
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Активация:

```bash
sudo systemctl daemon-reload
sudo systemctl enable crm-backend
sudo systemctl start crm-backend
sudo systemctl status crm-backend
```

### 6. Frontend (сборка)

```bash
cd /var/www/crm/frontend

# Установка зависимостей
npm install

# Сборка для продакшена
npm run build

# Результат попадёт в /var/www/crm/frontend/dist
```

### 7. Права доступа

```bash
sudo chown -R www-data:www-data /var/www/crm
sudo chmod -R 755 /var/www/crm
sudo chmod -R 775 /var/www/crm/uploads
```

---

## Проверка развёртывания

```bash
# Backend API
curl https://report.fanat-mv.ru/api/health

# Ожидаемый ответ:
# {"status":"ok","version":"1.0.0"}

# Frontend
curl -I https://report.fanat-mv.ru/
# HTTP/2 200
```

---

## Обновление системы

### Обновление backend

```bash
cd /var/www/crm/backend
git pull
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
sudo systemctl restart crm-backend
```

### Обновление frontend

```bash
cd /var/www/crm/frontend
git pull
npm install
npm run build
# Nginx автоматически подхватит новые файлы
```

---

## Резервное копирование

### База данных

```bash
# Ежедневный бэкап через cron
0 3 * * * pg_dump crm_db | gzip > /var/backups/crm/db_$(date +\%Y\%m\%d).sql.gz
```

### Файлы

```bash
# Ежедневный бэкап загруженных файлов
0 4 * * * tar -czf /var/backups/crm/uploads_$(date +\%Y\%m\%d).tar.gz /var/www/crm/uploads
```

---

## Мониторинг

### Логи

```bash
# Backend
sudo journalctl -u crm-backend -f

# Nginx
sudo tail -f /var/log/nginx/crm_error.log

# PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Проверка состояния

```bash
# Backend работает?
sudo systemctl is-active crm-backend

# PostgreSQL работает?
sudo systemctl is-active postgresql

# Nginx работает?
sudo systemctl is-active nginx

# Свободное место
df -h /var/www/crm
```
