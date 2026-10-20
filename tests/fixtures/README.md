# Populated golden

`v044-populated.json` получен HTTP GET к установленному неизменному released wheel
Core v0.4.4, SHA256 `6f8a87ad48d73c30263cd6bba4d4297ad983f14348506489cd72d245628fe421`,
commit `66b5898d6c30544df00d928126ecc5a38ea6fffc`, через
`/api/internal/web-views/strategy-candidates-page?limit=50&offset=0`.
Данные созданы штатным `storage.upsert_candidate_event` на synthetic state;
это fixtures отображения/copy, не стратегии, квалифицированные для применения.
Содержатся Unicode, двойные пробелы, кавычки, текст файловой ссылки и XSS-подобный
текст. Они должны передаваться без исполнения/разбора shell и без изменения порядка.
Golden не перегенерируется из нового Core или нового форматтера.

Копирование следует существующим `candidate-selection.js` v0.4.4:
outer trim аргументов, внутренние байты сохранены; несколько строк объединяются LF.
При физическом обмене с Windows clipboard ОС преобразует LF в CRLF. Проверять
отдельно исходный callback payload (строгий LF) и нативный clipboard платформы.
