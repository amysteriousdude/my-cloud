// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey, saveRecord } from '$lib/telegramStorage';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const session = cookies.get('session');
  const apiKey = session ? decrypt(session) : null;
  if (!apiKey) return json({ error: 'Not signed in' }, 401);

  let rec;
  try {
    rec = await getRecordByApiKey(apiKey);
  } catch {
    return json({ error: 'Could not reach storage' }, 503);
  }
  if (!rec) return json({ error: 'Invalid session' }, 401);

  const { username } = await request.json().catch(() => ({ username: '' }));
  const clean = String(username ?? '').trim();
  if (!clean || clean.length > 32) return json({ error: 'Username must be 1-32 characters' }, 400);

  rec.username = clean;
  try {
    await saveRecord(rec);
  } catch {
    return json({ error: 'Could not save username' }, 503);
  }

  return json({ ok: true, username: clean });
};
