import type { RequestHandler } from './$types';
import type { VaultIndexPlain, VaultRegistryPlain } from '../_vault';
import {
  deriveVaultKey,
  randomBytes,
  sha256,
  saveVaultState,
  loadVaultIndex,
  exportVaultKey,
  getPinnedFileId
} from '../_vault';

function cookieSecure(request: Request) {
  const proto = request.headers.get('x-forwarded-proto');
  return request.url.startsWith('https://') || proto === 'https';
}

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const body = await request.json().catch(() => null);
  const password = String(body?.password ?? '').trim();
  const userId = locals.user?.id || 'default_user';

  if (!password) {
    return new Response(JSON.stringify({ error: 'Password required' }), { status: 400 });
  }

  const existing = await loadVaultIndex();

  if (!existing) {
    const salt = randomBytes(16);
    const key = await deriveVaultKey(password, salt);
    const passwordHash = await sha256(password);

    const registry: VaultRegistryPlain = {
      version: 1,
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
      secure: cookieSecure(request),
      sameSite: 'strict',
      maxAge: 3600
    });

    cookies.set('vault_key', await exportVaultKey(key), {
      path: '/',
      httpOnly: true,
      secure: cookieSecure(request),
      sameSite: 'strict',
      maxAge: 3600
    });

    if (result?.indexFileId) {
      cookies.set('vault_index_file_id', result.indexFileId, {
        path: '/',
        httpOnly: true,
        secure: cookieSecure(request),
        sameSite: 'strict',
        maxAge: 3600
      });
    }

    return new Response(JSON.stringify({ ok: true, created: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (existing.userId !== userId) {
    return new Response(JSON.stringify({ error: 'Vault belongs to another user' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const passwordHash = await sha256(password);
  if (existing.hash !== passwordHash) {
    return new Response(JSON.stringify({ error: 'Wrong passphrase' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const salt = Buffer.from(existing.salt, 'base64');
  const key = await deriveVaultKey(password, salt);

  cookies.set('vault_session', passwordHash, {
    path: '/',
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: 'strict',
    maxAge: 3600
  });

  cookies.set('vault_key', await exportVaultKey(key), {
    path: '/',
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: 'strict',
    maxAge: 3600
  });

  const pinnedFileId = await getPinnedFileId();
  if (pinnedFileId) {
    cookies.set('vault_index_file_id', pinnedFileId, {
      path: '/',
      httpOnly: true,
      secure: cookieSecure(request),
      sameSite: 'strict',
      maxAge: 3600
    });
  }

  return new Response(JSON.stringify({ ok: true, created: false }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
