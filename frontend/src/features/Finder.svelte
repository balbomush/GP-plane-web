<script lang="ts">
  import type {AppModel} from '../app/model.svelte';
  import {domains,normalizePreferences} from '../domain/finder';
  import {onMount} from 'svelte';
  let {app, lists}: {app:AppModel;lists:any}=$props();
  let presetName=$state('');
  let options=$derived(normalizePreferences(app.preferences,app.settings.curl_parallelism_max||10));
  let readiness=$derived(!app.systemKnown?'Проверяем систему':app.busy?'Идёт подбор':!app.systemReady?'Требуется настройка':!domains(app.domainText).length?'Нужны домены':!(options.enable_http||options.enable_tls12||options.enable_tls13||options.include_quic)?'Нужен протокол':'Готово к старту');
  const systemCount=(name:string)=>app.presets.system_metadata?.finder?.[name]?.enabled_count??app.presets.system_metadata?.finder?.[name]?.count??app.presets.system?.finder?.[name]?.length??0;
  let summary=$derived([
    ['Домены запуска',domains(app.domainText).length],['Обязательные',systemCount('required')],['Желательные',systemCount('desired')],
    ['Источник',lists.entries('finder',true).find(item=>item.key===options.domain_preset)?.label||'Свои домены'],
    ['Режим',options.run_mode==='multi'?'Multi':'Standard'],['Проверочные запросы',options.run_mode==='multi'?`${options.curl_parallelism} параллельно`:'не применяется'],
    ['Протоколы',[options.enable_http?'HTTP':'',options.enable_tls12?'TLS 1.2':'',options.enable_tls13?'TLS 1.3':'',options.include_quic?'QUIC':''].filter(Boolean).join(' + ')||'не выбран'],
    ['IP-режим',options.enable_ipv6?'IPv4 + IPv6':'IPv4'],['Глубина',options.scan_level],
    ['DNS/IP-check',`DNS: ${options.skip_dnscheck?'пропуск':'проверять'}, IP/port: ${options.skip_ipblock?'пропуск':'проверять'}`],
    ['Повторы',`${options.repeats} · ${options.repeat_parallel?'параллельно':'последовательно'}`],
    ['Лимит времени',options.limit_time_enabled?`${Math.max(60,Math.round(options.timeout_hours*3600))} с`:'без лимита'],
    ['Таймауты',`HTTP/TLS ${options.curl_max_time}с · QUIC ${options.curl_max_time_quic}с · DoH ${options.curl_max_time_doh}с`]
  ]);
  const flags=[['enable_http','HTTP'],['enable_tls12','TLS 1.2'],['enable_tls13','TLS 1.3'],['include_quic','QUIC'],['enable_ipv6','IPv6'],['repeat_parallel','Параллельные повторы'],['skip_dnscheck','Пропустить DNS'],['skip_ipblock','Пропустить IP-проверку']];
  onMount(()=>{if(!app.domainText&&app.preferences.domain_preset!=='custom')lists.useFinder(app.preferences.domain_preset);return()=>lists.life.cancel('finder-preset');});
</script>
<section aria-label="Подбор стратегий" class="l-stack">
  <h2>Подбор стратегий</h2>
  <fieldset disabled={app.busy||app.runStarting}>
    <legend>Параметры запуска</legend>
    <label>Режим <select aria-label="Режим" bind:value={app.preferences.run_mode}><option value="standard">Standard</option><option value="multi">Multi</option></select></label>
    <label>Список доменов <select aria-label="Список доменов" bind:value={app.preferences.domain_preset} onchange={()=>lists.useFinder(app.preferences.domain_preset)}><option value="custom">Свои домены</option>{#each lists.entries('finder',true) as item}<option value={item.key}>{item.label}</option>{/each}</select></label>
    <label>Домены <textarea id="finder-domains" rows="8" bind:value={app.domainText} oninput={()=>{app.preferences.domain_preset='custom';}}></textarea></label>
    <p>Доменов: {domains(app.domainText).length}</p>
    <details class="preset-panel"><summary>Сохранение списка доменов</summary><label>Название пользовательского списка <input bind:value={presetName}></label><button onclick={()=>lists.saveCurrent('finder',presetName,app.domainText)} disabled={!app.canMutate}>Сохранить список подбора</button><button onclick={()=>lists.deleteCurrent('finder',app.preferences.domain_preset)} disabled={!app.canMutate||!lists.ownCustom('finder',app.preferences.domain_preset)}>Удалить выбранный пользовательский список</button></details>
    <div class="protocol-grid l-form-grid">{#each flags as [key,label]}<label class="checkbox-row"><input type="checkbox" bind:checked={(app.preferences as any)[key]}> {label}</label>{/each}</div>
    <details class="preset-panel"><summary>Глубина проверки</summary><label>Профиль <select aria-label="Профиль" bind:value={app.preferences.discovery_profile} onchange={()=>{app.preferences.scan_level=app.preferences.discovery_profile;}}><option value="quick">Quick</option><option value="standard">Standard</option><option value="force">Force</option></select></label><p>{app.preferences.scan_level==='quick'?'Меньше комбинаций, быстрее первичная проверка.':app.preferences.scan_level==='force'?'Больше комбинаций, работает дольше.':'Основной режим для обычного подбора.'}</p></details>
    <label>Повторы <input type="number" min="1" max="10" bind:value={app.preferences.repeats}></label>
    {#if app.preferences.run_mode==='multi'}<label>Параллельные запросы <input type="number" min="1" max={app.settings.curl_parallelism_max||10} bind:value={app.preferences.curl_parallelism}></label>{/if}
    {#each [['curl_max_time','TCP'],['curl_max_time_quic','QUIC'],['curl_max_time_doh','DoH']] as [key,label]}<label>Таймаут {label}, с <input type="number" min="1" bind:value={(app.preferences as any)[key]}></label>{/each}
    <label class="checkbox-row"><input type="checkbox" bind:checked={app.preferences.limit_time_enabled}> Ограничить время</label>
    <label aria-disabled={!app.preferences.limit_time_enabled}>Лимит, часы <input type="number" min="0.1" max="24" step="0.5" disabled={!app.preferences.limit_time_enabled} bind:value={app.preferences.timeout_hours}></label>
  </fieldset>
  <section class="run-launch-summary" aria-label="Сводка параметров запуска">
    <div class="run-launch-summary-header"><div class="run-launch-summary-title">Параметры запуска</div><span class="badge">{readiness}</span></div>
    <div class="run-launch-summary-grid l-grid">{#each summary as [label,value]}<div class="run-launch-summary-item l-stack"><div class="run-launch-summary-label">{label}</div><div class="run-launch-summary-value">{value}</div></div>{/each}</div>
  </section>
  <div class="button-row"><button onclick={()=>app.start()} disabled={!app.systemReady||app.busy||app.runStarting}>Start</button><button class="secondary" onclick={()=>app.stop()} disabled={!app.busy||app.stopBusy}>Stop</button></div>
  <p class="action-consequence">Найденные стратегии сохранятся; остановка не удаляет результаты.</p>
</section>
