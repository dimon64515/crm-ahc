# Бэклог аудита CRM АХЧ

> Составлено по результатам аудита backend, frontend и инфраструктуры (дата: 2026-10-28).
> Порядок работ — сверху вниз. Пункт «Очистка диска» по решению владельца исключён из плана.

---

## Инфраструктура

### INF-01. Диск заполнен на 100% — исключено из плана работ
- **Место:** `df -h` → `/dev/vda2 30G, использовано 28G, доступно 175M`.
- **Суть:** PostgreSQL, загрузка фото, создание бэкапов могут упасть в любой момент.
- **Источники очистки (подтверждены):** `/var/log/journal` — 1.6 ГБ (journald без `SystemMaxUse`), `/var/cache/apt` — 198 МБ, syslog-ротации ~120 МБ, `uploads/backups/` — 941 МБ на том же диске.
- **Рекомендация (на будущее):** `journalctl --vacuum-size=200M`, `apt clean`, ограничить journald (`SystemMaxUse=200M`), алерт на свободное место.

### INF-02. Бэкапы не автоматизированы, только локальные, последний — 16 дней назад
- **Место:** `crontab -l` (только acme.sh), `/etc/cron.d/` — задач бэкапа нет; `uploads/backups/`.
- **Суть:** `docs/deployment.md` обещает ежедневные `pg_dump` в `/var/backups/crm` — директории нет. Бэкапы создаются только вручную через UI: последний полный `full_20261012`, до него — 4 августа. Все копии (941 МБ) на том же диске и сервере.
- **Рекомендация:** cron/systemd-timer на полный бэкап минимум раз в сутки + выгрузка вне сервера (S3/rsync). Периодически тестировать восстановление.
- **Применено (2026-10-28):** ежедневный `pg_dump -Fc` БД в `/var/backups/crm` в 03:47 (скрипт `/usr/local/sbin/crm-db-backup.sh`, cron.d `crm-db-backup`). Проверка целостности через `pg_restore --list`, ротация 14 копий, лог `backup.log` + дублирование в syslog. Тестовый дамп создан и проверен (162 объекта TOC). Под дампы освобождено место: journald ограничен 200M (`/etc/systemd/journald.conf.d/99-size-limit.conf`), apt-кэш очищен.
- **Внешняя копия — готово (2026-10-28):** установлен rclone v1.75.2, remote `gdrive` с зашифрованным конфигом (пароль в `/root/.config/rclone/pass`), скрипт `/usr/local/sbin/crm-backup-sync.sh` (sync дампов <48ч в `gdrive:crm-backups/`, ротация на удалёнке 30 дней), cron в 04:17. OAuth пройден владельцем, тестовый дамп на Диске подтверждён, токен сохранён в конфиге. **Открыто:** shared client_id rclone объявлен устаревшим и перестанет работать в течение 2026 — нужен собственный client_id (Google Cloud Console, ~15 мин).

### INF-03. Backend работает от root
- **Место:** `/etc/systemd/system/crm-backend.service` → `User=root`, процесс uvicorn (PID 714303) — root.
- **Суть:** сервис с доступом к БД и файлам работает с максимальными привилегиями; из-за этого в репозитории смешанное владение (root/user): `AGENTS_*.md`, `test_requests.db`, `.pytest_cache/`, `backend/backend.log` — root. Ломает git-операции от пользователя.
- **Применено (2026-10-28):** юнит `crm-backend.service` переведён на `User=dimon64515`/`Group=dimon64515`, владение всего репозитория приведено к dimon64515 (1250 файлов, 0 чужих осталось), `backend/.env` — права 600. Проверено: health 200, процесс от dimon64515, запись в uploads работает, ошибок в журнале нет. **Замечание:** всё, что пишет в репозиторий от root (cron и т.п.), снова будет портить владение — новые задачи запускать от dimon64515.

