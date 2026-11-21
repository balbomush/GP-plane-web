const {add,assert,until,fs,path}=require('./common.cjs');
const dataAlignment='main .section-heading h1, .results-tabs, .catalog-filters, .history-filters, .domain-list-filters';
const sizes=[[320,800],[360,800],[768,1024],[1366,768],[1920,1080],[2560,1080],[3440,1440]];

add('whole-page-centering','visual.search visual.catalog visual.history visual.lists visual.service',
  'Forms and data screens use their centered working widths across viewports',async c=>{
    const frames={};
    const failures=[];
    const open=async name=>{
      if(await c.button('Меню').isVisible())await c.button('Меню').click();
      await c.nav(name);
      await c.page.evaluate(()=>scrollTo(0,0));
    };
    async function capture(name,selector,mode='wide',heading){
      const entry=c.page.locator(selector).first();
      await c.visible(entry);
      const key=name+'-'+c.page.viewportSize().width+'x'+c.page.viewportSize().height;
      const row=await entry.evaluate((el,head)=>{
        const main=el.closest('main')||document.querySelector('main');
        const rect=el.getBoundingClientRect(), area=main.getBoundingClientRect();
        const sidebar=document.querySelector('.shell-layout > aside')?.getBoundingClientRect();
        const right=Math.min(area.right,document.documentElement.clientWidth);
        const aligned=head?[...main.querySelectorAll(head)].filter(node=>node.getClientRects().length):[];
        const alignment=aligned.map(node=>({element:node.className||node.tagName,offset:node.getBoundingClientRect().left-rect.left}));
        const left=area.left;
        return {workspace:[left,right],left:rect.left-left,right:right-rect.right,
          width:rect.width,top:rect.top,alignment,
          available: right - left - parseFloat(getComputedStyle(main).paddingLeft) - parseFloat(getComputedStyle(main).paddingRight),
          theme:document.querySelector('.gp-shell').dataset.theme,
          sidebarEdge:innerWidth>800?sidebar?.right??null:null,
          overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,zoom:devicePixelRatio};
      },heading);
      frames[key]=row;
      if(process.env.GP_CENTERING_IMAGES)await c.page.screenshot({path:path.join(c.output,key+'.png')});
      if(mode==='inspect')return;
      if(row.sidebarEdge!==null&&Math.abs(row.sidebarEdge-row.workspace[0])>1)failures.push(key+' workspace starts away from the sidebar');
      if(Math.abs(row.left-row.right)>1)failures.push(key+' margins '+row.left+'/'+row.right);
      const targetWidth=Math.min(1760,row.available);
      if(mode==='wide'&&Math.abs(row.width-targetWidth)>1)failures.push(key+' data width '+row.width+' / '+targetWidth);
      if(mode==='service'&&c.page.viewportSize().width===360&&row.top>365)failures.push(key+' first form starts at '+row.top);
      for(const {element,offset} of row.alignment){
        if(Math.abs(offset)>1)failures.push(key+' '+element+' shifts '+offset+'px from the working block');
      }
      if(row.overflow>0||row.zoom!==1)failures.push(key+' overflow or zoom');
    }
    for(const [width,height] of sizes){
      await c.page.setViewportSize({width,height});
      const theme=[320,768,2560].includes(width)?'light':'dark';
      if(await c.page.locator('.gp-shell').getAttribute('data-theme')!==theme)await c.button('Тема').click();
      await open('Поиск');
      await c.label('Домены').fill('one.example\ntwo.example\nthree.example');
      await c.page.evaluate(()=>scrollTo(0,0));
      await capture('search-gp','.search-layout','form','main h1');
      if(width===360){
        const start=await c.button('Начать поиск').boundingBox();
        if(!start||start.y+start.height>800)failures.push('360px launch goes below the first screen');
      }
      await c.page.locator('.fine-settings summary').click();
      await c.page.locator('.launch-details summary').click();
      await c.page.evaluate(()=>scrollTo(0,0));
      await capture('search-parameters','.search-layout','form','main h1');
      await c.label('Движок').selectOption('blockcheck2');
      await c.page.evaluate(()=>scrollTo(0,0));
      await capture('search-stock','.search-layout','form','main h1');
      await c.button('Начать поиск').click();
      await c.visible(c.button('Остановить поиск'));
      await c.text('Первая строка');
      await c.page.evaluate(()=>scrollTo(0,0));
      await capture('running','.current-layout','wide',dataAlignment);
      await c.page.locator('.current-journal .log-lines').scrollIntoViewIfNeeded();
      await capture('journal','.current-journal', 'inspect');
      await c.button('Остановить поиск').click();
      await c.visible(c.button('Новый поиск'));
      await c.page.evaluate(()=>scrollTo(0,0));
      await capture('stopped','.current-layout','wide',dataAlignment);
      await c.button('Новый поиск').click();
      await open('Результаты');
      if(await c.button('Стратегии').getAttribute('aria-pressed')!=='true')await c.button('Стратегии').click();
      await c.visible(c.page.locator('[data-strategy]').first());
      await capture('catalog','.catalog-screen','wide',dataAlignment);
      await c.openCatalogFilters();
      await capture('catalog-filters','.catalog-screen','wide',dataAlignment);
      await c.page.locator('[data-strategy]').first().click();
      await c.visible(c.page.locator('[data-selected-args]'));
      await capture('strategy','.catalog-screen','wide',dataAlignment);
      if(await c.button('Назад к списку').isVisible()){
        await c.button('Назад к списку').click();
        assert(await c.page.locator('[data-strategy]').first().evaluate(el=>el===document.activeElement));
      }
      await c.button('Комплекты').click();
      await c.visible(c.page.locator('[data-bundle]').first());
      await capture('bundles','.catalog-screen','wide',dataAlignment);
      await c.page.locator('[data-bundle]').first().click();
      await c.visible(c.button('Скачать ZIP комплекта'));
      await capture('bundle','.catalog-screen','wide',dataAlignment);
      await open('История поисков');
      await c.visible(c.button('Открыть поиск'));
      await capture('history','.history-layout','wide',dataAlignment);
      await c.button('Открыть поиск').first().click();
      await c.text('Фактические параметры');
      await capture('run','.history-layout','wide',dataAlignment);
      await open('Списки доменов');
      await c.visible(c.page.locator('[data-list]').first());
      await capture('lists','.domain-lists-layout','wide',dataAlignment);
      await c.page.locator('[data-list]').first().click();
      await until(async()=>assert(await c.button('Создать копию списка').isEnabled()));
      await capture('list','.domain-lists-layout','wide',dataAlignment);
      await c.button('Создать копию списка').click();
      await c.visible(c.label('Название списка'));
      await c.page.evaluate(()=>scrollTo(0,0));
      await capture('editor-copy','.list-editor','form','main h1');
      await c.button('Отмена').click();
      await c.button('Новый список').click();
      await c.label('Название списка').fill('Черновик списка');
      await c.label('Домены списка').fill('example.org');
      await c.page.evaluate(()=>scrollTo(0,0));
      await capture('editor-new','.list-editor','form','main h1');
      await c.button('Отмена').click();
      await c.button('v2fly').click();
      await c.label('Найти категорию').fill('google');
      await c.visible(c.button('google'));
      await capture('v2fly','.source-panel','wide',dataAlignment);
      await c.button('google').click();
      await until(async()=>assert(await c.button('Создать список из категории').isEnabled()));
      await capture('category','.source-panel','wide',dataAlignment);
      await open('Обслуживание');
      await c.text('Обновление Core');
      await capture('updates','.service-layout','service','main h1');
      for(const [tab,name,heading] of [['Резервная копия','backup','Сохранённая копия'],['Вехи','milestones','Вехи результатов'],['Доступ','access','Доступ к Core']]){
        await c.button(tab).click();
        await c.text(heading);
        await c.page.evaluate(()=>scrollTo(0,0));
        await capture(name,name==='access'?'.service-access':'.service-layout','service','main h1');
      }
      if(width<=800){
        await c.button('Меню').click();
        await capture('menu','.shell-layout > aside','inspect');
        await c.button('Меню').click();
      }
      await c.button('Выйти').click();
      await c.visible(c.button('Войти'));
      await c.page.evaluate(()=>scrollTo(0,0));
      await capture('login','.login-card','form');
      await c.login();
      fs.writeFileSync(path.join(c.output,'frames.json'),JSON.stringify(frames,null,2));
    }
    await c.page.setViewportSize({width:360,height:800});
    await open('Обслуживание');
    const longVersion='0.5.0-'+('synthetic'.repeat(13));
    c.state.status.core_version=longVersion;
    const refresh=c.button('Проверить состояние Core');
    await refresh.click();
    const serviceStatus=c.page.locator('.service-health p');
    await serviceStatus.filter({hasText:longVersion}).waitFor();
    await c.button('Выйти').focus();
    await c.page.keyboard.press('Tab');
    assert(await refresh.evaluate(el=>el===document.activeElement&&el.matches(':focus-visible')));
    const longHeader=await serviceStatus.evaluate(el=>{
      const text=el.getBoundingClientRect();
      const control=el.nextElementSibling.getBoundingClientRect();
      return {text:text.toJSON(),control:control.toJSON(),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
    });
    assert(longHeader.text.height>40,'Long Core status should wrap');
    assert(longHeader.text.right<=longHeader.control.left||longHeader.text.bottom<=longHeader.control.top,'Core status should leave the action clear');
    assert.equal(longHeader.overflow,0,'Long Core status should stay within the viewport');
    await capture('service-long-status','.service-health','inspect');
    frames['service-long-status-360x800'].health=longHeader;
    fs.writeFileSync(path.join(c.output,'frames.json'),JSON.stringify(frames,null,2));
    assert.equal(Object.keys(frames).length,172);
    assert.deepEqual(failures,[],'Working layout');
  },{prepare:state=>{state.categories[0].name='google';}});
