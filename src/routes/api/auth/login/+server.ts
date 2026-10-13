// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import { getRecordByApiKey, readIndex } from '$lib/telegramStorage';
import { encrypt } from '$lib/crypto';
import { loadAuthBlob } from '$lib/passkeys';
import { verifyTotp } from '$lib/totp';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { apiKey, code } = await request.json();

  if (!apiKey)
    return new Response(JSON.stringify({ error: 'Missing apiKey' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });

  let rec;
  try {
    rec = await getRecordByApiKey(apiKey);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to verify token: ' + ((err as any).message || err) }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!rec) {
    const index = await readIndex().catch(() => ({}));
    const error = Object.keys(index).length === 0
      ? 'Index is empty — the pinned Telegram message may have been lost. Use Discord OAuth to re-seed.'
      : 'Invalid token';
    return new Response(JSON.stringify({ error }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    });
  }

  if (rec.passkeys?.fileId) {
    const blob = await loadAuthBlob(rec).catch(() => null);
    if (blob?.totps?.length) {
      if (!code) {
        return new Response(JSON.stringify({ error: 'Authenticator code required', totpRequired: true }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        });
      }
      const ok = blob.totps.some((t) => verifyTotp(t.secret, String(code)));
      if (!ok) {
        return new Response(JSON.stringify({ error: 'Wrong authenticator code' }), {
          status: 403, headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }

  const encrypted = encrypt(apiKey);

  cookies.set('session', encrypted, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });

  return new Response(JSON.stringify({
    ok: true,
    username: rec.username,
    discordId: rec.discordId,
    createdAt: rec.createdAt
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
