<script lang="ts">
  import type {AppModel} from '../app/model.svelte';
  let {app}:{app:AppModel}=$props();
  let status=$derived(app.view.status||{});
  let tested=$derived(app.candidateDomainCount);
</script>
<section class="status-grid l-grid" aria-label="Сводка">
  <div class="metric"><div class="metric-label">Core</div><div class="metric-value">{!app.systemKnown?'Состояние не получено':app.systemReady?'Доступен':'Требуется настройка'}</div><div class="metric-note">{app.systemKnown?'API 2 · готовность движка проверяется при запуске':'Обновите статус'}</div></div>
  <button class="metric metric-button" onclick={()=>app.tab='terminal'}><span class="metric-label">Подбор</span><span class="metric-value">{app.current?.status||(app.busy?'Выполняется':'Свободно')}</span><span class="metric-note">{app.current?.run_id||'Открыть журнал'}</span></button>
  <button class="metric metric-button" onclick={()=>app.tab='candidates'}><span class="metric-label">Домены</span><span class="metric-value">{tested}</span><span class="metric-note">в загруженных результатах</span></button>
</section>
<details class="panel"><summary>Диагностика системы · {app.connected?'Live':'Переподключение / периодическое обновление'}</summary>
  {#if app.systemKnown}{#each app.diagnostics as item}<p class:bad={!item.ok}>{item.ok?'OK':'FAIL'} · {item.label} · {item.message||''}</p>{/each}{:else}<p>Состояние системы ещё не получено. Действия запуска недоступны.</p>{/if}
  <button onclick={()=>app.refresh()} disabled={app.refreshBusy}>Обновить статус</button>
  <details><summary>Подробности Core</summary><pre>{JSON.stringify(status,null,2)}</pre></details>
</details>
