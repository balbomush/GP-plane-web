<script lang="ts">
 import {normalizeDomains} from '../client';
 let {value=$bindable(''),suggestions=[]}:{value?:string;suggestions?:string[]}=$props();let draft=$state(''),opened=$state(false),active=$state(-1);const uid=$props.id();
 const selected=$derived(normalizeDomains(value));const options=$derived([...new Set(suggestions)].filter(x=>!selected.includes(x)&&x.toLowerCase().includes(draft.toLowerCase())).slice(0,20));
 function add(domain:string){value=normalizeDomains([...selected,...normalizeDomains(domain)]).join('\n');draft='';active=-1;opened=false;}
 function commit(){if(draft.trim())add(draft);opened=false;}
 export function commitPending(){commit();}
 function blur(event:FocusEvent){
   // Applying filters commits the draft in the click handler, so growing chips
   // cannot move that button between pointer down and click.
   if(event.relatedTarget instanceof HTMLElement && event.relatedTarget.hasAttribute('data-catalog-apply')){
     opened=false;
     return;
   }
   commit();
 }
 function key(e:KeyboardEvent){if(e.key==='ArrowDown'){e.preventDefault();opened=true;active=Math.min(active+1,options.length-1);}else if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(0,active-1);}else if(e.key==='Enter'){e.preventDefault();if(active>=0&&options[active])add(options[active]);else commit();}else if(e.key==='Escape'){opened=false;active=-1;}}
</script>
<div class="domain-picker"><label for={uid}>Домены фильтра</label><div class="chips">{#each selected as domain (domain)}<span class="chip">{domain}<button aria-label={'Убрать домен '+domain} onclick={()=>value=selected.filter(x=>x!==domain).join('\n')}>×</button></span>{/each}</div><input id={uid} role="combobox" aria-autocomplete="list" aria-expanded={opened} aria-controls={uid+'-options'} aria-activedescendant={active>=0?uid+'-'+active:undefined} bind:value={draft} oninput={()=>{opened=true;active=-1;}} onfocus={()=>opened=true} onblur={blur} onkeydown={key} placeholder="Добавить домен…" autocomplete="off" spellcheck="false"/>
 {#if opened&&options.length}<div id={uid+'-options'} role="listbox" aria-label="Домены">{#each options as domain,i (domain)}<button id={uid+'-'+i} role="option" aria-selected={active===i} onpointerdown={e=>e.preventDefault()} onclick={()=>add(domain)}>{domain}</button>{/each}</div>{/if}
</div>
<style>.domain-picker{position:relative;min-width:0;display:grid;gap:6px}.chips:empty{display:none}.chips{display:flex;flex-wrap:wrap;gap:5px}.chip{display:inline-flex;gap:5px;align-items:center;max-width:100%;overflow-wrap:anywhere;background:var(--gp-muted,#edf2ee);border-radius:5px;padding:2px 6px;font-size:12px}.chip button{min-height:30px!important;padding:0 6px!important}[role=listbox]{position:absolute;top:100%;left:0;right:0;max-height:240px;overflow:auto;background:var(--gp-surface,#fff);border:1px solid var(--gp-line,#dbe3dc);padding:6px;z-index:5;box-shadow:0 4px 12px #0002}[role=option]{display:block;width:100%;text-align:left}[aria-selected=true]{background:var(--gp-muted,#edf2ee)}</style>
