<script lang="ts">
  import { onMount } from "svelte";
  import { marked } from "marked";
  import {
    IconPlus, IconDownload, IconUpload, IconTrash, IconFolder,
    IconNote, IconSearch, IconArrowLeft, IconWorld, IconGraph,
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
  };

  let notes = $state<Note[]>([]);
  let selectedNoteId = $state<string | null>(null);
  let loading = $state(true);
  let searchQuery = $state("");
  let showGraph = $state(false);
  let view = $state<"edit" | "preview">("edit");
  let splitView = $state(true);

  let selectedNote = $derived(notes.find(n => n.id === selectedNoteId) ?? null);

  // ── Wiki link rendering ──────────────────────────────────────────────
  function renderWikiLinks(text: string): string {
    return text.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      const target = notes.find(n => n.title.toLowerCase() === name.toLowerCase());
      if (target) {
        return `<a class="wiki-link" data-note-id="${target.id}" href="#">${name}</a>`;
      }
      return `<a class="wiki-link missing" href="#">${name}</a>`;
    });
  }

  function renderMarkdown(content: string): string {
    const withWikiLinks = renderWikiLinks(content);
    return marked.parse(withWikiLinks) as string;
  }

  // ── Backlinks ────────────────────────────────────────────────────────
  let backlinks = $derived(() => {
    if (!selectedNote) return [];
    return notes.filter(n => n.links.includes(selectedNote.title));
  });

  // ── Extract links from content ───────────────────────────────────────
  function extractLinks(content: string): string[] {
    const matches = content.match(/\[\[([^\]]+)\]\]/g) ?? [];
    return matches.map(m => m.slice(2, -2));
  }

  // ── Extract tags from content ────────────────────────────────────────
  function extractTags(content: string): string[] {
    const matches = content.match(/#([a-zA-Z0-9_]+)/g) ?? [];
    return [...new Set(matches.map(m => m.slice(1)))];
  }

  // ── All unique tags ──────────────────────────────────────────────────
  let allTags = $derived(() => {
    const tagSet = new Set<string>();
    for (const n of notes) {
      for (const t of n.tags) tagSet.add(t);
    }
    return [...tagSet].sort();
  });

  // ── Filtered notes ───────────────────────────────────────────────────
  let filteredNotes = $derived(() => {
    let result = notes;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  });

  // ── Note CRUD ────────────────────────────────────────────────────────
  function createNote() {
    const title = `Untitled Note`;
    const note: Note = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      content: `# ${title}\n\nStart writing here...\n\nUse [[Note Title]] to link to other notes.`,
      folderId: null,
      tags: [],
      time: new Date().toISOString(),
      links: [],
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

  function updateNoteContent(id: string, content: string) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    note.content = content;
    // Auto-extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)/m);
    if (titleMatch) note.title = titleMatch[1].trim();
    note.links = extractLinks(content);
    note.tags = extractTags(content);
    note.time = new Date().toISOString();
    notes = [...notes];
    saveNoteToCloud(note);
  }

  function importMd() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt";
    input.multiple = true;
    input.onchange = async () => {
      for (const file of Array.from(input.files ?? [])) {
        const text = await file.text();
        const title = file.name.replace(/\.(md|markdown|txt)$/, "");
        const note: Note = {
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title,
          content: text,
          folderId: null,
          tags: extractTags(text),
          time: new Date().toISOString(),
          links: extractLinks(text),
        };
        notes = [note, ...notes];
        saveNoteToCloud(note);
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
    for (const n of notes) {
      zip[`${n.title.replace(/[^a-zA-Z0-9_\- ]/g, "_")}.md`] = n.content;
    }
    const blob = new Blob([JSON.stringify(zip, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "notes_export.json";
    a.click();
  }

  // ── Cloud sync ───────────────────────────────────────────────────────
  async function saveNoteToCloud(note: Note) {
    try {
      const fd = new FormData();
      const blob = new Blob([JSON.stringify(note)], { type: "application/json" });
      fd.append("file", blob, `_notes/${note.id}.json`);
      await fetch("/api/telegram/uploadFile", {
        method: "POST",
        body: fd,
        headers: { "X-Api-Key": apiKey, "X-File-Request": encodeURIComponent(`_notes/${note.id}.json`) },
      });
    } catch {}
  }

  async function deleteNoteFromCloud(id: string) {
    try {
      await fetch(`/api/telegram/delete?file_id=${id}`, {
        headers: { "X-Api-Key": apiKey },
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
        for (const f of noteFiles) {
          try {
            const noteRes = await fetch(`/api/telegram/download?file_id=${f.file_id}`, {
              headers: { "X-Api-Key": apiKey },
            });
            if (noteRes.ok) {
              const noteData = await noteRes.json();
              loaded.push(noteData);
            }
          } catch {}
        }
        notes = loaded;
        if (notes.length > 0 && !selectedNoteId) {
          selectedNoteId = notes[0].id;
        }
      }
    } catch {}
    loading = false;
  }

  // ── Graph data ───────────────────────────────────────────────────────
  let graphNodes = $derived(() => {
    return notes.map((n, i) => ({
      id: n.id,
      title: n.title,
      x: 200 + Math.cos(i * 2.399) * 150 + Math.random() * 20,
      y: 150 + Math.sin(i * 2.399) * 120 + Math.random() * 20,
      links: n.links.length,
    }));
  });

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

  onMount(() => {
    loadNotes();
  });

  // ── Handle wiki link clicks in preview ───────────────────────────────
  function handlePreviewClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("wiki-link")) {
      e.preventDefault();
      const noteId = target.dataset.noteId;
      if (noteId) selectedNoteId = noteId;
    }
  }
</script>

<div class="notes-root">
  <!-- Sidebar -->
  <div class="notes-sidebar">
    <div class="notes-sidebar-header">
      <span class="notes-logo">Notes</span>
      <button class="notes-icon-btn" onclick={createNote} title="New note"><IconPlus size={14}/></button>
    </div>

    <div class="notes-search">
      <IconSearch size={12}/>
      <input type="text" bind:value={searchQuery} placeholder="Search notes..." class="notes-search-input"/>
    </div>

    {#if allTags().length > 0}
      <div class="notes-tags">
        {#each allTags() as tag}
          <button class="notes-tag" class:active={searchQuery === tag} onclick={() => searchQuery = searchQuery === tag ? "" : tag}>
            #{tag}
          </button>
        {/each}
      </div>
    {/if}

    <div class="notes-list">
      {#if loading}
        <div class="notes-loading">Loading...</div>
      {:else if filteredNotes().length === 0}
        <div class="notes-empty">
          {#if searchQuery}No matches{:else}No notes yet. Click + to create one.{/if}
        </div>
      {:else}
        {#each filteredNotes() as note (note.id)}
          <div class="notes-list-item" class:selected={selectedNoteId === note.id} onclick={() => selectedNoteId = note.id}>
            <div class="notes-item-title">{note.title}</div>
            <div class="notes-item-meta">
              {new Date(note.time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {#if note.tags.length > 0}
                <span class="notes-item-tags">{note.tags.length} tag{note.tags.length !== 1 ? "s" : ""}</span>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <div class="notes-sidebar-footer">
      <button class="notes-footer-btn" onclick={importMd} title="Import .md files"><IconUpload size={12}/> Import</button>
      <button class="notes-footer-btn" onclick={exportAll} title="Export all notes"><IconDownload size={12}/> Export All</button>
      <button class="notes-footer-btn" class:active={showGraph} onclick={() => showGraph = !showGraph} title="Graph view"><IconGraph size={12}/></button>
    </div>
  </div>

  <!-- Main content -->
  <div class="notes-main">
    {#if showGraph}
      <!-- Graph View -->
      <div class="notes-graph">
        <svg viewBox="0 0 500 350" class="notes-graph-svg">
          {#each graphEdges() as edge}
            {#if edge.toId}
              {@const fromNode = graphNodes().find(n => n.id === edge.from)}
              {@const toNode = graphNodes().find(n => n.id === edge.toId)}
              {#if fromNode && toNode}
                <line x1={fromNode.x} y1={fromNode.y} x2={toNode.x} y2={toNode.y} stroke="var(--border)" stroke-width="1" opacity="0.5"/>
              {/if}
            {/if}
          {/each}
          {#each graphNodes() as node}
            <circle cx={node.x} cy={node.y} r={Math.max(4, 3 + node.links * 2)} fill="var(--accent)" opacity="0.8" class="notes-graph-node" onclick={() => { selectedNoteId = node.id; showGraph = false; }}/>
            <text x={node.x} y={node.y + 14} text-anchor="middle" fill="var(--text-3)" font-size="8">{node.title.slice(0, 15)}</text>
          {/each}
        </svg>
      </div>
    {:else if selectedNote}
      <!-- Editor toolbar -->
      <div class="notes-editor-toolbar">
        <div class="notes-toolbar-left">
          <button class="notes-icon-btn" class:active={view === "edit"} onclick={() => view = "edit"}>Edit</button>
          <button class="notes-icon-btn" class:active={view === "preview"} onclick={() => view = "preview"}>Preview</button>
          <button class="notes-icon-btn" class:active={splitView} onclick={() => splitView = !splitView}>Split</button>
        </div>
        <div class="notes-toolbar-right">
          {#if selectedNote.tags.length > 0}
            <div class="notes-toolbar-tags">
              {#each selectedNote.tags as tag}
                <span class="notes-toolbar-tag">#{tag}</span>
              {/each}
            </div>
          {/if}
          <button class="notes-icon-btn" onclick={exportMd} title="Export as .md"><IconDownload size={12}/></button>
          <button class="notes-icon-btn danger" onclick={() => deleteNote(selectedNote.id)} title="Delete note"><IconTrash size={12}/></button>
        </div>
      </div>

      <!-- Editor area -->
      <div class="notes-editor-area" class:split={splitView && view === "edit"}>
        {#if view === "edit" || splitView}
          <div class="notes-editor-pane">
            <textarea
              class="notes-textarea"
              value={selectedNote.content}
              oninput={(e) => updateNoteContent(selectedNote.id, e.currentTarget.value)}
              placeholder="Write your note... Use [[Note Title]] to link to other notes."
              spellcheck="false"
            ></textarea>
          </div>
        {/if}
        {#if view === "preview" || splitView}
          <div class="notes-preview-pane" onclick={handlePreviewClick}>
            <div class="notes-preview-content markdown-body">
              {@html renderMarkdown(selectedNote.content)}
            </div>
          </div>
        {/if}
      </div>

      <!-- Backlinks -->
      {#if backlinks().length > 0}
        <div class="notes-backlinks">
          <span class="notes-backlinks-title">Linked from:</span>
          {#each backlinks() as bl}
            <button class="notes-backlink" onclick={() => selectedNoteId = bl.id}>{bl.title}</button>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="notes-empty-state">
        <IconNote size={48} color="var(--text-3)"/>
        <p>Select a note or create a new one</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .notes-root { display: flex; height: 100%; background: var(--bg-1); color: var(--text-1); }

  /* ── Sidebar ── */
  .notes-sidebar { width: 240px; background: var(--bg-2); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .notes-sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .notes-logo { font-size: 13px; font-weight: 700; color: var(--accent); }
  .notes-icon-btn { background: none; border: none; color: var(--text-3); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 11px; display: flex; align-items: center; gap: 4px; transition: .1s; }
  .notes-icon-btn:hover { background: var(--bg-3); color: var(--text-1); }
  .notes-icon-btn.active { color: var(--accent); background: var(--accent-soft); }
  .notes-icon-btn.danger:hover { color: var(--red); }

  .notes-search { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-bottom: 1px solid var(--border); color: var(--text-3); }
  .notes-search-input { flex: 1; background: none; border: none; color: var(--text-1); font-size: 12px; outline: none; }
  .notes-search-input::placeholder { color: var(--text-3); }

  .notes-tags { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 12px; border-bottom: 1px solid var(--border); }
  .notes-tag { background: var(--bg-3); border: none; color: var(--text-3); font-size: 10px; padding: 2px 6px; border-radius: 10px; cursor: pointer; }
  .notes-tag:hover { color: var(--accent); }
  .notes-tag.active { background: var(--accent-soft); color: var(--accent); }

  .notes-list { flex: 1; overflow-y: auto; }
  .notes-list-item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border); transition: .1s; }
  .notes-list-item:hover { background: var(--bg-3); }
  .notes-list-item.selected { background: var(--accent-soft); border-left: 3px solid var(--accent); }
  .notes-item-title { font-size: 12px; font-weight: 600; color: var(--text-1); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .notes-item-meta { font-size: 10px; color: var(--text-3); display: flex; gap: 8px; }
  .notes-item-tags { color: var(--accent); }

  .notes-loading, .notes-empty { padding: 20px; text-align: center; color: var(--text-3); font-size: 11px; }

  .notes-sidebar-footer { display: flex; gap: 4px; padding: 8px; border-top: 1px solid var(--border); }
  .notes-footer-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 4px; border-radius: 4px; border: 1px solid var(--border); background: none; color: var(--text-3); font-size: 10px; cursor: pointer; }
  .notes-footer-btn:hover { border-color: var(--accent); color: var(--text-1); }
  .notes-footer-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

  /* ── Main ── */
  .notes-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  .notes-editor-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid var(--border); background: var(--bg-2); }
  .notes-toolbar-left, .notes-toolbar-right { display: flex; align-items: center; gap: 4px; }
  .notes-toolbar-tags { display: flex; gap: 4px; margin-right: 8px; }
  .notes-toolbar-tag { font-size: 10px; color: var(--accent); background: var(--accent-soft); padding: 1px 6px; border-radius: 8px; }

  .notes-editor-area { flex: 1; display: flex; overflow: hidden; }
  .notes-editor-area.split > .notes-editor-pane { border-right: 1px solid var(--border); }
  .notes-editor-pane { flex: 1; display: flex; flex-direction: column; }
  .notes-textarea { flex: 1; background: var(--bg-1); border: none; color: var(--text-1); padding: 16px; font-family: 'Geist Mono', 'Fira Code', monospace; font-size: 13px; line-height: 1.6; resize: none; outline: none; }
  .notes-textarea::placeholder { color: var(--text-3); }
  .notes-preview-pane { flex: 1; overflow-y: auto; background: var(--bg-1); }
  .notes-preview-content { padding: 16px; font-size: 14px; line-height: 1.7; }

  /* ── Markdown styles ── */
  .notes-preview-content :global(h1) { font-size: 24px; font-weight: 700; color: var(--text-1); margin: 0 0 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  .notes-preview-content :global(h2) { font-size: 20px; font-weight: 600; color: var(--text-1); margin: 16px 0 8px; }
  .notes-preview-content :global(h3) { font-size: 16px; font-weight: 600; color: var(--text-1); margin: 12px 0 6px; }
  .notes-preview-content :global(p) { margin: 0 0 8px; color: var(--text-2); }
  .notes-preview-content :global(code) { background: var(--bg-3); padding: 1px 4px; border-radius: 3px; font-size: 12px; color: var(--accent); font-family: 'Geist Mono', monospace; }
  .notes-preview-content :global(pre) { background: var(--bg-3); border: 1px solid var(--border); border-radius: 6px; padding: 12px; overflow-x: auto; margin: 8px 0; }
  .notes-preview-content :global(pre code) { background: none; padding: 0; }
  .notes-preview-content :global(ul), .notes-preview-content :global(ol) { margin: 4px 0 8px 20px; color: var(--text-2); }
  .notes-preview-content :global(li) { margin: 2px 0; }
  .notes-preview-content :global(blockquote) { border-left: 3px solid var(--accent); margin: 8px 0; padding: 4px 12px; color: var(--text-3); background: var(--accent-soft); border-radius: 0 4px 4px 0; }
  .notes-preview-content :global(a) { color: var(--accent); text-decoration: none; }
  .notes-preview-content :global(a:hover) { text-decoration: underline; }
  .notes-preview-content :global(:global(.wiki-link)) { color: var(--accent); cursor: pointer; border-bottom: 1px dashed var(--accent); }
  .notes-preview-content :global(:global(.wiki-link.missing)) { color: var(--red); border-bottom-color: var(--red); }
  .notes-preview-content :global(table) { border-collapse: collapse; margin: 8px 0; width: 100%; }
  .notes-preview-content :global(th), .notes-preview-content :global(td) { border: 1px solid var(--border); padding: 6px 10px; text-align: left; font-size: 12px; }
  .notes-preview-content :global(th) { background: var(--bg-3); font-weight: 600; }
  .notes-preview-content :global(hr) { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
  .notes-preview-content :global(img) { max-width: 100%; border-radius: 6px; }

  /* ── Graph ── */
  .notes-graph { flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .notes-graph-svg { width: 100%; max-width: 600px; }
  .notes-graph-node { cursor: pointer; transition: .1s; }
  .notes-graph-node:hover { opacity: 1; filter: brightness(1.3); }

  /* ── Backlinks ── */
  .notes-backlinks { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-top: 1px solid var(--border); background: var(--bg-2); }
  .notes-backlinks-title { font-size: 10px; color: var(--text-3); }
  .notes-backlink { background: var(--bg-3); border: none; color: var(--accent); font-size: 10px; padding: 2px 8px; border-radius: 10px; cursor: pointer; }
  .notes-backlink:hover { background: var(--accent-soft); }

  /* ── Empty state ── */
  .notes-empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-3); }
  .notes-empty-state p { font-size: 13px; }

  @media (max-width: 700px) {
    .notes-sidebar { width: 180px; }
    .notes-editor-area.split { flex-direction: column; }
    .notes-editor-area.split > .notes-editor-pane { border-right: none; border-bottom: 1px solid var(--border); }
  }
</style>
