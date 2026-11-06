// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import { getRecordByApiKey, readRegistry, writeRegistry } from '$lib/telegramStorage';
import crypto from 'crypto';

function apiKey(req: Request) {
  return (req.headers.get('x-api-key') ?? '').trim();
}

function normalizeFolderId(id: string | null | undefined) {
  if (!id) return null;
  if (id === 'root' || id === 'null' || id === 'undefined') return null;
  if (id.startsWith('tmp:')) return null;
  return id;
}

export const GET: RequestHandler = async ({ request, url, cookies }) => {
  try {
    let key =
      request.headers.get('x-api-key') ??
      url.searchParams.get('api_key') ??
      '';

    key = key.trim();

    if (!key) {
      try {
        const session = cookies.get('session');
        if (session) {
          const { decrypt } = await import('$lib/crypto');
          key = decrypt(session) ?? '';
        }
      } catch {}
    }

    const rec = await getRecordByApiKey(key);
    if (!rec) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403
      });
    }

    const raw = await readRegistry(true);
    const registry: Record<string, any> = JSON.parse(JSON.stringify(raw));

    // Cleanup: reassign unique metaFileIds to any duplicate entries.
    // Old duplicate code copied metaFileId, causing Svelte each_key_duplicate crashes.
    let needsWrite = false;
    const seenMetaIds = new Set<string>();
    for (const [key, item] of Object.entries(registry)) {
      if (!item || item._type) continue;
      const mid = item.metaFileId;
      if (!mid) continue;
      if (seenMetaIds.has(mid)) {
        item.metaFileId = 'meta:' + crypto.randomUUID();
        needsWrite = true;
      } else {
        seenMetaIds.add(mid);
      }
    }
    if (needsWrite) await writeRegistry(registry);

    const folderId = normalizeFolderId(url.searchParams.get('folderId'));

    const files: any[] = [];
    const folders: any[] = [];

    for (const [key, item] of Object.entries(registry)) {
      if (!item) continue;

      if (item._type === 'folder') {
        const itemParent = normalizeFolderId(item.parentId);
        const isRootLevel = folderId === null && itemParent === null;
        const isChildMatch = folderId !== null && itemParent === folderId;

        if (folderId === null || isRootLevel || isChildMatch) {
          folders.push({
            ...item,
            id: item.folderId
          });
        }
        continue;
      }

      const fileFolder = normalizeFolderId(item.folderId);
      const isRootFiles = folderId === null && fileFolder === null;
      const isChildFiles = folderId !== null && fileFolder === folderId;

      if (folderId === null || isRootFiles || isChildFiles) {
        files.push({
          ...item,
          id: item.metaFileId || key
        });
      }
    }

    folders.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    files.sort((a, b) => (b.time || '').localeCompare(a.time || ''));

    return new Response(
      JSON.stringify({ folders, files }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0'
        }
      }
    );
  } catch (err: any) {
    console.error('ls api error:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal error' }),
      { status: 500 }
    );
  }
};
