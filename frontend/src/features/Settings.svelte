<script lang="ts">
  import {WEB_VERSION,UI_VERSION} from '../version';
  import {onMount} from 'svelte';import type {AppModel} from '../app/model.svelte';
  import Backups from './Backups.svelte';import type {BackupsModel} from './backups-model.svelte';
  import {Lifetime} from '../transport/lifetime';import {api2} from '../transport/api2';
  import type {Schemas} from '../transport/api2';
  let {app,backups}:{app:AppModel;backups:BackupsModel}=$props();
  let draft=$state<any>({}),dirty=$state(false),saving=$state(false),release=$state<any>(null),checking=$state(false);
  let autoAttempted=false;
  let currentPassword=$state(''),newPassword=$state('');const life=new Lifetime({epoch:()=>app.session.epoch(),isCurrent:epoch=>app.session.isCurrent(epoch)});
  onMount(()=>{draft={...app.settings};return()=>life.dispose();});
  $effect(()=>{if(!dirty)draft={...app.settings};});
  $effect(()=>{if(!app.busy&&!autoAttempted){autoAttempted=true;releases();}});
  async function releases(){checking=true;await life.run('releases',signal=>Promise.all([app.api.releases('stable',{signal}),app.api.releases('prerelease',{signal})]),data=>{release=data;checking=false;},e=>{checking=false;app.notice=e.message;});}
  function safeLink(value:any){try{const u=new URL(String(value));return u.protocol==='https:'?u.href:undefined;}catch{return undefined;}}
  let releaseRows=$derived((release||[]).flatMap(group=>group.items.map(item=>({...item,channel:group.channel}))));
</script>
<section aria-label="Настройки" class="l-stack"><h2>Настройки</h2>
  <p>Параметры будущего поиска задаются в форме запуска Web и не сохраняются в Core.</p>
  <details><summary>Пароль</summary><p>Используйте не менее 8 символов или admin для возврата стандартного доступа.</p><form onsubmit={async e=>{e.preventDefault();if(await app.session.changePassword({username:'admin',old_password:currentPassword,new_password:newPassword},error=>{app.notice=error.message;})){currentPassword='';newPassword='';}}}><div class="settings-access-grid l-form-grid"><label>Текущий пароль <input type="password" autocomplete="current-password" bind:value={currentPassword} required></label><label>Новый пароль <input type="password" autocomplete="new-password" bind:value={newPassword} pattern={'.{8,}|admin'} required></label></div><button>Изменить пароль</button></form></details>
  <details><summary>Версии и обновления</summary><p>Core: {app.service?.core_version||'—'}. Web: {WEB_VERSION} (UI {UI_VERSION}).</p><button onclick={releases} disabled={checking}>Проверить обновления Core</button>
    {#if release}
      {#each releaseRows as item}<article><h3>{item.channel==='stable'?'Стабильный выпуск':'Предварительный выпуск'}</h3><p>{item.version} · {item.tag}{item.prerelease?' · prerelease':''}</p></article>{/each}
      {#if !releaseRows.length}<p>Выпуски не найдены.</p>{/if}
      <details><summary>Подробности проверки выпусков</summary><pre>{JSON.stringify(release,null,2)}</pre></details>
    {/if}
  </details>
  <Backups model={backups}/>
</section>
