import type { RequestHandler } from './$types';
import { getRecordByApiKey, listDatabases, createDatabase, deleteDatabase, renameDatabase, toggleDatabaseFavorite, updateDatabaseFile } from '$lib/telegramStorage';

function apiKey(req: Request) {
  return (req.headers.get('x-api-key') ?? '').trim();
}

export const GET: RequestHandler = async ({ request, url, cookies }) => {
  let key = apiKey(request) || url.searchParams.get('api_key') || '';
  if (!key) {
    try {
      const session = cookies.get('session');
      if (session) {
        const { decrypt } = await import('$lib/crypto');
        key = decrypt(session) ?? '';
      }
    } catch {}
  }
  const rec = await getRecordByApiKey(key);
  if (!rec) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const databases = await listDatabases();
  return Response.json({ databases });
};

export const POST: RequestHandler = async ({ request, url, cookies }) => {
  let key = apiKey(request) || url.searchParams.get('api_key') || '';
  if (!key) {
    try {
      const session = cookies.get('session');
      if (session) {
        const { decrypt } = await import('$lib/crypto');
        key = decrypt(session) ?? '';
      }
    } catch {}
  }
  const rec = await getRecordByApiKey(key);
  if (!rec) return Response.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await request.json();

    if (body.action === 'create') {
      let bytes: Uint8Array;
      if (body.data) {
        bytes = Uint8Array.from(atob(body.data), c => c.charCodeAt(0));
      } else {
        // Minimal valid SQLite database (header only)
        const header = new Uint8Array(100);
        const encoder = new TextEncoder();
        const sig = encoder.encode('SQLite format 3\0');
        header.set(sig);
        header[16] = 64; // page size 64
        header[18] = 1;  // file format write version
        header[19] = 1;  // file format read version
        header[20] = 64; // reserved space
        header[21] = 1;  // max embedded payload fraction
        header[22] = 64; // min embedded payload fraction
        header[23] = 32; // leaf payload fraction
        header[28] = 1;  // file change counter (4 bytes BE)
        header[56] = 2;  // page count (4 bytes BE) — 2 pages total
        bytes = header;
      }
      if (bytes.length === 0) return Response.json({ error: 'Database file is empty' }, { status: 400 });
      const db = await createDatabase(body.name || 'Untitled DB', bytes, body.description, body.folderId);
      return Response.json({ database: db });
    }

    if (body.action === 'import') {
      const bytes = Uint8Array.from(atob(body.data), c => c.charCodeAt(0));
      const db = await createDatabase(body.name || 'Imported DB', bytes, body.description, body.folderId);
      return Response.json({ database: db });
    }

    if (body.action === 'delete') {
      const ok = await deleteDatabase(body.dbId);
      return Response.json({ ok });
    }

    if (body.action === 'rename') {
      const ok = await renameDatabase(body.dbId, body.name);
      return Response.json({ ok });
    }

    if (body.action === 'toggleFavorite') {
      const ok = await toggleDatabaseFavorite(body.dbId);
      return Response.json({ ok });
    }

    if (body.action === 'update') {
      const bytes = Uint8Array.from(atob(body.data), c => c.charCodeAt(0));
      const ok = await updateDatabaseFile(body.dbId, bytes);
      return Response.json({ ok });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('database api error:', err?.message || err);
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
};
