<script lang="ts">
  import {onDestroy} from 'svelte';
  import {candidateDomains, strategiesText, strategyText} from './format.js';
  import type {Candidate} from './format.js';
  let {candidates, loading = false, error = '', onCopy, onCopyResult}:
    {candidates: Candidate[]; loading?: boolean; error?: string;
     onCopy: (text: string) => Promise<void>; onCopyResult?: (ok: boolean, message: string) => void} = $props();
  let copying = $state(false);
  let message = $state('');
  let alive = true;
  onDestroy(() => { alive = false; });
  async function copy(text: string) {
    if (!text || copying) return;
    copying = true;
    try {
      await onCopy(text);
      if (!alive) return;
      message = 'Скопировано';
      onCopyResult?.(true, message);
    } catch (e) {
      if (!alive) return;
      message = `Не удалось скопировать: ${e instanceof Error ? e.message : String(e)}`;
      onCopyResult?.(false, message);
    } finally { if (alive) copying = false; }
  }
</script>

<section aria-label="Найденные стратегии">
  <h2>Найденные стратегии</h2>
  {#if loading}<p role="status">Загрузка результатов…</p>
  {:else if error}<p role="alert">{error}</p>
  {:else if !candidates.length}<p>Стратегий пока нет.</p>
  {:else}
    <button onclick={() => copy(strategiesText(candidates))} disabled={copying}>Скопировать все</button>
    {#each candidates as row, i}
      <article data-result={i}>
        <h3>{row.protocol} · {candidateDomains(row).join(', ') || 'Домены не указаны'}</h3>
        <p>{row.status || ''}</p>
        {#if row.fragmentation_reason}<p>{row.fragmentation_reason}</p>{/if}
        <pre><code>{row.args}</code></pre>
        <button onclick={() => copy(strategyText(row))} disabled={copying || !strategyText(row)}>Копировать стратегию {i + 1}</button>
      </article>
    {/each}
  {/if}
  <p role="status" aria-live="polite">{message}</p>
</section>

<style>
  article {border:1px solid #ccd4df;border-radius:.5rem;padding:1rem;margin:1rem 0}
  pre {white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f8;padding:1rem;color:#172331}
  button {cursor:pointer;padding:.5rem .8rem} [role=alert] {color:#a02121}
</style>
