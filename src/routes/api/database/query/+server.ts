// src/routes/api/database/query/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, readRegistry, updateDatabaseFile } from '$lib/telegramStorage';
import initSqlJs from 'sql.js';

function apiKey(req: Request) {
  return (req.headers.get('x-api-key') ?? '').trim();
}

async function getSql() {
  return initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`
  });
}

async function downloadDbBuffer(telegramFileId: string): Promise<Uint8Array> {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
  const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

  const r = await fetch(`${TELE_API}/getFile?file_id=${encodeURIComponent(telegramFileId)}`);
  const j = await r.json() as any;
  if (!j?.ok) throw new Error('getFile failed');

  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${j.result.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Download failed');
  return new Uint8Array(await res.arrayBuffer());
}

export const POST: RequestHandler = async ({ request }) => {
  const key = apiKey(request);
  if (!key) return Response.json({ error: 'Missing API key' }, { status: 403 });
  const rec = await getRecordByApiKey(key);
  if (!rec) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { dbId, sql } = await request.json();
  if (!dbId || !sql) return Response.json({ error: 'Missing dbId or sql' }, { status: 400 });

  const registry = await readRegistry();
  const dbRec = (registry as any)?.[dbId];
  if (!dbRec || dbRec._type !== 'database') return Response.json({ error: 'Database not found' }, { status: 404 });

  try {
    const dbData = await downloadDbBuffer(dbRec.telegramFileId);
    const SQL = await getSql();
    const db = new SQL.Database(dbData.length > 0 ? dbData : undefined);

    const statements = sql.split(';').filter((s: string) => s.trim());
    const results: any[] = [];

    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      try {
        const res = db.exec(stmt.trim());
        if (res.length > 0) {
          results.push({
            columns: res[0].columns,
            values: res[0].values,
          });
        }
      } catch (e: any) {
        return Response.json({ error: e.message || 'SQL error' }, { status: 400 });
      }
    }

    const isWrite = statements.some((s: string) => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(s));

    if (isWrite) {
      const data = db.export();
      await updateDatabaseFile(dbId, new Uint8Array(data));
    }

    db.close();
    return Response.json({ ok: true, results });
  } catch (e: any) {
    return Response.json({ error: e.message || 'Query failed' }, { status: 500 });
  }
};
