<script lang="ts">
 import LegacyResults from '@gp-plane/gp-ui';
 import {strategyText} from '@gp-plane/gp-ui/format';
 import {onMount,untrack} from 'svelte';
 import {GpSearch,GpCurrentSearch,GpStrategies,GpBundles,GpHistory,GpDomainLists,GpSession,type GpClient} from '@gp-plane/gp-ui/api2';
 // Independent host capabilities: no Web imports or Core bearer management.
 let {client}: {client:GpClient}=$props();
 const session=new GpSession(untrack(()=>client));let view=$state('search');let opened=$state(true);let alternative=$state(false);const legacy=[{id:'legacy-1',args:'--legacy exact',protocol:'TLS',seen:[{domain:'legacy.example'}]}];
 onMount(()=>{session.start();return()=>session.dispose();});
</script>
<p class="outside-host">Внешняя область оболочки</p><button onclick={()=>alternative=!alternative}>Тема consumer</button>
<section style:--gp-text={alternative?'#fdedff':'#202030'} style:--gp-surface={alternative?'#24132e':'#fff'} style:--gp-bg={alternative?'#170d20':'#f6f1fa'} style="--gp-accent:#7b3db0;--gp-line:#d6c8df;--gp-secondary:#5b4966">
 <h1>Независимая оболочка</h1>
 <button onclick={()=>{opened=false;session.dispose();}}>Закрыть область GP</button>
 {#if opened}<nav aria-label="Тестовый consumer">{#each ['search','strategies','bundles','history','lists','legacy'] as name (name)}<button onclick={()=>view=name}>{name}</button>{/each}</nav>
 {#if view==='search'}<GpSearch {client} {session} initialDomains={['from-host.example']}/><GpCurrentSearch {client} {session}/>{:else if view==='strategies'}<GpStrategies {client} {session}/>{:else if view==='bundles'}<GpBundles {client} {session}/>{:else if view==='history'}<GpHistory {client} {session} onNew={()=>view='search'} onCurrent={()=>view='search'}/>{:else if view==='legacy'}<LegacyResults candidates={legacy} onCopy={text=>client.copy(text)}/><p data-legacy-format>{strategyText(legacy[0])}</p>{:else}<GpDomainLists {client} {session} onSearch={()=>view='search'}/>{/if}{/if}
</section>
