// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { readIndex } from '$lib/telegramStorage';
import { loadPasskeys, setChallenge } from '$lib/passkeys';

export const POST: RequestHandler = async ({ url, cookies }) => {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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
  if (!creds.length) return json({ error: 'No passkeys registered' }, 404);

  let options;
  try {
    options = await generateAuthenticationOptions({
      rpID: url.hostname,
      allowCredentials: creds.map((c) => ({
        id: c.id,
        transports: c.transports as any,
      })),
      userVerification: 'preferred',
    });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Failed to create options' }, 500);
  }

  setChallenge(cookies, options.challenge, 'auth');
  return json(options);
};
