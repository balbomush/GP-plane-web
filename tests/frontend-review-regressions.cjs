/* SR001-004: actual Core Web DTO and real Svelte selection events. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createUi}=require('./browser-fixture.cjs');
const records=[],only=process.argv[3];
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function scenario(name,run,options){if(only&&only!==name)return;const ui=await createUi(options);try{await run(ui);assert.deepEqual(ui.errors,[]);records.push({scenario:name,pass:true});}finally{await ui.close();}}
async function hold(page,part,body=false){await page.evaluate(({part,body})=>{
 const original=window.fetch;window.fetch=(url,init)=>{
  if(!String(url).includes(part))return original(url,init);
  const held=window.__held={signal:init.signal};
  if(body)return Promise.resolve({ok:true,status:200,headers:new Headers(),json:()=>new Promise(r=>held.finish=r)});
  return new Promise(r=>held.finish=data=>r(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})));
 };
},{part,body});}
function events(){const original=window.fetch;window.fetch=(url,init)=>String(url).includes('/events/stream')?Promise.resolve(new Response(new ReadableStream({start(controller){window.__emit=(event,data)=>controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));init.signal.addEventListener('abort',()=>controller.close(),{once:true});}}))):original(url,init);}
(async()=>{
 await scenario('external-run-bootstrap-relogin-sse-terminal',async({page,tab,button,signIn,requests})=>{
  let active=true,id='external-one';
  const status=()=>({version:'0.4.4',state:{current_run_id:active?id:null,current_run_status:active?'running':null},zapret2:{nfqws2_found:true,blockcheck_found:true,root_helper_ready:true}});
  await page.route('**/api/web/status',route=>route.fulfill({json:status()}));
  await page.route('**/api/web/runs/history-page?*',route=>route.fulfill({json:{runs:[{run_id:id,status:active?'running':'stopped',domains:['example.com']}],total:1,has_more:false}}));
  await page.route('**/api/core/**/latest-log*',route=>route.fulfill({json:{run_id:id,status:active?'running':'stopped',stdout_tail:'external live line',progress:{percent:20}}}));
  await signIn();await page.getByRole('tablist').waitFor();assert(await button('Start').isDisabled());assert(await button('Stop').isEnabled());
  await tab('Терминал');assert(await button('Остановить').isEnabled());await page.locator('#finder-log').getByText('external live line',{exact:true}).waitFor();
  await button('Выйти').click();await signIn();await page.getByRole('tablist').waitFor();assert(await button('Start').isDisabled());
  active=false;await page.evaluate(s=>{window.__emit('status',s);window.__emit('runs',{});},status());await page.waitForFunction(()=>!document.querySelector('fieldset').disabled);assert(await button('Start').isEnabled());
  active=true;id='external-two';await page.evaluate(s=>{window.__emit('status',s);window.__emit('runs',{});},status());await page.waitForFunction(()=>document.querySelector('fieldset').disabled);assert(await button('Stop').isEnabled());
  await tab('Списки');assert(await button('Сохранить').isDisabled());
  assert.equal(requests.filter(row=>row.path.endsWith('/start-run')).length,0);
 },{login:false,before:events});
 for(const body of [false,true]){
  await scenario('empty-list-selection-stale-'+(body?'body':'headers'),async({page,tab})=>{
   await tab('Списки');await hold(page,'/presets/domains',body);await page.getByLabel('Список',{exact:true}).selectOption('custom:mine');await page.waitForFunction(()=>window.__held);
   await page.getByLabel('Список',{exact:true}).selectOption('');await page.getByLabel('Название',{exact:true}).fill('new-draft');await page.getByLabel('Домены',{exact:true}).fill('new.example');
   assert(await page.evaluate(()=>window.__held.signal.aborted));await page.evaluate(()=>window.__held.finish({domains:[{domain:'obsolete.example'}],has_more:false}));await settle(page);
   assert.equal(await page.getByLabel('Название',{exact:true}).inputValue(),'new-draft');assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'new.example');
  });
  await scenario('common-edit-busy-stale-'+(body?'body':'headers'),async({page,tab,button})=>{
   await tab('Кандидаты');await page.locator('[data-result]').first().waitFor();await page.getByLabel('Режим',{exact:true}).selectOption('common');
   await page.getByLabel('Общие домены',{exact:true}).fill('example.com\nvideo.example.net');await hold(page,'/strategy-candidates-page',body);await button('Найти общие').click();await page.waitForFunction(()=>window.__held);
   await page.getByLabel('Общие домены',{exact:true}).fill('example.com\nnew.example');assert(await button('Найти общие').isEnabled());assert(await page.evaluate(()=>window.__held.signal.aborted));
   await page.evaluate(()=>window.__held.finish({candidates:[],total:0,has_more:false,version:{}}));await settle(page);assert(await button('Найти общие').isEnabled());assert(await button('Обновить кандидатов').isEnabled());
  });
 }
 for(const choice of ['tested',''])await scenario('common-preset-stale-to-'+(choice||'manual'),async({page,tab})=>{
  await tab('Кандидаты');await page.locator('[data-result]').first().waitFor();await page.getByLabel('Режим',{exact:true}).selectOption('common');await hold(page,'/presets/domains');
  await page.getByLabel('Список',{exact:true}).selectOption('custom:mine');await page.waitForFunction(()=>window.__held);await page.getByLabel('Список',{exact:true}).selectOption(choice);
  if(!choice)await page.getByLabel('Общие домены',{exact:true}).fill('manual.example');
  const expected=await page.getByLabel('Общие домены',{exact:true}).inputValue();assert(await page.evaluate(()=>window.__held.signal.aborted));await page.evaluate(()=>window.__held.finish({domains:[{domain:'obsolete.example'}],has_more:false}));await settle(page);
  assert.equal(await page.getByLabel('Общие домены',{exact:true}).inputValue(),expected);assert.equal(await page.getByLabel('Список',{exact:true}).inputValue(),choice);
 });
})().catch(error=>{records.push({pass:false,error:String(error.stack||error)});process.exitCode=1;}).finally(()=>{if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({kind:'targeted actual Svelte review regressions; HTTP fixtures',records},null,2));console.log(JSON.stringify(records));});
