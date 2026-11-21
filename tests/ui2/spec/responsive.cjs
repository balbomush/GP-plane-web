const {add,assert,until,fs,path,params}=require('./common.cjs');

async function viewport(c,width,height){
  await c.page.setViewportSize({width,height});
}
async function nav(c,name){
  if(await c.button('Меню').isVisible())await c.button('Меню').click();
  await c.nav(name);
  await c.page.evaluate(()=>scrollTo(0,0));
}
async function onScreen(locator,height){
  const box=await locator.boundingBox();
  assert(box && box.y>=0 && box.y+box.height<=height+1,'Expected control inside viewport: '+JSON.stringify(box));
}
add('responsive-catalog-first','visual.catalog','First strategy and compact filters at 1366×768',async c=>{
  await viewport(c,1366,768);
  await nav(c,'Результаты');
  const strategy=c.page.locator('[data-strategy]').first();
  await c.visible(strategy);
  await onScreen(strategy,768);
  await onScreen(c.button('Фильтры'),768);
  assert(!(await c.label('Тип стратегии').isVisible()),'Additional filters initially collapsed');
  await c.button('Фильтры').click();
  await c.label('Тип стратегии').selectOption('multisplit');
  await c.button('Применить фильтры').click();
  await until(()=>assert.equal(c.call('listStrategies').at(-1).query.family,'multisplit'));
  await c.visible(c.button('Фильтры · 1'));
});
add('responsive-catalog-detail','visual.catalog results.08','Mobile strategy selection shows arguments and ZIP, Back restores filters, list position and focus',async c=>{
  await viewport(c,360,800);
  await nav(c,'Результаты');
  await c.label('Домены фильтра').fill('one.example');
  await c.label('Домены фильтра').press('Enter');
  await c.button('Применить фильтры').click();
  const row=c.page.locator('[data-strategy]').nth(10);
  await row.scrollIntoViewIfNeeded();
  const list=c.page.locator('.catalog-rows').first();
  const position=await list.evaluate(e=>e.scrollTop);
  assert(position>0);
  const scrollY=await c.page.evaluate(()=>window.scrollY);
  await row.click();
  await c.visible(c.page.locator('[data-selected-args]'));
  await onScreen(c.page.locator('[data-selected-args]'),800);
  await onScreen(c.button('Скачать ZIP стратегии'),800);
  const requests=c.call('listStrategies').length;
  await c.button('Назад к списку').click();
  await until(async()=>{
    assert(await row.evaluate(e=>document.activeElement===e));
    assert.equal(await list.evaluate(e=>e.scrollTop),position);
    assert.equal(await c.page.evaluate(()=>window.scrollY),scrollY);
  });
  assert.equal(c.call('listStrategies').length,requests);
  await c.visible(c.button('Убрать домен one.example'));
});
add('responsive-search-start','visual.search','Stock and GP keep launch near the domain input on a small screen and laptop',async c=>{
  for(const [width,height] of [[360,800],[1366,768]]){
    await viewport(c,width,height);
    for(const engine of ['blockcheck2','blockcheck2-gp']){
      await c.label('Движок').selectOption(engine);
      await c.label('Домены').fill('one.example\ntwo.example\nthree.example');
      await c.page.evaluate(()=>scrollTo(0,0));
      await onScreen(c.button('Начать поиск'),height);
      await c.visible(c.page.locator('.search-summary').getByText('3',{exact:true}));
    }
  }
});
add('responsive-history-detail','visual.history history.04','Run parameters use readable label/value pairs and mobile Back restores the selected row',async c=>{
  await viewport(c,2560,1080);
  await nav(c,'История поисков');
  const row=c.button('Открыть поиск').first();
  await row.click();
  const pair=c.page.locator('tr').filter({hasText:'QUIC'}).first();
  await c.visible(pair);
  const label=await pair.locator('th').boundingBox();
  const value=await pair.locator('td').boundingBox();
  assert(value.x-label.x<=340,'History labels have strayed from their values');
  await nav(c,'Поиск');
  await viewport(c,360,800);
  await nav(c,'История поисков');
  await row.click();
  await onScreen(c.button('Назад к списку'),800);
  await onScreen(c.button('Новый поиск'),800);
  await c.button('Назад к списку').click();
  await until(async()=>assert(await row.evaluate(e=>document.activeElement===e)));
});