### INF-04. `docs/deployment.md` описывает несуществующую инфраструктуру
- **Место:** `docs/deployment.md:34-50, 200-220` vs реальность (`/home/dimon64515/projects/crm`, `User=root`, nginx без трейлинг-слэша).
- **Суть:** документ инструктирует `/var/www/crm` (там мёртвая копия 1.5 МБ от 3 августа), `www-data`, `EnvironmentFile=/var/www/crm/.env`. Деплой «по документации» сломает прод.
- **Применено (2026-10-28):** `docs/deployment.md` переписан под фактическую схему (пути, юнит, dimon64515, cron-бэкапы, секции «Откат»/«Безопасность»); `AGENTS_DEPLOY.md` синхронизирован (токен: дефолт в коде 30 дней, факт — в .env; docker-compose не используется); `README.md` поправлен (PostgreSQL 16, структура); nginx-конфиг документа сверен с серверным — идентичен. Git-коммиты не делались.

### INF-05. Нет единого способа деплоя
- **Место:** `docs/deployment.md:271-292`, `AGENTS_DEPLOY.md:86-97`.
- **Суть:** обновление = 6-7 ручных команд без скрипта и проверки успеха. Нет CI/CD, нет smoke-теста после деплоя. `docker-compose.yml` неработоспособен: ссылается на несуществующие Dockerfile (`build: ./backend`, `./frontend`), хардкод-пароль `crm_password`.
- **Применено (2026-10-28):** создан `scripts/deploy.sh` (git pull --ff-only → pip → alembic → restart с health-check до 30 сек и печатью команды отката → npm ci + build; опции `--backend-only`/`--frontend-only`). `docs/deployment.md` и `AGENTS_DEPLOY.md` обновлены на вызов скрипта. Прогон вживую: успешен, health 200, сервис от dimon64515. docker-compose помечен как неиспользуемый (файл оставлен).

### INF-06. Нет мониторинга и алертов
- **Место:** весь стек. Единственный след — `beszel-agent`.
- **Суть:** нет алертов на: свободное место (диск сел на 100% молча), состояние crm-backend/PostgreSQL, ошибки в логах, просрочку бэкапов.
- **Применено (2026-10-28):** `/usr/local/sbin/crm-healthcheck.sh` (диск <10%, сервисы crm-backend/postgresql, свежесть дампа <36ч) → `/var/log/crm-monitor.log` + syslog, cron 2 раза в час (:09/:39), logrotate 30 дней. Мгновенный сигнал: OnFailure-юниты для crm-backend и postgresql (`crm-service-alert.sh` → CRIT в лог). Смотреть: `tail -f /var/log/crm-monitor.log`. Первый прогон уже зафиксировал реальный CRIT: на диске свободно 5%.

### INF-07. Секреты читаемы всеми; устаревшая `.env.bak`
- **Место:** `backend/.env` и `backend/.env.bak` — права `-rw-rw-r--` (664). `.env.bak` — копия от 1 июля с секретами.
- **Суть:** в git секреты не попадали (проверено), `.gitignore` корректен. Проблема — локальные права и лишняя копия.
- **Применено (2026-10-28):** `backend/.env` — права 600 (сделано в рамках INF-03), устаревшая `backend/.env.bak` удалена.

