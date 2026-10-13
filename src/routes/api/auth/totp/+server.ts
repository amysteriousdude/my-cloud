// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import { loadAuthBlob, saveAuthBlob, sessionRec } from '$lib/passkeys';
import { generateTotpSecret, totpUri, verifyTotp } from '$lib/totp';

export const GET: RequestHandler = async ({ cookies }) => {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const rec = await sessionRec(cookies);
  if (!rec) return json({ error: 'Not signed in' }, 401);

  let blob;
  try {
    blob = await loadAuthBlob(rec);
  } catch {
    return json({ error: 'Could not reach storage' }, 503);
  }
  return json({ enabled: !!blob.totp });
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const rec = await sessionRec(cookies);
  if (!rec) return json({ error: 'Not signed in' }, 401);

  let body: any = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = {};
  }

  const action = String(body.action ?? '');

  if (action === 'setup') {
    try {
      const secret = generateTotpSecret();
      const account = rec.username || rec.discordId || 'account';
      return json({
        secret,
        uri: totpUri(secret, account),
      });
    } catch (err: any) {
      return json({ error: 'Setup failed: ' + (err?.message ?? err) }, 500);
    }
  }

  if (action === 'enable') {
    const { secret, code } = body;
    if (!secret || !code) return json({ error: 'Missing secret or code' }, 400);
    if (!verifyTotp(String(secret), String(code))) {
      return json({ error: 'Wrong code, try again' }, 400);
    }

    let blob;
    try {
      blob = await loadAuthBlob(rec);
    } catch {
      return json({ error: 'Could not reach storage' }, 503);
    }
    blob.totp = String(secret);
    try {
      await saveAuthBlob(rec, blob);
    } catch {
      return json({ error: 'Could not save' }, 503);
    }
    return json({ ok: true });
  }

  if (action === 'disable') {
    const code = String(body.code ?? '');
    let blob;
    try {
      blob = await loadAuthBlob(rec);
    } catch {
      return json({ error: 'Could not reach storage' }, 503);
    }
    if (!blob.totp) return json({ error: 'TOTP not enabled' }, 400);
    if (!verifyTotp(blob.totp, code)) return json({ error: 'Wrong code' }, 400);
    blob.totp = undefined;
    try {
      await saveAuthBlob(rec, blob);
    } catch {
      return json({ error: 'Could not save' }, 503);
    }
    return json({ ok: true });
  }

  return json({ error: 'Unknown action: ' + action }, 400);
};
