<script lang="ts">
 import {newUpdateId} from '../domain/update-id.js';import {onMount,onDestroy} from 'svelte';import {GpFrame,GpConfirm,type Dto} from '@gp-plane/gp-ui/api2';import type {Shell} from '../app/shell.svelte';
 let {app}:{app:Shell}=$props();let tab=$state('update'),error=$state(''),message=$state(''),busy=$state(false),tag=$state<'alpha'|'prerelease'|'stable'>('stable'),version=$state(''),releases=$state<Dto['Release'][]>([]),download=$state<Dto['Download']|null>(null),update=$state<Dto['Update']|null>(null),unknown=$state(false),updateId=$state(''),backup=$state<Dto['Backup']|null>(null),file=$state<File|null>(null),username=$state(''),oldPassword=$state(''),newPassword=$state('');
 let confirmation=$state<{title:string;description:string;action:()=>void}|null>(null);const controller=new AbortController();const target=document.querySelector<HTMLMetaElement>('meta[name=gp-core-target]')?.content;const storageKey=target?'gp-core-update:'+location.origin+':'+target:null;let generation=0,releaseRevision=0;let catalogReady=$state(false);
 onMount(()=>{try{const saved=JSON.parse(storageKey?localStorage.getItem(storageKey)||'null':'null');if(saved?.id){updateId=saved.id;readUpdate();}}catch{error='Не удалось прочитать локальный ID установки';}});onDestroy(()=>{controller.abort();generation++;});
 const options=()=>({signal:controller.signal});
 type RestoreAttempt = {key:string|null; file:File|null};
 let pendingRestore=$state.raw<RestoreAttempt|null>(null);
 function supportsRestoreRetry(status:Dto['CoreStatus']|null|undefined) {
  return status != null && 'backup_restore_idempotency' in status && status.backup_restore_idempotency === true;
 }
 const canRetryRestore=$derived(app.gp.statusFresh && supportsRestoreRetry(app.gp.status));
 function confirm(title:string,description:string,action:()=>void){confirmation={title,description,action};}
 async function execute(action:()=>Promise<any>,apply:(data:any)=>void,uncertain=false){if(busy)return;busy=true;error='';message='';const epoch=generation;try{const data=await action();if(epoch===generation)apply(data);}catch(e){if(!controller.signal.aborted){error=(uncertain&&!(e as any).data?'Итог неизвестен. Автоматический повтор не выполняется. ':'')+(e as Error).message;}}finally{if(epoch===generation)busy=false;}}
 async function loadReleases(){const rev=++releaseRevision;catalogReady=false;version='';releases=[];error='';try{const data=await app.client.listReleases({query:{tag}},options());if(rev===releaseRevision&&!controller.signal.aborted){catalogReady=true;releases=data.items;version=data.items[0]?.version||'';}}catch(e){if(rev===releaseRevision&&!controller.signal.aborted)error=(e as Error).message;}}
 async function downloadCore(){if(!catalogReady)return;const chosen={version,tag};await execute(()=>app.client.downloadCore({body:chosen},options()),data=>{download=data;message='Поставка скачана на Core: '+data.size_bytes+' Б';});}
 function install(){const chosen=download;if(!chosen)return;confirm('Установить версию Core','Программа Core будет обновлена. Данные, пароль и настройки сохраняются. Связь может временно прерваться.',async()=>{if(busy)return;if(!storageKey){error='Неизвестна привязка Web к Core. Перезагрузите панель.';return;}let id:string;try{id=newUpdateId();localStorage.setItem(storageKey,JSON.stringify({id,version:chosen.version,tag:chosen.tag}));}catch{error='Нельзя сохранить ID установки. Запрос не отправлен.';return;}updateId=id;update=null;unknown=true;await execute(()=>app.client.startCoreUpdate({body:{version:chosen.version,tag:chosen.tag,update_id:id}},options()),data=>{update=data;unknown=false;},true);});}
 async function readUpdate(){if(!updateId)return;try{update=await app.client.getCoreUpdate({path:{update_id:updateId}},options());unknown=false;}catch{unknown=true;}}
 function backupCreate(){const exists=app.gp.status?.backup_exists;const perform=()=>execute(()=>app.client.createBackup({},options()),data=>{backup=data;if(app.gp.status)app.gp.status.backup_exists=true;message='Копия создана';});if(exists)confirm('Заменить копию?','Прежняя сохранённая копия будет заменена новой.',perform);else perform();}
 function backupDelete(){confirm('Удалить копию?','Пользовательские данные Core останутся. Удалится только сохранённая резервная копия.',()=>execute(()=>app.client.deleteBackup({},options()),()=>{backup=null;if(app.gp.status)app.gp.status.backup_exists=false;message='Копия удалена';}));}
 async function downloadBackup(){await execute(async()=>{const blob=await app.client.downloadBackup({},options()) as unknown as Blob;await app.client.save(blob,'gp-backup.zip');},()=>message='Архив передан браузеру для сохранения');}
 function restore(fromFile:boolean){
  const chosen=fromFile?file:null;
  if(fromFile&&!chosen){error='Выберите ZIP-файл';return;}
  if(chosen&&chosen.size>64*1024*1024){error='Файл превышает 64 МиБ';return;}
  confirm('Заменить пользовательские данные?','Восстановление заменит пользовательские данные, а не объединит их. Пароль и настройки установки сохраняются. Файл не подменяет сохранённую копию.',()=>{
   if(busy)return;
   let key:string|null=null;
   try{if(canRetryRestore)key=newUpdateId();}
   catch{error='Не удалось создать ID восстановления. Запрос не отправлен.';return;}
   pendingRestore=null;
   void performRestore({key,file:chosen});
  });
 }
 async function performRestore(attempt:RestoreAttempt,retry=false){
  if(busy||retry&&(!attempt.key||!canRetryRestore))return;
  busy=true;error='';message='';
  const epoch=generation;
  let submitted=false;
  try{
   if(retry){
    const status=await app.client.getCoreStatus({},options());
    if(epoch!==generation)return;
    if(!supportsRestoreRetry(status)){
     app.gp.status=status;
     app.gp.statusFresh=true;
     error='Core не подтвердил поддержку безопасного повтора. Запрос не отправлен.';
     return;
    }
   }
   const requestOptions={...options(),...(attempt.key?{headers:{'Idempotency-Key':attempt.key}}:{})};
   submitted=true;
   const data=attempt.file?await app.client.restoreBackupFile({body:attempt.file as any},requestOptions):await app.client.restoreSavedBackup({},requestOptions);
   if(epoch!==generation)return;
   pendingRestore=null;
   message='Восстановлено'+(data.warnings?.length?' · '+data.warnings.map(x=>x.message).join(' · '):'');
   app.gp.refresh();app.gp.loadLists();app.gp.loadMilestones();
  }catch(e){
   if(controller.signal.aborted)return;
   const failure=e as Error&{data?:unknown;status?:number;code?:string};
   if(!submitted){
    error='Не удалось подтвердить поддержку безопасного повтора. Запрос не отправлен.';
    return;
   }
   const uncertain=!failure.data||(failure.status??0)>=500;
   if(uncertain&&attempt.key)pendingRestore=attempt;
   else if(!retry||(!uncertain&&failure.status!==408&&failure.code!=='busy'))pendingRestore=null;
   error=(uncertain?'Итог неизвестен. Автоматический повтор не выполняется. ':'')+failure.message;
  }finally{if(epoch===generation)busy=false;}
 }
 function milestone(){confirm('Создать следующую веху?','Новая веха станет текущей. Старые результаты останутся доступны; прежний поиск нельзя будет продолжить.',()=>execute(()=>app.client.createMilestone({},options()),data=>{app.gp.catalogContext=null;app.gp.milestone=data.id;message='Текущая веха №'+data.id;app.gp.loadMilestones();}));}
 async function password(){error=[!username?'Введите логин':'',!oldPassword?'Введите старый пароль':'',!newPassword?'Введите новый пароль':''].filter(Boolean).join(' · ');if(error)return;await execute(async()=>app.auth.changePassword({username,old_password:oldPassword,new_password:newPassword},e=>{throw e;}),()=>{oldPassword='';newPassword='';});}
 function changeTab(name:string){tab=name;error='';message='';}