### INF-08. SSH-брутфорс — ГОТОВО (2026-10-28)
- **Место:** `/var/log/btmp` + `btmp.1` ≈ 24 МБ неудачных входов.
- **Результаты расследования (2026-10-28):**
  - Масштаб: ~23 000 неудачных входов за 27 дней, ~850/день, 1180 уникальных IP (распределённый ботнет). Топ логинов: admin/ubuntu/user/debian — словарный список, реальный пользователь не перебирается.
  - **Признаков взлома нет:** `PasswordAuthentication no` действует, за 30 дней 0 `Accepted password`; все 50 входов за неделю — `Accepted publickey` для `dimon64515` с 5 мобильных IP владельца; пересечений брутфорс-IP → Accepted нет; чужих ключей/пользователей/cron нет.
  - **«Бомба замедленного действия»:** `/etc/ssh/sshd_config.d/50-cloud-init.conf` содержит `PasswordAuthentication yes`, сейчас побеждён сортировкой `00-customcompliance.conf`, но может вступить в силу после правок cloud-init.
  - **Периметр голый:** INPUT policy ACCEPT, fail2ban не установлен, whitelist нет. Наружу торчат: 22 (sshd), 80/443 (nginx), **2096/50177 (x-ui), 8443/53288 (xray)**, 45876 (неизвестный agent), 58627/58628 (kimi-code на 0.0.0.0!). PostgreSQL (5432) и uvicorn (8090) — только loopback, это корректно.
- **План мер (безопасность нарастает, риск блокировки растёт):**
  1. Удалить/отключить `50-cloud-init.conf`, `sshd -t` + reload.
  2. Установить fail2ban с jail `sshd` (findtime 1ч, bantime 1д, maxretry 5).
  3. Hardening sshd: `AllowUsers dimon64515`, `PermitRootLogin no`, `MaxAuthTries 3`, отключить X11Forwarding/AllowTcpForwarding, `LogLevel VERBOSE`.
  4. Фаервол: INPUT DROP по умолчанию, разрешить 22/80/443 (+VPN-порты, если осознанно нужны).
  5. (Опционально) нестандартный порт SSH — срежет ~90% шума.
- **Применено:** `50-cloud-init.conf` переименован в `.disabled` (бэкап в `/root/50-cloud-init.conf.bak-20261028`), drop-in `ssh_pwauth: false` против пересоздания cloud-init; fail2ban 1.0.2 установлен, jail sshd (maxretry 5, findtime 1ч, bantime 1д, бан через nftables-таблицу `f2b-table`, дефолтная политика INPUT не тронута). Проверено: `sshd -T` → `passwordauthentication no`, jail активен, первые баны пошли. Откат: см. команды в истории задачи (восстановить .conf, `systemctl disable --now fail2ban`).

### INF-09. Мусор в репозитории
- **Место:** корень: `test_requests.db` (root, 200 КБ), `zayavka_17.docx`, `Заявка принятая.docx`, `Перечень и стоимость работ...xlsx`, пустой `GEMINI.md`; `backend/`: 8+ файлов `test*.db`/`debug*.db`; `uploads/`: дубли шаблонов docx.
- **Рекомендация:** удалить тестовые БД и дубли, шаблоны перенести в `backend/templates/` и закоммитить.

### INF-10. Логи: ротация есть, но файлы-мусор
- **Место:** `backend/backend.log` (338 байт, от 4 августа, ошибка «port already in use»), `frontend/frontend.log` (183 байта). Основные логи uvicorn → journald без лимита.
- **Применено (2026-10-28):** мёртвые логи удалены; лимит journald 200M (см. INF-02); ротация `/var/log/crm-monitor.log` — `/etc/logrotate.d/crm-monitor`.

### INF-11. Корневой `package.json`/`node_modules`
- **Место:** корень содержит только `ctx7` (dev-инструмент), `node_modules` 25 МБ.
- **Рекомендация:** задокументировать в README или убрать в `tools/`.

### INF-12. Хвосты разработки
- **Место:** `.worktrees/refactor-requests-actions` (ветка есть и на remote), untracked `docs/superpowers/plans/2026-08-20-emergency-request-implementation-plan.md`, `.aider.chat.history.md` 615 КБ в корне.
- **Рекомендация:** довести/закрыть ветку, закоммитить или удалить план, историю aider — в `.gitignore` или удалить.

---

## Backend

