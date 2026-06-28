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
      if (body.data && body.data.length > 0) {
        bytes = Uint8Array.from(atob(body.data), c => c.charCodeAt(0));
      }
      if (!bytes || bytes.length === 0) {
        // Minimal valid SQLite database
        bytes = new Uint8Array(100);
        const encoder = new TextEncoder();
        bytes.set(encoder.encode('SQLite format 3\0'));
        bytes[16] = 64;
        bytes[18] = 1;
        bytes[19] = 1;
        bytes[20] = 64;
        bytes[21] = 1;
        bytes[22] = 64;
        bytes[23] = 32;
        bytes[28] = 1;
        bytes[56] = 2;
      }
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
