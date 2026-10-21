<script lang="ts">
  import type {AppModel} from '../app/model.svelte';
  let {app}:{app:AppModel}=$props();
  let rows=$derived.by(()=>{
    const items:any[]=[],last=app.view.finderRuns.at(-1),log=app.view.finderLog||{};
    if(!app.busy&&['running','queued','stopping'].includes(last?.status))items.push({severity:'warning',title:'Предыдущий подбор был прерван перезагрузкой',message:'Активный подбор не восстанавливается после перезагрузки. Откройте последний лог или повторите запуск вручную.'});
    if(app.view.status?.state?.last_error)items.push({severity:'error',title:'Ошибка сервиса',message:String(app.view.status.state.last_error)});
    for(const item of (log.stderr_diagnostics||[]).slice(0,3))items.push({severity:item.severity==='warning'?'warning':'error',title:item.label||item.status||'Диагностика подбора',message:item.message||''});
    if(!items.length&&String(log.stderr_tail||'').trim())items.push({severity:'warning',title:'Последний stderr',message:String(log.stderr_tail).trim().split('\n').at(-1)});
    return items;
  });
  function copy(){const text=rows.map(row=>`[${row.severity}] ${row.title}: ${row.message}`).join('\n\n');app.copy([text,app.view.finderLog?.stderr_tail?`stderr:\n${app.view.finderLog.stderr_tail}`:''].filter(Boolean).join('\n\n')||'Ошибок и предупреждений нет.');}
</script>
<section class="events-panel l-stack" aria-label="Ошибки и предупреждения">
  <h3>Ошибки и предупреждения</h3>
  {#each rows as row}<article class="event-card l-stack" class:bad={row.severity==='error'}><div class="event-header"><strong>{row.title}</strong><span>{row.severity==='error'?'Ошибка':'Предупреждение'}</span></div><p>{row.message}</p></article>{:else}<p>Текущий срез не содержит значимых ошибок.</p>{/each}
  <div class="event-actions l-cluster"><button onclick={()=>{const last=app.view.finderRuns.at(-1);if(last)app.repeat(last);}} disabled={!app.view.finderRuns.length}>Повторить последний подбор</button><button onclick={()=>app.refreshLog()}>Открыть лог</button><button onclick={copy}>Копировать диагностику</button></div>
</section>
