# Уведомления GP Plane Web

Web использует Bottle/Cheroot и включает собранный frontend runtime Svelte.
Web не устанавливает zapret2, v2fly или Core. Следующие исходные уведомления GP
сохранены как provenance перенесённого кода; они не описывают дополнительные
компоненты, устанавливаемые этим Web-пакетом. Лицензии bundled runtime приведены ниже.

# Сторонние компоненты

MIT в LICENSE относится к собственному коду GP и не меняет лицензии сторонних
компонентов. Новая реализация installer написана самостоятельно; текст скрипта
из issue №7 не заимствован.

GP устанавливает отдельные Python distributions Bottle 0.13.4 (MIT) и Cheroot
11.1.2 (BSD-3-Clause). Их лицензии и copyright notices остаются в установленных
пакетах. Транзитивные jaraco.functools и more-itertools имеют MIT; installer
сохраняет метаданные фактически разрешённых версий. GP не включает исходники
этих библиотек в свой wheel.

zapret2 загружается отдельно из [upstream release v1.0.5.2](https://github.com/bol-van/zapret2/releases/tag/v1.0.5.2).
Содержимое release, включая его лицензионные файлы и уведомления, сохраняется;
лицензия GP не применяется к этому runtime. Условия upstream относятся также
к его встроенным сторонним компонентам. Runtime не включается в wheel GP.

Swagger UI загружается браузером из swagger-ui-dist по CDN (Apache-2.0),
его файлы не включены в пакет GP. Исходник и условия:
https://github.com/swagger-api/swagger-ui.

Каталог v2fly и результаты его обработки — отдельные данные со своими
условиями источника, а не код GP под MIT. GP сохраняет исходную информацию
об источнике и не перелицензирует её. Flowseal/blockcheckS в эту поставку не входят.


## Frontend runtime: svelte 5.57.2

Source: https://www.npmjs.com/package/svelte/v/5.57.2

Copyright (c) 2016-2025 [Svelte Contributors](https://github.com/sveltejs/svelte/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## Frontend runtime: esm-env 1.2.2

Source: https://www.npmjs.com/package/esm-env/v/1.2.2

Copyright 2022 Benjamin McCann

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## Frontend runtime: clsx 2.1.1

Source: https://www.npmjs.com/package/clsx/v/2.1.1

MIT License

Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