### BE-01. Комендант может редактировать и удалять любые отчёты — эскалация привилегий
- **Место:** `backend/app/routers/works.py:318` (update_work — блокировка только на `director`/`contractor`), `works.py:426-429` (delete_work — коменданта не блокирует вовсе).
- **Суть:** комендант доходит до `db.commit()` и удаляет любую работу вместе с фото и файлами на диске.
- **Рекомендация:** заменить «чёрные списки» ролей на `require_admin`/явные проверки.
- **Исправлено (2026-10-28):** обе проверки переведены на «белый список»: update — только admin (директор read-only, подрядчик не редактирует — намеренная семантика); delete — admin или подрядчик-владелец. Регрессионные тесты в `backend/tests/test_security_regressions.py`. Задеплоено, health 200.

### BE-02. Все загруженные файлы публично доступны без авторизации
- **Место:** `backend/app/main.py:36` (StaticFiles без middleware), `docs/nginx-report.fanat-mv.ru.conf` (`location /uploads/` без auth).
- **Суть:** фото работ, заявок, документы доступны любому по прямой ссылке. Случайный суффикс в URL — не контроль доступа.
- **Рекомендация:** отдавать файлы через endpoint с проверкой JWT либо подписанные URL.

### BE-03. JWT-подпись fallback на публичный дефолтный ключ
- **Место:** `backend/app/core/config.py:11` — `SECRET_KEY` со значением-заглушкой; `docker-compose.yml` (`dev-secret-key-change-in-production`), `docs/deployment.md:59`.
- **Суть:** если `.env` не подхвачен, приложение стартует с известным ключом → подделка токенов любой роли. Нет assert'а.
- **Рекомендация:** падать при старте, если ключ равен дефолту.
- **Исправлено (2026-10-28):** `config.py` — `validate_secret_key()`, вызывается при старте приложения (main.py); дефолт/пустой ключ → RuntimeError с русским сообщением. Alembic из shell не сломан (env.py не трогали, проверено `alembic current`). Тесты в test_security_regressions.py.

### BE-04. Гонки: дубли отчётов на заявку и двойное «взятие» заявки
- **Место:** `works.py:172-175`, `requests.py:499-527` — проверка существующего Work до вставки; `models.py:73` — нет `UniqueConstraint('request_id')`. `requests.py:434-450` (`take_request`) — два подрядчика одновременно читают `status == "new"`.
- **Рекомендация:** unique-констрейнт на `works.request_id` + `SELECT ... FOR UPDATE` / UPDATE с фильтром по статусу.
- **Исправлено (2026-10-28):** дублей в прод-БД не было (проверено). Добавлен `UniqueConstraint('request_id', name='uix_work_request')` + миграция `d2abc734fe6c` (применена к crm_db). `take_request` — атомарный UPDATE с проверкой rowcount → 409. Дубли отчёта → 409 вместо 500 (IntegrityError обработан в create_work и complete_request). Тесты: 92 passed. Задеплоено.

### BE-05. «Успешный» бэкап без дампа БД при отсутствии pg_dump
- **Место:** `backups.py:63-65` — при `FileNotFoundError` в дамп пишется заглушка, бэкап логируется `status="completed"` (`backups.py:205`).
- **Суть:** восстановление молча даст пустую БД — потеря данных при аварии.
- **Рекомендация:** помечать `failed`/без дампа, алертить.

### BE-06. Лимит размера загрузок не реализован
- **Место:** `config.py:15` `MAX_FILE_SIZE` нигде не используется. `works.py:518-541`, `backups.py:384-404`, импорты справочников принимают файлы любого размера.
- **Рекомендация:** проверять размер потока при записи, отклонять с 413.

### BE-07. Бэкап фото собирается с битыми путями внутри архива
- **Место:** `backups.py:273, 284` — `photo.file_path.lstrip("/")` даёт `photos/var/www/...` или `photos/photos/...`.
- **Суть:** структура архива не совпадает с `_copy_upload_subdirs`, восстановление даст неверную раскладку.
- **Рекомендация:** вычислять путь относительно `UPLOAD_DIR`.

