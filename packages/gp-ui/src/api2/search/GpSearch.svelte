<script lang="ts">
 import {onDestroy,untrack} from 'svelte';import Frame from '../Frame.svelte';import {Requests,allPages,normalizeDomains,sameDomains,type GpClient,type Dto} from '../client';import type {GpSession} from '../session.svelte';
 import {enabledProtocols} from './parameters';
 let {client,session,initialDomains=[]}:{client:GpClient;session:GpSession;initialDomains?:string[]}=$props();
 let engine=$state<'blockcheck2'|'blockcheck2-gp'>('blockcheck2-gp'),text=$state(untrack(()=>initialDomains.join('\n'))),preset=$state(''),presetDomains=$state<string[]>([]),error=$state(''),loading=$state(false);
 let p=$state<Dto['BlockcheckGpParameters']>({include_quic:true,enable_http:false,enable_tls12:true,enable_tls13:false,enable_ipv6:false,scan_level:'standard',repeats:1,repeat_parallel:false,skip_dnscheck:true,skip_ipblock:true,curl_max_time:2,curl_max_time_quic:2,curl_max_time_doh:2,debug_stdout:false,curl_parallelism:4});
 let dns=$state(false),ip=$state(false);const requests=new Requests();onDestroy(()=>requests.dispose());
 $effect(()=>{session.formVersion;untrack(()=>{const f=session.form;if(f){engine=f.engine;p={...p,...f.parameters};text=f.domains.join('\n');dns=!p.skip_dnscheck;ip=!p.skip_ipblock;preset=f.preset||'';presetDomains=f.presetDomains||[];}});});
 const protocols=$derived(enabledProtocols(p));
 const domainCount=$derived(normalizeDomains(text).length);
 const canRepeatInParallel=$derived(Number(p.repeats)>1);
 async function selectPreset(){if(!preset){requests.cancel('domains');presetDomains=[];loading=false;return;}loading=true;await requests.run('domains',signal=>allPages(offset=>client.getDomainListEntries({path:{domain_list_id:Number(preset)},query:{offset,limit:200}},{signal})),items=>{presetDomains=items.map(x=>x.domain);text=presetDomains.join('\n');loading=false;},e=>{error=e.message;loading=false;});}
 async function start(){error='';const domains=normalizeDomains(text);if(!domains.length)error='Добавьте хотя бы один домен';if(!protocols.length)error+=' Выберите хотя бы один протокол';const numeric=[p.repeats,p.curl_max_time,p.curl_max_time_quic,p.curl_max_time_doh,...(engine==='blockcheck2-gp'?[p.curl_parallelism]:[])];if(numeric.some(x=>!Number.isInteger(x)||Number(x)<1)||(engine==='blockcheck2-gp'&&Number(p.curl_parallelism)>10))error+=' Проверьте числовые параметры';if(error)return;
  const {curl_parallelism,...stock}=p;const parameters={...(engine==='blockcheck2'?stock:p),repeat_parallel:canRepeatInParallel&&p.repeat_parallel,skip_dnscheck:!dns,skip_ipblock:!ip};
  session.form={engine,parameters,domains,preset,presetDomains:[...presetDomains]};await session.startSearch(engine,{domains,parameters,...(preset&&sameDomains(domains,presetDomains)?{domain_list_id:Number(preset)}:{})});
 }
