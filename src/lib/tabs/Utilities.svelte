<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { IconRefresh, IconHistory, IconCopy, IconCheck, IconArrowLeft, IconDownload, IconWorld, IconGitBranch, IconCode } from '@tabler/icons-svelte';
  import RobloxIcon from '$lib/components/icons/RobloxIcon.svelte';
  import CloudLogo from '$lib/components/icons/CloudLogo.svelte';
  import CloudSettings from '$lib/components/CloudSettings.svelte';
  import MinecraftTool from '$lib/components/minecraft/MinecraftTool.svelte';
  import { branding } from '$lib/branding.svelte';

  let {
    user = null,
    apiKey = null,
    onimmersive,
  }: {
    user?: { username: string; discordId: string; createdAt: string } | null;
    apiKey?: string | null;
    onimmersive?: (on: boolean) => void;
  } = $props();

  $effect(() => {
    onimmersive?.(view === 'minecraft');
  });

  onDestroy(() => onimmersive?.(false));

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
  const CHANNELS = ['LIVE', 'ZLIVE', 'zcanary', 'zdev'];

  let view = $state<'home' | 'roblox' | 'cloud' | 'minecraft' | 'git'>('home');
  let platform = $state('windows');
  let channel = $state('LIVE');
  let version = $state<string | null>(null);
  let versionNumber = $state<string | null>(null);
  let download = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let lastChecked = $state<string | null>(null);
  let history = $state<HistoryEntry[]>([]);
  let copied = $state(false);

  /* git repos state */
  let gitRepos = $state<{ name: string; description: string; visibility: string; createdAt: number; updatedAt: number }[]>([]);
  let gitLoading = $state(false);
  let gitError = $state<string | null>(null);
  let creatingGit = $state(false);
  let newGitName = $state('');
  let newGitDesc = $state('');
  let newGitVis = $state<'public' | 'private'>('public');
  let createGitError = $state<string | null>(null);

  async function fetchGitRepos() {
    gitLoading = true;
    gitError = null;
    try {
      const res = await fetch(`/api/git/repos?api_key=${encodeURIComponent(apiKey ?? '')}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      gitRepos = data.repos ?? [];
    } catch (e: any) {
      gitError = e?.message ?? 'failed to load git repos';
    } finally {
      gitLoading = false;
    }
  }

  async function createGitRepo() {
    if (!newGitName.trim()) { createGitError = 'name is required'; return; }
    creatingGit = true;
    createGitError = null;
    try {
      const res = await fetch('/api/git/create/repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGitName.trim(), description: newGitDesc.trim(), visibility: newGitVis }),
      });
      const data = await res.json();
      if (!res.ok) { createGitError = data.error || 'failed'; return; }
      newGitName = '';
      newGitDesc = '';
      newGitVis = 'public';
      await fetchGitRepos();
    } catch (e: any) {
      createGitError = e?.message ?? 'failed to create repo';
    } finally {
      creatingGit = false;
    }
  }

  async function fetchVersion() {
    loading = true;
    error = null;
    try {
      if (platform in DESKTOP_BIN) {
        const res = await fetch(`${BASE}/v2/client-version/${DESKTOP_BIN[platform]}?channel=${encodeURIComponent(channel)}`);
        const data = await res.json();
        if (!res.ok || data?.errors?.length) {
          throw new Error(data?.errors?.[0]?.message ?? `HTTP ${res.status}`);
        }
        version = data.clientVersionUpload ?? data.activeVersion ?? null;
        versionNumber = data.version ?? null;
        if (version) {
          if (platform === 'mac') download = `https://setup.rbxcdn.com/mac/${version}-Roblox.dmg`;
          else if (platform === 'studio') download = `https://setup.rbxcdn.com/${version}-RobloxStudioInstaller.exe`;
          else download = `https://setup.rbxcdn.com/${version}-RobloxPlayerInstaller.exe`;
        } else download = null;
      } else {
        const res = await fetch(`/api/roblox/store?platform=${platform}`);
        const data = await res.json();
        if (!res.ok || data?.error) {
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }
        version = data.version ?? null;
        versionNumber = data.updated ? `updated ${new Date(data.updated).toLocaleDateString()}` : null;
        download = data.download ?? null;
      }
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
      download = null;
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

  function openCloud() {
    view = 'cloud';
  }

  function openGit() {
    view = 'git';
    fetchGitRepos();
  }

  onMount(() => {
    try { history = JSON.parse(localStorage.getItem('robloxVersionHistory') || '[]'); } catch { history = []; }
  });

</script>

<div class="util-root" class:wide={view === 'minecraft'}>
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

      <button class="card" onclick={openCloud}>
        <div class="card-banner banner-cloud">
          <span class="card-icon"><CloudLogo size={44} stroke={1.3} /></span>
        </div>
        <div class="card-body">
          <span class="card-title">Cloud</span>
          <span class="card-desc">Display name, logo, profile picture, username and token.</span>
        </div>
      </button>

      <button class="card" onclick={() => (view = 'minecraft')}>
        <div class="card-banner banner-mc">
          <span class="card-icon"><IconWorld size={44} stroke={1.3} /></span>
        </div>
        <div class="card-body">
          <span class="card-title">Minecraft</span>
          <span class="card-desc">Seed map for structures in Java &amp; Bedrock, plus a seed finder.</span>
        </div>
      </button>

      <button class="card" onclick={openGit}>
        <div class="card-banner banner-git">
          <span class="card-icon"><IconGitBranch size={44} stroke={1.3} /></span>
        </div>
        <div class="card-body">
          <span class="card-title">Git Repositories</span>
          <span class="card-desc">Personal git server backed by Telegram storage. Clone, push, browse.</span>
        </div>
      </button>
    </div>

    <p class="empty-note">more coming whenever i feel like it</p>
  {:else if view === 'roblox'}
    <button class="back-btn" onclick={() => view = 'home'}><IconArrowLeft size={15}/> Utilities</button>

    <div class="util-card">
      <div class="util-head">
        <RobloxIcon size={20} />
        <div>
          <h2>Roblox Version Tracker</h2>
          <p class="util-sub">Desktop from Roblox client settings, mobile from the app stores</p>
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
            <div class="util-actions">
              {#if download}
                <a class="util-copy util-dl" href={download} target="_blank" rel="noreferrer" title={platform === 'ios' ? 'Open in App Store' : 'Download'}>
                  <IconDownload size={16} />
                </a>
              {/if}
              <button class="util-copy" onclick={copyVersion} title="Copy">
                {#if copied}<IconCheck size={16} />{:else}<IconCopy size={16} />{/if}
              </button>
            </div>
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
  {:else if view === 'minecraft'}
    <MinecraftTool onback={() => (view = 'home')} />
  {:else if view === 'git'}
    <button class="back-btn" onclick={() => view = 'home'}><IconArrowLeft size={15}/> Utilities</button>

    <div class="util-card">
      <div class="util-head">
        <IconGitBranch size={20} />
        <div>
          <h2>Git Repositories</h2>
          <p class="util-sub">Personal git server. Clone with HTTPS, push with your API key as the password.</p>
        </div>
        <button class="util-refresh" onclick={fetchGitRepos} disabled={gitLoading} title="Refresh">
          <span class="refresh-ico" class:spin={gitLoading}><IconRefresh size={16} /></span>
        </button>
      </div>

      <div class="util-card">
        <div class="util-head">
          <IconCode size={20} />
          <div>
            <h2>Create Repository</h2>
            <p class="util-sub">Create a new git repository on your personal server.</p>
          </div>
        </div>
        {#if createGitError}
          <div class="util-error">{createGitError}</div>
        {/if}
        <form class="create-form" onsubmit={(e) => { e.preventDefault(); createGitRepo(); }}>
          <div class="util-controls">
            <div class="util-group">
              <span class="util-label">Name</span>
              <input class="util-input" bind:value={newGitName} placeholder="my-repo" required />
            </div>
            <div class="util-group">
              <span class="util-label">Description</span>
              <input class="util-input" bind:value={newGitDesc} placeholder="optional" />
            </div>
            <div class="util-group">
              <span class="util-label">Visibility</span>
              <select class="util-input" bind:value={newGitVis}>
                <option value="public">public</option>
                <option value="private">private</option>
              </select>
            </div>
            <button class="util-btn util-btn-primary" disabled={creatingGit}>
              {creatingGit ? 'Creating…' : 'Create repository'}
            </button>
          </div>
        </form>
      </div>

      {#if gitLoading && gitRepos.length === 0 && !gitError}
        <div class="util-empty">Loading repositories…</div>
      {:else if gitError}
        <div class="util-error">{gitError}</div>
      {:else if gitRepos.length === 0}
        <div class="util-empty">No repositories yet. Create one above.</div>
      {:else}
        <div class="util-history">
          {#each gitRepos as r}
            <div class="util-history-row">
              <span class="util-hv"><a href="/git/{r.name}" target="_blank" rel="noopener" class="repo-link">{r.name}</a></span>
              <span class="util-hm">{r.visibility}</span>
              <span class="util-hd">{new Date(r.updatedAt).toLocaleString()}</span>
              <a href={`https://cloud.omarplayz.eu.org/git/${r.name}`} target="_blank" rel="noopener" class="util-copy" title="Clone URL">
                <IconCode size={14} />
              </a>
            </div>
          {/each}
        </div>
      {/if}

      <div class="util-card">
        <div class="util-head">
          <IconCode size={20} />
          <div>
            <h2>Clone a repository</h2>
            <p class="util-sub">Use your cloud API key as the git password when pushing.</p>
          </div>
        </div>
        <div class="util-empty">
          <pre class="git-cmd">git clone https://cloud.omarplayz.eu.org/git/&lt;repo-name&gt;
cd &lt;repo-name&gt;
# push (password = your API key)
git push origin main</pre>
          <p class="util-sub">Public repos can be cloned without auth. Private repos require your API key as the password.</p>
        </div>
      </div>
    </div>
  {:else}
    <button class="back-btn" onclick={() => view = 'home'}><IconArrowLeft size={15}/> Utilities</button>
    <h1 class="page-title">{branding.name}'s Cloud</h1>
    <p class="page-sub">How you show up across the app.</p>
    <CloudSettings {user} {apiKey} />
  {/if}
</div>

<style>
  .util-root { padding: 32px 40px; max-width: 900px; margin: 0 auto; height: 100%; overflow-y: auto; }
  .util-root.wide { max-width: none; padding: 0; height: 100%; overflow: hidden; }
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
  .banner-cloud {
    background:
      radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--accent) 40%, transparent) 0%, transparent 60%),
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
  .util-input { background: var(--bg-3); border: 1px solid var(--border); color: var(--text-1); padding: 8px 12px; border-radius: 8px; font-size: 13px; font-family: inherit; width: 100%; }
  .util-input::placeholder { color: var(--text-3); }
  .util-btn { background: var(--bg-3); border: 1px solid var(--border); color: var(--text-1); padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
  .util-btn:hover { color: var(--text-1); border-color: var(--border-hover); }
  .util-btn:disabled { opacity: .6; cursor: not-allowed; }
  .util-btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .util-btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
  .create-form { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
  .util-controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; align-items: end; }
  .util-version-box { background: var(--bg-3); border: 1px solid var(--border); border-radius: 10px; padding: 16px; min-height: 76px; }
  .util-version-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .util-version { font-family: ui-monospace, monospace; font-size: 15px; color: var(--text-1); word-break: break-all; }
  .util-version-num { font-size: 12px; color: var(--text-3); margin-top: 4px; }
  .util-copy { background: none; border: 1px solid var(--border); color: var(--text-2); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
  .util-copy:hover { color: var(--green); border-color: var(--green-border); }
  .util-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .util-dl { text-decoration: none; }
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
  .banner-mc {
    background:
      radial-gradient(circle at 50% 42%, rgba(126,201,111,.22) 0%, transparent 60%),
      repeating-linear-gradient(45deg, transparent, transparent 14px, rgba(255,255,255,.04) 14px, rgba(255,255,255,.04) 28px),
      linear-gradient(135deg, #141a14 0%, #0b0e0b 100%);
  }
  .banner-git {
    background:
      radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--accent) 35%, transparent) 0%, transparent 60%),
      repeating-linear-gradient(45deg, transparent, transparent 14px, rgba(255,255,255,.04) 14px, rgba(255,255,255,.04) 28px),
      linear-gradient(135deg, #16161c 0%, #0b0b0e 100%);
  }

  .git-cmd {
    display: block;
    text-align: left;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 12px;
    color: var(--text-1);
    margin-top: 10px;
    overflow-x: auto;
  }
  .repo-link { color: var(--text-1); text-decoration: none; font-weight: 600; }
  .repo-link:hover { color: var(--accent); text-decoration: underline; }

  @media (max-width: 640px) { .util-root { padding: 14px; } .util-root.wide { padding: 0; } }
</style>