### BE-08. Нет защиты от decompression bomb и неперехваченные ошибки PIL
- **Место:** `file_service.py:23, 40`, `requests.py:101-103`.
- **Суть:** повреждённый файл/не-картинка → необработанное исключение → 500; огромный PNG → `DecompressionBombError`/нехватка памяти. Цикл сжатия останавливается на quality=50 и может вернуть файл больше 1 МБ (`MAX_PHOTO_SIZE`).
- **Рекомендация:** try/except вокруг сжатия, лимит пикселей, проверка результата.

### BE-09. Нет защиты от перебора пароля на /auth/login
- **Место:** `auth.py:15-23` — ни rate limit, ни задержки, ни блокировки.
- **Рекомендация:** ограничение попыток по IP/логину, мониторинг.

### BE-10. Срок жизни токена 30 дней, документация говорит 24 ч
- **Место:** `config.py:12` (`ACCESS_TOKEN_EXPIRE_MINUTES = 43200`) против `AGENTS_BACKEND.md:32` (1440).
- **Суть:** вместе с отсутствием отзыва токенов — большое окно компрометации.

### BE-11. Тяжёлый N+1 в отчётах
- **Место:** `reports.py:46-74` (`/summary`), `reports.py:130-193` (`/export`): нет eager loading — 5–7 запросов на работу (building, user, work_services→service, work_materials→material, photos). `/export` читает с диска каждое фото (`reports.py:216-225`) и грузит все работы без пагинации.
- **Рекомендация:** `joinedload`/`selectinload`, выгрузка в фоне.

### BE-12. N+1 в списках
- **Место:** `works.py:286` (`build_work_list_item` грузит photos/files ради `len()`), `requests.py:204` (Work на каждую заявку ради `has_work`), `backups.py:269-289` (lazy-load на каждое фото).
- **Рекомендация:** подзапросы с `func.count` для `has_work`/`photos_count`.

### BE-13. Нет индексов под реальные фильтры и FK
- **Место:** `models.py`: у `works` нет индексов на `work_date`, `building_id`, `user_id`, `request_id`; у `requests` — на `status`, `building_id`, `created_by`, `assigned_to`; FK-столбцы `work_photos.work_id`, `work_files.work_id`, `work_materials.work_id`, `work_services.work_id`, `request_photos.request_id` без индексов (Postgres FK автоматически не индексирует).
- **Рекомендация:** миграция Alembic с индексами.

### BE-14. Полный бэкап выполняется синхронно в HTTP-запросе
- **Место:** `backups.py:166-219` — pg_dump + копирование uploads + ZIP в обработчике запроса. Риск обрыва и блокировки worker'а.
- **Рекомендация:** BackgroundTasks + статус/прогресс в BackupLog.

### BE-15. Управление пользователями: 500 и потеря последнего админа
- **Место:** `users.py:79-113` — нет проверки уникальности `username` → `IntegrityError` → 500; нет защиты от понижения роли/блокировки самого себя и последнего admin. `auth.py:42-45` — `/me` возвращает заблокированного пользователя, тогда как `get_current_user` его отвергает.

### BE-16. upload_backup_part: падение и path traversal
- **Место:** `backups.py:394` — `split('.')[-2]` бросает `IndexError` для имени без точек; `backups.py:393-395` — `backup_id` без `basename` вставляется в путь → запись за пределы `imports`.

### BE-17. list_requests отдаёт всё без пагинации
- **Место:** `requests.py:158-206` — ни `limit`, ни `offset`; с N+1 из BE-12 рост объёма бьёт по времени и памяти.

### BE-18. Частичное сохранение файлов при ошибке загрузки фото
- **Место:** `works.py:501-514` — файлы пишутся на диск в цикле, commit в конце; падение `compress_image` на N-м файле оставляет файлы 1..N-1 сиротами. Невалидные content_type молча пропускаются (`continue`).
- **Рекомендация:** откат файлов при ошибке, агрегировать ошибки в ответ.

