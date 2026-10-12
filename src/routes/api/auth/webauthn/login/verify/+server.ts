// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { encrypt } from '$lib/crypto';
import { readIndex } from '$lib/telegramStorage';
import { fromB64url, loadPasskeys, savePasskeys, takeChallenge } from '$lib/passkeys';

export const POST: RequestHandler = async ({ url, cookies, request }) => {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const expectedChallenge = takeChallenge(cookies, 'auth');
  if (!expectedChallenge) return json({ error: 'Challenge expired, try again' }, 400);

  const response = (await request.json().catch(() => null)) as AuthenticationResponseJSON | null;
  if (!response?.id) return json({ error: 'Missing response' }, 400);

  let index;
  try {
    index = await readIndex();
  } catch {
    return json({ error: 'Could not reach storage' }, 503);
  }

  const rec = Object.values(index).find((r) => r.passkeys?.fileId);
  if (!rec) return json({ error: 'No passkeys registered' }, 404);

  let creds;
  try {
    creds = await loadPasskeys(rec);
  } catch {
    return json({ error: 'Could not reach storage' }, 503);
  }

  const stored = creds.find((c) => c.id === response.id);
  if (!stored) return json({ error: 'Unknown passkey' }, 400);

  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: url.origin,
      expectedRPID: url.hostname,
      credential: {
        id: stored.id,
        publicKey: fromB64url(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports as any,
      },
      requireUserVerification: false,
    });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Verification failed' }, 400);
  }

  if (!result.verified) return json({ error: 'Verification failed' }, 400);

  stored.counter = result.authenticationInfo.newCounter;
  try {
    await savePasskeys(rec, creds);
  } catch {
    return json({ error: 'Could not update counter' }, 503);
  }

  cookies.set('session', encrypt(rec.apiKey), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return json({
    ok: true,
    username: rec.username,
    discordId: rec.discordId,
    createdAt: rec.createdAt,
  });
};
