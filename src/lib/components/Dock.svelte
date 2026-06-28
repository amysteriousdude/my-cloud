<script lang="ts">
  import {
    IconFiles, IconSparkles, IconPencil, IconChartBar, IconNote,
    IconLock, IconTerminal, IconBook, IconLanguage, IconApi,
    IconSun, IconMoon, IconDeviceDesktop, IconLogout, IconCloud,
    IconDots, IconX, IconSettings,
    IconDatabase,
  } from '@tabler/icons-svelte';
  import { env } from '$env/dynamic/public';
  const NAME = env.PUBLIC_NAME ?? "Omar";

  type Tab = 'files' | 'generators' | 'downloader' | 'draw' | 'stats' | 'editor' | 'vault' | 'notes' | 'console' | 'dictionary' | 'translator' | 'apitester' | 'database';

  let {
    user,
    theme,
    fileCount = 0,
    folderCount = 0,
    storageBytes = 0,
    activeTab = 'files',
    autoHide = false,
    dockHovered = $bindable(false),
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
    autoHide?: boolean;
    dockHovered?: boolean;
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
    { id: 'database',  icon: IconDatabase,    label: 'Databases' },
  ];

  // ── State ──────────────────────────────────────────────────────
  let position = $state<'bottom'|'top'|'left'|'right'>('bottom');
  let showMore = $state(false);
  let showUser = $state(false);
  let repositioning = $state(false);
  let dragIdx = $state<number>(-1);
  let dragOverIdx = $state<number>(-1);

  let mainTabIds = $state<Tab[]>(['files', 'generators', 'translator', 'draw']);
  let mainTabs = $derived(ALL_TABS.filter(t => mainTabIds.includes(t.id)));

  // ── Hover tooltip state ────────────────────────────────────────
  let hoverTabId = $state<string | null>(null);
  let hoverX = $state(0);
  let hoverY = $state(0);
  let hoverSide = $state<'top'|'bottom'|'left'|'right'>('top');

  function onItemHover(tabId: string, e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTabId = tabId;
    hoverX = rect.left + rect.width / 2;
    if (position === 'bottom') { hoverY = rect.top - 10; hoverSide = 'top'; }
    else if (position === 'top') { hoverY = rect.bottom + 10; hoverSide = 'bottom'; }
    else if (position === 'left') { hoverX = rect.right + 10; hoverY = rect.top + rect.height / 2; hoverSide = 'right'; }
    else { hoverX = rect.left - 10; hoverY = rect.top + rect.height / 2; hoverSide = 'left'; }
  }

  function onItemLeave() { hoverTabId = null; }

  // ── Long-press tooltip (mobile) ──────────────────────────────
  let longPressTooltipTab = $state<string | null>(null);
  let tooltipLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTouching = $state(false);

  function onItemTouchStart(tabId: string, e: TouchEvent) {
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    longPressTouching = true;
    tooltipLongPressTimer = setTimeout(() => {
      longPressTooltipTab = tabId;
      hoverX = rect.left + rect.width / 2;
      if (position === 'bottom') { hoverY = rect.top - 10; hoverSide = 'top'; }
      else if (position === 'top') { hoverY = rect.bottom + 10; hoverSide = 'bottom'; }
      else if (position === 'left') { hoverX = rect.right + 10; hoverY = rect.top + rect.height / 2; hoverSide = 'right'; }
      else { hoverX = rect.left - 10; hoverY = rect.top + rect.height / 2; hoverSide = 'left'; }
    }, 450);
  }

  function onItemTouchEnd() {
    longPressTouching = false;
    if (tooltipLongPressTimer) { clearTimeout(tooltipLongPressTimer); tooltipLongPressTimer = null; }
    longPressTooltipTab = null;
  }

  function onItemTouchMove() {
    longPressTouching = false;
    if (tooltipLongPressTimer) { clearTimeout(tooltipLongPressTimer); tooltipLongPressTimer = null; }
  }

  // ── Load / Save ────────────────────────────────────────────────
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

  // ── Drag reorder ───────────────────────────────────────────────
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

  // ── Reposition dock ────────────────────────────────────────────
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

  function getTabLabel(tabId: string): string {
    return ALL_TABS.find(t => t.id === tabId)?.label ?? tabId;
  }

  $effect(() => { loadState(); });

  function handleOutsideClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.dock-more-overlay') && !target.closest('.dock-more-btn')) showMore = false;
    if (!target.closest('.dock-user-panel') && !target.closest('.dock-avatar-item')) showUser = false;
  }

  function handleOutsideTouch(e: TouchEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.dock-item') && !target.closest('.dock-avatar-item')) {
      longPressTooltipTab = null;
    }
  }
