/* SR005: two domains x two protocols, bounded lists, scoped remote paging. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createUi}=require('./browser-fixture.cjs'),golden=require('./fixtures/v044-populated.json');
const records=[];
(async()=>{
 const ui=await createUi();const {page,tab,button}=ui;
 try{
  const domains=['a.example','b.example'],protocols=['tls','quic'];
  const rows=Array.from({length:880},(_,i)=>({...golden.candidates[0],id:'large-'+i,args:`--strategy=${String(i).padStart(4,'0')}`,protocol:protocols[i%2],seen:[{domain:domains[Math.floor(i/2)%2]}]}));
  const queries=[];let fail=false,empty=false;
  await page.route('**/api/web/candidate-domain-index-page?*',r=>r.fulfill({json:{domains:domains.map(domain=>({domain,strategy_count:440})),tested_domains:domains,total:2,has_more:false}}));
  await page.route('**/api/web/strategy-candidates-page?*',r=>{
   const q=Object.fromEntries(new URL(r.request().url()).searchParams);queries.push(q);
   if(fail){fail=false;return r.fulfill({status:503,json:{error:'held-page-failure'}});}
   const all=q.domain?rows.filter(row=>row.seen[0].domain===q.domain).map(row=>({...row,seen:domains.map(domain=>({domain}))})):rows,offset=Number(q.offset);
   return r.fulfill({json:{candidates:empty?[]:all.slice(offset,offset+50),total:all.length,has_more:!empty&&offset+50<all.length,version:{v:1}}});
  });
  await tab('Кандидаты');await page.getByText(/Загружено 50 из 880/).waitFor();
  for(let loaded=50;loaded<850;loaded+=50){await button('Загрузить ещё').click();await page.getByText(`Загружено ${loaded+50} из 880; показано ${loaded+50}. Копирование относится к показанным загруженным результатам.`,{exact:true}).waitFor();}
  const list=(domain,protocol)=>page.getByRole('region',{name:`Стратегии ${domain} ${protocol}`,exact:true});
  for(const domain of domains)for(const protocol of protocols)assert.equal(await list(domain,protocol).locator('[data-result]').count(),200);
  const a=list('a.example','tls'),b=list('b.example','tls');
  await a.getByRole('button',{name:/Показать все/}).click();assert.equal(await a.locator('[data-result]').count(),213);assert.equal(await b.locator('[data-result]').count(),200);
  await a.getByRole('button',{name:'Свернуть до 200',exact:true}).click();assert.equal(await a.locator('[data-result]').count(),200);
  await a.getByRole('button',{name:'Скопировать все',exact:true}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).split('\n').length,200);
  fail=true;await button('Загрузить ещё').click();await page.getByRole('alert').first().waitFor();assert((await page.getByText(/Загружено 850 из 880/).textContent()).includes('850'));
  empty=true;await button('Загрузить ещё').click();await button('Загрузить ещё').waitFor({state:'detached'});assert.equal(await a.locator('[data-result]').count(),200);assert.equal(await button('Загрузить ещё').count(),0);empty=false;
  // Refresh restores the global first page. A list button must explicitly
  // select its own domain, never consume a foreign-domain global page.
  await button('Обновить кандидатов').click();await page.getByText(/Загружено 50 из 880/).waitFor();
  await a.getByRole('button',{name:'Открыть домен a.example',exact:true}).click();await page.getByText(/Загружено 50 из 440/).waitFor();
  assert.equal(await page.getByLabel('Домен',{exact:true}).inputValue(),'a.example');assert.equal(queries.at(-1).domain,'a.example');assert.equal(queries.at(-1).offset,'0');
  await a.getByRole('button',{name:'Ещё стратегии этого набора',exact:true}).click();await page.getByText(/Загружено 100 из 440/).waitFor();assert.equal(queries.at(-1).offset,'50');assert.equal(queries.at(-1).domain,'a.example');
  const rendered=await page.locator('[data-result] code').allTextContents();assert.equal(new Set(rendered).size,100);assert.equal(await page.locator('[data-strategy-list]').count(),2);
  assert.deepEqual(ui.errors,[]);records.push({scenario:'bounded-independent-2-domains-2-protocols-copy-scoped-cursor-failure-empty',pass:true,queries});
 }finally{await ui.close();}
})().catch(error=>{records.push({pass:false,error:String(error.stack||error)});process.exitCode=1;}).finally(()=>{if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({kind:'production Svelte bounded strategy lists; HTTP fixtures',records},null,2));console.log(JSON.stringify(records));});
