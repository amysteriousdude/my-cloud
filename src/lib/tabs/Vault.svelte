<script lang="ts">
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import { toasts } from "$lib/types/toast";
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { flip } from "svelte/animate";
  import {
    IconUpload, IconLayoutGrid, IconLayoutList,
    IconSortAscending, IconSortDescending,
    IconGripVertical, IconTrash, IconLock, IconLockOpen,
    IconDownload, IconStar, IconStarFilled, IconEdit,
    IconFile, IconPhoto, IconVideo, IconMusic,
    IconFileZip, IconFileText, IconSquare, IconSquareCheck,
    IconX, IconArrowUp, IconHome, IconSearch,
    IconRefresh, IconShield, IconAlertTriangle,
    IconExternalLink, IconInfoCircle, IconWorld,
    IconClock, IconFolder, IconFolderPlus, IconChevronRight,
    IconFolderUp, IconLink,
  } from "@tabler/icons-svelte";

  type VaultFile = {
    id: string;
    name: string;
    size: number;
    createdAt: number;
    chunks: number;
    encrypted: boolean;
    folderId?: string | null;
    favorite?: boolean;
  };

  type VaultFolder = {
    id: string;
    name: string;
    createdAt: number;
    parentId?: string | null;
    favorite?: boolean;
  };

  const CHUNK_SIZE = 19.5 * 1024 * 1024;
  const AES_GCM_TAG_BYTES = 16;
  const AES_GCM_IV_BYTES = 12;
  const META_BYTES_PER_FILE = 96;

  let locked = $state(true);
  let unlocking = $state(false);
  let password = $state('');
  let error = $state('');
  let files = $state<VaultFile[]>([]);
  let folders = $state<VaultFolder[]>([]);

  let filesLoading = $state(true);
  let uploading = $state(false);
  let dragActive = $state(false);
  let viewMode = $state<"list" | "grid">("list");
  let sortBy = $state<"name" | "size" | "date">("date");
  let sortDir = $state<"asc" | "desc">("desc");
  let searchQuery = $state("");
  let selectedIds = $state<Set<string>>(new Set());
  let renamingFileId = $state<string | null>(null);
  let renameFileValue = $state("");
  let renamingFolderId = $state<string | null>(null);
  let renameFolderValue = $state("");
  let creatingFolder = $state(false);
  let newFolderName = $state("");
  let deleting = $state<string | null>(null);
  let showDeleteConfirm = $state(false);
  let folderToDeleteId = $state<string | null>(null);
  let contextMenu = $state<{ x: number; y: number; target: any } | null>(null);
  let contextActiveId = $state<string | null>(null);
  let currentFolderId = $state<string | undefined>(undefined);
  let movingFileId = $state<string | null>(null);

  type UploadJob = { id: string; name: string; progress: number; done: boolean; error: string | null };
  let uploadJobs = $state<UploadJob[]>([]);

  let syncing = $state(false);

  const plainTotal = $derived(files.reduce((sum, f) => sum + f.size, 0));
  const totalChunks = $derived(files.reduce((sum, f) => sum + (f.chunks || Math.max(1, Math.ceil(f.size / CHUNK_SIZE))), 0));
  const encryptedTotal = $derived(plainTotal + totalChunks * (AES_GCM_TAG_BYTES + AES_GCM_IV_BYTES) + files.length * META_BYTES_PER_FILE);
  const overheadBytes = $derived(Math.max(0, encryptedTotal - plainTotal));

  const isSearching = $derived(searchQuery.trim().length > 0);

  const currentFolders = $derived(
    isSearching
      ? folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : folders.filter(f => (f.parentId ?? undefined) === currentFolderId)
  );

  const processedFiles = $derived.by(() => {
    let arr = isSearching
      ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : files.filter(f => (f.folderId ?? undefined) === currentFolderId);
    arr.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "size") cmp = a.size - b.size;
      else cmp = a.createdAt - b.createdAt;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  });

  let allSelected = $derived(
    (processedFiles.length > 0 || currentFolders.length > 0) &&
    processedFiles.every(f => selectedIds.has(f.id)) &&
    currentFolders.every(f => selectedIds.has(f.id))
  );

  const totalSize = $derived(files.reduce((s, f) => s + f.size, 0));

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
  }
  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }
  function fileIconComponent(name: string) {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) return IconPhoto;
    if (['mp4','webm','avi','mov','mkv'].includes(ext)) return IconVideo;
    if (['mp3','wav','ogg','flac','m4a','aac','opus'].includes(ext)) return IconMusic;
    if (['zip','tar','gz','rar','7z'].includes(ext)) return IconFileZip;
    if (['txt','md','json','js','ts','py','css','html','xml','yaml','yml','sh'].includes(ext)) return IconFileText;
    return IconFile;
  }

  function getFolderPath(folderId: string | undefined): VaultFolder[] {
    if (!folderId) return [];
    const path: VaultFolder[] = [];
    let current: VaultFolder | undefined = folders.find(f => f.id === folderId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined;
    }
    return path;
  }
  let currentPath = $derived(getFolderPath(currentFolderId));

  function getFolderSize(folderId: string): number {
    let size = 0;
    for (const f of files.filter(f => f.folderId === folderId)) size += f.size;
    for (const sub of folders.filter(f => f.parentId === folderId)) size += getFolderSize(sub.id);
    return size;
  }

  async function loadVault() {
    filesLoading = true;
    error = '';
    try {
      const res = await fetch('/api/vault/list');
      if (!res.ok) {
        if (res.status === 401) { locked = true; files = []; folders = []; return; }
        throw new Error('Failed to load vault');
      }
      const data = await res.json();
      files = (data.files ?? []).map((f: any) => ({
        id: f.id, name: f.name, size: Number(f.size ?? 0),
        createdAt: Number(f.createdAt ?? Date.now()),
        chunks: Number(f.chunks ?? Math.max(1, Math.ceil(Number(f.size ?? 0) / CHUNK_SIZE))),
        encrypted: true, folderId: f.folderId || null
      }));
      folders = (data.folders ?? []).map((f: any) => ({
        id: f.id, name: f.name,
        createdAt: Number(f.createdAt ?? Date.now()),
        parentId: f.parentId || null
      }));
    } catch { error = 'Could not load vault'; }
    finally { filesLoading = false; }
  }

  async function unlock() {
    error = '';
    if (!password.trim()) { error = 'enter a passphrase'; return; }
    unlocking = true;
    try {
      const res = await fetch('/api/vault/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() })
      });
      const data = await res.json();
      if (!res.ok) { error = data.error || 'unlock failed'; return; }
      locked = false;
      password = '';
      await loadVault();
    } catch (e: any) { error = e?.message ?? 'unlock failed'; }
    finally { unlocking = false; }
  }

  async function uploadFilesList(fileList: FileList | File[]) {
    const arr = Array.from(fileList as any);
    for (const file of arr) {
      const ok = await uploadFile(file as File);
      if (!ok) break;
    }
  }

  async function uploadFile(file: File) {
    uploading = true;
    const jobId = crypto.randomUUID();
    const job: UploadJob = { id: jobId, name: file.name, progress: 0, done: false, error: null };
    uploadJobs = [...uploadJobs, job];
    function patchJob(patch: Partial<UploadJob>) {
      uploadJobs = uploadJobs.map(j => j.id === jobId ? { ...j, ...patch } : j);
    }
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', file.name);
      if (currentFolderId) form.append('folderId', currentFolderId);
      patchJob({ progress: 50 });
      const res = await fetch('/api/vault/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Upload failed');
        throw new Error(msg || 'Upload failed');
      }
      patchJob({ progress: 100, done: true });
      await loadVault();
      setTimeout(() => { uploadJobs = uploadJobs.filter(j => j.id !== jobId); }, 3000);
      return true;
    } catch (e: any) {
      patchJob({ error: e.message, done: true });
      setTimeout(() => { uploadJobs = uploadJobs.filter(j => j.id !== jobId); }, 5000);
      return false;
    } finally {
      uploading = uploadJobs.some(j => !j.done);
    }
  }

  async function downloadFile(file: VaultFile) {
    try {
      const res = await fetch(`/api/vault/download?id=${file.id}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toasts.error(e?.message ?? 'Download failed');
    }
  }

  function triggerDelete(file: VaultFile) {
    folderToDeleteId = null;
    selectedIds = new Set([file.id]);
    showDeleteConfirm = true;
  }
  function triggerFolderDelete(id: string) {
    folderToDeleteId = id;
    showDeleteConfirm = true;
  }

  async function executeDelete() {
    if (folderToDeleteId) {
      const fid = folderToDeleteId;
      folderToDeleteId = null;
      showDeleteConfirm = false;
      try {
        await fetch('/api/vault/folderOps', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', folderId: fid })
        });
        await loadVault();
      } catch { await loadVault(); }
    } else {
      await confirmBulkDelete();
    }
  }

  async function confirmBulkDelete() {
    const ids = [...selectedIds];
    selectedIds = new Set();
    showDeleteConfirm = false;
    for (const id of ids) {
      try { await fetch('/api/vault/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); } catch {}
    }
    await loadVault();
  }

  async function createFolder() {
    const name = newFolderName.trim() || 'New Folder';
    newFolderName = '';
    creatingFolder = false;
    try {
      await fetch('/api/vault/folderOps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name, parentId: currentFolderId })
      });
      await loadVault();
    } catch { await loadVault(); }
  }

  async function renameFolder(id: string, name: string) {
    if (!name.trim()) { renamingFolderId = null; return; }
    renamingFolderId = null;
    try {
      await fetch('/api/vault/folderOps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', folderId: id, name })
      });
      await loadVault();
    } catch { await loadVault(); }
  }

  async function moveFileToFolder(fileId: string, folderId: string | undefined) {
    movingFileId = null;
    try {
      await fetch('/api/vault/folderOps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'moveFile', fileId, folderId: folderId ?? null })
      });
      await loadVault();
    } catch { await loadVault(); }
  }

  function openContextMenu(e: MouseEvent, target: any) {
    e.preventDefault();
    e.stopPropagation();
    if (target) contextActiveId = target._type === 'folder' ? target.id : target.id;
    else contextActiveId = null;
    const { clientX, clientY } = e;
    contextMenu = null;
    setTimeout(() => { contextMenu = { x: clientX, y: clientY, target }; }, 0);
  }

  function handleFileClick(e: MouseEvent, id: string, forceToggle = false) {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || forceToggle) {
      const s = new Set(selectedIds);
      if (s.has(id)) s.delete(id); else s.add(id);
      selectedIds = s;
    } else {
      selectedIds = new Set([id]);
    }
  }

  function toggleSelectAll(e: MouseEvent) {
    if (e) e.stopPropagation();
    if (allSelected) { selectedIds = new Set(); }
    else {
      const ids = [...currentFolders.map(f => f.id), ...processedFiles.map(f => f.id)];
      selectedIds = new Set(ids);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }
  function handleDragLeave(e: DragEvent) {
    const rect = document.querySelector(".vault-root")?.getBoundingClientRect();
    if (rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) return;
    dragActive = false;
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    const fl = e.dataTransfer?.files;
    if (!fl || fl.length === 0) return;
    uploadFilesList(fl);
  }

  let searchTimeout: any;
  function onSearch(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {}, 280);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      renamingFileId = null;
      renamingFolderId = null;
      showDeleteConfirm = false;
      contextMenu = null;
      creatingFolder = false;
    }
    if (e.key === "Delete" && selectedIds.size > 0) {
      e.preventDefault();
      showDeleteConfirm = true;
    }
  }

  function selectOnMount(node: HTMLInputElement) {
    setTimeout(() => { node.focus(); node.select(); }, 0);
  }

  async function handlePaste(e: ClipboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) uploadFile(file);
      }
    }
  }

  function lockVault() {
    locked = true;
    files = [];
    folders = [];
    password = '';
    error = '';
    searchQuery = '';
    currentFolderId = undefined;
  }

  onMount(() => { void loadVault(); });
</script>

<svelte:window onkeydown={handleKeydown} onpaste={handlePaste} onclick={() => { contextMenu = null; contextActiveId = null; selectedIds = new Set(); }} />

{#if contextMenu}
  {@const target = contextMenu?.target}
  {@const isFile = target && !target._type}
  {@const isFolder = target && target._type === 'folder'}
  {@const isBackground = !target}
  <ContextMenu
    x={contextMenu?.x ?? 0}
    y={contextMenu?.y ?? 0}
    onclose={() => { contextMenu = null; contextActiveId = null; }}
    items={[
      ...(isFile ? [
        { label: 'Download', icon: IconDownload, action: () => target && downloadFile(target) },
        { label: 'Rename', icon: IconEdit, action: () => { if (target) { renamingFileId = target.id; renameFileValue = target.name; } } },
        { label: 'Favorite', icon: target?.favorite ? IconStarFilled : IconStar, action: () => {} },
        { separator: true },
        ...(selectedIds.has(target.id) ? [
          { label: 'Unselect', icon: IconSquare, action: () => { selectedIds.delete(target.id); selectedIds = new Set(selectedIds); } },
        ] : [
          { label: 'Select', icon: IconSquareCheck, action: () => { selectedIds.add(target.id); selectedIds = new Set(selectedIds); } },
        ]),
        { label: 'Delete', icon: IconTrash, action: () => { if (target) triggerDelete(target); }, danger: true },
      ] : []),
      ...(isFolder ? [
        { label: 'Open', icon: IconExternalLink, action: () => target && (currentFolderId = target.id) },
        { label: 'Rename', icon: IconEdit, action: () => { if (target) { renamingFolderId = target.id; renameFolderValue = target.name; } } },
        { separator: true },
        { label: 'Delete', icon: IconTrash, action: () => { if (target) triggerFolderDelete(target.id); }, danger: true },
      ] : []),
      ...(isBackground ? [
        { label: 'Upload File', icon: IconUpload, action: () => document.getElementById('vault-fi')?.click() },
        { label: 'New Folder', icon: IconFolderPlus, action: () => creatingFolder = true },
        ...(selectedIds.size > 0 ? [{ label: 'Clear Selection', icon: IconSquare, action: () => selectedIds = new Set() }] : []),
      ] : []),
    ] as any}
  />
{/if}

{#if locked}
  <div class="vault-shell">
    <section class="vault-card lock-card">
      <div class="vault-head">
        <div class="kicker"><IconLock size={12} stroke={2} /><span>vault</span></div>
        <h1>Locked space</h1>
        <p>Enter a passphrase to unlock or create your vault.</p>
      </div>
      <div class="unlock-form">
        <input class="vault-input" type="password" placeholder="passphrase" bind:value={password}
          onkeydown={(e) => e.key === 'Enter' && unlock()} />
        <button class="vault-btn primary" onclick={unlock} disabled={unlocking || !password.trim()}>
          {#if unlocking}<span class="spin"></span>{:else}<IconLockOpen size={14} stroke={2} />{/if}
          <span>{unlocking ? 'unlocking' : 'unlock'}</span>
        </button>
      </div>
      {#if error}
        <div class="status error"><IconAlertTriangle size={13} stroke={2} /><span>{error}</span></div>
      {/if}
    </section>
  </div>
{:else}
  <div class="vault-root" role="presentation" ondragover={handleDragOver} ondragleave={handleDragLeave}>
    <div class="content" oncontextmenu={(e) => openContextMenu(e, null)}>
      <input type="file" id="vault-fi" class="hidden-input"
        onchange={(e) => { const fl = (e.target as HTMLInputElement).files; if (fl && fl.length > 0) { uploadFilesList(fl); (e.target as HTMLInputElement).value = ""; } }}
        disabled={uploading} multiple />

      {#if dragActive}
        <div class="drop-overlay" role="presentation" ondragover={(e) => e.preventDefault()} ondragleave={() => dragActive = false} ondrop={handleDrop}>
          <div class="drop-message">
            <div class="drop-icon-wrap"><IconArrowUp size={32} /></div>
            <span class="drop-title">Drop to upload (encrypted)</span>
          </div>
        </div>
      {/if}

      {#if uploadJobs.length > 0}
        <div class="upload-panel">
          <div class="up-header">
            <span>Encrypting {uploadJobs.filter(j => !j.done).length || uploadJobs.length} file{uploadJobs.length > 1 ? 's' : ''}</span>
            {#if uploadJobs.every(j => j.done)}<button class="up-close" onclick={() => uploadJobs = []}>✕</button>{/if}
          </div>
          {#each uploadJobs as job (job.id)}
            <div class="up-row">
              <div class="up-name" title={job.name}>{job.name}</div>
              {#if job.error}<span class="up-err">✕ {job.error}</span>
              {:else if job.done}<span class="up-ok">✓</span>
              {:else}
                <div class="up-bar"><div class="up-fill" style="width:{job.progress}%"></div></div>
                <span class="up-pct">{job.progress}%</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <div class="toolbar" onclick={(e) => e.stopPropagation()} role="presentation">
        <div class="toolbar-left">
          <div class="search-wrap">
            {#if syncing}<div class="sync-dot"></div>{/if}
            <IconSearch size={15} /><input class="search" type="text" placeholder="Search encrypted files..." oninput={onSearch} />
          </div>
        </div>
        <div class="toolbar-right">
          <label for="vault-fi" class="tb-btn" title="Upload file">
            {#if uploading}<div class="spin-sm"></div>{:else}<IconUpload size={15} /> Upload{/if}
          </label>
          <button class="tb-btn" onclick={() => creatingFolder = true} title="New folder">
            <IconFolderPlus size={15} /> Folder
          </button>
          <button class="tb-btn" onclick={() => (viewMode = viewMode === "list" ? "grid" : "list")} title="Toggle view">
            {#if viewMode === "list"}<IconLayoutGrid size={15} />{:else}<IconLayoutList size={15} />{/if}
          </button>
          <div class="sort-wrap">
            <button class="tb-btn" onclick={() => (sortDir = sortDir === "asc" ? "desc" : "asc")}>
              {#if sortDir === "asc"}<IconSortAscending size={15} />{:else}<IconSortDescending size={15} />{/if}
            </button>
            <select class="sort-select" bind:value={sortBy}>
              <option value="date">Date</option><option value="name">Name</option><option value="size">Size</option>
            </select>
          </div>
          <button class="tb-btn" onclick={() => loadVault()} title="Refresh"><IconRefresh size={15} /></button>
          <button class="tb-btn danger-text" onclick={lockVault} title="Lock vault"><IconLock size={15} /> Lock</button>
          <span class="count">{processedFiles.length} file{processedFiles.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {#if selectedIds.size > 0}
        <div class="bulk-bar" onclick={(e) => e.stopPropagation()} role="presentation">
          <span class="bulk-count">{selectedIds.size} selected</span>
          <button class="bulk-btn danger" onclick={() => showDeleteConfirm = true}><IconTrash size={14} /> Delete</button>
          <button class="bulk-btn" onclick={() => (selectedIds = new Set())}><IconX size={14} /> Clear</button>
        </div>
      {/if}

      <div class="encryption-bar">
        <IconShield size={13} stroke={2} />
        <span>{formatBytes(plainTotal)} plain → {formatBytes(encryptedTotal)} encrypted</span>
        <span class="enc-overhead">+{formatBytes(overheadBytes)} overhead</span>
        <span>·</span>
        <span>{totalChunks} chunks</span>
      </div>

      {#if currentPath.length > 0 || currentFolderId}
        <div class="breadcrumb">
          <span class="bc-item bc-root" onclick={() => currentFolderId = undefined}>
            <IconHome size={12} stroke={2.5} /> Home
          </span>
          {#each currentPath as crumb}
            <span class="bc-sep">›</span>
            <span class="bc-item" class:bc-active={crumb.id === currentFolderId}
              onclick={() => currentFolderId = crumb.id}>{crumb.name}</span>
          {/each}
        </div>
      {/if}

      {#if filesLoading}
        <div class="file-list skeleton-list">
          {#each {length: 8} as _, i}
            <div class="file-row skel-row" style="opacity:{1 - i*0.09}">
              <div class="skel skel-icon"></div>
              <div class="skel skel-name" style="width:{55 + (i % 4)*10}%"></div>
              <div class="skel skel-meta"></div>
              <div class="skel skel-meta"></div>
            </div>
          {/each}
        </div>
      {:else if processedFiles.length === 0 && currentFolders.length === 0 && !creatingFolder}
        <div class="empty">
          <IconShield size={32} stroke={1.2} />
          <span>{currentFolderId ? 'Empty folder.' : 'No files in vault.'}</span>
          <span class="empty-sub">Upload files to encrypt and store them securely.</span>
        </div>
      {:else if viewMode === "list"}
        <div class="file-list">
          <div class="file-row file-row-header" onclick={(e) => e.stopPropagation()} role="presentation">
            <button class="check-btn" onclick={toggleSelectAll}>
              {#if allSelected}<IconSquareCheck size={16} />{:else}<IconSquare size={16} />{/if}
            </button>
            <span class="fh-name">Name</span><span class="fh-size">Size</span><span class="fh-date">Date</span><span class="fh-actions">Actions</span>
          </div>

          {#if creatingFolder}
            <div class="file-row creating-folder-row">
              <button class="check-btn" disabled><IconSquare size={16} /></button>
              <span class="grip" style="opacity: 0.3"><IconGripVertical size={14} /></span>
              <span class="ficon"><IconFolder size={18} stroke={1.5} color="#fbbf24" /></span>
              <div class="finfo">
                <input class="folder-rename-input" type="text" bind:value={newFolderName}
                  use:selectOnMount placeholder="New Folder"
                  onkeydown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') creatingFolder = false; }} />
              </div>
              <span class="fsize">--</span>
              <span class="fdate">Just now</span>
              <div class="factions"><span class="folder-hint">Press Enter</span></div>
            </div>
          {/if}

          {#each currentFolders as folder (folder.id)}
            <div class="file-row folder-row"
              animate:flip={{ duration: 200 }} in:fly={{ y: -10, duration: 150 }} out:fade={{ duration: 100 }}
              class:selected={selectedIds.has(folder.id)} class:context-active={contextActiveId === folder.id}
              oncontextmenu={(e) => openContextMenu(e, { ...folder, _type: 'folder' })}
              onclick={(e) => handleFileClick(e, folder.id)}
              ondblclick={() => currentFolderId = folder.id}>
              <button class="check-btn" class:visible-selected={selectedIds.has(folder.id)}
                onclick={(e) => handleFileClick(e, folder.id, true)}>
                {#if selectedIds.has(folder.id)}<IconSquareCheck size={18} stroke={2} color="var(--accent)" />{:else}<IconSquare size={18} stroke={1.5} />{/if}
              </button>
              <span class="grip" style="opacity: 0.3"><IconGripVertical size={14} /></span>
              <span class="ficon"><IconFolder size={18} stroke={1.5} color="#fbbf24" /></span>
              <div class="finfo">
                {#if renamingFolderId === folder.id}
                  <input class="folder-rename-input" type="text" bind:value={renameFolderValue}
                    use:selectOnMount
                    onkeydown={(e) => { if (e.key === 'Enter') renameFolder(folder.id, renameFolderValue); if (e.key === 'Escape') renamingFolderId = null; }}
                    onclick={(e) => e.stopPropagation()} />
                {:else}
                  <button class="fname" onclick={(e) => { e.stopPropagation(); currentFolderId = folder.id; }}>
                    {#if folder.favorite}<IconStarFilled size={11} style="color: #fbbf24" />{/if}
                    {folder.name}
                  </button>
                {/if}
                <div class="ftags">
                  <span class="ftag folder-tag">{files.filter(f => f.folderId === folder.id).length} items</span>
                </div>
              </div>
              <span class="fsize">{formatBytes(getFolderSize(folder.id))}</span>
              <span class="fdate">{formatDate(folder.createdAt)}</span>
              <div class="factions" onclick={(e) => e.stopPropagation()} role="presentation">
                <button class="act-btn" title="Open" onclick={() => currentFolderId = folder.id}>
                  <IconChevronRight size={14} stroke={2.5} />
                </button>
                <button class="act-btn" title="Rename" onclick={() => { renamingFolderId = folder.id; renameFolderValue = folder.name; }}>
                  <IconEdit size={14} />
                </button>
                <button class="act-btn danger" title="Delete" onclick={() => triggerFolderDelete(folder.id)}>
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          {/each}

          {#each processedFiles as file (file.id)}
            {@const FileIcon = fileIconComponent(file.name)}
            <div class="file-row"
              animate:flip={{ duration: 200 }} in:fly={{ y: -10, duration: 150 }} out:fade={{ duration: 100 }}
              oncontextmenu={(e) => openContextMenu(e, file)}
              onclick={(e) => handleFileClick(e, file.id)}
              class:selected={selectedIds.has(file.id)} class:context-active={contextActiveId === file.id}>
              <button class="check-btn" class:visible-selected={selectedIds.has(file.id)}
                onclick={(e) => handleFileClick(e, file.id, true)}>
                {#if selectedIds.has(file.id)}<IconSquareCheck size={18} stroke={2} color="var(--accent)" />{:else}<IconSquare size={18} stroke={1.5} />{/if}
              </button>
              <span class="grip"><IconGripVertical size={14} /></span>
              <span class="ficon"><FileIcon size={18} stroke={1.5} /></span>
              <div class="finfo">
                {#if renamingFileId === file.id}
                  <input class="folder-rename-input" type="text" bind:value={renameFileValue}
                    use:selectOnMount
                    onkeydown={(e) => { if (e.key === 'Enter') { /* rename not yet supported */ renamingFileId = null; } if (e.key === 'Escape') renamingFileId = null; }}
                    onclick={(e) => e.stopPropagation()} />
                {:else}
                  <button class="fname" onclick={(e) => { e.stopPropagation(); downloadFile(file); }}>
                    {#if file.favorite}<IconStarFilled size={12} class="star-inline" />{/if}
                    {file.name}
                  </button>
                {/if}
                <div class="ftags">
                  <span class="ftag encrypted-tag"><IconLock size={9} /> encrypted</span>
                </div>
              </div>
              <span class="fsize">{formatBytes(file.size)}</span>
              <span class="fdate"><IconClock size={11} stroke={2} /> {formatDate(file.createdAt)}</span>
              <div class="factions" onclick={(e) => e.stopPropagation()} role="presentation">
                <button class="act-btn" title={file.favorite ? "Unfavorite" : "Favorite"}
                  onclick={() => files = files.map(f => f.id === file.id ? { ...f, favorite: !f.favorite } : f)}>
                  {#if file.favorite}<IconStarFilled size={14} color="#fbbf24" />{:else}<IconStar size={14} />{/if}
                </button>
                <div class="move-menu-wrap" onclick={(e) => e.stopPropagation()} role="presentation">
                  <button class="act-btn" title="Move to folder"
                    onclick={() => movingFileId = movingFileId === file.id ? null : file.id}>
                    <IconFolder size={14} stroke={2} />
                  </button>
                  {#if movingFileId === file.id}
                    <div class="move-menu">
                      {#if file.folderId}
                        <button class="move-item" onclick={() => moveFileToFolder(file.id, undefined)}>
                          <IconHome size={12} stroke={2} /> Root
                        </button>
                      {/if}
                      {#each folders.filter(f => f.id !== file.folderId) as f}
                        <button class="move-item" onclick={() => moveFileToFolder(file.id, f.id)}>
                          <IconFolder size={12} stroke={1.5} color="#fbbf24" fill="currentColor" />
                          {f.name}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
                <button class="act-btn" title="Download" onclick={() => downloadFile(file)}>
                  <IconDownload size={14} />
                </button>
                <button class="act-btn danger" title="Delete" onclick={() => triggerDelete(file)}>
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="file-grid">
          {#if creatingFolder}
            <div class="grid-card creating">
              <button class="grid-preview folder-preview">
                <IconFolder size={56} stroke={1.2} color="#fbbf24" />
              </button>
              <div class="grid-info">
                <input class="folder-rename-input" type="text" bind:value={newFolderName}
                  use:selectOnMount placeholder="New Folder"
                  onkeydown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') creatingFolder = false; }} />
              </div>
            </div>
          {/if}

          {#each currentFolders as folder (folder.id)}
            <div class="grid-card folder-card"
              animate:flip={{ duration: 200 }} in:fly={{ y: -10, duration: 150 }} out:fade={{ duration: 100 }}
              oncontextmenu={(e) => openContextMenu(e, { ...folder, _type: 'folder' })}
              onclick={(e) => handleFileClick(e, folder.id)}
              class:selected={selectedIds.has(folder.id)} class:context-active={contextActiveId === folder.id}
              ondblclick={() => currentFolderId = folder.id}>
              <button class="grid-check" class:visible={selectedIds.has(folder.id)}
                onclick={(e) => handleFileClick(e, folder.id, true)}>
                {#if selectedIds.has(folder.id)}<IconSquareCheck size={16} />{:else}<IconSquare size={16} />{/if}
              </button>
              <button class="grid-preview folder-preview" onclick={() => currentFolderId = folder.id}>
                <IconFolder size={56} stroke={1.2} color="#fbbf24" />
                <div class="folder-badge">{files.filter(f => f.folderId === folder.id).length} items</div>
              </button>
              <div class="grid-info">
                <div class="grid-name">
                  {#if folder.favorite}<IconStarFilled size={11} style="color: #fbbf24" />{/if}
                  {#if renamingFolderId === folder.id}
                    <input class="folder-rename-input" type="text" bind:value={renameFolderValue}
                      use:selectOnMount
                      onkeydown={(e) => { if (e.key === 'Enter') renameFolder(folder.id, renameFolderValue); if (e.key === 'Escape') renamingFolderId = null; }}
                      onclick={(e) => e.stopPropagation()} />
                  {:else}
                    <button class="fname-btn" onclick={(e) => { e.stopPropagation(); currentFolderId = folder.id; }}>{folder.name}</button>
                  {/if}
                </div>
                <span class="grid-meta">{formatBytes(getFolderSize(folder.id))}</span>
              </div>
              <div class="grid-actions" onclick={(e) => e.stopPropagation()}>
                <button class="act-btn sm" title="Open" onclick={() => currentFolderId = folder.id}><IconChevronRight size={14} stroke={2.5} /></button>
                <button class="act-btn sm" title="Rename" onclick={() => { renamingFolderId = folder.id; renameFolderValue = folder.name; }}><IconEdit size={13} /></button>
                <button class="act-btn sm danger" title="Delete" onclick={() => triggerFolderDelete(folder.id)}><IconTrash size={13} /></button>
              </div>
            </div>
          {/each}

          {#each processedFiles as file (file.id)}
            {@const FileIcon = fileIconComponent(file.name)}
            <div class="grid-card"
              animate:flip={{ duration: 200 }} in:fly={{ y: -10, duration: 150 }} out:fade={{ duration: 100 }}
              oncontextmenu={(e) => openContextMenu(e, file)}
              onclick={(e) => handleFileClick(e, file.id)}
              class:selected={selectedIds.has(file.id)} class:context-active={contextActiveId === file.id}>
              <button class="grid-check" class:visible={selectedIds.has(file.id)}
                onclick={(e) => handleFileClick(e, file.id, true)}>
                {#if selectedIds.has(file.id)}<IconSquareCheck size={16} />{:else}<IconSquare size={16} />{/if}
              </button>
              <button class="grid-preview" onclick={() => downloadFile(file)}>
                <div class="grid-icon"><FileIcon size={40} stroke={1.2} /></div>
                <div class="vault-badge"><IconLock size={10} /> AES-256</div>
              </button>
              <div class="grid-info">
                <div class="grid-name">
                  {#if file.favorite}<IconStarFilled size={11} />{/if}
                  <button class="fname-btn" onclick={(e) => { e.stopPropagation(); downloadFile(file); }}>{file.name}</button>
                </div>
                <span class="grid-meta">{formatBytes(file.size)}</span>
              </div>
              <div class="grid-actions" onclick={(e) => e.stopPropagation()}>
                <button class="act-btn sm" onclick={(e) => { e.stopPropagation(); downloadFile(file); }}><IconDownload size={13} /></button>
                <button class="act-btn sm danger" onclick={(e) => { e.stopPropagation(); triggerDelete(file); }} title="Delete"><IconTrash size={13} /></button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <footer class="storage-footer">
      <span>🔒 {files.length} encrypted file{files.length !== 1 ? "s" : ""}</span>
      <span>·</span>
      <span>💾 {formatBytes(plainTotal)} plain ({formatBytes(encryptedTotal)} encrypted)</span>
    </footer>
  </div>

  {#if showDeleteConfirm}
    <div class="modal-overlay" onclick={(e) => { e.stopPropagation(); showDeleteConfirm = false; }} role="presentation">
      <div class="modal-content danger" onclick={(e) => e.stopPropagation()} role="document">
        <div class="modal-header">
          <IconTrash size={24} stroke={1.5} class="msg-icon danger" />
          <h3>Delete Permanently?</h3>
        </div>
        <p class="modal-msg">
          {#if folderToDeleteId}
            Are you sure you want to delete this folder and all its contents? This action cannot be undone.
          {:else if selectedIds.size === 1}
            Are you sure you want to delete this encrypted file? This action cannot be undone.
          {:else}
            Are you sure you want to delete {selectedIds.size} items? This action cannot be undone.
          {/if}
        </p>
        <div class="modal-actions">
          <button class="modal-btn secondary" onclick={() => { showDeleteConfirm = false; folderToDeleteId = null; }}>Cancel</button>
          <button class="modal-btn danger-primary" onclick={executeDelete}>
            {folderToDeleteId ? 'Delete Folder' : (selectedIds.size > 1 ? 'Delete Items' : 'Delete Item')}
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .vault-shell { width: 100%; display: flex; align-items: center; justify-content: center; min-height: 100%; padding: 20px 24px 28px; }
  .vault-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.12); padding: 24px; width: 100%; max-width: 400px; }
  .vault-head { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
  .vault-head h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.03em; }
  .vault-head p { font-size: 12.5px; color: var(--text-3); line-height: 1.5; }
  .kicker { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--text-3); }
  .unlock-form { display: flex; flex-direction: column; gap: 8px; }
  .vault-input { appearance: none; width: 100%; padding: 10px 12px; border-radius: 10px; background: var(--bg-1); border: 1px solid var(--border); color: var(--text-1); font-size: 13px; font-family: 'Geist Mono', monospace; outline: none; transition: border-color 0.14s ease; }
  .vault-input:focus { border-color: var(--border-hover); }
  .vault-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-1); color: var(--text-1); font-size: 13px; font-family: 'Geist', sans-serif; padding: 10px 12px; cursor: pointer; transition: transform 0.12s ease, border-color 0.12s ease; }
  .vault-btn:hover { border-color: var(--border-hover); background: var(--bg-3); }
  .vault-btn.primary { background: var(--accent); border-color: transparent; color: white; }
  .vault-btn.primary:hover { filter: brightness(1.04); }
  .vault-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .status { display: flex; align-items: center; gap: 6px; margin-top: 10px; padding: 8px 10px; border-radius: 10px; font-size: 12px; }
  .status.error { color: #f87171; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.16); }
  .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: transparent; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .vault-root { width: 100%; }
  .content { padding: 20px 24px; max-width: 1100px; margin: 0 auto; width: 100%; flex: 1; }
  @media (max-width: 600px) { .content { padding: 12px 12px; } }
  .hidden-input { display: none; }

  .drop-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); }
  .drop-message { display: flex; flex-direction: column; align-items: center; gap: 10px; background: var(--bg-2); border: 2px dashed var(--accent); border-radius: 20px; padding: 40px 60px; color: var(--text-1); animation: drop-pulse 1.2s ease-in-out infinite; }
  @keyframes drop-pulse { 0%,100% { border-color: var(--accent); } 50% { border-color: var(--border-hover); } }
  .drop-icon-wrap { width: 64px; height: 64px; background: rgba(99,102,241,.15); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: var(--accent); }
  .drop-title { font-size: 18px; font-weight: 600; }

  .upload-panel { position: fixed; bottom: 24px; right: 24px; z-index: 9999; width: 300px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.45); overflow: hidden; animation: up-in .18s ease; }
  @keyframes up-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  .up-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px 8px; font-size: 12px; font-weight: 600; color: var(--text-2); border-bottom: 1px solid var(--border); }
  .up-close { background: none; border: none; color: var(--text-3); cursor: pointer; font-size: 13px; }
  .up-close:hover { color: var(--text-1); }
  .up-row { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border); font-size: 12px; }
  .up-row:last-child { border-bottom: none; }
  .up-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-1); }
  .up-bar { width: 60px; height: 4px; background: var(--bg-3); border-radius: 99px; overflow: hidden; }
  .up-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width .2s ease; }
  .up-pct { font-size: 11px; color: var(--text-3); min-width: 30px; text-align: right; }
  .up-ok { color: var(--green); font-size: 13px; }
  .up-err { color: var(--red); font-size: 11px; flex: 1; }

  .skeleton-list { pointer-events: none; }
  .skel-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); animation: skel-pulse 1.4s ease-in-out infinite; }
  @keyframes skel-pulse { 0%,100% { opacity:1; } 50% { opacity:.45; } }
  .skel { background: var(--bg-3); border-radius: 5px; flex-shrink: 0; }
  .skel-icon { width: 20px; height: 20px; border-radius: 4px; margin-left: 4px; }
  .skel-name { height: 12px; flex-shrink: 1; }
  .skel-meta { width: 56px; height: 11px; }

  .sync-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); opacity: .7; animation: sync-blink .9s ease-in-out infinite; flex-shrink: 0; }
  @keyframes sync-blink { 0%,100% { opacity:.7; } 50% { opacity:.15; } }

  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .toolbar-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
  .toolbar-right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .search-wrap { display: flex; align-items: center; gap: 8px; padding: 7px 12px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; flex: 1; min-width: 180px; color: var(--text-3); }
  .search { flex: 1; background: none; border: none; outline: none; color: var(--text-1); font-size: 13px; font-family: 'Geist', sans-serif; min-width: 0; }
  .search::placeholder { color: var(--text-3); }
  .tb-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 11px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-2); color: var(--text-2); font-size: 12px; font-family: 'Geist', sans-serif; cursor: pointer; transition: all 0.12s; white-space: nowrap; }
  .tb-btn:hover { border-color: var(--border-hover); background: var(--bg-3); color: var(--text-1); }
  .tb-btn.danger-text { color: #f87171; }
  .tb-btn.danger-text:hover { border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.06); }
  .sort-wrap { display: flex; gap: 4px; }
  .sort-select { padding: 7px 10px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 8px; color: var(--text-2); font-size: 12px; font-family: 'Geist', sans-serif; cursor: pointer; }
  .sort-select:focus { outline: none; border-color: var(--border-hover); }
  .count { font-size: 11px; color: var(--text-3); font-family: 'Geist Mono', monospace; }
  .spin-sm { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border); border-top-color: var(--accent); animation: spin 0.7s linear infinite; }

  .bulk-bar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: var(--accent); color: white; border-radius: 10px; margin-bottom: 10px; font-size: 12px; animation: up-in .15s ease; }
  .bulk-count { font-weight: 600; }
  .bulk-btn { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: white; font-size: 11px; font-family: 'Geist', sans-serif; cursor: pointer; transition: background 0.12s; }
  .bulk-btn:hover { background: rgba(255,255,255,0.2); }
  .bulk-btn.danger { background: rgba(248,113,113,0.3); border-color: rgba(248,113,113,0.4); }

  .encryption-bar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; font-size: 11px; color: var(--text-3); font-family: 'Geist Mono', monospace; }
  .enc-overhead { opacity: 0.7; }

  .breadcrumb { display: flex; align-items: center; gap: 4px; padding: 6px 0; margin-bottom: 6px; font-size: 12px; flex-wrap: wrap; }
  .bc-item { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; border-radius: 6px; color: var(--text-3); cursor: pointer; transition: all 0.12s; }
  .bc-item:hover { background: var(--bg-2); color: var(--text-1); }
  .bc-item.bc-active { color: var(--text-1); font-weight: 500; }
  .bc-root { font-weight: 500; }
  .bc-sep { color: var(--text-3); opacity: 0.5; }

  .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 48px 18px; color: var(--text-3); text-align: center; font-size: 13px; }
  .empty-sub { font-size: 11px; opacity: 0.6; }

  .file-list { border: 1px solid var(--border); border-radius: 14px; overflow: hidden; background: var(--bg-1); }
  .file-row { display: grid; grid-template-columns: 32px 20px 24px minmax(0, 1fr) 80px 120px 140px; align-items: center; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s; }
  .file-row:last-child { border-bottom: none; }
  .file-row:hover { background: var(--bg-2); }
  .file-row.selected { background: color-mix(in srgb, var(--accent) 8%, var(--bg-2)); }
  .file-row.context-active { background: color-mix(in srgb, var(--accent) 12%, var(--bg-2)); }
  .file-row-header { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-3); background: var(--bg-2); cursor: default; }
  .file-row-header:hover { background: var(--bg-2); }

  .check-btn { background: none; border: none; color: var(--text-3); cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.3; transition: opacity 0.12s; }
  .check-btn:hover, .check-btn.visible-selected { opacity: 1; }
  .grip { color: var(--text-3); cursor: grab; display: flex; align-items: center; }
  .ficon { color: var(--text-3); display: flex; align-items: center; }
  .finfo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .fname { background: none; border: none; color: var(--text-1); font-size: 13px; font-weight: 500; cursor: pointer; text-align: left; padding: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px; }
  .fname:hover { color: var(--accent); }
  .fname :global(.star-inline) { color: #fbbf24; flex-shrink: 0; }
  .fsize, .fdate { font-size: 11.5px; color: var(--text-3); font-family: 'Geist Mono', monospace; white-space: nowrap; display: flex; align-items: center; gap: 4px; }
  .fh-name, .fh-size, .fh-date, .fh-actions { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-3); }
  .fh-actions { text-align: right; }
  .ftags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 1px; }
  .ftag { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 8px; font-size: 10px; background: var(--bg-3); color: var(--text-3); }
  .encrypted-tag { background: rgba(99,102,241,0.1); color: #818cf8; }
  .folder-tag { background: rgba(251,191,36,0.1); color: #fbbf24; }
  .factions { display: flex; gap: 2px; justify-self: end; }
  .act-btn { background: none; border: none; color: var(--text-3); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; transition: all 0.1s; }
  .act-btn:hover { color: var(--text-1); background: var(--bg-3); }
  .act-btn.danger:hover { color: #f87171; }
  .act-btn.sm { padding: 3px; }
  .folder-rename-input { background: var(--bg-1); border: 1px solid var(--accent); border-radius: 6px; padding: 4px 8px; color: var(--text-1); font-size: 13px; font-family: 'Geist', sans-serif; outline: none; width: 100%; }
  .folder-hint { font-size: 11px; color: var(--text-3); font-style: italic; }

  .move-menu-wrap { position: relative; }
  .move-menu { position: absolute; top: 100%; right: 0; margin-top: 4px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 8px; padding: 4px; z-index: 10; min-width: 160px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); max-height: 200px; overflow-y: auto; }
  .move-item { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; background: none; border: none; padding: 6px 10px; color: var(--text-1); font-size: 12px; font-family: 'Geist', sans-serif; cursor: pointer; border-radius: 4px; }
  .move-item:hover { background: var(--bg-3); }

  .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .grid-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; cursor: pointer; transition: all 0.12s; position: relative; }
  .grid-card:hover { border-color: var(--border-hover); }
  .grid-card.selected { border-color: var(--accent); }
  .grid-card.context-active { background: color-mix(in srgb, var(--accent) 8%, var(--bg-2)); }
  .grid-check { position: absolute; top: 8px; left: 8px; z-index: 2; background: var(--bg-1); border: 1px solid var(--border); border-radius: 6px; padding: 3px; color: var(--text-3); cursor: pointer; opacity: 0; transition: opacity 0.12s; display: flex; }
  .grid-card:hover .grid-check, .grid-check.visible { opacity: 1; }
  .grid-preview { width: 100%; aspect-ratio: 4/3; display: flex; align-items: center; justify-content: center; background: var(--bg-3); border: none; cursor: pointer; position: relative; }
  .grid-icon { color: var(--text-3); }
  .folder-preview { background: color-mix(in srgb, #fbbf24 8%, var(--bg-3)); }
  .folder-badge { position: absolute; bottom: 6px; right: 6px; padding: 3px 8px; border-radius: 6px; background: rgba(0,0,0,0.5); color: white; font-size: 10px; font-family: 'Geist Mono', monospace; backdrop-filter: blur(4px); }
  .vault-badge { position: absolute; bottom: 6px; right: 6px; display: flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; background: rgba(99,102,241,0.15); color: #818cf8; font-size: 10px; font-family: 'Geist Mono', monospace; backdrop-filter: blur(4px); }
  .grid-info { padding: 10px 12px; }
  .grid-name { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; min-height: 20px; }
  .grid-name :global(svg) { color: #fbbf24; flex-shrink: 0; }
  .fname-btn { background: none; border: none; color: var(--text-1); font-size: 12.5px; font-weight: 500; cursor: pointer; text-align: left; padding: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
  .fname-btn:hover { color: var(--accent); }
  .grid-meta { font-size: 11px; color: var(--text-3); font-family: 'Geist Mono', monospace; }
  .grid-actions { display: flex; gap: 2px; padding: 6px 8px 8px; border-top: 1px solid var(--border); justify-content: flex-end; }

  .storage-footer { display: flex; align-items: center; gap: 8px; padding: 12px 24px; font-size: 11px; color: var(--text-3); font-family: 'Geist Mono', monospace; border-top: 1px solid var(--border); }

  .modal-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; }
  .modal-content { background: var(--bg-2); border: 1px solid var(--border); border-radius: 16px; padding: 24px; max-width: 400px; width: 90%; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
  .modal-header { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 12px; }
  .modal-header h3 { font-size: 16px; font-weight: 600; }
  .modal-msg { font-size: 13px; color: var(--text-3); margin-bottom: 20px; line-height: 1.5; }
  .modal-actions { display: flex; gap: 8px; justify-content: center; }
  .modal-btn { padding: 8px 18px; border-radius: 8px; font-size: 13px; font-family: 'Geist', sans-serif; cursor: pointer; border: 1px solid var(--border); transition: all 0.12s; }
  .modal-btn.secondary { background: var(--bg-1); color: var(--text-1); }
  .modal-btn.secondary:hover { background: var(--bg-3); }
  .modal-btn.danger-primary { background: #f87171; border-color: transparent; color: white; }
  .modal-btn.danger-primary:hover { background: #ef4444; }
</style>
