<script lang="ts">
  import { onMount } from "svelte";
  import { marked } from "marked";
  import {
    IconPlus, IconDownload, IconUpload, IconTrash, IconFolder,
    IconNote, IconSearch, IconGraph, IconStar, IconStarFilled,
    IconChevronRight, IconChevronDown, IconHash, IconClock,
    IconCopy, IconCheck, IconList, IconTable, IconCheckbox,
    IconQuote, IconCode, IconPhoto, IconLink, IconMenu2,
    IconX, IconPencil, IconEye, IconLayoutSidebar,
  } from "@tabler/icons-svelte";

  let { apiKey }: { apiKey: string } = $props();

  type Note = {
    id: string;
    title: string;
    content: string;
    folderId: string | null;
    tags: string[];
    time: string;
    links: string[];
    pinned: boolean;
    icon: string;
    cover: string;
    todo: { text: string; done: boolean }[];
  };

  type Folder = {
    id: string;
    name: string;
    icon: string;
    collapsed: boolean;
  };

  let notes = $state<Note[]>([]);
  let folders = $state<Folder[]>([]);
  let selectedNoteId = $state<string | null>(null);
  let loading = $state(true);
  let searchQuery = $state("");
  let showGraph = $state(false);
  let view = $state<"edit" | "preview">("edit");
  let splitView = $state(true);
  let showSidebar = $state(true);
  let showOutline = $state(false);
  let selectedFolderId = $state<string | null>(null);
  let showSlashMenu = $state(false);
  let slashMenuPos = $state({ x: 0, y: 0 });
  let slashQuery = $state("");
  let copiedId = $state<string | null>(null);
  let editorEl = $state<HTMLTextAreaElement | null>(null);

  let selectedNote = $derived(notes.find(n => n.id === selectedNoteId) ?? null);

  // ── Slash commands ──────────────────────────────────────────────
  const SLASH_COMMANDS = [
    { id: "heading", label: "Heading", icon: "##", insert: "## " },
    { id: "bold", label: "Bold", icon: "**", insert: "**bold**" },
    { id: "italic", label: "Italic", icon: "_", insert: "_italic_" },
    { id: "code", label: "Code Block", icon: "`", insert: "```\n\n```" },
    { id: "quote", label: "Quote", icon: ">", insert: "> " },
    { id: "ul", label: "Bullet List", icon: "•", insert: "- " },
    { id: "ol", label: "Numbered List", icon: "1.", insert: "1. " },
    { id: "todo", label: "Todo Item", icon: "☐", insert: "- [ ] " },
    { id: "toggle", label: "Toggle Block", icon: "▸", insert: "<details><summary></summary>\n\n</details>" },
    { id: "callout-info", label: "Callout (Info)", icon: "ℹ", insert: "> [!info]\n> " },
    { id: "callout-warn", label: "Callout (Warning)", icon: "⚠", insert: "> [!warning]\n> " },
    { id: "callout-tip", label: "Callout (Tip)", icon: "💡", insert: "> [!tip]\n> " },
    { id: "callout-note", label: "Callout (Note)", icon: "📝", insert: "> [!note]\n> " },
    { id: "table", label: "Table", icon: "▦", insert: "| Column | Column |\n|--------|--------|\n|        |        |" },
    { id: "divider", label: "Divider", icon: "—", insert: "\n---\n" },
    { id: "link", label: "Link", icon: "🔗", insert: "[text](url)" },
    { id: "image", label: "Image", icon: "🖼", insert: "![alt](url)" },
    { id: "embed", label: "Wiki Embed", icon: "[[]]", insert: "[[]]" },
    { id: "codepen", label: "CodePen", icon: "⟨⟩", insert: "```\n// paste code here\n```" },
    { id: "math", label: "Math Block", icon: "∑", insert: "$$\n\n$$" },
  ];

  let filteredSlash = $derived(
    slashQuery
      ? SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(slashQuery.toLowerCase()))
      : SLASH_COMMANDS
  );

  // ── Wiki link rendering ────────────────────────────────────────
  function renderWikiLinks(text: string): string {
    return text.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      const target = notes.find(n => n.title.toLowerCase() === name.toLowerCase());
      if (target) return `<a class="wiki-link" data-note-id="${target.id}" href="#">${name}</a>`;
      return `<a class="wiki-link missing" href="#">${name}</a>`;
    });
  }

  function renderCallouts(text: string): string {
    return text.replace(/^>\s*\[!(info|warning|tip|note|danger|quote|example)\]\s*\n((?:>\s?.+\n?)+)/gm, (_, type, body) => {
      const cls = `callout callout-${type}`;
      const cleaned = body.replace(/^>\s?/gm, "").trim();
      return `<div class="${cls}"><div class="callout-title">${type.toUpperCase()}</div><div class="callout-body">${cleaned}</div></div>`;
    });
  }

  function renderMarkdown(content: string): string {
    let html = content;
    // Preserve code blocks
    const codeBlocks: string[] = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre class="code-block" data-lang="${lang}"><code>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`);
      return `%%CODEBLOCK_${idx}%%`;
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    // Checkboxes
    html = html.replace(/^- \[x\]\s+(.+)$/gm, '<div class="todo-item done"><span class="todo-check">✓</span><span class="todo-text">$1</span></div>');
    html = html.replace(/^- \[ \]\s+(.+)$/gm, '<div class="todo-item"><span class="todo-check">○</span><span class="todo-text">$1</span></div>');
    // Callouts
    html = renderCallouts(html);
    // Wiki links
    html = renderWikiLinks(html);
    // Headings with IDs for outline
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, title) => {
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return `<h${hashes.length} id="${id}">${title}</h${hashes.length}>`;
    });
    // Regular markdown
    html = marked.parse(html) as string;
    // Restore code blocks
    codeBlocks.forEach((block, i) => { html = html.replace(`%%CODEBLOCK_${i}%%`, block); });
    return html;
  }

  // ── Backlinks ──────────────────────────────────────────────────
  let backlinks = $derived(() => {
    if (!selectedNote) return [];
    return notes.filter(n => n.links.includes(selectedNote.title));
  });

  // ── Outline ────────────────────────────────────────────────────
  let outline = $derived(() => {
    if (!selectedNote) return [];
    const matches = selectedNote.content.match(/^(#{1,4})\s+(.+)$/gm) ?? [];
    return matches.map(m => {
      const level = m.match(/^(#{1,4})/)![0].length;
      const title = m.replace(/^#{1,4}\s+/, "");
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return { level, title, id };
    });
  });

  // ── Word count ─────────────────────────────────────────────────
  let wordCount = $derived(() => {
    if (!selectedNote) return 0;
    return selectedNote.content.trim().split(/\s+/).filter(Boolean).length;
  });

  let readingTime = $derived(() => Math.max(1, Math.ceil(wordCount() / 200)));

  // ── Extract links ──────────────────────────────────────────────
  function extractLinks(content: string): string[] {
    return (content.match(/\[\[([^\]]+)\]\]/g) ?? []).map(m => m.slice(2, -2));
  }

  // ── Extract tags ───────────────────────────────────────────────
  function extractTags(content: string): string[] {
    return [...new Set((content.match(/#([a-zA-Z0-9_]+)/g) ?? []).map(m => m.slice(1)))];
  }

  // ── All unique tags ────────────────────────────────────────────
  let allTags = $derived(() => {
    const tagSet = new Set<string>();
    for (const n of notes) for (const t of n.tags) tagSet.add(t);
    return [...tagSet].sort();
  });

  // ── Filtered notes ─────────────────────────────────────────────
  let filteredNotes = $derived(() => {
    let result = notes;
    if (selectedFolderId) result = result.filter(n => n.folderId === selectedFolderId);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    const pinned = result.filter(n => n.pinned);
    const unpinned = result.filter(n => !n.pinned);
    return [...pinned, ...unpinned].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  });

  // ── Note CRUD ──────────────────────────────────────────────────
  function createNote() {
    const title = "Untitled Note";
    const note: Note = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title, content: `# ${title}\n\nStart writing here...\n\nUse [[Note Title]] to link to other notes.\nType / for commands.`,
      folderId: selectedFolderId, tags: [], time: new Date().toISOString(), links: [],
      pinned: false, icon: "", cover: "", todo: [],
    };
    notes = [note, ...notes];
    selectedNoteId = note.id;
    saveNoteToCloud(note);
  }

  function deleteNote(id: string) {
    notes = notes.filter(n => n.id !== id);
    if (selectedNoteId === id) selectedNoteId = notes[0]?.id ?? null;
    deleteNoteFromCloud(id);
  }

  function togglePin(id: string) {
    const note = notes.find(n => n.id === id);
    if (note) { note.pinned = !note.pinned; notes = [...notes]; saveNoteToCloud(note); }
  }

  function updateNoteContent(id: string, content: string) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    note.content = content;
    const titleMatch = content.match(/^#\s+(.+)/m);
    if (titleMatch) note.title = titleMatch[1].trim();
    note.links = extractLinks(content);
    note.tags = extractTags(content);
    note.time = new Date().toISOString();
    notes = [...notes];
    saveNoteToCloud(note);
  }

  // ── Folders ────────────────────────────────────────────────────
  function createFolder() {
    const name = "New Folder";
    folders = [...folders, { id: `folder_${Date.now()}`, name, icon: "📁", collapsed: false }];
    saveFoldersToCloud();
  }

  function renameFolder(id: string, name: string) {
    const f = folders.find(f => f.id === id);
    if (f) { f.name = name; folders = [...folders]; saveFoldersToCloud(); }
  }

  function deleteFolder(id: string) {
    folders = folders.filter(f => f.id !== id);
    notes.forEach(n => { if (n.folderId === id) n.folderId = null; });
    if (selectedFolderId === id) selectedFolderId = null;
    notes = [...notes];
    saveFoldersToCloud();
  }

  function toggleFolderCollapse(id: string) {
    const f = folders.find(f => f.id === id);
    if (f) { f.collapsed = !f.collapsed; folders = [...folders]; }
  }

  // ── Slash menu ─────────────────────────────────────────────────
  function handleEditorKeydown(e: KeyboardEvent) {
    if (e.key === "/") {
      const rect = editorEl?.getBoundingClientRect();
      if (rect) {
        slashMenuPos = { x: rect.left + 40, y: rect.top + 40 };
        showSlashMenu = true;
        slashQuery = "";
      }
    } else if (e.key === "Escape") {
      showSlashMenu = false;
    } else if (showSlashMenu && e.key === "Backspace") {
      if (slashQuery.length > 0) slashQuery = slashQuery.slice(0, -1);
      else showSlashMenu = false;
    } else if (showSlashMenu && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      slashQuery += e.key;
    } else if (showSlashMenu && e.key === "Enter") {
      e.preventDefault();
      if (filteredSlash.length > 0) applySlashCommand(filteredSlash[0]);
    }
  }

  function applySlashCommand(cmd: typeof SLASH_COMMANDS[0]) {
    if (!selectedNote || !editorEl) return;
    const pos = editorEl.selectionStart;
    const before = selectedNote.content.slice(0, pos);
    const after = selectedNote.content.slice(pos);
    const newContent = before + cmd.insert + after;
    updateNoteContent(selectedNote.id, newContent);
    showSlashMenu = false;
    slashQuery = "";
    setTimeout(() => {
      editorEl.focus();
      const newPos = pos + cmd.insert.length;
      editorEl.setSelectionRange(newPos, newPos);
    }, 10);
  }

  // ── Copy ID ────────────────────────────────────────────────────
  function copyNoteId(id: string) {
    navigator.clipboard.writeText(`[[${notes.find(n => n.id === id)?.title || id}]]`);
    copiedId = id;
    setTimeout(() => { copiedId = null; }, 1500);
  }

  // ── Import/Export ──────────────────────────────────────────────
  function importMd() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".md,.markdown,.txt"; input.multiple = true;
    input.onchange = async () => {
      for (const file of Array.from(input.files ?? [])) {
        const text = await file.text();
        const title = file.name.replace(/\.(md|markdown|txt)$/, "");
        const note: Note = {
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title, content: text, folderId: selectedFolderId,
          tags: extractTags(text), time: new Date().toISOString(), links: extractLinks(text),
          pinned: false, icon: "", cover: "", todo: [],
        };
        notes = [note, ...notes]; saveNoteToCloud(note);
      }
    };
    input.click();
  }

  function exportMd() {
    if (!selectedNote) return;
    const blob = new Blob([selectedNote.content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${selectedNote.title.replace(/[^a-zA-Z0-9_\- ]/g, "_")}.md`;
    a.click();
  }

  function exportAll() {
    const zip: Record<string, string> = {};
    for (const n of notes) zip[`${n.title.replace(/[^a-zA-Z0-9_\- ]/g, "_")}.md`] = n.content;
    const blob = new Blob([JSON.stringify(zip, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "notes_export.json"; a.click();
  }

  // ── Cloud sync ─────────────────────────────────────────────────
  async function saveNoteToCloud(note: Note) {
    try {
      const fd = new FormData();
      const blob = new Blob([JSON.stringify(note)], { type: "application/json" });
      fd.append("file", blob, `_notes/${note.id}.json`);
      await fetch("/api/telegram/uploadFile", {
        method: "POST", body: fd,
        headers: { "X-Api-Key": apiKey, "X-File-Request": encodeURIComponent(`_notes/${note.id}.json`) },
      });
    } catch {}
  }

  async function deleteNoteFromCloud(id: string) {
    try { await fetch(`/api/telegram/delete?file_id=${id}`, { headers: { "X-Api-Key": apiKey } }); } catch {}
  }

  async function saveFoldersToCloud() {
    try {
      const fd = new FormData();
      const blob = new Blob([JSON.stringify(folders)], { type: "application/json" });
      fd.append("file", blob, `_notes/_folders.json`);
      await fetch("/api/telegram/uploadFile", {
        method: "POST", body: fd,
        headers: { "X-Api-Key": apiKey, "X-File-Request": encodeURIComponent("_notes/_folders.json") },
      });
    } catch {}
  }

  async function loadNotes() {
    loading = true;
    try {
      const res = await fetch(`/api/telegram/ls?api_key=${encodeURIComponent(apiKey)}`);
      if (res.ok) {
        const data = await res.json();
        const allFiles = data.files ?? [];
        const noteFiles = allFiles.filter((f: any) => f.fileName?.startsWith("_notes/") && f.fileName?.endsWith(".json"));
        const loaded: Note[] = [];
        let loadedFolders: Folder[] = [];
        for (const f of noteFiles) {
          try {
            const noteRes = await fetch(`/api/telegram/download?file_id=${f.file_id}`, { headers: { "X-Api-Key": apiKey } });
            if (noteRes.ok) {
              const noteData = await noteRes.json();
              if (f.fileName?.endsWith("_folders.json")) { loadedFolders = noteData; }
              else { loaded.push({ pinned: false, icon: "", cover: "", todo: [], ...noteData }); }
            }
          } catch {}
        }
        notes = loaded;
        folders = loadedFolders;
        if (notes.length > 0 && !selectedNoteId) selectedNoteId = notes[0].id;
      }
    } catch {}
    loading = false;
  }

  // ── Graph data ─────────────────────────────────────────────────
  let graphNodes = $derived(() => notes.map((n, i) => ({
    id: n.id, title: n.title,
    x: 250 + Math.cos(i * 2.399) * 160 + Math.random() * 20,
    y: 175 + Math.sin(i * 2.399) * 130 + Math.random() * 20,
    links: n.links.length, pinned: n.pinned,
  })));

  let graphEdges = $derived(() => {
    const edges: { from: string; to: string; toId: string | null }[] = [];
    for (const n of notes) {
      for (const link of n.links) {
        const target = notes.find(t => t.title.toLowerCase() === link.toLowerCase());
        edges.push({ from: n.id, to: link, toId: target?.id ?? null });
      }
    }
    return edges;
  });

  onMount(() => { loadNotes(); });

  function handlePreviewClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("wiki-link")) {
      e.preventDefault();
      const noteId = target.dataset.noteId;
      if (noteId) selectedNoteId = noteId;
    }
  }

  function handleTodoToggle(idx: number) {
    if (!selectedNote) return;
    const lines = selectedNote.content.split("\n");
    let todoIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^- \[[ x]\]/)) {
        if (todoIdx === idx) {
          lines[i] = lines[i].replace(/^- \[([ x])\]/, (_, mark) => `- [${mark === " " ? "x" : " "}]`);
          break;
        }
        todoIdx++;
      }
    }
    updateNoteContent(selectedNote.id, lines.join("\n"));
  }
</script>

<div class="n-root" class:sidebar-open={showSidebar}>
  <!-- Sidebar -->
  <div class="n-sidebar">
    <div class="n-sb-header">
      <button class="n-sb-toggle" onclick={() => showSidebar = !showSidebar} title="Toggle sidebar">
        <IconLayoutSidebar size={14}/>
      </button>
      <span class="n-sb-title">Notes</span>
      <button class="n-sb-btn" onclick={createNote} title="New note"><IconPlus size={14}/></button>
    </div>

    <div class="n-sb-search">
      <IconSearch size={12}/>
      <input type="text" bind:value={searchQuery} placeholder="Search notes..." class="n-sb-search-input"/>
    </div>

    <!-- Folders -->
    <div class="n-sb-section">
      <div class="n-sb-section-header">
        <span>Folders</span>
        <button class="n-sb-sm-btn" onclick={createFolder} title="New folder"><IconPlus size={11}/></button>
      </div>
      <button class="n-folder-item" class:active={selectedFolderId === null} onclick={() => selectedFolderId = null}>
        <IconFolder size={13}/> All Notes
      </button>
      {#each folders as folder}
        <button class="n-folder-item" class:active={selectedFolderId === folder.id}
          onclick={() => { selectedFolderId = folder.id; }}>
          {#if folder.collapsed}<IconChevronRight size={12}/>{:else}<IconChevronDown size={12}/>{/if}
          <span>{folder.icon} {folder.name}</span>
        </button>
      {/each}
    </div>

    <!-- Tags -->
    {#if allTags().length > 0}
      <div class="n-sb-section">
        <div class="n-sb-section-header"><span>Tags</span></div>
        <div class="n-tags">
          {#each allTags() as tag}
            <button class="n-tag" class:active={searchQuery === tag}
              onclick={() => searchQuery = searchQuery === tag ? "" : tag}>
              <IconHash size={10}/>{tag}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Note list -->
    <div class="n-sb-notes">
      {#if loading}
        <div class="n-sb-loading">Loading...</div>
      {:else if filteredNotes().length === 0}
        <div class="n-sb-empty">
          {#if searchQuery}No matches{:else}No notes yet. Click + to create one.{/if}
        </div>
      {:else}
        {#each filteredNotes() as note (note.id)}
          <div class="n-note-item" class:selected={selectedNoteId === note.id}
            onclick={() => selectedNoteId = note.id}>
            <div class="n-note-item-header">
              {#if note.pinned}<IconStarFilled size={10} class="n-pin-icon"/>{/if}
              <span class="n-note-item-title">{note.icon} {note.title}</span>
            </div>
            <div class="n-note-item-meta">
              <span><IconClock size={9}/> {new Date(note.time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              {#if note.tags.length > 0}
                <span class="n-note-item-tags">{note.tags.length} tag{note.tags.length !== 1 ? "s" : ""}</span>
              {/if}
              <button class="n-note-item-copy" onclick={(e) => { e.stopPropagation(); copyNoteId(note.id); }}
                title="Copy wiki link">
                {#if copiedId === note.id}<IconCheck size={9}/>{:else}<IconCopy size={9}/>{/if}
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Footer -->
    <div class="n-sb-footer">
      <button class="n-sb-fbtn" onclick={importMd} title="Import"><IconUpload size={11}/> Import</button>
      <button class="n-sb-fbtn" onclick={exportAll} title="Export All"><IconDownload size={11}/> Export</button>
      <button class="n-sb-fbtn" class:active={showGraph} onclick={() => showGraph = !showGraph} title="Graph"><IconGraph size={11}/></button>
    </div>
  </div>

  <!-- Main -->
  <div class="n-main">
    {#if showGraph}
      <div class="n-graph">
        <svg viewBox="0 0 500 350" class="n-graph-svg">
          {#each graphEdges() as edge}
            {#if edge.toId}
              {@const from = graphNodes().find(n => n.id === edge.from)}
              {@const to = graphNodes().find(n => n.id === edge.toId)}
              {#if from && to}
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--border)" stroke-width="1" opacity="0.4"/>
              {/if}
            {/if}
          {/each}
          {#each graphNodes() as node}
            <circle cx={node.x} cy={node.y} r={Math.max(4, 3 + node.links * 2)}
              fill={node.pinned ? "#f59e0b" : "var(--accent)"} opacity="0.8"
              class="n-graph-node"
              onclick={() => { selectedNoteId = node.id; showGraph = false; }}/>
            <text x={node.x} y={node.y + 14} text-anchor="middle" fill="var(--text-3)" font-size="8">
              {node.title.slice(0, 15)}
            </text>
          {/each}
        </svg>
      </div>

    {:else if selectedNote}
      <!-- Editor toolbar -->
      <div class="n-toolbar">
        <div class="n-toolbar-left">
          <button class="n-tb-btn" class:active={view === "edit"} onclick={() => view = "edit"}>
            <IconPencil size={13}/> Edit
          </button>
          <button class="n-tb-btn" class:active={view === "preview"} onclick={() => view = "preview"}>
            <IconEye size={13}/> Read
          </button>
          <button class="n-tb-btn" class:active={splitView} onclick={() => splitView = !splitView}>
            Split
          </button>
          <button class="n-tb-btn" class:active={showOutline} onclick={() => showOutline = !showOutline}>
            <IconList size={13}/>
          </button>
        </div>
        <div class="n-toolbar-center">
          <span class="n-tb-wordcount">{wordCount()} words · {readingTime()} min read</span>
        </div>
        <div class="n-toolbar-right">
          {#if selectedNote.tags.length > 0}
            <div class="n-tb-tags">
              {#each selectedNote.tags as tag}
                <span class="n-tb-tag">#{tag}</span>
              {/each}
            </div>
          {/if}
          <button class="n-tb-btn" onclick={() => togglePin(selectedNote.id)}
            title={selectedNote.pinned ? "Unpin" : "Pin"}>
            {#if selectedNote.pinned}<IconStarFilled size={13}/>{:else}<IconStar size={13}/>{/if}
          </button>
          <button class="n-tb-btn" onclick={exportMd} title="Export"><IconDownload size={13}/></button>
          <button class="n-tb-btn danger" onclick={() => deleteNote(selectedNote.id)} title="Delete">
            <IconTrash size={13}/>
          </button>
        </div>
      </div>

      <div class="n-editor-wrap">
        <!-- Outline panel -->
        {#if showOutline && outline().length > 0}
          <div class="n-outline">
            <div class="n-outline-title">Outline</div>
            {#each outline() as heading}
              <a class="n-outline-item" href="#{heading.id}"
                style="padding-left:{(heading.level - 1) * 12 + 4}px">
                {heading.title}
              </a>
            {/each}
          </div>
        {/if}

        <!-- Editor area -->
        <div class="n-editor-area" class:split={splitView && view === "edit"}>
          {#if view === "edit" || splitView}
            <div class="n-editor-pane">
              <textarea
                class="n-textarea"
                bind:value={selectedNote.content}
                bind:this={editorEl}
                oninput={(e) => updateNoteContent(selectedNote.id, e.currentTarget.value)}
                onkeydown={handleEditorKeydown}
                placeholder="Start writing... Use [[Note Title]] for links, / for commands"
                spellcheck="false"
              ></textarea>

              <!-- Slash menu -->
              {#if showSlashMenu}
                <div class="n-slash-menu" style="left:{slashMenuPos.x}px;top:{slashMenuPos.y}px">
                  {#each filteredSlash as cmd}
                    <button class="n-slash-item" onclick={() => applySlashCommand(cmd)}>
                      <span class="n-slash-icon">{cmd.icon}</span>
                      <span>{cmd.label}</span>
                    </button>
                  {/each}
                  {#if filteredSlash.length === 0}
                    <div class="n-slash-empty">No matching commands</div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
          {#if view === "preview" || splitView}
            <div class="n-preview-pane" onclick={handlePreviewClick}>
              <div class="n-preview-content markdown-body">
                {@html renderMarkdown(selectedNote.content)}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Todo list -->
      {#if selectedNote.content.match(/^- \[[ x]\]/m)}
        <div class="n-todos">
          <div class="n-todos-title">Checklist</div>
          {#each selectedNote.content.match(/^- \[[ x]\]\s+.+$/gm) || [] as item, i}
            {@const done = item.startsWith("- [x]")}
            {@const text = item.replace(/^- \[[ x]\]\s+/, "")}
            <button class="n-todo-item" class:done onclick={() => handleTodoToggle(i)}>
              <span class="n-todo-check">{done ? "✓" : "○"}</span>
              <span class="n-todo-text">{text}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Backlinks -->
      {#if backlinks().length > 0}
        <div class="n-backlinks">
          <span class="n-bl-title">Linked from:</span>
          {#each backlinks() as bl}
            <button class="n-bl-link" onclick={() => selectedNoteId = bl.id}>{bl.title}</button>
          {/each}
        </div>
      {/if}

    {:else}
      <div class="n-empty">
        <IconNote size={48} color="var(--text-3)"/>
        <p>Select a note or create a new one</p>
        <p class="n-empty-hint">Tip: Use [[Note Name]] to link notes, / for commands</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .n-root{display:flex;height:100%;background:var(--bg-1);color:var(--text-1)}
  .n-root:not(.sidebar-open) .n-sidebar{display:none}
  .n-root:not(.sidebar-open) .n-main{margin-left:0}

  /* ── Sidebar ── */
  .n-sidebar{width:260px;background:var(--bg-2);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0}
  .n-sb-header{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border)}
  .n-sb-toggle{background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px;border-radius:4px;display:flex}
  .n-sb-toggle:hover{color:var(--text-1);background:var(--hover)}
  .n-sb-title{font-size:13px;font-weight:700;color:var(--accent);flex:1}
  .n-sb-btn{background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px;border-radius:4px;display:flex}
  .n-sb-btn:hover{color:var(--text-1);background:var(--hover)}

  .n-sb-search{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--border);color:var(--text-3)}
  .n-sb-search-input{flex:1;background:none;border:none;color:var(--text-1);font-size:12px;outline:none}
  .n-sb-search-input::placeholder{color:var(--text-3)}

  .n-sb-section{border-bottom:1px solid var(--border);padding:6px 0}
  .n-sb-section-header{display:flex;align-items:center;justify-content:space-between;padding:2px 10px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3)}
  .n-sb-sm-btn{background:none;border:none;color:var(--text-3);cursor:pointer;padding:2px;border-radius:3px;display:flex}
  .n-sb-sm-btn:hover{color:var(--accent)}

  .n-folder-item{display:flex;align-items:center;gap:6px;width:100%;padding:4px 10px;background:none;border:none;color:var(--text-2);font-size:12px;cursor:pointer;font-family:'Geist',sans-serif;text-align:left}
  .n-folder-item:hover{background:var(--hover);color:var(--text-1)}
  .n-folder-item.active{color:var(--accent);background:var(--accent-soft)}

  .n-tags{display:flex;flex-wrap:wrap;gap:4px;padding:0 10px}
  .n-tag{display:flex;align-items:center;gap:3px;background:var(--bg-3);border:none;color:var(--text-3);font-size:10px;padding:2px 6px;border-radius:10px;cursor:pointer;font-family:'Geist',sans-serif}
  .n-tag:hover{color:var(--accent)}
  .n-tag.active{background:var(--accent-soft);color:var(--accent)}

  .n-sb-notes{flex:1;overflow-y:auto}
  .n-note-item{padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);transition:.1s}
  .n-note-item:hover{background:var(--bg-3)}
  .n-note-item.selected{background:var(--accent-soft);border-left:3px solid var(--accent)}
  .n-note-item-header{display:flex;align-items:center;gap:4px}
  .n-note-item-title{font-size:12px;font-weight:600;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
  .n-note-item-meta{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-3);margin-top:2px}
  .n-note-item-tags{color:var(--accent)}
  .n-note-item-copy{background:none;border:none;color:var(--text-3);cursor:pointer;padding:2px;border-radius:3px;display:flex;opacity:0;transition:.1s}
  .n-note-item:hover .n-note-item-copy{opacity:1}
  .n-note-item-copy:hover{color:var(--accent)}

  .n-sb-loading,.n-sb-empty{padding:20px;text-align:center;color:var(--text-3);font-size:11px}

  .n-sb-footer{display:flex;gap:4px;padding:6px 8px;border-top:1px solid var(--border)}
  .n-sb-fbtn{flex:1;display:flex;align-items:center;justify-content:center;gap:3px;padding:4px;border-radius:4px;border:1px solid var(--border);background:none;color:var(--text-3);font-size:10px;cursor:pointer;font-family:'Geist',sans-serif}
  .n-sb-fbtn:hover{border-color:var(--accent);color:var(--text-1)}
  .n-sb-fbtn.active{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}

  /* ── Main ── */
  .n-main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}

  .n-toolbar{display:flex;align-items:center;justify-content:space-between;padding:5px 12px;border-bottom:1px solid var(--border);background:var(--bg-2);gap:8px;flex-wrap:wrap}
  .n-toolbar-left,.n-toolbar-right{display:flex;align-items:center;gap:3px}
  .n-toolbar-center{flex:1;text-align:center}
  .n-tb-btn{display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:5px;border:none;background:none;color:var(--text-3);font-size:11px;font-weight:500;font-family:'Geist',sans-serif;cursor:pointer;transition:.1s}
  .n-tb-btn:hover{background:var(--hover);color:var(--text-1)}
  .n-tb-btn.active{color:var(--accent);background:var(--accent-soft)}
  .n-tb-btn.danger:hover{color:var(--red);background:rgba(248,113,113,.1)}
  .n-tb-wordcount{font-size:10px;color:var(--text-3);font-family:'Geist Mono',monospace}
  .n-tb-tags{display:flex;gap:3px;margin-right:6px}
  .n-tb-tag{font-size:9px;color:var(--accent);background:var(--accent-soft);padding:1px 5px;border-radius:8px}

  .n-editor-wrap{flex:1;display:flex;overflow:hidden;position:relative}
  .n-outline{width:180px;border-right:1px solid var(--border);background:var(--bg-2);overflow-y:auto;padding:10px 0;flex-shrink:0}
  .n-outline-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);padding:0 10px 6px}
  .n-outline-item{display:block;padding:3px 10px;font-size:11px;color:var(--text-2);text-decoration:none;transition:.1s;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .n-outline-item:hover{color:var(--accent);background:var(--hover)}

  .n-editor-area{flex:1;display:flex;overflow:hidden}
  .n-editor-area.split > .n-editor-pane{border-right:1px solid var(--border)}
  .n-editor-pane{flex:1;display:flex;flex-direction:column;position:relative}
  .n-textarea{flex:1;background:var(--bg-1);border:none;color:var(--text-1);padding:16px;font-family:'Geist Mono','Fira Code',monospace;font-size:13px;line-height:1.7;resize:none;outline:none}
  .n-textarea::placeholder{color:var(--text-3)}
  .n-preview-pane{flex:1;overflow-y:auto;background:var(--bg-1)}
  .n-preview-content{padding:16px;font-size:14px;line-height:1.7}

  /* ── Slash menu ── */
  .n-slash-menu{position:fixed;z-index:200;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3);max-height:260px;overflow-y:auto;width:220px;padding:4px}
  .n-slash-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border-radius:6px;border:none;background:none;color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;text-align:left}
  .n-slash-item:hover{background:var(--hover);color:var(--text-1)}
  .n-slash-icon{width:24px;text-align:center;font-size:11px;font-weight:700;color:var(--accent);background:var(--accent-soft);border-radius:4px;padding:2px 0}
  .n-slash-empty{padding:10px;text-align:center;color:var(--text-3);font-size:11px}

  /* ── Todo ── */
  .n-todos{padding:8px 16px;border-top:1px solid var(--border);background:var(--bg-2)}
  .n-todos-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);margin-bottom:4px}
  .n-todo-item{display:flex;align-items:center;gap:6px;width:100%;padding:3px 0;background:none;border:none;color:var(--text-1);font-size:12px;cursor:pointer;font-family:'Geist',sans-serif;text-align:left}
  .n-todo-item:hover{color:var(--accent)}
  .n-todo-check{font-size:13px;width:16px;text-align:center}
  .n-todo-item.done .n-todo-text{text-decoration:line-through;color:var(--text-3)}

  /* ── Markdown ── */
  .n-preview-content :global(h1){font-size:24px;font-weight:700;color:var(--text-1);margin:0 0 12px;border-bottom:1px solid var(--border);padding-bottom:8px}
  .n-preview-content :global(h2){font-size:20px;font-weight:600;color:var(--text-1);margin:16px 0 8px}
  .n-preview-content :global(h3){font-size:16px;font-weight:600;color:var(--text-1);margin:12px 0 6px}
  .n-preview-content :global(p){margin:0 0 8px;color:var(--text-2)}
  .n-preview-content :global(.inline-code){background:var(--bg-3);padding:1px 4px;border-radius:3px;font-size:12px;color:var(--accent);font-family:'Geist Mono',monospace}
  .n-preview-content :global(.code-block){background:var(--bg-3);border:1px solid var(--border);border-radius:6px;padding:12px;overflow-x:auto;margin:8px 0}
  .n-preview-content :global(.code-block code){background:none;padding:0;font-family:'Geist Mono',monospace;font-size:12px}
  .n-preview-content :global(ul),.n-preview-content :global(ol){margin:4px 0 8px 20px;color:var(--text-2)}
  .n-preview-content :global(li){margin:2px 0}
  .n-preview-content :global(blockquote){border-left:3px solid var(--accent);margin:8px 0;padding:4px 12px;color:var(--text-3);background:var(--accent-soft);border-radius:0 4px 4px 0}
  .n-preview-content :global(a){color:var(--accent);text-decoration:none}
  .n-preview-content :global(a:hover){text-decoration:underline}
  .n-preview-content :global(.wiki-link){color:var(--accent);cursor:pointer;border-bottom:1px dashed var(--accent)}
  .n-preview-content :global(.wiki-link.missing){color:var(--red);border-bottom-color:var(--red)}
  .n-preview-content :global(table){border-collapse:collapse;margin:8px 0;width:100%}
  .n-preview-content :global(th),.n-preview-content :global(td){border:1px solid var(--border);padding:6px 10px;text-align:left;font-size:12px}
  .n-preview-content :global(th){background:var(--bg-3);font-weight:600}
  .n-preview-content :global(hr){border:none;border-top:1px solid var(--border);margin:16px 0}
  .n-preview-content :global(img){max-width:100%;border-radius:6px}
  .n-preview-content :global(.todo-item){display:flex;align-items:center;gap:6px;padding:2px 0;font-size:13px}
  .n-preview-content :global(.todo-check){width:16px;text-align:center;font-size:13px}
  .n-preview-content :global(.todo-item.done .todo-text){text-decoration:line-through;color:var(--text-3)}
  .n-preview-content :global(.callout){border:1px solid var(--border);border-radius:8px;margin:10px 0;overflow:hidden}
  .n-preview-content :global(.callout-title){padding:6px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)}
  .n-preview-content :global(.callout-body){padding:8px 10px;font-size:13px;color:var(--text-2)}
  .n-preview-content :global(.callout-info){border-color:#60a5fa}
  .n-preview-content :global(.callout-info .callout-title){background:rgba(96,165,250,.1);color:#60a5fa}
  .n-preview-content :global(.callout-warning){border-color:#f59e0b}
  .n-preview-content :global(.callout-warning .callout-title){background:rgba(245,158,11,.1);color:#f59e0b}
  .n-preview-content :global(.callout-tip){border-color:#4ade80}
  .n-preview-content :global(.callout-tip .callout-title){background:rgba(74,222,128,.1);color:#4ade80}
  .n-preview-content :global(.callout-note){border-color:var(--accent)}
  .n-preview-content :global(.callout-note .callout-title){background:var(--accent-soft);color:var(--accent)}
  .n-preview-content :global(.callout-danger){border-color:#f87171}
  .n-preview-content :global(.callout-danger .callout-title){background:rgba(248,113,113,.1);color:#f87171}

  /* ── Graph ── */
  .n-graph{flex:1;display:flex;align-items:center;justify-content:center;padding:20px}
  .n-graph-svg{width:100%;max-width:600px}
  .n-graph-node{cursor:pointer;transition:.1s}
  .n-graph-node:hover{opacity:1;filter:brightness(1.3)}

  /* ── Backlinks ── */
  .n-backlinks{display:flex;align-items:center;gap:6px;padding:6px 12px;border-top:1px solid var(--border);background:var(--bg-2);flex-wrap:wrap}
  .n-bl-title{font-size:10px;color:var(--text-3)}
  .n-bl-link{background:var(--bg-3);border:none;color:var(--accent);font-size:10px;padding:2px 8px;border-radius:10px;cursor:pointer}
  .n-bl-link:hover{background:var(--accent-soft)}

  /* ── Empty ── */
  .n-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--text-3)}
  .n-empty p{font-size:13px}
  .n-empty-hint{font-size:11px;color:var(--text-3);opacity:.6}

  :global(.n-pin-icon){color:#f59e0b}

  @media(max-width:700px){
    .n-sidebar{width:200px}
    .n-editor-area.split{flex-direction:column}
    .n-editor-area.split > .n-editor-pane{border-right:none;border-bottom:1px solid var(--border)}
    .n-outline{display:none}
    .n-toolbar-center{display:none}
  }
</style>
