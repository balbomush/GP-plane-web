/* Targeted S3 browser fixtures. Real HTTP/Core and hardware proof are separate. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.GP_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.GP_WEB_STATIC_ROOT||path.join(__dirname,'../src/gp_control_plane_web/static'));
const baseUrl=process.env.GP_TEST_WEB_URL||'http://127.0.0.1:18971';
const golden=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/v044-populated.json'),'utf8'));
const output=process.argv[2];
const checks=[],errors=[],requests=[];const push=checks.push.bind(checks);checks.push=(...items)=>{console.log(...items);return push(...items);};
let browser,server;
(async()=>{
  if(!process.env.GP_TEST_WEB_URL){server=http.createServer((req,res)=>{const name=new URL(req.url,'http://127.0.0.1').pathname;const file=path.join(root,name==='/'?'index.html':name);if(!file.startsWith(root+path.sep)){res.writeHead(400).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(18971,'127.0.0.1',resolve));}
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  let current=null,runStatus='success',candidatePage=golden,failBootstrap=false;
  let settings={enable_ipv6:false,curl_parallelism_max:10,curl_parallelism_default:4,curl_max_time:2,curl_max_time_quic:2,curl_max_time_doh:2};
  let presets={custom:{finder:{mine:['example.com']},common:{mine:['example.com','video.example.net']}},metadata:{finder:{mine:{count:1}},common:{mine:{count:2}}},system:{finder:{required:['example.com']},common:{}},system_metadata:{finder:{required:{count:1}}},domain_sets:{critical:['example.com']}};
  const history=()=>({runs:[{id:'history-1',run_id:'history-1',timestamp:'2026-10-20',status:'success',kind:'multi-domain-discovery',domains:['example.com','video.example.net'],discovery_options:{enable_tls12:true,enable_quic:false,repeats:3},timeout_seconds:3600},...(current||runStatus==='stopped'?[{id:'new-run',run_id:'new-run',timestamp:'2026-10-21',status:runStatus,domains:['example.com']}]:[])],offset:0,total:2,has_more:false});
  await page.route('**/api/**',async route=>{
    const req=route.request(),u=new URL(req.url()),body=req.postDataJSON?.bind(req);
    requests.push({path:u.pathname,query:Object.fromEntries(u.searchParams),method:req.method(),body:req.headers()['content-type']==='application/json'?body():null});
    let data={};
    if(u.pathname.endsWith('/events/stream'))return route.abort();
    if(u.pathname.endsWith('/auth/login'))data={access_token:'synthetic-test-token'};
    else if(u.pathname==='/api/web/status'){if(failBootstrap)return route.fulfill({status:503,body:'fixture Core unavailable'});data={version:'0.4.4',zapret2:{nfqws2_found:true,blockcheck_found:true,root_helper_ready:true},current_run:current,run_preferences:{domains:['example.com'],enable_tls12:true,include_quic:false}};}
    else if(u.pathname.endsWith('/history-page'))data=history();
    else if(u.pathname.endsWith('/latest-log'))data={run_id:u.searchParams.get('run_id')||'new-run',stdout_log:'stdout.log',stdout_tail:'Live stdout α',stderr_tail:'Live stderr',status:runStatus,progress:{attempted:3,attempt_total:10,percent:30}};
    else if(u.pathname==='/api/core/run-settings')data=settings;
    else if(u.pathname.endsWith('/strategy-candidates-page'))data=candidatePage;
    else if(u.pathname.endsWith('/candidate-domain-index-page'))data={domains:[{domain:'example.com',strategy_count:2},{domain:'video.example.net',strategy_count:2}],total:2,has_more:false};
    else if(u.pathname.endsWith('/presets/domains'))data={domains:(presets[u.searchParams.get('kind')==='system'?'system':'custom'][u.searchParams.get('scope')]?.[u.searchParams.get('name')]||[]).map(domain=>({domain})),has_more:false};
    else if(u.pathname.endsWith('/presets/save')){const p=body();presets.custom[p.scope][p.name]=p.domains;data=presets;}
    else if(u.pathname.endsWith('/delete-user-lists')){const p=body();delete presets.custom[p.scope][p.name];data=presets;}
    else if(u.pathname==='/api/web/presets')data=presets;
    else if(u.pathname.endsWith('/start-run')){current={run_id:'new-run',status:'running'};runStatus='running';data={run_id:'new-run'};}
    else if(u.pathname.endsWith('/stop-current-run')){current=null;runStatus='stopped';data={stopped:true};}
    else if(u.pathname.endsWith('/backups/list'))data={snapshots:[{snapshot_id:'fixture-backup',size_bytes:42,checksum:'ok'}]};
    else if(u.pathname.endsWith('/run-settings/save')){settings=body().settings;data=settings;}
    else if(u.pathname.endsWith('/v2fly/categories'))data={categories:['category-a'],storage:{source:'fixture'}};
    else if(u.pathname.endsWith('/v2fly/category-domains'))data={domains:['one.example','two.example']};
    else if(u.pathname.endsWith('/releases/available'))data={current:{version:'0.4.4'},releases:[{channel:'stable',version:'0.4.4',url:'https://github.com/balbomush/GP-plane/releases'}]};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const tab=async name=>page.getByRole('tablist').getByRole('tab',{name,exact:true}).click();
  const button=name=>page.getByRole('button',{name,exact:true});
  await page.goto(baseUrl);
  await page.getByLabel('Логин',{exact:true}).fill('admin');await page.getByLabel('Пароль',{exact:true}).fill('test-only');await button('Войти').click();await page.getByRole('tablist').waitFor();
  checks.push('auth bootstrap loads status/history/log/settings/presets');
  await page.getByLabel('Домены',{exact:true}).fill('example.com\nvideo.example.net');
  await page.getByLabel('Режим',{exact:true}).selectOption('multi');
  await button('Start').click();await page.getByText('Запуск подтверждён: new-run',{exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/start-run')).length,1);
  const start=requests.find(r=>r.path.endsWith('/start-run')).body;assert.equal(start.mode,'multi_domain');assert.deepEqual(start.domains,['example.com','video.example.net']);assert.deepEqual(start.protocols,['tcp']);
  assert.equal(await button('Start').isDisabled(),true);assert.equal(await button('Stop').isEnabled(),true);
  checks.push('Finder multi payload and accepted identity prevent duplicate start');
  await tab('Терминал');await page.locator('#finder-log').getByText(/Live stdout α/).waitFor();assert((await page.locator('#finder-log').textContent()).includes('Live stderr'));
  await tab('Подбор');await button('Stop').click();await button('Start').waitFor({state:'visible'});await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start')?.disabled);
  checks.push('live stdout/stderr/progress and Stop terminal-history convergence');
  await tab('История');await page.getByRole('heading',{name:'history-1',exact:true}).waitFor();await page.getByRole('article').filter({has:page.getByRole('heading',{name:'history-1',exact:true})}).getByRole('button',{name:'Повторить параметры'}).click();assert.equal(await page.getByLabel('Повторы',{exact:true}).inputValue(),'3');
  checks.push('history repeat uses discovery_options and does not start automatically');
  await tab('Кандидаты');await page.locator('[data-result]').first().waitFor();assert.equal(await page.locator('[data-result]').count(),golden.candidates.length);assert.equal(await page.locator('article img').count(),0);
  await page.locator('[data-result]').first().getByRole('button').click();await page.getByText('Скопировано',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),golden.candidates[0].args.trim());
  checks.push('immutable gp-ui populated results, exact Unicode/copy and XSS escaping');
  candidatePage={candidates:'bad',total:1,has_more:false};await button('Обновить кандидатов').click();await page.getByText('Неверный ответ Core',{exact:true}).waitFor();assert.equal(await page.locator('[data-result]').count(),0);candidatePage=golden;
  checks.push('malformed candidate response fails closed');
  await tab('Списки');await page.getByLabel('Список',{exact:true}).selectOption('custom:mine');await page.waitForFunction(()=>document.querySelector('textarea')?.value==='example.com');
  await page.getByLabel('Название',{exact:true}).fill('browser-copy');await page.getByLabel('Домены',{exact:true}).fill('one.example\ntwo.example');await button('Сохранить').click();await page.getByText('Список сохранён',{exact:true}).waitFor();assert.deepEqual(requests.find(r=>r.path.endsWith('/presets/save')).body,{scope:'finder',name:'browser-copy',kind:'user',domains:['one.example','two.example']});
  page.once('dialog',d=>d.dismiss());await button('Удалить список').click();assert.equal(requests.filter(r=>r.path.endsWith('/delete-user-lists')).length,0);
  page.once('dialog',d=>d.accept());await button('Удалить список').click();await page.getByText('Список удалён',{exact:true}).waitFor();
  checks.push('scoped preset selection/read/save, delete confirmation cancellation and acceptance');
  await tab('Настройки');await button('Сохранить настройки').click();await page.getByText('Настройки сохранены',{exact:true}).waitFor();assert(requests.filter(r=>r.path.endsWith('/run-settings/save')).every(r=>r.body.settings));
  await page.getByText('Версии и обновления',{exact:true}).click();await button('Проверить обновления Core').click();await page.getByRole('link',{name:'Открыть 0.4.4',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Открыть 0.4.4',exact:true}).getAttribute('href'),'https://github.com/balbomush/GP-plane/releases');
  await page.getByRole('heading',{name:'fixture-backup',exact:true}).waitFor();page.once('dialog',d=>d.dismiss());await button('Восстановить из бекапа').click();assert.equal(requests.filter(r=>r.path.endsWith('/backups/restore')).length,0);
  checks.push('settings wrapper, release links, backup list and cancel restore');
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await button('Выйти').click();await button('Войти').waitFor();assert.equal(await page.getByRole('tablist').count(),0);
  failBootstrap=true;await page.getByLabel('Пароль',{exact:true}).fill('test-only');await button('Войти').click();await button('Повторить загрузку').waitFor();failBootstrap=false;await button('Повторить загрузку').click();await page.getByRole('tablist').waitFor();
  checks.push('mobile no horizontal overflow, logout unmount, bootstrap failure and retry');

  await tab('Подбор');
  let heldPreset,releaseGate;
  const presetGate=()=>new Promise(resolve=>releaseGate=resolve);
  const presetHandler=async route=>{if(new URL(route.request().url()).searchParams.get('name')==='mine'){heldPreset=route;releaseGate();}else await route.fallback();};
  await page.route('**/api/web/presets/domains?*',presetHandler);
  let gate=presetGate();await page.getByLabel('Список доменов',{exact:true}).selectOption('custom:mine');await gate;
  await page.getByLabel('Список доменов',{exact:true}).selectOption('system:required');
  await page.waitForFunction(()=>document.querySelector('#finder-domains').value==='example.com');
  await heldPreset.fulfill({contentType:'application/json',body:JSON.stringify({domains:[{domain:'late.example'}],has_more:false})}).catch(()=>{});
  assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'example.com');
  gate=presetGate();await page.getByLabel('Список доменов',{exact:true}).selectOption('custom:mine');await gate;await tab('История');
  await heldPreset.fulfill({contentType:'application/json',body:JSON.stringify({domains:[{domain:'unmounted.example'}],has_more:false})}).catch(()=>{});
  await tab('Подбор');assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'example.com');
  await page.unroute('**/api/web/presets/domains?*',presetHandler);
  checks.push('late preset choice and Finder unmount abort cannot overwrite current domains');
  // S1 responsive inventory: every screen, all six pinned widths. Open the
  // real disclosures rather than checking only the initial Finder viewport.
  for(const width of [320,375,768,960,1024,1440]){
    await page.setViewportSize({width,height:900});
    for(const name of ['Подбор','История','Кандидаты','Терминал','Списки','Настройки']){
      await tab(name);
      await page.locator('[role=tabpanel]').locator('details').evaluateAll(nodes=>nodes.forEach(node=>node.open=true));
      const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
      assert(metrics.scroll<=metrics.client,`${width}px ${name}: ${JSON.stringify(metrics)}`);
      for(const control of await page.locator('[role=tabpanel] button:visible,[role=tabpanel] input:visible,[role=tabpanel] select:visible').all()){
        await control.scrollIntoViewIfNeeded();
        const hit=await control.evaluate(node=>{const r=node.getBoundingClientRect(),target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {width:r.width,height:r.height,targetable:!!target&&(target===node||node.contains(target))};});
        assert(hit.width>0&&hit.height>0&&hit.targetable,`${width}px ${name}: unreachable ${await control.getAttribute('aria-label')||await control.textContent()}`);
      }
      if(process.env.GP_BROWSER_SCREENSHOTS&&[320,1440].includes(width)){const key=['Подбор','История','Кандидаты','Терминал','Списки','Настройки'].indexOf(name);await page.screenshot({path:path.join(process.env.GP_BROWSER_SCREENSHOTS,`${width}-screen-${key}.png`),fullPage:true});}
    }
  }
  await page.setViewportSize({width:1280,height:900});await tab('Подбор');
  await page.getByRole('tab',{name:'Подбор',exact:true}).focus();await page.keyboard.press('End');
  assert.equal(await page.getByRole('tab',{name:'Настройки',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'Подбор',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('.run-launch-summary-item').count(),13);
  const limit=page.getByLabel('Лимит, часы',{exact:true});const beforeLimit=await limit.boundingBox();
  assert(await limit.isDisabled());await page.getByLabel('Ограничить время',{exact:true}).check();const afterLimit=await limit.boundingBox();
  assert.equal(beforeLimit.height,afterLimit.height);await page.getByLabel('Ограничить время',{exact:true}).uncheck();
  checks.push('S1 six-width matrix: all six screens fit, real controls hit-test, keyboard tabs, 13 launch facts and stable time limit');
  await tab('Списки');await page.getByText('V2Fly',{exact:true}).click();
  await button('Проверить локальный каталог').click();await page.getByLabel('Категории',{exact:true}).locator('option').waitFor({state:'attached'});
  await page.getByLabel('Категории',{exact:true}).selectOption(['category-a']);await button('Предпросмотр').click();await page.getByText('Доменов в предпросмотре: 2',{exact:true}).waitFor();
  await button('Заменить редактор').click();assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'one.example\ntwo.example');
  await button('Добавить в редактор').click();assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'one.example\ntwo.example');
  await button('Обновить каталог').click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(node=>node.textContent==='Обновить каталог')?.disabled);
  assert.equal(requests.filter(r=>r.path.endsWith('/update-local-storage')).length,1);
  await page.getByLabel('Импорт файла',{exact:true}).setInputFiles({name:'domains.txt',mimeType:'text/plain',buffer:Buffer.from('import.example\nimport.example\nкириллица.example')});
  await page.waitForFunction(()=>document.querySelector('textarea')?.value==='import.example\nкириллица.example');
  const exportList=page.waitForEvent('download');await button('Экспорт').click();const listFile=await exportList;assert.equal(listFile.suggestedFilename().endsWith('.txt'),true);
  checks.push('V2Fly load/selection/preview/update and replace/add editor; Unicode import deduplication and export');
  await tab('Кандидаты');await page.getByLabel('Режим',{exact:true}).selectOption('common');
  await page.getByLabel('Общие домены',{exact:true}).fill('example.com\nvideo.example.net');await button('Найти общие').click();await page.locator('[data-result]').first().waitFor();
  await page.getByText('Итог по загруженным стратегиям',{exact:true}).click();
  for(const mode of ['coverage','minimal','balance']){await page.getByLabel('Режим отбора',{exact:true}).selectOption(mode);await button('Рассчитать итог').click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Рассчитать итог')?.disabled);}
  await page.evaluate(()=>{const write=navigator.clipboard.writeText.bind(navigator.clipboard);window.__copyWrites=[];navigator.clipboard.writeText=text=>{window.__copyWrites.push(text);return write(text);};});
  await page.getByLabel('Аргументы итогового набора',{exact:true}).fill('--manual  α\n--file=/own/path');await button('Копировать итог').click();await page.getByText('Скопировано',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__copyWrites.at(-1)),'--manual  α\n--file=/own/path');
  // Native Windows clipboard returns CRLF even for a writeText LF argument.
  // Check the unmodified API argument above and the OS roundtrip separately.
  assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),'--manual  α\n--file=/own/path');
  const exportResult=page.waitForEvent('download');await button('Экспорт итога').click();assert.equal((await exportResult).suggestedFilename(),'gp-strategies.txt');
  await button('Домены в подбор').click();assert.equal(await page.getByRole('tab',{name:'Подбор',exact:true}).getAttribute('aria-selected'),'true');assert.equal(requests.filter(r=>r.path.endsWith('/start-run')).length,1);
  checks.push('common candidates, all three unchanged selection modes, manual exact copy/export and domains→Finder without auto-start');
  // UI-only SSE fixture: native reader/decoder is real, Core stream qualification is separate.
  await page.evaluate(()=>{
    const original=window.fetch;window.__sseActive=0;
    window.fetch=(url,init)=>{
      if(String(url).includes('/events/stream'))return Promise.resolve(new Response(new ReadableStream({start(controller){
        window.__sseController=controller;window.__sseActive++;
        init.signal.addEventListener('abort',()=>{window.__sseActive--;try{controller.close();}catch{}},{once:true});
      }}),{headers:{'Content-Type':'text/event-stream'}}));
      return original(url,init);
    };
    window.__emit=(event,data)=>window.__sseController.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  });
  await page.waitForFunction(()=>window.__sseController,undefined,{timeout:15000});
  await tab('Настройки');await page.getByText('Версии и обновления',{exact:true}).click();
  await page.getByLabel('Максимум параллельных запросов',{exact:true}).fill('17');
  const emitSettings=async (value,version)=>{settings={...settings,curl_parallelism_max:value};return page.evaluate(({value,version})=>{window.__emit('settings',{version:`settings-${value}`});window.__emit('status',{version,current_run:null,zapret2:{nfqws2_found:true,blockcheck_found:true,root_helper_ready:true}});},{value,version});};
  await emitSettings(23,'fixture-status-23');await page.getByText(/Core: fixture-status-23/).waitFor();
  assert.equal(await page.getByLabel('Максимум параллельных запросов',{exact:true}).inputValue(),'17');
  await button('Сохранить настройки').click();await page.getByText('Настройки сохранены',{exact:true}).waitFor();
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Сохранить настройки')?.disabled);
  await emitSettings(24,'fixture-status-24');await page.getByText(/Core: fixture-status-24/).waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('input')).some(input=>input.value==='24'));
  assert.equal(await page.getByLabel('Максимум параллельных запросов',{exact:true}).inputValue(),'24');
  let heldSave,readySave;const saveGate=new Promise(resolve=>readySave=resolve);
  const saveHandler=route=>{heldSave=route;readySave();};await page.route('**/api/core/run-settings/save',saveHandler);
  await page.getByLabel('Максимум параллельных запросов',{exact:true}).fill('25');await button('Сохранить настройки').click();await saveGate;
  await page.getByLabel('Максимум параллельных запросов',{exact:true}).fill('26');
  await heldSave.fulfill({contentType:'application/json',body:JSON.stringify({curl_parallelism_max:25,curl_parallelism_default:4})});
  await button('Сохранить настройки').waitFor({state:'visible'});await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Сохранить настройки')?.disabled);
  assert.equal(await page.getByLabel('Максимум параллельных запросов',{exact:true}).inputValue(),'26');
  await page.unroute('**/api/core/run-settings/save',saveHandler);
  checks.push('causal SSE→state→DOM, background settings preserve dirty draft, save revision preserves newer edits');
  await tab('Кандидаты');await page.getByLabel('Режим',{exact:true}).selectOption('domain');await page.locator('[data-result]').first().waitFor();
  const unauthorizedHandler=route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{message:'revoked fixture',code:'unauthorized'}})});
  await page.route('**/api/web/strategy-candidates-page?*',unauthorizedHandler);
  await button('Обновить кандидатов').click();await button('Войти').waitFor();
  assert.equal(await page.evaluate(()=>window.__sseActive),0);assert.equal(await page.locator('[data-result]').count(),0);
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  await page.unroute('**/api/web/strategy-candidates-page?*',unauthorizedHandler);
  checks.push('401 revocation clears mounted results and memory token, aborts active SSE; no persisted bearer');
  const assetPage=await context.newPage();await assetPage.route('**/assets/*.js',route=>route.fulfill({status:404,body:''}));
  await assetPage.goto(baseUrl);await assetPage.locator('#asset-error').waitFor({state:'visible'});await assetPage.close();
  checks.push('missing/versioned JS asset gives an explicit reload path');
  assert.deepEqual(errors,[]);
})().catch(e=>{errors.push(String(e.stack||e));process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();if(server)server.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));
  const result={kind:'UI fixtures on production assets, Windows',checks,errors,requests,cleanup:'browser and owned HTTP server closed'};
  if(output)fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify({checks,errors},null,2));
});
