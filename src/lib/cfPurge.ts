// src/lib/cfPurge.ts
// Automatic Cloudflare cache purging after file mutations.
// Requires CF_API_TOKEN and CF_ZONE_ID env vars.
// All functions are non-blocking (fire-and-forget) and silently no-op if unconfigured.

const CF_API_TOKEN = process.env.CF_API_TOKEN || '';
const CF_ZONE_ID = process.env.CF_ZONE_ID || '';
const CF_API = 'https://api.cloudflare.com/client/v4';
const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://cloud.omarplayz.eu.org';

function configured(): boolean {
  return !!(CF_API_TOKEN && CF_ZONE_ID);
}

// ── Low-level purge ────────────────────────────────────────────────────────

async function postPurge(body: Record<string, any>): Promise<void> {
  if (!configured()) return;
  try {
    const res = await fetch(`${CF_API}/zones/${CF_ZONE_ID}/purge_cache`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json() as any;
    if (!data?.success) {
      console.error('cfPurge: failed:', data?.errors || data);
    } else {
      console.log('cfPurge: OK', JSON.stringify(body).slice(0, 200));
    }
  } catch (e) {
    console.error('cfPurge: error:', (e as Error).message);
  }
}

/** Purge specific URLs */
export async function purgeUrls(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  await postPurge({ files: urls });
}

/** Purge by URL prefix (e.g. "cloud.omarplayz.eu.org/public/") */
export async function purgePrefixes(prefixes: string[]): Promise<void> {
  if (prefixes.length === 0) return;
  await postPurge({ prefixes });
}

/** Purge everything */
export async function purgeAll(): Promise<void> {
  await postPurge({ purge_everything: true });
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function publicUrl(slug: string): string {
  return `${BASE_URL}/public/${slug}`;
}

export async function purgeBySlug(slug: string): Promise<void> {
  if (!slug) return;
  await purgeUrls([publicUrl(slug)]);
}

export async function purgeBySlugs(slugs: string[]): Promise<void> {
  const urls = slugs.filter(Boolean).map(publicUrl);
  if (urls.length > 0) await purgeUrls(urls);
}

/** Purge all public file URLs (prefix match) */
export async function purgePublicFiles(): Promise<void> {
  await purgePrefixes([`${BASE_URL.replace(/^https?:\/\//, '')}/public/`]);
}

// ── Registry-aware slug lookup ─────────────────────────────────────────────

/**
 * Compute the public slug for a registry entry by walking up the folder tree.
 * Returns null if the file has no folder hierarchy.
 */
export async function computeSlug(metaFileId: string): Promise<string | null> {
  try {
    const { readRegistry } = await import('$lib/telegramStorage');
    const registry = (await readRegistry()) as Record<string, any>;
    const rec = registry[metaFileId];
    if (!rec || rec._type === 'folder') return null;

    // Always walk folder tree for current path (publicSlug may be stale)
    const parts = [rec.fileName];
    let folderId = rec.folderId || null;
    const seen = new Set<string>();
    while (folderId) {
      if (seen.has(folderId)) break;
      seen.add(folderId);
      const folder = registry[folderId];
      if (!folder || folder._type !== 'folder') break;
      parts.unshift(folder.name);
      folderId = folder.parentId || null;
    }
    return decodeURIComponent(parts.join('/'))
      .replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/{2,}/g, '/');
  } catch {
    return null;
  }
}

/**
 * Purge the public URL for a file by its metaFileId.
 * Looks up the slug from the registry and purges the corresponding URL.
 */
export async function purgeByMetaFileId(metaFileId: string): Promise<void> {
  const slug = await computeSlug(metaFileId);
  if (slug) await purgeUrls([publicUrl(slug)]);
}
