<script lang="ts">
 import {DetailNavigation} from '../detail-navigation';
 import {onDestroy,untrack} from 'svelte';import Frame from '../Frame.svelte';import {Requests,allPages,type GpClient,type Dto} from '../client';import type {GpSession} from '../session.svelte';import {inspectArchive} from './archive';import DomainPicker from './DomainPicker.svelte';
 let {client,session,kind}:{client:GpClient;session:GpSession;kind:'strategies'|'bundles'}=$props();
 let rows=$state<(Dto['Strategy']|Dto['Bundle'])[]>([]),selected=$state<Dto['Strategy']|Dto['Bundle']|null>(null),total=$state(0),offset=$state(0),busy=$state(false),detailBusy=$state(false),error=$state(''),notice=$state(''),archiveBusy=$state(false),files=$state<string[]>([]);
 let milestone=$state(1),domains=$state(''),match=$state<'any'|'all'>('any'),protocol=$state(''),engine=$state(''),family=$state(''),q=$state(''),sort=$state<'family'|'id'>('family'),view=$state<'confirmed'|'all'>('confirmed'),preset=$state('');const requests=new Requests();let familyChoices=$state<string[]>([]);let selectedId=$state('');
 $effect(()=>{const id=session.milestone;untrack(()=>{const context=session.catalogContext;milestone=context?.milestone_id??id;domains=context?.domains?.join('\n')||'';load(false);});});onDestroy(()=>requests.dispose());
 function query(){
   return {
     milestone_id:milestone,
     limit:50,
     offset:0,
     ...(domains.trim()?{domains:domains.split(/[,\s]+/).filter(Boolean),match}:{}),
     ...(kind==='strategies'
       ? {sort,...(protocol?{protocol}:{}),...(engine?{engine_code:engine}:{}),...(family?{family}:{}),...(q?{q}:{})}
       : {view}),
   };
 }
 type AppliedQuery=ReturnType<typeof query>&{sort?:'family'|'id';protocol?:string};
 let appliedQuery=$state<AppliedQuery|null>(null);

 function load(more=false){
   if(more && (!appliedQuery || busy))return;
   const filters=more ? {...appliedQuery!,offset} : query();
   if(!more){
     appliedQuery=filters;
     rows=[];
     offset=0;
   }
   requests.cancel('detail');
   detailBusy=false;
   error='';
   notice='';
   busy=true;
   selected=null;
   selectedId='';
   files=[];
   requests.run<Dto['StrategyPage']|Dto['BundlePage']>('rows',
     signal=>kind==='strategies'
       ?client.listStrategies({query:filters},{signal})
       :client.listBundles({query:filters},{signal}),
     page=>{
       const items=more?[...rows,...page.items]:page.items;
       const seen=new Set<string|number>();
       rows=items.filter(row=>{
         if(seen.has(row.id))return false;
         seen.add(row.id);
         return true;
       });
       familyChoices=[...new Set([...familyChoices,...page.items.flatMap(row=>'family' in row?[row.family]:[])])];
       total=page.total;
       offset=page.offset+page.items.length;
       busy=false;
     },
     e=>{error=e.message;busy=false;});
 }
 function select(row:Dto['Strategy']|Dto['Bundle']){if(!appliedQuery)return;const detailMilestone=appliedQuery.milestone_id;selected=null;selectedId=String(row.id);detailBusy=true;files=[];error='';requests.run<Dto['Strategy']|Dto['Bundle']>('detail',signal=>kind==='strategies'?client.getStrategy({path:{strategy_id:String(row.id)},query:{milestone_id:detailMilestone}},{signal}):client.getBundle({path:{bundle_id:Number(row.id)},query:{milestone_id:detailMilestone}},{signal}),value=>{selected=value;detailBusy=false;},e=>{error=e.message;detailBusy=false;});}
 async function usePreset(){if(!preset){requests.cancel('preset');return;}requests.run('preset',signal=>allPages(offset=>client.getDomainListEntries({path:{domain_list_id:Number(preset)},query:{limit:200,offset}},{signal})),items=>domains=items.map(x=>x.domain).join('\n'),e=>error=e.message);}
 async function archive(){if(!selected||archiveBusy)return;const chosen=selected;archiveBusy=true;error='';notice='';await requests.run('archive',async signal=>{const value=kind==='strategies'?await client.downloadStrategy({path:{strategy_id:String(chosen.id)}},{signal}):await client.downloadBundle({path:{bundle_id:Number(chosen.id)}},{signal});const blob=value as unknown as Blob;const paths=await inspectArchive(blob);return{blob,paths};},({blob,paths})=>{if(selectedId===String(chosen.id))files=paths;client.save(blob,`${kind==='strategies'?'strategy':'bundle'}-${chosen.id}.zip`).then(()=>notice='Архив передан браузеру для сохранения',e=>error=e.message);archiveBusy=false;},e=>{error=e.message;archiveBusy=false;});}
 async function copy(){if(!selected||!('args'in selected))return;try{await client.copy(selected.args);notice='Аргументы скопированы';}catch(e){error=(e as Error).message;}}
 const bundleName=(row:Dto['Bundle'])=>row.name||'Название не сохранено';
 let domainPicker: ReturnType<typeof DomainPicker>;
 function applyFilters(){domainPicker.commitPending();load(false);}
 let moreFilters=$state(false);
 let backButton: HTMLButtonElement;
 const navigation=new DetailNavigation();
 const extraCount=$derived(appliedQuery ? [
   appliedQuery.match==='all', appliedQuery.sort==='id',
   'view' in appliedQuery && appliedQuery.view==='all',
   'protocol' in appliedQuery && appliedQuery.protocol,
   'engine_code' in appliedQuery && appliedQuery.engine_code,
   'family' in appliedQuery && appliedQuery.family,
   'q' in appliedQuery && appliedQuery.q,
 ].filter(Boolean).length : 0);
 function openDetail(row:Dto['Strategy']|Dto['Bundle'],button:HTMLButtonElement){
   navigation.capture(button);
   select(row);
   void navigation.reveal(()=>backButton);
 }
 function closeDetail(){
   requests.cancel('detail');
   selected=null;
   selectedId='';
   detailBusy=false;
   error='';
   notice='';
   void navigation.restore();
 }
 const strategyGroups=$derived.by(()=>{
   const groups:{key:string;protocol:string;family:string;rows:Dto['Strategy'][]}[]=[];
   for(const row of rows){
     if(!('family' in row))continue;
     const previous=groups.at(-1);
     if(previous?.protocol===row.protocol&&previous.family===row.family)previous.rows.push(row);
     else groups.push({key:row.id,protocol:row.protocol,family:row.family,rows:[row]});
   }
   return groups;
 });
 function sourceLink(reference:string|null|undefined) {
   if(!reference)return null;
   try {
     const url=new URL(reference);
     return url.protocol==='https:'||url.protocol==='http:'?url.href:null;
   } catch {
     return null;
   }
 }

