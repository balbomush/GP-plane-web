/* R2 lifetime cases ported to actual Svelte events; no legacy global runtime. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createUi}=require('./browser-fixture.cjs');
const names=['v2fly-choice','editor-draft','logout-lifetime','dispose-fallback','blob-abort','upload-release','upload-headers','start-rebootstrap','new-form-draft','finder-save-draft'];
const records=[];const requested=process.argv[3];
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function hold(page,part,mode='headers'){
  await page.evaluate(({part,mode})=>{
    const original=window.fetch;
    window.fetch=(url,init)=>{
      if(!String(url).includes(part))return original(url,init);
      const held=window.__held={signal:init.signal,mode};
      if(mode==='body'){
        const response=held.response={ok:true,status:200,headers:new Headers({'Content-Type':'application/json'}),json:()=>new Promise(resolve=>held.finishBody=resolve)};
        return Promise.resolve(response);
      }
      return new Promise((resolve,reject)=>{
        held.finish=data=>resolve(held.response=new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
        if(mode==='abort')init.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});
      });
    };
  },{part,mode});
}
function beforeFallback(){
  const interval=window.setInterval.bind(window),clear=window.clearInterval.bind(window);
  window.__fallbackTimers=new Set();window.__streams=0;
  window.setInterval=(callback,delay,...args)=>{const id=interval(callback,delay,...args);if(delay===30000)window.__fallbackTimers.add(id);return id;};
  window.clearInterval=id=>{window.__fallbackTimers.delete(id);return clear(id);};
  const original=window.fetch;
  window.fetch=(url,init)=>String(url).includes('/events/stream')?Promise.resolve(new Response(new ReadableStream({start(controller){window.__streams++;init.signal.addEventListener('abort',()=>{window.__streams--;controller.close();},{once:true});}}))):original(url,init);
}
(async()=>{
for(const scenario of names.filter(name=>!requested||name===requested)){
  const ui=await createUi({before:scenario==='dispose-fallback'?beforeFallback:undefined});
  const {page,tab,button}=ui;
  try{
    if(scenario==='v2fly-choice'){
      await tab('Списки');await page.getByLabel('Название',{exact:true}).fill('v2fly-old');await page.getByText('V2Fly',{exact:true}).click();
      await button('Проверить локальный каталог').click();await page.getByLabel('Категории',{exact:true}).selectOption(['category-a']);
      await hold(page,'/category-domains');await button('Предпросмотр').click();await page.waitForFunction(()=>window.__held);
      await page.getByLabel('Поиск категории',{exact:true}).fill('new');await page.getByLabel('Название',{exact:true}).fill('v2fly-new');
      await page.evaluate(()=>window.__held.finish({domains:['late.example']}));await settle(page);
      assert.equal(await page.getByLabel('Название',{exact:true}).inputValue(),'v2fly-new');assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'');await page.getByText('Доменов в предпросмотре: 0',{exact:true}).waitFor();
    }else if(scenario==='editor-draft'){
      await tab('Списки');await hold(page,'/presets/domains');await page.getByLabel('Список',{exact:true}).selectOption('custom:mine');await page.waitForFunction(()=>window.__held);
      await page.getByLabel('Домены',{exact:true}).fill('new-draft.example');await page.evaluate(()=>window.__held.finish({domains:[{domain:'old.example'}],has_more:false}));await settle(page);
      assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'new-draft.example');
    }else if(scenario==='new-form-draft'){
      await tab('Списки');await page.getByLabel('Название',{exact:true}).fill('old-list');await page.getByLabel('Домены',{exact:true}).fill('old.example');await hold(page,'/presets/save');await button('Сохранить').click();await page.waitForFunction(()=>window.__held);
      await page.getByLabel('Название',{exact:true}).fill('new-list');await page.getByLabel('Домены',{exact:true}).fill('new.example');await page.evaluate(()=>window.__held.finish({custom:{finder:{'old-list':['old.example']}}}));await settle(page);
      assert.equal(await page.getByLabel('Название',{exact:true}).inputValue(),'new-list');assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'new.example');
    }else if(scenario==='finder-save-draft'){
      await page.getByText('Сохранение списка доменов',{exact:true}).click();await page.getByLabel('Название пользовательского списка',{exact:true}).fill('old-finder');await hold(page,'/presets/save');await button('Сохранить список подбора').click();await page.waitForFunction(()=>window.__held);
      await page.getByLabel('Домены',{exact:true}).fill('new-finder.example');await page.evaluate(()=>window.__held.finish({custom:{finder:{'old-finder':['example.com']}}}));await settle(page);
      assert.equal(await page.getByLabel('Домены',{exact:true}).inputValue(),'new-finder.example');assert.equal(await page.getByLabel('Список доменов',{exact:true}).inputValue(),'custom');
    }else if(scenario==='logout-lifetime'){
      await tab('Настройки');await hold(page,'/releases/available','abort');await page.getByText('Версии и обновления',{exact:true}).click();await button('Проверить обновления Core').click();await page.waitForFunction(()=>window.__held);
      await button('Выйти').click();await button('Войти').waitFor();assert(await page.evaluate(()=>window.__held.signal.aborted));assert.equal(await page.getByRole('tablist').count(),0);
    }else if(scenario==='dispose-fallback'){
      assert.equal(await page.evaluate(()=>window.__fallbackTimers.size),1);assert.equal(await page.evaluate(()=>window.__streams),1);
      await button('Выйти').click();await button('Войти').waitFor();assert.equal(await page.evaluate(()=>window.__fallbackTimers.size),0);assert.equal(await page.evaluate(()=>window.__streams),0);
    }else if(scenario==='blob-abort'){
      await tab('Настройки');await button('Download archive').waitFor();await hold(page,'/download-archive');await button('Download archive').click();await page.waitForFunction(()=>window.__held);
      await tab('Подбор');assert(await page.evaluate(()=>window.__held.signal.aborted));await page.evaluate(()=>window.__held.finish({opaque:'archive'}));await settle(page);
      assert.equal(await page.evaluate(()=>!!window.__held.response.__gpRequestLifetime),false);
    }else if(scenario==='upload-release'||scenario==='upload-headers'){
      await tab('Настройки');await page.getByLabel('ZIP-архив (до 64 МиБ)',{exact:true}).setInputFiles({name:'review.zip',mimeType:'application/zip',buffer:Buffer.from('test-only opaque bytes')});
      await hold(page,'/backups/upload',scenario==='upload-release'?'body':'headers');await button('Загрузить бекап').click();await page.waitForFunction(()=>window.__held&&(window.__held.mode!=='body'||window.__held.finishBody));
      await tab('Подбор');assert(await page.evaluate(()=>window.__held.signal.aborted));
      await page.evaluate(()=>window.__held.mode==='body'?window.__held.finishBody({}):window.__held.finish({}));await settle(page);
      assert.equal(await page.evaluate(()=>!!window.__held.response.__gpRequestLifetime),false);assert.equal(await page.getByText('Архив загружен',{exact:true}).count(),0);
    }else if(scenario==='start-rebootstrap'){
      await hold(page,'/run-settings/save','abort');await button('Start').click();await page.waitForFunction(()=>window.__held);
      await button('Выйти').click();await button('Войти').waitFor();assert(await page.evaluate(()=>window.__held.signal.aborted));
      await page.getByLabel('Пароль',{exact:true}).fill('new-session');await button('Войти').click();await page.getByRole('tablist').waitFor();assert(await button('Start').isEnabled());assert.equal(ui.requests.filter(r=>r.path.endsWith('/start-run')).length,0);
    }
    assert.deepEqual(ui.errors,[]);records.push({scenario,pass:true});console.log(scenario+' PASS');
  }catch(error){records.push({scenario,pass:false,error:String(error.stack||error)});throw error;}
  finally{await ui.close();}
}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({kind:'Svelte production assets/UI fixtures; R2 lifetime adaptation',records},null,2));});
