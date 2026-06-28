import type { RequestHandler } from './$types';
import { getRecordByApiKey, readRegistry } from '$lib/telegramStorage';

function apiKey(req: Request) {
  return (req.headers.get('x-api-key') ?? '').trim();
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  let key = apiKey(request);
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
    const { dbId } = await request.json();
    const registry = await readRegistry();
    const dbRec = registry[dbId];
    if (!dbRec || dbRec._type !== 'database') {
      return Response.json({ error: 'Database not found' }, { status: 404 });
    }
    return Response.json({
      telegramFileId: dbRec.telegramFileId,
      name: dbRec.name,
    });
  } catch (err: any) {
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
};
