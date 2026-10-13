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
  return json({
    totps: (blob.totps ?? []).map((t) => ({
      label: t.label,
      createdAt: t.createdAt,
    })),
  });
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
    const { secret, code, label } = body;
    if (!secret || !code) return json({ error: 'Missing secret or code' }, 400);
    if (!(await verifyTotp(String(secret), String(code)))) {
      return json({ error: 'Wrong code, try again' }, 400);
    }

    let blob;
    try {
      blob = await loadAuthBlob(rec);
    } catch {
      return json({ error: 'Could not reach storage' }, 503);
    }
    const totps = blob.totps ?? [];
    if (totps.some((t) => t.secret === String(secret))) {
      return json({ error: 'Already added' }, 409);
    }
    totps.push({
      secret: String(secret),
      label: String(label ?? `Authenticator ${totps.length + 1}`).slice(0, 64),
      createdAt: new Date().toISOString(),
    });
    blob.totps = totps;
    try {
      await saveAuthBlob(rec, blob);
    } catch {
      return json({ error: 'Could not save' }, 503);
    }
    return json({ ok: true, count: totps.length });
  }

  if (action === 'remove') {
    const { label, code } = body;
    let blob;
    try {
      blob = await loadAuthBlob(rec);
    } catch {
      return json({ error: 'Could not reach storage' }, 503);
    }
    const totps = blob.totps ?? [];
    if (!totps.length) return json({ error: 'No authenticators' }, 400);

    let idx = totps.findIndex((t) => t.label === label);
    if (idx < 0 && totps.length === 1) idx = 0;
    if (idx < 0) return json({ error: 'Not found' }, 404);

    if (code) {
      if (!(await verifyTotp(totps[idx].secret, String(code)))) {
        return json({ error: 'Wrong code' }, 400);
      }
    }

    totps.splice(idx, 1);
    blob.totps = totps;
    try {
      await saveAuthBlob(rec, blob);
    } catch {
      return json({ error: 'Could not save' }, 503);
    }
    return json({ ok: true, remaining: totps.length });
  }

  return json({ error: 'Unknown action: ' + action }, 400);
};
