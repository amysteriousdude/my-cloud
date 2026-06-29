// src/lib/sql.ts — Dual engine: sql.js (small DBs) + wa-sqlite OPFS (large DBs)
import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js';

const SIZE_THRESHOLD = 50 * 1024 * 1024; // 50MB — above this, use wa-sqlite + OPFS

// ── Types ──────────────────────────────────────────────────────────────────

export type Database = {
  _type: 'sqljs' | 'wasqlite';
  _sqljs?: SqlJsDatabase;
  _wa?: {
    sqlite3: any;
    db: number;
    filename: string;
    modified: boolean;
  };
};

type SchemaResult = {
  tables: {
    name: string;
    columns: { name: string; type: string; notnull: boolean; pk: boolean }[];
    indexes: { name: string; columns: string[] }[];
  }[];
};

type QueryResult = { columns: string[]; values: any[][]; rowsAffected?: number };

// ── sql.js loader ──────────────────────────────────────────────────────────

let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/${file}`
    });
  }
  return sqlPromise;
}

// ── wa-sqlite loader ───────────────────────────────────────────────────────

let waModulePromise: Promise<any> | null = null;
let waSqlitePromise: Promise<any> | null = null;

async function getWaSqlite(): Promise<any> {
  if (waSqlitePromise) return waSqlitePromise;
  waSqlitePromise = (async () => {
    const SQLiteESMFactory = (await import('https://cdn.jsdelivr.net/npm/wa-sqlite@1.0.0/dist/wa-sqlite-async.mjs')).default;
    const module = await SQLiteESMFactory();
    waModulePromise = Promise.resolve(module);
    const SQLite = await import('https://cdn.jsdelivr.net/npm/wa-sqlite@1.0.0/src/sqlite-api.js');
    return SQLite.Factory(module);
  })();
  return waSqlitePromise;
}

let vfsPromise: Promise<any> | null = null;

async function getVFS(): Promise<any> {
  if (vfsPromise) return vfsPromise;
  vfsPromise = (async () => {
    const { OriginPrivateFileSystemVFS } = await import(
      'https://cdn.jsdelivr.net/npm/wa-sqlite@1.0.0/src/examples/OriginPrivateFileSystemVFS.js'
    );
    const module = await waModulePromise!;
    const vfs = new OriginPrivateFileSystemVFS();
    const SQLite = await import('https://cdn.jsdelivr.net/npm/wa-sqlite@1.0.0/src/sqlite-api.js');
    module.registerVFS(vfs, true);
    return vfs;
  })();
  return vfsPromise;
}

function opfsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage;
}

// ── OPFS helpers ───────────────────────────────────────────────────────────

async function writeToOPFS(filename: string, data: Uint8Array): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(filename, { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();
  accessHandle.write(data, { at: 0 });
  accessHandle.truncate(data.length);
  accessHandle.close();
}

async function readFromOPFS(filename: string): Promise<Uint8Array> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function openDatabase(data?: Uint8Array, filename?: string): Promise<Database> {
  if (data && data.length > SIZE_THRESHOLD && opfsSupported()) {
    try {
      const sqlite3 = await getWaSqlite();
      await getVFS();
      const name = filename || `db_${Date.now()}.sqlite`;
      await writeToOPFS(name, data);
      const db = await sqlite3.open_v2(name);
      return { _type: 'wasqlite', _wa: { sqlite3, db, filename: name, modified: false } };
    } catch (e) {
      console.warn('wa-sqlite OPFS failed, falling back to sql.js:', e);
    }
  }

  const SQL = await getSql();
  const db = data ? new SQL.Database(data) : new SQL.Database();
  return { _type: 'sqljs', _sqljs: db };
}

export async function getSchema(database: Database): Promise<SchemaResult> {
  if (database._type === 'sqljs') {
    return getSchemaSqlJs(database._sqljs!);
  }
  return getSchemaWa(database._wa!);
}

export async function query(database: Database, sql: string): Promise<QueryResult> {
  if (database._type === 'sqljs') {
    return querySqlJs(database._sqljs!, sql);
  }
  return queryWa(database._wa!, sql);
}

export async function exportDatabase(database: Database): Promise<Uint8Array> {
  if (database._type === 'sqljs') {
    return new Uint8Array(database._sqljs!.export());
  }
  return readFromOPFS(database._wa!.filename);
}

export async function closeDatabase(database: Database): Promise<void> {
  if (database._type === 'sqljs') {
    database._sqljs!.close();
  } else {
    await database._wa!.sqlite3.close(database._wa!.db);
  }
}

// ── sql.js implementations (sync) ──────────────────────────────────────────

function getSchemaSqlJs(db: SqlJsDatabase): SchemaResult {
  const rows = db.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const tables: SchemaResult['tables'] = [];

  for (const row of rows[0]?.values ?? []) {
    const tableName = row[0] as string;
    const colsResult = db.exec(`PRAGMA table_info("${tableName}")`);
    const columns = (colsResult[0]?.values ?? []).map((r: any[]) => ({
      name: r[1] as string, type: r[2] as string, notnull: r[3] === 1, pk: r[5] === 1,
    }));
    const idxResult = db.exec(`PRAGMA index_list("${tableName}")`);
    const indexes: SchemaResult['tables'][0]['indexes'] = [];
    for (const idxRow of idxResult[0]?.values ?? []) {
      const idxName = idxRow[1] as string;
      const idxColsResult = db.exec(`PRAGMA index_info("${idxName}")`);
      indexes.push({ name: idxName, columns: (idxColsResult[0]?.values ?? []).map((r: any[]) => r[2] as string) });
    }
    tables.push({ name: tableName, columns, indexes });
  }
  return { tables };
}

function querySqlJs(db: SqlJsDatabase, sql: string): QueryResult {
  try {
    const results = db.exec(sql);
    if (results.length === 0) return { columns: [], values: [], rowsAffected: db.getRowsModified() };
    return { columns: results[0].columns, values: results[0].values, rowsAffected: db.getRowsModified() };
  } catch (e: any) {
    throw new Error(e.message || 'SQL error');
  }
}

// ── wa-sqlite implementations (async) ──────────────────────────────────────

async function getSchemaWa(wa: NonNullable<Database['_wa']>): Promise<SchemaResult> {
  const { sqlite3, db } = wa;
  const tables: SchemaResult['tables'] = [];

  const tableRows = await collectRows(sqlite3, db,
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");

  for (const row of tableRows) {
    const tableName = row[0] as string;
    const colRows = await collectRows(sqlite3, db, `PRAGMA table_info("${tableName}")`);
    const columns = colRows.map((r: any[]) => ({
      name: r[1] as string, type: r[2] as string, notnull: r[3] === 1, pk: r[5] === 1,
    }));

    const idxRows = await collectRows(sqlite3, db, `PRAGMA index_list("${tableName}")`);
    const indexes: SchemaResult['tables'][0]['indexes'] = [];
    for (const idxRow of idxRows) {
      const idxName = idxRow[1] as string;
      const idxCols = await collectRows(sqlite3, db, `PRAGMA index_info("${idxName}")`);
      indexes.push({ name: idxName, columns: idxCols.map((r: any[]) => r[2] as string) });
    }
    tables.push({ name: tableName, columns, indexes });
  }
  return { tables };
}

async function queryWa(wa: NonNullable<Database['_wa']>, sql: string): Promise<QueryResult> {
  const { sqlite3, db } = wa;
  const { columns, values } = await collectRowsWithMeta(sqlite3, db, sql);
  const changes = sqlite3.changes(db);
  return { columns, values, rowsAffected: changes };
}

async function collectRowsWithMeta(sqlite3: any, db: number, sql: string): Promise<{ columns: string[]; values: any[][] }> {
  const columns: string[] = [];
  const values: any[][] = [];

  const str = sqlite3.str_new(db, sql);
  try {
    let prepared: any = null;
    const sqlPtr = sqlite3.str_value(str);
    prepared = await sqlite3.prepare_v2(db, sqlPtr);

    if (prepared && prepared.stmt) {
      const colCount = sqlite3.column_count(prepared.stmt);
      for (let i = 0; i < colCount; i++) {
        columns.push(sqlite3.column_name(prepared.stmt, i));
      }

      while (await sqlite3.step(prepared.stmt) === 0) { // SQLITE_ROW = 0
        const row: any[] = [];
        for (let i = 0; i < colCount; i++) {
          row.push(sqlite3.column(prepared.stmt, i));
        }
        values.push(row);
      }
      await sqlite3.finalize(prepared.stmt);
    }
  } finally {
    sqlite3.str_finish(str);
  }

  return { columns, values };
}

async function collectRows(sqlite3: any, db: number, sql: string): Promise<any[]> {
  const { columns, values } = await collectRowsWithMeta(sqlite3, db, sql);
  const result: any[] = values;
  Object.defineProperty(result, '_columns', { value: columns });
  Object.defineProperty(result, '_values', { value: values });
  return result;
}
