// src/routes/api/database/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey, listDatabases, createDatabase, deleteDatabase, renameDatabase, toggleDatabaseFavorite, downloadFileFromTelegram } from '$lib/telegramStorage';

function apiKey(req: Request) {
  return (req.headers.get('x-api-key') ?? '').trim();
}

export const GET: RequestHandler = async ({ request }) => {
  const key = apiKey(request);
  if (!key) return Response.json({ error: 'Missing API key' }, { status: 403 });
  const rec = await getRecordByApiKey(key);
  if (!rec) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const databases = await listDatabases();
  return Response.json({ databases });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const key = apiKey(request);
    if (!key) return Response.json({ error: 'Missing API key' }, { status: 403 });
    const rec = await getRecordByApiKey(key);
    if (!rec) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const name = (body.name || 'Untitled').trim();
      const description = (body.description || '').trim();
      const db = await createDatabase(name, new Uint8Array(0), description || undefined);
      return Response.json({ ok: true, database: db });
    }

    if (action === 'import') {
      const name = (body.name || 'imported').trim();
      const base64Data = body.data;
      if (!base64Data) return Response.json({ error: 'No data provided' }, { status: 400 });
      const data = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const db = await createDatabase(name, data);
      return Response.json({ ok: true, database: db });
    }

    if (action === 'delete') {
      const { dbId } = body;
      if (!dbId) return Response.json({ error: 'Missing dbId' }, { status: 400 });
      const ok = await deleteDatabase(dbId);
      return Response.json({ ok });
    }

    if (action === 'rename') {
      const { dbId, name } = body;
      if (!dbId || !name) return Response.json({ error: 'Missing dbId or name' }, { status: 400 });
      const ok = await renameDatabase(dbId, name.trim());
      return Response.json({ ok });
    }

    if (action === 'toggleFavorite') {
      const { dbId } = body;
      if (!dbId) return Response.json({ error: 'Missing dbId' }, { status: 400 });
      const ok = await toggleDatabaseFavorite(dbId);
      return Response.json({ ok });
    }

    if (action === 'download') {
      const { dbId } = body;
      if (!dbId) return Response.json({ error: 'Missing dbId' }, { status: 400 });
      const registry = await (await import('$lib/telegramStorage')).readRegistry();
      const dbRec = (registry as any)?.[dbId];
      if (!dbRec || dbRec._type !== 'database') return Response.json({ error: 'Not found' }, { status: 404 });
      const { data } = await downloadFileFromTelegram(dbRec.telegramFileId);
      return new Response(data, {
        headers: {
          'Content-Type': 'application/x-sqlite3',
          'Content-Disposition': `attachment; filename="${dbRec.name}.sqlite"`,
        }
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('database api error:', err?.message || err);
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
};
