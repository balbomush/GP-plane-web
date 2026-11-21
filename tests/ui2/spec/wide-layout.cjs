const {add,assert,fs,path,until}=require('./common.cjs');
const domains=Array.from({length:50},(_,index)=>'domain-'+String(index+1).padStart(2,'0')+'.example');
const longArguments='--payload=http_req --lua-desync='+('long_strategy_argument'.repeat(18));

add('wide-layout','visual.search visual.catalog running.08','Wide layout matches the approved workspace and keeps long runs usable',async c=>{
  const referencePath=process.env.GP_APPROVED_PREVIEW;
  const reference=referencePath?await c.context.newPage():null;
  const metrics={};
  const box=async (page,selector)=> {
    const bounds=await page.locator(selector).first().boundingBox();
    assert(bounds,'Expected visible layout element '+selector);
    const {x,y,width,height}=bounds;
    return {x,y,width,height};
  };
  const snap=async (page,name,fullPage=false)=>page.screenshot({path:path.join(c.output,name+'.png'),fullPage});
  if(reference){
    try {
      await reference.setViewportSize({width:1920,height:1080});
      await reference.route('**/approved-preview.html',route=>route.fulfill({path:referencePath,contentType:'text/html'}));
      await reference.goto(c.url+'/approved-preview.html');
      const layout=reference.frameLocator('#codex-visualization');
      await layout.locator('#demo-shell').selectOption('web');
      await layout.locator('#review-mode').selectOption('current');
      await layout.locator('#demo-theme').selectOption('dark');
      for(const [name,scene,selector] of [['search','idle','.launch-grid'],['running','running','.run-overview'],['stopped','stopped','.run-overview'],['results','complete','.result-workbench']]){
        await layout.locator('#demo-scene').selectOption(scene);
        if(name==='results'){
          await layout.locator('.plane-nav button[data-view=results]').click();
          await layout.locator('.api-results-list button').first().click();
        }
        await layout.locator(selector).waitFor();
        metrics['reference-'+name]={
          shell:await layout.locator('.product').boundingBox(),
          heading:await layout.locator('.page-heading').first().boundingBox(),
          columns:await layout.locator(selector).boundingBox()
        };
        await snap(reference,'reference-'+name);
      }
      for(const [view,name] of [['history','history'],['lists','lists'],['service','service']]){
        await layout.locator('.plane-nav button[data-view='+view+']').click();
        await layout.locator('.page-heading h1').first().waitFor();
        await layout.locator('.page-heading h1').first().evaluate(el=>el.ownerDocument.defaultView.scrollTo(0,0));
        await reference.evaluate(()=>scrollTo(0,0));
        await snap(reference,'reference-'+name);
      }
    } finally {await reference.close();}
  }
  const failures=[];
  const journalRows = Array.from({length: 50}, (_, i) => ({
    position: 'p'+(i+1), time: null, level: 'info',
    message: 'Строка длинного журнала '+(i+1)+' '+longArguments,
  }));
  c.state.faults.readRunLog=(_,url)=>{
    const after=Number(url.searchParams.get('after')?.slice(1)||0);
    return {data:{entries:journalRows.slice(after),next_after:journalRows.at(-1).position,truncated:false}};
  };
  await c.button('Выйти').click();
  for(const [width,height] of [[1920,1080],[2560,1080],[3440,1440],[360,1080]]){
    await c.page.setViewportSize({width,height});
    const card=await box(c.page,'.login-card');
    const login=await box(c.page,'.login-card input');
    metrics[width+'-login']={card,login};
    if(card.width>420||card.x<0||card.x+card.width>width)failures.push('Login card should fit within a compact centered column at '+width);
  }
  await c.login();
  for(const [width,height] of [[1920,1080],[2560,1080],[3440,1440],[1120,1080],[360,1080]]){
    const page=c.page;
    await page.setViewportSize({width,height});
    async function nav(name){
      if(width===360)await c.button('Меню').click();
      await c.nav(name);
    }
    const measure=async(name,selectors)=>{
      const row={shell:await box(page,'.shell-layout'),heading:await box(page,'main h1:visible, .catalog-detail h2:visible'),viewport:page.viewportSize(),zoom:await page.evaluate(()=>devicePixelRatio)};
      for(const [key,selector] of Object.entries(selectors))row[key]=await box(page,selector);
      metrics[width+'-'+name]=row;
      await snap(page,width+'-'+name);
      return row;
    };
    await page.evaluate(()=>scrollTo(0,0));
    await c.label('Домены').fill('youtube.com\ngooglevideo.com\nytimg.com');
    const search=await measure('search',{header:'.app-header',form:'.search-layout > section',summary:'.search-summary',number:'.engine-settings input[type=number]',mode:'[aria-label="Уровень сканирования"]',start:'.search-summary button.primary',...(width>800?{menu:'.shell-layout > aside'}:{})});
    await c.label('Домены').fill(domains.join('\n'));
    await c.button('Начать поиск').click();
    await c.visible(c.button('Остановить поиск'));
    c.state.current.run.status='running';
    c.state.current.run.progress={checked:120,total:500,current_args:longArguments};
    await c.event();
    await c.text(longArguments);
    await c.text(domains.at(-1));
    await c.text(journalRows.at(-1).message);
    const running=await measure('running',{grid:'.current-overview',main:'.current-main',args:'.current-layout pre',side:'.current-domains',domains:'.scroll-domains',log:'details:has(.log-lines)',
      badge:'.current-main .badge',stop:'button[aria-label="Остановить поиск"]',progress:'progress'});
    const stopGap=running.stop.x-running.badge.x-running.badge.width;
    if(stopGap>220)failures.push('Status and Stop are '+stopGap+'px apart at '+width);
    if(Math.abs(running.stop.y-running.progress.y)>115)failures.push('Progress is away from Stop at '+width);
    const logScroll=await page.locator('.current-journal .log-lines').evaluate(el=>({height:el.clientHeight,content:el.scrollHeight}));
    if(logScroll.height>=logScroll.content)failures.push('Expected independent journal scrolling at '+width);
    const scroll=await page.locator('.scroll-domains').evaluate(el=>({height:el.clientHeight,content:el.scrollHeight}));
    await c.button('Остановить поиск').click();
    await c.visible(c.button('Новый поиск'));
    await c.text('Последняя показанная стратегия');
    await c.text(longArguments);
    const stopped=await measure('stopped',{grid:'.current-overview, .current-layout:not(:has(.current-overview))',log:'details:has(.log-lines)',newSearch:'.current-main button.primary',summary:'.current-main h2'});
    if(Math.abs(stopped.newSearch.y-stopped.summary.y)>95)failures.push('New Search is away from the stopped summary at '+width);
    if(width===3440 && !(await page.locator('.current-main').innerText()).includes('разделе «Результаты»')){
      failures.push('Stopped summary should explain where to find saved results');
    }
    if(width===3440 && await page.locator('.current-main').getByText('Остановлен',{exact:true}).count()){
      failures.push('Stopped summary must not repeat the page status badge');
    }
    await nav('Результаты');
    await page.locator('[data-strategy]').first().click();
    await c.visible(c.button('Скачать ZIP стратегии'));
    await page.evaluate(()=>scrollTo(0,0));
    const results=await measure('results',{...(width===360?{}:{list:'.catalog-layout > section:first-child',apply:'[data-catalog-apply]'}),details:'.catalog-layout > section:last-child',copy:'button:has-text("Копировать аргументы")',zip:'button:has-text("Скачать ZIP стратегии")'});
    if(width>=1920){
      if(Math.abs(search.shell.width-width)>1||Math.abs(search.header.width-width)>1||Math.abs(search.menu.x)>1)failures.push('Header and workspace must span the viewport with the menu at the left edge at '+width);
      if(search.form.width>640||search.summary.width!==245)failures.push('Search form and summary exceed reference proportions');
      if(Math.abs(search.summary.y-search.form.y)>1)failures.push('Search summary must start alongside the form');
      if(running.args.x>=running.domains.x)failures.push('Arguments must be in the main card, before domains');
      if(Math.abs(running.main.height-running.side.height)>1)failures.push('Domain and overview card heights must agree');
      if(running.log.y<running.grid.y+running.grid.height-1)failures.push('Run log must follow the overview');
      const header=await box(page,'.app-header');
      if(stopped.heading.y-header.y-header.height>75)failures.push('Stopped heading has excessive space above it');
      if(results.details.width<=results.list.width)failures.push('Details must be wider than results list');
      if(results.apply.x+results.apply.width>results.details.x+results.details.width+1||results.apply.width>180)failures.push('Apply must be compact and aligned with the catalog');
      if(Math.abs(results.copy.y-results.zip.y)>2||results.copy.x+results.copy.width>results.zip.x)failures.push('Copy and ZIP share the action row beneath arguments');
    }
    if(width>800)for(const row of [search,running,stopped,results])assert.equal(row.zoom,1);
    if(scroll.height>=scroll.content)failures.push('Expected independent 50-domain scrolling at '+width);
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))failures.push('Document overflow at '+width);
    if(width===1920){
      await c.button('Скачать ZIP стратегии').scrollIntoViewIfNeeded();
      await snap(page,'1920-results-actions');
    }
    for(const [name,id] of [['История поисков','history'],['Списки доменов','lists'],['Обслуживание','service']]){
      await nav(name);
      await c.visible(page.getByRole('heading',{name,exact:true}));
      if(id==='history'){
        await c.button('Открыть поиск').first().click();
        await c.text('Фактические параметры');
      }
      if(id==='lists'){
        await page.locator('[data-list]').first().click();
        await c.visible(c.button('Использовать в поиске'));
      }
      await page.evaluate(()=>scrollTo(0,0));
      await snap(page,width+'-'+id);
      if(id==='service')metrics[width+'-service']={stage:await box(page,'[aria-label="Стадия"]')};
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))failures.push(id+' overflows at '+width);
    }
    await nav('Поиск');
    await c.button('Новый поиск').click();
    await c.visible(c.label('Домены'));
  }
  for(const [width,previous] of [[2560,1920],[3440,2560]]){
    const growth=(scene,field)=>metrics[width+'-'+scene][field].width-metrics[previous+'-'+scene][field].width;
    const availableGrowth=width===2560?96:0;
    for(const field of ['args','log'])if(Math.abs(growth('running',field)-availableGrowth)>2)failures.push(field+' did not follow the capped workspace at '+width);
    for(const field of ['list','details'])if(growth('results',field)<availableGrowth/3-2)failures.push(field+' did not gain usable width at '+width);
    for(const [scene,fields] of [['search',['number','mode','start']],['results',['apply','copy','zip']],['login',['card','login']],['service',['stage']]]) {
      for(const field of fields)if(Math.abs(growth(scene,field))>2)failures.push(field+' changed size at '+width);
    }
  }
  fs.writeFileSync(path.join(c.output,'geometry.json'),JSON.stringify(metrics,null,2));
  assert.deepEqual(failures,[]);
});

