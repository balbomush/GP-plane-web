<script lang="ts">
  import {onDestroy} from 'svelte';
  import {AppModel} from './app/model.svelte';
  import {ListsModel} from './features/lists-model.svelte';
  import {CandidatesModel} from './features/candidates-model.svelte';
  import {BackupsModel} from './features/backups-model.svelte';
  import Finder from './features/Finder.svelte';
  import History from './features/History.svelte';
  import Terminal from './features/Terminal.svelte';
  import Candidates from './features/Candidates.svelte';
  import Lists from './features/Lists.svelte';
  import Settings from './features/Settings.svelte';
  import Status from './features/Status.svelte';
  import './styles/app.css';
  const app=new AppModel(),lists=new ListsModel(app),candidates=new CandidatesModel(app),backups=new BackupsModel(app);
  let username=$state(''),password=$state('');
  function tabKey(event:KeyboardEvent){const keys=tabs.map(row=>row[0]),index=keys.indexOf(app.tab);let next=index;if(event.key==='ArrowRight')next=(index+1)%keys.length;else if(event.key==='ArrowLeft')next=(index+keys.length-1)%keys.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=keys.length-1;else return;event.preventDefault();app.tab=keys[next];(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role=tab]')[next].focus();}
  const tabs=[['finder','Подбор'],['history','История'],['candidates','Кандидаты'],['terminal','Терминал'],['lists','Списки'],['settings','Настройки']];
  onDestroy(()=>app.dispose());
  async function login(event:SubmitEvent){event.preventDefault();await app.login(username,password);password='';}
</script>
<main class="app-shell l-stack">
  <header class="l-cluster"><h1>GP Plane Web</h1>{#if app.token}<button class="secondary" onclick={()=>app.session.logout()}>Выйти</button>{/if}</header>
  {#if !app.ready}
    {#if !app.token}<form onsubmit={login}><h2>Вход</h2><label>Логин <input bind:value={username} autocomplete="username" required></label><label>Пароль <input type="password" bind:value={password} autocomplete="current-password" required></label><button disabled={app.loginBusy||app.boot==='loading'}>Войти</button></form>
    {:else}<p role="status">{app.boot==='loading'?'Загрузка Core…':'Не удалось загрузить Core'}</p><button onclick={()=>app.retry()} disabled={app.boot==='loading'}>Повторить загрузку</button>{/if}
    {#if app.error}<p role="alert">{app.error}</p>{/if}
  {:else}
    <Status {app}/>
    <div aria-label="Разделы" role="tablist" tabindex="-1" class="tabs l-cluster" onkeydown={tabKey}>{#each tabs as [key,label]}<button id={`tab-${key}`} role="tab" class="tab-button" class:active={app.tab===key} aria-selected={app.tab===key} aria-controls={`tab-panel-${key}`} tabindex={app.tab===key?0:-1} onclick={()=>app.tab=key}>{label}</button>{/each}</div>
    <p role="status" aria-live="polite">{app.notice}</p>{#if app.error}<p role="alert">{app.error}</p>{/if}
    <div id={`tab-panel-${app.tab}`} role="tabpanel" aria-labelledby={`tab-${app.tab}`} class="tab-page active panel">
    {#if app.tab==='finder'}<Finder {app} {lists}/>
    {:else if app.tab==='history'}<History {app}/>
    {:else if app.tab==='candidates'}<Candidates model={candidates} {lists}/>
    {:else if app.tab==='terminal'}<Terminal {app}/>
    {:else if app.tab==='lists'}<Lists model={lists}/>
    {:else if app.tab==='settings'}<Settings {app} {backups}/>{/if}
    </div>
  {/if}
</main>
<style>
  :global(body){margin:0}main{max-width:1200px;margin:auto;padding:1rem}:global(label){display:block;margin:.5rem 0}:global(textarea){width:100%;box-sizing:border-box}:global([data-result] code){color:inherit}:global(pre){overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.tabs{flex-wrap:wrap}:global(fieldset){min-width:0}:global(button){cursor:pointer}:global(button:disabled){cursor:default}:global(input),:global(select),:global(textarea),:global(button){max-width:100%}[role=alert]{color:#c44}:global(section){min-width:0}
</style>
