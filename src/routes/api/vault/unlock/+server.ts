// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import type { VaultIndexPlain, VaultRegistryPlain } from '../_vault';
import {
  deriveVaultKey,
  randomBytes,
  sha256,
  saveVaultState,
  loadVaultIndex,
  loadVaultRegistry,
  exportVaultKey,
  getPinnedFileId,
  getVaultIndexFileIdFromSlot,
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

  // A chat has exactly one pin and writeIndex() takes it on every API-key
  // save, so the pin alone is not enough. Candidates in order of freshness:
  // client hint, cookie, the pin itself (it holds the vault index whenever
  // the vault saved last), then the slot writeIndex() writes when it steals
  // the pin away from a vault index.
  const [slotFileId, pinnedFileId] = await Promise.all([
    getVaultIndexFileIdFromSlot(),
    getPinnedFileId()
  ]);

  const candidates: string[] = [];
  for (const c of [hintFileId, cookieFileId, pinnedFileId, slotFileId]) {
    if (c && !candidates.includes(c)) candidates.push(c);
  }

  let existing: VaultIndexPlain | null = null;
  let resolvedFileId: string | null = null;
  const passwordHash = await sha256(password);
  // A pointer can name a perfectly readable index that simply isn't the vault
  // this password opens (a stale localStorage hint pointing at a vault the bug
  // minted, for example). That must not abort the search — otherwise one stale
  // candidate shadows every correct one behind it.
  let sawReadableIndex = false;
  let sawRightPasswordDeadRegistry = false;

  for (const fileId of candidates) {
    const index = await loadVaultIndex(fileId);
    if (!index) continue;
    if (index.userId !== userId) {
      return json({ error: 'Vault belongs to another user' }, 403);
    }
    sawReadableIndex = true;
    // hash is unsalted sha256(password), so a mismatch means "not this vault".
    // Keep looking; the outcome is decided once the whole list is exhausted.
    if (index.hash !== passwordHash) continue;
    // A pointer can outlive the registry it names (uploads delete the previous
    // one). Reject it and try the next candidate rather than unlocking into a
    // vault whose file list is about to 500.
    if (!index.registryFileId) {
      sawRightPasswordDeadRegistry = true;
      continue;
    }
    try {
      const candidateKey = await deriveVaultKey(
        password,
        Buffer.from(index.salt, 'base64')
      );
      await loadVaultRegistry(candidateKey, index.registryFileId);
    } catch {
      sawRightPasswordDeadRegistry = true;
      continue;
    }

    existing = index;
    resolvedFileId = fileId;
    break;
  }

  if (!existing) {
    // Password was right but the registry it points at is gone — a data
    // problem, not an authentication one. Don't report it as a bad password.
    if (sawRightPasswordDeadRegistry) {
      return json(
        {
          error:
            'Vault index found, but its registry is missing or unreadable — the files it lists cannot be loaded.',
          pointer: resolvedFileId ?? hintFileId ?? cookieFileId ?? null
        },
        409
      );
    }
    // Readable index, no hash matched: either the passphrase is wrong or the
    // pointers all name a different vault. Either way creating one would be
    // destructive, so refuse rather than guess.
    if (sawReadableIndex) {
      return json({ error: 'Wrong passphrase' }, 401);
    }

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
