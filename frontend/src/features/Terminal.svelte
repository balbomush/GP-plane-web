<script lang="ts">
  import {tick,onMount} from 'svelte';
  import Events from './Events.svelte';
  import type {AppModel} from '../app/model.svelte';
  let {app}:{app:AppModel}=$props();
  let follow=$state(true), logNode:HTMLPreElement;
  let log=$derived(app.view.finderLog||{}), progress=$derived(log.progress||{});
  let text=$derived(String(log.stdout_tail||'')+(log.stderr_tail?'\n--- stderr ---\n'+log.stderr_tail:''));
  let now=$state(Date.now());
  onMount(()=>{const timer=setInterval(()=>now=Date.now(),1000);return()=>clearInterval(timer);});
  let elapsed=$derived(progress.elapsed_seconds==null?null:Math.max(0,Number(progress.elapsed_seconds)||0)+(app.busy&&progress.received_at_ms?Math.max(0,Math.floor((now-progress.received_at_ms)/1000)):0));
  let eta=$derived(progress.eta_seconds==null?null:Math.max(0,Number(progress.eta_seconds)-(elapsed==null?0:elapsed-Number(progress.elapsed_seconds||0))));
  const duration=(seconds:number|null)=>seconds==null?'—':`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(Math.floor(seconds)%60).padStart(2,'0')}`;
  $effect(()=>{const current=text;if(follow){tick().then(()=>{if(logNode)logNode.scrollTop=logNode.scrollHeight;});}});
</script>
<section aria-label="Терминал" class="l-stack">
  <h2>Терминал</h2>
  <div class="button-row"><button onclick={()=>app.refreshLog()} disabled={app.logBusy}>Живой журнал</button><label><input type="checkbox" bind:checked={follow}> Следовать за журналом</label><button onclick={()=>app.copy(text)}>Копировать журнал</button></div>
  <p>{app.historical?'Исторический журнал':'Последний запуск'} · {log.run_id||'—'} · {log.status||'—'}</p>
  <div class="live-run-actions l-cluster"><button class="secondary danger" onclick={()=>app.stop()} disabled={!app.busy||app.stopBusy}>Остановить</button><button onclick={()=>app.tab='candidates'}>Открыть результаты</button><p class="action-consequence">Найденные стратегии сохранятся после остановки.</p></div>
  <progress aria-label="Прогресс подбора" max="100" value={Math.max(0,Math.min(100,Number(progress.percent)||0))}></progress>
  <div class="progress-grid l-grid">{#each [['Проверено попыток',`${progress.attempted||0} / ${progress.effective_attempt_total||progress.attempt_total||0}`],['Стратегии',`${progress.strategy_checked||0} / ${progress.strategy_total||0}`],['Найдено стратегий',progress.successful||0],['Этап',progress.phase_label||progress.phase||'—'],['Текущий файл',progress.current_script||'—'],['Прошло',duration(elapsed)],['Осталось',eta==null?progress.eta_status||'—':duration(eta)]] as [label,value]}<div class="progress-cell"><div class="progress-label">{label}</div><div class="progress-value">{value}</div></div>{/each}</div>
  <Events {app}/>
  <details class="raw-log-panel" open><summary>Raw log / debug</summary><pre id="finder-log" bind:this={logNode} style="max-height:32rem;overflow:auto;white-space:pre-wrap">{text||'Журнал пуст'}</pre></details>
  {#if log.stderr_diagnostics?.length}<details><summary>Диагностика stderr</summary>{#each log.stderr_diagnostics as item}<pre>{JSON.stringify(item,null,2)}</pre>{/each}</details>{/if}
  <details><summary>Параметры и прогресс</summary><pre>{JSON.stringify({settings:log.run_settings,progress},null,2)}</pre></details>
</section>
