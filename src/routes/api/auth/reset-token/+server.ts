// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import { decrypt, encrypt } from '$lib/crypto';
import { getRecordByApiKey, saveRecord } from '$lib/telegramStorage';

export const POST: RequestHandler = async ({ cookies }) => {
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

  const newKey = crypto.randomUUID();
  rec.apiKey = newKey;
  try {
    await saveRecord(rec);
  } catch {
    return json({ error: 'Could not rotate token' }, 503);
  }

  cookies.set('session', encrypt(newKey), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });

  return json({ ok: true, apiKey: newKey });
};
