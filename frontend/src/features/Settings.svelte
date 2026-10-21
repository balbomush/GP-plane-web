<script lang="ts">
  import {WEB_VERSION,UI_VERSION} from '../version';
  import {onMount} from 'svelte';import type {AppModel} from '../app/model.svelte';
  import Backups from './Backups.svelte';import type {BackupsModel} from './backups-model.svelte';
  import {Lifetime} from '../transport/lifetime';import {endpoints as E} from '../transport/endpoints';
  import {runSettings} from '../domain/settings';
  let {app,backups}:{app:AppModel;backups:BackupsModel}=$props();
  let draft=$state<any>({}),dirty=$state(false),saving=$state(false),release=$state<any>(null),checking=$state(false);
  let autoAttempted=false;
  let currentPassword=$state(''),newPassword=$state('');const life=new Lifetime({epoch:()=>app.session.epoch(),isCurrent:epoch=>app.session.isCurrent(epoch)});
  onMount(()=>{draft={...app.settings};return()=>life.dispose();});
  $effect(()=>{if(!dirty)draft={...app.settings};});
  $effect(()=>{if(!app.busy&&!autoAttempted){autoAttempted=true;releases();}});
  async function save(){const submitted=runSettings(draft);saving=true;await life.run('save',signal=>app.api.postJson(E.core.saveRunSettings,{settings:submitted},{signal}),data=>{app.settings=data;saving=false;if(JSON.stringify(runSettings(draft))===JSON.stringify(submitted))dirty=false;app.notice='Настройки сохранены';},e=>{saving=false;app.notice=e.message;});}
  async function releases(){checking=true;await life.run('releases',signal=>app.api.getJson(E.service.releasesAvailable,{signal}),data=>{release=data;checking=false;},e=>{checking=false;app.notice=e.message;});}
  function safeLink(value:any){try{const u=new URL(String(value));return u.protocol==='https:'?u.href:undefined;}catch{return undefined;}}
  let releaseRows=$derived(Array.isArray(release?.releases)?release.releases:Object.values(release?.releases||{}));
</script>
<section aria-label="Настройки" class="l-stack"><h2>Настройки</h2>
  <fieldset disabled={!app.canMutate} oninput={()=>dirty=true}><legend>Настройки Core {dirty?'· есть несохранённые изменения':''}</legend>
    <label class="checkbox-row"><input type="checkbox" bind:checked={draft.enable_ipv6}> IPv6</label><label class="checkbox-row"><input type="checkbox" bind:checked={draft.debug_stdout}> Debug-log</label>
    <p class="muted">Debug-log сохраняет подробный вывод для диагностики. Обычные progress и log доступны без него.</p>
    <label>Максимум параллельных запросов <input type="number" min="1" bind:value={draft.curl_parallelism_max}></label>
    <button onclick={save} disabled={saving}>Сохранить настройки</button>
  </fieldset>
  <details><summary>Пароль</summary><p>Используйте не менее 8 символов или admin для возврата стандартного доступа.</p><form onsubmit={async e=>{e.preventDefault();if(await app.session.changePassword({current_password:currentPassword,new_password:newPassword},error=>{app.notice=error.message;})){currentPassword='';newPassword='';}}}><div class="settings-access-grid l-form-grid"><label>Текущий пароль <input type="password" autocomplete="current-password" bind:value={currentPassword} required></label><label>Новый пароль <input type="password" autocomplete="new-password" bind:value={newPassword} pattern={'.{8,}|admin'} required></label></div><button>Изменить пароль</button></form></details>
  <details><summary>Версии и обновления</summary><p>Core: {app.view.status?.version||app.view.status?.app_version||'—'}. Web: {WEB_VERSION} (UI {UI_VERSION}).</p><button onclick={releases} disabled={checking}>Проверить обновления Core</button>
    {#if release}<p>Установленная версия Core: {release.current?.version||'—'} · ref: {release.current?.installed_ref||'—'}</p>
      {#each releaseRows.filter(Boolean) as item}<article><h3>{item.channel==='stable'?'Стабильный выпуск':item.channel==='prerelease'?'Предварительный выпуск':item.channel||'Выпуск Core'}</h3><p>{item.available_version||item.tag_name||item.version||item.ref||'Не найден'}{item.published_at?` · ${item.published_at}`:''}</p>{#if item.error}<p role="alert">Ошибка проверки: {item.error}</p>{/if}{#if safeLink(item.html_url||item.url)}<a href={safeLink(item.html_url||item.url)} target="_blank" rel="noopener noreferrer">Открыть {item.tag_name||item.version||item.available_version||'выпуск Core'}</a>{/if}</article>{/each}
      <details><summary>Подробности проверки выпусков</summary><pre>{JSON.stringify(release,null,2)}</pre></details>
    {/if}
  </details>
  <Backups model={backups}/>
</section>
