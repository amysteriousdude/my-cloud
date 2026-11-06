<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  let { apiKey, active = false }: { apiKey?: string; active?: boolean } = $props();
</script>

{#await import('./FX.svelte')}
  <div class="fx-lazy-loading">
    <div class="fx-lazy-spinner"></div>
    <p>Loading FX...</p>
  </div>
{:then mod}
  <svelte:component this={mod.default} {apiKey} />
{:catch error}
  <div class="fx-lazy-error">
    <p>Failed to load FX: {error instanceof Error ? error.message : 'Unknown error'}</p>
    <button onclick={() => window.location.reload()}>Reload</button>
  </div>
{/await}

<style>
  .fx-lazy-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--text-3);
  }
  .fx-lazy-spinner {
    width: 28px;
    height: 28px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: fx-spin 0.8s linear infinite;
  }
  @keyframes fx-spin {
    to { transform: rotate(360deg); }
  }
  .fx-lazy-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 10px;
    color: var(--text-2);
    text-align: center;
    padding: 20px;
  }
  .fx-lazy-error button {
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    cursor: pointer;
    font-family: inherit;
  }
</style>