<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { IconRefresh, IconHistory, IconCopy, IconCheck, IconArrowLeft } from '@tabler/icons-svelte';
  import RobloxIcon from '$lib/components/icons/RobloxIcon.svelte';

  type HistoryEntry = { version: string; platform: string; channel: string; at: string };

  const BASE = 'https://clientsettingscdn.roblox.com';

  const PLATFORMS = [
    { id: 'windows', label: 'Windows', kind: 'desktop' },
    { id: 'studio',  label: 'Studio',  kind: 'desktop' },
    { id: 'mac',     label: 'macOS',   kind: 'desktop' },
    { id: 'ios',     label: 'iOS',     kind: 'mobile' },
    { id: 'android', label: 'Android', kind: 'mobile' },
  ] as const;

  const DESKTOP_BIN: Record<string, string> = {
    windows: 'WindowsPlayer',
    mac: 'MacPlayer',
    studio: 'WindowsStudio64',
  };
  const MOBILE_APP: Record<string, string> = {
    ios: 'AppVersionIOS',
    android: 'AppVersionAndroid',
  };

  const CHANNELS = ['LIVE', 'ZLIVE', 'zcanary', 'zdev'];

  let view = $state<'home' | 'roblox'>('home');
  let platform = $state('windows');
  let channel = $state('LIVE');
  let version = $state<string | null>(null);
  let versionNumber = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let lastChecked = $state<string | null>(null);
  let history = $state<HistoryEntry[]>([]);
  let copied = $state(false);

  async function fetchVersion() {
    loading = true;
    error = null;
    try {
      let url: string;
      if (platform in DESKTOP_BIN) {
        url = `${BASE}/v2/client-version/${DESKTOP_BIN[platform]}?channel=${encodeURIComponent(channel)}`;
      } else {
        url = `${BASE}/v1/mobile-client-version?appVersion=${MOBILE_APP[platform]}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || data?.errors?.length) {
        throw new Error(data?.errors?.[0]?.message ?? `HTTP ${res.status}`);
      }
      version = data.clientVersionUpload ?? data.activeVersion ?? null;
      versionNumber = data.version ?? null;
      lastChecked = new Date().toLocaleTimeString();

      if (version) {
        const existing = JSON.parse(localStorage.getItem('robloxVersionHistory') || '[]') as HistoryEntry[];
        if (existing[0]?.version !== version) {
          existing.unshift({ version, platform, channel, at: new Date().toISOString() });
          localStorage.setItem('robloxVersionHistory', JSON.stringify(existing.slice(0, 50)));
        }
        history = existing;
      }
    } catch (e: any) {
      version = null;
      versionNumber = null;
      error = e?.message ?? 'fetch failed';
    }
    loading = false;
  }

  async function copyVersion() {
    if (!version) return;
    await navigator.clipboard.writeText(version);
    copied = true;
    setTimeout(() => copied = false, 1500);
  }

  function openRoblox() {
    view = 'roblox';
    fetchVersion();
  }

  onMount(() => {
    try { history = JSON.parse(localStorage.getItem('robloxVersionHistory') || '[]'); } catch { history = []; }
  });
</script>

<div class="util-root">
  {#if view === 'home'}
    <h1 class="page-title">Utilities</h1>
    <p class="page-sub">Handy little tools. Most of this talks straight to the outside world from your browser.</p>

    <div class="card-grid">
      <button class="card" onclick={openRoblox}>
        <div class="card-banner banner-roblox">
          <span class="card-icon"><RobloxIcon size={44} /></span>
        </div>
        <div class="card-body">
          <span class="card-title">Roblox</span>
          <span class="card-desc">Live client versions from Roblox client settings, with change tracking.</span>
        </div>
      </button>
    </div>

    <p class="empty-note">more coming whenever i feel like it</p>
  {:else}
    <button class="back-btn" onclick={() => view = 'home'}><IconArrowLeft size={15}/> Utilities</button>

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
        {#if platform in DESKTOP_BIN}
          <div class="util-group">
            <span class="util-label">Channel</span>
            <div class="util-pills">
              {#each CHANNELS as c}
                <button class="util-pill" class:active={channel === c} onclick={() => { channel = c; fetchVersion(); }}>{c}</button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="util-version-box">
        {#if loading && !version && !error}
          <span class="util-loading">Fetching…</span>
        {:else if error}
          <span class="util-error">{error}</span>
        {:else if version}
          <div class="util-version-row">
            <div>
              <div class="util-version">{version}</div>
              {#if versionNumber}
                <div class="util-version-num">version {versionNumber}</div>
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
              <span class="util-hm">{h.platform} · {h.channel}</span>
              <span class="util-hd">{new Date(h.at).toLocaleString()}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .util-root { padding: 32px 40px; max-width: 900px; margin: 0 auto; height: 100%; overflow-y: auto; }
  .page-title { font-size: 22px; font-weight: 700; color: var(--text-1); margin: 0 0 6px; letter-spacing: -.4px; }
  .page-sub { color: var(--text-3); font-size: 13px; margin: 0 0 28px; }

  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-bottom: 40px; }
  .card { border-radius: 14px; border: 1px solid var(--border); background: var(--bg-2); text-decoration: none; overflow: hidden; transition: border-color .15s, transform .15s, box-shadow .15s; display: flex; flex-direction: column; text-align: left; cursor: pointer; padding: 0; font: inherit; color: inherit; }
  .card:hover { border-color: var(--border-hover); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.3); }
  .card-banner { height: 110px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
  .banner-roblox {
    background:
      radial-gradient(circle at 50% 50%, rgba(226,226,226,.14) 0%, transparent 55%),
      repeating-linear-gradient(45deg, transparent, transparent 14px, rgba(255,255,255,.04) 14px, rgba(255,255,255,.04) 28px),
      linear-gradient(135deg, #16161c 0%, #0b0b0e 100%);
  }
  .card-icon { display: flex; color: var(--text-1); filter: drop-shadow(0 2px 8px rgba(0,0,0,.5)); }
  .card-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 5px; }
  .card-title { font-size: 14px; font-weight: 600; color: var(--text-1); }
  .card-desc { font-size: 12px; color: var(--text-3); line-height: 1.45; }
  .empty-note { color: var(--text-3); font-size: 12px; }

  .back-btn { display: inline-flex; align-items: center; gap: 6px; background: none; border: 1px solid var(--border); color: var(--text-2); padding: 6px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; margin-bottom: 18px; font-family: 'Geist', sans-serif; }
  .back-btn:hover { color: var(--text-1); border-color: var(--border-hover); }

  .util-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
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
  .util-hm { color: var(--text-3); font-size: 11px; white-space: nowrap; }
  .util-hd { color: var(--text-3); font-size: 11px; white-space: nowrap; }
  @media (max-width: 640px) { .util-root { padding: 14px; } }
</style>
