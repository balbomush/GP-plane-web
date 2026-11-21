<script lang="ts">
 import {DetailNavigation} from '../detail-navigation';
 import {onDestroy,untrack} from 'svelte';import Frame from '../Frame.svelte';import Confirm from '../Confirm.svelte';import {Requests,allPages,normalizeDomains,type GpClient,type Dto} from '../client';import type {GpSession} from '../session.svelte';
 let {client,session,onSearch}:{client:GpClient;session:GpSession;onSearch?:(domains:string[])=>void}=$props();const requests=new Requests();let tab=$state('lists'),query=$state(''),kind=$state(''),selected=$state<Dto['DomainList']|null>(null),entries=$state<string[]>([]),editing=$state(false),name=$state(''),text=$state(''),error=$state(''),busy=$state(false),deleteConfirm=$state(false),revision=0;let entriesReady=$state(false),categoryReady=$state(false);
 let source=$state<Dto['Source']|null>(null),categories=$state<Dto['Category'][]>([]),categoryQuery=$state(''),category=$state<Dto['Category']|null>(null),categoryDomains=$state<string[]>([]),partial=$state(false),update=$state<Dto['SourceUpdate']|null>(null);
 const categoryNavigation=new DetailNavigation();
 let categoryOpen=$state(false);
 let categoryBack: HTMLButtonElement;
 function openCategory(row:Dto['Category'],button:HTMLButtonElement){
   categoryNavigation.capture(button);
   categoryOpen=true;
   selectCategory(row);
   void categoryNavigation.reveal(()=>categoryBack);
 }
 function returnToCategories(){
   categoryOpen=false;
   void categoryNavigation.restore();
 }
 const visible=$derived(session.lists.filter(x=>(!kind||x.kind===kind)&&x.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))),visibleCategories=$derived(categories.filter(x=>x.name.toLocaleLowerCase().includes(categoryQuery.toLocaleLowerCase())));
 onDestroy(()=>requests.dispose());
 function select(row:Dto['DomainList']){const owner=++revision;selected=row;editing=false;entries=[];entriesReady=false;error='';requests.run('entries',signal=>allPages(offset=>client.getDomainListEntries({path:{domain_list_id:row.id},query:{offset,limit:200}},{signal})),items=>{if(owner===revision&&selected?.id===row.id&&!editing){entries=items.map(x=>x.domain);entriesReady=true;}},e=>error=e.message);}
 function edit(copy=false){if(tab==='source'?!categoryReady:!entriesReady)return;requests.cancel('entries');revision++;const sourceName=tab==='source'?category?.name:selected?.name;name=copy?`${sourceName||''} · копия`:sourceName||'';text=(category&&tab==='source'?categoryDomains:entries).join('\n');if(copy)selected=null;editing=true;error='';}
 function create(){requests.cancel('entries');requests.cancel('category');revision++;entriesReady=false;selected=null;editing=true;name='';text='';error='';}
 function save(){if(busy)return;if(!name.trim()){error='Введите название списка';return;}const raw=text.split(/[,\s]+/).filter(Boolean);if(normalizeDomains(raw).length!==raw.length){error='Дубли доменов не допускаются';return;}const rev=revision;busy=true;const body={name,domains:raw.map(domain=>({domain}))},chosen=selected;
 requests.run('save',signal=>chosen?client.replaceDomainList({path:{domain_list_id:chosen.id},body},{signal}):client.createDomainList({body},{signal}),row=>{busy=false;if(rev===revision){selected=row;entries=raw;entriesReady=true;editing=false;}session.loadLists();},e=>{busy=false;error=e.message;});}
 function remove(){const chosen=selected;deleteConfirm=false;if(!chosen)return;const rev=revision;requests.run('delete',signal=>client.deleteDomainList({path:{domain_list_id:chosen.id}},{signal}),()=>{if(rev===revision){selected=null;editing=false;}session.loadLists();},e=>error=e.message);}
 async function loadSource(){tab='source';error='';await requests.run('source',signal=>client.getSource({path:{source:'v2fly'}},{signal}),data=>{source=data;if(data.state==='ready')loadCategories();},e=>error=e.message);}
 function loadCategories(){const items:Dto['Category'][]=[];requests.run('categories',async signal=>{for(let offset=0;;){const p=await client.listCategories({path:{source:'v2fly'},query:{offset,limit:200}},{signal});items.push(...p.items);offset+=p.items.length;if(offset>=p.total)break;if(!p.items.length)throw new Error('Неполный каталог категорий');}return items;},rows=>{categories=rows;partial=false;},e=>{categories=items;partial=true;error=e.message;});}
 function selectCategory(row:Dto['Category']){category=row;categoryDomains=[];categoryReady=false;requests.run('category',signal=>allPages(offset=>client.listCategoryDomains({path:{source:'v2fly',category:row.id},query:{offset,limit:200}},{signal})),rows=>{categoryDomains=rows;categoryReady=true;},e=>error=e.message);}
 function checkSource(){requests.run('check',signal=>client.checkSourceUpdate({path:{source:'v2fly'}},{signal}),row=>update=row,e=>error=e.message);}
 function updateSource(){if(!session.canMutate)return;busy=true;requests.run('update',signal=>client.updateSource({path:{source:'v2fly'}},{signal}),row=>{source=row;busy=false;loadCategories();},e=>{error=e.message;busy=false;});}