add('log-scroll','running.06 history.07','Jump to the last displayed line and retain reading position when live entries arrive',async c=>{
  const entries=count=>Array.from({length:count},(_,i)=>({position:'p'+(i+1),time:null,level:'info',message:'Строка журнала '+(i+1)}));
  let rows=entries(50);
  c.state.faults.readRunLog=(_,url)=>{
    const after=Number(url.searchParams.get('after')?.slice(1)||0);
    return {data:{entries:rows.slice(after),next_after:rows.at(-1).position,truncated:false}};
  };
  await c.label('Домены').fill('one.example');
  await c.button('Начать поиск').click();
  const log=c.page.getByLabel('Журнал поиска',{exact:true});
  await log.getByText('Строка журнала 50',{exact:true}).waitFor();
  const offset=()=>log.evaluate(el=>el.scrollTop);
  const distanceToEnd=()=>log.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop);
  await log.evaluate(el=>{el.scrollTop=40;});
  assert(await distanceToEnd()>100);
  rows=entries(60);
  c.state.current.run.progress.checked++;
  await c.event();
  await log.getByText('Строка журнала 60',{exact:true}).waitFor();
  assert.equal(await offset(),40,'New lines preserve the reading position');
  const jump=c.button('К последним строкам');
  await jump.scrollIntoViewIfNeeded();
  const pageOffset=await c.page.evaluate(()=>scrollY);
  await jump.click();
  await until(async()=>assert(await distanceToEnd()<=1));
  assert.equal(await c.page.evaluate(()=>scrollY),pageOffset,'Only the log scrolls');
});

