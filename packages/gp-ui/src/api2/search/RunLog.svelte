<script lang="ts">
 import {onDestroy,untrack} from 'svelte';import {Requests,time,type GpClient,type Dto} from '../client';
 let {client,runId,revision=0}:{client:GpClient;runId:string;revision?:unknown}=$props();const requests=new Requests();let rows=$state<Dto['LogEntry'][]>([]),after=$state<string|null>(null),truncated=$state(false),error=$state(''),busy=$state(false);
 let scrollport: HTMLDivElement;
 function jumpToEnd(){scrollport.scrollTop=scrollport.scrollHeight;}
 let displayedId='';$effect(()=>{const id=runId;JSON.stringify(revision);untrack(()=>{const more=displayedId===id;displayedId=id;if(!more){rows=[];after=null;}load(more);});});onDestroy(()=>requests.dispose());
 function load(more:boolean){busy=true;const id=runId;requests.run('log',signal=>client.readRunLog({path:{run_id:id},query:{limit:200,...(more&&after?{after}:{})}},{signal}),page=>{rows=(more?[...rows,...page.entries]:page.entries).filter((r,i,a)=>a.findIndex(x=>x.position===r.position)===i);after=page.next_after??(more?after:null);truncated=page.truncated;error='';busy=false;},e=>{error=e.message;busy=false;});}
</script>
<details open><summary>Краткий журнал</summary><div class="stack">{#if error}<p role="alert" class="notice error">{error}</p>{/if}{#if truncated}<p class="notice">Журнал усечён. Доступен сохранённый фрагмент.</p>{/if}<div class="log-lines" aria-label="Журнал поиска" bind:this={scrollport}>{#each rows as row (row.position)}<div class="log-entry">
 {#if row.time || row.level}<small class="muted">{#if row.time}<time datetime={row.time}>{time(row.time)}</time>{/if}{#if row.time && row.level} · {/if}{row.level ?? ''}</small>{/if}
 <p>{row.message}</p>
 </div>{:else}<p class="muted">Записей пока нет</p>{/each}</div><div class="actions"><button disabled={busy} onclick={()=>load(false)}>Обновить журнал</button>{#if after}<button disabled={busy} onclick={()=>load(true)}>Ещё журнал</button>{/if}{#if rows.length}<button type="button" onclick={jumpToEnd}>К последним строкам</button>{/if}</div></div></details>