if(process.env.GP_RESPONSIVE_MATRIX)add('responsive-matrix','visual.search visual.catalog visual.history visual.lists visual.service','Capture the same 17 states at 15 viewport sizes',async c=>{
  const sizes=[[1920,1080],[1536,864],[800,600],[1366,768],[1280,1200],[2560,1440],[1280,720],[2560,1080],[3440,1440],[360,800],[414,896],[768,1024],[1366,650],[1536,740],[1920,940]];
  const domains=Array.from({length:50},(_,i)=>'domain-'+String(i+1).padStart(2,'0')+'.example');
  const args='--payload=http_req --lua-desync='+('long_strategy_argument'.repeat(18));
  const evidence={};
  const baseline=process.env.GP_RESPONSIVE_MATRIX==='before';
  const bundles=c.state.bundles;
  const originalRun=c.state.runs[0];
  for(const [width,height] of sizes){
    await viewport(c,width,height);
    const scene=async(name,selectors={})=>{
      const key=name+'-'+width+'x'+height;
      const row={viewport:{width,height},scrollY:await c.page.evaluate(()=>scrollY),zoom:await c.page.evaluate(()=>devicePixelRatio)};
      for(const [metric,selector] of Object.entries(selectors))row[metric]=await c.page.locator(selector).first().boundingBox();
      evidence[key]=row;
      await c.page.screenshot({path:path.join(c.output,key+'.png')});
      assert.equal(row.zoom,1);
      row.overflow=await c.page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
      if(!baseline)assert(row.overflow<=1,key+' has horizontal document overflow');
    };
    await c.visible(c.label('Домены'));
    await c.page.evaluate(()=>scrollTo(0,0));
    const searchMetrics={launch:'.search-summary .primary',domains:'.search-domains'};
    await scene('search-gp',searchMetrics);
    await c.label('Движок').selectOption('blockcheck2');
    await scene('search-stock',searchMetrics);
    await c.label('Движок').selectOption('blockcheck2-gp');
    await c.label('Домены').fill('one.example\ntwo.example\nthree.example');
    await c.page.evaluate(()=>scrollTo(0,0));
    await scene('search-filled',searchMetrics);
    await c.label('Домены').fill(domains.join('\n'));
    await c.button('Начать поиск').click();
    await c.visible(c.button('Остановить поиск'));
    c.state.current.run.status='running';
    c.state.current.run.progress={checked:120,total:500,current_args:args};
    await c.event();
    await c.text(args);
    await c.text(domains.at(-1));
    await c.page.evaluate(()=>scrollTo(0,0));
    await scene('running-demo',{stop:'.current-header .danger',args:'.current-strategy pre',domains:'.current-domains',log:'.current-journal'});
    await c.button('Остановить поиск').click();
    await c.visible(c.button('Новый поиск'));
    await c.page.evaluate(()=>scrollTo(0,0));
    await scene('stopped-demo',{newSearch:'.current-header .primary',args:'.current-strategy pre',log:'.current-journal'});
    await c.button('Новый поиск').click();
    await nav(c,'Результаты');
    if(await c.button('Стратегии').getAttribute('aria-pressed')!=='true')await c.button('Стратегии').click();
    await c.page.locator('[data-strategy]').first().click();
    await c.visible(c.button('Скачать ZIP стратегии'));
    await scene('catalog',{first:'[data-strategy]',args:'[data-selected-args]',zip:'.catalog-detail-actions .primary'});
    c.state.bundles=[];
    await c.button('Комплекты').click();
    await c.text('Ничего не найдено');
    await c.page.evaluate(()=>scrollTo(0,0));
    if(!baseline)assert.equal(await c.page.getByText('Нет выбранного комплекта',{exact:true}).count(),0);
    await scene('bundles');
    await c.button('Стратегии').click();
    c.state.bundles=bundles;
    await c.button('Комплекты').click();
    await c.page.locator('[data-bundle]').first().click();
    await c.visible(c.button('Скачать ZIP комплекта'));
    await scene('bundle-demo');
    if(await c.button('Назад к списку').isVisible()){
      await c.button('Назад к списку').click();
      await c.visible(c.page.locator('[data-bundle]').first());
    }
    c.state.runs=[originalRun];
    await nav(c,'История поисков');
    await c.button('Открыть поиск').first().click();
    await c.text('Фактические параметры');
    await scene('history',{params:'.table',detail:'.catalog-layout > section:last-child'});
    await nav(c,'Списки доменов');
    await c.visible(c.page.locator('[data-list]').first());
    await scene('lists',{search:'.domain-list-filters input'});
    await c.button('Новый список').click();
    await c.label('Название списка').fill('Тестовый список');
    await c.label('Домены списка').fill('one.example\ntwo.example\nthree.example');
    await c.page.evaluate(()=>scrollTo(0,0));
    await scene('list-editor',{name:'input:near(:text("Название списка"))',editor:'textarea'});
    await c.button('Отмена').click();
    await c.button('v2fly').click();
    await c.label('Найти категорию').fill('google');
    await c.button('google').click();
    const listButton=c.button('Создать список из категории');
    await until(async()=>assert(await listButton.isEnabled()));
    if(!baseline && width>=1366){
      const box=await listButton.boundingBox();
      assert(box.width<350);
      const entries=c.page.locator('.category-domains > p');
      const [first,second]=await Promise.all([entries.first().boundingBox(),entries.nth(1).boundingBox()]);
      assert(second.x>first.x,'Category domains should use more than one column');
    }
    await c.page.evaluate(()=>scrollTo(0,0));
    await scene('v2fly',{domains:'.domain-lists-layout .scroll-domains'});
    await nav(c,'Обслуживание');
    await c.text('Обновление Core');
    await scene('updates');
    for(const [tab,name,heading] of [['Резервная копия','backup','Сохранённая копия'],['Вехи','milestones','Вехи результатов'],['Доступ','access','Доступ к Core']]){
      await c.button(tab).click();
      await c.text(heading);
      await c.page.evaluate(()=>scrollTo(0,0));
      await scene(name);
    }
    await c.button('Выйти').click();
    await c.visible(c.button('Войти'));
    await c.page.evaluate(()=>scrollTo(0,0));
    await scene('login',{form:'.login-card'});
    await c.login();
    fs.writeFileSync(path.join(c.output,'measurements.json'),JSON.stringify(evidence,null,2));
    console.log('Responsive frames complete:',width+'x'+height);
  }
  assert.equal(Object.keys(evidence).length,255);
},{prepare:state=>{
  state.categories[0].name='google';
  state.runs[0].parameters={...params};
  state.runs[0].domains=['one.example','two.example','three.example'];
}});
