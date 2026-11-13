<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { IconRefresh, IconHistory, IconCopy, IconCheck, IconArrowLeft, IconDownload, IconWorld, IconSearch, IconPlayerStop, IconDice } from '@tabler/icons-svelte';
  import RobloxIcon from '$lib/components/icons/RobloxIcon.svelte';
  import CloudLogo from '$lib/components/icons/CloudLogo.svelte';
  import CloudSettings from '$lib/components/CloudSettings.svelte';
  import { branding } from '$lib/branding.svelte';
  import {
    STRUCTURES,
    JAVA_VERSIONS,
    BEDROCK_VERSIONS,
    findStructures,
    nearestSpot,
    isStructureAvailable,
    type Edition,
    type Dimension,
    type StructureId,
    type StructureSpot,
  } from '$lib/generators/minecraft/structures';
  import { parseSeedInput, randomSeed } from '$lib/generators/minecraft/rng';

  let {
    user = null,
    apiKey = null,
  }: { user?: { username: string; discordId: string; createdAt: string } | null; apiKey?: string | null } = $props();

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

  let view = $state<'home' | 'roblox' | 'cloud' | 'minecraft'>('home');
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

  onMount(() => {
    try { history = JSON.parse(localStorage.getItem('robloxVersionHistory') || '[]'); } catch { history = []; }
  });

  // ── Minecraft seed map ──────────────────────────────────────────
  const MC_DIMS: { id: Dimension; label: string }[] = [
    { id: 'overworld', label: 'Overworld' },
    { id: 'nether', label: 'Nether' },
    { id: 'end', label: 'End' },
  ];

  let mcEdition = $state<Edition>('java');
  let mcVersion = $state(1211);
  let mcSeed = $state('0');
  let mcCenterX = $state(0);
  let mcCenterZ = $state(0);
  let mcRadius = $state(1024);
  let mcSelected = $state<StructureId[]>(['village', 'stronghold', 'monument', 'mansion', 'outpost', 'desert_pyramid', 'ancient_city']);
  let mcResults = $state<StructureSpot[]>([]);
  let mcError = $state<string | null>(null);
  let mcRan = $state(false);
  let mcCopied = $state<string | null>(null);

  let finderStructure = $state<StructureId>('village');
  let finderRadius = $state(512);
  let finderMaxSeeds = $state(100000);
  let finderRunning = $state(false);
  let finderStop = false;
  let finderTried = $state(0);
  let finderMatches = $state<{ seed: bigint; x: number; z: number; distance: number }[]>([]);

  function mcVersionList() {
    return mcEdition === 'java' ? JAVA_VERSIONS : BEDROCK_VERSIONS;
  }

  function setMcEdition(edition: Edition) {
    mcEdition = edition;
    mcVersion = edition === 'java' ? 1211 : 118;
    mcResults = [];
    mcRan = false;
    mcError = null;
  }

  function availableStructures(dim: Dimension): { id: StructureId; label: string }[] {
    return (Object.keys(STRUCTURES) as StructureId[])
      .filter((id) => STRUCTURES[id].dim === dim && isStructureAvailable(mcEdition, mcVersion, id))
      .map((id) => ({ id, label: STRUCTURES[id].label }));
  }

  function toggleMcStructure(id: StructureId) {
    mcSelected = mcSelected.includes(id) ? mcSelected.filter((x) => x !== id) : [...mcSelected, id];
  }

  async function copySpot(r: StructureSpot) {
    await navigator.clipboard.writeText(`${r.x} ${r.z}`);
    mcCopied = `${r.id}:${r.x}:${r.z}`;
    setTimeout(() => (mcCopied = null), 1200);
  }

  function runMcLookup() {
    const seed = parseSeedInput(mcSeed);
    if (seed === null) {
      mcError = 'invalid seed';
      return;
    }
    const structures = mcSelected.filter((id) => isStructureAvailable(mcEdition, mcVersion, id));
    if (!structures.length) {
      mcError = 'pick at least one structure';
      return;
    }
    mcError = null;
    const cx = Number(mcCenterX) || 0;
    const cz = Number(mcCenterZ) || 0;
    const radius = Math.max(16, Math.min(Number(mcRadius) || 1024, 5000));
    const spots = findStructures({ edition: mcEdition, mc: mcVersion, seed, centerX: cx, centerZ: cz, radius, structures });
    spots.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
    mcResults = spots.slice(0, 400);
    mcRan = true;
  }

  function useSeed(seed: bigint) {
    mcSeed = seed.toString();
    if (!mcSelected.includes(finderStructure)) mcSelected = [...mcSelected, finderStructure];
    runMcLookup();
  }

  async function runSeedFinder() {
    if (finderRunning) {
      finderStop = true;
      return;
    }
    const available = (Object.keys(STRUCTURES) as StructureId[]).filter((id) =>
      isStructureAvailable(mcEdition, mcVersion, id),
    );
    if (!available.length) {
      mcError = 'no structures for this version';
      return;
    }
    if (!available.includes(finderStructure)) finderStructure = available[0];

    const edition = mcEdition;
    const mc = mcVersion;
    const structure = finderStructure;
    const radius = Math.max(64, Math.min(Number(finderRadius) || 512, 2000));
    const cap = Math.max(1000, Math.min(Number(finderMaxSeeds) || 100000, 5000000));
    const maxResults = 8;

    finderRunning = true;
    finderStop = false;
    finderTried = 0;
    finderMatches = [];
    mcError = null;

    try {
      while (!finderStop && finderTried < cap && finderMatches.length < maxResults) {
        for (let i = 0; i < 400 && finderTried < cap && finderMatches.length < maxResults; i++) {
          const seed = randomSeed(edition);
          finderTried++;
          const hit = nearestSpot(edition, mc, seed, structure, radius);
          if (hit) {
            finderMatches = [...finderMatches, { seed, ...hit }]
              .sort((a, b) => a.distance - b.distance)
              .slice(0, maxResults);
          }
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      finderRunning = false;
    }
  }
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
    <button class="back-btn" onclick={() => view = 'home'}><IconArrowLeft size={15}/> Utilities</button>

    <div class="util-card">
      <div class="util-head">
        <IconWorld size={20} />
        <div>
          <h2>Minecraft Seed Map</h2>
          <p class="util-sub">Structure coordinates from a seed — Java &amp; Bedrock, version aware</p>
        </div>
        <button class="util-refresh" onclick={() => { mcSeed = randomSeed(mcEdition).toString(); runMcLookup(); }} title="Random seed">
          <IconDice size={16} />
        </button>
      </div>

      <div class="util-controls">
        <div class="util-group">
          <span class="util-label">Edition</span>
          <div class="util-pills">
            <button class="util-pill" class:active={mcEdition === 'java'} onclick={() => setMcEdition('java')}>Java</button>
            <button class="util-pill" class:active={mcEdition === 'bedrock'} onclick={() => setMcEdition('bedrock')}>Bedrock</button>
          </div>
        </div>
        <div class="util-group">
          <span class="util-label">Version</span>
          <div class="util-pills">
            {#each mcVersionList() as v}
              <button class="util-pill" class:active={mcVersion === v.mc} onclick={() => { mcVersion = v.mc; mcResults = []; mcRan = false; }}>{v.label}</button>
            {/each}
          </div>
        </div>
        <div class="mc-inputs">
          <label class="mc-field mc-seed">
            <span class="util-label">Seed</span>
            <input class="mc-input" bind:value={mcSeed} placeholder="number or text seed" onkeydown={(e) => e.key === 'Enter' && runMcLookup()} />
          </label>
          <label class="mc-field">
            <span class="util-label">Center X</span>
            <input class="mc-input" type="number" bind:value={mcCenterX} />
          </label>
          <label class="mc-field">
            <span class="util-label">Center Z</span>
            <input class="mc-input" type="number" bind:value={mcCenterZ} />
          </label>
          <label class="mc-field">
            <span class="util-label">Radius</span>
            <input class="mc-input" type="number" min="16" max="5000" bind:value={mcRadius} />
          </label>
          <button class="mc-run" onclick={runMcLookup}><IconSearch size={16} /> Find</button>
        </div>
      </div>

      <span class="util-label">Structures</span>
      <div class="mc-chips">
        {#each MC_DIMS as d}
          {#each availableStructures(d.id) as s}
            <button class="mc-chip" class:active={mcSelected.includes(s.id)} onclick={() => toggleMcStructure(s.id)}>
              <span class="mc-chip-dot {d.id}"></span>{s.label}
            </button>
          {/each}
        {/each}
      </div>

      {#if mcError}<div class="util-error" style="margin-bottom:10px">{mcError}</div>{/if}
      <p class="mc-note">Approximate: these are placement candidates. Biome and terrain checks aren't simulated, so a listed structure may not actually generate.</p>

      {#if mcRan}
        {#if mcResults.length === 0}
          <div class="util-empty">No candidates in this radius. Try a bigger radius or another version.</div>
        {:else}
          <div class="mc-results">
            {#each mcResults as r}
              <div class="mc-row">
                <span class="mc-row-name">{r.label}{r.index ? ` #${r.index}` : ''}</span>
                <span class="mc-row-coords">X {r.x} · Z {r.z}</span>
                <span class="mc-row-dim">{r.dim}</span>
                <span class="mc-row-dist">{Math.round(Math.hypot(r.x - (Number(mcCenterX) || 0), r.z - (Number(mcCenterZ) || 0)))} m</span>
                <button class="util-copy mc-copy" onclick={() => copySpot(r)} title="Copy coordinates">
                  {#if mcCopied === `${r.id}:${r.x}:${r.z}`}<IconCheck size={14} />{:else}<IconCopy size={14} />{/if}
                </button>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <div class="util-card">
      <div class="util-head">
        <IconSearch size={20} />
        <div>
          <h2>Seed Finder</h2>
          <p class="util-sub">Scan random seeds for a structure near 0, 0 (uses the edition &amp; version above)</p>
        </div>
      </div>

      <div class="mc-inputs">
        <label class="mc-field mc-seed">
          <span class="util-label">Structure</span>
          <select class="mc-input" bind:value={finderStructure}>
            {#each MC_DIMS as d}
              <optgroup label={d.label}>
                {#each availableStructures(d.id) as s}
                  <option value={s.id}>{s.label}</option>
                {/each}
              </optgroup>
            {/each}
          </select>
        </label>
        <label class="mc-field">
          <span class="util-label">Within</span>
          <input class="mc-input" type="number" min="64" max="2000" bind:value={finderRadius} />
        </label>
        <label class="mc-field">
          <span class="util-label">Max seeds</span>
          <input class="mc-input" type="number" min="1000" max="5000000" step="1000" bind:value={finderMaxSeeds} />
        </label>
        <button class="mc-run" onclick={runSeedFinder}>
          {#if finderRunning}<IconPlayerStop size={16} /> Stop{:else}<IconSearch size={16} /> Search{/if}
        </button>
      </div>

      {#if finderRunning || finderTried > 0}
        <div class="mc-progress">
          <div class="mc-progress-bar"><span style={`width:${Math.min(100, (finderTried / Math.min(Number(finderMaxSeeds) || 100000, 5000000)) * 100)}%`}></span></div>
          <span class="mc-progress-label">{finderTried.toLocaleString()} tried · {finderMatches.length} found</span>
        </div>
      {/if}

      {#if finderMatches.length}
        <div class="mc-results">
          {#each finderMatches as m}
            <div class="mc-row">
              <span class="mc-row-name">{m.seed.toString()}</span>
              <span class="mc-row-coords">X {m.x} · Z {m.z}</span>
              <span class="mc-row-dim">{Math.round(m.distance)} m</span>
              <button class="util-pill" onclick={() => useSeed(m.seed)}>Open</button>
            </div>
          {/each}
        </div>
      {/if}
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
  .mc-inputs { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
  .mc-field { display: flex; flex-direction: column; min-width: 96px; }
  .mc-field.mc-seed { flex: 1 1 220px; }
  .mc-input { background: var(--bg-3); border: 1px solid var(--border); border-radius: 8px; color: var(--text-1); padding: 8px 10px; font-size: 13px; font-family: ui-monospace, monospace; outline: none; width: 100%; box-sizing: border-box; }
  .mc-input:focus { border-color: var(--accent); }
  select.mc-input { font-family: 'Geist', sans-serif; }
  .mc-run { display: inline-flex; align-items: center; gap: 6px; background: color-mix(in srgb, var(--accent) 18%, transparent); border: 1px solid var(--accent); color: var(--text-1); border-radius: 8px; padding: 9px 14px; font-size: 13px; cursor: pointer; font-family: 'Geist', sans-serif; white-space: nowrap; }
  .mc-run:hover { background: color-mix(in srgb, var(--accent) 30%, transparent); }
  .mc-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; }
  .mc-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--bg-3); border: 1px solid var(--border); color: var(--text-3); padding: 5px 10px; border-radius: 999px; font-size: 12px; cursor: pointer; font-family: 'Geist', sans-serif; }
  .mc-chip:hover { color: var(--text-1); border-color: var(--border-hover); }
  .mc-chip.active { color: var(--text-1); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .mc-chip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); }
  .mc-chip-dot.overworld { background: #7ec96f; }
  .mc-chip-dot.nether { background: #e07b5f; }
  .mc-chip-dot.end { background: #b58fe0; }
  .mc-note { font-size: 11px; color: var(--text-3); margin: 0 0 14px; line-height: 1.5; }
  .mc-results { display: flex; flex-direction: column; max-height: 380px; overflow-y: auto; border-top: 1px solid var(--border); margin-top: 6px; }
  .mc-row { display: flex; align-items: center; gap: 10px; padding: 7px 2px; border-bottom: 1px solid var(--border); font-size: 12.5px; }
  .mc-row-name { color: var(--text-1); font-weight: 500; min-width: 128px; }
  .mc-row-coords { font-family: ui-monospace, monospace; color: var(--text-2); flex: 1; }
  .mc-row-dim { color: var(--text-3); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  .mc-row-dist { color: var(--text-3); font-family: ui-monospace, monospace; font-size: 11px; }
  .mc-copy { width: 26px; height: 26px; }
  .mc-progress { display: flex; align-items: center; gap: 10px; margin: 10px 0; }
  .mc-progress-bar { flex: 1; height: 5px; background: var(--bg-3); border-radius: 999px; overflow: hidden; }
  .mc-progress-bar span { display: block; height: 100%; background: var(--accent); }
  .mc-progress-label { font-size: 11px; color: var(--text-3); white-space: nowrap; }
  @media (max-width: 640px) { .util-root { padding: 14px; } }
</style>
