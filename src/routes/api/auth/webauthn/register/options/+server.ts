// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { loadPasskeys, sessionRec, setChallenge } from '$lib/passkeys';

const RP_NAME = process.env.PUBLIC_NAME
  ? `${process.env.PUBLIC_NAME}'s Cloud`
  : "Omar's Cloud";

export const POST: RequestHandler = async ({ url, cookies }) => {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const rec = await sessionRec(cookies);
  if (!rec) return json({ error: 'Not signed in' }, 401);

  let creds;
  try {
    creds = await loadPasskeys(rec);
  } catch {
    return json({ error: 'Could not reach storage' }, 503);
  }

  let options;
  try {
    options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: url.hostname,
      userName: rec.username || rec.discordId,
      userID: new TextEncoder().encode(rec.discordId),
      attestationType: 'none',
      excludeCredentials: creds.map((c) => ({
        id: c.id,
        transports: c.transports as any,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Failed to create options' }, 500);
  }

  setChallenge(cookies, options.challenge, 'reg');
  return json(options);
};
