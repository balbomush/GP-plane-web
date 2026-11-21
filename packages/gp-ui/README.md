# @gp-plane/gp-ui — результат и копирование

Локальный кандидат `0.1.0-s2a.1`, MIT. Первый потребитель — GP Plane Web.
Horizon в этом срезе не подключён; тестовая оболочка не считается вторым приложением.

```svelte
<script>
  import Results from '@gp-plane/gp-ui';
  let {candidates} = $props();
</script>
<Results {candidates} onCopy={text => navigator.clipboard.writeText(text)} />
```

Props: `candidates: Candidate[]` (порядок входа сохраняется), `loading?: boolean`,
`error?: string`, обязательный `onCopy(text): Promise<void>`, необязательный
`onCopyResult(ok, message): void`. DTO в `src/format.d.ts`. Только текстовый вывод,
без `{@html}`, router/store, fetch, token, filesystem или применения стратегии.
DOM clipboard принадлежит приложению; callback может отказать, компонент покажет ошибку.
После destroy завершение callback не изменяет UI и не вызывает уведомление потребителя.

`strategyText` сохраняет строку аргументов с её внутренними пробелами, Unicode,
кавычками, порядком и ссылками на файлы. Убираются только внешние пробелы, как в
`candidateResultText`/`uniqueStrategyArgs` v0.4.4. Копирование всех — непустые строки
в исходном порядке через один LF, без завершающего LF. Дубликаты не удаляются
компонентом. Домены собираются из `seen` и `common_seen` по прежнему порядку.
Ссылки на файлы остаются текстом аргументов, не становятся URL/загрузкой/исполняемым кодом.
`validCandidates` — проверка входного массива у adapter, не новый Core DTO.

Peer: `svelte ^5.0.0`; квалификация Web на exact `5.57.2`. Это ESM/Svelte package,
компилируемый потребителем. Node нужен при сборке, не на устройстве. API/auth и
навигация Horizon, `/ctl/v1/gp/*`, allowlist и его lock остаются собственностью Horizon.

Доставка без npm registry: `npm pack` из этого каталога; сохранить `.tgz` в release
артефактах с SHA256. Потребитель получает этот exact архив в `frontend/vendor/`,
использует tracked package-lock и `npm ci`. `file:` указывает на `.tgz`, не соседний
checkout, workspace или symlink. `vendor/`, node_modules и compiled assets не коммитятся.
Команды с exact Node/npm приведены в Web README; хеши квалификации хранятся локально.

Происхождение: GP Core v0.4.4 `66b5898d6c30544df00d928126ecc5a38ea6fffc`,
MIT, `web/ui_assets/scripts/candidate-selection.js`; исходная лицензия включена.
Новые представление и узкий adapter принадлежат GP Plane Web; код Horizon не заимствован.


## API 2 modules (0.2.0-ui2.1)

The original root `Results` and `./format` exports are unchanged. Import the new modules from `@gp-plane/gp-ui/api2`:
`GpSearch`, `GpCurrentSearch`, `GpStrategies`, `GpBundles`, `GpHistory`, `GpDomainLists`, `GpSession`, and types `GpClient`, `Dto`, `Input`.
The generated DTOs correspond to the shipped OpenAPI draft.34, not a hand-maintained view schema.

Create one `GpSession(client)` per mounted GP area. Call `session.start()` once when the host has access and `session.dispose()` when closing the area or ending that access. It owns one current-search subscription across screen changes. Components do not log in or read Web storage. The host owns authentication, navigation and its own update IDs.

The client has methods named after the 41 public operation IDs. Ordinary operations take `{path, query, body}` as applicable and an optional `{signal}`; return the public JSON DTO, `Blob` for an archive, or void for 204. `watchCurrentSearch(receive, connected)` returns a disposer. The adapter must honor abort signals and reject failed HTTP responses or incomplete JSON. Host capabilities `copy(text)` and `save(blob, filename)` must retain the exact supplied content. A resolved `save` means handed to the host, not proof of disk persistence.

Pass `{client, session}` to each module. `GpSearch` additionally accepts `initialDomains`. `GpHistory.onNew` navigates to the search form; `.onCatalog({milestone_id,domains})` navigates to the relevant catalog (it is not run-only history). `GpDomainLists.onSearch(domains)` navigates to search; the session carries the selected saved-list context. `GpCurrentSearch.onNew` is optional. No Core URL, bearer or Web model import is needed by a module.

Each area is scoped under `.gp-scope`. Override inherited `--gp-bg`, `--gp-surface`, `--gp-muted`, `--gp-text`, `--gp-secondary`, `--gp-line`, `--gp-accent`, `--gp-on-accent`, `--gp-error`, `--gp-error-bg`, `--gp-code-bg`, `--gp-radius`, `--gp-space`. Styles do not recolor `body` or `:root`. The host supplies light/dark color-scheme. `GpFrame` and `GpConfirm` are optional public presentation helpers.

`tests/ui2/consumer` demonstrates a separate adapter/session, host navigation, initial domains and theme using the same exact tgz as Web. It is a synthetic consumer, not an integration with Horizon. The package is local-only and has not been registry published.
