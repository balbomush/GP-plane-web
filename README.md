# GP Plane Web

Независимый Web-клиент GP Plane Core, локальный срез S3–S6. Python-пакет
`gp-plane-web`, namespace `gp_control_plane_web`, команда `gp-web`.
Svelte shell и экраны: подбор Standard/Multi, журнал и прогресс, история, кандидаты
и точное копирование, списки/v2fly, настройки, пароль, релизы Core и бекапы.
Текущий кандидат разработки — Python `0.1.0.dev1`, frontend `0.1.0-s3.1`;
приёмка и публикация стабильной пары выполняются отдельно.

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
3. В `frontend`: `npm ci`, `npm run check`, `npm run build`. Используется архив из lock, не symlink.
4. В корне: `python -m build --no-isolation`. Python wheel/sdist содержат
   `static/index.html`/собранные JS/CSS и контракт OpenAPI. Frontend собирается до
   Python-пакетов. Sdist включает frontend source/lock и неизменяемый gp-ui archive;
   повторная сборка frontend из sdist использует тот же Node/npm/lock без соседних
   Core/библиотеки. Сборка wheel из уже собранного sdist не требует Node.
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
- `frontend/src/app/`: shell/session и единственный владелец accepted run.
- `frontend/src/features/`: Svelte DOM и state/controllers каждого экрана.
- `frontend/src/transport/`: отмена по сессии/выбору, SSE/reconnect, URLs/download.
- `frontend/src/domain/`: прежние чистые run/log/candidate algorithms с provenance.
- `packages/gp-ui/`: общий компонент и чистое форматирование; [контракт](packages/gp-ui/README.md).
- Core: auth/storage/algorithms/jobs/vault/root и свои HTTP API; Web — HTTP peer.
- Horizon: свой controller/allowlist/auth/navigation/loader/consumer/lock. Подключение
  отдельным S2B на согласованном SHA, здесь отсутствует.

Лицензия MIT включена в distribution. Уведомления Bottle/Cheroot и происхождение
GP-derived кода сохранены. Публичный репозиторий —
https://github.com/balbomush/GP-plane-web ; эта feature-копия не опубликована.

## Самостоятельные install/update/remove

Установка использует готовый квалифицированный wheel и offline wheelhouse.
Выполняйте installer из того же exact source archive, что указан в manifest
выпуска; локальный development-кандидат не является опубликованным выпуском.

```bash
sudo bash scripts/install-linux.sh --install-user "$USER" \
  --wheel "$WEB_WHEEL" --sha256 "$WEB_SHA256" --wheelhouse "$WHEELHOUSE" \
  --core-url http://127.0.0.1:8081 --host 0.0.0.0 --port 8080
```

Та же команда с новым wheel/hash обновляет только Web. До остановки проверяются
checksum, offline Python runtime, production assets/manifest, совместимость
живого Core и занятый порт. Настройки существующего `/etc/default/gp-web`
сохраняются. Чужие unit/config/root/listener не удаляются.

```bash
sudo bash scripts/install-linux.sh --install-user "$USER" --operation remove
```

Удаляются только принадлежащие Web `~/gp/GP-plane-web`, `gp-web.service` и
`/etc/default/gp-web`. Core, state/vault/helper и активный подбор не затрагиваются.
После нового подключения Web показывает те же run/history/results через Core.
Обновление Core может временно прервать upstream; это не удаление сессии/данных.
Вкладку, открытую до замены assets, можно перезагрузить по явной ссылке при ошибке
загрузки. HTML не кэшируется, версии JS/CSS имеют content hashes.

## Проверки

```bash
PYTHONPATH=src python -m unittest discover -s tests -p 'test_*.py'
cd frontend
npm ci
npm run check
node --test format.test.mjs
npm run build
```

`tests/frontend-ui.cjs` проверяет production assets в Chromium с явными UI
fixtures; укажите `GP_PLAYWRIGHT_MODULE`/`PLAYWRIGHT_BROWSERS_PATH` своего
закреплённого runner. Это не замена installed HTTP/Linux/engine проверкам.
Build пишет `static/asset-manifest.json` с hash lock, gp-ui и assets; при
отсутствующих/повреждённых package assets listener не открывается.

Инструменты сборки квалифицируются отдельно: Node 24.19.0, npm 11.17.0,
Svelte/Vite/TypeScript закреплены в `frontend/package-lock.json`. На Linux для
Node-тестов задайте `GP_NODE` абсолютным путём используемого Node. На устройстве
готовый wheel обслуживается Python/Bottle/Cheroot без Node и без CDN приложения.
Прежний `/swagger` сохраняет внешний Swagger CDN и raw OpenAPI fallback.

Полная UI-матрица через реально установленный Web запускается его отдельным
интерпретатором; API в этом наборе — явные synthetic fixtures:

```bash
/path/to/web-venv/bin/python tests/qualify_frontend.py \
  --wheel /path/to/web.whl --node /path/to/node \
  --playwright-module /path/to/node_modules/playwright \
  --browsers /path/to/playwright-browsers --output /path/to/evidence/browser
```

Путь output должен быть новым. Runner сверяет файлы с wheel, запускает только
свой loopback Web, закрывает его после проверки и сохраняет identity/результаты.
Все шесть UI-наборов обязательны для полного отчёта. Реальные Core HTTP и engine
проверяются отдельно; таблица ответственности — [tests/OWNERSHIP.md](tests/OWNERSHIP.md).
Версионированный gp-ui архив хранится в `frontend/vendor/`, чтобы clean clone и
sdist не требовали исходников библиотеки или соседнего репозитория.

Поддерживаемый Core API contract описан в
`src/gp_control_plane_web/compatibility.json`; отсутствие нужных операций или
незаявленная версия останавливает installer до activation. Проверенные пары
фиксируются exact SHA/hash в release manifest. Пакет gp-ui S2A сохранён:
`0.1.0-s2a.1`, SHA256
`a1ed233f5ae2fd9830c2158737ad080f1deacfb84090d0efe88ce365b3289498`.
Horizon consumer, loader и lock остаются отдельным S2B; этот Web не доказывает
интеграцию Horizon.
