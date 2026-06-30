// src/routes/api/telegram/getRequestFile/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey } from '$lib/telegramStorage';
import { env } from '$env/dynamic/private';

const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN!;
const TELE_API  = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Cache ──────────────────────────────────────────────────────────────────
// Telegram CDN URLs expire after ~1h; cache them for 50min to be safe.
// Meta JSON almost never changes so cache for 10min.
const CDN_URL_TTL  = 50 * 60 * 1000;
const META_TTL     = 10 * 60 * 1000;

const cdnUrlCache  = new Map<string, { url: string; exp: number }>();
const metaCache    = new Map<string, { meta: any; exp: number }>();

async function getTelegramUrl(file_id: string): Promise<string> {
  const cached = cdnUrlCache.get(file_id);
  if (cached && Date.now() < cached.exp) return cached.url;

  const r = await fetch(`${TELE_API}/getFile?file_id=${encodeURIComponent(file_id)}`);
  const j = await r.json() as any;
  if (!j.ok) throw new Error(`getFile failed: ${JSON.stringify(j)}`);
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${j.result.file_path}`;
  cdnUrlCache.set(file_id, { url, exp: Date.now() + CDN_URL_TTL });
  return url;
}

async function fetchMeta(metaFileId: string): Promise<any | null> {
  const cached = metaCache.get(metaFileId);
  if (cached && Date.now() < cached.exp) return cached.meta;

  try {
    const url  = await getTelegramUrl(metaFileId);
    const r    = await fetch(url);
    const meta = JSON.parse(await r.text());
    metaCache.set(metaFileId, { meta, exp: Date.now() + META_TTL });
    return meta;
  } catch { return null; }
}

// ──────────────────────────────────────────────────────────────────────────

function isPreviewable(type: string) {
  return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/') || type === 'application/pdf';
}

function parseRange(header: string, total: number) {
  const m = header.match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;
  const start = m[1] ? parseInt(m[1]) : total - parseInt(m[2]);
  const end   = m[2] ? Math.min(parseInt(m[2]), total - 1) : total - 1;
  return { start, end };
}

async function pumpToWriter(
  body: ReadableStream<Uint8Array> | null,
  writer: WritableStreamDefaultWriter<Uint8Array>
) {
  if (!body) throw new Error('Upstream body is null');
  const reader = body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) await writer.write(value);
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Cache-first chunk fetch ────────────────────────────────────────────────
// Chunks are cached during upload (0 extra subrequests). On download we hit
// cache first (0 subrequests). Only on cache-miss do we call Telegram CDN.
async function fetchChunkFromCacheOrOrigin(fileId: string): Promise<{ body: ReadableStream<Uint8Array>; fromCache: boolean }> {
  try {
    const cache = await caches.open('tg-chunks-v1');
    const cacheReq = new Request(`https://tg-cache/${fileId}`);
    const hit = await cache.match(cacheReq);
    if (hit?.body) return { body: hit.body, fromCache: true };
  } catch { /* cache unavailable — fall through to origin */ }

  // Cache miss: fetch from Telegram CDN
  const cdnUrl = await getTelegramUrl(fileId);
  const upstream = await fetch(cdnUrl);
  if (!upstream.ok) throw new Error(`Upstream failed: ${upstream.status}`);

  // Re-cache for next time (clone so we can return the original body)
  try {
    const cache = await caches.open('tg-chunks-v1');
    const cacheReq = new Request(`https://tg-cache/${fileId}`);
    await cache.put(cacheReq, upstream.clone());
  } catch { /* best-effort */ }

  return { body: upstream.body!, fromCache: false };
}

