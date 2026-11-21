<script lang="ts">
 import {onDestroy} from 'svelte';
 import {Requests,statusName,time,type GpClient,type Dto} from '../client';
 import type {GpSession} from '../session.svelte';
 import Frame from '../Frame.svelte';
 import RunLog from './RunLog.svelte';
 import {enabledProtocols} from './parameters';

 let {client,session,onNew}:{client:GpClient;session:GpSession;onNew?:()=>void}=$props();
 const requests=new Requests();
 let detail=$state<Dto['RunDetail']|null>(null);
 let lastStrategy=$state<{id:string; args:string}|null>(null);
 const run=$derived(session.current.run||session.terminal);
 const progress=$derived(session.current.run?.progress);
 const currentDetail=$derived(detail?.id===run?.id?detail:null);
 const protocols=$derived(enabledProtocols(currentDetail?.parameters));
 const domains=$derived(currentDetail?.domains||[]);
 const status=$derived(run ? statusName(run.status) : 'Состояние поиска');
 const previousArgs=$derived(lastStrategy?.id === run?.id ? lastStrategy?.args : undefined);

 $effect(()=>{
   const activeRun=session.current.run;
   const args=activeRun?.progress.current_args;
   if(activeRun && args)lastStrategy={id:activeRun.id,args};
 });

 $effect(()=>{
   const id=run?.id;
   detail=null;
   if(id)requests.run('detail',signal=>client.getRun({path:{run_id:id}},{signal}),row=>detail=row,()=>{});
   else requests.cancel('detail');
 });
 onDestroy(()=>requests.dispose());
</script>

<Frame>
 {#if run||session.message}
   <div class="section-heading">
     <div>
       <p class="eyebrow">Поиск стратегий</p>
       <h1>{status}</h1>
       <p class="muted">{run?.engine?.name||'Движок неизвестен'}</p>
     </div>
     <div class="actions">
       <span class="badge">{session.connected?'Связь с Core':'Последние данные · нет связи'}</span>
       {#if run}<span class="badge">Веха №{run.milestone_id}</span>{/if}
     </div>
   </div>
   <div class="current-layout">
     <div class="current-overview">
       <section class="panel current-main">
         <div class="current-header">
           {#if run?.status!=='stopped'}<span class="badge">{status}</span>{/if}
           {#if progress}
             <div class="current-progress">
               <p class="muted">{progress.checked===null?'Объём неизвестен':`${progress.checked} / ${progress.total===null?'неизвестно':progress.total}`}</p>
               {#if progress.checked!==null&&progress.total!==null&&progress.total>0}
                 <progress aria-label="Прогресс поиска" value={progress.checked} max={progress.total}></progress>
               {/if}
             </div>
           {/if}
           <div class="actions">
             {#if session.current.active}
               <button aria-label="Остановить поиск" class="danger" disabled={Boolean(session.pending)} onclick={()=>session.stop()}>{session.pending==='stop'?'Остановка…':'Остановить поиск'}</button>
             {:else}
               <button class="primary" onclick={()=>{session.newSearch();onNew?.();}}>Новый поиск</button>
               {#if session.terminal?.resume_available&&session.terminal.engine?.code==='blockcheck2-gp'}
                 <button disabled={!session.canMutate} onclick={()=>session.resume(session.terminal!)}>Продолжить поиск</button>
               {/if}
             {/if}
             <button onclick={()=>session.refresh()}>Проверить состояние</button>
           </div>
         </div>
         <h2>{session.current.active?'Проверка стратегий':'Итог поиска'}</h2>
         {#if run?.status==='stopped'}
           <p class="muted">Если поиск успел сохранить результаты, они доступны в разделе «Результаты» по вехе этого запуска.</p>
         {/if}
         {#if run?.error}<p role="alert" class="notice error">{run.error.message}</p>{/if}
         {#if session.message && !(run?.status==='stopped' && session.message===status)}
           <p role="status" class="notice">{session.message}</p>
         {/if}
         {#if session.current.active}
           <div class="current-strategy">
             <h3>Текущая стратегия</h3>
             {#if progress?.current_args}
               <pre>{progress.current_args}</pre>
             {:else}
               <p class="muted">Текущие аргументы неизвестны</p>
             {/if}
           </div>
         {:else if previousArgs}
           <div class="current-strategy"><h3>Последняя показанная стратегия</h3><pre>{previousArgs}</pre></div>
         {/if}
         <div class="current-facts">
           {#if protocols.length}<p class="muted">Протоколы: {protocols.join(' · ')}</p>{/if}
           <p class="muted">Начало: {time(run?.started_at)}</p>
           {#if session.terminal?.finished_at}<p class="muted">Завершение: {time(session.terminal.finished_at)}</p>{/if}
         </div>
       </section>
       <aside class="panel current-domains">
         <div class="current-domains-inner">
           <div class="current-domains-title"><h2>Домены</h2><span class="muted">{domains.length}</span></div>
           <div class="scroll-domains">
             {#if domains.length}
               <ul>{#each domains as domain (domain)}<li>{domain}</li>{/each}</ul>
             {:else}
               <p class="muted">Список доменов недоступен</p>
             {/if}
           </div>
         </div>
       </aside>
     </div>
     {#if run}<div class="panel current-journal"><RunLog {client} runId={run.id} revision={progress}/></div>{/if}
   </div>
 {/if}
</Frame>
