<script lang="ts">
  import {
    IconFiles, IconSparkles, IconPencil, IconChartBar, IconNote,
    IconLock, IconTerminal, IconBook, IconLanguage, IconApi,
    IconSun, IconMoon, IconDeviceDesktop, IconLogout, IconCloud,
    IconDots, IconX, IconGripVertical, IconSettings,
  } from '@tabler/icons-svelte';
  import { env } from '$env/dynamic/public';
  const NAME = env.PUBLIC_NAME ?? "Omar";

  type Tab = 'files' | 'generators' | 'downloader' | 'draw' | 'stats' | 'editor' | 'vault' | 'notes' | 'console' | 'dictionary' | 'translator' | 'apitester';

  let {
    user,
    theme,
    fileCount = 0,
    folderCount = 0,
    storageBytes = 0,
    activeTab = 'files',
    oncycleTheme,
    onlogout,
    ontabchange,
  }: {
    user: { username: string } | null;
    theme: 'system' | 'light' | 'dark';
    fileCount?: number;
    folderCount?: number;
    storageBytes?: number;
    activeTab?: Tab;
    oncycleTheme: () => void;
    onlogout: () => void;
    ontabchange: (t: Tab) => void;
  } = $props();

  const ALL_TABS: { id: Tab; icon: any; label: string }[] = [
    { id: 'files',      icon: IconFiles,      label: 'Files' },
    { id: 'generators', icon: IconSparkles,    label: 'Generators' },
    { id: 'draw',       icon: IconPencil,      label: 'Draw' },
    { id: 'stats',      icon: IconChartBar,    label: 'Stats' },
    { id: 'notes',      icon: IconNote,        label: 'Notes' },
    { id: 'vault',      icon: IconLock,        label: 'Vault' },
    { id: 'console',    icon: IconTerminal,    label: 'Console' },
    { id: 'dictionary', icon: IconBook,        label: 'Dictionary' },
    { id: 'translator', icon: IconLanguage,    label: 'Translator' },
    { id: 'apitester',  icon: IconApi,         label: 'API Tester' },
  ];

  const ICON_MAP: Record<string, any> = {
    files: IconFiles, generators: IconSparkles, draw: IconPencil,
    stats: IconChartBar, notes: IconNote, vault: IconLock,
    console: IconTerminal, dictionary: IconBook, translator: IconLanguage,
    apitester: IconApi,
  };

  // ── State ──────────────────────────────────────────────────────
  let position = $state<'bottom'|'top'|'left'|'right'>('bottom');
  let expanded = $state(false);
  let showMore = $state(false);
  let showUser = $state(false);
  let repositioning = $state(false);
  let dragIdx = $state<number>(-1);
  let dragOverIdx = $state<number>(-1);

  // Main tabs: customizable, default [files, generators, translator, editor]
  let mainTabIds = $state<Tab[]>(['files', 'generators', 'translator', 'draw']);
  let mainTabs = $derived(ALL_TABS.filter(t => mainTabIds.includes(t.id)));
  let moreTabs = $derived(ALL_TABS.filter(t => !mainTabIds.includes(t.id)));

  // Load from localStorage
  function loadState() {
    try {
      const pos = localStorage.getItem('dock-position');
      if (pos === 'top' || pos === 'left' || pos === 'right' || pos === 'bottom') position = pos;
      const saved = localStorage.getItem('dock-main-tabs');
      if (saved) mainTabIds = JSON.parse(saved);
    } catch {}
  }

  function savePosition(p: typeof position) {
    position = p;
    localStorage.setItem('dock-position', p);
  }

  function saveMainTabs() {
    localStorage.setItem('dock-main-tabs', JSON.stringify(mainTabIds));
  }

  // ── Tooltip ────────────────────────────────────────────────────
  let tooltipText = $state('');
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let showTooltip = $state(false);

  function showTabTooltip(label: string, e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tooltipText = label;
    if (position === 'bottom') { tooltipX = rect.left + rect.width / 2; tooltipY = rect.top - 8; }
    else if (position === 'top') { tooltipX = rect.left + rect.width / 2; tooltipY = rect.bottom + 8; }
    else if (position === 'left') { tooltipX = rect.right + 8; tooltipY = rect.top + rect.height / 2; }
    else { tooltipX = rect.left - 8; tooltipY = rect.top + rect.height / 2; }
    showTooltip = true;
  }

  function hideTooltip() { showTooltip = false; }

  // ── Drag reorder (main tabs) ───────────────────────────────────
  function onDragStart(e: DragEvent, idx: number) {
    dragIdx = idx;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    dragOverIdx = idx;
  }

  function onDragEnd() {
    if (dragIdx >= 0 && dragOverIdx >= 0 && dragIdx !== dragOverIdx) {
      const newIds = [...mainTabIds];
      const [moved] = newIds.splice(dragIdx, 1);
      newIds.splice(dragOverIdx, 0, moved);
      mainTabIds = newIds;
      saveMainTabs();
    }
    dragIdx = -1;
    dragOverIdx = -1;
  }

  function addTabToMain(tabId: Tab) {
    if (!mainTabIds.includes(tabId) && mainTabIds.length < 7) {
      mainTabIds = [...mainTabIds, tabId];
      saveMainTabs();
    }
  }

  function removeTabFromMain(tabId: Tab) {
    if (mainTabIds.length > 2) {
      mainTabIds = mainTabIds.filter(id => id !== tabId);
      saveMainTabs();
    }
  }

  // ── Reposition (drag dock to edges) ────────────────────────────
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let isDraggingDock = $state(false);
  let dockDragX = $state(0);
  let dockDragY = $state(0);

  function startDockDrag(e: MouseEvent | TouchEvent) {
    longPressTimer = setTimeout(() => {
      repositioning = true;
      isDraggingDock = true;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      dockDragX = clientX;
      dockDragY = clientY;
    }, 500);
  }

  function cancelDockDrag() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  function onDockDragMove(e: MouseEvent | TouchEvent) {
    if (!isDraggingDock) return;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    dockDragX = clientX;
    dockDragY = clientY;
  }

  function onDockDragEnd() {
    if (isDraggingDock) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const threshold = 100;
      if (dockDragY > vh - threshold) savePosition('bottom');
      else if (dockDragY < threshold) savePosition('top');
      else if (dockDragX < threshold) savePosition('left');
      else if (dockDragX > vw - threshold) savePosition('right');
    }
    isDraggingDock = false;
    repositioning = false;
    cancelDockDrag();
  }

  // ── Helpers ────────────────────────────────────────────────────
  function fmtBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
  }

  function switchToSidebar() {
    localStorage.setItem('dock-mode', 'sidebar');
    window.location.reload();
  }

  $effect(() => { loadState(); });

  // Close overlays on outside click
  function handleOutsideClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.dock-more-overlay') && !target.closest('.dock-more-btn')) showMore = false;
    if (!target.closest('.dock-user-panel') && !target.closest('.dock-avatar')) showUser = false;
  }
