const fs=require('node:fs'),assert=require('node:assert/strict');
const {createUi}=require('./browser-fixture.cjs');
const records=[],only=process.argv[3];
const tick=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function scenario(name,run){if(only&&only!==name)return;const ui=await createUi();try{await run(ui);assert.deepEqual(ui.errors,[]);records.push({scenario:name,pass:true});}finally{await ui.close();}}
(async()=>{
 await scenario('current-401-clears-shell',async({page,tab,button})=>{
  await tab('Кандидаты');await page.locator('[data-result]').first().waitFor();
  await page.route('**/api/web/strategy-candidates-page?*',route=>route.fulfill({status:401,body:'revoked'}));
  await button('Обновить кандидатов').click();await button('Войти').waitFor();
  assert.equal(await page.locator('[data-result]').count(),0);assert.equal(await page.getByRole('tablist').count(),0);
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 });
 for(const phase of ['headers','body'])await scenario('old-401-'+phase+'-cannot-revoke-replacement',async({page,tab,button})=>{
  await tab('Кандидаты');await page.locator('[data-result]').first().waitFor();
  await page.evaluate(phase=>{
   const native=window.fetch;let armed=true;
   window.fetch=(url,init)=>{
    if(!armed||!String(url).includes('/strategy-candidates-page'))return native(url,init);
    armed=false;window.__held={signal:init.signal};
    if(phase==='headers')return new Promise(resolve=>window.__held.finish=()=>resolve(new Response('old401',{status:401})));
    window.__held.response={ok:false,status:401,text:()=>new Promise(resolve=>window.__held.finish=()=>resolve('old401'))};
    return Promise.resolve(window.__held.response);
   };
  },phase);
  await button('Обновить кандидатов').click();await page.waitForFunction(()=>window.__held?.finish);
  await button('Выйти').click();await button('Войти').waitFor();assert(await page.evaluate(()=>window.__held.signal.aborted));
  await page.getByLabel('Пароль',{exact:true}).fill('replacement');await button('Войти').click();await page.getByRole('tablist').waitFor();
  await page.evaluate(()=>window.__held.finish());await tick(page);
  assert.equal(await page.getByRole('tablist').count(),1);assert.equal(await button('Войти').count(),0);
  assert.equal(await page.evaluate(()=>!!window.__held.response?.__gpRequestLifetime),false);
  assert(!(await page.locator('body').innerText()).includes('old401'));
 });
 await scenario('asset-missing-explicit-reload',async({context,url})=>{
  const page=await context.newPage();await page.route('**/assets/*.js',route=>route.fulfill({status:404,body:''}));
  await page.goto(url);await page.locator('#asset-error').waitFor({state:'visible'});
  assert(await page.getByRole('button',{name:/Перезагрузить/}).count()||await page.locator('#asset-error a').count());await page.close();
 });
})().catch(error=>{records.push({pass:false,error:String(error.stack||error)});process.exitCode=1;}).finally(()=>{if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({kind:'production Svelte UI HTTP fixtures; session/body phases',records},null,2));console.log(JSON.stringify(records));});
