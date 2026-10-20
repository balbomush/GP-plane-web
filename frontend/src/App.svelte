<script lang="ts">
  import {onMount, onDestroy} from 'svelte';
  import Results from '@gp-plane/gp-ui';
  import {validCandidates, type Candidate} from '@gp-plane/gp-ui/format';
  import {ApiClient} from './api-client.js';
  import {SessionController} from './session-controller.js';
  let username = $state('admin'), password = $state('');
  let token = $state(''), ready = $state(false), loading = $state(false);
  let error = $state(''), authError = $state('');
  let candidates: Candidate[] = $state([]);
  let hasMore = $state(false), total = $state(0);
  let currentPassword = $state(''), newPassword = $state('');
  const api = new ApiClient({getToken:()=>token, getEpoch:()=>session.epoch(),
    isEpochCurrent:(epoch:number)=>session.isCurrent(epoch), getSignal:()=>session.signal(),
    onUnauthorized:()=>session.logout('Сессия завершена. Войдите снова.')});
  const session = new SessionController({api,
    token:{store:(data:{access_token:string})=>{token=data.access_token;},clear:()=>{token='';}},
    ui:{begin:()=>{error='';loading=true;},boot:(state:string)=>{if(state==='failed'){loading=false;error='Не удалось загрузить результаты. Повторите запрос.';}},
      ready:()=>{loading=false;ready=true;},login:(message:string)=>{ready=false;candidates=[];hasMore=false;total=0;loading=false;authError=message||'';},
      load:async(signal:AbortSignal)=>{
        const data=await api.getJson('/api/web/strategy-candidates-page?limit=50&offset=0',{signal});
        validatePage(data);
        return data;
      }, apply:(data:any)=>{candidates=data.candidates;hasMore=data.has_more;total=data.total;}}});
  function validatePage(data:any) {
    if(!data || !validCandidates(data.candidates) || typeof data.has_more!=='boolean' || !Number.isSafeInteger(data.total) || data.total<0)
      throw new Error('Неверный ответ Core');
  }
  async function login(event:SubmitEvent) {
    event.preventDefault();authError='';
    await session.login({username,password},(e:Error)=>{authError=e.message;});
    password='';
    // A valid login with a failed query still permits retry and password rotation.
    if(token) ready=true;
  }
  async function refresh(){await session.bootstrap(session._ui.load,session._ui.apply);}
  async function more() {
    const epoch=session.epoch(); loading=true;error='';
    try {
      const data=await api.getJson(`/api/web/strategy-candidates-page?limit=50&offset=${candidates.length}`);
      validatePage(data);
      if(!session.isCurrent(epoch)) return;
      candidates=[...candidates,...data.candidates];hasMore=data.has_more;total=data.total;
    } catch(e) {if(session.isCurrent(epoch)) error=e instanceof Error?e.message:String(e);}
    finally {if(session.isCurrent(epoch)) loading=false;}
  }
  onDestroy(()=>session.logout());
  onMount(()=>{ready=false;});
</script>

<main>
  <header><h1>GP Plane Web</h1><p>Результаты подбора</p></header>
  {#if !ready}
    <form onsubmit={login}>
      <h2>Вход</h2>
      <label>Логин <input bind:value={username} autocomplete="username" required></label>
      <label>Пароль <input type="password" bind:value={password} autocomplete="current-password" required></label>
      <button type="submit">Войти</button>
      {#if authError}<p role="alert">{authError}</p>{/if}
    </form>
  {:else}
    <nav><button onclick={refresh} disabled={loading}>Обновить результаты</button><button onclick={()=>session.logout()}>Выйти</button></nav>
    <p>Загружено {candidates.length} из {total}. Копирование всех относится к загруженным результатам.</p>
    <Results {candidates} {loading} {error} onCopy={text=>navigator.clipboard.writeText(text)} />
    {#if hasMore}<button onclick={more} disabled={loading}>Загрузить ещё</button>{/if}
    <details><summary>Сменить пароль</summary>
      <form onsubmit={async e=>{e.preventDefault();await session.changePassword({current_password:currentPassword,new_password:newPassword},(e:Error)=>{authError=e.message;});currentPassword='';newPassword='';}}>
        <label>Текущий пароль <input type="password" bind:value={currentPassword} autocomplete="current-password" required></label>
        <label>Новый пароль <input type="password" bind:value={newPassword} autocomplete="new-password" required minlength="8"></label>
        <button type="submit">Изменить пароль</button>
        {#if authError}<p role="alert">{authError}</p>{/if}
      </form>
    </details>
  {/if}
</main>
<style>
  :global(body){font:16px system-ui,sans-serif;background:#fafbfd;color:#172331;margin:0}
  main{max-width:1100px;margin:auto;padding:1.5rem}header{border-bottom:1px solid #ccd4df;margin-bottom:1rem}
  label{display:block;margin:1rem 0}input{padding:.5rem}button{padding:.5rem .8rem;cursor:pointer}
  nav{display:flex;gap:1rem}details{margin-top:2rem}[role=alert]{color:#a02121}
</style>
