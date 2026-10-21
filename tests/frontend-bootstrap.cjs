/* Production Svelte bootstrap/lifetime assertions. HTTP fixture, not Core proof. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createUi}=require('./browser-fixture.cjs');
const output=process.argv[2],only=process.argv[3],checks=[],errors=[];
async function scenario(name,run){if(only&&only!==name)return;const ui=await createUi({login:false});try{await run(ui);assert.deepEqual(ui.errors,[]);checks.push(name);}finally{await ui.close();}}
(async()=>{
 await scenario('atomic-five',async({page,signIn,requests})=>{
  let pending=[];
  const paths=['/api/web/status','/api/web/runs/history-page','/api/core/runs/latest-log','/api/web/presets','/api/core/run-settings'];
  await page.route('**/api/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(!paths.includes(pathname))return route.fallback();
   pending.push({route,pathname});
  });
  await signIn();await page.waitForFunction(()=>document.body.textContent.includes('Загрузка Core…'));
  await assertEventually(()=>assert.equal(pending.length,5));
  assert.equal(await page.getByRole('tablist').count(),0);
  assert.equal(await page.locator('[role=tabpanel]').count(),0);
  for(const path of paths.slice(0,4)){
   const {route}=pending.find(item=>item.pathname===path);
   await route.fulfill({contentType:'application/json',body:JSON.stringify(path.endsWith('/status')?{zapret2:{nfqws2_found:true,blockcheck_found:true,root_helper_ready:true}}:path.includes('history')?{runs:[]}:path.includes('latest-log')?{}:{custom:{finder:{},common:{}},system:{finder:{},common:{}}})});
   assert.equal(await page.getByRole('tablist').count(),0);
  }
  await pending.find(item=>item.pathname==='/api/core/run-settings').route.fulfill({contentType:'application/json',body:'{}'});
  await page.getByRole('tablist').waitFor();assert.equal(await page.getByRole('tablist').count(),1);
  assert.equal(requests.filter(row=>row.path.includes('strategy-candidates-page')).length,0);
 });
 await scenario('generic-failure-retry',async({page,signIn,button})=>{
  let failure=true;
  await page.route('**/api/web/status',route=>failure?route.fulfill({status:500,body:'private /home/secret-stack password'}):route.fallback());
  await signIn();await button('Повторить загрузку').waitFor();
  for(let index=0;index<2;index++){
   await page.getByText('Не удалось загрузить Core',{exact:true}).waitFor();
   assert.equal(await page.getByRole('tablist').count(),0);
   assert(!(await page.locator('body').innerText()).includes('secret-stack'));
   await button('Повторить загрузку').click();
   if(index===0)await page.getByText('Не удалось загрузить Core',{exact:true}).waitFor();
  }
  failure=false;await button('Повторить загрузку').click();await page.getByRole('tablist').waitFor();
  assert.equal(await page.getByRole('tablist').count(),1);
 });
 await scenario('timeout-abort-retry',async({page,signIn,button})=>{
  await page.clock.install();
  await page.evaluate(()=>{
   const native=window.fetch;window.__holdStatus=true;window.__statusAborted=0;
   window.fetch=(url,init)=>String(url).endsWith('/api/web/status')&&window.__holdStatus?new Promise((resolve,reject)=>{
    init.signal.addEventListener('abort',()=>{window.__statusAborted++;reject(new DOMException('aborted','AbortError'));},{once:true});
   }):native(url,init);
  });
  await signIn();await page.getByText('Загрузка Core…',{exact:true}).waitFor();
  assert.equal(await page.getByRole('tablist').count(),0);
  await page.clock.fastForward(15001);await page.getByText('Не удалось загрузить Core',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__statusAborted),1);
  await page.evaluate(()=>window.__holdStatus=false);await button('Повторить загрузку').click();await page.getByRole('tablist').waitFor();
 });
 await scenario('unknown-status-neutral-retries',async({page,signIn,button})=>{
  let attempts=0;
  await page.route('**/api/web/status',route=>++attempts<3?route.fulfill({contentType:'application/json',body:'{"state":{"current_run_id":null,"current_run_status":null}}'}):route.fallback());
  await signIn();await page.getByRole('tablist').waitFor();await page.getByText('Состояние не получено',{exact:true}).waitFor();
  assert(await button('Start').isDisabled());
  await page.getByText('Готова',{exact:true}).waitFor();assert(attempts>=3);
  assert(!(await button('Start').isDisabled()));
 });
 await scenario('post-ready-refresh-failure-preserves-shell',async({page,signIn,button})=>{
  await signIn();await page.getByRole('tablist').waitFor();
  await page.getByText(/Диагностика системы ·/).click();
  await page.route('**/api/web/status',route=>route.fulfill({status:503,body:'private failure'}));
  await button('Обновить статус').click();await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('tablist').count(),1);assert.equal(await button('Повторить загрузку').count(),0);
 });
})().catch(error=>{errors.push(String(error.stack||error));process.exitCode=1;}).finally(()=>{const result={kind:'production Svelte assets with HTTP fixtures; bootstrap assertions',checks,errors};if(output)fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));});
async function assertEventually(check){const deadline=Date.now()+5000;for(;;){try{return check();}catch(error){if(Date.now()>deadline)throw error;await new Promise(resolve=>setTimeout(resolve,10));}}}
