<script lang="ts">
  import { onMount } from 'svelte';
  import {
    IconDatabase, IconPlus, IconUpload, IconDownload, IconTrash,
    IconRefresh, IconTable, IconStar, IconStarFilled,
    IconPlayerPlay, IconX, IconCheck, IconEdit, IconCode,
    IconMinus, IconRowInsertBottom, IconColumnInsertRight,
  } from '@tabler/icons-svelte';
  import { openDatabase, getSchema, query as sqlQuery, type Database as SqlDb } from '$lib/sql';

  let { apiKey }: { apiKey: string } = $props();

  type DbRecord = {
    dbId: string; name: string; description?: string; totalBytes: number;
    time: string; _type: 'database'; favorite?: boolean; metaFileId: string; folderId?: string;
    telegramFileId?: string; telegramMessageId?: number;
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
  let databasesFolderId = $state<string | null>(null);

  let hasUnsavedChanges = $state(false);
  let saveToast = $state(false);

  let creatingTable = $state(false);
  let newTableName = $state('');
  let newColumns = $state<{ name: string; type: string; pk: boolean }[]>([
    { name: 'id', type: 'INTEGER', pk: true }
  ]);

  let addingRow = $state(false);
  let newRowValues = $state<string[]>([]);
  let editingCell = $state<{ row: number; col: number } | null>(null);
  let editValue = $state('');
  let addingColumn = $state(false);
  let newColName = $state('');
  let newColType = $state('TEXT');

  onMount(async () => {
    await ensureDatabasesFolder();
    await loadDatabases();
  });

  async function ensureDatabasesFolder() {
    const res = await fetch('/api/telegram/folderOps', {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey }
    });
    const data = await res.json();
    const existing = (data.folders || []).find((f: any) => f.name === 'Databases');
    if (existing) {
      databasesFolderId = existing.folderId || existing.id || null;
    } else {
      const createRes = await fetch('/api/telegram/folderOps', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: 'Databases' })
      });
      const createData = await createRes.json();
      databasesFolderId = createData.folder?.folderId || null;
    }
  }

  async function loadDatabases() {
    loading = true;
    try {
      const [dbRes, lsRes] = await Promise.all([
        fetch('/api/database', { headers: { 'X-Api-Key': apiKey } }),
        databasesFolderId ? fetch(`/api/telegram/ls?folderId=${encodeURIComponent(databasesFolderId)}`, { headers: { 'X-Api-Key': apiKey } }) : null
      ]);
      const dbData = await dbRes.json();
      const dbs: DbRecord[] = dbData.databases || [];

      if (lsRes) {
        const lsData = await lsRes.json();
        const existingIds = new Set(dbs.map(d => d.metaFileId));
        for (const file of (lsData.files || [])) {
          if (file._database) continue;
          if (!file.fileName?.match(/\.(sqlite|db|sqlite3)$/i)) continue;
          if (existingIds.has(file.metaFileId)) continue;
          dbs.push({
            dbId: 'file:' + file.metaFileId,
            name: file.fileName.replace(/\.(sqlite|db|sqlite3)$/i, ''),
            totalBytes: file.totalBytes,
            time: file.time,
            metaFileId: file.metaFileId,
            telegramFileId: file.telegramFileId,
            telegramMessageId: file.telegramMessageId,
            _type: 'database',
            folderId: file.folderId,
          });
        }
      }

      databases = dbs.sort((a, b) =>
        (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || new Date(b.time).getTime() - new Date(a.time).getTime()
      );
    } finally { loading = false; }
  }

  async function createDatabase() {
    const name = newDbName.trim() || 'Untitled DB';
    newDbName = ''; creating = false;
    const emptyDb = await openDatabase();
    const data = emptyDb.export();
    emptyDb.close();
    const base64 = toBase64(new Uint8Array(data));
    const res = await fetch('/api/database', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name, data: base64, folderId: databasesFolderId })
    });
    const result = await res.json();
    if (result.database) databases = [result.database, ...databases];
  }

  async function importDatabase() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sqlite,.db,.sqlite3';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const buf = await file.arrayBuffer();
      const base64 = toBase64(new Uint8Array(buf));
      const res = await fetch('/api/database', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', name: file.name.replace(/\.(sqlite|db|sqlite3)$/, ''), data: base64, folderId: databasesFolderId })
      });
      const data = await res.json();
      if (data.database) databases = [data.database, ...databases];
    };
    input.click();
  }

  async function deleteDb(dbId: string) {
    if (!dbId.startsWith('file:')) {
      await fetch('/api/database', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', dbId })
      });
    }
    databases = databases.filter(d => d.dbId !== dbId);
    if (openedDb?.dbId === dbId) closeDb();
  }

  async function toggleFavorite(dbId: string) {
    if (!dbId.startsWith('file:')) {
      await fetch('/api/database', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggleFavorite', dbId })
      });
    }
    databases = databases.map(d => d.dbId === dbId ? { ...d, favorite: !d.favorite } : d);
  }

  async function renameDb(dbId: string) {
    const name = renameValue.trim();
    if (!name) return;
    renamingDb = null;
    if (!dbId.startsWith('file:')) {
      await fetch('/api/database', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', dbId, name })
      });
    }
    databases = databases.map(d => d.dbId === dbId ? { ...d, name } : d);
    if (openedDb?.dbId === dbId) openedDb = { ...openedDb, name };
  }

  async function downloadDb(db: DbRecord) {
    const res = await fetch(`/api/telegram/getRequestFile?api_key=${encodeURIComponent(apiKey)}&meta_file_id=${encodeURIComponent(db.metaFileId)}&download=true`);
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
    creatingTable = false;
    addingRow = false;

    const res = await fetch(`/api/telegram/getRequestFile?api_key=${encodeURIComponent(apiKey)}&meta_file_id=${encodeURIComponent(db.metaFileId)}`);
    const buf = await res.arrayBuffer();
    sqlDb = await openDatabase(new Uint8Array(buf));
    schema = getSchema(sqlDb).tables;
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

  function refreshSchema() {
    if (!sqlDb) return;
    schema = getSchema(sqlDb).tables;
  }

  async function selectTable(tableName: string) {
    if (!sqlDb) return;
    activeTable = tableName;
    activePanel = 'schema';
    tablePage = 0;
    addingRow = false;
    editingCell = null;
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
      refreshSchema();
      if (activeTable) {
        const refreshed = sqlQuery(sqlDb, `SELECT * FROM "${activeTable}"`);
        tableData = refreshed;
      }
    } catch (e: any) {
      queryError = e.message || 'Query failed';
    } finally { running = false; }
  }

  function execSql(sql: string) {
    if (!sqlDb) return;
    sqlQuery(sqlDb, sql);
    hasUnsavedChanges = true;
    refreshSchema();
    if (activeTable) {
      try {
        tableData = sqlQuery(sqlDb, `SELECT * FROM "${activeTable}"`);
      } catch {}
    }
  }

  async function saveDb() {
    if (!sqlDb || !openedDb) return;
    const data = sqlDb.export();
    const base64 = toBase64(new Uint8Array(data));

    if (openedDb.dbId.startsWith('file:')) {
      const res = await fetch('/api/database', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', name: openedDb.name, data: base64, folderId: databasesFolderId })
      });
      const result = await res.json();
      if (result.database) {
        openedDb = result.database;
        databases = databases.map(d => d.metaFileId === openedDb!.metaFileId ? result.database : d);
      }
    } else {
      await fetch('/api/database', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', dbId: openedDb.dbId, data: base64 })
      });
    }

    hasUnsavedChanges = false;
    saveToast = true;
    setTimeout(() => saveToast = false, 2000);
  }

  function handleQueryKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveDb(); }
  }

  function startCreateTable() {
    creatingTable = true;
    newTableName = '';
    newColumns = [{ name: 'id', type: 'INTEGER', pk: true }];
  }

  function addColumnSlot() {
    newColumns = [...newColumns, { name: '', type: 'TEXT', pk: false }];
  }

  function removeColumnSlot(idx: number) {
    newColumns = newColumns.filter((_, i) => i !== idx);
  }

  function confirmCreateTable() {
    const name = newTableName.trim();
    if (!name || !sqlDb) return;
    const colDefs = newColumns
      .filter(c => c.name.trim())
      .map(c => `"${c.name.trim()}" ${c.type}${c.pk ? ' PRIMARY KEY' : ''}`)
      .join(', ');
    if (!colDefs) return;
    try {
      execSql(`CREATE TABLE "${name}" (${colDefs})`);
      creatingTable = false;
      selectTable(name);
    } catch (e: any) {
      queryError = e.message;
    }
  }

  function addColumnToTable() {
    addingColumn = true;
    newColName = '';
    newColType = 'TEXT';
  }

  function confirmAddColumn() {
    if (!sqlDb || !activeTable || !newColName.trim()) return;
    try {
      execSql(`ALTER TABLE "${activeTable}" ADD COLUMN "${newColName.trim()}" ${newColType}`);
      addingColumn = false;
    } catch (e: any) {
      queryError = e.message;
    }
  }

  function startAddRow() {
    if (!tableData) return;
    addingRow = true;
    newRowValues = tableData.columns.map(() => '');
  }

  function confirmAddRow() {
    if (!sqlDb || !activeTable || !tableData) return;
    const cols = tableData.columns.map(c => `"${c}"`).join(', ');
    const vals = newRowValues.map(v => v === '' ? 'NULL' : `'${v.replace(/'/g, "''")}'`).join(', ');
    try {
      execSql(`INSERT INTO "${activeTable}" (${cols}) VALUES (${vals})`);
      addingRow = false;
    } catch (e: any) {
      queryError = e.message;
    }
  }

  function startEditCell(row: number, col: number) {
    editingCell = { row, col };
    editValue = tableData?.values[row]?.[col] ?? '';
  }

  function confirmEditCell() {
    if (!sqlDb || !activeTable || !tableData || !editingCell) return;
    const col = tableData.columns[editingCell.col];
    const row = tableData.values[editingCell.row];
    const pkCol = schema.find(t => t.name === activeTable)?.columns.find(c => c.pk);
    if (!pkCol) { editingCell = null; return; }
    const pkIdx = tableData.columns.indexOf(pkCol.name);
    const pkVal = row[pkIdx];
    const newVal = editValue === '' ? 'NULL' : `'${editValue.replace(/'/g, "''")}'`;
    try {
      execSql(`UPDATE "${activeTable}" SET "${col}" = ${newVal} WHERE "${pkCol.name}" = ${pkVal}`);
    } catch (e: any) {
      queryError = e.message;
    }
    editingCell = null;
  }

  function deleteRow(rowIdx: number) {
    if (!sqlDb || !activeTable || !tableData) return;
    const pkCol = schema.find(t => t.name === activeTable)?.columns.find(c => c.pk);
    if (!pkCol) return;
    const pkIdx = tableData.columns.indexOf(pkCol.name);
    const pkVal = tableData.values[rowIdx][pkIdx];
    try {
      execSql(`DELETE FROM "${activeTable}" WHERE "${pkCol.name}" = ${pkVal}`);
    } catch (e: any) {
      queryError = e.message;
    }
  }

  let deletingTable = $state<string | null>(null);

  function deleteTable(tableName: string) {
    if (!sqlDb) return;
    deletingTable = tableName;
  }

  function confirmDeleteTable() {
    if (!sqlDb || !deletingTable) return;
    try {
      execSql(`DROP TABLE "${deletingTable}"`);
      if (activeTable === deletingTable) {
        activeTable = null;
        tableData = null;
      }
      deletingTable = null;
    } catch (e: any) {
      queryError = e.message;
    }
  }

  function toBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
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
    <div class="editor-header">
      <div class="editor-title">
        <button class="back-btn" onclick={closeDb}>&larr;</button>
        <IconDatabase size={16} />
        <span>{openedDb.name}</span>
        {#if hasUnsavedChanges}<span class="unsaved-dot" title="Unsaved changes"></span>{/if}
      </div>
      <div class="editor-actions">
        <button class="db-btn" onclick={saveDb}>
          <IconCheck size={14} /> Save
        </button>
        <button class="db-btn" onclick={() => downloadDb(openedDb!)}>
          <IconDownload size={14} /> Download
        </button>
        <span class="save-hint">Ctrl+S</span>
      </div>
    </div>

    <div class="editor-body">
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
                  <div class="schema-col-actions">
                    {#if addingColumn}
                      <div class="inline-form">
                        <input type="text" placeholder="name" bind:value={newColName} autofocus
                          onkeydown={(e) => { if (e.key === 'Enter') confirmAddColumn(); if (e.key === 'Escape') addingColumn = false; }} />
                        <select bind:value={newColType}>
                          <option value="INTEGER">INT</option>
                          <option value="TEXT">TEXT</option>
                          <option value="REAL">REAL</option>
                          <option value="BLOB">BLOB</option>
                        </select>
                        <button class="db-btn-sm" onclick={confirmAddColumn}><IconCheck size={12} /></button>
                        <button class="db-btn-sm" onclick={() => addingColumn = false}><IconX size={12} /></button>
                      </div>
                    {:else}
                      <button class="db-btn-sm" onclick={addColumnToTable}>
                        <IconColumnInsertRight size={12} /> Add Column
                      </button>
                    {/if}
                    {#if deletingTable === table.name}
                      <div class="inline-form">
                        <span class="delete-confirm-text">Drop "{table.name}"?</span>
                        <button class="db-btn-sm danger" onclick={confirmDeleteTable}><IconCheck size={12} /> Yes</button>
                        <button class="db-btn-sm" onclick={() => deletingTable = null}><IconX size={12} /></button>
                      </div>
                    {:else}
                      <button class="db-btn-sm danger" onclick={() => deleteTable(table.name)}>
                        <IconTrash size={12} />
                      </button>
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}

            {#if creatingTable}
              <div class="create-table-card">
                <div class="ct-label">Table Name</div>
                <input type="text" placeholder="e.g. users" bind:value={newTableName} class="ct-name-input" autofocus />
                <div class="ct-label">Columns</div>
                <div class="ct-columns">
                  {#each newColumns as col, i}
                    <div class="ct-col-row">
                      <input type="text" placeholder="column_name" bind:value={col.name} class="ct-col-name" />
                      <select bind:value={col.type} class="ct-col-type">
                        <option value="INTEGER">INTEGER</option>
                        <option value="TEXT">TEXT</option>
                        <option value="REAL">REAL</option>
                        <option value="BLOB">BLOB</option>
                      </select>
                      <button class="ct-pk-btn" class:active={col.pk} onclick={() => col.pk = !col.pk} title="Primary Key">PK</button>
                      <button class="ct-rm-btn" onclick={() => removeColumnSlot(i)} title="Remove column"><IconX size={14} /></button>
                    </div>
                  {/each}
                </div>
                <button class="ct-add-col" onclick={addColumnSlot}>
                  <IconPlus size={14} /> Add Column
                </button>
                <div class="ct-actions">
                  <button class="db-btn accent" onclick={confirmCreateTable}>
                    <IconCheck size={14} /> Create Table
                  </button>
                  <button class="db-btn ghost" onclick={() => creatingTable = false}>Cancel</button>
                </div>
              </div>
            {:else}
              <button class="create-table-btn" onclick={startCreateTable}>
                <IconPlus size={14} /> Create Table
              </button>
            {/if}

            {#if !schema.length && !creatingTable}
              <div class="schema-empty">No tables yet</div>
            {/if}
          </div>
        {:else}
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

      <div class="panel data-panel">
        {#if activeTable && tableData}
          <div class="data-header">
            <span class="data-table-name">{activeTable}</span>
            <div class="data-header-actions">
              <span class="data-row-count">{tableData.values.length} rows</span>
              <button class="db-btn-sm" onclick={startAddRow} title="Add row">
                <IconRowInsertBottom size={12} /> Add Row
              </button>
            </div>
          </div>

          {#if addingRow}
            <div class="add-row-form">
              {#each newRowValues as val, i}
                <input type="text" placeholder={tableData.columns[i]} bind:value={newRowValues[i]} class="row-input" />
              {/each}
              <div class="add-row-actions">
                <button class="db-btn accent" onclick={confirmAddRow}><IconCheck size={12} /> Add</button>
                <button class="db-btn ghost" onclick={() => addingRow = false}>Cancel</button>
              </div>
            </div>
          {/if}

          {#if queryError}
            <div class="query-error">{queryError}</div>
          {/if}

          {#if tableData.values.length}
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr>
                  {#each tableData.columns as col}
                    <th>{col}</th>
                  {/each}
                  <th class="th-actions"></th>
                </tr></thead>
                <tbody>
                  {#each paginatedValues() as row, ri}
                    <tr>
                      {#each row as cell, ci}
                        <td ondblclick={() => startEditCell(tablePage * PAGE_SIZE + ri, ci)}>
                          {#if editingCell?.row === tablePage * PAGE_SIZE + ri && editingCell?.col === ci}
                            <input type="text" class="cell-edit" bind:value={editValue}
                              onkeydown={(e) => { if (e.key === 'Enter') confirmEditCell(); if (e.key === 'Escape') editingCell = null; }}
                              onblur={confirmEditCell} autofocus />
                          {:else}
                            <span class="cell-value">{cell ?? 'NULL'}</span>
                          {/if}
                        </td>
                      {/each}
                      <td class="td-actions">
                        <button class="db-btn-sm danger" onclick={() => deleteRow(tablePage * PAGE_SIZE + ri)} title="Delete row">
                          <IconTrash size={11} />
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {#if totalPages() > 1}
              <div class="pagination">
                <button class="db-btn-sm" disabled={tablePage === 0} onclick={() => tablePage--}>Prev</button>
                <span>{tablePage + 1} / {totalPages()}</span>
                <button class="db-btn-sm" disabled={tablePage >= totalPages() - 1} onclick={() => tablePage++}>Next</button>
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

{#if saveToast}
  <div class="save-toast"><IconCheck size={14} /> Saved</div>
{/if}

<style>
  .db-root { display: flex; flex-direction: column; height: 100%; padding: 16px; gap: 12px; overflow: hidden; overflow-x: hidden; }

  .db-header { display: flex; justify-content: space-between; align-items: center; }
  .db-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; color: var(--text-1); }
  .db-count { font-size: 12px; color: var(--text-3); background: var(--bg-2); padding: 2px 8px; border-radius: 10px; }
  .db-actions { display: flex; gap: 6px; }

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
  .db-btn-sm.active { background: var(--accent); color: #fff; }
  .db-btn-sm.danger:hover { background: #ff4444; color: #fff; }
  .db-btn-sm:disabled { opacity: 0.4; cursor: default; }
  .spinning { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .create-form { display: flex; gap: 8px; align-items: center; padding: 12px; background: var(--bg-2); border-radius: 10px; }
  .create-form input { flex: 1; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg-1); color: var(--text-1); font-size: 13px; outline: none; }
  .create-form input:focus { border-color: var(--accent); }

  .db-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1;
    color: var(--text-3); gap: 8px; }
  .db-empty p { margin: 0; font-size: 14px; }
  .db-empty-sub { font-size: 12px; }

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

  .editor-header { display: flex; justify-content: space-between; align-items: center; }
  .editor-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: var(--text-1); }
  .unsaved-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .back-btn { background: none; border: none; color: var(--text-3); cursor: pointer; font-size: 18px; padding: 4px 8px; border-radius: 6px; }
  .back-btn:hover { color: var(--text-1); background: var(--bg-2); }
  .editor-actions { display: flex; gap: 6px; align-items: center; }
  .save-hint { font-size: 10px; color: var(--text-3); font-family: var(--font-mono); }

  .editor-body { display: flex; flex: 1; gap: 12px; overflow: hidden; min-width: 0; }

  .panel { display: flex; flex-direction: column; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-2); overflow: hidden; min-width: 0; }
  .schema-panel { width: 320px; min-width: 260px; flex-shrink: 0; }
  .data-panel { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-width: 0; }

  .panel-tabs { display: flex; border-bottom: 1px solid var(--border); }
  .panel-tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 10px;
    font-size: 12px; color: var(--text-3); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; }
  .panel-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .panel-tab:hover { color: var(--text-1); }

  .schema-list { overflow-y: auto; flex: 1; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
  .schema-table { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px 10px; border: none;
    background: none; color: var(--text-2); font-size: 12px; cursor: pointer; border-radius: 8px; text-align: left; transition: .1s; }
  .schema-table:hover { background: var(--bg-3); color: var(--text-1); }
  .schema-table.active { background: var(--accent); color: #fff; }
  .schema-table.active .col-count { color: rgba(255,255,255,0.7); }
  .col-count { margin-left: auto; font-size: 10px; color: var(--text-3); }
  .schema-columns { padding: 0 8px 8px 28px; display: flex; flex-direction: column; gap: 2px; }
  .schema-col { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 11px; color: var(--text-2); }
  .col-name { font-family: var(--font-mono); }
  .col-type { font-size: 10px; color: var(--text-3); }
  .col-pk, .col-nn { font-size: 9px; padding: 1px 4px; border-radius: 3px; font-weight: 600; }
  .col-pk { background: var(--accent); color: #fff; }
  .col-nn { background: var(--bg-3); color: var(--text-3); }
  .schema-col-actions { display: flex; gap: 4px; padding-top: 6px; flex-wrap: wrap; }
  .inline-form { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
  .inline-form input { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg-1); color: var(--text-1); font-size: 12px; outline: none; width: 90px; }
  .inline-form input:focus { border-color: var(--accent); }
  .inline-form select { padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg-1); color: var(--text-1); font-size: 12px; }
  .delete-confirm-text { font-size: 11px; color: var(--red); white-space: nowrap; }
  .schema-empty { padding: 20px; text-align: center; color: var(--text-3); font-size: 12px; }

  .create-table-btn { display: flex; align-items: center; gap: 6px; width: 100%; padding: 10px 12px; border: 1px dashed var(--border);
    background: none; color: var(--text-3); font-size: 12px; cursor: pointer; border-radius: 8px; margin-top: 4px; }
  .create-table-btn:hover { border-color: var(--accent); color: var(--accent); }

  .create-table-card {
    padding: 14px; background: var(--bg-3); border-radius: 10px; margin-top: 6px;
    display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--border);
  }
  .ct-label { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.5px; }
  .ct-name-input {
    width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg-1); color: var(--text-1); font-size: 13px; outline: none; box-sizing: border-box;
  }
  .ct-name-input:focus { border-color: var(--accent); }
  .ct-columns { display: flex; flex-direction: column; gap: 4px; }
  .ct-col-row { display: flex; gap: 4px; align-items: center; }
  .ct-col-name {
    flex: 1; min-width: 0; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg-1); color: var(--text-1); font-size: 12px; font-family: var(--font-mono); outline: none;
  }
  .ct-col-name:focus { border-color: var(--accent); }
  .ct-col-type {
    width: 90px; flex-shrink: 0; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg-1); color: var(--text-1); font-size: 12px; outline: none;
  }
  .ct-pk-btn {
    padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg-2); color: var(--text-3); font-size: 11px; font-weight: 600; cursor: pointer;
  }
  .ct-pk-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .ct-pk-btn:hover { border-color: var(--accent); }
  .ct-rm-btn {
    padding: 6px; border-radius: 6px; border: none;
    background: transparent; color: var(--text-3); cursor: pointer; display: flex;
  }
  .ct-rm-btn:hover { color: var(--red); }
  .ct-add-col {
    display: flex; align-items: center; gap: 4px; padding: 6px 0;
    background: none; border: none; color: var(--text-3); font-size: 12px; cursor: pointer;
  }
  .ct-add-col:hover { color: var(--accent); }
  .ct-actions { display: flex; gap: 8px; margin-top: 4px; }

  .query-panel { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .sql-input { flex: 1; min-height: 80px; padding: 10px; border: none; background: var(--bg-1); color: var(--text-1);
    font-family: var(--font-mono); font-size: 12px; resize: none; outline: none; }
  .query-actions { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--border); }
  .query-hint { font-size: 10px; color: var(--text-3); }
  .query-error { padding: 8px 10px; color: #ff4444; font-size: 12px; font-family: var(--font-mono); background: rgba(255,68,68,0.08); }
  .query-result { overflow: auto; flex: 1; }
  .result-meta { padding: 6px 10px; font-size: 11px; color: var(--text-3); border-top: 1px solid var(--border); }

  .data-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .data-header-actions { display: flex; align-items: center; gap: 10px; }
  .data-table-name { font-size: 13px; font-weight: 600; color: var(--text-1); font-family: var(--font-mono); }
  .data-row-count { font-size: 11px; color: var(--text-3); }
  .data-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1;
    color: var(--text-3); gap: 8px; }
  .data-empty p { margin: 0; font-size: 12px; }

  .table-wrap { overflow: auto; flex: 1; min-width: 0; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .data-table th { padding: 6px 10px; text-align: left; font-weight: 600; color: var(--text-2); background: var(--bg-3);
    border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 1; white-space: nowrap;
    font-family: var(--font-mono); font-size: 11px; }
  .data-table td { padding: 5px 10px; color: var(--text-2); border-bottom: 1px solid var(--border);
    font-family: var(--font-mono); font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .data-table tr:hover td { background: var(--bg-3); }
  .cell-value { cursor: pointer; }
  .cell-edit { width: 100%; padding: 2px 4px; border: 1px solid var(--accent); border-radius: 3px;
    background: var(--bg-1); color: var(--text-1); font-family: var(--font-mono); font-size: 11px; outline: none; }
  .th-actions { width: 32px; }
  .td-actions { width: 32px; text-align: center; }
  .td-actions .db-btn-sm { opacity: 0; transition: .1s; }
  .data-table tr:hover .td-actions .db-btn-sm { opacity: 1; }

  .add-row-form { display: flex; gap: 6px; padding: 8px 12px; background: var(--bg-3); align-items: center; flex-wrap: wrap; }
  .row-input { padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-1);
    color: var(--text-1); font-family: var(--font-mono); font-size: 11px; outline: none; min-width: 80px; }
  .row-input:focus { border-color: var(--accent); }
  .add-row-actions { display: flex; gap: 4px; margin-left: auto; }

  .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-3); }

  .save-toast {
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 6px;
    padding: 8px 16px; border-radius: 999px;
    background: var(--green); color: #fff;
    font-size: 12px; font-weight: 600; z-index: 999;
    box-shadow: 0 4px 12px rgba(0,0,0,.3);
    animation: toastIn .2s ease-out;
  }
  @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
</style>
