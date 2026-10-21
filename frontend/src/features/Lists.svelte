<script lang="ts">
  import {onMount} from 'svelte';
  import type {ListsModel} from './lists-model.svelte';
  import {domains} from '../domain/finder';
  import {download} from '../transport/download';
  let {model}:{model:ListsModel}=$props();
  let shown=$state(100);
  onMount(()=>{model.app.refreshPresets();return()=>{model.life.dispose();model.busy=false;model.loading=false;model.categoryBusy=false;model.previewBusy=false;};});
  let filtered=$derived(domains(model.text).filter(x=>x.includes(model.query.trim())));
  async function importFile(event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;await model.life.run('file',()=>file.text(),text=>{model.edit();model.text=domains(text).join('\n');model.app.notice='Файл прочитан в редактор; сохраните список.';},e=>{model.app.notice=e.message;});}
</script>
<section aria-label="Списки" class="l-stack">
  <h2>Списки доменов</h2>
  <label>Область <select aria-label="Область" bind:value={model.scope} onchange={()=>model.newList()}><option value="finder">Подбор</option><option value="common">Общие кандидаты</option></select></label>
  <label>Список <select aria-label="Список" bind:value={model.selection} onchange={()=>model.load()}><option value="">Новый список</option>{#each model.entries() as entry}<option value={entry.key}>{entry.kind}: {entry.label}</option>{/each}</select></label>
  <button onclick={()=>model.newList()}>Новый список</button>
  <fieldset disabled={!model.app.canMutate}><legend>Редактор списка</legend>
    <label>Название <input bind:value={model.name} oninput={()=>model.edit()}></label><label>Домены <textarea rows="10" bind:value={model.text} oninput={()=>model.edit()}></textarea></label>
    <p>Уникальных: {model.changes.total}. Добавится: {model.changes.added}; удалится: {model.changes.removed}; без изменений: {model.changes.unchanged}.</p>
    <label>Поиск в списке <input bind:value={model.query} oninput={()=>shown=100}></label>
    <p>{filtered.length} из {domains(model.text).length}</p><ul>{#each filtered.slice(0,shown) as domain}<li>{domain}</li>{/each}</ul>
    {#if filtered.length>shown}<button onclick={()=>shown+=100}>Загрузить ещё домены</button>{/if}
    <div class="button-row"><button onclick={()=>model.save()} disabled={model.busy}>Сохранить</button><button onclick={()=>model.remove()} disabled={model.busy||!model.selection.startsWith('custom:')}>Удалить список</button><button onclick={()=>download(new Blob([domains(model.text).join('\n')+'\n'],{type:'text/plain;charset=utf-8'}),`${model.name||'domains'}.txt`)}>Экспорт</button></div>
    <label>Импорт файла <input type="file" accept=".txt,text/plain" onchange={importFile}></label>
  </fieldset>
  <details><summary>V2Fly</summary>
    <div class="button-row"><button onclick={()=>model.loadCatalog()} disabled={model.sourceBusy}>Проверить локальный каталог</button><button onclick={()=>model.loadCatalog(true)} disabled={model.sourceBusy||!model.app.canMutate}>Обновить каталог</button></div><p>{model.source}</p>
    <label>Поиск категории <input bind:value={model.categoryQuery} oninput={()=>model.choiceChanged()}></label>
    <label>Категории <select aria-label="Категории" multiple size="8" bind:value={model.categories} onchange={()=>model.choiceChanged()}>{#each model.catalog.filter(item=>String(typeof item==='string'?item:item.name||item.id||item.category).includes(model.categoryQuery)) as item}{@const name=typeof item==='string'?item:item.name||item.id||item.category}<option value={name}>{name}</option>{/each}</select></label>
    <button onclick={()=>model.previewCategories()} disabled={model.sourceBusy||!model.categories.length}>Предпросмотр</button><p>Доменов в предпросмотре: {model.preview.length}</p><pre>{model.preview.slice(0,100).join('\n')}</pre>
    <button onclick={()=>model.importPreview()} disabled={model.sourceBusy}>Добавить в редактор</button><button onclick={()=>model.importPreview(true)} disabled={model.sourceBusy}>Заменить редактор</button>
  </details>
</section>
