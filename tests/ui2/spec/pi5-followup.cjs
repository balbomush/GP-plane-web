const {add,assert,until,params,getError}=require('./common.cjs');

const streamDown='Core подключён · трансляция поиска недоступна';
const streams=(c)=>c.call('watchCurrentSearch');
const failStream=(state)=>state.faults.watchCurrentSearch={
  status:503,data:getError('stream_capacity_exhausted','No free subscription slot')
};
const visibleInViewport=async(locator,height)=>{
  const box=await locator.boundingBox();
  assert(box && box.y>=0 && box.y+box.height<=height+1,'Not fully inside viewport: '+JSON.stringify(box));
};
async function nav(c,name){
  if(await c.button('Меню').isVisible())await c.button('Меню').click();
  await c.nav(name);
  await c.page.evaluate(()=>scrollTo(0,0));
}
const connect=async c=>until(()=>assert.equal(c.state.streams.size,1));
const header=c=>c.page.locator('.app-header');
add('followup-connection','running.10 shell.02 results.10','API available with 503 stream; ZIP, read state reconciliation and slot release',async c=>{
  await until(()=>assert.equal(streams(c).at(-1)?.status,503));
  await c.visible(header(c).getByText(streamDown,{exact:true}));
  assert.equal(c.call('getCoreStatus').at(-1).status,200);
  assert.equal(c.call('getCurrentSearch').at(-1).status,200);
  await nav(c,'Результаты');
  await c.page.locator('[data-strategy]').first().click();
  const saved=c.page.waitForEvent('download');
  await c.button('Скачать ZIP стратегии').click();
  assert.match((await saved).suggestedFilename(),/^strategy-.*\.zip$/);
  await nav(c,'Обслуживание');
  c.fault('getCoreStatus',503,'storage_unavailable','Статус временно недоступен');
  await c.button('Проверить состояние Core').click();
  await c.visible(header(c).getByText(/Статус Core недоступен/));
  delete c.state.faults.getCoreStatus;
  delete c.state.faults.watchCurrentSearch;
  const refreshes=c.call('getCurrentSearch').length;
  await connect(c);
  await c.visible(header(c).getByText('Core подключён',{exact:true}));
  await until(()=>assert(c.call('getCurrentSearch').length>refreshes));
  const initial=streams(c).length;
  await nav(c,'История поисков');
  await nav(c,'Результаты');
  assert.equal(streams(c).length,initial);
  await c.button('Выйти').click();
  await until(()=>assert.equal(c.state.streams.size,0));
  await c.login();
  await connect(c);
  await c.page.goto('about:blank');
  await until(()=>assert.equal(c.state.streams.size,0));
},{prepare:failStream});

add('followup-api-only-recovery','running.10 shell.02','Fallback restores ordinary API state while the event stream still returns 503',async c=>{
  await c.page.clock.install();
  await c.login();
  await c.visible(header(c).getByText(streamDown,{exact:true}));
  await nav(c,'Обслуживание');
  c.fault('getCoreStatus',503,'storage_unavailable','Статус временно недоступен');
  await c.button('Проверить состояние Core').click();
  await c.visible(header(c).getByText(/Статус Core недоступен/));
  delete c.state.faults.getCoreStatus;
  const refreshes=c.call('getCurrentSearch').length;
  await c.page.clock.fastForward(31_000);
  await c.visible(header(c).getByText(streamDown,{exact:true}));
  assert(c.call('getCurrentSearch').length>refreshes);
  assert.equal(streams(c).at(-1)?.status,503);
  assert.equal(c.state.streams.size,0);
},{prepare:failStream,anonymous:true});

add('followup-mobile-search','visual.search running.10','Mobile launch fully visible on Stock and GP with and without SSE',async c=>{
  await until(()=>assert.equal(streams(c).at(-1)?.status,503));
  async function checkForm(){
    for(const [width,height] of [[360,800],[414,896]]){
      await c.page.setViewportSize({width,height});
      for(const engine of ['blockcheck2','blockcheck2-gp']){
        await c.label('Движок').selectOption(engine);
        await c.label('Домены').fill('one.example\ntwo.example\nthree.example');
        await c.page.evaluate(()=>scrollTo(0,0));
        await visibleInViewport(c.button('Начать поиск'),height);
        assert(await c.button('Начать поиск').isEnabled());
      }
    }
  }
  await checkForm();
  await c.visible(header(c).getByText(streamDown,{exact:true}));
  delete c.state.faults.watchCurrentSearch;
  await connect(c);
  await c.visible(header(c).getByText('Core подключён',{exact:true}));
  await checkForm();
},{prepare:failStream});