</script>

<svelte:window
  onclick={handleOutsideClick}
  onmousemove={onDockDragMove}
  onmouseup={onDockDragEnd}
  ontouchmove={onDockDragMove}
  ontouchend={onDockDragEnd}
/>

<!-- ── Reposition overlay ─────────────────────────────────────── -->
{#if repositioning}
  <div class="dock-repos-overlay">
    <div class="dock-repos-zone" class:active={dockDragY > window.innerHeight - 100} style="bottom:0;left:0;right:0;height:100px">Bottom</div>
    <div class="dock-repos-zone" class:active={dockDragY < 100} style="top:0;left:0;right:0;height:100px">Top</div>
    <div class="dock-repos-zone" class:active={dockDragX < 100} style="top:0;bottom:0;left:0;width:100px">Left</div>
    <div class="dock-repos-zone" class:active={dockDragX > window.innerWidth - 100} style="top:0;bottom:0;right:0;width:100px">Right</div>
    <div class="dock-repos-hint">Drop on an edge to move dock</div>
  </div>
{/if}

<!-- ── Tooltip ─────────────────────────────────────────────────── -->
{#if showTooltip}
  <div class="dock-tooltip"
    style="position:fixed; left:{tooltipX}px; top:{tooltipY}px; transform:translate(-50%,-100%);">
    {tooltipText}
  </div>
{/if}

<!-- ── More overlay ────────────────────────────────────────────── -->
{#if showMore}
  <div class="dock-more-overlay">
    <div class="dock-more-panel">
      <div class="dock-more-header">
        <span>All Tabs</span>
        <button class="dock-more-close" onclick={() => showMore = false}><IconX size={16}/></button>
      </div>
      <div class="dock-more-grid">
        {#each ALL_TABS as tab}
          {@const isMain = mainTabIds.includes(tab.id)}
          {@const active = activeTab === tab.id}
          <button class="dock-more-card" class:active class:is-main={isMain}
            onclick={() => { ontabchange(tab.id); showMore = false; }}>
            <div class="dock-more-icon"><tab.icon size={22} stroke={1.5}/></div>
            <span class="dock-more-label">{tab.label}</span>
            {#if isMain}
              <button class="dock-more-remove" onclick={(e) => { e.stopPropagation(); removeTabFromMain(tab.id); }} title="Remove from dock">✕</button>
            {:else}
              <button class="dock-more-add" onclick={(e) => { e.stopPropagation(); addTabToMain(tab.id); }} title="Add to dock">+</button>
            {/if}
          </button>
        {/each}
      </div>
      <div class="dock-more-hint">Drag icons in the dock to reorder · Click + to add to dock</div>
    </div>
  </div>
{/if}

<!-- ── User panel ──────────────────────────────────────────────── -->
{#if showUser && user}
  <div class="dock-user-panel" class:pos-top={position === 'top'} class:pos-left={position === 'left'} class:pos-right={position === 'right'}>
    <div class="dock-user-header">
      <div class="dock-user-avatar-lg">{user.username[0].toUpperCase()}</div>
      <div class="dock-user-info">
        <span class="dock-user-name">{user.username}</span>
        <span class="dock-user-stats">{fmtBytes(storageBytes)} · {fileCount} files · {folderCount} folders</span>
      </div>
    </div>
    <div class="dock-user-divider"></div>
    <button class="dock-user-action" onclick={oncycleTheme}>
      {#if theme === 'system'}<IconDeviceDesktop size={15}/>
      {:else if theme === 'light'}<IconSun size={15}/>
      {:else}<IconMoon size={15}/>{/if}
      <span>{theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}</span>
    </button>
    <button class="dock-user-action" onclick={switchToSidebar}>
      <IconSettings size={15}/>
      <span>Classic Sidebar</span>
    </button>
    <button class="dock-user-action dock-user-danger" onclick={onlogout}>
      <IconLogout size={15}/>
      <span>Sign out</span>
    </button>
  </div>
{/if}

<!-- ── Main dock bar ───────────────────────────────────────────── -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="dock pos-{position}"
  class:expanded={expanded || showMore || showUser}
  class:repositioning
  onmouseenter={() => { if (!repositioning) expanded = true; }}
  onmouseleave={() => { if (!repositioning) { expanded = false; showTooltip = false; } }}
  onmousedown={startDockDrag}
  ontouchstart={startDockDrag}
  onmouseup={cancelDockDrag}
  ontouchend={cancelDockDrag}
  onmousemove={cancelDockDrag}
>
  <!-- Brand logo -->
  <div class="dock-brand">
    <IconCloud size={18} stroke={1.5}/>
    {#if expanded}<span class="dock-brand-text">{NAME}</span>{/if}
  </div>

  <!-- Main tab icons -->
  <nav class="dock-tabs">
    {#each mainTabs as tab, i (tab.id)}
      {@const active = activeTab === tab.id}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="dock-tab"
        class:active
        class:drag-over={dragOverIdx === i}
        draggable="true"
        ondragstart={(e) => onDragStart(e, i)}
        ondragover={(e) => onDragOver(e, i)}
        ondragend={onDragEnd}
        onclick={() => ontabchange(tab.id)}
        onmouseenter={(e) => showTabTooltip(tab.label, e)}
        onmouseleave={hideTooltip}
        role="button"
        tabindex="-1"
      >
        <tab.icon size={20} stroke={active ? 2.2 : 1.5}/>
        {#if expanded}<span class="dock-tab-label">{tab.label}</span>{/if}
        {#if active}<div class="dock-tab-dot"></div>{/if}
      </div>
    {/each}

    <!-- More button -->
    <button class="dock-tab dock-more-btn" onclick={() => { showMore = !showMore; showUser = false; }}
      onmouseenter={(e) => showTabTooltip('More', e)} onmouseleave={hideTooltip}>
      <IconDots size={20} stroke={1.5}/>
      {#if expanded}<span class="dock-tab-label">More</span>{/if}
    </button>
  </nav>

  <!-- User avatar -->
  {#if user}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="dock-avatar"
      onclick={(e) => { e.stopPropagation(); showUser = !showUser; showMore = false; }}
      onmouseenter={(e) => showTabTooltip(user!.username, e)}
      onmouseleave={hideTooltip}
      role="button"
      tabindex="-1"
    >
      {user.username[0].toUpperCase()}
    </div>
  {/if}
</div>

<style>
  /* ── Tooltip ───────────────────────────────────────────────────── */
  .dock-tooltip {
    z-index: 1000;
    background: var(--bg-2);
    border: 1px solid var(--border);
    color: var(--text-1);
    font-size: 11px;
    font-weight: 600;
    font-family: 'Geist', sans-serif;
    padding: 4px 10px;
    border-radius: 6px;
    pointer-events: none;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0,0,0,.3);
  }

  /* ── Reposition overlay ────────────────────────────────────────── */
  .dock-repos-overlay { position: fixed; inset: 0; z-index: 999; }
  .dock-repos-zone {
    position: absolute;
    display: flex; align-items: center; justify-content: center;
    background: rgba(99,102,241,.05);
    border: 2px dashed transparent;
    color: transparent;
    font-size: 13px; font-weight: 700;
    transition: .15s;
  }
  .dock-repos-zone.active {
    background: rgba(99,102,241,.15);
    border-color: var(--accent);
    color: var(--accent);
  }
  .dock-repos-hint {
    position: absolute; bottom: 50%; left: 50%;
    transform: translate(-50%, 50%);
    background: var(--bg-2); border: 1px solid var(--border);
    color: var(--text-2); padding: 8px 16px; border-radius: 8px;
    font-size: 12px; pointer-events: none;
  }

  /* ── More overlay ──────────────────────────────────────────────── */
  .dock-more-overlay {
    position: fixed; inset: 0; z-index: 500;
    background: rgba(0,0,0,.4);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
  }
  .dock-more-panel {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 16px;
    width: 420px; max-width: 95vw;
    max-height: 80vh; overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,.4);
    padding: 16px;
  }
  .dock-more-header {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 14px; font-weight: 700; color: var(--text-1);
    margin-bottom: 12px;
  }
  .dock-more-close { background: none; border: none; color: var(--text-3); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; }
  .dock-more-close:hover { color: var(--text-1); background: var(--hover); }

  .dock-more-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
  }
  .dock-more-card {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 12px 8px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--bg-3);
    cursor: pointer; transition: .13s; position: relative;
    font-family: 'Geist', sans-serif;
  }
  .dock-more-card:hover { border-color: var(--border-hover); transform: translateY(-1px); }
  .dock-more-card.active { border-color: var(--accent); background: var(--accent-soft); }
  .dock-more-card.is-main { border-color: var(--green); }
  .dock-more-icon { color: var(--text-2); }
  .dock-more-card.active .dock-more-icon { color: var(--accent); }
  .dock-more-label { font-size: 11px; font-weight: 500; color: var(--text-2); }
  .dock-more-card.active .dock-more-label { color: var(--accent); }
  .dock-more-add, .dock-more-remove {
    position: absolute; top: 4px; right: 4px;
    width: 18px; height: 18px; border-radius: 50%;
    border: none; font-size: 12px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: .1s;
  }
  .dock-more-add { background: var(--green); color: #fff; }
  .dock-more-add:hover { opacity: .8; }
  .dock-more-remove { background: var(--red); color: #fff; }
  .dock-more-remove:hover { opacity: .8; }
  .dock-more-hint {
    margin-top: 12px; text-align: center;
    font-size: 10px; color: var(--text-3);
  }

  /* ── User panel ────────────────────────────────────────────────── */
  .dock-user-panel {
    position: fixed; z-index: 600;
    bottom: 80px; right: 16px;
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 14px; width: 240px;
    box-shadow: 0 12px 40px rgba(0,0,0,.35);
    padding: 12px;
    animation: panelIn .15s ease-out;
  }
  .dock-user-panel.pos-top { bottom: auto; top: 80px; }
  .dock-user-panel.pos-left { right: auto; left: 80px; bottom: 16px; }
  .dock-user-panel.pos-right { right: 80px; bottom: 16px; }

  @keyframes panelIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  .dock-user-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .dock-user-avatar-lg {
    width: 36px; height: 36px; border-radius: 10px;
    background: var(--accent); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 700; flex-shrink: 0;
  }
  .dock-user-info { display: flex; flex-direction: column; }
  .dock-user-name { font-size: 13px; font-weight: 700; color: var(--text-1); }
  .dock-user-stats { font-size: 10px; color: var(--text-3); font-family: 'Geist Mono', monospace; }
  .dock-user-divider { border-top: 1px solid var(--border); margin: 8px 0; }
  .dock-user-action {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 8px 10px; border-radius: 8px; border: none;
    background: none; color: var(--text-2); font-size: 12px;
    font-family: 'Geist', sans-serif; cursor: pointer; transition: .1s;
  }
  .dock-user-action:hover { background: var(--hover); color: var(--text-1); }
  .dock-user-danger:hover { background: rgba(220,38,38,.1); color: #f87171; }

  /* ── Dock bar ──────────────────────────────────────────────────── */
  .dock {
    position: fixed; z-index: 200;
    display: flex; align-items: center; gap: 4px;
    background: color-mix(in srgb, var(--bg-2) 85%, transparent);
    backdrop-filter: blur(20px) saturate(1.4);
    border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgba(0,0,0,.25);
    transition: all .25s cubic-bezier(.16,1,.3,1);
    user-select: none;
  }
  .dock.repositioning { opacity: .7; cursor: grabbing; }

  /* Position variants */
  .dock.pos-bottom {
    bottom: 12px; left: 50%; transform: translateX(-50%);
    border-radius: 16px; padding: 6px 10px; flex-direction: row;
  }
  .dock.pos-top {
    top: 12px; left: 50%; transform: translateX(-50%);
    border-radius: 16px; padding: 6px 10px; flex-direction: row;
  }
  .dock.pos-left {
    left: 12px; top: 50%; transform: translateY(-50%);
    border-radius: 16px; padding: 10px 6px; flex-direction: column;
  }
  .dock.pos-right {
    right: 12px; top: 50%; transform: translateY(-50%);
    border-radius: 16px; padding: 10px 6px; flex-direction: column;
  }

  /* Brand */
  .dock-brand {
    display: flex; align-items: center; justify-content: center;
    color: var(--accent); flex-shrink: 0;
    min-width: 32px; min-height: 32px;
  }
  .dock.pos-bottom .dock-brand, .dock.pos-top .dock-brand { gap: 8px; }
  .dock.pos-left .dock-brand, .dock.pos-right .dock-brand { gap: 8px; }
  .dock-brand-text { font-size: 13px; font-weight: 700; white-space: nowrap; }

  /* Tabs */
  .dock-tabs {
    display: flex; align-items: center; gap: 2px;
  }
  .dock.pos-left .dock-tabs, .dock.pos-right .dock-tabs {
    flex-direction: column;
  }
  .dock-tab {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 8px; border-radius: 10px;
    color: var(--text-2); cursor: pointer;
    transition: .13s; position: relative;
    min-width: 32px; min-height: 32px; justify-content: center;
  }
  .dock-tab:hover { background: var(--hover); color: var(--text-1); }
  .dock-tab.active { background: var(--hover); color: var(--text-1); }
  .dock-tab.drag-over { border-top: 2px solid var(--accent); }
  .dock-tab-label { font-size: 12px; font-weight: 500; white-space: nowrap; }
  .dock-tab-dot {
    position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);
    width: 4px; height: 4px; border-radius: 50%; background: var(--accent);
  }

  /* Avatar */
  .dock-avatar {
    width: 32px; height: 32px; border-radius: 10px;
    background: var(--accent); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; cursor: pointer;
    transition: .13s; flex-shrink: 0;
  }
  .dock-avatar:hover { opacity: .85; transform: scale(1.05); }

  /* Expanded state */
  .dock.expanded { gap: 2px; }

  /* Mobile */
  @media (max-width: 600px) {
    .dock.pos-bottom { bottom: 8px; padding: 5px 8px; }
    .dock-tooltip { display: none; }
    .dock-more-panel { width: 95vw; }
    .dock-more-grid { grid-template-columns: repeat(3, 1fr); }
  }
</style>
