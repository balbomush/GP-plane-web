# GP Plane Web

Независимый Web-клиент GP Plane Core, локальный срез S2A. Python-пакет
`gp-plane-web`, namespace `gp_control_plane_web`, команда `gp-web`.
На этом этапе перенесены login/session/password, заполненные результаты и копирование.
Остальные пользовательские экраны ещё не перенесены. Это не опубликованный релиз.

Bottle 0.13.4 / Cheroot 11.1.2 сохранены. Web не устанавливает и не импортирует
Python Core, не читает SQLite, конфиги/vault Core, не владеет движком или helper.
Настройки: `GP_WEB_CORE_URL` (http(s) origin, по умолчанию loopback :8081),
`GP_WEB_HOST` (loopback), `GP_WEB_PORT` (8080), либо одноимённые CLI-параметры.
Runtime — Python >=3.11 и compiled assets, без Node/Vite/CDN.

## Сборка из отдельных источников

Подготовка зависимостей может использовать сеть. Воспроизводимая сборка требует
Node24.19.0/npm11.17.0, tracked locks, Python build/setuptools84.0.0 и заранее
загруженных Python wheels. Глобальное окружение обновлять не нужно.

1. В `packages/gp-ui`: `npm ci`, затем `npm pack --pack-destination <artifact-dir>`.
2. Скопируйте exact `gp-plane-gp-ui-0.1.0-s2a.1.tgz` в `frontend/vendor/`;
   сверьте SHA256 с manifest квалифицированного пакета. Library source в build-копии
   потребителя не требуется: `packages/` можно не передавать.
3. В `frontend`: `npm ci`, `npm run build`. Используется архив из lock, не symlink.
4. В корне: `python -m build --no-isolation`. Python wheel/sdist содержат
   `static/index.html`/собранные JS/CSS и контракт OpenAPI. Frontend собирается до
   Python-пакетов; повторная сборка wheel из sdist не требует соседнего Core/Node.
5. В отдельном venv вне source cwd: `pip install --no-index --find-links <wheelhouse> <web.whl>`.
   Затем `gp-web --host 127.0.0.1 --port 8080 --core-url http://127.0.0.1:8081`.

Сначала нужен уже запущенный совместимый Core; Web не стартует второй Core автоматически.
При недоступном Core показывается ошибка. Логин/токены проверяет Core, смена пароля
инвалидирует прежний токен. Клиент не сохраняет пароль; bearer хранится только в памяти
страницы. Используйте доверенную локальную сеть/свой защищённый внешний proxy; транспорт
и политика удалённой авторизации не менялись этим переносом.

## Границы ответственности

- `src/gp_control_plane_web/`: Web-owned listener, HTTP proxy, session transport,
  ограничения/stream cleanup и package assets. Перенос из MIT Core: `PROVENANCE.json`.
- `frontend/`: shell, auth, запрос результата и callbacks приложения.
- `packages/gp-ui/`: общий компонент и чистое форматирование; [контракт](packages/gp-ui/README.md).
- Core: auth/storage/algorithms/jobs/vault/root и свои HTTP API; Web — HTTP peer.
- Horizon: свой controller/allowlist/auth/navigation/loader/consumer/lock. Подключение
  отдельным S2B на согласованном SHA, здесь отсутствует.

Лицензия MIT включена в distribution. Уведомления Bottle/Cheroot и происхождение
GP-derived кода сохранены. Публичный репозиторий —
https://github.com/balbomush/GP-plane-web ; эта feature-копия не опубликована.
