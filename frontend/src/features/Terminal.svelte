<script lang="ts">
  import {tick,onMount} from 'svelte';
  import Events from './Events.svelte';
  import type {AppModel} from '../app/model.svelte';
  let {app}:{app:AppModel}=$props();
  let follow=$state(true), logNode:HTMLPreElement;
  let log=$derived(app.view.finderLog||{}), progress=$derived(log.progress||{});
  let text=$derived(String(log.text||log.stdout_tail||'')+(log.stderr_tail?'\n--- stderr ---\n'+log.stderr_tail:''));
  let knownTotal=$derived(typeof progress.total==='number'&&progress.total>0);
  $effect(()=>{const current=text;if(follow){tick().then(()=>{if(logNode)logNode.scrollTop=logNode.scrollHeight;});}});
</script>
<section aria-label="Терминал" class="l-stack">
  <h2>Терминал</h2>
  <div class="button-row"><button onclick={()=>app.refreshLog()} disabled={app.logBusy}>Живой журнал</button><label><input type="checkbox" bind:checked={follow}> Следовать за журналом</label><button onclick={()=>app.copy(text)}>Копировать журнал</button></div>
  <p>{app.historical?'Исторический журнал':'Последний запуск'} · {log.run_id||'—'} · {log.status||'—'}</p>
  <div class="live-run-actions l-cluster"><button class="secondary danger" onclick={()=>app.stop()} disabled={!app.busy||app.stopBusy}>Остановить</button><button onclick={()=>app.tab='candidates'}>Открыть результаты</button><p class="action-consequence">Найденные стратегии сохранятся после остановки.</p></div>
  <progress aria-label="Прогресс подбора" max={knownTotal?progress.total:1} value={knownTotal?Math.min(progress.checked||0,progress.total):undefined}></progress>
  <div class="progress-grid l-grid">{#each [['Проверено',`${progress.checked??'—'} / ${progress.total??'неизвестно'}`],['Текущие аргументы',progress.current_args||'—']] as [label,value]}<div class="progress-cell"><div class="progress-label">{label}</div><div class="progress-value">{value}</div></div>{/each}</div>
  <Events {app}/>
  {#if log.truncated}<p role="status">Журнал неполный: часть сообщений недоступна или усечена.</p>{/if}
  <details class="raw-log-panel" open><summary>Raw log / debug</summary><pre id="finder-log" bind:this={logNode} style="max-height:32rem;overflow:auto;white-space:pre-wrap">{text||'Журнал пуст'}</pre></details>
  {#if log.stderr_diagnostics?.length}<details><summary>Диагностика stderr</summary>{#each log.stderr_diagnostics as item}<pre>{JSON.stringify(item,null,2)}</pre>{/each}</details>{/if}
  <details><summary>Параметры и прогресс</summary><pre>{JSON.stringify({settings:log.run_settings,progress},null,2)}</pre></details>
</section>
