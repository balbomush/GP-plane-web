const fs=require('node:fs'),assert=require('node:assert/strict');
const {createUi}=require('./browser-fixture.cjs');
const golden=require('./fixtures/v044-populated.json'),records=[],only=process.argv[3];
async function scenario(name,run){if(only&&only!==name)return;const ui=await createUi();try{await run(ui);assert.deepEqual(ui.errors,[]);records.push({scenario:name,pass:true});}finally{await ui.close();}}
(async()=>{
 await scenario('candidate-pages-index-tested-query',async({page,tab,button,requests})=>{
  assert.equal(requests.filter(row=>row.path.endsWith('/strategy-candidates-page')).length,0);
  const domains=Array.from({length:60},(_,index)=>`domain${index}.example`),seen=[];let heldIndex;
  await page.route('**/api/web/candidate-domain-index-page?*',route=>{heldIndex=route;});
  await page.route('**/api/web/strategy-candidates-page?*',route=>{
   const query=Object.fromEntries(new URL(route.request().url()).searchParams),offset=Number(query.offset);seen.push(query);
   assert.equal(query.limit,'50');
   const candidates=Array.from({length:offset?5:50},(_,index)=>({...golden.candidates[0],seen:[{domain:'domain0.example'}],id:`row${offset+index}`,args:`--unique=${offset+index}`,family:offset?'other':'fake'}));
   return route.fulfill({contentType:'application/json',body:JSON.stringify({candidates,total:55,offset,has_more:!offset,version:{v:1}})});
  });
  await tab('Кандидаты');await page.locator('[data-result]').first().waitFor();assert.equal(await page.locator('[data-result]').count(),50);
  await button('Загрузить ещё').click();await page.getByText('Загружено 55 из 55; показано 55. Копирование относится к показанным загруженным результатам.',{exact:true}).waitFor();
  assert.deepEqual(seen.map(row=>row.offset),['0','50']);
  await page.getByLabel('Поиск в загруженных аргументах',{exact:true}).fill('--unique=54');assert.equal(await page.locator('[data-result]').count(),1);
  await page.getByLabel('Семейство',{exact:true}).selectOption('fake');assert.equal(await page.locator('[data-result]').count(),0);
  await page.getByLabel('Поиск в загруженных аргументах',{exact:true}).fill('');await page.getByLabel('Семейство',{exact:true}).selectOption('');
  await page.getByLabel('Режим',{exact:true}).selectOption('common');
  assert.equal(await page.getByLabel('Список',{exact:true}).locator('option[value=tested]').count(),0);
  await heldIndex.fulfill({contentType:'application/json',body:JSON.stringify({domains:domains.slice(0,50).map(domain=>({domain,strategy_count:1})),tested_domains:domains,total:60,has_more:true})});
  await page.getByLabel('Список',{exact:true}).locator('option[value=tested]').waitFor({state:'attached'});
  assert.equal(await page.getByLabel('Список',{exact:true}).inputValue(),'');
  await page.getByLabel('Список',{exact:true}).selectOption('tested');
  assert.equal((await page.getByLabel('Общие домены',{exact:true}).inputValue()).split('\n').length,60);
  await page.getByText(/Загружено 50 из 55/).waitFor();assert.equal(seen.at(-1).domains,domains.join(','));
  await page.getByLabel('Добавить протестированный домен',{exact:true}).fill('not-tested.example');await button('Добавить домен').click();await page.getByText('Выберите протестированный домен',{exact:true}).waitFor();
  await page.getByLabel('Режим',{exact:true}).selectOption('domain');await button('Ещё домены').waitFor();
  const indexRequests=[];
  await page.route('**/api/web/candidate-domain-index-page?*',route=>{const q=new URL(route.request().url()).searchParams;indexRequests.push(Object.fromEntries(q));return route.fulfill({contentType:'application/json',body:JSON.stringify({domains:domains.slice(50).map(domain=>({domain,strategy_count:1})),tested_domains:domains,total:60,has_more:false})});});
  await button('Ещё домены').click();await page.getByText('Доменов в индексе 60 из 60',{exact:true}).waitFor();assert.deepEqual(indexRequests,[{limit:'50',offset:'50'}]);
 });
 await scenario('history-page-repeat-log-navigation',async({page,tab,button,requests})=>{
  const queries=[];
  await page.route('**/api/web/runs/history-page?*',route=>{
   const q=Object.fromEntries(new URL(route.request().url()).searchParams);queries.push(q);const offset=Number(q.offset);
   const runs=Array.from({length:offset?2:50},(_,index)=>({run_id:`run${offset+index}`,timestamp:`2026-10-20T00:00:${String(index).padStart(2,'0')}Z`,status:'success',kind:'standard-discovery',domains:['repeat.example'],discovery_options:{enable_tls12:true,include_quic:false,repeats:3},timeout_seconds:3600}));
   return route.fulfill({contentType:'application/json',body:JSON.stringify({runs,offset,total:52,has_more:!offset})});
  });
  await page.getByLabel('Домены',{exact:true}).fill('preserve-finder.example');
  await tab('История');await page.getByText('50 из 52',{exact:true}).waitFor();await button('Загрузить ещё').click();await page.getByText('52 из 52',{exact:true}).waitFor();assert.deepEqual(queries.map(q=>q.offset),['0','50']);assert(queries.every(q=>q.limit==='50'));
  await button('К кандидатам').first().click();await tab('Подбор');assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'preserve-finder.example');
  await tab('История');await button('Повторить параметры').first().click();await page.getByLabel('Домены',{exact:true}).waitFor();assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'repeat.example');
  assert.equal(requests.filter(row=>row.path.endsWith('/start-run')).length,0);
  await tab('История');await button('Открыть журнал').first().click();await page.getByRole('tab',{name:'Терминал',exact:true}).waitFor();
  assert.equal(await page.getByRole('tab',{name:'Терминал',exact:true}).getAttribute('aria-selected'),'true');
 });
})().catch(error=>{records.push({pass:false,error:String(error.stack||error)});process.exitCode=1;}).finally(()=>{if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({kind:'production Svelte UI fixture pagination/filter/action parity',records},null,2));console.log(JSON.stringify(records));});
