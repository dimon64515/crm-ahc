#!/usr/bin/env bash
# Единый скрипт деплоя CRM АХЧ (backend + frontend).
# Запуск: ./scripts/deploy.sh [--backend-only | --frontend-only]
# Выполняется на сервере от пользователя dimon64515 из корня репозитория.

set -euo pipefail

DEPLOY_USER="dimon64515"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
HEALTH_URL="http://127.0.0.1:8090/api/health"
START_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"

DEPLOY_BACKEND=1
DEPLOY_FRONTEND=1

log()  { echo "==> $*"; }
fail() { echo "ОШИБКА: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --backend-only)
            DEPLOY_BACKEND=1
            DEPLOY_FRONTEND=0
            ;;
        --frontend-only)
            DEPLOY_BACKEND=0
            DEPLOY_FRONTEND=1
            ;;
        -h|--help)
            echo "Использование: $0 [--backend-only | --frontend-only]"
            echo "  без опций       — деплой backend и frontend"
            echo "  --backend-only  — только backend (git pull, pip, миграции, перезапуск)"
            echo "  --frontend-only — только frontend (git pull, npm ci, сборка)"
            exit 0
            ;;
        *)
            fail "Неизвестная опция: $1. Используйте --help."
            ;;
    esac
    shift
done

if [[ "$(whoami)" == "root" ]]; then
    echo "ВНИМАНИЕ: скрипт запущен от root. Деплой должен выполняться от пользователя $DEPLOY_USER." >&2
fi

log "[1/6] Обновление кода (git pull --ff-only)"
if ! git -C "$REPO_ROOT" pull --ff-only; then
    fail "git pull --ff-only не удался. Исправьте локальные изменения или отключённость от origin (git status, git fetch), затем повторите."
fi

if [[ "$DEPLOY_BACKEND" -eq 1 ]]; then
    log "[2/6] Backend: установка зависимостей"
    source "$BACKEND_DIR/venv/bin/activate"
    pip install -r "$BACKEND_DIR/requirements.txt"

    log "[3/6] Backend: применение миграций (alembic upgrade head)"
    (cd "$BACKEND_DIR" && alembic upgrade head)

    log "[4/6] Backend: перезапуск сервиса crm-backend"
    sudo systemctl restart crm-backend

    log "Ожидание health-check ($HEALTH_URL), до 30 сек..."
    started=0
    for _ in $(seq 1 30); do
        if curl -sf "$HEALTH_URL" >/dev/null; then
            started=1
            break
        fi
        sleep 1
    done

    if [[ "$started" -ne 1 ]]; then
        echo "ОШИБКА: backend не поднялся после перезапуска. Последние записи журнала:" >&2
        sudo journalctl -u crm-backend -n 30 --no-pager >&2 || true
        echo "" >&2
        echo "Откат вручную:" >&2
        echo "  git checkout $START_COMMIT" >&2
        echo "  повторите: ./scripts/deploy.sh --backend-only" >&2
        exit 1
    fi
    log "Backend работает: $(curl -sf "$HEALTH_URL")"
fi

if [[ "$DEPLOY_FRONTEND" -eq 1 ]]; then
    if [[ "$DEPLOY_BACKEND" -eq 1 ]]; then step=5; else step=2; fi
    log "[$step/6] Frontend: установка зависимостей и сборка (npm ci && npm run build)"
    (cd "$FRONTEND_DIR" && npm ci && npm run build)
fi

if [[ "$DEPLOY_BACKEND" -eq 1 && "$DEPLOY_FRONTEND" -eq 1 ]]; then last_step=6
elif [[ "$DEPLOY_BACKEND" -eq 1 ]]; then last_step=5
else last_step=3; fi
log "[$last_step/6] Деплой завершён успешно."
