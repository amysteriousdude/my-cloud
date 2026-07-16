<script lang="ts">
  import {
    IconFiles, IconSparkles, IconPencil, IconChartBar, IconNote,
    IconLock, IconTerminal, IconBook, IconLanguage, IconApi,
    IconSun, IconMoon, IconDeviceDesktop, IconLogout, IconCloud,
    IconDots, IconX, IconSettings,
    IconDatabase, IconBrain, IconHistory, IconPlus, IconTrash, IconPlayerStop, IconAdjustments,
  } from '@tabler/icons-svelte';
  import { env } from '$env/dynamic/public';
  const NAME = env.PUBLIC_NAME ?? "Omar";

  type Tab = 'files' | 'generators' | 'downloader' | 'draw' | 'stats' | 'editor' | 'vault' | 'notes' | 'console' | 'dictionary' | 'translator' | 'apitester' | 'database' | 'ai';

  type BarButton = {
    icon: any;
    label: string;
    onClick: () => void;
    primary?: boolean;
    danger?: boolean;
    disabled?: boolean;
  };

  type BarSelect = {
    value: string;
    options: { value: string; label: string }[];
    onchange: (v: string) => void;
    label?: string;
    variant?: 'model' | 'default';
    accent?: string;
  };

  type BarPill = {
    icon?: any;
    label: string;
    color?: string;
    active?: boolean;
    onClick?: () => void;
  };

  type BarConfig = {
    input?: {
      placeholder: string;
      value: string;
      oninput: (v: string) => void;
      onsubmit: () => void;
      shortcutHint?: string;
      loading?: boolean;
    };
    buttons?: BarButton[];
    selects?: BarSelect[];
    beforeInput?: BarPill[];
    aiChat?: {
      providers?: { id: string; label: string; color: string; icon?: any; active?: boolean; onClick?: () => void }[];
      chatActions?: BarButton[];
      systemPrompt?: string;
      onSystemPromptInput?: (v: string) => void;
    };
  } | null;

  let {
    user,
    theme,
    fileCount = 0,
    folderCount = 0,
    storageBytes = 0,
    activeTab = 'files',
    autoHide = false,
    dockHovered = $bindable(false),
    config = null,
    fullWidth = false,
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
    config?: BarConfig;
    fullWidth?: boolean;
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
    { id: 'ai',        icon: IconBrain,       label: 'AI' },
  ];

  // ── State ──────────────────────────────────────────────────────
  let position = $state<'bottom'|'top'|'left'|'right'>('bottom');
  let showMore = $state(false);
  let showUser = $state(false);
  let repositioning = $state(false);
  let dragIdx = $state<number>(-1);
  let dragOverIdx = $state<number>(-1);
  let moreDragIdx = $state<number>(-1);
  let moreDragOverIdx = $state<number>(-1);
  let navExpanded = $state(false);
  let navHoverTimeout: ReturnType<typeof setTimeout> | null = null;

  let mainTabIds = $state<Tab[]>(['files', 'generators', 'translator', 'draw']);
  let mainTabs = $derived(ALL_TABS.filter(t => mainTabIds.includes(t.id)));

  let hasInput = $derived(!!config?.input);
  let hasButtons = $derived(!!config?.buttons && config!.buttons!.length > 0);
  let hasSelects = $derived(!!config?.selects && config!.selects!.length > 0);
  let hasBeforeInput = $derived(!!config?.beforeInput && config!.beforeInput!.length > 0);
  let hasCustomUtility = $derived(hasInput || hasSelects || hasBeforeInput || !!config?.aiChat);
  let hasAiChat = $derived(!!config?.aiChat);
  let hasProviders = $derived(!!config?.aiChat?.providers && config!.aiChat!.providers!.length > 0);
  let hasChatActions = $derived(!!config?.aiChat?.chatActions && config!.aiChat!.chatActions!.length > 0);
  let showSystemPrompt = $derived(!!config?.aiChat?.systemPrompt || config?.aiChat?.systemPrompt === '' || !!config?.aiChat?.onSystemPromptInput);

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

  // ── Nav expand on cloud hover ────────────────────────────────
  let bbEl: HTMLDivElement | null = null;

  function onBarNavEnter() {
    if (navHoverTimeout) { clearTimeout(navHoverTimeout); navHoverTimeout = null; }
    navExpanded = true;
  }

  function onBarNavLeave(e: MouseEvent) {
    if (fullWidth) return;
    // Only collapse if cursor truly left the .bb region (not moving between children)
    const related = e.relatedTarget as HTMLElement | null;
    if (related && bbEl?.contains(related)) return;
    // Also check if something inside still has focus
    const active = document.activeElement as HTMLElement | null;
    if (active && bbEl?.contains(active)) return;
    navHoverTimeout = setTimeout(() => { navExpanded = false; }, 300);
  }

  // ── Long-press tooltip (mobile) ──────────────────────────────
  let longPressTooltipTab = $state<string | null>(null);
  let tooltipLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTouching = $state(false);

  function onItemTouchStart(tabId: string, e: TouchEvent) {
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

  function onMoreDragStart(e: DragEvent, idx: number) {
    moreDragIdx = idx;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onMoreDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    moreDragOverIdx = idx;
  }

  function onMoreDragEnd() {
    if (moreDragIdx >= 0 && moreDragOverIdx >= 0 && moreDragIdx !== moreDragOverIdx) {
      const newIds = [...mainTabIds];
      const [moved] = newIds.splice(moreDragIdx, 1);
      newIds.splice(moreDragOverIdx, 0, moved);
      mainTabIds = newIds;
      saveMainTabs();
    }
    moreDragIdx = -1;
    moreDragOverIdx = -1;
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

  function handleInputKeydown(e: KeyboardEvent) {
    if (!config?.input) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      config.input!.onsubmit();
    }
  }

  $effect(() => { loadState(); });

  $effect(() => {
    if (!hasCustomUtility || fullWidth) {
      navExpanded = true;
    }
  });

  function handleOutsideClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.bb-more-overlay') && !target.closest('.bb-more-btn')) showMore = false;
    if (!target.closest('.bb-user-panel') && !target.closest('.bb-avatar-item')) showUser = false;
  }

  function handleOutsideTouch(e: TouchEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.bb-item') && !target.closest('.bb-avatar-item')) {
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
  <div class="bb-repos-overlay">
    <div class="bb-repos-zone" class:active={dockDragY > window.innerHeight - 100} style="bottom:0;left:0;right:0;height:100px">Bottom</div>
    <div class="bb-repos-zone" class:active={dockDragY < 100} style="top:0;left:0;right:0;height:100px">Top</div>
    <div class="bb-repos-zone" class:active={dockDragX < 100} style="top:0;bottom:0;left:0;width:100px">Left</div>
    <div class="bb-repos-zone" class:active={dockDragX > window.innerWidth - 100} style="top:0;bottom:0;right:0;width:100px">Right</div>
    <div class="bb-repos-hint">Drop on an edge to move dock</div>
  </div>
{/if}

<!-- ── Floating pill tooltip above hovered item ────────────────── -->
{#if hoverTabId || longPressTooltipTab}
  {@const tipId = longPressTooltipTab ?? hoverTabId}
  {@const side = hoverSide}
  <div
    class="bb-pill-tip"
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
  <div class="bb-more-overlay">
    <div class="bb-more-panel">
      <div class="bb-more-header">
        <span>All Tabs</span>
        <button class="bb-more-close" onclick={() => showMore = false}><IconX size={16}/></button>
      </div>
      <div class="bb-more-grid">
        {#each mainTabIds as tabId, i (tabId)}
          {@const tab = ALL_TABS.find(t => t.id === tabId)}
          {@const active = activeTab === tabId}
          {#if tab}
            <div class="bb-more-card" class:active class:is-main={true}
              class:drag-over={moreDragOverIdx === i}
              draggable="true"
              ondragstart={(e) => onMoreDragStart(e, i)}
              ondragover={(e) => onMoreDragOver(e, i)}
              ondragend={onMoreDragEnd}
              onclick={() => { ontabchange(tab.id); showMore = false; }} role="button" tabindex="0">
              <div class="bb-more-icon"><tab.icon size={22} stroke={1.5}/></div>
              <span class="bb-more-label">{tab.label}</span>
              <button class="bb-more-remove" onclick={(e) => { e.stopPropagation(); removeTabFromMain(tab.id); }} title="Remove from dock">✕</button>
            </div>
          {/if}
        {/each}
        {#each ALL_TABS.filter(t => !mainTabIds.includes(t.id)) as tab (tab.id)}
          <div class="bb-more-card"
            onclick={() => { ontabchange(tab.id); showMore = false; }} role="button" tabindex="0">
            <div class="bb-more-icon"><tab.icon size={22} stroke={1.5}/></div>
            <span class="bb-more-label">{tab.label}</span>
            <button class="bb-more-add" onclick={(e) => { e.stopPropagation(); addTabToMain(tab.id); }} title="Add to dock">+</button>
          </div>
        {/each}
      </div>
      <div class="bb-more-hint">Drag tabs to reorder · Click + to add to dock</div>
    </div>
  </div>
{/if}

<!-- ── User panel ──────────────────────────────────────────────── -->
{#if showUser && user}
  <div class="bb-user-panel" class:pos-top={position === 'top'} class:pos-left={position === 'left'} class:pos-right={position === 'right'}>
    <div class="bb-user-header">
      <div class="bb-user-avatar-lg">{user.username[0].toUpperCase()}</div>
      <div class="bb-user-info">
        <span class="bb-user-name">{user.username}</span>
        <span class="bb-user-stats">{fmtBytes(storageBytes)} · {fileCount} files · {folderCount} folders</span>
      </div>
    </div>
    <div class="bb-user-divider"></div>
    <button class="bb-user-action" onclick={oncycleTheme}>
      {#if theme === 'system'}<IconDeviceDesktop size={15}/>
      {:else if theme === 'light'}<IconSun size={15}/>
      {:else}<IconMoon size={15}/>{/if}
      <span>{theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}</span>
    </button>
    <button class="bb-user-action" onclick={switchToSidebar}>
      <IconSettings size={15}/>
      <span>Classic Sidebar</span>
    </button>
    <button class="bb-user-action bb-user-danger" onclick={onlogout}>
      <IconLogout size={15}/>
      <span>Sign out</span>
    </button>
  </div>
{/if}

<!-- ── Auto-hide hover zone (bottom edge) ────────────────────── -->
{#if autoHide}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bb-hover-zone"
    onmouseenter={() => { dockHovered = true; }}
    onmouseleave={() => { dockHovered = false; }}
  ></div>
{/if}

<!-- ── Main bottom bar ─────────────────────────────────────────── -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={bbEl}
  class="bb pos-{position}"
  class:repositioning
  class:auto-hide={autoHide}
  class:hide-dock={autoHide && !dockHovered}
  class:full-width={fullWidth}
  onmousedown={startDockDrag}
  ontouchstart={startDockDrag}
  onmouseup={cancelDockDrag}
  ontouchend={cancelDockDrag}
  onmousemove={cancelDockDrag}
  onmouseenter={() => { if (autoHide) dockHovered = true; onBarNavEnter(); }}
  onmouseleave={(e) => { if (autoHide) dockHovered = false; onBarNavLeave(e); }}
>
  <!-- Nav section: cloud icon + expandable tabs -->
  <div class="bb-nav-section">
    <!-- Brand / cloud icon (always visible) -->
    <div class="bb-brand">
      <IconCloud size={16} stroke={1.5}/>
    </div>

    <!-- Expandable nav tabs -->
    <div class="bb-nav-tabs" class:expanded={navExpanded || fullWidth}>
      <div class="bb-sep"></div>
      {#each mainTabs as tab, i (tab.id)}
        {@const active = activeTab === tab.id}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="bb-item"
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
          <div class="bb-item-icon">
            <tab.icon size={20} stroke={active ? 2.2 : 1.5}/>
          </div>
          <span class="bb-item-label">{tab.label}</span>
        </div>
      {/each}

      <!-- More button -->
      <button
        class="bb-item bb-more-btn"
        onclick={() => { showMore = !showMore; showUser = false; }}
        onmouseenter={(e) => onItemHover('more', e)}
        onmouseleave={onItemLeave}
        ontouchstart={(e) => onItemTouchStart('more', e)}
        ontouchend={onItemTouchEnd}
        ontouchmove={onItemTouchMove}
        ontouchcancel={onItemTouchEnd}
      >
        <div class="bb-item-icon">
          <IconDots size={20} stroke={showMore ? 2.2 : 1.5}/>
        </div>
        <span class="bb-item-label">More</span>
      </button>
    </div>
  </div>

  <div class="bb-sep"></div>

  <!-- AI Provider pills -->
  {#if hasProviders}
    <div class="bb-ai-providers">
      {#each config!.aiChat!.providers! as pill}
        <button
          class="bb-ai-pill"
          class:active={pill.active}
          style={pill.color ? `--pill-color: ${pill.color}` : ''}
          onclick={pill.onClick}
        >
          {#if pill.icon}
            <pill.icon size={14} stroke={1.5}/>
          {/if}
          <span>{pill.label}</span>
        </button>
      {/each}
    </div>
    <div class="bb-sep"></div>
  {/if}

  <!-- AI Chat actions (history, new chat, clear, etc.) -->
  {#if hasChatActions}
    <div class="bb-ai-actions">
      {#each config!.aiChat!.chatActions! as action}
        <button
          class="bb-action-btn"
          class:danger={action.danger}
          disabled={action.disabled}
          onclick={action.onClick}
          title={action.label}
        >
          <action.icon size={16} stroke={1.5}/>
        </button>
      {/each}
    </div>
    <div class="bb-sep"></div>
  {/if}

  <!-- Selects (model selector, etc.) -->
  {#if hasSelects}
    <div class="bb-selects-section">
      {#each config!.selects! as sel}
        {#if sel.variant === 'model'}
          <div class="bb-model-picker" style={sel.accent ? `--model-accent:${sel.accent}` : ''}>
            <span class="bb-model-dot"></span>
            <span class="bb-model-label">{sel.label}</span>
            <select class="bb-model-select" value={sel.value} onchange={(e) => sel.onchange((e.target as HTMLSelectElement).value)}>
              {#each sel.options as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        {:else}
          <div class="bb-select-wrap">
            {#if sel.label}<span class="bb-select-label">{sel.label}</span>{/if}
            <select class="bb-select" value={sel.value} onchange={(e) => sel.onchange((e.target as HTMLSelectElement).value)}>
              {#each sel.options as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        {/if}
      {/each}
    </div>
    <div class="bb-sep"></div>
  {/if}

  <!-- AI System prompt (inline) -->
  {#if hasAiChat && config!.aiChat?.onSystemPromptInput}
    <div class="bb-system-prompt-wrap">
      <input
        class="bb-system-prompt-input"
        type="text"
        placeholder="System prompt..."
        value={config!.aiChat!.systemPrompt ?? ''}
        oninput={(e) => config!.aiChat!.onSystemPromptInput!((e.target as HTMLInputElement).value)}
      />
    </div>
    <div class="bb-sep"></div>
  {/if}

  <!-- Center: input area (optional) -->
  {#if hasInput}
    <div class="bb-input-section">
      <textarea
        class="bb-textarea"
        placeholder={config!.input!.placeholder}
        value={config!.input!.value}
        oninput={(e) => config!.input!.oninput((e.target as HTMLTextAreaElement).value)}
        onkeydown={handleInputKeydown}
        rows={1}
        disabled={config!.input!.loading}
      ></textarea>
    </div>
    <div class="bb-sep"></div>
  {/if}

  <!-- Right: action buttons (optional) -->
  {#if hasButtons}
    <div class="bb-actions-section">
      {#each config!.buttons! as btn}
        <button
          class="bb-action-btn"
          class:primary={btn.primary}
          class:danger={btn.danger}
          disabled={btn.disabled}
          onclick={btn.onClick}
          title={btn.label}
        >
          {#if config!.input?.loading && btn.primary}
            <span class="bb-spinner"></span>
          {:else}
            <btn.icon size={16} stroke={1.5}/>
          {/if}
        </button>
      {/each}
    </div>
    <div class="bb-sep"></div>
  {/if}

  <!-- User avatar -->
  {#if user}
    <div
      class="bb-item bb-avatar-item"
      onclick={(e) => { e.stopPropagation(); showUser = !showUser; showMore = false; }}
      onmouseenter={(e) => onItemHover('user', e)}
      onmouseleave={onItemLeave}
      role="button"
      tabindex="-1"
    >
      <div class="bb-avatar-circle">{user.username[0].toUpperCase()}</div>
    </div>
  {/if}
</div>

<style>
  /* ── Floating pill tooltip ────────────────────────────────────── */
  .bb-pill-tip {
    position: fixed; z-index: 1000; pointer-events: none;
    background: color-mix(in srgb, var(--bg-2) 80%, transparent);
    backdrop-filter: blur(16px) saturate(1.4);
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    color: var(--text-1); font-size: 12px; font-weight: 600;
    font-family: 'Geist', sans-serif;
    padding: 5px 14px; border-radius: 999px; white-space: nowrap;
    box-shadow: 0 6px 20px rgba(0,0,0,.25);
    transform: translate(-50%, -100%);
    animation: pillIn .12s ease-out;
  }
  .bb-pill-tip.tip-bottom { transform: translate(-50%, 0); }
  .bb-pill-tip.tip-left { transform: translate(0, -50%); }
  .bb-pill-tip.tip-right { transform: translate(-100%, -50%); }
  @keyframes pillIn {
    from { opacity: 0; transform: translate(-50%, -100%) scale(.9); }
    to { opacity: 1; transform: translate(-50%, -100%) scale(1); }
  }

  /* ── Reposition overlay ────────────────────────────────────────── */
  .bb-repos-overlay { position: fixed; inset: 0; z-index: 999; }
  .bb-repos-zone {
    position: absolute; display: flex; align-items: center; justify-content: center;
    background: rgba(99,102,241,.05); border: 2px dashed transparent;
    color: transparent; font-size: 13px; font-weight: 700; transition: .15s;
  }
  .bb-repos-zone.active { background: rgba(99,102,241,.15); border-color: var(--accent); color: var(--accent); }
  .bb-repos-hint {
    position: absolute; bottom: 50%; left: 50%; transform: translate(-50%, 50%);
    background: var(--bg-2); border: 1px solid var(--border);
    color: var(--text-2); padding: 8px 16px; border-radius: 8px;
    font-size: 12px; pointer-events: none;
  }

  /* ── More overlay ──────────────────────────────────────────────── */
  .bb-more-overlay {
    position: fixed; inset: 0; z-index: 500;
    background: rgba(0,0,0,.4); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
  }
  .bb-more-panel {
    background: var(--bg-2); border: 1px solid var(--border); border-radius: 16px;
    width: 420px; max-width: 95vw; max-height: 80vh; overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,.4); padding: 16px;
  }
  .bb-more-header { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 700; color: var(--text-1); margin-bottom: 12px; }
  .bb-more-close { background: none; border: none; color: var(--text-3); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; }
  .bb-more-close:hover { color: var(--text-1); background: var(--hover); }
  .bb-more-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .bb-more-card {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 16px 10px; border-radius: 12px;
    border: 1px solid var(--border); background: var(--bg-3);
    cursor: pointer; transition: .15s; position: relative;
    font-family: 'Geist', sans-serif;
  }
  .bb-more-card:hover { border-color: var(--border-hover); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.2); }
  .bb-more-card.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--bg-3)); }
  .bb-more-card.is-main { border-color: color-mix(in srgb, var(--green) 60%, var(--border)); }
  .bb-more-card.drag-over { border-color: var(--accent) !important; background: color-mix(in srgb, var(--accent) 8%, var(--bg-3)); transform: scale(1.03); }
  .bb-more-icon { color: var(--text-2); }
  .bb-more-card.active .bb-more-icon { color: var(--accent); }
  .bb-more-label { font-size: 12px; font-weight: 500; color: var(--text-2); }
  .bb-more-card.active .bb-more-label { color: var(--accent); }
  .bb-more-add, .bb-more-remove {
    position: absolute; top: 6px; right: 6px;
    width: 20px; height: 20px; border-radius: 50%;
    border: none; font-size: 12px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: .1s;
  }
  .bb-more-add { background: var(--green); color: #fff; }
  .bb-more-add:hover { opacity: .8; }
  .bb-more-remove { background: var(--red); color: #fff; }
  .bb-more-remove:hover { opacity: .8; }
  .bb-more-hint { margin-top: 14px; text-align: center; font-size: 11px; color: var(--text-3); }

  /* ── User panel ────────────────────────────────────────────────── */
  .bb-user-panel {
    position: fixed; z-index: 600; top: 60px; right: 16px;
    background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px;
    width: 240px; box-shadow: 0 12px 40px rgba(0,0,0,.35); padding: 12px;
    animation: panelIn .15s ease-out;
  }
  .bb-user-panel.pos-top { top: 60px; }
  .bb-user-panel.pos-left { right: auto; left: 16px; top: 60px; }
  .bb-user-panel.pos-right { right: 16px; top: 60px; }
  @keyframes panelIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .bb-user-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .bb-user-avatar-lg {
    width: 36px; height: 36px; border-radius: 10px;
    background: var(--accent); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 700; flex-shrink: 0;
  }
  .bb-user-info { display: flex; flex-direction: column; }
  .bb-user-name { font-size: 13px; font-weight: 700; color: var(--text-1); }
  .bb-user-stats { font-size: 10px; color: var(--text-3); font-family: 'Geist Mono', monospace; }
  .bb-user-divider { border-top: 1px solid var(--border); margin: 8px 0; }
  .bb-user-action {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 8px 10px; border-radius: 8px; border: none;
    background: none; color: var(--text-2); font-size: 12px;
    font-family: 'Geist', sans-serif; cursor: pointer; transition: .1s;
  }
  .bb-user-action:hover { background: var(--hover); color: var(--text-1); }
  .bb-user-danger:hover { background: rgba(220,38,38,.1); color: #f87171; }

  /* ── Bottom bar — glassmorphic pill ─────────────────────────────── */
  .bb {
    position: fixed; z-index: 200;
    display: flex; align-items: center; gap: 0;
    background: color-mix(in srgb, var(--bg-2) 85%, transparent);
    backdrop-filter: blur(20px) saturate(1.4);
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    box-shadow: 0 8px 32px rgba(0,0,0,.35), inset 0 1px 0 color-mix(in srgb, var(--bg-1) 30%, transparent);
    transition: all .24s cubic-bezier(.16,1,.3,1);
    user-select: none; padding: 6px 8px;
    transform-origin: center bottom;
  }
  .bb:hover {
    box-shadow: 0 12px 44px rgba(0,0,0,.45), inset 0 1px 0 color-mix(in srgb, var(--bg-1) 30%, transparent);
  }
  .bb.repositioning { opacity: .7; cursor: grabbing; }

  /* Position variants */
  .bb.pos-bottom { bottom: 16px; left: 50%; transform: translateX(-50%) scale(.98); border-radius: 999px; }
  .bb.pos-bottom:hover { transform: translateX(-50%) scale(1); }
  .bb.pos-bottom.full-width { left: 16px; right: 16px; transform: none; border-radius: 16px; max-width: none; padding: 6px 12px; }
  .bb.pos-bottom.full-width:hover { transform: none; }
  .bb.pos-top { top: 16px; left: 50%; transform: translateX(-50%) scale(.98); border-radius: 999px; }
  .bb.pos-top:hover { transform: translateX(-50%) scale(1); }
  .bb.pos-top.full-width { left: 16px; right: 16px; transform: none; border-radius: 16px; max-width: none; padding: 6px 12px; }
  .bb.pos-top.full-width:hover { transform: none; }
  .bb.pos-left { left: 16px; top: 50%; transform: translateY(-50%) scale(.98); border-radius: 999px; flex-direction: column; }
  .bb.pos-left:hover { transform: translateY(-50%) scale(1); }
  .bb.pos-right { right: 16px; top: 50%; transform: translateY(-50%) scale(.98); border-radius: 999px; flex-direction: column; }
  .bb.pos-right:hover { transform: translateY(-50%) scale(1); }

  /* ── Nav section (cloud + expandable tabs) ────────────────────── */
  .bb-nav-section { display: flex; align-items: center; }

  .bb-brand {
    display: flex; align-items: center; justify-content: center;
    color: var(--accent); flex-shrink: 0; width: 32px; height: 40px;
    cursor: pointer;
  }

  .bb-nav-tabs {
    display: flex; align-items: center; gap: 2px;
    max-width: 0; overflow: hidden; opacity: 0;
    transition: max-width .28s cubic-bezier(.16,1,.3,1), opacity .2s ease;
  }
  .bb-nav-tabs.expanded { max-width: 500px; opacity: 1; }

  .bb-sep {
    width: 1px; height: 24px;
    background: color-mix(in srgb, var(--border) 50%, transparent);
    margin: 0 4px; flex-shrink: 0;
  }
  .bb.pos-left .bb-sep, .bb.pos-right .bb-sep { width: 24px; height: 1px; margin: 4px 0; }

  /* ── Individual item ────────────────────────────────────────────── */
  .bb-item {
    display: flex; align-items: center; justify-content: center;
    padding: 6px 10px; border-radius: 12px;
    color: var(--text-2); cursor: pointer;
    transition: all .15s cubic-bezier(.16,1,.3,1);
    position: relative; min-width: 40px;
  }
  .bb-item:hover { background: color-mix(in srgb, var(--text-1) 8%, transparent); color: var(--text-1); transform: translateY(-2px); }
  .bb-item.active { background: color-mix(in srgb, var(--text-1) 12%, transparent); color: var(--text-1); }
  .bb-item.drag-over { outline: 2px solid var(--accent); outline-offset: -2px; }
  .bb-item-icon { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; }
  .bb-item-label { display: none; }

  .bb-more-btn { color: var(--text-2); background: none; border: none; font-family: inherit; }
  .bb-more-btn:hover { color: var(--text-1); background: color-mix(in srgb, var(--text-1) 8%, transparent); }

  .bb-avatar-item { padding: 4px 6px; }
  .bb-avatar-circle {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--accent); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; cursor: pointer;
    transition: all .15s cubic-bezier(.16,1,.3,1);
  }
  .bb-avatar-item:hover .bb-avatar-circle { box-shadow: 0 2px 8px rgba(99,102,241,.5); transform: scale(1.1); }

  /* ── Input section ────────────────────────────────────────────── */
  .bb-input-section { display: flex; align-items: center; flex: 1; min-width: 150px; }

  .bb-textarea {
    width: 100%; min-width: 200px; max-width: 400px;
    background: transparent; border: none; outline: none;
    color: var(--text-1); font-size: 13px; font-family: 'Geist', sans-serif;
    padding: 4px 8px; resize: none; line-height: 1.4;
    max-height: 100px; overflow-y: auto;
  }
  .bb-textarea::placeholder { color: var(--text-3); }
  .bb-textarea:disabled { opacity: .5; }

  /* ── AI Provider pills ──────────────────────────────────────── */
  .bb-ai-providers { display: flex; align-items: center; gap: 3px; }
  .bb-ai-pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 5px 10px; border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-3); font-size: 11px; font-weight: 600;
    font-family: 'Geist', sans-serif; cursor: pointer; transition: all .15s cubic-bezier(.16,1,.3,1);
    white-space: nowrap;
  }
  .bb-ai-pill:hover { color: var(--text-2); background: var(--hover); transform: translateY(-1px); }
  .bb-ai-pill.active {
    color: var(--pill-color, var(--accent));
    background: color-mix(in srgb, var(--pill-color, var(--accent)) 10%, transparent);
    border-color: color-mix(in srgb, var(--pill-color, var(--accent)) 20%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--pill-color, var(--accent)) 8%, transparent);
  }
  .bb-ai-pill:active { transform: scale(.95); }

  /* ── AI Chat actions ────────────────────────────────────────── */
  .bb-ai-actions { display: flex; align-items: center; gap: 2px; }

  /* ── System prompt ──────────────────────────────────────────── */
  .bb-system-prompt-wrap { flex: 0 0 auto; }
  .bb-system-prompt-input {
    width: 160px; background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 8px; padding: 5px 10px; outline: none;
    color: var(--text-1); font-size: 12px; font-family: 'Geist', sans-serif;
    transition: border-color .12s;
  }
  .bb-system-prompt-input::placeholder { color: var(--text-3); }
  .bb-system-prompt-input:focus { border-color: var(--accent); }

  /* ── Selects section ──────────────────────────────────────────── */
  .bb-selects-section { display: flex; align-items: center; gap: 6px; }

  .bb-select-wrap {
    display: flex; align-items: center; gap: 4px;
    background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 8px; padding: 4px 8px;
  }

  .bb-select-label { font-size: 11px; color: var(--text-3); white-space: nowrap; }

  .bb-select {
    background: transparent; border: none; outline: none;
    color: var(--text-1); font-size: 12px; font-family: 'Geist', sans-serif;
    cursor: pointer; max-width: 200px;
  }
  .bb-select option { background: var(--bg-2); color: var(--text-1); }

  /* ── Model Picker (unique variant) ─────────────────────────── */
  .bb-model-picker {
    display: flex; align-items: center; gap: 6px;
    background: color-mix(in srgb, var(--model-accent, var(--accent)) 10%, var(--bg-2));
    border: 1px solid color-mix(in srgb, var(--model-accent, var(--accent)) 25%, var(--border));
    border-radius: 10px; padding: 4px 10px 4px 8px;
    position: relative; transition: all .15s;
  }
  .bb-model-picker:hover {
    border-color: color-mix(in srgb, var(--model-accent, var(--accent)) 50%, transparent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--model-accent, var(--accent)) 15%, transparent);
  }
  .bb-model-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--model-accent, var(--accent));
    flex-shrink: 0; box-shadow: 0 0 6px color-mix(in srgb, var(--model-accent, var(--accent)) 40%, transparent);
  }
  .bb-model-label {
    font-size: 10px; font-weight: 600; color: var(--text-3);
    text-transform: uppercase; letter-spacing: .4px; white-space: nowrap;
  }
  .bb-model-select {
    background: transparent; border: none; outline: none;
    color: var(--text-1); font-size: 12px; font-family: 'Geist', sans-serif;
    cursor: pointer; max-width: 220px; font-weight: 500;
  }
  .bb-model-select option { background: var(--bg-2); color: var(--text-1); }

  /* ── Action buttons section ────────────────────────────────────── */
  .bb-actions-section { display: flex; align-items: center; gap: 4px; }

  .bb-action-btn {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: 8px;
    border: none; background: none; color: var(--text-2);
    cursor: pointer; transition: all .15s cubic-bezier(.16,1,.3,1); flex-shrink: 0;
    position: relative;
  }
  .bb-action-btn:hover { background: var(--hover); color: var(--text-1); transform: scale(1.08); }
  .bb-action-btn:active { transform: scale(.92); }
  .bb-action-btn:disabled { opacity: .3; cursor: not-allowed; transform: none; }
  .bb-action-btn.primary {
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #fff));
    color: #fff; box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .bb-action-btn.primary:hover { filter: brightness(1.12); transform: scale(1.08); box-shadow: 0 3px 14px color-mix(in srgb, var(--accent) 40%, transparent); }
  .bb-action-btn.primary:active { transform: scale(.95); }
  .bb-action-btn.primary:disabled { background: var(--accent); opacity: .5; box-shadow: none; transform: none; }
  .bb-action-btn.danger { color: var(--red); }
  .bb-action-btn.danger:hover { background: rgba(248,113,113,.12); color: #f87171; transform: scale(1.08); }

  .bb-spinner {
    width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3);
    border-top-color: #fff; border-radius: 50%;
    animation: spin .6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Auto-hide ────────────────────────────────────────────── */
  .bb-hover-zone { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 400px; height: 60px; z-index: 250; }
  .bb.auto-hide { transition: transform 0.35s cubic-bezier(.16,1,.3,1), opacity 0.3s ease; }
  .bb.auto-hide.hide-dock { pointer-events: none; }
  .bb.auto-hide.hide-dock.pos-bottom { transform: translateX(-50%) translateY(calc(100% + 32px)); opacity: 0; }
  .bb.auto-hide.hide-dock.pos-top { transform: translateX(-50%) translateY(calc(-100% - 24px)); opacity: 0; }
  .bb.auto-hide.hide-dock.pos-left { transform: translateY(-50%) translateX(calc(-100% - 24px)); opacity: 0; }
  .bb.auto-hide.hide-dock.pos-right { transform: translateY(-50%) translateX(calc(100% + 24px)); opacity: 0; }

  /* Mobile */
  @media (max-width: 600px) {
    .bb.pos-bottom { bottom: 12px; padding: 4px 6px; }
    .bb-more-panel { width: 95vw; }
    .bb-more-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .bb-more-card { padding: 12px 8px; }
    .bb-item { min-width: 36px; padding: 3px 6px 2px; }
    .bb-item-label { font-size: 9px; }
    .bb-pill-tip { opacity: 0; pointer-events: none; transition: opacity .15s; }
    .bb-pill-tip.touch-visible { opacity: 1; }
    .bb-textarea { min-width: 120px; max-width: 200px; }
  }
</style>
