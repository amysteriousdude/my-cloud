<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { IconRefresh, IconHistory, IconCopy, IconCheck } from '@tabler/icons-svelte';
  import RobloxIcon from '$lib/components/icons/RobloxIcon.svelte';

  type VersionInfo = { platform: string; channel: string; version: string | null; versionNumber: string | null; error?: string };
  type HistoryEntry = { version: string; at: string };

  const PLATFORMS = [
    { id: 'windows', label: 'Windows' },
    { id: 'studio',  label: 'Studio' },
    { id: 'mac',     label: 'macOS' },
    { id: 'ios',     label: 'iOS' },
    { id: 'android', label: 'Android' },
    { id: 'xbox',    label: 'Xbox' },
  ];
  const CHANNELS = ['LIVE', 'ZLIVE', 'zcanary', 'zdev'];

  let platform = $state('windows');
  let channel = $state('LIVE');
  let info = $state<VersionInfo | null>(null);
  let loading = $state(false);
  let lastChecked = $state<string | null>(null);
  let history = $state<HistoryEntry[]>([]);
  let copied = $state(false);

  async function fetchVersion() {
    loading = true;
    try {
      const res = await fetch(`/api/roblox/version?platform=${platform}&channel=${encodeURIComponent(channel)}`);
      const data = await res.json();
      info = data;
      lastChecked = new Date().toLocaleTimeString();
      if (data.version) {
        const existing = JSON.parse(localStorage.getItem('robloxVersionHistory') || '[]') as HistoryEntry[];
        if (existing[0]?.version !== data.version) {
          existing.unshift({ version: data.version, at: new Date().toISOString() });
          localStorage.setItem('robloxVersionHistory', JSON.stringify(existing.slice(0, 50)));
        }
        history = existing;
      }
    } catch (e: any) {
      info = { platform, channel, version: null, versionNumber: null, error: e?.message ?? 'failed' };
    }
    loading = false;
  }

  async function copyVersion() {
    if (!info?.version) return;
    await navigator.clipboard.writeText(info.version);
    copied = true;
    setTimeout(() => copied = false, 1500);
  }

  onMount(() => {
    try { history = JSON.parse(localStorage.getItem('robloxVersionHistory') || '[]'); } catch { history = []; }
    fetchVersion();
  });
</script>

<div class="util-root">
  <div class="util-card">
    <div class="util-head">
      <RobloxIcon size={20} />
      <div>
        <h2>Roblox Version Tracker</h2>
        <p class="util-sub">Live client versions from Roblox client settings</p>
      </div>
      <button class="util-refresh" onclick={fetchVersion} disabled={loading} title="Refresh">
        <span class="refresh-ico" class:spin={loading}><IconRefresh size={16} /></span>
      </button>
    </div>

    <div class="util-controls">
      <div class="util-group">
        <span class="util-label">Platform</span>
        <div class="util-pills">
          {#each PLATFORMS as p}
            <button class="util-pill" class:active={platform === p.id} onclick={() => { platform = p.id; fetchVersion(); }}>{p.label}</button>
          {/each}
        </div>
      </div>
      <div class="util-group">
        <span class="util-label">Channel</span>
        <div class="util-pills">
          {#each CHANNELS as c}
            <button class="util-pill" class:active={channel === c} onclick={() => { channel = c; fetchVersion(); }}>{c}</button>
          {/each}
        </div>
      </div>
    </div>

    <div class="util-version-box">
      {#if loading && !info}
        <span class="util-loading">Fetching…</span>
      {:else if info?.error}
        <span class="util-error">{info.error}</span>
      {:else if info?.version}
        <div class="util-version-row">
          <div>
            <div class="util-version">{info.version}</div>
            {#if info.versionNumber}
              <div class="util-version-num">version {info.versionNumber}</div>
            {/if}
          </div>
          <button class="util-copy" onclick={copyVersion} title="Copy">
            {#if copied}<IconCheck size={16} />{:else}<IconCopy size={16} />{/if}
          </button>
        </div>
      {/if}
      {#if lastChecked}
        <div class="util-checked">Checked {lastChecked}</div>
      {/if}
    </div>
  </div>

  <div class="util-card">
    <div class="util-head">
      <IconHistory size={20} />
      <div>
        <h2>Change History</h2>
        <p class="util-sub">Tracked version changes (last 50)</p>
      </div>
    </div>
    {#if history.length === 0}
      <div class="util-empty">No version changes recorded yet.</div>
    {:else}
      <div class="util-history">
        {#each history as h, i}
          <div class="util-history-row" class:newest={i === 0}>
            <span class="util-hv">{h.version}</span>
            <span class="util-hd">{new Date(h.at).toLocaleString()}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .util-root { display: flex; flex-direction: column; gap: 16px; padding: 24px; max-width: 860px; margin: 0 auto; height: 100%; overflow-y: auto; }
  .util-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
  .util-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; color: var(--text-1); }
  .util-head h2 { font-size: 16px; margin: 0; }
  .util-sub { font-size: 12px; color: var(--text-3); margin: 2px 0 0; }
  .util-refresh { margin-left: auto; background: var(--bg-3); border: 1px solid var(--border); color: var(--text-2); width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .util-refresh:hover { color: var(--text-1); border-color: var(--border-hover); }
  .util-refresh:disabled { opacity: .6; }
  .refresh-ico { display: flex; }
  .refresh-ico.spin { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .util-controls { display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px; }
  .util-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-3); display: block; margin-bottom: 6px; }
  .util-pills { display: flex; flex-wrap: wrap; gap: 6px; }
  .util-pill { background: var(--bg-3); border: 1px solid var(--border); color: var(--text-2); padding: 6px 12px; border-radius: 999px; font-size: 12px; cursor: pointer; font-family: 'Geist', sans-serif; }
  .util-pill:hover { color: var(--text-1); border-color: var(--border-hover); }
  .util-pill.active { background: color-mix(in srgb, var(--accent) 15%, transparent); border-color: var(--accent); color: var(--text-1); }
  .util-version-box { background: var(--bg-3); border: 1px solid var(--border); border-radius: 10px; padding: 16px; min-height: 76px; }
  .util-version-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .util-version { font-family: ui-monospace, monospace; font-size: 15px; color: var(--text-1); word-break: break-all; }
  .util-version-num { font-size: 12px; color: var(--text-3); margin-top: 4px; }
  .util-copy { background: none; border: 1px solid var(--border); color: var(--text-2); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
  .util-copy:hover { color: var(--green); border-color: var(--green-border); }
  .util-checked { font-size: 11px; color: var(--text-3); margin-top: 10px; }
  .util-loading, .util-empty { color: var(--text-3); font-size: 13px; }
  .util-error { color: var(--red); font-size: 13px; }
  .util-history { display: flex; flex-direction: column; max-height: 340px; overflow-y: auto; }
  .util-history-row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: 6px; font-size: 13px; }
  .util-history-row:nth-child(odd) { background: var(--bg-3); }
  .util-history-row.newest .util-hv { color: var(--green); }
  .util-hv { font-family: ui-monospace, monospace; color: var(--text-1); word-break: break-all; }
  .util-hd { color: var(--text-3); font-size: 11px; white-space: nowrap; }
  @media (max-width: 640px) { .util-root { padding: 14px; } }
</style>
