// src/routes/api/telegram/dedup/+server.ts
// One-shot registry dedup: removes duplicate file entries (same fileName + folderId, keeps newest).
// POST with x-api-key header. Optionally pass ?dryRun=true to preview without writing.

import type { RequestHandler } from './$types';
import { getRecordByApiKey, readRegistry } from '$lib/telegramStorage';
import { purgePublicFiles } from '$lib/cfPurge';

export const POST: RequestHandler = async ({ request, url }) => {
  const apiKey = (request.headers.get('x-api-key') ?? '').trim();
  if (!apiKey) return new Response(JSON.stringify({ error: 'Missing api key' }), { status: 403 });

  const rec = await getRecordByApiKey(apiKey);
  if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const dryRun = url.searchParams.get('dryRun') === 'true';

  try {
    const registry = (await readRegistry(true)) as Record<string, any>;

    // Group file entries by fileName + folderId
    const groups = new Map<string, string[]>();
    for (const [key, entry] of Object.entries(registry)) {
      if (!entry || (entry as any)._type) continue;
      const composite = `${(entry as any).fileName}|||${(entry as any).folderId || ''}`;
      const keys = groups.get(composite) || [];
      keys.push(key);
      groups.set(composite, keys);
    }

    // Find duplicates (groups with more than one entry)
    const toRemove: string[] = [];
    for (const [composite, keys] of groups) {
      if (keys.length <= 1) continue;

      // Sort by time descending — keep the newest
      keys.sort((a, b) => {
        const timeA = (registry[a] as any)?.time || '';
        const timeB = (registry[b] as any)?.time || '';
        return timeB.localeCompare(timeA);
      });

      // Remove all but the first (newest)
      for (let i = 1; i < keys.length; i++) {
        toRemove.push(keys[i]);
      }
    }

    // Also find orphan entries (references to deleted TG messages)
    // These are entries where the metaFileId points to a non-existent TG message
    // We can't easily check this without hitting the TG API for each, so skip for now

    const removed: any[] = [];
    if (!dryRun && toRemove.length > 0) {
      for (const key of toRemove) {
        const entry = registry[key];
        console.log(`dedup: removing ${key} — ${(entry as any)?.fileName} (${(entry as any)?.time})`);
        removed.push({ key, fileName: (entry as any)?.fileName, time: (entry as any)?.time });
        delete registry[key];
      }

      // Write back cleaned registry
      const { writeRegistry } = await import('$lib/telegramStorage');
      await writeRegistry(registry);

      // Purge CF cache since public URLs may have changed
      purgePublicFiles().catch(() => {});
    }

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      duplicatesFound: toRemove.length,
      removed,
      totalEntries: Object.keys(registry).length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('dedup error:', err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500 });
  }
};
