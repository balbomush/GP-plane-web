/* Remaining S1 action negatives against production Svelte assets + HTTP fixtures. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createUi}=require('./browser-fixture.cjs');
const records=[];const requested=process.argv[3];
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function downloadedBytes(download){const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);return Buffer.concat(chunks);}
(async()=>{
for(const scenario of ['backups','backup-size','password','v2fly-error','busy-release'].filter(name=>!requested||name===requested)){
  const before=scenario==='busy-release'?function(){
    window.__busy=true;const original=window.fetch;
    window.fetch=(url,init)=>{
      const path=String(url);const json=data=>Promise.resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
      if(path.includes('/events/stream'))return Promise.resolve(new Response(new ReadableStream({start(controller){window.__emit=(event,data)=>controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));init.signal.addEventListener('abort',()=>controller.close(),{once:true});}})));
      if(path.endsWith('/api/web/status'))return json({version:'0.4.4',state:{current_run_id:window.__busy?'busy-owned':null,current_run_status:window.__busy?'running':null},zapret2:{nfqws2_found:true,blockcheck_found:true,root_helper_ready:true}});
      if(path.includes('/history-page'))return json({runs:[{run_id:'busy-owned',status:window.__busy?'running':'stopped',timestamp:'2026-10-20'}],has_more:false,total:1});
      return original(url,init);
    };
  }:undefined;
  const ui=await createUi({before}),{page,tab,button}=ui;
  try{
    if(scenario==='backups'){
      await tab('Настройки');await page.getByRole('heading',{name:'fixture-backup',exact:true}).waitFor();
      await button('Создать бекап').click();await page.getByText('Операция с бекапом выполнена',{exact:true}).waitFor();
      assert.equal(ui.requests.filter(r=>r.path.endsWith('/backups/create')).length,1);
      const bytes=Buffer.from('PK\0test-only archive α','utf8');let downloadHeaders;
      await page.route('**/api/core/backups/download-archive?*',route=>{downloadHeaders=route.request().headers();assert(!route.request().url().includes('token='));return route.fulfill({contentType:'application/zip',headers:{'Content-Disposition':'attachment; filename="exact-archive.zip"'},body:bytes});});
      const pending=page.waitForEvent('download');await button('Download archive').click();const download=await pending;
      assert.equal(download.suggestedFilename(),'exact-archive.zip');assert.deepEqual(await downloadedBytes(download),bytes);assert.equal(downloadHeaders.authorization,'Bearer synthetic-test-token');
      page.once('dialog',dialog=>dialog.dismiss());await button('Восстановить из бекапа').click();assert.equal(ui.requests.filter(r=>r.path.endsWith('/backups/restore')).length,0);
      page.once('dialog',dialog=>{assert(dialog.message().includes('Пользовательские пресеты не меняются'));dialog.accept();});await button('Восстановить из бекапа').click();
      await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(node=>node.textContent==='Создать бекап')?.disabled);
      assert.deepEqual(ui.requests.find(r=>r.path.endsWith('/backups/restore')).body,{snapshot_id:'fixture-backup'});
      page.once('dialog',dialog=>dialog.dismiss());await button('Удалить бекап').click();assert.equal(ui.requests.filter(r=>r.path.endsWith('/backups/delete')).length,0);
      page.once('dialog',dialog=>dialog.accept());await button('Удалить бекап').click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(node=>node.textContent==='Создать бекап')?.disabled);
      assert.deepEqual(ui.requests.find(r=>r.path.endsWith('/backups/delete')).body,{snapshot_id:'fixture-backup'});
      const upload=Buffer.from('PK\0opaque synthetic upload');let actual;
      await page.route('**/api/core/backups/upload',route=>{actual=route.request().postDataBuffer();assert.equal(route.request().headers()['content-type'],'application/zip');return route.fulfill({contentType:'application/json',body:'{}'});});
      await page.getByLabel('ZIP-архив (до 64 МиБ)',{exact:true}).setInputFiles({name:'owned.zip',mimeType:'application/zip',buffer:upload});await button('Загрузить бекап').click();await page.getByText('Архив загружен',{exact:true}).waitFor();assert.deepEqual(actual,upload);
      assert.equal(ui.requests.filter(r=>r.path.includes('clean-install-vault')).length,0);assert.equal(await page.getByRole('button',{name:/vault/i}).count(),0);
    }else if(scenario==='backup-size'){
      await tab('Настройки');const tmp=fs.realpathSync(os.tmpdir()),owned=fs.mkdtempSync(path.join(tmp,'gp-s3-backup-size-'));
      assert.equal(path.dirname(fs.realpathSync(owned)),tmp);
      const large=path.join(owned,'too-large.zip'),input=page.getByLabel('ZIP-архив (до 64 МиБ)',{exact:true});
      try{
        const fd=fs.openSync(large,'wx');try{fs.ftruncateSync(fd,64*1024*1024+1);}finally{fs.closeSync(fd);}
        await input.setInputFiles(large);await button('Загрузить бекап').click();await page.getByText('Архив превышает 64 МиБ',{exact:true}).waitFor();
        assert.equal(ui.requests.filter(r=>r.path.endsWith('/backups/upload')).length,0);
      }finally{await input.setInputFiles([]);assert.equal(path.dirname(fs.realpathSync(owned)),tmp);fs.rmSync(owned,{recursive:true});}
    }else if(scenario==='password'){
      await tab('Настройки');await page.getByText('Пароль',{exact:true}).click();
      let reject=true;const bodies=[];
      await page.route('**/api/auth/change-password',route=>{bodies.push(route.request().postDataJSON());return route.fulfill({status:reject?400:200,contentType:'application/json',body:reject?JSON.stringify({error:{code:'invalid_current_password',message:'Текущий пароль неверен'}}):JSON.stringify({access_token:'replacement-must-not-be-stored'})});});
      await page.getByLabel('Текущий пароль',{exact:true}).fill('wrong');await page.getByLabel('Новый пароль',{exact:true}).fill('admin');assert(await page.getByLabel('Новый пароль',{exact:true}).evaluate(node=>node.checkValidity()));
      await button('Изменить пароль').click();await page.getByText('Текущий пароль неверен',{exact:true}).waitFor();assert.equal(await page.getByRole('tablist').count(),1);assert.equal(await page.getByLabel('Новый пароль',{exact:true}).inputValue(),'admin');
      reject=false;await page.getByLabel('Текущий пароль',{exact:true}).fill('current-only');await button('Изменить пароль').click();await button('Войти').waitFor();assert.deepEqual(bodies[1],{current_password:'current-only',new_password:'admin'});assert.equal(await page.evaluate(()=>localStorage.length),0);assert.equal(await page.getByRole('tablist').count(),0);
    }else if(scenario==='v2fly-error'){
      await tab('Списки');await page.getByText('V2Fly',{exact:true}).click();await button('Проверить локальный каталог').click();await page.getByLabel('Категории',{exact:true}).selectOption(['category-a']);
      let held,resolveReady;const ready=new Promise(resolve=>resolveReady=resolve);
      await page.route('**/api/service/v2fly/update-local-storage',route=>{held=route;resolveReady();});
      await button('Обновить каталог').evaluate(node=>{node.click();node.click();});await ready;assert(await button('Обновить каталог').isDisabled());assert(await button('Проверить локальный каталог').isDisabled());
      await held.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'storage_unavailable',message:'Каталог временно недоступен'}})});await page.getByText('Каталог временно недоступен',{exact:true}).waitFor();assert(await button('Обновить каталог').isEnabled());assert.equal(await page.getByLabel('Категории',{exact:true}).locator('option').count(),1);
    }else if(scenario==='busy-release'){
      await tab('Настройки');await settle(page);assert.equal(ui.requests.filter(r=>r.path.endsWith('/releases/available')).length,0);assert(await button('Создать бекап').isDisabled());assert(await button('Сохранить настройки').isDisabled());
      await page.evaluate(()=>{window.__busy=false;window.__emit('runs',{});window.__emit('status',{version:'0.4.4',state:{current_run_id:null,current_run_status:null},zapret2:{nfqws2_found:true,blockcheck_found:true,root_helper_ready:true}});});
      await page.getByText('Версии и обновления',{exact:true}).click();await page.getByRole('link',{name:'Открыть 0.4.4',exact:true}).waitFor();assert.equal(ui.requests.filter(r=>r.path.endsWith('/releases/available')).length,1);assert(await button('Создать бекап').isEnabled());
    }
    assert.deepEqual(ui.errors,[]);records.push({scenario,pass:true});console.log(scenario+' PASS');
  }catch(error){records.push({scenario,pass:false,error:String(error.stack||error)});throw error;}
  finally{await ui.close();}
}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({kind:'Svelte operations/browser HTTP fixtures',temporary_directory:process.env.TEMP,records},null,2));});
