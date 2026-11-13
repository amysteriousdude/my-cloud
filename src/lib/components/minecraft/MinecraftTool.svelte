<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  import { tick } from 'svelte';
  import {
    IconArrowLeft,
    IconWorld,
    IconSearch,
    IconDice,
    IconPlayerStop,
    IconCopy,
    IconCheck,
    IconMap2,
    IconLayersSubtract,
    IconFocusCentered,
    IconChevronDown,
    IconPlus,
    IconX,
    IconBulb,
  } from '@tabler/icons-svelte';
  import McMap from './McMap.svelte';
  import {
    STRUCTURES,
    JAVA_VERSIONS,
    BEDROCK_VERSIONS,
    DEFAULT_SELECTION,
    DIMENSIONS,
    findStructures,
    nearestSpot,
    isStructureAvailable,
    type Edition,
    type Dimension,
    type StructureId,
    type StructureSpot,
  } from '$lib/generators/minecraft/structures';
  import { parseSeedInput, randomSeed } from '$lib/generators/minecraft/rng';

  interface Props {
    onback?: () => void;
  }
  let { onback = () => {} }: Props = $props();

  type MapApi = {
    focusOn: (x: number, z: number, scale?: number) => void;
    selectAndFocus: (spot: StructureSpot) => void;
  };

  const DIM_LABEL: Record<Dimension, string> = {
    overworld: 'Overworld',
    nether: 'Nether',
    end: 'The End',
  };

  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

  let seedText = $state('0');
  let seed = $state<bigint>(0n);
  let seedError = $state<string | null>(null);
  let edition = $state<Edition>('java');
  let mc = $state(1211);
  let dimension = $state<Dimension>('overworld');
  let activeTab = $state<'map' | 'finder'>('map');
  let mapRef = $state<MapApi | null>(null);

  let selected = $state<Record<Dimension, StructureId[]>>({
    overworld: [...DEFAULT_SELECTION.overworld],
    nether: [...DEFAULT_SELECTION.nether],
    end: [...DEFAULT_SELECTION.end],
  });

  let mapSpots = $state<StructureSpot[]>([]);
  let view = $state<{ x: number; z: number; scale: number; cursor: { x: number; z: number } | null }>({
    x: 0,
    z: 0,
    scale: 0.25,
    cursor: null,
  });
  let mapBusy = $state(false);
  let structureSearch = $state('');
  let copiedKey = $state<string | null>(null);

  let showGrid = $state(true);
  let showLabels = $state(true);
  let showSlime = $state(false);

  let versions = $derived(edition === 'java' ? JAVA_VERSIONS : BEDROCK_VERSIONS);

  let allAvailable = $derived(
    (Object.keys(STRUCTURES) as StructureId[]).filter((id) => isStructureAvailable(edition, mc, id)),
  );

  let dimensionStructures = $derived(
    selected[dimension].filter(
      (id) => STRUCTURES[id].dim === dimension && isStructureAvailable(edition, mc, id),
    ),
  );

  let sidebarStructures = $derived.by(() => {
    const q = structureSearch.trim().toLowerCase();
    return allAvailable
      .filter((id) => STRUCTURES[id].dim === dimension)
      .filter((id) => !q || STRUCTURES[id].label.toLowerCase().includes(q));
  });

  let structureCounts = $derived.by(() => {
    const counts: Partial<Record<StructureId, number>> = {};
    for (const s of mapSpots) {
      if (s.dim !== dimension) continue;
      counts[s.id] = (counts[s.id] ?? 0) + 1;
    }
    return counts;
  });

  let resultRows = $derived.by(() => {
    const rows = mapSpots
      .filter((s) => s.dim === dimension)
      .map((s) => ({ spot: s, d: Math.hypot(s.x - view.x, s.z - view.z) }))
      .sort((a, b) => a.d - b.d);
    return rows.slice(0, 160);
  });

  let selectedCount = $derived(
    DIMENSIONS.reduce((n, d) => n + selected[d].filter((id) => isStructureAvailable(edition, mc, id)).length, 0),
  );

  // ── seed handling ──────────────────────────────────────────────
  function applySeed() {
    const parsed = parseSeedInput(seedText);
    if (parsed === null) {
      seedError = 'Enter a number or text seed.';
      return;
    }
    seed = edition === 'bedrock' ? BigInt.asUintN(32, parsed) : parsed;
    seedText = seed.toString();
    seedError = null;
  }

  function randomizeSeed() {
    const next = randomSeed(edition);
    seed = next;
    seedText = next.toString();
    seedError = null;
  }

  function setEdition(next: Edition) {
    edition = next;
    mc = next === 'java' ? 1211 : 121;
    if (next === 'bedrock') {
      seed = BigInt.asUintN(32, seed);
      seedText = seed.toString();
    }
    mapSpots = [];
    normalizeFinder();
  }

  function setVersion(next: number) {
    mc = next;
    mapSpots = [];
    normalizeFinder();
  }

  // ── structure selection ────────────────────────────────────────
  function toggleStructure(id: StructureId) {
    const current = selected[dimension];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    selected = { ...selected, [dimension]: next };
  }

  function selectAll(on: boolean) {
    const ids = allAvailable.filter((id) => STRUCTURES[id].dim === dimension);
    selected = { ...selected, [dimension]: on ? ids : [] };
  }

  async function copyCoords(spot: StructureSpot) {
    await navigator.clipboard.writeText(`${spot.x} ${spot.z}`);
    const key = `${spot.id}:${spot.x}:${spot.z}`;
    copiedKey = key;
    setTimeout(() => {
      if (copiedKey === key) copiedKey = null;
    }, 1200);
  }

  function focusSpot(spot: StructureSpot) {
    mapRef?.selectAndFocus(spot);
  }

  // ── seed finder ────────────────────────────────────────────────
  type FinderCondition = { id: StructureId; radius: number };
  type FinderHit = {
    id: StructureId;
    label: string;
    dim: Dimension;
    x: number;
    z: number;
    distance: number;
  };
  type FinderResult = { seed: bigint; hits: FinderHit[]; score: number };

  let conditions = $state<FinderCondition[]>([
    { id: 'village', radius: 256 },
    { id: 'monument', radius: 512 },
  ]);
  let finderMode = $state<'all' | 'any'>('all');
  let finderMaxSeeds = $state(100000);
  let finderLimit = $state(10);
  let finderRunning = $state(false);
  let finderTried = $state(0);
  let finderRate = $state(0);
  let finderDone = $state(false);
  let finderResults = $state<FinderResult[]>([]);
  let finderError = $state<string | null>(null);
  let finderStop = false;

  let finderProgress = $derived(
    Math.min(100, (finderTried / Math.max(1, Math.min(Number(finderMaxSeeds) || 100000, 2_000_000))) * 100),
  );

  function normalizeFinder() {
    const avail = (Object.keys(STRUCTURES) as StructureId[]).filter((id) =>
      isStructureAvailable(edition, mc, id),
    );
    if (!avail.length) return;
    conditions = conditions.map((c) => (avail.includes(c.id) ? c : { ...c, id: avail[0] }));
  }

  function addCondition() {
    const used = new Set(conditions.map((c) => c.id));
    const next = allAvailable.find((id) => !used.has(id)) ?? allAvailable[0];
    if (!next) return;
    conditions = [...conditions, { id: next, radius: 512 }];
  }

  function removeCondition(index: number) {
    conditions = conditions.filter((_, i) => i !== index);
  }

  async function runFinder() {
    if (finderRunning) {
      finderStop = true;
      return;
    }
    normalizeFinder();
    const active = conditions.filter((c) => isStructureAvailable(edition, mc, c.id));
    if (!active.length) {
      finderError = 'Add at least one structure to search for.';
      return;
    }

    const cap = clamp(Number(finderMaxSeeds) || 100000, 1000, 2_000_000);
    const limit = clamp(Number(finderLimit) || 10, 1, 50);
    const editionNow = edition;
    const mcNow = mc;

    finderError = null;
    finderRunning = true;
    finderStop = false;
    finderDone = false;
    finderTried = 0;
    finderRate = 0;
    finderResults = [];

    const started = performance.now();
    let lastSample = started;
    let lastTried = 0;

    try {
      while (!finderStop && finderTried < cap && finderResults.length < limit) {
        for (let i = 0; i < 16 && !finderStop && finderTried < cap && finderResults.length < limit; i++) {
          const sd = randomSeed(editionNow);
          finderTried++;

          const hits: FinderHit[] = [];
          let ok = true;
          for (const c of active) {
            const hit = nearestSpot(editionNow, mcNow, sd, c.id, c.radius);
            if (hit) {
              hits.push({
                id: c.id,
                label: STRUCTURES[c.id].label,
                dim: STRUCTURES[c.id].dim,
                x: hit.x,
                z: hit.z,
                distance: hit.distance,
              });
              if (finderMode === 'any') break;
            } else if (finderMode === 'all') {
              ok = false;
              break;
            }
          }

          if (ok && hits.length) {
            const score =
              finderMode === 'all'
                ? Math.max(...hits.map((h) => h.distance))
                : Math.min(...hits.map((h) => h.distance));
            finderResults = [...finderResults, { seed: sd, hits, score }]
              .sort((a, b) => a.score - b.score)
              .slice(0, limit);
          }
        }

        const now = performance.now();
        if (now - lastSample > 350) {
          finderRate = Math.round((finderTried - lastTried) / ((now - lastSample) / 1000));
          lastSample = now;
          lastTried = finderTried;
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      finderRate = 0;
      finderRunning = false;
      finderDone = true;
      if (!finderResults.length && finderTried > 0) {
        finderError = `No matches in ${finderTried.toLocaleString()} seeds. Widen radii or scan more seeds.`;
      }
    }
  }

  async function openFinderResult(result: FinderResult) {
    seed = result.seed;
    seedText = result.seed.toString();
    seedError = null;
    finderStop = true;
    const hit = result.hits[0];
    activeTab = 'map';
    if (!hit) return;

    dimension = hit.dim;
    if (!selected[hit.dim].includes(hit.id)) {
      selected = { ...selected, [hit.dim]: [...selected[hit.dim], hit.id] };
    }
    mapSpots = [];
    await tick();
    setTimeout(() => mapRef?.focusOn(hit.x, hit.z, 1.1), 30);
  }

  function setDimension(next: Dimension) {
    dimension = next;
    mapSpots = [];
  }
</script>

<div class="mc-tool">
  <header class="mc-top">
    <button class="mc-back" onclick={onback} title="Back to Utilities">
      <IconArrowLeft size={15} /><span>Utilities</span>
    </button>

    <div class="mc-brand">
      <div class="mc-brand-icon"><IconWorld size={21} /></div>
      <div class="mc-brand-text">
        <strong>Minecraft Seed Map</strong>
        <span>structure finder · Java &amp; Bedrock</span>
      </div>
    </div>

    <div class="mc-seed-box">
      <span class="seed-tag">SEED</span>
      <input
        class="seed-input"
        bind:value={seedText}
        placeholder="number or text seed"
        spellcheck="false"
        onkeydown={(e) => e.key === 'Enter' && applySeed()}
        aria-label="World seed"
      />
      <button class="seed-icon" onclick={randomizeSeed} title="Random seed">
        <IconDice size={16} />
      </button>
      <button class="seed-go" onclick={applySeed}>Load</button>
    </div>

    <div class="mc-seg" role="group" aria-label="Edition">
      <button class:active={edition === 'java'} onclick={() => setEdition('java')}>Java</button>
      <button class:active={edition === 'bedrock'} onclick={() => setEdition('bedrock')}>Bedrock</button>
    </div>

    <div class="mc-version">
      <select
        bind:value={mc}
        onchange={() => setVersion(Number(mc))}
        aria-label="Game version"
      >
        {#each versions as v}
          <option value={v.mc}>{v.label}</option>
        {/each}
      </select>
      <IconChevronDown size={13} />
    </div>
  </header>

  {#if seedError}
    <div class="mc-alert">{seedError}</div>
  {/if}

  <div class="mc-main">
    <aside class="mc-side">
      <div class="side-tabs">
        <button class:active={activeTab === 'map'} onclick={() => (activeTab = 'map')}>
          <IconMap2 size={14} /> Map
        </button>
        <button class:active={activeTab === 'finder'} onclick={() => (activeTab = 'finder')}>
          <IconSearch size={14} /> Seed Finder
        </button>
      </div>

      {#if activeTab === 'map'}
        <div class="side-body">
          <div class="dim-tabs">
            {#each DIMENSIONS as d}
              <button class:active={dimension === d} onclick={() => setDimension(d)}>
                {DIM_LABEL[d]}
                <span>{selected[d].filter((id) => isStructureAvailable(edition, mc, id)).length}</span>
              </button>
            {/each}
          </div>

          <div class="side-section">
            <div class="side-section-head">
              <span class="side-label">Structures</span>
              <div class="mini-actions">
                <button onclick={() => selectAll(true)}>All</button>
                <button onclick={() => selectAll(false)}>None</button>
              </div>
            </div>

            <div class="struct-search">
              <IconSearch size={13} />
              <input bind:value={structureSearch} placeholder="Filter structures…" aria-label="Filter structures" />
              {#if structureSearch}
                <button onclick={() => (structureSearch = '')} title="Clear"><IconX size={12} /></button>
              {/if}
            </div>

            <div class="struct-list">
              {#if sidebarStructures.length === 0}
                <div class="side-empty">Nothing matches “{structureSearch}”.</div>
              {:else}
                {#each sidebarStructures as id (id)}
                  {@const info = STRUCTURES[id]}
                  {@const on = selected[dimension].includes(id)}
                  <button class="struct-row" class:on onclick={() => toggleStructure(id)}>
                    <span class="struct-check">{#if on}<IconCheck size={10} />{/if}</span>
                    <span class="struct-color" style={`background:${info.color}`}></span>
                    <span class="struct-name">{info.label}</span>
                    {#if structureCounts[id]}
                      <span class="struct-count">{structureCounts[id].toLocaleString()}</span>
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          </div>

          <div class="side-section">
            <span class="side-label">Layers</span>
            <div class="layer-row">
              <span>Map grid &amp; coordinates</span>
              <button class="switch" class:on={showGrid} onclick={() => (showGrid = !showGrid)} aria-label="Toggle grid" aria-checked={showGrid}></button>
            </div>
            <div class="layer-row">
              <span>Marker labels</span>
              <button class="switch" class:on={showLabels} onclick={() => (showLabels = !showLabels)} aria-label="Toggle labels" aria-checked={showLabels}></button>
            </div>
            {#if edition === 'java' && dimension === 'overworld'}
              <div class="layer-row">
                <span>Slime chunks <em>1.21 formula</em></span>
                <button class="switch" class:on={showSlime} onclick={() => (showSlime = !showSlime)} aria-label="Toggle slime chunks" aria-checked={showSlime}></button>
              </div>
            {/if}
          </div>

          <div class="side-section results-section">
            <div class="side-section-head">
              <span class="side-label">Nearest to view</span>
              <span class="side-count">{resultRows.length}{resultRows.length === 160 ? '+' : ''}</span>
            </div>
            {#if mapBusy && !mapSpots.length}
              <div class="side-empty"><span class="side-spinner"></span> Scanning area…</div>
            {:else if resultRows.length === 0}
              <div class="side-empty">No candidates here. Pan the map or enable more structures.</div>
            {:else}
              <div class="result-list">
                {#each resultRows as row (row.spot.id + ':' + row.spot.x + ':' + row.spot.z + ':' + (row.spot.index ?? 0))}
                  {@const s = row.spot}
                  {@const info = STRUCTURES[s.id]}
                  <div class="result-row">
                    <span class="result-dot" style={`background:${info.color}`}></span>
                    <button class="result-main" onclick={() => focusSpot(s)} title="Show on map">
                      <span class="result-name">{info.label}{s.index ? ` #${s.index}` : ''}</span>
                      <span class="result-coords">{s.x}, {s.z}</span>
                    </button>
                    <span class="result-dist">{Math.round(row.d).toLocaleString()}m</span>
                    <button
                      class="result-icon"
                      onclick={() => copyCoords(s)}
                      title="Copy coordinates"
                    >
                      {#if copiedKey === `${s.id}:${s.x}:${s.z}`}<IconCheck size={12} />{:else}<IconCopy size={12} />{/if}
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <p class="side-note">
            <IconBulb size={12} />
            <span>Positions are placement candidates — biome and terrain checks aren't simulated, so a marker may not generate in-game.</span>
          </p>
        </div>
      {:else}
        <div class="side-body finder-body">
          <div class="finder-intro">
            <h3>Multi-structure seed finder</h3>
            <p>Scan random seeds and keep the ones that satisfy every condition. All positions are measured from 0, 0.</p>
          </div>

          <div class="side-section">
            <div class="side-section-head">
              <span class="side-label">Conditions</span>
              <button class="mini-add" onclick={addCondition}><IconPlus size={12} /> Add</button>
            </div>

            <div class="finder-mode">
              <button class:active={finderMode === 'all'} onclick={() => (finderMode = 'all')}>Match all</button>
              <button class:active={finderMode === 'any'} onclick={() => (finderMode = 'any')}>Match any</button>
            </div>

            <div class="cond-list">
              {#each conditions as cond, i}
                <div class="cond-row">
                  <select bind:value={cond.id} aria-label="Structure condition">
                    {#each DIMENSIONS as d}
                      <optgroup label={DIM_LABEL[d]}>
                        {#each allAvailable.filter((id) => STRUCTURES[id].dim === d) as id}
                          <option value={id}>{STRUCTURES[id].label}</option>
                        {/each}
                      </optgroup>
                    {/each}
                  </select>
                  <label class="cond-radius">
                    <span>within</span>
                    <input type="number" min="32" max="4096" step="32" bind:value={cond.radius} />
                  </label>
                  <button class="cond-del" onclick={() => removeCondition(i)} title="Remove condition" disabled={conditions.length === 1}>
                    <IconX size={12} />
                  </button>
                </div>
              {/each}
            </div>

            <div class="finder-inputs">
              <label>
                <span>Max seeds</span>
                <input type="number" min="1000" max="2000000" step="1000" bind:value={finderMaxSeeds} />
              </label>
              <label>
                <span>Results</span>
                <input type="number" min="1" max="50" bind:value={finderLimit} />
              </label>
            </div>
          </div>

          <button class="finder-run" class:stop={finderRunning} onclick={runFinder}>
            {#if finderRunning}
              <IconPlayerStop size={15} /> Stop scanning
            {:else}
              <IconSearch size={15} /> Find seeds
            {/if}
          </button>

          {#if finderError}
            <div class="finder-error">{finderError}</div>
          {/if}

          {#if finderRunning || finderTried > 0}
            <div class="finder-progress">
              <div class="finder-progress-bar"><span style={`width:${finderProgress}%`}></span></div>
              <div class="finder-progress-meta">
                <span>{finderTried.toLocaleString()} seeds</span>
                <span>{finderRate > 0 ? `${finderRate.toLocaleString()}/s` : finderDone ? 'done' : '…'}</span>
              </div>
            </div>
          {/if}

          {#if finderResults.length}
            <div class="side-section">
              <div class="side-section-head">
                <span class="side-label">Matches</span>
                <span class="side-count">{finderResults.length}</span>
              </div>
              <div class="finder-results">
                {#each finderResults as result, i}
                  <div class="finder-result">
                    <div class="fr-head">
                      <span class="fr-rank">#{i + 1}</span>
                      <span class="fr-seed">{result.seed.toString()}</span>
                      <button class="fr-open" onclick={() => openFinderResult(result)}>
                        <IconFocusCentered size={12} /> Open
                      </button>
                    </div>
                    <div class="fr-hits">
                      {#each result.hits as hit}
                        <span class="fr-hit">
                          <i style={`background:${STRUCTURES[hit.id].color}`}></i>
                          {hit.label}
                          <code>{hit.x}, {hit.z}</code>
                          <em>{Math.round(hit.distance)}m</em>
                        </span>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {:else if finderDone && !finderError}
            <div class="side-empty">Search finished. No matches found.</div>
          {/if}

          <p class="side-note">
            <IconBulb size={12} />
            <span>The scan uses exact placement RNG, but not biome validation. Common structures near spawn are found on almost every seed — raise difficulty with rare structures, small radii, or Match all.</span>
          </p>
        </div>
      {/if}

      <div class="side-foot">
        <span class:live={!mapBusy} class:busy={mapBusy}></span>
        {#if mapBusy}Scanning{:else if mapSpots.length}{mapSpots.length.toLocaleString()} candidates loaded{:else}Ready{/if}
        <span class="foot-sep"></span>
        {selectedCount} selected
      </div>
    </aside>

    <div class="mc-map-pane">
      <McMap
        bind:this={mapRef}
        {seed}
        {edition}
        {mc}
        {dimension}
        structures={dimensionStructures}
        {showSlime}
        {showGrid}
        {showLabels}
        onspots={(spots) => (mapSpots = spots)}
        onview={(v) => (view = v)}
        onstatus={(busy) => (mapBusy = busy)}
      />
    </div>
  </div>
</div>

<style>
  .mc-tool {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: calc(100vh - 148px);
    min-height: 620px;
    font-family: 'Geist', ui-sans-serif, sans-serif;
  }

  .mc-top {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 13px;
    padding: 9px 11px;
    flex-shrink: 0;
  }
  .mc-back {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 32px;
    padding: 0 9px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-3);
    color: var(--text-2);
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .mc-back:hover { color: var(--text-1); border-color: var(--border-hover); }
  .mc-brand { display: flex; align-items: center; gap: 9px; min-width: 170px; }
  .mc-brand-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9bdc8f;
    background: linear-gradient(145deg, rgba(126, 201, 111, 0.2), rgba(126, 201, 111, 0.04));
    border: 1px solid rgba(126, 201, 111, 0.22);
  }
  .mc-brand-text { display: flex; flex-direction: column; gap: 1px; }
  .mc-brand-text strong { font-size: 12.5px; color: var(--text-1); font-weight: 600; letter-spacing: -0.1px; }
  .mc-brand-text span { font-size: 9.5px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.07em; }

  .mc-seed-box {
    display: flex;
    align-items: center;
    gap: 3px;
    flex: 1 1 260px;
    min-width: 220px;
    height: 36px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 0 4px 0 9px;
    transition: border-color 0.15s;
  }
  .mc-seed-box:focus-within { border-color: rgba(126, 201, 111, 0.55); }
  .seed-tag { font-size: 8.5px; color: var(--text-3); letter-spacing: 0.12em; font-weight: 600; }
  .seed-input {
    flex: 1;
    min-width: 40px;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-1);
    font-family: 'Geist Mono', ui-monospace, monospace;
    font-size: 12px;
    padding: 0 5px;
  }
  .seed-input::placeholder { color: var(--text-3); font-family: 'Geist', sans-serif; font-size: 11px; }
  .seed-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 27px;
    height: 27px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--text-3);
    cursor: pointer;
  }
  .seed-icon:hover { color: #9bdc8f; background: rgba(126, 201, 111, 0.1); }
  .seed-go {
    height: 27px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid rgba(126, 201, 111, 0.35);
    background: rgba(126, 201, 111, 0.14);
    color: #cfe6d4;
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }
  .seed-go:hover { background: rgba(126, 201, 111, 0.26); }

  .mc-seg { display: flex; padding: 2px; border-radius: 9px; background: var(--bg-3); border: 1px solid var(--border); height: 36px; }
  .mc-seg button {
    border: none;
    background: transparent;
    color: var(--text-3);
    font-family: inherit;
    font-size: 11px;
    padding: 0 11px;
    border-radius: 7px;
    cursor: pointer;
  }
  .mc-seg button.active { background: rgba(126, 201, 111, 0.16); color: var(--text-1); box-shadow: inset 0 0 0 1px rgba(126, 201, 111, 0.22); }

  .mc-version { position: relative; height: 36px; }
  .mc-version select {
    appearance: none;
    height: 36px;
    min-width: 128px;
    padding: 0 28px 0 10px;
    border-radius: 9px;
    border: 1px solid var(--border);
    background: var(--bg-3);
    color: var(--text-2);
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    outline: none;
  }
  .mc-version select:focus { border-color: rgba(126, 201, 111, 0.5); }
  .mc-version svg { position: absolute; right: 9px; top: 11px; color: var(--text-3); pointer-events: none; }

  .mc-alert {
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.25);
    color: var(--red);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 11.5px;
    flex-shrink: 0;
  }

  .mc-main { display: flex; gap: 10px; flex: 1; min-height: 0; }

  .mc-side {
    width: 334px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 13px;
    overflow: hidden;
    min-height: 0;
  }
  .side-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 5px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .side-tabs button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 31px;
    border: none;
    background: transparent;
    color: var(--text-3);
    border-radius: 7px;
    font-family: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }
  .side-tabs button:hover { color: var(--text-2); background: var(--hover); }
  .side-tabs button.active { background: var(--bg-3); color: var(--text-1); box-shadow: inset 0 0 0 1px var(--border); }

  .side-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; }
  .side-body::-webkit-scrollbar { width: 5px; }
  .side-body::-webkit-scrollbar-thumb { background: var(--border-hover); border-radius: 99px; }

  .dim-tabs { display: flex; gap: 3px; background: var(--bg-3); border: 1px solid var(--border); padding: 3px; border-radius: 9px; margin-bottom: 14px; }
  .dim-tabs button {
    flex: 1;
    height: 29px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-3);
    font-family: inherit;
    font-size: 10.5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    white-space: nowrap;
  }
  .dim-tabs button span { font-size: 9px; font-family: 'Geist Mono', monospace; color: var(--text-3); background: var(--bg-2); padding: 1px 4px; border-radius: 99px; }
  .dim-tabs button.active { background: var(--bg-2); color: var(--text-1); box-shadow: inset 0 0 0 1px var(--border); }
  .dim-tabs button.active span { color: #9bdc8f; }

  .side-section { margin-bottom: 16px; }
  .side-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }
  .side-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-3); font-weight: 600; }
  .side-count { font-size: 9.5px; color: var(--text-3); font-family: 'Geist Mono', monospace; }
  .mini-actions { display: flex; gap: 3px; }
  .mini-actions button, .mini-add {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border: none;
    background: none;
    color: var(--text-3);
    font-family: inherit;
    font-size: 9.5px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
  }
  .mini-actions button:hover, .mini-add:hover { color: var(--text-1); background: var(--hover); }

  .struct-search {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 0 7px;
    height: 29px;
    margin-bottom: 6px;
    color: var(--text-3);
  }
  .struct-search:focus-within { border-color: var(--border-hover); }
  .struct-search input { flex: 1; min-width: 0; border: none; background: none; outline: none; color: var(--text-1); font-family: inherit; font-size: 10.5px; }
  .struct-search input::placeholder { color: var(--text-3); }
  .struct-search button { border: none; background: none; color: var(--text-3); cursor: pointer; padding: 0; display: flex; }
  .struct-search button:hover { color: var(--text-1); }

  .struct-list { display: flex; flex-direction: column; gap: 1px; max-height: 235px; overflow-y: auto; padding-right: 2px; }
  .struct-list::-webkit-scrollbar { width: 4px; }
  .struct-list::-webkit-scrollbar-thumb { background: var(--border-hover); border-radius: 99px; }
  .struct-row {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 6px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--text-3);
    font-family: inherit;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
    flex-shrink: 0;
  }
  .struct-row:hover { background: var(--hover); color: var(--text-2); }
  .struct-row.on { color: var(--text-1); }
  .struct-check {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    border: 1px solid var(--border-hover);
    background: var(--bg-3);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #0b110e;
    flex-shrink: 0;
  }
  .struct-row.on .struct-check { background: #7ec96f; border-color: #7ec96f; }
  .struct-color { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; opacity: 0.55; }
  .struct-row.on .struct-color { opacity: 1; box-shadow: 0 0 6px currentColor; }
  .struct-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .struct-count { font-family: 'Geist Mono', monospace; font-size: 9px; color: var(--text-3); background: var(--bg-3); padding: 1px 4px; border-radius: 99px; }

  .side-empty { font-size: 10.5px; color: var(--text-3); line-height: 1.5; padding: 3px 1px; }
  .side-spinner { display: inline-block; width: 8px; height: 8px; border: 1.5px solid rgba(126, 201, 111, 0.2); border-top-color: #7ec96f; border-radius: 50%; animation: spin 0.7s linear infinite; margin-right: 5px; vertical-align: -1px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .layer-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; font-size: 10.5px; color: var(--text-2); }
  .layer-row em { font-style: normal; color: var(--text-3); font-size: 9px; margin-left: 3px; }
  .switch {
    position: relative;
    width: 29px;
    height: 16px;
    border-radius: 99px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    cursor: pointer;
    flex-shrink: 0;
    padding: 0;
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-3);
    transition: left 0.15s, background 0.15s;
  }
  .switch.on { background: rgba(126, 201, 111, 0.16); border-color: rgba(126, 201, 111, 0.45); }
  .switch.on::after { left: 15px; background: #7ec96f; }

  .results-section { margin-top: 2px; }
  .result-list { display: flex; flex-direction: column; max-height: 225px; overflow-y: auto; border-top: 1px solid var(--border); }
  .result-list::-webkit-scrollbar { width: 4px; }
  .result-list::-webkit-scrollbar-thumb { background: var(--border-hover); border-radius: 99px; }
  .result-row { display: flex; align-items: center; gap: 6px; padding: 4px 2px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .result-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .result-main { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; border: none; background: none; color: inherit; font-family: inherit; text-align: left; cursor: pointer; padding: 0; }
  .result-main:hover .result-name { color: #9bdc8f; }
  .result-name { font-size: 10.5px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .result-coords { font-family: 'Geist Mono', monospace; font-size: 9px; color: var(--text-3); white-space: nowrap; }
  .result-dist { font-family: 'Geist Mono', monospace; font-size: 9px; color: var(--text-3); flex-shrink: 0; }
  .result-icon { border: none; background: none; color: var(--text-3); cursor: pointer; display: flex; padding: 2px; border-radius: 4px; flex-shrink: 0; }
  .result-icon:hover { color: var(--text-1); background: var(--hover); }

  .side-note { display: flex; gap: 6px; align-items: flex-start; font-size: 9.5px; line-height: 1.5; color: var(--text-3); margin: 4px 0 0; padding-top: 10px; border-top: 1px solid var(--border); }
  .side-note svg { flex-shrink: 0; margin-top: 1px; color: #c9a84a; }

  .side-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-top: 1px solid var(--border);
    font-size: 9px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    flex-shrink: 0;
  }
  .side-foot span:first-child { width: 5px; height: 5px; border-radius: 50%; background: var(--text-3); }
  .side-foot span.live { background: #7ec96f; box-shadow: 0 0 6px rgba(126,201,111,.6); }
  .side-foot span.busy { background: #c9a84a; animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .foot-sep { width: 1px; height: 8px; background: var(--border); margin: 0 2px; }

  .mc-map-pane { flex: 1; min-width: 0; min-height: 0; border-radius: 13px; border: 1px solid var(--border); overflow: hidden; background: #0b110e; }
  .mc-map-pane :global(.map-wrap) { height: 100%; border-radius: 0; }

  /* seed finder */
  .finder-body { display: flex; flex-direction: column; }
  .finder-intro { margin-bottom: 13px; }
  .finder-intro h3 { margin: 0 0 4px; font-size: 13px; color: var(--text-1); letter-spacing: -0.1px; }
  .finder-intro p { margin: 0; font-size: 10.5px; line-height: 1.5; color: var(--text-3); }
  .finder-mode { display: flex; gap: 3px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 7px; padding: 2px; margin-bottom: 8px; }
  .finder-mode button { flex: 1; border: none; background: none; color: var(--text-3); font-family: inherit; font-size: 10px; height: 24px; border-radius: 5px; cursor: pointer; }
  .finder-mode button.active { background: var(--bg-2); color: var(--text-1); box-shadow: inset 0 0 0 1px var(--border); }
  .cond-list { display: flex; flex-direction: column; gap: 5px; }
  .cond-row { display: flex; align-items: center; gap: 4px; }
  .cond-row > select {
    flex: 1;
    min-width: 0;
    height: 28px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-3);
    color: var(--text-2);
    font-family: inherit;
    font-size: 10px;
    padding: 0 4px;
    outline: none;
  }
  .cond-radius { display: flex; align-items: center; gap: 3px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 6px; height: 28px; padding: 0 5px; }
  .cond-radius span { font-size: 8.5px; color: var(--text-3); }
  .cond-radius input { width: 44px; border: none; background: none; outline: none; color: var(--text-1); font-family: 'Geist Mono', monospace; font-size: 9.5px; }
  .cond-del { border: none; background: none; color: var(--text-3); cursor: pointer; display: flex; padding: 4px; border-radius: 4px; }
  .cond-del:hover:not(:disabled) { color: var(--red); background: var(--hover); }
  .cond-del:disabled { opacity: 0.25; cursor: default; }
  .finder-inputs { display: flex; gap: 8px; margin-top: 9px; }
  .finder-inputs label { flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .finder-inputs label span { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); }
  .finder-inputs input { height: 28px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-3); color: var(--text-1); font-family: 'Geist Mono', monospace; font-size: 10px; padding: 0 7px; outline: none; }
  .finder-inputs input:focus { border-color: var(--border-hover); }

  .finder-run {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid rgba(126, 201, 111, 0.4);
    background: rgba(126, 201, 111, 0.16);
    color: #d8efdc;
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    margin-bottom: 10px;
  }
  .finder-run:hover { background: rgba(126, 201, 111, 0.26); }
  .finder-run.stop { border-color: rgba(248, 113, 113, 0.4); background: rgba(248, 113, 113, 0.1); color: #f3b6b6; }
  .finder-error { font-size: 10px; line-height: 1.5; color: var(--red); background: rgba(248, 113, 113, 0.06); border: 1px solid rgba(248, 113, 113, 0.18); border-radius: 6px; padding: 7px 8px; margin-bottom: 10px; }
  .finder-progress { margin-bottom: 12px; }
  .finder-progress-bar { height: 4px; border-radius: 99px; background: var(--bg-3); overflow: hidden; }
  .finder-progress-bar span { display: block; height: 100%; background: linear-gradient(90deg, #4e9d5b, #7ec96f); transition: width 0.2s; }
  .finder-progress-meta { display: flex; justify-content: space-between; font-size: 9px; color: var(--text-3); font-family: 'Geist Mono', monospace; margin-top: 4px; }
  .finder-results { display: flex; flex-direction: column; gap: 6px; }
  .finder-result { background: var(--bg-3); border: 1px solid var(--border); border-radius: 8px; padding: 7px 8px; }
  .fr-head { display: flex; align-items: center; gap: 6px; }
  .fr-rank { font-size: 8.5px; color: var(--text-3); font-family: 'Geist Mono', monospace; }
  .fr-seed { flex: 1; min-width: 0; font-family: 'Geist Mono', monospace; font-size: 10.5px; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; }
  .fr-open { display: inline-flex; align-items: center; gap: 3px; border: 1px solid rgba(126, 201, 111, 0.3); background: rgba(126, 201, 111, 0.1); color: #cfe6d4; border-radius: 5px; font-family: inherit; font-size: 9px; padding: 3px 6px; cursor: pointer; }
  .fr-open:hover { background: rgba(126, 201, 111, 0.22); }
  .fr-hits { display: flex; flex-direction: column; gap: 2px; margin-top: 5px; }
  .fr-hit { display: flex; align-items: center; gap: 4px; font-size: 9.5px; color: var(--text-3); }
  .fr-hit i { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
  .fr-hit code { font-family: 'Geist Mono', monospace; font-size: 8.5px; color: var(--text-3); margin-left: auto; }
  .fr-hit em { font-style: normal; font-family: 'Geist Mono', monospace; font-size: 8.5px; color: var(--text-3); min-width: 34px; text-align: right; }

  @media (max-width: 1180px) {
    .mc-brand-text span { display: none; }
    .mc-side { width: 306px; }
  }
  @media (max-width: 980px) {
    .mc-tool { height: auto; min-height: 0; }
    .mc-main { flex-direction: column; }
    .mc-side { width: 100%; max-height: 460px; order: 2; }
    .mc-map-pane { order: 1; height: 64vh; min-height: 430px; }
    .mc-brand { min-width: 0; }
  }
  @media (max-width: 700px) {
    .mc-brand { display: none; }
    .mc-back span { display: none; }
    .mc-seed-box { order: 5; flex-basis: 100%; }
    .mc-version { flex: 1; }
    .mc-version select { width: 100%; min-width: 0; }
    .mc-side { max-height: 540px; }
    .mc-map-pane { height: 58vh; min-height: 380px; }
  }
</style>
