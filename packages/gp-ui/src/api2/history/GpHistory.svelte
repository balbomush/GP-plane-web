<script lang="ts">
 import {DetailNavigation} from '../detail-navigation';
 import {onDestroy,untrack} from 'svelte';import Frame from '../Frame.svelte';import Confirm from '../Confirm.svelte';import RunLog from '../search/RunLog.svelte';import {Requests,statusName,time,type GpClient,type Dto} from '../client';import type {GpSession} from '../session.svelte';
 import {historyParameters} from '../search/parameters';
 let {client,session,onNew,onCurrent,onCatalog}:{client:GpClient;session:GpSession;onNew?:()=>void;onCurrent?:()=>void;onCatalog?:(context:{milestone_id:number;domains:string[]})=>void}=$props();
 let rows=$state<Dto['RunDetail'][]>([]),selected=$state<Dto['RunDetail']|null>(null),total=$state(0),offset=$state(0),busy=$state(false),error=$state(''),confirmDelete=$state(false),engine=$state(''),status=$state(''),milestone=$state(''),presetName=$state('');const requests=new Requests();
 let detailOpen=$state(false);
 let backButton: HTMLButtonElement;
 const navigation=new DetailNavigation();
 function openDetail(id:string,button:HTMLButtonElement){
   navigation.capture(button);
   detailOpen=true;
   select(id);
   void navigation.reveal(()=>backButton);
 }
 function closeDetail(){
   requests.cancel('detail');
   detailOpen=false;
   selected=null;
   error='';
   void navigation.restore();
 }
 $effect(()=>{session.milestone;untrack(()=>load(false));});onDestroy(()=>requests.dispose());
 function load(more=false){if(!more){requests.cancel('detail');detailOpen=false;rows=[];selected=null;presetName='';}busy=true;error='';requests.run('history',signal=>client.listRuns({query:{offset:more?offset:0,limit:50,...(engine?{engine_code:engine}:{}),...(status?{status:status as any}:{}),...(milestone?{milestone_id:Number(milestone)}:{})}},{signal}),p=>{const items=more?[...rows,...p.items]:p.items;rows=items.filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i);total=p.total;offset=p.offset+p.items.length;busy=false;},e=>{error=e.message;busy=false;});}
 function select(id:string){selected=null;presetName='';requests.run('detail',async signal=>{const run=await client.getRun({path:{run_id:id}},{signal});let name='';if(run.domain_list_id)try{name=(await client.getDomainList({path:{domain_list_id:run.domain_list_id}},{signal})).name;}catch{}return{run,name};},({run,name})=>{selected=run;presetName=name;},e=>error=e.message);}
 function remove(){const run=selected;confirmDelete=false;if(!run)return;requests.run('delete',signal=>client.deleteRunHistory({path:{run_id:run.id}},{signal}),()=>{rows=rows.filter(x=>x.id!==run.id);if(selected?.id===run.id)selected=null;load(false);},e=>error=e.message);}
