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