const domains=Array.from({length:606},(_,i)=>'google-'+i+'.example');
add('followup-category','visual.lists lists.12','Mobile v2fly opens details, restores their origin and drafts all 606 domains',async c=>{
  await c.page.setViewportSize({width:360,height:800});
  await nav(c,'Списки доменов');
  await c.button('v2fly').click();
  const filter=c.label('Найти категорию');
  await filter.fill('google');
  const row=c.button('google');
  await row.scrollIntoViewIfNeeded();
  const y=await c.page.evaluate(()=>scrollY);
  await row.click();
  const create=c.button('Создать список из категории');
  await until(async()=>assert(await create.isEnabled()));
  await visibleInViewport(c.page.getByRole('heading',{name:'google',exact:true}),800);
  await visibleInViewport(create,800);
  await visibleInViewport(c.page.getByText(domains[0],{exact:true}),800);
  await c.button('Назад к списку').click();
  assert.equal(await filter.inputValue(),'google');
  assert.equal(await c.page.evaluate(()=>scrollY),y);
  assert.equal(await row.getAttribute('aria-pressed'),'true');
  assert(await row.evaluate(el=>el===document.activeElement));
  await row.click();
  await create.click();
  assert.deepEqual((await c.label('Домены списка').inputValue()).split('\n'),domains);
  await c.button('Отмена').click();
  await c.visible(create);
  await c.button('Назад к списку').click();
  assert.equal(await filter.inputValue(),'google');
},{prepare:state=>{
  state.categories[0].name='google';
  state.faults.listCategoryDomains=(_,url)=>{
    const offset=Number(url.searchParams.get('offset'));
    const limit=Number(url.searchParams.get('limit'));
    return {data:{items:domains.slice(offset,offset+limit),offset,limit,total:domains.length}};
  };
}});

add('followup-history','visual.history history.04','Wide history displays parameters, domains and the log together; mobile return intact',async c=>{
  await c.page.setViewportSize({width:2560,height:1080});
  await nav(c,'История поисков');
  for(const [i,width,height] of [[0,2560,1080],[1,3440,1440]]){
    await c.page.setViewportSize({width,height});
    await c.button('Открыть поиск').nth(i).click();
    const parameters=c.page.getByRole('heading',{name:'Фактические параметры'});
    const domain=c.page.getByText('run-domain-0.example',{exact:true});
    const log=c.page.getByText('Первая строка',{exact:true});
    for(const field of [parameters,domain,log])await visibleInViewport(field,height);
    const [left,right]=await Promise.all([parameters.boundingBox(),log.boundingBox()]);
    assert(right.x>left.x+200,'Log should use the right-hand space');
    assert.equal(await c.button('Продолжить поиск').isVisible(),i===1);
  }
  await nav(c,'Поиск');
  await c.page.setViewportSize({width:360,height:800});
  await nav(c,'История поисков');
  const row=c.button('Открыть поиск').first();
  await row.click();
  await c.button('Назад к списку').click();
  assert(await row.evaluate(el=>el===document.activeElement));
},{prepare:state=>{
  const original={...state.runs[0],parameters:{...params},domains:Array.from({length:50},(_,i)=>'run-domain-'+i+'.example')};
  state.runs=[{...original,engine:{id:2,code:'blockcheck2',name:'Stock'},resume_available:false},{...original,id:'r-gp',resume_available:true}];
}});

add('followup-catalog','visual.catalog results.10','Wide actions near heading work on the second selected strategy',async c=>{
  await c.page.setViewportSize({width:3440,height:1440});
  await nav(c,'Результаты');
  const rows=c.page.locator('[data-strategy]');
  await rows.first().click();
  await c.visible(c.page.locator('[data-selected-args]'));
  const next=rows.nth(1);
  const id=await next.getAttribute('data-strategy');
  await next.click();
  const args=c.page.locator('[data-selected-args]');
  await c.visible(args);
  const title=c.page.locator('.catalog-detail h2');
  const copy=c.button('Копировать аргументы');
  const zip=c.button('Скачать ZIP стратегии');
  const [a,b,d]=await Promise.all([title.boundingBox(),copy.boundingBox(),zip.boundingBox()]);
  assert(b.x-(a.x+a.width)<45 && d.x-(b.x+b.width)<20,'Actions should stay with the strategy title');
  await copy.click();
  assert.equal(await c.page.evaluate(()=>navigator.clipboard.readText()),await args.innerText());
  const saved=c.page.waitForEvent('download');
  await zip.click();
  assert.equal((await saved).suggestedFilename(),'strategy-'+id+'.zip');
  assert(c.call('downloadStrategy').at(-1).path.includes('/'+id+'/'));
});
