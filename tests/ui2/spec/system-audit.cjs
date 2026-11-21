const {add,assert,until,fs,path}=require('./common.cjs');
const launch=c=>c.button('Начать поиск');
const status=c=>c.page.locator('.core-link');
const f5=c=>c.page.reload({waitUntil:'domcontentloaded'});
const service=async c=>c.nav('Обслуживание');
const screenshot=(c,name)=>c.page.screenshot({path:path.join(c.output,name+'.png')});
async function nav(c,name){
  if(await c.button('Меню').isVisible())await c.button('Меню').click();
  await c.nav(name);
  await c.page.evaluate(()=>scrollTo(0,0));
}

add('audit-reload','auth.01','Reload resumes the tab session, reads fresh status and does not replay a mutation',async c=>{
  await service(c);
  await c.button('Вехи').click();
  await c.button('Создать следующую веху').click();
  await c.page.getByRole('dialog').getByRole('button',{name:'Подтвердить'}).click();
  await until(()=>assert.equal(c.call('createMilestone').length,1));
  c.state.status.core_version='0.5.1';
  const before=c.call('getCoreStatus').length;
  await f5(c);
  await c.visible(c.button('Выйти'));
  await c.text('0.5.1');
  assert(c.call('getCoreStatus').length>before);
  assert.equal(c.call('authentication').length,1);
  assert.equal(c.call('createMilestone').length,1);
  await c.button('Выйти').click();
  await f5(c);
  await c.visible(c.button('Войти'));
  assert.equal(c.call('authentication').length,1);
  assert.equal(c.call('stopCurrentSearch').length,0);
});

for(const mode of ['expired','revoked'])add('audit-reload-'+mode,'auth.01','Reload rejects '+mode+' access without replaying login',async c=>{
  await c.visible(c.button('Выйти'));
  await until(()=>assert.equal(c.state.streams.size,1));
  const n=c.call('getCoreStatus').length;
  if(mode==='expired')await c.page.clock.setFixedTime(new Date('2100-01-01T00:00:00Z'));
  else c.fault('getCoreStatus',401,'invalid_token','Токен отозван');
  await f5(c);
  await c.visible(c.button('Войти'));
  if(mode==='revoked')assert(c.call('getCoreStatus').length>n,'Stored token must be validated');
  assert.equal(c.call('authentication').length,1);
  assert.equal(c.call('stopCurrentSearch').length,0);
});

add('audit-independent-reads','running.10 search.03','Independent freshness, visible failure paths and server refusal',async c=>{
  await c.visible(c.button('Выйти'));
  await service(c);
  const refresh=c.button('Проверить состояние Core');
  c.fault('getCurrentSearch',503,'storage_unavailable','Отказ текущего поиска');
  await refresh.click();
  await c.visible(status(c).getByText(/Текущий поиск недоступен/i));
  assert((await status(c).innerText()).includes('Core подключён'));
  await c.nav('Поиск');
  assert(await launch(c).isDisabled());
  await service(c);
  delete c.state.faults.getCurrentSearch;
  c.fault('getCoreStatus',503,'storage_unavailable','Отказ статуса');
  await refresh.click();
  await c.visible(status(c).getByText(/Статус Core недоступен/i));
  delete c.state.faults.getCoreStatus;
  await refresh.click();
  await c.visible(status(c).getByText('Core подключён',{exact:true}));
  await c.nav('Поиск');
  await c.label('Домены').fill('one.example');
  c.fault('blockcheck2GpStart',409,'engine_not_ready','Движок не готов');
  await launch(c).click();
  await c.text('Движок не готов');
  assert.equal(await c.label('Домены').inputValue(),'one.example');
  assert.equal(c.call('blockcheck2GpStart').length,1);
});

add('audit-search-container','visual.search package.consumer','Same container in Web and consumer with comparable readable column widths',async c=>{
  const rows=[];
  async function check(mode,viewport,width){
    await c.page.setViewportSize({width:viewport,height:1024});
    if(mode==='host')await c.page.locator('body').evaluate((el,w)=>{el.style.width=w+'px';el.style.margin='0';},width);
    rows.push(await c.page.locator('.search-layout').evaluate((el,mode)=>{
      const box=s=>el.querySelector(s).getBoundingClientRect();
      return {mode,window:innerWidth,host:el.closest('.gp-scope').clientWidth,field:Math.round(box('textarea').width),form:Math.round(box('.search-inputs').width),summary:Math.round(box('.search-summary').width),engineColumns:getComputedStyle(el.querySelector('.engine-settings .fields')).gridTemplateColumns};
    },mode));
  }
  for(const [v,w] of [[714,690],[715,691],[768,744],[1000,744]])await check('web',v,w);
  await c.button('Выйти').click();
  await c.page.goto(c.url+'/consumer/');
  for(const w of [690,691,744])await check('host',1500,w);
  fs.writeFileSync(path.join(c.output,'container.json'),JSON.stringify(rows,null,2));
  for(const row of rows)assert(row.field>=390,'Domain field became too narrow: '+JSON.stringify(row));
  const same=rows.filter(r=>r.host===744);
  assert.equal(same.length,3);
  assert(Math.max(...same.map(r=>r.form))-Math.min(...same.map(r=>r.form))<=1);
  assert(Math.max(...same.map(r=>r.summary))-Math.min(...same.map(r=>r.summary))<=1);
  assert.equal(new Set(same.map(r=>r.engineColumns)).size,1);
  assert.equal(same[0].engineColumns.split(' ').length,2);
});

