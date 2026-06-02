<!-- src/lib/components/Toast.svelte -->
<script lang="ts">
  import { toasts, type Toast } from '$lib/types/toast';
  import { IconX, IconCheck, IconAlertCircle, IconInfoCircle } from '@tabler/icons-svelte';

  let items: Toast[] = $state([]);

  const unsub = toasts.subscribe(v => items = v);

  function icon(type: string) {
    switch (type) {
      case 'success': return IconCheck;
      case 'error': return IconAlertCircle;
      default: return IconInfoCircle;
    }
  }
</script>

<div class="toast-container">
  {#each items as t (t.id)}
    <div class="toast toast-{t.type}">
      <span class="toast-icon">
        {#if t.type === 'success'}
          <IconCheck size={14}/>
        {:else if t.type === 'error'}
          <IconAlertCircle size={14}/>
        {:else}
          <IconInfoCircle size={14}/>
        {/if}
      </span>
      <span class="toast-msg">{t.message}</span>
      <button class="toast-close" onclick={() => toasts.remove(t.id)}>
        <IconX size={12}/>
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--bg-2, #101010);
    border: 1px solid var(--border, #1a1a1a);
    color: var(--text-1, #e2e2e2);
    font-size: 13px;
    font-family: 'Geist', sans-serif;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    pointer-events: auto;
    animation: slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    max-width: 340px;
  }

  .toast-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .toast-success .toast-icon { color: #4ade80; }
  .toast-error .toast-icon { color: #f87171; }
  .toast-info .toast-icon { color: #60a5fa; }

  .toast-msg { flex: 1; }

  .toast-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--text-3, #444);
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: color 0.13s;
  }
  .toast-close:hover { color: var(--text-1, #e2e2e2); }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @media (max-width: 600px) {
    .toast-container {
      bottom: 70px;
      right: 12px;
      left: 12px;
    }
    .toast { max-width: 100%; }
  }
</style>