</script>
<Frame><div class="history-screen" class:detail-open={detailOpen}><div class="section-heading history-list-only"><div><p class="eyebrow">Поиски и их параметры</p><h1>История поисков</h1></div></div><div class="filters filter-row history-filters history-list-only"><label>Движок истории<select aria-label="Движок истории" bind:value={engine}><option value="">Все</option><option value="blockcheck2">Blockcheck2</option><option value="blockcheck2-gp">Blockcheck2 GP</option></select></label><label>Состояние истории<select aria-label="Состояние истории" bind:value={status}><option value="">Все</option>{#each ['starting','running','stopping','stopped','completed','failed'] as value (value)}<option value={value}>{statusName(value)}</option>{/each}</select></label><label>Веха истории<select aria-label="Веха истории" bind:value={milestone}><option value="">Все</option>{#each session.milestones as row (row.id)}<option value={String(row.id)}>№{row.id}</option>{/each}</select></label><button onclick={()=>load(false)}>Применить фильтры истории</button></div>
 {#if error&&!detailOpen}<p role="alert" class="notice error">{error}</p>{/if}<div class="catalog-layout history-layout"><section class="panel stack history-list-only"><h2>Запуски · {total}</h2><div class="catalog-rows">{#each rows as row (row.id)}<article class="catalog-row"><strong>{row.engine?.name||'Движок не сохранён'}</strong><p>{statusName(row.status)} · {time(row.started_at)}</p><p class="muted">Веха №{row.milestone_id} · {row.domains?.length??'неизвестно'} доменов</p><button onclick={event=>openDetail(row.id,event.currentTarget)}>Открыть поиск</button></article>{:else}{#if !busy&&!error}<p>Нет запусков по этим условиям</p>{/if}{/each}</div>{#if offset<total}<button disabled={busy} onclick={()=>load(true)}>Загрузить ещё поиски</button>{/if}</section><section class="panel stack history-detail">
 <button class="detail-back" type="button" bind:this={backButton} onclick={closeDetail}>Назад к списку</button>
 {#if error&&detailOpen}<p role="alert" class="notice error">{error}</p>{/if}
 {#if selected}<div class="history-detail-header"><div><h2>{selected.engine?.name||'Движок не сохранён'}</h2><p>{statusName(selected.status)} · веха №{selected.milestone_id}</p></div><div class="actions">{#if ['starting','running','stopping'].includes(selected.status)}<button onclick={async()=>{session.knownRun=selected!.id;await session.refresh();onCurrent?.();}}>Открыть текущий поиск</button>{:else if selected.parameters&&selected.domains}<button onclick={()=>{session.newSearch(selected!);onNew?.();}}>Новый поиск</button>{/if}{#if selected.engine?.code==='blockcheck2-gp'&&selected.resume_available}<button disabled={!session.canMutate} onclick={async()=>{await session.resume(selected!);onNew?.();}}>Продолжить поиск</button>{/if}</div></div><dl><dt>Время начала</dt><dd>{time(selected.started_at)}</dd><dt>Время завершения</dt><dd>{time(selected.finished_at)}</dd>{#if presetName}<dt>Текущее название списка</dt><dd>{presetName}</dd>{/if}</dl>{#if selected.error}<p role="alert" class="notice error">{selected.error.message}</p><details><summary>Технические сведения</summary><p>Код: <code>{selected.error.code}</code></p>{#if selected.error.details?.length}<pre>{JSON.stringify(selected.error.details,null,2)}</pre>{/if}</details>{/if}<div class="history-content"><div class="stack"><h3>Фактические параметры</h3><table class="table history-parameters"><tbody>{#each historyParameters(selected.parameters) as {key,label,value} (key)}<tr><th scope="row">{label}</th><td>{value}</td></tr>{/each}</tbody></table></div><div class="stack history-domains-log"><div><h3>Домены</h3><div class="scroll-domains">{#each selected.domains||[] as domain (domain)}<p>{domain}</p>{:else}<p>Состав не сохранён</p>{/each}</div></div><RunLog {client} runId={selected.id}/></div></div>
 <div class="actions"><button onclick={()=>onCatalog?.({milestone_id:selected!.milestone_id,domains:selected!.domains||[]})}>Каталог этой вехи и доменов</button>{#if !['starting','running','stopping'].includes(selected.status)}<button class="danger" onclick={()=>confirmDelete=true}>Удалить запись истории</button>{/if}</div><p class="muted">Каталог содержит результаты выбранной вехи, не только этого запуска.</p>{:else}<h2>Выберите поиск</h2>{/if}</section></div></div>
 {#if confirmDelete}<Confirm title="Удалить запись истории?" description="Удалится запись и возможность продолжить этот поиск. Найденные стратегии и комплекты останутся." confirm={remove} cancel={()=>confirmDelete=false}/>{/if}</Frame>


<style>
 .history-detail-header { display:flex; flex-wrap:wrap; align-items:center; gap:12px 24px; }
 .history-parameters { max-width:660px; table-layout:fixed; }
 .history-content { display:grid; gap:20px; align-items:start; }
 .history-domains-log .scroll-domains { max-height:180px; }
 @container (min-width:1200px) {
   .history-content { grid-template-columns:minmax(0, min(44%,660px)) minmax(0,1fr); gap:24px; }
 }
 .detail-back { display:none; justify-self:start; scroll-margin-top:12px; }
 @container(max-width:760px) {
   .detail-open .history-list-only { display:none; }
   .detail-open .detail-back { display:block; }
   .history-screen:not(.detail-open) .history-detail { display:none; }
 }
</style>