add('audit-filter-row','visual.history visual.catalog visual.lists','Filters align at 44px; chips and narrow wrapping preserve the row',async c=>{
  const rows=[];
  async function measure(screen,locators){
    const group=[];
    for(const locator of locators){const b=await locator.boundingBox();group.push({y:b.y,bottom:b.y+b.height,height:b.height});}
    rows.push({screen,group});
  }
  await c.page.setViewportSize({width:1920,height:1080});
  await c.nav('История поисков');
  await measure('history',[c.label('Движок истории'),c.label('Веха истории'),c.button('Применить фильтры истории')]);
  await c.nav('Результаты');
  const fields=[c.label('Веха результатов'),c.label('Домены фильтра'),c.button('Применить фильтры')];
  await measure('catalog-empty',fields);
  await c.label('Домены фильтра').fill('example.com example.org');
  await c.label('Домены фильтра').press('Enter');
  await measure('catalog-chips',fields);
  await c.nav('Списки доменов');
  await measure('lists',[c.label('Найти список'),c.label('Тип списка'),c.button('Новый список')]);
  fs.writeFileSync(path.join(c.output,'filters.json'),JSON.stringify(rows,null,2));
  for(const {screen,group} of rows){
    assert(group.every(x=>Math.abs(x.height-44)<1),screen+' controls differ in height');
    assert(Math.max(...group.map(x=>x.bottom))-Math.min(...group.map(x=>x.bottom))<2,screen+' controls differ in baseline');
  }
  await c.page.setViewportSize({width:360,height:800});
  await screenshot(c,'lists-360');
  assert(await c.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});

if(process.env.GP_AUDIT_MATRIX)add('audit-matrix','visual.search visual.history visual.lists visual.catalog visual.service','Matched audit matrix of 14 states and six viewports',async c=>{
  const frames={};
  const sizes=[[360,800],[768,1024],[1366,768],[1920,1080],[2560,1080],[3440,1440]];
  for(const [width,height] of sizes){
    await c.page.setViewportSize({width,height});
    const capture=async scene=>{
      const key=scene+'-'+width+'x'+height;
      frames[key]=await c.page.evaluate(()=>({width:innerWidth,height:innerHeight,zoom:devicePixelRatio,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth)}));
      await screenshot(c,key);
      if(process.env.GP_AUDIT_MATRIX==='after')assert.equal(frames[key].overflow,0,key);
    };
    await c.visible(c.label('Домены'));
    await c.label('Домены').fill('one.example\ntwo.example\nthree.example');
    await c.page.evaluate(()=>scrollTo(0,0));
    await capture('search');
    await nav(c,'Результаты');
    if(await c.button('Стратегии').getAttribute('aria-pressed')!=='true')await c.button('Стратегии').click();
    await c.visible(c.page.locator('[data-strategy]').first());
    await capture('catalog');
    await c.openCatalogFilters();
    await c.label('Домены фильтра').fill('one.example two.example');
    await c.label('Домены фильтра').press('Enter');
    await c.page.evaluate(()=>scrollTo(0,0));
    await capture('filter');
    await c.openCatalogFilters();
    const filters=c.page.getByRole('button',{name:/^Фильтры(?: · \d+)?$/});
    await filters.click();
    await c.page.locator('[data-strategy]').nth(1).click();
    await c.visible(c.page.locator('[data-selected-args]'));
    await capture('strategyDetail');
    await c.button('Комплекты').click();
    await c.visible(c.page.locator('[data-bundle]').first());
    await capture('bundles');
    await nav(c,'История поисков');
    await c.visible(c.button('Открыть поиск'));
    await capture('history');
    await c.button('Открыть поиск').first().click();
    await c.text('Первая строка');
    await capture('historyDetail');
    await nav(c,'Списки доменов');
    await c.visible(c.page.locator('[data-list]').first());
    await capture('lists');
    await c.button('v2fly').click();
    await c.label('Найти категорию').fill('google');
    await c.button('google').click();
    await until(async()=>assert(await c.button('Создать список из категории').isEnabled()));
    await capture('v2fly');
    await nav(c,'Обслуживание');
    await c.text('Обновление Core');
    await capture('updates');
    for(const [tab,scene,heading] of [['Резервная копия','backup','Сохранённая копия'],['Вехи','milestones','Вехи результатов'],['Доступ','access','Доступ к Core']]){
      await c.button(tab).click();
      await c.text(heading);
      await c.page.evaluate(()=>scrollTo(0,0));
      await capture(scene);
    }
    await c.button('Выйти').click();
    await c.visible(c.button('Войти'));
    await c.page.evaluate(()=>scrollTo(0,0));
    await capture('login');
    await c.login();
    fs.writeFileSync(path.join(c.output,'frames.json'),JSON.stringify(frames,null,2));
  }
  assert.equal(Object.keys(frames).length,84);
},{prepare:s=>{s.categories[0].name='google';}});