export const GET: RequestHandler = async ({ request, url }) => {
  const apiKey     = (request.headers.get('x-api-key')      ?? url.searchParams.get('api_key')      ?? '').trim();
  const metaFileId = (request.headers.get('x-meta-file-id') ?? url.searchParams.get('meta_file_id') ?? '').trim();
  const returnJson = (request.headers.get('x-json')         ?? url.searchParams.get('json')         ?? 'false') === 'true';
  const forceDown  = (request.headers.get('x-download')     ?? url.searchParams.get('download')     ?? 'false') === 'true';

  if (!apiKey)
    return new Response(JSON.stringify({ error: 'Missing api key' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const rec = await getRecordByApiKey(apiKey);
  if (!rec)
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  if (!metaFileId)
    return new Response(JSON.stringify({ error: 'Missing meta_file_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const meta = await fetchMeta(metaFileId);
    if (!meta)
      return new Response(JSON.stringify({ error: 'Could not fetch metadata' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    if (returnJson) {
      return new Response(JSON.stringify({
        fileName:    meta.fileName,
        mimeType:    meta.type,
        totalBytes:  meta.totalBytes,
        time:        meta.time,
        chunked:     meta.chunked ?? false,
        previewable: isPreviewable(meta.type),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const canPreview  = isPreviewable(meta.type) && !forceDown;
    const disposition = `${canPreview ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`;
    const totalBytes: number = meta.totalBytes ?? 0;
    const rangeHeader = request.headers.get('range');
    let cacheHits = 0;
    let cacheMisses = 0;

    // ── CHUNKED FILE ────────────────────────────────────────────────────────
    if (meta.chunked && Array.isArray(meta.chunks)) {
      const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);

      if (rangeHeader && totalBytes > 0) {
        const range = parseRange(rangeHeader, totalBytes);
        if (!range || range.start > range.end || range.start >= totalBytes)
          return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${totalBytes}` } });

        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();

        (async () => {
          try {
            let pos = 0;
            for (let i = 0; i < sorted.length; i++) {
              const chunkSize  = Number(sorted[i].size ?? 0);
              const chunkStart = pos;
              const chunkEnd   = pos + chunkSize - 1;
              pos += chunkSize;

              if (chunkEnd < range.start || chunkStart > range.end) continue;

              const overlapStart = Math.max(range.start, chunkStart) - chunkStart;
              const overlapEnd   = Math.min(range.end, chunkEnd) - chunkStart;

              // Cache-first: 0 subrequests on hit, falls back to Telegram CDN on miss
              const { body, fromCache } = await fetchChunkFromCacheOrOrigin(sorted[i].file_id);
              if (fromCache) cacheHits++; else cacheMisses++;

              // If we got the full chunk from cache, we need to slice the requested range
              const reader = body.getReader();
              let skipped = 0;
              let taken = 0;
              const need = overlapEnd - overlapStart + 1;
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (!value) continue;
                // Skip bytes before overlapStart
                if (skipped + value.length <= overlapStart) {
                  skipped += value.length;
                  continue;
                }
                // Trim leading bytes
                const startInChunk = Math.max(0, overlapStart - skipped);
                const sliced = value.slice(startInChunk);
                // Trim trailing bytes if we've taken enough
                if (taken + sliced.length > need) {
                  await writer.write(sliced.slice(0, need - taken));
                  taken = need;
                  break;
                }
                taken += sliced.length;
                await writer.write(sliced);
                skipped += value.length;
              }
            }
          } catch {
            // If upstream fails mid-stream, close. Client will see truncated transfer.
          } finally {
            await writer.close().catch(() => {});
          }
        })();

        return new Response(readable, {
          status: 206,
          headers: {
            'Content-Type':        meta.type,
            'Content-Disposition': disposition,
            'Content-Range':       `bytes ${range.start}-${range.end}/${totalBytes}`,
            'Content-Length':      String(range.end - range.start + 1),
            'Accept-Ranges':       'bytes',
            'Cache-Control':       'private, max-age=3600',
            'X-Cache':             cacheMisses === 0 ? 'HIT' : cacheHits === 0 ? 'MISS' : 'PARTIAL',
          },
        });
      }

      // Full chunked file — serve from cache, fall back to Telegram CDN per chunk
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      (async () => {
        let bytesWritten = 0;
        try {
          for (let i = 0; i < sorted.length; i++) {
            const chunk = sorted[i];
            const { body, fromCache } = await fetchChunkFromCacheOrOrigin(chunk.file_id);
            if (fromCache) cacheHits++; else cacheMisses++;

            const reader = body.getReader();
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) {
                await writer.write(value);
                bytesWritten += value.length;
              }
            }
          }
          if (totalBytes > 0 && bytesWritten !== totalBytes) {
            console.error(`Chunked stream mismatch: wrote ${bytesWritten} bytes but meta says ${totalBytes}`);
          }
        } catch (err) {
          console.error(`Chunked stream error after ${bytesWritten} bytes:`, (err as Error)?.message || err);
          try { await writer.abort(err as Error); } catch {}
          return;
        }
        await writer.close();
      })();

      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type':        meta.type,
          'Content-Disposition': disposition,
          ...(totalBytes > 0 ? { 'Content-Length': String(totalBytes) } : {}),
          'Accept-Ranges':       'bytes',
          'Cache-Control':       'private, max-age=3600',
          'X-Cache':             cacheMisses === 0 ? 'HIT' : cacheHits === 0 ? 'MISS' : 'PARTIAL',
        },
      });
    }

    // ── SINGLE FILE ─────────────────────────────────────────────────────────
    const cdnUrl = await getTelegramUrl(meta.telegramFileId);

    if (rangeHeader && totalBytes > 0) {
      const range = parseRange(rangeHeader, totalBytes);
      if (!range || range.start > range.end || range.start >= totalBytes)
        return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${totalBytes}` } });
      const upstream = await fetch(cdnUrl, { headers: { Range: `bytes=${range.start}-${range.end}` } });
      if (!upstream.ok) {
        return new Response(`Upstream failed: ${upstream.status}`, { status: 502 });
      }
      return new Response(upstream.body, {
        status: 206,
        headers: {
          'Content-Type':        meta.type,
          'Content-Disposition': disposition,
          'Content-Range':       `bytes ${range.start}-${range.end}/${totalBytes}`,
          'Content-Length':      String(range.end - range.start + 1),
          'Accept-Ranges':       'bytes',
          'Cache-Control':       'private, max-age=3600',
          'X-Cache':             'MISS',
        },
      });
    }

    const upstream = await fetch(cdnUrl);
    if (!upstream.ok) {
      return new Response(`Upstream failed: ${upstream.status}`, { status: 502 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type':        meta.type,
        'Content-Disposition': disposition,
        ...(totalBytes > 0 ? { 'Content-Length': String(totalBytes) } : {}),
        'Accept-Ranges':       'bytes',
        'Cache-Control':       'private, max-age=3600',
        'X-Cache':             'MISS',
      },
    });

  } catch (err: any) {
    console.error('getRequestFile error:', err?.message || err);
    const msg = String(err?.message ?? '');
    if (msg.includes('Bad Request: file is too big')) {
      return new Response(JSON.stringify({
        error: 'Telegram Bot API cannot download this file (file is too big). Re-upload it using chunk size <= 18MiB so it becomes a chunked file.'
      }), { status: 413, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
