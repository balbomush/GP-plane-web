/* Compiled Web with a loopback-only Core fixture. Run with Node in Linux. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.GP_PLAYWRIGHT || 'playwright');

const staticRoot = path.resolve(process.env.GP_WEB_STATIC_ROOT || path.join(__dirname, '../../src/gp_control_plane_web/static'));
const restoreFile = '/api/v2/backup/restore-file';
const restoreSaved = '/api/v2/backup/restore';
const retryName = 'Повторить восстановление';
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let supported = true;

function json(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/v2/access/authentication') {
    return json(res, { bearer_token: 'synthetic-token', expires_at: '2099-01-01T00:00:00Z' });
  }
  if (url.pathname === '/api/v2/service/status') {
    return json(res, {
      core_version: '0.5.0', api_version: '2', storage: 'ready', busy: false, operation: null, backup_exists: true,
      ...(supported ? { backup_restore_idempotency: true } : {}),
    });
  }
  if (url.pathname === '/api/v2/search/current') return json(res, { active: false, run: null });
  if (url.pathname === '/api/v2/search/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(': connected\n\n');
    return;
  }
  if (url.pathname === '/api/v2/data/milestones') {
    return json(res, { items: [{ id: 1 }], total: 1, offset: 0, limit: 50, current_id: 1 });
  }
  if (url.pathname.startsWith('/api/')) return json(res, { items: [], total: 0, offset: 0, limit: 50 });
  const file = path.resolve(staticRoot, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  assert.ok(file.startsWith(staticRoot + path.sep));
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  const contentType = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html' }[path.extname(file)] || 'application/octet-stream';
  const bytes = fs.readFileSync(file);
  const body = file.endsWith('index.html')
    ? bytes.toString('utf8').replace('</head>', `<meta name="gp-core-target" content="${'a'.repeat(64)}"></head>`)
    : bytes;
  res.writeHead(200, { 'Content-Type': contentType }).end(body);
});

async function scenario(browser, url, mode, file, failTwice = false) {
  supported = mode !== 'legacy';
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const calls = [];
  const button = name => page.getByRole('button', { name, exact: true });
  const roleOfRestore = file ? 'Восстановить из файла' : 'Восстановить сохранённую копию';
  const confirm = async () => {
    await button(roleOfRestore).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить', exact: true }).click();
  };
  const selectFile = async value => page.getByLabel('Файл резервной копии').setInputFiles({
    name: value + '.zip', mimeType: 'application/zip', buffer: Buffer.from(value)
  });
  try {
    // Loopback is secure in Chromium. Disable randomUUID to cover the same fallback as HTTP LAN.
    await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
    await context.route('**/*', async route => {
      const request = route.request(), target = new URL(request.url());
      if (target.origin !== url) return route.abort();
      if (request.method() !== 'POST' || ![restoreFile, restoreSaved].includes(target.pathname)) return route.continue();
      const headers = await request.allHeaders();
      calls.push({ path: target.pathname, key: headers['idempotency-key'], body: request.postDataBuffer()?.toString() });
      if (calls.length <= (failTwice ? 2 : 1)) return route.abort('failed');
      return route.fulfill({ status: 200, json: { restored: true } });
    });
    await page.goto(url);
    await page.getByLabel('Логин', { exact: true }).fill('admin');
    await page.getByLabel('Пароль', { exact: true }).fill('admin');
    await button('Войти').click();
    await page.getByRole('navigation', { name: 'Разделы GP Plane' }).getByRole('button', { name: 'Обслуживание', exact: true }).click();
    await button('Резервная копия').click();
    if (file) await selectFile('original-archive');
    await confirm();
    await page.getByRole('alert').filter({ hasText: 'Итог неизвестен' }).waitFor();
    assert.equal(calls.length, 1, 'No automatic application retry after transport failure');
    assert.equal(calls[0].path, file ? restoreFile : restoreSaved);
    if (mode === 'legacy') {
      assert.equal(calls[0].key, undefined);
      assert.equal(await button(retryName).count(), 0);
      return { mode, file, calls };
    }
    assert.match(calls[0].key ?? '', uuid4);
    if (mode === 'downgraded') {
      supported = false;
      await button(retryName).click();
      await page.getByRole('alert').filter({ hasText: 'не подтвердил поддержку' }).waitFor();
      assert.equal(calls.length, 1, 'Unknown capability must not repeat a potentially applied restore');
      return { mode, file, calls };
    }
    // A new file selection changes the next operation, never the pending retry.
    if (file) await selectFile('next-archive');
    await button(retryName).click();
    if (failTwice) {
      await page.getByRole('alert').filter({ hasText: 'Итог неизвестен' }).waitFor();
      assert.equal(calls.length, 2);
      await button(retryName).click();
    }
    await page.getByRole('status').filter({ hasText: 'Восстановлено' }).waitFor();
    const previousCount = failTwice ? 3 : 2;
    assert.equal(calls.length, previousCount);
    for (const call of calls.slice(1)) assert.deepEqual(call, calls[0]);
    assert.equal(await button(retryName).count(), 0);
    await confirm();
    await page.getByRole('status').filter({ hasText: 'Восстановлено' }).waitFor();
    assert.equal(calls.length, previousCount + 1);
    assert.match(calls.at(-1).key ?? '', uuid4);
    assert.notEqual(calls.at(-1).key, calls[0].key);
    if (file) assert.equal(calls.at(-1).body, 'next-archive');
    return { mode, file, calls };
  } finally {
    await context.close();
  }
}

(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.GP_CHROMIUM || '/usr/bin/chromium' });
  try {
    const results = [];
    for (const file of [false, true]) {
      results.push(await scenario(browser, url, 'supported', file, file));
      results.push(await scenario(browser, url, 'legacy', file));
    }
    results.push(await scenario(browser, url, 'downgraded', false));
    console.log(JSON.stringify({ platform: process.platform, scenarios: results }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