### BE-19. Аудит: IP не записывается, удаление заявки — два commit'а
- **Место:** все вызовы `log_action` в `requests.py` без `ip_address` (поле `AuditLog.ip_address` мёртвое). `delete_request` (`requests.py:579-592`) делает commit удаления до записи аудита — при ошибке логирования заявка удалена без следа.

### BE-20. Импорт справочников: «nan»-записи и N+1
- **Место:** `materials.py:74`, `services.py:74` — `str(row.iloc[0])` для пустой ячейки даёт «nan»; запрос в БД на каждую строку (`materials.py:87`); `iterrows` — медленно; файлы почти идентичны (дублирование).

### BE-21. Нет тестов на ключевые модули
- **Место:** `backend/tests/` — нет тестов на `auth`, `users`, `materials`, `services`, `buildings`, `audit_logs`. Критичная BE-01 тестом не перехватывается. Тесты на SQLite + `create_all` (`tests/test_requests.py:36`) — расхождения с Postgres-миграциями не проверяются.

### BE-22. Открытые /docs и слепые зоны конфигурации
- **Место:** `main.py:18` — Swagger UI анонимно в проде. `DEBUG` (`config.py:7`) нигде не используется. Монтирование `/uploads` молча пропускается без `UPLOAD_DIR` (`main.py:35`).

### BE-23. Мелкие: дублирование и устаревшее
- `dependencies.py:35` vs `:37` — `require_executor` идентичен `require_contractor`. Закомментированный `create_all` в `main.py:16`. `WorkUpdate` (`schemas.py:198`) — только базовый класс. `datetime.utcnow` повсеместно (deprecated, naive vs timezone-aware JWT). `security.py:62` — `int(user_id)` без перехвата → 500 вместо 401. Имена выгрузок без RFC 5987 (`reports.py:234`). `RequestCreate` не содержит `service_id` (`requests.py:132-140`) — печатная форма покажет пустой «Необходимый ремонт». `_create_archive`: пустой архив → вводящая в заблуждение 500 (`backups.py:117-120`). Жёстко зашит путь `/home/dimon64515/projects/crm/backend` в API-ответе (`backups.py:484`).

---

## Frontend

### FE-01. Пагинация, сортировка и «на странице» в детальном отчёте не работают
- **Место:** `DashboardPage.jsx:104` — `loadWorks` формирует `{ ...filters, ...params, page, per_page }`: явные params перезаписываются устаревшими значениями из замыкания. Хендлеры `:180-189, 222, 347, 349` вызывают `loadWorks` синхронно после `setState` → запрос уходит со старыми значениями.
- **Рекомендация:** перенести page/perPage/sortBy/sortOrder до `...params` или сделать loadWorks эффектом от состояния.

### FE-02. `usersAPI.deactivate` не существует — деактивация пользователей падает
- **Место:** `SettingsPage.jsx:77` вызывает `usersAPI.deactivate(id)`; в `api.js:57-62` только `list/create/update/remove` → TypeError, catch пустой — пользователь не видит ошибку.

### FE-03. Мёртвая страница `/my-works`
- **Место:** `WorkDetailPage.jsx:78` → `navigate('/my-works')`, но маршрута нет в `App.jsx:31-134`. `MyWorksPage.jsx` существует, но не импортируется; `AGENTS_FRONTEND.md:54` описывает его как существующий.
- **Рекомендация:** добавить маршрут + пункт меню для подрядчика или удалить страницу.

### FE-04. Мобильные карточки заявок: клик по чекбоксу/select уводит со страницы
- **Место:** `RequestsListPage.jsx:467` — `onClick` на карточке, внутри `:472-478` чекбокс и `:488-490` select. Клик всплывает → переход в детали; назначить на мобильном невозможно.
- **Рекомендация:** `e.stopPropagation()` на интерактивных элементах.

