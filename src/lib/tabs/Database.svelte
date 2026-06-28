<script lang="ts">
  import { onMount } from 'svelte';
  import {
    IconDatabase, IconPlus, IconUpload, IconDownload, IconTrash,
    IconRefresh, IconSearch, IconTable, IconStar, IconStarFilled,
    IconChevronRight, IconPlayerPlay, IconX, IconCheck, IconEdit,
    IconFolder, IconCode,
  } from '@tabler/icons-svelte';
  import { openDatabase, getSchema, query as sqlQuery, type Database as SqlDb } from '$lib/sql';

  let { apiKey }: { apiKey: string } = $props();

  type DbRecord = {
    dbId: string; name: string; description?: string; totalBytes: number;
    time: string; _type: 'database'; favorite?: boolean;
  };
  type TableInfo = { name: string; columns: { name: string; type: string; notnull: boolean; pk: boolean }[]; indexes: { name: string; columns: string[] }[] };

  let databases = $state<DbRecord[]>([]);
  let loading = $state(false);
  let openedDb = $state<DbRecord | null>(null);
  let sqlDb = $state<SqlDb | null>(null);
  let schema = $state<TableInfo[]>([]);
  let activeTable = $state<string | null>(null);
  let tableData = $state<{ columns: string[]; values: any[][] } | null>(null);
  let tablePage = $state(0);
  const PAGE_SIZE = 50;

  let sqlInput = $state('');
  let queryResult = $state<{ columns: string[]; values: any[][] } | null>(null);
  let queryError = $state('');
  let running = $state(false);

  let creating = $state(false);
  let newDbName = $state('');
  let renamingDb = $state<string | null>(null);
  let renameValue = $state('');
  let activePanel = $state<'schema' | 'query'>('schema');

  onMount(() => { loadDatabases(); });

  async function loadDatabases() {
    loading = true;
    try {
      const res = await fetch('/api/database', { headers: { 'X-Api-Key': apiKey } });
      const data = await res.json();
      databases = (data.databases || []).sort((a: DbRecord, b: DbRecord) =>
        (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || new Date(b.time).getTime() - new Date(a.time).getTime()
      );
    } finally { loading = false; }
  }

  async function createDatabase() {
    const name = newDbName.trim() || 'Untitled DB';
    newDbName = ''; creating = false;
    const res = await fetch('/api/database', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name })
    });
    const data = await res.json();
    if (data.database) databases = [data.database, ...databases];
  }

  async function importDatabase() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sqlite,.db,.sqlite3';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await fetch('/api/database', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', name: file.name.replace(/\.(sqlite|db|sqlite3)$/, ''), data: base64 })
      });
      const data = await res.json();
      if (data.database) databases = [data.database, ...databases];
    };
    input.click();
  }

  async function deleteDb(dbId: string) {
    await fetch('/api/database', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', dbId })
    });
    databases = databases.filter(d => d.dbId !== dbId);
    if (openedDb?.dbId === dbId) closeDb();
  }

  async function toggleFavorite(dbId: string) {
    await fetch('/api/database', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggleFavorite', dbId })
    });
    databases = databases.map(d => d.dbId === dbId ? { ...d, favorite: !d.favorite } : d);
  }

  async function renameDb(dbId: string) {
    const name = renameValue.trim();
    if (!name) return;
    renamingDb = null;
    await fetch('/api/database', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename', dbId, name })
    });
    databases = databases.map(d => d.dbId === dbId ? { ...d, name } : d);
    if (openedDb?.dbId === dbId) openedDb = { ...openedDb, name };
  }

  async function downloadDb(db: DbRecord) {
    const res = await fetch('/api/database', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'download', dbId: db.dbId })
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${db.name}.sqlite`; a.click();
    URL.revokeObjectURL(url);
  }

  async function openDb(db: DbRecord) {
    openedDb = db;
    activeTable = null;
    tableData = null;
    queryResult = null;
    queryError = '';
    sqlInput = '';
    activePanel = 'schema';

    const res = await fetch('/api/database', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'download', dbId: db.dbId })
    });
    const buf = await res.arrayBuffer();
    sqlDb = await openDatabase(new Uint8Array(buf));
    schema = getSchema(sqlDb);
  }

  function closeDb() {
    sqlDb?.close();
    sqlDb = null;
    openedDb = null;
    schema = [];
    activeTable = null;
    tableData = null;
    queryResult = null;
  }

  async function selectTable(tableName: string) {
    if (!sqlDb) return;
    activeTable = tableName;
    activePanel = 'schema';
    tablePage = 0;
    try {
      const result = sqlQuery(sqlDb, `SELECT * FROM "${tableName}"`);
      tableData = result;
    } catch { tableData = { columns: [], values: [] }; }
  }

  function runQuery() {
    if (!sqlDb || !sqlInput.trim()) return;
    running = true;
    queryError = '';
    queryResult = null;
    try {
      const result = sqlQuery(sqlDb, sqlInput.trim());
      queryResult = result;
      schema = getSchema(sqlDb);
      if (activeTable) {
        const refreshed = sqlQuery(sqlDb, `SELECT * FROM "${activeTable}"`);
        tableData = refreshed;
      }
    } catch (e: any) {
      queryError = e.message || 'Query failed';
    } finally { running = false; }
  }

  async function saveDb() {
    if (!sqlDb || !openedDb) return;
    const data = sqlDb.export();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
    await fetch('/api/database', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import', name: openedDb.name, data: base64 })
    });
  }

  function handleQueryKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); }
  }

  function formatBytes(b: number) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  let paginatedValues = $derived((() => {
    if (!tableData) return [];
    const start = tablePage * PAGE_SIZE;
    return tableData.values.slice(start, start + PAGE_SIZE);
  })());
  let totalPages = $derived((() => {
    if (!tableData) return 0;
    return Math.ceil(tableData.values.length / PAGE_SIZE);
  })());
</script>

<div class="db-root">
  {#if !openedDb}
    <!-- ═══ BOX GRID VIEW ═══ -->
    <div class="db-header">
      <div class="db-title">
        <IconDatabase size={18} stroke={1.5} />
        <span>Databases</span>
        <span class="db-count">{databases.length}</span>
      </div>
      <div class="db-actions">
        <button class="db-btn" onclick={() => creating = true}>
          <IconPlus size={14} /> New
        </button>
        <button class="db-btn" onclick={importDatabase}>
          <IconUpload size={14} /> Import
        </button>
          <button class="db-btn-icon" onclick={loadDatabases} title="Refresh">
            <span class:spinning={loading}><IconRefresh size={14} /></span>
          </button>
      </div>
    </div>

    {#if creating}
      <div class="create-form">
        <input type="text" placeholder="Database name..." bind:value={newDbName}
          onkeydown={(e) => { if (e.key === 'Enter') createDatabase(); if (e.key === 'Escape') creating = false; }}
          autofocus />
        <button class="db-btn accent" onclick={createDatabase}>Create</button>
        <button class="db-btn ghost" onclick={() => creating = false}>Cancel</button>
      </div>
    {/if}

    {#if loading && !databases.length}
      <div class="db-empty">Loading...</div>
    {:else if !databases.length}
      <div class="db-empty">
        <IconDatabase size={48} stroke={1} />
        <p>No databases yet</p>
        <p class="db-empty-sub">Create a new one or import an existing .sqlite file</p>
      </div>
    {:else}
      <div class="db-grid">
        {#each databases as db (db.dbId)}
          <div class="db-box" class:favorite={db.favorite}>
            <div class="db-box-header">
              <button class="db-box-name" onclick={() => openDb(db)}>
                <IconDatabase size={16} />
                {db.name}
              </button>
              <button class="star-btn" onclick={() => toggleFavorite(db.dbId)}>
                {#if db.favorite}<IconStarFilled size={14} />{:else}<IconStar size={14} />{/if}
              </button>
            </div>
            {#if db.description}
              <div class="db-box-desc">{db.description}</div>
            {/if}
            <div class="db-box-meta">
              <span>{formatBytes(db.totalBytes)}</span>
              <span>{formatDate(db.time)}</span>
            </div>
            <div class="db-box-actions">
              {#if renamingDb === db.dbId}
                <input type="text" class="rename-input" bind:value={renameValue}
                  onkeydown={(e) => { if (e.key === 'Enter') renameDb(db.dbId); if (e.key === 'Escape') renamingDb = null; }}
                  onclick={(e) => e.stopPropagation()} autofocus />
              {:else}
                <button class="db-btn-sm" onclick={(e) => { e.stopPropagation(); renamingDb = db.dbId; renameValue = db.name; }} title="Rename">
                  <IconEdit size={12} />
                </button>
              {/if}
              <button class="db-btn-sm" onclick={(e) => { e.stopPropagation(); downloadDb(db); }} title="Download">
                <IconDownload size={12} />
              </button>
              <button class="db-btn-sm danger" onclick={(e) => { e.stopPropagation(); deleteDb(db.dbId); }} title="Delete">
                <IconTrash size={12} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

  {:else}
    <!-- ═══ DB EDITOR VIEW ═══ -->
    <div class="editor-header">
      <div class="editor-title">
        <button class="back-btn" onclick={closeDb}>← Back</button>
        <IconDatabase size={16} />
        <span>{openedDb.name}</span>
      </div>
      <div class="editor-actions">
        <button class="db-btn" onclick={saveDb}>
          <IconCheck size={14} /> Save
        </button>
        <button class="db-btn" onclick={() => downloadDb(openedDb!)}>
          <IconDownload size={14} /> Download
        </button>
      </div>
    </div>

    <div class="editor-body">
      <!-- LEFT PANEL: Schema + Tables -->
      <div class="panel schema-panel">
        <div class="panel-tabs">
          <button class="panel-tab" class:active={activePanel === 'schema'} onclick={() => activePanel = 'schema'}>
            <IconTable size={14} /> Schema
          </button>
          <button class="panel-tab" class:active={activePanel === 'query'} onclick={() => activePanel = 'query'}>
            <IconCode size={14} /> Query
          </button>
        </div>

        {#if activePanel === 'schema'}
          <div class="schema-list">
            {#each schema as table}
              <button class="schema-table" class:active={activeTable === table.name} onclick={() => selectTable(table.name)}>
                <IconTable size={14} />
                <span>{table.name}</span>
                <span class="col-count">{table.columns.length} cols</span>
              </button>
              {#if activeTable === table.name}
                <div class="schema-columns">
                  {#each table.columns as col}
                    <div class="schema-col" class:pk={col.pk}>
                      <span class="col-name">{col.name}</span>
                      <span class="col-type">{col.type || 'TEXT'}</span>
                      {#if col.pk}<span class="col-pk">PK</span>{/if}
                      {#if col.notnull}<span class="col-nn">NN</span>{/if}
                    </div>
                  {/each}
                  {#if table.indexes.length}
                    <div class="schema-section">Indexes</div>
                    {#each table.indexes as idx}
                      <div class="schema-idx">{idx.name} ({idx.columns.join(', ')})</div>
                    {/each}
                  {/if}
                </div>
              {/if}
            {/each}
            {#if !schema.length}
              <div class="schema-empty">No tables yet</div>
            {/if}
          </div>
        {:else}
          <!-- QUERY PANEL -->
          <div class="query-panel">
            <textarea class="sql-input" bind:value={sqlInput}
              onkeydown={handleQueryKeydown}
              placeholder="SELECT * FROM ..."></textarea>
            <div class="query-actions">
              <button class="db-btn accent" onclick={runQuery} disabled={running || !sqlInput.trim()}>
                <IconPlayerPlay size={14} /> {running ? 'Running...' : 'Run'}
              </button>
              <span class="query-hint">Ctrl+Enter</span>
            </div>
            {#if queryError}
              <div class="query-error">{queryError}</div>
            {/if}
            {#if queryResult}
              <div class="query-result">
                <div class="result-meta">{queryResult.values.length} rows</div>
                {#if queryResult.values.length}
                  <div class="table-wrap">
                    <table class="data-table">
                      <thead><tr>
                        {#each queryResult.columns as col}
                          <th>{col}</th>
                        {/each}
                      </tr></thead>
                      <tbody>
                        {#each queryResult.values as row}
                          <tr>
                            {#each row as cell}
                              <td>{cell ?? 'NULL'}</td>
                            {/each}
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- RIGHT: DATA TABLE -->
      <div class="panel data-panel">
        {#if activeTable && tableData}
          <div class="data-header">
            <span class="data-table-name">{activeTable}</span>
            <span class="data-row-count">{tableData.values.length} rows</span>
          </div>
          {#if tableData.values.length}
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr>
                  {#each tableData.columns as col}
                    <th>{col}</th>
                  {/each}
                </tr></thead>
                <tbody>
                  {#each paginatedValues() as row}
                    <tr>
                      {#each row as cell}
                        <td>{cell ?? 'NULL'}</td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {#if totalPages() > 1}
              <div class="pagination">
                <button class="db-btn-sm" disabled={tablePage === 0} onclick={() => tablePage--}>← Prev</button>
                <span>Page {tablePage + 1} / {totalPages()}</span>
                <button class="db-btn-sm" disabled={tablePage >= totalPages() - 1} onclick={() => tablePage++}>Next →</button>
              </div>
            {/if}
          {:else}
            <div class="data-empty">No rows</div>
          {/if}
        {:else}
          <div class="data-empty">
            <IconTable size={32} stroke={1} />
            <p>Select a table from the schema panel</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .db-root { display: flex; flex-direction: column; height: 100%; padding: 16px; gap: 12px; overflow: hidden; }

  /* Header */
  .db-header { display: flex; justify-content: space-between; align-items: center; }
  .db-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; color: var(--text-1); }
  .db-count { font-size: 12px; color: var(--text-3); background: var(--bg-2); padding: 2px 8px; border-radius: 10px; }
  .db-actions { display: flex; gap: 6px; }

  /* Buttons */
  .db-btn { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg-2); color: var(--text-2); font-size: 12px; cursor: pointer; transition: all .15s; }
  .db-btn:hover { background: var(--bg-3); color: var(--text-1); }
  .db-btn.accent { background: var(--accent); color: #fff; border-color: var(--accent); }
  .db-btn.accent:hover { opacity: 0.9; }
  .db-btn.ghost { background: transparent; border-color: transparent; }
  .db-btn-icon { display: flex; align-items: center; padding: 6px; border-radius: 8px; border: none;
    background: transparent; color: var(--text-3); cursor: pointer; }
  .db-btn-icon:hover { color: var(--text-1); background: var(--bg-2); }
  .db-btn-sm { display: flex; align-items: center; gap: 3px; padding: 4px 8px; border-radius: 6px; border: none;
    background: var(--bg-2); color: var(--text-3); font-size: 11px; cursor: pointer; }
  .db-btn-sm:hover { background: var(--bg-3); color: var(--text-1); }
  .db-btn-sm.danger:hover { background: #ff4444; color: #fff; }
  .db-btn-sm:disabled { opacity: 0.4; cursor: default; }
  .spinning { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Create form */
  .create-form { display: flex; gap: 8px; align-items: center; padding: 12px; background: var(--bg-2); border-radius: 10px; }
  .create-form input { flex: 1; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg-1); color: var(--text-1); font-size: 13px; outline: none; }
  .create-form input:focus { border-color: var(--accent); }

  /* Empty state */
  .db-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1;
    color: var(--text-3); gap: 8px; }
  .db-empty p { margin: 0; font-size: 14px; }
  .db-empty-sub { font-size: 12px; }

  /* Box grid */
  .db-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; overflow-y: auto; padding-bottom: 16px; }
  .db-box { padding: 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-2);
    display: flex; flex-direction: column; gap: 8px; transition: border-color .15s; cursor: default; }
  .db-box:hover { border-color: var(--accent); }
  .db-box.favorite { border-color: var(--accent); }
  .db-box-header { display: flex; justify-content: space-between; align-items: center; }
  .db-box-name { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--text-1);
    background: none; border: none; cursor: pointer; padding: 0; }
  .db-box-name:hover { color: var(--accent); }
  .star-btn { background: none; border: none; color: var(--text-3); cursor: pointer; padding: 2px; }
  .star-btn:hover { color: #f5a623; }
  .db-box-desc { font-size: 12px; color: var(--text-3); }
  .db-box-meta { display: flex; gap: 12px; font-size: 11px; color: var(--text-3); }
  .db-box-actions { display: flex; gap: 4px; margin-top: auto; }
  .rename-input { padding: 3px 6px; border-radius: 4px; border: 1px solid var(--accent); background: var(--bg-1);
    color: var(--text-1); font-size: 12px; width: 120px; outline: none; }

  /* Editor */
  .editor-header { display: flex; justify-content: space-between; align-items: center; }
  .editor-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: var(--text-1); }
  .back-btn { background: none; border: none; color: var(--text-3); cursor: pointer; font-size: 13px; padding: 4px 8px; border-radius: 6px; }
  .back-btn:hover { color: var(--text-1); background: var(--bg-2); }
  .editor-actions { display: flex; gap: 6px; }

  .editor-body { display: flex; flex: 1; gap: 12px; overflow: hidden; }

  /* Panels */
  .panel { display: flex; flex-direction: column; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-2); overflow: hidden; }
  .schema-panel { width: 280px; min-width: 220px; flex-shrink: 0; }
  .data-panel { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

  .panel-tabs { display: flex; border-bottom: 1px solid var(--border); }
  .panel-tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 8px;
    font-size: 12px; color: var(--text-3); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; }
  .panel-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .panel-tab:hover { color: var(--text-1); }

  .schema-list { overflow-y: auto; flex: 1; padding: 4px; }
  .schema-table { display: flex; align-items: center; gap: 6px; width: 100%; padding: 7px 8px; border: none;
    background: none; color: var(--text-2); font-size: 12px; cursor: pointer; border-radius: 6px; text-align: left; }
  .schema-table:hover { background: var(--bg-3); color: var(--text-1); }
  .schema-table.active { background: var(--accent); color: #fff; }
  .schema-table.active .col-count { color: rgba(255,255,255,0.7); }
  .col-count { margin-left: auto; font-size: 10px; color: var(--text-3); }
  .schema-columns { padding: 0 8px 8px 28px; }
  .schema-col { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 11px; color: var(--text-2); }
  .col-name { font-family: var(--font-mono); }
  .col-type { font-size: 10px; color: var(--text-3); }
  .col-pk, .col-nn { font-size: 9px; padding: 1px 4px; border-radius: 3px; font-weight: 600; }
  .col-pk { background: var(--accent); color: #fff; }
  .col-nn { background: var(--bg-3); color: var(--text-3); }
  .schema-section { font-size: 10px; color: var(--text-3); text-transform: uppercase; padding: 8px 0 4px; letter-spacing: 0.5px; }
  .schema-idx { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); padding: 2px 0; }
  .schema-empty { padding: 20px; text-align: center; color: var(--text-3); font-size: 12px; }

  /* Query */
  .query-panel { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .sql-input { flex: 1; min-height: 80px; padding: 10px; border: none; background: var(--bg-1); color: var(--text-1);
    font-family: var(--font-mono); font-size: 12px; resize: none; outline: none; }
  .query-actions { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--border); }
  .query-hint { font-size: 10px; color: var(--text-3); }
  .query-error { padding: 8px 10px; color: #ff4444; font-size: 12px; font-family: var(--font-mono); background: rgba(255,68,68,0.08); }
  .query-result { overflow: auto; flex: 1; }
  .result-meta { padding: 6px 10px; font-size: 11px; color: var(--text-3); border-top: 1px solid var(--border); }

  /* Data table */
  .data-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .data-table-name { font-size: 13px; font-weight: 600; color: var(--text-1); font-family: var(--font-mono); }
  .data-row-count { font-size: 11px; color: var(--text-3); }
  .data-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1;
    color: var(--text-3); gap: 8px; }
  .data-empty p { margin: 0; font-size: 12px; }

  .table-wrap { overflow: auto; flex: 1; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .data-table th { padding: 6px 10px; text-align: left; font-weight: 600; color: var(--text-2); background: var(--bg-3);
    border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 1; white-space: nowrap;
    font-family: var(--font-mono); font-size: 11px; }
  .data-table td { padding: 5px 10px; color: var(--text-2); border-bottom: 1px solid var(--border);
    font-family: var(--font-mono); font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .data-table tr:hover td { background: var(--bg-3); }

  .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-3); }
</style>
