// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import { loadPasskeys, savePasskeys, sessionRec } from '$lib/passkeys';

export const GET: RequestHandler = async ({ cookies }) => {
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

  return json({
    passkeys: creds.map((c) => ({
      id: c.id,
      label: c.label,
      createdAt: c.createdAt,
      transports: c.transports ?? [],
    })),
  });
};

export const PATCH: RequestHandler = async ({ cookies, request }) => {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const rec = await sessionRec(cookies);
  if (!rec) return json({ error: 'Not signed in' }, 401);

  const { id, label } = await request.json().catch(() => ({ id: '', label: '' }));
  if (!id) return json({ error: 'Missing id' }, 400);
  const clean = String(label ?? '').trim().slice(0, 64);
  if (!clean) return json({ error: 'Label must be 1-64 characters' }, 400);

  let creds;
  try {
    creds = await loadPasskeys(rec);
  } catch {
    return json({ error: 'Could not reach storage' }, 503);
  }

  const cred = creds.find((c) => c.id === id);
  if (!cred) return json({ error: 'Passkey not found' }, 404);

  cred.label = clean;
  try {
    await savePasskeys(rec, creds);
  } catch {
    return json({ error: 'Could not rename passkey' }, 503);
  }

  return json({ ok: true, label: clean });
};

export const DELETE: RequestHandler = async ({ cookies, request }) => {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const rec = await sessionRec(cookies);
  if (!rec) return json({ error: 'Not signed in' }, 401);

  const { id } = await request.json().catch(() => ({ id: '' }));
  if (!id) return json({ error: 'Missing id' }, 400);

  let creds;
  try {
    creds = await loadPasskeys(rec);
  } catch {
    return json({ error: 'Could not reach storage' }, 503);
  }

  const next = creds.filter((c) => c.id !== id);
  if (next.length === creds.length) return json({ error: 'Passkey not found' }, 404);

  try {
    await savePasskeys(rec, next);
  } catch {
    return json({ error: 'Could not remove passkey' }, 503);
  }

  return json({ ok: true, remaining: next.length });
};
