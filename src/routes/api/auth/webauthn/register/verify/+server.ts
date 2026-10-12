// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { loadPasskeys, savePasskeys, sessionRec, takeChallenge, toStored } from '$lib/passkeys';

export const POST: RequestHandler = async ({ url, cookies, request }) => {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const rec = await sessionRec(cookies);
  if (!rec) return json({ error: 'Not signed in' }, 401);

  const expectedChallenge = takeChallenge(cookies, 'reg');
  if (!expectedChallenge) return json({ error: 'Challenge expired, try again' }, 400);

  const body = await request.json().catch(() => null);
  if (!body?.response) return json({ error: 'Missing response' }, 400);
  const label = String(body.label ?? 'Passkey').slice(0, 64) || 'Passkey';

  let result;
  try {
    result = await verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: url.origin,
      expectedRPID: url.hostname,
      requireUserVerification: false,
    });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Verification failed' }, 400);
  }

  if (!result.verified || !result.registrationInfo) {
    return json({ error: 'Verification failed' }, 400);
  }

  const { credential } = result.registrationInfo;
  const transports = (body.response.response?.transports ?? credential.transports ?? []) as string[];

  let creds;
  try {
    creds = await loadPasskeys(rec);
  } catch {
    return json({ error: 'Could not reach storage' }, 503);
  }

  if (creds.some((c) => c.id === credential.id)) {
    return json({ error: 'This passkey is already registered' }, 409);
  }

  creds.push(toStored({ ...credential, publicKey: new Uint8Array(credential.publicKey), transports }, label));

  try {
    await savePasskeys(rec, creds);
  } catch {
    return json({ error: 'Could not save passkey' }, 503);
  }

  return json({ ok: true, id: credential.id, label });
};
