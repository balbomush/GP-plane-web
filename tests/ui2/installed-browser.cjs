/* Narrow installed Web/Core boundary. Synthetic engine adapter, never real engines. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.GP_PLAYWRIGHT||'playwright');
async function run(cfg){
 for(const raw of [cfg.url,cfg.coreUrl])assert.equal(new URL(raw).hostname,'127.0.0.1','Only owned loopback listeners');
 const browser=await chromium.launch({headless:true});const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/'))requests.push({method:r.method(),path:u.pathname,query:[...u.searchParams]});});
 await context.route('**/*',route=>new URL(route.request().url()).origin===cfg.url?route.continue():route.abort());
 const button=name=>page.getByRole('button',{name,exact:true});const label=name=>page.getByLabel(name,{exact:true});
 const nav=name=>page.getByRole('navigation',{name:'Разделы GP Plane'}).getByRole('button',{name,exact:true}).click();
 const confirm=async name=>{await button(name).click();await page.getByRole('dialog').getByRole('button',{name:'Подтвердить',exact:true}).click();};
 const login=async password=>{await label('Логин').fill('admin');await label('Пароль').fill(password);await button('Войти').click();await button('Выйти').waitFor();};
 try{
  await page.goto(cfg.url);await label('Логин').fill('admin');await label('Пароль').fill('wrong');await button('Войти').click();await page.getByRole('alert').waitFor();await login('admin');
  assert.match(await page.locator('meta[name=gp-core-target]').getAttribute('content'),/^[a-f0-9]{64}$/);
  const access=await context.request.post(cfg.coreUrl+'/api/v2/access/authentication',{data:{username:'admin',password:'admin'}});assert.equal(access.status(),200);const token=(await access.json()).bearer_token;
  const headers={Authorization:'Bearer '+token};
  const legacy=await context.request.get(cfg.coreUrl+'/api/v2/service/releases?channel=stable',{headers});assert.equal(legacy.status(),400,'Immutable draft.34 must reject legacy channel before catalog access');
  for(const pathname of ['/service/status','/search/current','/data/bundles?view=all&milestone_id=0']){const r=await context.request.get(cfg.coreUrl+'/api/v2'+pathname,{headers});const contract=require('./contract.cjs');const operation=contract.request('GET','/api/v2'+pathname);contract.response(operation,r.status(),await r.json());}
  await nav('Списки доменов');await button('Новый список').click();await label('Название списка').fill('Installed synthetic list');await label('Домены списка').fill('one.example\ntwo.example');await button('Сохранить список').click();await page.getByText('Installed synthetic list',{exact:true}).first().waitFor();await button('Использовать в поиске').click();
  assert.notEqual(await label('Список доменов').inputValue(),'');
  for(const engine of ['blockcheck2','blockcheck2-gp']){
   await label('Движок').selectOption(engine);await button('Начать поиск').click();await page.getByText('fixture strategy',{exact:false}).first().waitFor();await button('Остановить поиск').click();await page.getByRole('heading',{name:'Остановлен',exact:true}).waitFor();
   if(engine==='blockcheck2')assert.equal(await button('Продолжить поиск').count(),0);
   else{await button('Продолжить поиск').click();await button('Остановить поиск').waitFor();await page.getByText('fixture strategy',{exact:false}).first().waitFor();await button('Остановить поиск').click();await page.getByRole('heading',{name:'Остановлен',exact:true}).waitFor();}
   await button('Новый поиск').click();
  }
  await nav('История поисков');await button('Открыть поиск').first().click();await page.getByText('Время завершения',{exact:true}).waitFor();
  await nav('Результаты');await page.locator('[data-strategy]').first().click();const exact=await page.locator('[data-selected-args]').innerText();await button('Копировать аргументы').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),exact);
  const strategy=page.waitForEvent('download');await button('Скачать ZIP стратегии').click();await(await strategy).saveAs(path.join(cfg.output,'installed-strategy.zip'));await page.getByText('Состав полученного ZIP',{exact:true}).waitFor();
  await nav('Обслуживание');await button('Резервная копия').click();await button('Создать копию').click();await page.getByText('Копия создана',{exact:true}).waitFor();const backup=page.waitForEvent('download');await button('Скачать резервную копию').click();await(await backup).saveAs(path.join(cfg.output,'installed-backup.zip'));
  await label('Файл резервной копии').setInputFiles({name:'invalid.zip',mimeType:'application/zip',buffer:Buffer.from('not a ZIP')});await confirm('Восстановить из файла');await page.getByRole('alert').filter({hasText:/Архив/}).waitFor();
  await label('Файл резервной копии').setInputFiles(path.join(cfg.output,'installed-backup.zip'));await confirm('Восстановить из файла');await page.getByText('Восстановлено',{exact:false}).first().waitFor();await confirm('Восстановить сохранённую копию');await page.getByText('Восстановлено',{exact:false}).first().waitFor();
  await button('Доступ').click();await label('Логин').fill('admin');await label('Старый пароль').fill('admin');const password='Synthetic-only-20261115';await label('Новый пароль').fill(password);await button('Сменить пароль').click();await button('Войти').waitFor();await login(password);
  await nav('Обслуживание');await page.route('**/api/v2/service/status',route=>route.continue({headers:{...route.request().headers(),authorization:'Bearer invalid-synthetic-token'}}));await button('Проверить состояние Core').click();await button('Войти').waitFor();await page.unroute('**/api/v2/service/status');await login(password);
  fs.writeFileSync(path.join(cfg.output,'final-password.json'),JSON.stringify({password}));await button('Выйти').click();assert.equal(requests.some(r=>r.path.includes('/api/web/')||r.path.includes('/api/core/')),false);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(cfg.output,'installed-browser.json'),JSON.stringify({status:'PASS',requests,errors,core:cfg.coreUrl,web:cfg.url,engines:'existing synthetic adapter; no real engine/helper'},null,2));
 }finally{await context.close();await browser.close();}
}
module.exports={run};