</script>
<GpFrame><div class="service-page" class:service-page-access={tab==='access'}>
 <div class="service-header">
  <div class="section-heading"><div><p class="eyebrow">Система</p><h1>Обслуживание</h1></div></div>
  <div class="service-health">
   <p class="muted">Core {app.gp.status?.core_version} · API {app.gp.status?.api_version} · хранилище {app.gp.status?.storage}</p>
   <button onclick={()=>app.gp.refresh()}>Проверить состояние Core</button>
  </div>
 </div>
 <div class="subnav">{#each [['update','Обновление'],['backup','Резервная копия'],['milestones','Вехи'],['access','Доступ']] as [id,name] (id)}<button aria-pressed={tab===id} onclick={()=>changeTab(id)}>{name}</button>{/each}</div>
 {#if error}<p role="alert" class="notice error">{error}</p>{/if}{#if message}<p role="status" class="notice">{message}</p>{/if}
 {#if tab==='backup'&&pendingRestore&&canRetryRestore}
  <div class="actions"><button disabled={busy} onclick={()=>{if(pendingRestore)void performRestore(pendingRestore,true);}}>Повторить восстановление</button>
   {#if pendingRestore.file}<span class="muted">Файл {pendingRestore.file.name}</span>{/if}
  </div>
 {/if}
 {#if tab==='update'}<div class="pair service-layout service-update"><section class="panel stack"><h2>Обновление Core</h2><p class="muted">Сначала скачайте поставку на Core, затем отдельно подтвердите установку.</p><label>Стадия<select aria-label="Стадия" bind:value={tag} onchange={()=>{download=null;loadReleases();}}><option value="stable">Стабильная</option><option value="alpha">Альфа</option><option value="prerelease">Предварительная</option></select></label><button onclick={loadReleases}>Проверить выпуски</button><label>Версия Core<select aria-label="Версия Core" bind:value={version} onchange={()=>download=null}><option value="">Выберите версию</option>{#each releases as row (row.version)}<option value={row.version}>{row.version} · {row.tag}</option>{/each}</select></label><button disabled={busy||!app.gp.canMutate||!version||!catalogReady} onclick={downloadCore}>Скачать на Core</button>{#if download}<p>Скачано на Core: {download.version} · {download.tag} · {download.size_bytes} Б</p><button class="primary" disabled={busy||!app.gp.canMutate} onclick={install}>Установить Core</button>{/if}</section><section class="panel stack"><h2>Результат обновления</h2>{#if updateId}<p class="muted">ID: {updateId}</p><p role="status">{unknown?'Итог неизвестен':update?.state==='succeeded'?'Установка завершена':update?.state==='failed'?'Установка не выполнена':update?.state==='unknown'?'Итог неизвестен':'Установка выполняется'}</p>{#if update?.error}<p>{update.error.message}</p>{/if}<button onclick={readUpdate}>Проверить результат установки</button>{:else}<p class="muted">В этом клиенте установка ещё не запускалась.</p>{/if}<p class="muted">После обрыва читается отчёт того же ID. Установка автоматически не повторяется.</p></section></div>
 {:else if tab==='backup'}<div class="pair service-layout"><section class="panel stack"><h2>Сохранённая копия</h2><p>{app.gp.status?.backup_exists?'Копия есть':'Копии нет'}</p>{#if backup}<p>{backup.created_at} · {backup.size_bytes} Б</p><p class="muted">SHA256: {backup.sha256}</p>{/if}<button onclick={async()=>{message='';await app.gp.refresh();if(app.gp.statusFresh)message='Наличие копии проверено';}}>Проверить наличие копии</button>{#if app.gp.status?.backup_exists}<div class="actions"><button disabled={busy||!app.gp.canMutate} onclick={downloadBackup}>Скачать резервную копию</button></div><hr/>{/if}<div class="stack"><button class="primary" disabled={busy||!app.gp.canMutate} onclick={backupCreate}>{app.gp.status?.backup_exists?'Заменить копию':'Создать копию'}</button>{#if app.gp.status?.backup_exists}<button disabled={busy||!app.gp.canMutate} onclick={()=>restore(false)}>Восстановить сохранённую копию</button><button class="danger" disabled={busy||!app.gp.canDeleteBackup} onclick={backupDelete}>Удалить копию</button>{/if}</div></section><section class="panel stack"><h2>Восстановить из файла</h2><label>Файл резервной копии<input type="file" accept=".zip,application/zip" onchange={e=>file=e.currentTarget.files?.[0]||null}/></label><p class="muted">ZIP до 64 МиБ. Восстановление заменяет данные, не переносит пароль и не подменяет сохранённую копию.</p><button disabled={busy||!app.gp.canMutate||!file} onclick={()=>restore(true)}>Восстановить из файла</button></section></div>
 {:else if tab==='milestones'}<div class="pair service-layout"><section class="panel stack"><h2>Вехи результатов</h2><p>Текущая веха №{app.gp.milestone}</p>{#each app.gp.milestones as row (row.id)}<p>№{row.id}{row.id===app.gp.milestone?' · текущая':''}</p>{/each}<button class="primary" disabled={busy||!app.gp.canCreateMilestone} onclick={milestone}>Создать следующую веху</button></section><section class="panel stack"><h2>Что изменится</h2><p>Прежние результаты останутся доступны по выбранной вехе. Имена, удаление и возврат старой вехи не поддерживаются.</p></section></div>
 {:else}<section class="panel stack service-access"><h2>Доступ к Core</h2><p class="muted">После смены пароля нужен новый вход. Поиск продолжится.</p><form class="stack" onsubmit={e=>{e.preventDefault();password();}} novalidate><label>Логин<input name="username" autocomplete="username" bind:value={username}/></label><label>Старый пароль<input type="password" name="old_password" autocomplete="current-password" bind:value={oldPassword}/></label><label>Новый пароль<input type="password" name="new_password" autocomplete="new-password" bind:value={newPassword}/></label><button class="primary" disabled={busy}>Сменить пароль</button></form></section>{/if}
 {#if confirmation}<GpConfirm title={confirmation.title} description={confirmation.description} confirm={()=>{const action=confirmation!.action;confirmation=null;action();}} cancel={()=>confirmation=null}/>{/if}
</div></GpFrame>

<style>
 .service-header { display:grid; gap:8px; margin-bottom:12px; }
 .service-header .section-heading { margin-bottom:0; }
 .service-health {
   display:flex;
   flex-wrap:wrap;
   align-items:center;
   gap:8px 12px;
 }
 .service-health p { flex:0 1 auto; }
 @container (max-width:480px) {
   .service-health p { flex:1 1 6.5rem; min-width:0; }
 }
 .service-layout { align-items:start; }
 @container (min-width:761px) {
   .service-update { grid-template-columns:minmax(0,1.4fr) minmax(235px,.8fr); gap:24px; }
 }
</style>
