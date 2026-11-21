<script lang="ts">
 import {onMount} from 'svelte';let {title,description,confirm,cancel}:{title:string;description:string;confirm:()=>void;cancel:()=>void}=$props();let dialog:HTMLDialogElement;
 onMount(()=>{const previous=document.activeElement as HTMLElement|null;dialog.showModal();return()=>{dialog.close();previous?.focus();};});
</script>
<dialog bind:this={dialog!} oncancel={e=>{e.preventDefault();cancel();}}><h2>{title}</h2><p>{description}</p><div class="actions"><button onclick={cancel}>Отмена</button><button class="primary" onclick={confirm}>Подтвердить</button></div></dialog>
<style>dialog{color:var(--gp-text,#182e26);background:var(--gp-surface,#fff);border:1px solid var(--gp-line,#dbe3dc);border-radius:12px;padding:24px;max-width:min(480px,90vw)}dialog::backdrop{background:#0008}button{min-height:44px;padding:8px 14px}p{line-height:1.5}.actions{display:flex;gap:12px;justify-content:flex-end}</style>