add('consumer-width','package.consumer visual.catalog visual.history visual.lists','Shared sections use host width at a desktop viewport',async c=>{
  await c.button('Выйти').click();
  await c.page.setViewportSize({width:1920,height:1080});
  await c.page.goto(c.url+'/consumer/');
  await c.text('Независимая оболочка');
  const host=c.page.locator('body');
  await host.evaluate(el=>{el.style.width='360px';});
  for(const name of ['strategies','bundles','history','lists']){
    await c.button(name).click();
    const layout=c.page.locator('.catalog-layout').first();
    const sections=layout.locator(':scope > section');
    await c.visible(sections.first());
    if(name==='lists'){
      const [left,right]=await Promise.all([sections.first().boundingBox(),sections.last().boundingBox()]);
      assert(right.y>=left.y+left.height-2,name+' stacks at host width 360');
    }else{
      assert(!(await sections.last().isVisible()),name+' starts in the list');
      const row=sections.first().getByRole('button').first();
      await row.click();
      await c.visible(c.button('Назад к списку'));
      assert(!(await sections.first().isVisible()));
      await c.button('Назад к списку').click();
      await c.visible(row);
    }
    assert(await layout.evaluate(el=>el.scrollWidth<=el.clientWidth),name+' fits its host');
  }
  await c.button('search').click();
  await c.button('Начать поиск').click();
  const stop=c.button('Остановить поиск');
  await c.visible(stop);
  const main=c.page.locator('.current-main');
  const domains=c.page.locator('.current-domains');
  const group={};
  await host.evaluate(el=>el.style.removeProperty('width'));
  const sharedHost=c.page.locator('body > #app > section');
  for(const width of [760,761]){
    await sharedHost.evaluate((el,value)=>el.style.width=value+'px',width);
    const [summary,side,badge,action]=await Promise.all([
      main.boundingBox(),domains.boundingBox(),main.locator('.badge').boundingBox(),stop.boundingBox()
    ]);
    const layoutWidth=await main.evaluate(el=>el.closest('.gp-scope').getBoundingClientRect().width);
    assert.equal(layoutWidth,width);
    group[width]={summary,side,badge,action};
    if(width===760)assert(side.y>=summary.y+summary.height,'Domains follow the overview at container width 760');
    else {
      assert(side.x>=summary.x+summary.width,'Domains sit beside the overview at container width 761');
      assert(Math.abs(side.y-summary.y)<=1,'Both panels align at the top');
    }
    assert(action.x-badge.x-badge.width<=220,'Stop remains near the status in the consumer');
    assert(await main.evaluate(el=>el.scrollWidth<=el.clientWidth),'Run controls stay inside the summary');
    await c.page.screenshot({path:path.join(c.output,'consumer-run-'+width+'.png')});
  }
  fs.writeFileSync(path.join(c.output,'consumer-run-geometry.json'),JSON.stringify(group,null,2));
});