### FE-05. Неудачный логин перезагружает страницу и стирает введённые данные
- **Место:** `api.js:25-29` — любой 401 → `window.location.href = '/login'`. Неверный пароль тоже 401 → перезагрузка страницы входа.
- **Рекомендация:** не редиректить для запросов `/auth/login`.

### FE-06. Молчаливые ошибки: десятки пустых catch
- **Место:** `DashboardPage.jsx:97-99,117,369`, `SettingsPage.jsx:62,77,160,170,484`, `WorkDetailPage.jsx:48,55-58`, `WorkFormPage.jsx:77,104,149`, `MyWorksPage.jsx:25`.
- **Суть:** при сетевом сбое или 500 пользователь видит «Нет данных».
- **Рекомендация:** единый обработчик ошибок (toast/блок).

### FE-07. Push-модалка появляется заново на каждой навигации
- **Место:** `Layout.jsx:31-41` — `showOffer` в локальном состоянии, Layout перемонтируется на каждый переход.
- **Рекомендация:** запоминать отказ в localStorage.

### FE-08. Неконсистентная сборка URL фото
- **Место:** `WorkDetailPage.jsx:533,562,578` использует `photo.url` как есть (относительный путь), `RequestDetailPage.jsx:492-499` — через `getUploadUrl()`. В dev-режиме фото в WorkDetail битые.
- **Рекомендация:** везде `getUploadUrl`.

### FE-09. Токен и профиль в localStorage
- **Место:** `AuthContext.jsx:25-26`, `api.js:14`. Токен доступен любому XSS (сейчас риск низкий). `localStorage.setItem('user', ...)` пишется, но нигде не читается.
- **Рекомендация:** рассмотреть httpOnly-cookie, убрать мёртвую запись `user`.

### FE-10. Весь бандл без разделения кода
- **Место:** `App.jsx:5-15` — все 13 страниц eager; чанк `index-*.js` ≈ 543 КБ (react-select — самый тяжёлый).
- **Рекомендация:** `React.lazy` для страниц, manualChunks для vendor.

### FE-11. Детальный отчёт рендерит до 200 строк таблицы без виртуализации
- **Место:** `DashboardPage.jsx:222-226,292-323` — 13 колонок, заметные тормоза на слабых машинах.
- **Рекомендация:** виртуализация (react-window) или дефолт 25-50.

### FE-12. Дублирующиеся методы API
- **Место:** `api.js:53` — `buildingsAPI.remove` === `buildingsAPI.deactivate`; `api.js:139-140` — `backupsAPI.remove` === `backupsAPI.delete`.

### FE-13. Нет ни одного теста
- **Место:** `frontend/package.json:6-11` — только dev/build/lint/preview.

### FE-14. Мелкие
- Отладочный `console.log` в боевом коде (`WorkFormPage.jsx:205,208,333,336,340,362,366-368`). Утечка `URL.createObjectURL` (`WorkFormPage.jsx:586`, `RequestNewPage.jsx:32`). Неиспользуемая `date-fns` (`package.json:14`). Мёртвый `App.css`, неиспользуемые стили в `WorkFormPage.jsx:624-660`, `DashboardPage.jsx:818-823`. Эффект с `setInterval` без зависимостей (`WorkFormPage.jsx:67-70`). Фильтры без дебаунса (`RequestsListPage.jsx:159-203`). Хрупкий CSS-селектор `form > div[style*="flex"]` (`index.css:269-277`). `usersAPI.list({ role: 'contractor' })` без `per_page` → при >20 подрядчиках список неполный (`DashboardPage.jsx:99`, `WorkDetailPage.jsx:57`). `statusLabel/statusStyle` продублированы в 5 файлах. Хардкод серверного пути в UI (`SettingsPage.jsx:643`). Нет обработки 403 отдельно, сообщения Pydantic показываются как есть.
