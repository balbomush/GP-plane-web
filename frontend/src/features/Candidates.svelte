<script lang="ts">
  import {onMount} from 'svelte';
  import Results from '@gp-plane/gp-ui';
  import type {CandidatesModel} from './candidates-model.svelte';
  import {domains} from '../domain/finder';
  import {download} from '../transport/download';
  let {model,lists}:{model:CandidatesModel;lists:any}=$props();
  let preset=$state(''),presetName=$state('');
  onMount(()=>model.mount());
</script>
<section aria-label="Кандидаты" class="l-stack">
  <h2>Кандидаты</h2>
  <label>Режим <select aria-label="Режим" bind:value={model.mode} onchange={()=>model.load()}><option value="domain">По доменам</option><option value="common">Общие стратегии</option></select></label>
  {#if model.mode==='domain'}
    <label>Домен <select aria-label="Домен" bind:value={model.domain} onchange={()=>model.load()}><option value="">Все загруженные домены</option>{#each model.index as item}{@const name=typeof item==='string'?item:item.domain}<option value={name}>{name} ({item.strategy_count??item.count??'—'})</option>{/each}</select></label>
    <p>Доменов в индексе {model.index.length} из {model.indexTotal}</p>{#if model.indexMore}<button onclick={()=>model.loadIndex(true)} disabled={model.indexBusy}>Ещё домены</button>{/if}
  {:else}
    <label>Список <select aria-label="Список" bind:value={preset} onchange={()=>model.applyPreset(preset,lists)}><option value="">Свои домены</option>{#if model.tested.length}<option value="tested">Все протестированные</option>{/if}{#each lists.entries('common',true) as entry}<option value={entry.key}>{entry.label}</option>{/each}</select></label>
    <label>Общие домены <textarea bind:value={model.common} oninput={()=>{preset='';model.editCommon();}} rows="5"></textarea></label><p>Выберите минимум два протестированных домена.</p>
    <label>Добавить протестированный домен <input list="tested-domains" bind:value={model.addition}></label><datalist id="tested-domains">{#each model.tested as domain}<option value={domain}></option>{/each}</datalist><button onclick={()=>model.addDomain()}>Добавить домен</button>
    <div class="l-cluster">{#each domains(model.common) as domain}<button onclick={()=>model.removeDomain(domain)} aria-label={`Убрать ${domain}`}>{domain} ×</button>{/each}</div>
    <p>Выбрано протестированных: {model.selectedCommon.length}. Прочие введённые домены не входят в запрос пересечения.</p>
    <details><summary>Сохранение списка пересечения</summary><label>Название списка пересечения <input bind:value={presetName}></label><button onclick={()=>lists.saveCurrent('common',presetName,model.common)} disabled={!model.app.canMutate}>Сохранить список пересечения</button><button onclick={()=>lists.deleteCurrent('common',preset)} disabled={!model.app.canMutate||!lists.ownCustom('common',preset)}>Удалить список пересечения</button></details>
    <button onclick={()=>model.load()} disabled={model.busy}>Найти общие</button><button onclick={()=>model.useDomains()}>Использовать домены для подбора</button>
  {/if}
  <label>Поиск в загруженных аргументах <input bind:value={model.query}></label>
  <label>Семейство <select aria-label="Семейство" bind:value={model.family}><option value="">Все</option>{#each model.families as family}<option>{family}</option>{/each}</select></label>
  <button onclick={()=>model.load()} disabled={model.busy}>Обновить кандидатов</button>
  <p>Загружено {model.rows.length} из {model.total}; показано {model.filtered.length}. Копирование относится к показанным загруженным результатам.</p>
  {#if model.busy||model.error||!model.filtered.length}<Results candidates={[]} loading={model.busy} error={model.error} onCopy={text=>navigator.clipboard.writeText(text)}/>{/if}
  {#each model.strategyLists as list (list.key)}
    <section data-strategy-list={list.key} aria-label={`Стратегии ${list.domain||'общего набора'} ${list.protocol}`}>
      <h3>{list.domain||'Общий набор'} · {list.protocol}</h3>
      <p>Показано {list.visible.length} из {list.rows.length} уникальных загруженных стратегий. Копирование относится к показанным стратегиям этого списка.</p>
      {#if list.rows.length>200}<button onclick={()=>model.toggleList(list.key)}>{list.expanded?'Свернуть до 200':`Показать все ${list.rows.length}`}</button>{/if}
      {#if model.more}<button onclick={()=>model.moreForList(list)} disabled={model.busy}>{model.mode==='domain'&&!model.domain&&list.domain?`Открыть домен ${list.domain}`:'Ещё стратегии этого набора'}</button>{/if}
      <details><summary>Семейства стратегий</summary>{#each model.selection.strategyFamilyGroups(list.visible) as group}<details><summary>{group.family} · {group.rows.length} · {group.best.protocol}</summary><p>{group.familyReason}</p><pre>{group.rows.map(row=>String(row.args||'')).join('\n')}</pre></details>{/each}</details>
      <Results candidates={list.visible} loading={model.busy} error={model.error} onCopy={text=>navigator.clipboard.writeText(text)}/>
    </section>
  {/each}
  {#if model.more}<button onclick={()=>model.load(true)} disabled={model.busy}>Загрузить ещё</button>{/if}
  {#if model.mode==='common'}<details><summary>Итог по загруженным стратегиям</summary>
    <p>Обязательные и желательные домены берутся из системных списков. Изменить их можно на вкладке «Списки».</p>
    <label>Режим отбора <select aria-label="Режим отбора" bind:value={model.resultMode}><option value="coverage">Максимум покрытия</option><option value="minimal">Минимум стратегий</option><option value="balance">Баланс</option></select></label>
    <button onclick={()=>model.calculate(lists)} disabled={model.resultBusy||model.busy}>Рассчитать итог</button>
    {#if model.result}<p>{model.result.reason}</p><p>Не покрыты: {[...model.result.uncovered_required,...model.result.uncovered_desired].join(', ')||'—'}</p>{/if}
    <label>Аргументы итогового набора <textarea bind:value={model.manual} rows="8"></textarea></label>
    <button onclick={()=>model.app.copy(model.manual.trim())}>Копировать итог</button><button onclick={()=>download(new Blob([model.manual.trim()],{type:'text/plain;charset=utf-8'}),'gp-strategies.txt')}>Экспорт итога</button>
    <button onclick={()=>{model.common=domains([...domains(model.required),...domains(model.desired)]).join('\n');model.useDomains();}}>Домены в подбор</button>
  </details>{/if}
</section>