</script>
<Frame><div class="section-heading"><div><p class="eyebrow">Поиск стратегий</p><h1>Новый поиск</h1></div><span class="badge">Веха №{session.milestone} · текущая</span></div>
 <div class="search-layout"><section class="panel stack search-form-panel search-inputs" aria-label="Параметры поиска">
 <div class="form-field"><label>Движок<select aria-label="Движок" bind:value={engine}><option value="blockcheck2-gp">Blockcheck2 GP</option><option value="blockcheck2">Blockcheck2 · штатный</option></select></label></div>
 <label>Список доменов<select aria-label="Список доменов" bind:value={preset} onchange={selectPreset}><option value="">Свой набор доменов</option>{#each session.lists as row (row.id)}<option value={String(row.id)}>{row.name}</option>{/each}</select></label>
 {#if session.listsPartial}<p class="notice">Поиск ограничен загруженными списками</p><button onclick={()=>session.loadLists()}>Догрузить списки</button>{/if}
 <div class="form-field"><label>Домены<textarea class="search-domains" rows="3" bind:value={text} disabled={loading} spellcheck="false"></textarea></label><p class="muted">По одному домену в строке. Все домены равноправны.</p></div></section><aside class="panel search-summary"><h2>Перед запуском</h2><dl><div><dt>Движок</dt><dd>{engine==='blockcheck2-gp'?'Blockcheck2 GP':'Blockcheck2'}</dd></div><div><dt>Домены</dt><dd>{domainCount}{preset&&sameDomains(normalizeDomains(text),presetDomains)?' · выбранный список':''}</dd></div><div><dt>Протоколы</dt><dd>{protocols.join(' · ')||'Не выбраны'}</dd></div><div><dt>Веха результатов</dt><dd>№{session.milestone} · текущая</dd></div></dl>
 <button aria-label="Начать поиск" class="primary" onclick={start} disabled={!session.canStart||loading}>{session.pending==='start'?'Отправка…':'Начать поиск'}</button><p class="muted">Core проверит параметры и готовность движка. Одновременно работает один поиск.</p>
 {#if error}<p role="alert" class="notice error">{error}</p>{/if}{#if session.message}<p role="alert" class="notice error">{session.message}</p>{/if}
 <details class="launch-details"><summary>Подробные параметры</summary>
 <div class="launch-summary-rows"><div class="summary-row"><span>Сеть</span><strong>{p.enable_ipv6?'IPv4 + IPv6':'IPv4'}</strong></div><div class="summary-row"><span>Режим</span><strong>{{quick:'Быстрый',standard:'Стандартный',force:'Принудительный'}[p.scan_level]}</strong></div><div class="summary-row"><span>Повторы</span><strong>{p.repeats}</strong></div><div class="summary-row"><span>Параллельные повторы</span><strong>{!canRepeatInParallel?'Не применяется':p.repeat_parallel?'Да':'Нет'}</strong></div>{#if engine==='blockcheck2-gp'}<div class="summary-row"><span>Параллелизм curl</span><strong>{p.curl_parallelism}</strong></div>{/if}
 <div class="summary-row"><span>Проверять DNS</span><strong>{dns?'Да':'Нет'}</strong></div><div class="summary-row"><span>Проверять IP-блокировку</span><strong>{ip?'Да':'Нет'}</strong></div>{#each [['HTTP/TLS',p.curl_max_time],['QUIC',p.curl_max_time_quic],['DoH',p.curl_max_time_doh]] as row (row[0])}<div class="summary-row"><span>{row[0]}</span><strong>{row[1]} с</strong></div>{/each}<div class="summary-row"><span>Подробный журнал</span><strong>{p.debug_stdout?'Сохранять':'Не сохранять'}</strong></div></div>
 </details>
 </aside>
 <section class="panel engine-settings" aria-label="Параметры движка"><h2>Параметры движка</h2><p class="muted">{engine==='blockcheck2-gp'?'Параллельные проверки и продолжение остановленного поиска.':'Штатный поиск blockcheck2. Продолжение не поддерживается.'}</p>
 <div><h3>Протоколы проверки</h3><div class="checks"><label class="check"><input type="checkbox" bind:checked={p.enable_http}/>HTTP</label><label class="check"><input type="checkbox" bind:checked={p.enable_tls12}/>TLS 1.2</label><label class="check"><input type="checkbox" bind:checked={p.enable_tls13}/>TLS 1.3</label><label class="check"><input type="checkbox" bind:checked={p.include_quic}/>QUIC</label></div></div>
 <label class="check"><input type="checkbox" bind:checked={p.enable_ipv6}/>IPv6</label><label>Уровень сканирования<select aria-label="Уровень сканирования" bind:value={p.scan_level}><option value="quick">Быстрый</option><option value="standard">Стандартный</option><option value="force">Принудительный</option></select></label>
 <div class="fields"><label>Повторы<input type="number" min="1" bind:value={p.repeats}/></label>{#if engine==='blockcheck2-gp'}<label>Параллелизм curl<input type="number" min="1" max="10" bind:value={p.curl_parallelism}/></label>{/if}</div><label class="check"><input type="checkbox" bind:checked={p.repeat_parallel} disabled={!canRepeatInParallel}/>Параллельные повторы</label>
 <details class="fine-settings"><summary>Тонкая настройка</summary><div class="stack"><label class="check"><input type="checkbox" bind:checked={dns}/>Проверять DNS</label><label class="check"><input type="checkbox" bind:checked={ip}/>Проверять IP-блокировку</label><div class="fields"><label>Таймаут HTTP/TLS<input type="number" min="1" bind:value={p.curl_max_time}/></label><label>Таймаут QUIC<input type="number" min="1" bind:value={p.curl_max_time_quic}/></label><label>Таймаут DoH<input type="number" min="1" bind:value={p.curl_max_time_doh}/></label></div><label class="check"><input type="checkbox" bind:checked={p.debug_stdout}/>Подробный журнал</label></div></details>
 </section>
 </div></Frame>

<style>
 .search-layout {
   grid-template-columns:minmax(0,1fr) 245px;
   grid-template-areas: "inputs summary" "engine summary";
   grid-template-rows:auto 1fr;
 }
 .search-layout .panel { padding:var(--gp-space,24px); }
 .search-inputs { grid-area:inputs; gap:14px; }
 .search-summary { grid-area:summary; gap:12px; }
 .search-summary dl { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
 .engine-settings { grid-area:engine; gap:14px; }
 .search-layout .fields { grid-template-columns:repeat(2,minmax(0,1fr)); }
 .launch-details { border-top:1px solid var(--gp-line,#dbe3dc); }
 .launch-summary-rows { gap:6px; }
 @container (min-width:1050px) {
   .search-layout {
     max-width:1140px;
     grid-template-columns:minmax(0,380px) minmax(0,475px) 245px;
     grid-template-areas:"inputs engine summary";
   }
 }
 @container (max-width:720px) {
   .search-layout { grid-template-columns:minmax(0,1fr); grid-template-areas:"inputs" "summary" "engine"; grid-template-rows:none; }
   .search-layout .search-inputs,.search-layout .search-summary { padding:14px; }
   .section-heading { align-items:center; margin-bottom:14px; }
   .search-inputs { gap:10px; }
   .search-inputs .search-domains { min-height:80px; }
   .search-summary dl { grid-template-columns:repeat(2,minmax(0,1fr)); }
 }
 @container (max-width:430px) {
   .search-layout .fields { grid-template-columns:minmax(0,1fr); }
 }
</style>
