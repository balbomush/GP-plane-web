<script lang="ts">
  import {onMount} from 'svelte';
  import type {AppModel} from '../app/model.svelte';
  let {app}:{app:AppModel}=$props();
  onMount(()=>{app.history();});
</script>
<section aria-label="История" class="l-stack">
  <h2>История</h2><button onclick={()=>app.history()} disabled={app.historyBusy}>Обновить историю</button>
  <p>{app.view.finderRuns.length} из {app.view.finderRunTotal}</p>
  {#each [...app.view.finderRuns].reverse() as row}
    <article class="run-card l-stack"><h3>{row.run_id||row.id}</h3><p>{row.timestamp} · {row.status} · {row.kind}</p>
      <details><summary>Домены ({row.domains?.length||0})</summary><p>{(row.domains||[]).join(', ')}</p></details>
      <details><summary>Параметры, прогресс и диагностика</summary><pre>{JSON.stringify(row,null,2)}</pre></details>
      <div class="button-row"><button onclick={()=>app.repeat(row)}>Повторить параметры</button><button onclick={()=>{app.refreshLog(row.run_id||row.id);app.tab='terminal';}}>Открыть журнал</button><button onclick={()=>app.tab='candidates'}>К кандидатам</button></div>
    </article>
  {:else}<p>История пуста</p>{/each}
  {#if app.view.finderRunHasMore}<button onclick={()=>app.history(true)} disabled={app.historyBusy}>Загрузить ещё</button>{/if}
</section>
