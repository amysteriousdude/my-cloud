// src/lib/sql.ts — sql-wasm loader and helpers
import initSqlWasm from 'sql-wasm';

let sqlPromise: Promise<import('sql-wasm').SQLWasm> | null = null;

export function getSql(): Promise<import('sql-wasm').SQLWasm> {
  if (!sqlPromise) {
    sqlPromise = initSqlWasm();
  }
  return sqlPromise;
}

export async function openDatabase(data?: Uint8Array): Promise<import('sql-wasm').Database> {
  const SQL = await getSql();
  return data ? new SQL.Database(Array.from(data)) : new SQL.Database();
}

export function getSchema(db: import('sql-wasm').Database): {
  tables: {
    name: string;
    columns: { name: string; type: string; notnull: boolean; pk: boolean }[];
    indexes: { name: string; columns: string[] }[];
  }[];
} {
  const rows = db.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const tables: any[] = [];

  for (const row of rows) {
    for (const values of [row.values]) {
      for (const r of values) {
        const tableName = r[0] as string;
        const createSql = r[1] as string;

        const colsResult = db.exec(`PRAGMA table_info("${tableName}")`);
        const columns = (colsResult[0]?.values ?? []).map((r: any[]) => ({
          name: r[1] as string,
          type: r[2] as string,
          notnull: r[3] === 1,
          pk: r[5] === 1,
        }));

        const idxResult = db.exec(`PRAGMA index_list("${tableName}")`);
        const indexes: any[] = [];
        for (const idxRow of idxResult[0]?.values ?? []) {
          const idxName = idxRow[1] as string;
          const idxColsResult = db.exec(`PRAGMA index_info("${idxName}")`);
          const idxCols = (idxColsResult[0]?.values ?? []).map((r: any[]) => r[2] as string);
          indexes.push({ name: idxName, columns: idxCols });
        }

        tables.push({ name: tableName, columns, indexes });
      }
    }
  }

  return { tables };
}

export function query(db: import('sql-wasm').Database, sql: string): { columns: string[]; values: any[][]; rowsAffected?: number } {
  try {
    const results = db.exec(sql);
    if (results.length === 0) {
      return { columns: [], values: [], rowsAffected: db.getRowsModified() };
    }
    return {
      columns: results[0].columns,
      values: results[0].values,
      rowsAffected: db.getRowsModified(),
    };
  } catch (e: any) {
    throw new Error(e.message || 'SQL error');
  }
}
