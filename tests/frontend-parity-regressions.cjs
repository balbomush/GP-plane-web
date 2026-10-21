/* S1 behavioral assertions retained on actual Svelte controls; API fixtures. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const golden=require('./fixtures/v044-populated.json');
const {createUi}=require('./browser-fixture.cjs'),records=[];
async function scenario(name,run,options){const ui=await createUi(options);try{await run(ui);assert.deepEqual(ui.errors,[]);records.push({scenario:name,pass:true});}finally{await ui.close();}}
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
function eventFixture(){const fetch=window.fetch;window.fetch=(url,init)=>String(url).includes('/events/stream')?Promise.resolve(new Response(new ReadableStream({start(c){window.__parityEmit=(event,data)=>c.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));init.signal.addEventListener('abort',()=>c.close(),{once:true});}}),{headers:{'Content-Type':'text/event-stream'}})):fetch(url,init);}
async function fits(page,width){const box=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));assert(box.scroll<=box.client,`${width}: ${JSON.stringify(box)}`);}
async function states(page,node,label,width,{border=false}={}){
  await node.scrollIntoViewIfNeeded();
  await node.evaluate(el=>el.focus({preventScroll:true,focusVisible:true}));
  assert(await node.evaluate(el=>document.activeElement===el));
  await page.keyboard.press('Shift+Tab');assert(!(await node.evaluate(el=>document.activeElement===el)),label+' Shift+Tab');
  await node.evaluate(el=>el.focus({preventScroll:true,focusVisible:true}));
  await page.keyboard.press('Tab');assert(!(await node.evaluate(el=>document.activeElement===el)),label+' Tab');
  const read=()=>node.evaluate(el=>{
    const s=getComputedStyle(el),rgb=v=>(v.match(/\d+(?:\.\d+)?/g)||[]).slice(0,3).map(Number);
    const lum=v=>rgb(v).map(c=>{const n=c/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    const ratio=(a,b)=>{const [l,d]=[lum(a),lum(b)].sort((a,b)=>b-a);return(l+.05)/(d+.05);};
    return {text:ratio(s.color,s.backgroundColor),border:ratio(s.borderColor,s.backgroundColor),focus:Math.max(ratio(s.outlineColor,s.backgroundColor),ratio(s.borderColor,s.backgroundColor)),focusVisible:el.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth),color:s.color,background:s.backgroundColor};
  });
  await node.evaluate(el=>el.blur());await page.mouse.move(0,0);const normal=await read();
  await node.evaluate(el=>el.focus({preventScroll:true,focusVisible:true}));const focus=await read();
  assert(focus.focusVisible&&focus.outlineStyle!=='none'&&focus.outlineWidth>=2,`${width} ${label}: ${JSON.stringify(focus)}`);
  assert(focus.focus>=3,`${width} ${label} focus: ${JSON.stringify(focus)}`);
  const r=await node.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);const hover=await read();
  await page.mouse.down();let active;try{active=await read();}finally{await page.mouse.move(0,0);await page.mouse.up();}
  for(const [state,value] of Object.entries({normal,focus,hover,active})){
    assert(value.text>=4.5,`${width} ${label} ${state} text: ${JSON.stringify(value)}`);
    if(border)assert(value.border>=3,`${width} ${label} ${state} border: ${JSON.stringify(value)}`);
  }
  records.push({width,control:label,states:{normal,focus,hover,active}});
}
(async()=>{
 await scenario('S1-computed-contrast-focus-keyboard-six-widths',async({page,tab,button})=>{
  for(const width of [320,375,768,960,1024,1440]){
    await page.setViewportSize({width,height:900});await tab('Подбор');
    const panel=page.locator('details.preset-panel').first();await panel.evaluate(el=>el.open=true);
    await states(page,page.getByRole('tab',{name:'Подбор',exact:true}),'tab',width);
    const summary=panel.locator('summary');
    const disclosure=await summary.evaluate(el=>{const b=getComputedStyle(el,'::before'),a=getComputedStyle(el,'::after'),s=getComputedStyle(el);return {w:parseFloat(b.width),h:parseFloat(b.height),after:a.content,bg:s.backgroundColor};});
    assert(disclosure.w>=8&&disclosure.h>=8&&disclosure.after==='none'&&disclosure.bg!=='rgba(0, 0, 0, 0)',JSON.stringify(disclosure));
    await states(page,summary,'disclosure',width);
    await states(page,button('Start'),'Start',width);await fits(page,width);
    await button('Start').click();await button('Stop').waitFor();assert(await button('Stop').isEnabled());
    await states(page,button('Stop'),'Stop',width,{border:true});await button('Stop').click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Start')?.disabled);
    await tab('Настройки');await button('Восстановить из бекапа').waitFor();
    await states(page,button('Восстановить из бекапа'),'backup restore',width,{border:true});
    await states(page,button('Удалить бекап'),'backup delete',width);await fits(page,width);
  }
 });
 await scenario('S1-long-domain-header-and-debug-note-geometry',async({page,tab})=>{
  const name='very-long-domain-name-for-header-layout.example.test';
  await page.route('**/api/web/strategy-candidates-page?*',route=>route.fulfill({json:{...golden,candidates:[{...golden.candidates[0],seen:[{domain:name}]}],total:1,has_more:false}}));
  await tab('Кандидаты');const header=page.locator('summary.domain-header').first();await header.waitFor();
  for(const width of [320,375,1024]){
    await page.setViewportSize({width,height:900});await header.scrollIntoViewIfNeeded();
    const g=await header.evaluate(el=>{const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};},c=getComputedStyle(el,'::after');return {header:rect(el),title:rect(el.querySelector('.domain-title')),meta:rect(el.querySelector('.domain-meta')),display:c.display,w:parseFloat(c.width),h:parseFloat(c.height)};});
    assert(g.display!=='none'&&g.w>0&&g.h>0);assert(g.title.left<=g.meta.left&&g.meta.right<=g.header.right);
    assert(g.title.right<=g.meta.left+1||g.title.bottom<=g.meta.top+1,`${width}: ${JSON.stringify(g)}`);await fits(page,width);records.push({width,domain_header:g});
  }
  await tab('Настройки');
  for(const width of [320,375,1024]){
    await page.setViewportSize({width,height:900});const input=page.getByLabel('Debug-log',{exact:true});await input.scrollIntoViewIfNeeded();
    const g=await input.evaluate(el=>{const label=el.closest('label'),block=el.closest('.debug-log-toggle-block'),note=block?.querySelector('.debug-log-note');const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {contains:label?.contains(el),count:block?.querySelectorAll('input[type=checkbox]').length,block:rect(block),note:rect(note)};});
    assert(g.contains&&g.count===1);assert(g.note.left>=g.block.left-1&&g.note.right<=g.block.right+1&&g.note.top>=g.block.top-1&&g.note.bottom<=g.block.bottom+1,JSON.stringify(g));await fits(page,width);records.push({width,debug:g});
  }
 });
 await scenario('S1-v2fly-update-reload-failure-warning-XSS-and-active-unknown-gates',async({page,tab,button,requests})=>{
  await tab('Списки');await page.getByText('V2Fly',{exact:true}).click();
  let release,readyResolve;const ready=new Promise(resolve=>readyResolve=resolve);
  await page.route('**/api/service/v2fly/update-local-storage',r=>{release=r;readyResolve();});
  await button('Обновить каталог').evaluate(el=>{el.click();el.click();});await ready;
  assert(await button('Обновить каталог').isDisabled());assert(await button('Проверить локальный каталог').isDisabled());
  await page.route('**/api/core/presets/v2fly/categories?*',r=>r.fulfill({status:503,json:{error:{message:'forced category reload failure'}}}));
  await release.fulfill({json:{status:'success',storage:{group_count:2}}});await page.getByRole('status').filter({hasText:'forced category reload failure'}).waitFor();
  assert(!(await page.getByRole('status').filter({hasText:'Каталог v2fly обновлен'}).count()));assert(await button('Обновить каталог').isEnabled());
  await page.route('**/api/core/presets/v2fly/categories?*',r=>r.fulfill({json:{categories:[{name:'youtube'}],storage:{state:'ready',group_count:1}}}));
  const warning='<img src=x onerror=alert(1)>';
  await page.route('**/api/service/v2fly/update-local-storage',r=>r.fulfill({json:{status:'success',operation_id:'v2fly-update-local-storage',storage:{group_count:2},result:{revision_warning:warning}}}));
  await button('Обновить каталог').click();await page.getByText(`Каталог v2fly готов: 2 групп, но ревизия источника не подтверждена: ${warning}`,{exact:true}).waitFor();assert.equal(await page.locator('img').count(),0);
  for(const status of [{version:'0.4.4',state:{current_run_id:'external',current_run_status:'running'},zapret2:{nfqws2_found:true,blockcheck_found:true,root_helper_ready:true}}]){
    await page.evaluate(data=>window.__parityEmit('status',data),status);await settle(page);assert(await button('Обновить каталог').isDisabled());assert(await button('Проверить локальный каталог').isDisabled());
  }
 },{before:eventFixture});
 await scenario('S1-v2fly-unknown-status-from-fresh-idle-session',async({page,tab,button})=>{
  assert(await button('Start').isEnabled());assert(await button('Stop').isDisabled());
  await tab('Списки');await page.getByText('V2Fly',{exact:true}).click();
  assert(await button('Обновить каталог').isEnabled());assert(await button('Проверить локальный каталог').isEnabled());
  await page.evaluate(()=>window.__parityEmit('status',{state:{current_run_id:null,current_run_status:null}}));await settle(page);
  assert(await button('Обновить каталог').isDisabled());assert(await button('Проверить локальный каталог').isDisabled());
  await tab('Подбор');assert(await button('Start').isDisabled());assert(await button('Stop').isDisabled());
 },{before:eventFixture});
})().catch(error=>{records.push({pass:false,error:String(error.stack||error)});console.error(error);process.exitCode=1;}).finally(()=>{if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({kind:'S1 assertions on production Svelte with API fixtures',records},null,2));console.log(JSON.stringify(records));});
