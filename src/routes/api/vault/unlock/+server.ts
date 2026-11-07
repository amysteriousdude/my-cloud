// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import type { VaultIndexPlain, VaultRegistryPlain } from '../_vault';
import {
  deriveVaultKey,
  randomBytes,
  sha256,
  saveVaultState,
  loadVaultIndex,
  exportVaultKey,
  getPinnedFileId,
  setVaultIndexCookie
} from '../_vault';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const body = await request.json().catch(() => null);
  const password = String(body?.password ?? '').trim();
  const userId = locals.user?.id || 'default_user';
  // Client-side pointer (localStorage). Survives cookie expiry / browser restart.
  const hintFileId = typeof body?.indexFileId === 'string' ? body.indexFileId.trim() : '';

  if (!password) {
    return json({ error: 'Password required' }, 400);
  }

  const cookieFileId = (cookies.get('vault_index_file_id') ?? '').trim();

  // Most specific pointer first: client hint, then cookie, then the chat pin.
  const candidates: string[] = [];
  for (const c of [hintFileId, cookieFileId, await getPinnedFileId()]) {
    if (c && !candidates.includes(c)) candidates.push(c);
  }

  let existing: VaultIndexPlain | null = null;
  let resolvedFileId: string | null = null;

  for (const fileId of candidates) {
    const index = await loadVaultIndex(fileId);
    if (!index) continue;
    if (index.userId !== userId) {
      return json({ error: 'Vault belongs to another user' }, 403);
    }
    existing = index;
    resolvedFileId = fileId;
    break;
  }

  if (!existing) {
    // A pointer that leads nowhere means an existing vault could not be
    // located — that is NOT the same as "this user never had a vault".
    // Previously this branch always minted a fresh empty one (new salt,
    // files: []), which is what silently wiped files on every re-unlock
    // and made a wrong passphrase "succeed". Refuse instead.
    if (hintFileId || cookieFileId) {
      return json(
        {
          error:
            'Vault index could not be loaded — its pointer is stale. Refusing to create a new vault over it.',
          pointer: hintFileId || cookieFileId
        },
        409
      );
    }

    const salt = randomBytes(16);
    const key = await deriveVaultKey(password, salt);
    const passwordHash = await sha256(password);

    const registry: VaultRegistryPlain = {
      version: 1,
      folders: [],
      files: [],
      updatedAt: Date.now()
    };

    const index: VaultIndexPlain = {
      version: 1,
      userId,
      salt: Buffer.from(salt).toString('base64'),
      hash: passwordHash,
      registryFileId: null,
      registryMessageId: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const result = await saveVaultState(key, index, registry);

    cookies.set('vault_session', passwordHash, {
      path: '/',
      httpOnly: true,
      secure: request.url.startsWith('https://'),
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30
    });

    cookies.set('vault_key', await exportVaultKey(key), {
      path: '/',
      httpOnly: true,
      secure: request.url.startsWith('https://'),
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30
    });

    if (result?.indexFileId) {
      setVaultIndexCookie(cookies, request, result.indexFileId);
    }

    return json({ ok: true, created: true, indexFileId: result?.indexFileId ?? null });
  }

  const passwordHash = await sha256(password);
  if (existing.hash !== passwordHash) {
    return json({ error: 'Wrong passphrase' }, 401);
  }

  const salt = Buffer.from(existing.salt, 'base64');
  const key = await deriveVaultKey(password, salt);

  cookies.set('vault_session', passwordHash, {
    path: '/',
    httpOnly: true,
    secure: request.url.startsWith('https://'),
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30
  });

  cookies.set('vault_key', await exportVaultKey(key), {
    path: '/',
    httpOnly: true,
    secure: request.url.startsWith('https://'),
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30
  });

  if (resolvedFileId) {
    setVaultIndexCookie(cookies, request, resolvedFileId);
  }

  return json({ ok: true, created: false, indexFileId: resolvedFileId });
};
