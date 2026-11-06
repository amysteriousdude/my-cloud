<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  let { apiKey, active = false }: { apiKey?: string; active?: boolean } = $props();

  let FXComponent = $state<typeof import('./FX.svelte').default | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function load() {
    if (FXComponent || loading) return;
    loading = true;
    error = null;
    try {
      const mod = await import('./FX.svelte');
      FXComponent = mod.default;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load FX';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (active) load();
  });
</script>

{#if !active}
  <div class="fx-lazy-placeholder"></div>
{:else if loading}
  <div class="fx-lazy-loading">
    <div class="fx-lazy-spinner"></div>
    <p>Loading FX...</p>
  </div>
{:else if error}
  <div class="fx-lazy-error">
    <p>Failed to load FX: {error}</p>
    <button onclick={load}>Retry</button>
  </div>
{:else if FXComponent}
  <FXComponent {apiKey} />
{/if}

<style>
  .fx-lazy-placeholder { height: 100%; }
  .fx-lazy-loading {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100%; gap: 12px; color: var(--text-3);
  }
  .fx-lazy-spinner {
    width: 28px; height: 28px;
    border: 2px solid var(--border); border-top-color: var(--accent);
    border-radius: 50%; animation: fx-spin 0.8s linear infinite;
  }
  @keyframes fx-spin { to { transform: rotate(360deg); } }
  .fx-lazy-error {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100%; gap: 10px; color: var(--text-2); text-align: center; padding: 20px;
  }
  .fx-lazy-error button {
    background: var(--accent); color: white; border: none; border-radius: 6px;
    padding: 8px 16px; cursor: pointer; font-family: inherit;
  }
</style>