</script>
<Frame><div class="catalog-screen" class:detail-open={!!selectedId}>
 <div class="section-heading catalog-list-only"><div><p class="eyebrow">Результаты поисков</p><h1>{kind==='strategies'?'Каталог стратегий':'Сохранённые комплекты'}</h1><p class="muted">{kind==='strategies'?'Найдите стратегию, посмотрите аргументы и скачайте её файлы.':'Выберите готовый комплект, посмотрите его источники и скачайте файлы.'}</p></div></div>
 <div class="catalog-filters catalog-list-only">
   <div class="catalog-basic filter-row">
     <label>Веха результатов<select aria-label="Веха результатов" bind:value={milestone}>{#each session.milestones as row (row.id)}<option value={row.id}>№{row.id}{row.id===session.milestone?' · текущая':''}</option>{/each}</select></label>
     <DomainPicker bind:this={domainPicker} bind:value={domains} suggestions={rows.flatMap(row=>row.results.map(x=>x.domain))}/>
     <div class="actions">
       <button type="button" aria-expanded={moreFilters} onclick={()=>moreFilters=!moreFilters}>Фильтры{extraCount ? ' · '+extraCount : ''}</button>
       <button data-catalog-apply onclick={applyFilters}>Применить фильтры</button>
     </div>
   </div>
   {#if moreFilters}
     <div class="catalog-extra">
       <label>Список для фильтра<select aria-label="Список для фильтра" bind:value={preset} onchange={usePreset}><option value="">Не выбран</option>{#each session.lists as row (row.id)}<option value={String(row.id)}>{row.name}</option>{/each}</select></label>
       <label>Совпадение доменов<select aria-label="Совпадение доменов" bind:value={match}><option value="any">Любой</option><option value="all">Все</option></select></label>
       {#if kind==='strategies'}
         <label>Порядок<select aria-label="Порядок" bind:value={sort}><option value="family">По типу</option><option value="id">По идентичности Core</option></select></label>
         <label>Протокол<select aria-label="Протокол" bind:value={protocol}><option value="">Все</option><option value="http">HTTP</option><option value="tls">TLS</option><option value="quic">QUIC</option></select></label>
         <label>Движок результатов<select aria-label="Движок результатов" bind:value={engine}><option value="">Все</option><option value="blockcheck2">Blockcheck2</option><option value="blockcheck2-gp">Blockcheck2 GP</option></select></label>
         <label>Тип стратегии<select aria-label="Тип стратегии" bind:value={family}><option value="">Все типы</option>{#each familyChoices as choice (choice)}<option value={choice}>{choice}</option>{/each}</select></label>
         <label>Аргументы содержат<input bind:value={q}/></label>
       {:else}
         <label>Показывать комплекты<select aria-label="Показывать комплекты" bind:value={view}><option value="confirmed">Подтверждённые</option><option value="all">Все сохранённые</option></select></label>
       {/if}
     </div>
   {/if}
 </div>
 {#if error&&!selectedId}<p role="alert" class="notice error">{error}</p>{/if}
 {#if !busy&&!error&&!rows.length}
   <p class="panel">Ничего не найдено</p>
 {:else}
 {#if kind==='strategies'}<div class="catalog-list-heading catalog-list-only"><h2>Подходящие стратегии</h2><p class="muted">Загружено {rows.length} из {total} · веха №{appliedQuery?.milestone_id ?? milestone}</p></div>{/if}
 <div class="catalog-layout" class:catalog-strategies={kind==='strategies'}><section class="stack catalog-list-only" class:panel={kind==='bundles'} class:strategy-list={kind==='strategies'} aria-label={kind==='strategies'?'Варианты стратегий':'Сохранённые комплекты'}>{#if kind==='bundles'}<p class="muted">Загружено {rows.length} из {total} · веха №{appliedQuery?.milestone_id ?? milestone}</p>{/if}{#if busy}<p role="status">Загрузка…</p>{/if}{#snippet catalogRow(row:Dto['Strategy']|Dto['Bundle'], grouped=false)}
  <button class="catalog-row" data-strategy={kind==='strategies'?row.id:undefined} data-bundle={kind==='bundles'?row.id:undefined} aria-pressed={selectedId===String(row.id)} onclick={event=>openDetail(row,event.currentTarget)}>
    {#if 'args' in row}
      {#if !grouped}<strong>{row.family} · {row.protocol.toUpperCase()}</strong>{/if}
      <span>{row.args}</span>
    {:else}
      <strong>{bundleName(row)}</strong>
      <span>{row.sources.map(x=>x.name||x.source).join(' · ')}</span>
    {/if}
    <span class="row-domains">{row.results.length?row.results.map(result=>result.domain).join(' · '):'Подтверждений нет'}</span>
    {#if !row.archive_available}<span>Архив недоступен</span>{/if}
  </button>
 {/snippet}
 <div class="catalog-rows">
   {#if !rows.length}
     {#if !busy&&!error}<p>Ничего не найдено</p>{/if}
   {:else if kind==='strategies' && appliedQuery?.sort==='family'}
     {#each strategyGroups as group (group.key)}
       <details class="strategy-family" open>
         <summary>{group.family}{#if !appliedQuery?.protocol} · {group.protocol.toUpperCase()}{/if} <small class="muted">· загружено {group.rows.length}</small></summary>
         {#each group.rows as row (row.id)}{@render catalogRow(row,true)}{/each}
       </details>
     {/each}
   {:else}
     {#each rows as row (row.id)}{@render catalogRow(row)}{/each}
   {/if}
 </div>{#if offset<total}<button disabled={busy} onclick={()=>load(true)}>Загрузить ещё {kind==='strategies'?'стратегии':'комплекты'}</button>{/if}</section>
 <section class="panel stack catalog-detail" aria-label="Подробности результата">
   <button class="detail-back" type="button" bind:this={backButton} onclick={closeDetail}>Назад к списку</button>
   {#if error&&selectedId}<p role="alert" class="notice error">{error}</p>{/if}
   {#if notice}<p role="status" class="notice">{notice}</p>{/if}
   {#if detailBusy}
     <p role="status">Загрузка подробностей…</p>
   {:else if selected}
     <div class="catalog-detail-header">
       {#if 'args' in selected}
         <div><p class="muted">{selected.protocol.toUpperCase()} · веха №{selected.milestone_id}</p><h2>{selected.family} · {selected.protocol}</h2></div>
       {:else}
         <h2>{bundleName(selected)}</h2>
       {/if}
       <div class="actions catalog-detail-actions">
         {#if 'args' in selected}<button onclick={copy}>Копировать аргументы</button>{/if}
         <button class="primary" disabled={!selected.archive_available||archiveBusy||!session.canMutate} onclick={archive}>{kind==='strategies'?'Скачать ZIP стратегии':'Скачать ZIP комплекта'}</button>
       </div>
     </div>
     {#if 'args' in selected}
       <section class="strategy-detail-section"><h3>Аргументы</h3><pre data-selected-args>{selected.args}</pre></section>
       <details><summary>Пояснение типа</summary><p>{selected.family_reason}</p></details>
     {:else}
       <h3>Источники</h3>
       {#each selected.sources as source,i (i)}
         {@const link=sourceLink(source.reference)}
         <p>{source.name||'Название не сохранено'} · {source.source}</p>
         {#if link}<p><a href={link} target="_blank" rel="noopener noreferrer">{source.reference}</a></p>{:else if source.reference}<p>{source.reference}</p>{:else}<p class="muted">Ссылка не указана</p>{/if}
       {:else}<p class="muted">Источники неизвестны</p>{/each}
     {/if}
     <h3>Подтверждён для доменов · веха №{selected.milestone_id}</h3>
     <div class="scroll-domains">{#each selected.results as result (result.id)}<p>{result.domain}{#if 'engines'in result} · {result.engines.map(x=>x.name).join(', ')||'Движок неизвестен'}{/if}</p>{:else}<p>Подтверждений нет</p>{/each}</div>
     {#if 'args' in selected && selected.archive_available}<p class="muted">Аргументы и необходимые файлы входят в ZIP. Если у стратегии есть зависимости, одной строки аргументов недостаточно.</p>{/if}
     {#if !selected.archive_available}<p class="muted">Полный архив недоступен. Сохранённые сведения доступны для чтения.</p>{/if}
     {#if files.length}<h3>Состав полученного ZIP</h3>{#each files as file (file)}<p>{file}</p>{/each}{/if}
   {:else if !selectedId}
     <h2>{kind==='strategies'?'Нет выбранной стратегии':'Нет выбранного комплекта'}</h2>
     <p class="muted">Выберите запись слева, чтобы посмотреть подробности и скачать её архив.</p>
   {/if}
 </section></div>{/if}</div></Frame>

<style>
 .catalog-filters { display:grid; gap:16px; max-width:1120px; margin-bottom:20px; }
 .catalog-basic { display:grid; grid-template-columns:minmax(125px,180px) minmax(0,1fr) auto; gap:12px; align-items:end; }
 .catalog-extra { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); gap:12px; }
 .catalog-list-heading { display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
 .catalog-detail-header { display:flex; align-items:center; flex-wrap:wrap; gap:12px 16px; }
 .detail-back { display:none; justify-self:start; scroll-margin-top:12px; }
 .strategy-family { border:1px solid var(--gp-line,#dbe3dc); border-radius:6px; }
 .strategy-family summary { padding:10px 14px; cursor:pointer; overflow-wrap:anywhere; }
 .strategy-family .catalog-row { border-radius:0; border-width:1px 0 0; }
 .catalog-row .row-domains { display:block; overflow:visible; overflow-wrap:anywhere; }
 @container(max-width:760px) {
   .catalog-basic { grid-template-columns:minmax(0,1fr); }
   .detail-open .catalog-list-only { display:none; }
   .detail-open .detail-back { display:block; }
   .catalog-screen:not(.detail-open) .catalog-detail { display:none; }
 }
</style>
