<script lang="ts">
  import {onMount} from 'svelte';import type {BackupsModel} from './backups-model.svelte';
  let {model}:{model:BackupsModel}=$props();let file:File|undefined=$state();
  onMount(()=>{model.load();return()=>{model.life.dispose();model.busy=false;};});
</script>
<section aria-label="Бекапы" class="l-stack"><h3>Бекапы</h3>
  <div class="button-row"><button onclick={()=>model.load()}>Обновить бекапы</button><button onclick={()=>model.mutate('create')} disabled={model.busy||!model.app.canMutate}>Создать бекап</button></div>
  <label>ZIP-архив (до 64 МиБ) <input type="file" accept=".zip,application/zip" onchange={e=>file=e.currentTarget.files?.[0]}></label><button onclick={()=>model.upload(file)} disabled={model.busy||!file||!model.app.canMutate}>Загрузить бекап</button>
  {#each model.rows as row}<article class="backup-card l-stack"><h4>{row.id}</h4><p>{row.created_at} · {row.size_bytes||0} Б · Стратегий: {row.strategy_count??row.entity_counts?.strategies??0}</p><p>Checksum: {row.checksum_ok??row.checksum==='ok'?'OK':'FAIL'}</p><div class="button-row"><button onclick={()=>model.download(row.id)}>Download archive</button><button onclick={()=>model.mutate('restore',row.id)} disabled={model.busy||!model.app.canMutate}>Восстановить из бекапа</button><button class="danger" onclick={()=>model.mutate('delete',row.id)} disabled={model.busy||!model.app.canMutate}>Удалить бекап</button></div></article>{:else}<p>Бекапов пока нет</p>{/each}
</section>