</script>
<Frame><div class="section-heading"><div><p class="eyebrow">Домены для поиска</p><h1>Списки доменов</h1></div></div><div class="subnav"><button aria-pressed={tab==='lists'} onclick={()=>{tab='lists';category=null;categoryOpen=false;}}>Мои и встроенные списки</button><button aria-pressed={tab==='source'} onclick={loadSource}>v2fly</button></div>
 {#if error}<p role="alert" class="notice error">{error}</p>{/if}
 {#if editing}<section class="panel stack list-editor"><h2>{selected?'Редактировать список':'Новый список'}</h2><label>Название списка<input bind:value={name}/></label><label>Домены списка<textarea rows="14" bind:value={text} spellcheck="false"></textarea></label><div class="actions"><button class="primary" disabled={busy||!session.canWriteData} onclick={save}>Сохранить список</button><button onclick={()=>{editing=false;revision++;}}>Отмена</button></div></section>
 {:else if tab==='lists'}<div class="filters filter-row domain-list-filters"><label>Найти список<input bind:value={query}/></label><label>Тип списка<select aria-label="Тип списка" bind:value={kind}><option value="">Все</option><option value="builtin">Встроенные</option><option value="user">Пользовательские</option></select></label><button class="primary" onclick={create}>Новый список</button></div>{#if session.listsPartial}<p class="notice">Поиск ограничен загруженными метаданными</p><button onclick={()=>session.loadLists()}>Догрузить списки</button>{/if}<div class="catalog-layout domain-lists-layout"><section class="panel catalog-rows">{#each visible as row (row.id)}<button class="catalog-row" data-list={row.id} aria-pressed={selected?.id===row.id} onclick={()=>select(row)}><strong>{row.name}</strong><span>{row.kind==='builtin'?'Встроенный':'Пользовательский'}</span></button>{:else}<p>Ничего не найдено</p>{/each}</section><section class="panel stack">{#if selected}<h2>{selected.name}</h2><p class="muted">{selected.source?`${selected.source.code} · ${selected.source.categories.join(', ')}`:'Происхождение неизвестно'}</p><div class="scroll-domains">{#each entries as domain (domain)}<p>{domain}</p>{/each}</div><div class="actions"><button disabled={!entriesReady} onclick={()=>{session.form={engine:'blockcheck2-gp',parameters:{},domains:[...entries],preset:String(selected!.id),presetDomains:[...entries]};session.formVersion++;onSearch?.(entries);}}>Использовать в поиске</button><button disabled={!entriesReady} onclick={()=>edit(true)}>Создать копию списка</button>{#if selected.kind==='user'}<button disabled={!entriesReady} onclick={()=>edit(false)}>Редактировать список</button><button class="danger" disabled={!session.canWriteData} onclick={()=>deleteConfirm=true}>Удалить список</button>{/if}</div>{:else}<h2>Выберите список</h2><p class="muted">Метаданные загружаются отдельно от состава доменов.</p>{/if}</section></div>
 {/if}
 {#if tab==='source'}
 <section class="panel stack source-panel" class:category-open={categoryOpen} hidden={editing}>
   <div class="stack category-list-only">
     <div class="actions"><h2>v2fly</h2><span class="badge">{source?.state||'Загрузка…'}</span></div>
     <p class="muted">Редакция: {source?.installed_revision||'Не установлена'}</p>
     {#if source?.error}<p role="alert">{source.error.message}</p>{/if}
     <div class="actions">
       <button onclick={checkSource}>Проверить обновление источника</button>
       <button disabled={!session.canMutate||busy} onclick={updateSource}>Обновить источник</button>
     </div>
     {#if update}<p>{update.update_available?'Доступно обновление':'Источник актуален'} · {update.available_revision??'Редакция неизвестна'}</p>{/if}
     {#if partial}<p>Поиск ограничен загруженными категориями</p><button onclick={loadCategories}>Догрузить категории</button>{/if}
   </div>
   <div class="catalog-layout domain-lists-layout">
     <div class="stack category-list-only">
       <label>Найти категорию<input bind:value={categoryQuery}/></label>
       <div class="catalog-rows">
         {#each visibleCategories as row (row.id)}
           <button aria-pressed={category?.id===row.id} onclick={event=>openCategory(row,event.currentTarget)}>{row.name}</button>
         {:else}<p>Категорий пока нет</p>{/each}
       </div>
     </div>
     <div class="stack category-detail">
       {#if category}
         <button class="category-back" type="button" bind:this={categoryBack} onclick={returnToCategories}>Назад к списку</button>
         <div class="actions"><h3>{category.name}</h3><button disabled={!categoryReady} onclick={()=>edit(true)}>Создать список из категории</button></div>
         <div class="scroll-domains category-domains">{#each categoryDomains as domain (domain)}<p>{domain}</p>{/each}</div>
       {/if}
     </div>
   </div>
 </section>
 {/if}
 {#if deleteConfirm}<Confirm title="Удалить список?" description="Удалится только пользовательский список доменов." confirm={remove} cancel={()=>deleteConfirm=false}/>{/if}</Frame>


<style>
 .domain-list-filters { align-items:end; }
 .domain-list-filters button { justify-self:start; }
 .list-editor { max-width:1000px; }
 .list-editor label:first-of-type { max-width:420px; }
 .source-panel[hidden],.category-back { display:none; }
 .category-back { justify-self:start; scroll-margin-top:12px; }
 @container(max-width:760px) {
   .category-open .category-list-only,.source-panel:not(.category-open) .category-detail { display:none; }
   .category-open .category-back { display:block; }
 }
 .category-domains { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); gap:8px 16px; }
</style>