</script>

<svelte:window
  onclick={handleOutsideClick}
  ontouchstart={handleOutsideTouch}
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

<!-- ── Floating pill tooltip above hovered item ────────────────── -->
{#if hoverTabId || longPressTooltipTab}
  {@const tipId = longPressTooltipTab ?? hoverTabId}
  {@const side = hoverSide}
  <div
    class="dock-pill-tip"
    class:tip-top={side === 'top'}
    class:tip-bottom={side === 'bottom'}
    class:tip-left={side === 'left'}
    class:tip-right={side === 'right'}
    class:touch-visible={longPressTooltipTab !== null}
    style="left:{hoverX}px; top:{hoverY}px;"
  >
    {getTabLabel(tipId!)}
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
          <div class="dock-more-card" class:active class:is-main={isMain}
            onclick={() => { ontabchange(tab.id); showMore = false; }} role="button" tabindex="0">
            <div class="dock-more-icon"><tab.icon size={22} stroke={1.5}/></div>
            <span class="dock-more-label">{tab.label}</span>
            {#if isMain}
              <button class="dock-more-remove" onclick={(e) => { e.stopPropagation(); removeTabFromMain(tab.id); }} title="Remove from dock">✕</button>
            {:else}
              <button class="dock-more-add" onclick={(e) => { e.stopPropagation(); addTabToMain(tab.id); }} title="Add to dock">+</button>
            {/if}
          </div>
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

<!-- ── Auto-hide hover zone (bottom edge) ────────────────────── -->
{#if autoHide}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dock-hover-zone"
    onmouseenter={() => { dockHovered = true; }}
    onmouseleave={() => { dockHovered = false; }}
  ></div>
{/if}

<!-- ── Main dock bar ───────────────────────────────────────────── -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="dock pos-{position}"
  class:repositioning
  class:auto-hide={autoHide}
  class:hide-dock={autoHide && !dockHovered}
  onmousedown={startDockDrag}
  ontouchstart={startDockDrag}
  onmouseup={cancelDockDrag}
  ontouchend={cancelDockDrag}
  onmousemove={cancelDockDrag}
  onmouseenter={() => { if (autoHide) dockHovered = true; }}
  onmouseleave={() => { if (autoHide) dockHovered = false; }}
>
  <!-- Brand -->
  <div class="dock-brand">
    <IconCloud size={16} stroke={1.5}/>
  </div>

  <div class="dock-sep"></div>

  <!-- Tab items: icon + stacked label -->
  <nav class="dock-tabs">
    {#each mainTabs as tab, i (tab.id)}
      {@const active = activeTab === tab.id}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="dock-item"
        class:active
        class:drag-over={dragOverIdx === i}
        draggable="true"
        ondragstart={(e) => onDragStart(e, i)}
        ondragover={(e) => onDragOver(e, i)}
        ondragend={onDragEnd}
        onclick={() => ontabchange(tab.id)}
        onmouseenter={(e) => onItemHover(tab.id, e)}
        onmouseleave={onItemLeave}
        ontouchstart={(e) => onItemTouchStart(tab.id, e)}
        ontouchend={onItemTouchEnd}
        ontouchmove={onItemTouchMove}
        ontouchcancel={onItemTouchEnd}
        role="button"
        tabindex="-1"
      >
        <div class="dock-item-icon">
          <tab.icon size={20} stroke={active ? 2.2 : 1.5}/>
        </div>
        <span class="dock-item-label">{tab.label}</span>
      </div>
    {/each}
  </nav>

  <div class="dock-sep"></div>

  <!-- More button -->
  <button
    class="dock-item dock-more-btn"
    onclick={() => { showMore = !showMore; showUser = false; }}
    onmouseenter={(e) => onItemHover('more', e)}
    onmouseleave={onItemLeave}
    ontouchstart={(e) => onItemTouchStart('more', e)}
    ontouchend={onItemTouchEnd}
    ontouchmove={onItemTouchMove}
    ontouchcancel={onItemTouchEnd}
  >
    <div class="dock-item-icon">
      <IconDots size={20} stroke={showMore ? 2.2 : 1.5}/>
    </div>
    <span class="dock-item-label">More</span>
  </button>

  <div class="dock-sep"></div>

  <!-- User avatar in dock -->
  {#if user}
    <div
      class="dock-item dock-avatar-item"
      onclick={(e) => { e.stopPropagation(); showUser = !showUser; showMore = false; }}
      onmouseenter={(e) => onItemHover('user', e)}
      onmouseleave={onItemLeave}
      role="button"
      tabindex="-1"
    >
      <div class="dock-avatar-circle">{user.username[0].toUpperCase()}</div>
    </div>
  {/if}

</div>

<style>
  /* ── Floating pill tooltip ────────────────────────────────────── */
  .dock-pill-tip {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
    background: color-mix(in srgb, var(--bg-2) 80%, transparent);
    backdrop-filter: blur(16px) saturate(1.4);
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    color: var(--text-1);
    font-size: 12px;
    font-weight: 600;
    font-family: 'Geist', sans-serif;
    padding: 5px 14px;
    border-radius: 999px;
    white-space: nowrap;
    box-shadow: 0 6px 20px rgba(0,0,0,.25);
    transform: translate(-50%, -100%);
    animation: pillIn .12s ease-out;
  }
  .dock-pill-tip.tip-bottom { transform: translate(-50%, 0); }
  .dock-pill-tip.tip-left { transform: translate(0, -50%); }
  .dock-pill-tip.tip-right { transform: translate(-100%, -50%); }

  @keyframes pillIn {
    from { opacity: 0; transform: translate(-50%, -100%) scale(.9); }
    to { opacity: 1; transform: translate(-50%, -100%) scale(1); }
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
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .dock-more-card {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 16px 10px; border-radius: 12px;
    border: 1px solid var(--border); background: var(--bg-3);
    cursor: pointer; transition: .15s; position: relative;
    font-family: 'Geist', sans-serif;
  }
  .dock-more-card:hover { border-color: var(--border-hover); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.2); }
  .dock-more-card.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--bg-3)); }
  .dock-more-card.is-main { border-color: color-mix(in srgb, var(--green) 60%, var(--border)); }
  .dock-more-icon { color: var(--text-2); }
  .dock-more-card.active .dock-more-icon { color: var(--accent); }
  .dock-more-label { font-size: 12px; font-weight: 500; color: var(--text-2); }
  .dock-more-card.active .dock-more-label { color: var(--accent); }
  .dock-more-add, .dock-more-remove {
    position: absolute; top: 6px; right: 6px;
    width: 20px; height: 20px; border-radius: 50%;
    border: none; font-size: 12px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: .1s;
  }
  .dock-more-add { background: var(--green); color: #fff; }
  .dock-more-add:hover { opacity: .8; }
  .dock-more-remove { background: var(--red); color: #fff; }
  .dock-more-remove:hover { opacity: .8; }
  .dock-more-hint {
    margin-top: 14px; text-align: center;
    font-size: 11px; color: var(--text-3);
  }

  /* ── User panel ────────────────────────────────────────────────── */
  .dock-user-panel {
    position: fixed; z-index: 600;
    top: 60px; right: 16px;
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 14px; width: 240px;
    box-shadow: 0 12px 40px rgba(0,0,0,.35);
    padding: 12px;
    animation: panelIn .15s ease-out;
  }
  .dock-user-panel.pos-top { top: 60px; }
  .dock-user-panel.pos-left { right: auto; left: 16px; top: 60px; }
  .dock-user-panel.pos-right { right: 16px; top: 60px; }

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

  /* ── Dock bar — glassmorphic pill ──────────────────────────────── */
  .dock {
    position: fixed; z-index: 200;
    display: flex; align-items: center; gap: 0;
    background: var(--bg-2);
    border: 1px solid var(--border);
    box-shadow:
      0 8px 32px rgba(0,0,0,.3),
      inset 0 1px 0 color-mix(in srgb, var(--bg-1) 30%, transparent);
    transition: all .3s cubic-bezier(.16,1,.3,1);
    user-select: none;
    padding: 6px 8px;
  }
  .dock.repositioning { opacity: .7; cursor: grabbing; }

  /* Position variants */
  .dock.pos-bottom {
    bottom: 16px; left: 50%; transform: translateX(-50%);
    border-radius: 999px;
  }
  .dock.pos-top {
    top: 16px; left: 50%; transform: translateX(-50%);
    border-radius: 999px;
  }
  .dock.pos-left {
    left: 16px; top: 50%; transform: translateY(-50%);
    border-radius: 999px; flex-direction: column;
  }
  .dock.pos-right {
    right: 16px; top: 50%; transform: translateY(-50%);
    border-radius: 999px; flex-direction: column;
  }

  /* Brand */
  .dock-brand {
    display: flex; align-items: center; justify-content: center;
    color: var(--accent); flex-shrink: 0;
    width: 32px; height: 40px;
  }

  /* Separator */
  .dock-sep {
    width: 1px; height: 24px;
    background: color-mix(in srgb, var(--border) 50%, transparent);
    margin: 0 4px;
    flex-shrink: 0;
  }
  .dock.pos-left .dock-sep, .dock.pos-right .dock-sep {
    width: 24px; height: 1px; margin: 4px 0;
  }

  /* Tabs container */
  .dock-tabs {
    display: flex; align-items: center; gap: 2px;
  }
  .dock.pos-left .dock-tabs, .dock.pos-right .dock-tabs {
    flex-direction: column;
  }

  /* Individual item: icon + label stacked */
  .dock-item {
    display: flex; align-items: center; justify-content: center;
    padding: 6px 10px; border-radius: 12px;
    color: var(--text-2); cursor: pointer;
    transition: all .15s cubic-bezier(.16,1,.3,1);
    position: relative;
    min-width: 40px;
  }

  .dock-item:hover {
    background: color-mix(in srgb, var(--text-1) 8%, transparent);
    color: var(--text-1);
    transform: translateY(-2px);
  }

  .dock-item.active {
    background: color-mix(in srgb, var(--text-1) 12%, transparent);
    color: var(--text-1);
  }

  .dock-item.drag-over {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .dock-item-icon {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px;
  }

  .dock-item-label {
    display: none;
  }

  .dock-more-btn {
    color: var(--text-2);
    background: none;
    border: none;
    font-family: inherit;
  }
  .dock-more-btn:hover { color: var(--text-1); background: color-mix(in srgb, var(--text-1) 8%, transparent); }
  .dock-more-btn.active {
    background: color-mix(in srgb, var(--text-1) 12%, transparent);
    color: var(--text-1);
  }

  /* User avatar in dock */
  .dock-avatar-item { padding: 4px 6px; }
  .dock-avatar-circle {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--accent); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; cursor: pointer;
    transition: all .15s cubic-bezier(.16,1,.3,1);
  }
  .dock-avatar-item:hover .dock-avatar-circle { box-shadow: 0 2px 8px rgba(99,102,241,.5); transform: scale(1.1); }

  /* ── Auto-hide hover zone ────────────────────────────────────── */
  .dock-hover-zone {
    position: fixed;
    bottom: 0; left: 50%;
    transform: translateX(-50%);
    width: 300px; height: 24px;
    z-index: 250;
  }

  /* ── Auto-hide dock ──────────────────────────────────────────── */
  .dock.auto-hide {
    transition: transform 0.35s cubic-bezier(.16,1,.3,1), opacity 0.3s ease;
  }
  .dock.auto-hide.hide-dock {
    pointer-events: none;
  }
  .dock-auto-hide.hide-dock.pos-bottom {
    transform: translateX(-50%) translateY(calc(100% + 32px));
    opacity: 0;
  }
  .dock.auto-hide.hide-dock.pos-top {
    transform: translateX(-50%) translateY(calc(-100% - 24px));
    opacity: 0;
  }
  .dock.auto-hide.hide-dock.pos-left {
    transform: translateY(-50%) translateX(calc(-100% - 24px));
    opacity: 0;
  }
  .dock.auto-hide.hide-dock.pos-right {
    transform: translateY(-50%) translateX(calc(100% + 24px));
    opacity: 0;
  }

  /* Mobile */
  @media (max-width: 600px) {
    .dock.pos-bottom { bottom: 12px; padding: 4px 6px; }
    .dock-more-panel { width: 95vw; }
    .dock-more-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .dock-more-card { padding: 12px 8px; }
    .dock-item { min-width: 36px; padding: 3px 6px 2px; }
    .dock-item-label { font-size: 9px; }
    .dock-pill-tip { opacity: 0; pointer-events: none; transition: opacity .15s; }
    .dock-pill-tip.touch-visible { opacity: 1; }
  }
</style>
