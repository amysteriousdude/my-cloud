import type { RequestHandler } from './$types';
import { getPublicFileByPath, getPublicFolderByPath } from '$lib/telegramStorage';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── CDN URL cache (avoids repeated Telegram API calls) ──────────────────────
const CDN_URL_TTL = 50 * 60 * 1000;
const cdnUrlCache = new Map<string, { url: string; exp: number }>();

async function getTgUrl(fileId: string): Promise<string | null> {
  const cached = cdnUrlCache.get(fileId);
  if (cached && Date.now() < cached.exp) return cached.url;

  try {
    const r = await fetch(`${TELE_API}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const j = await r.json() as any;
    if (!j?.ok) return null;
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${j.result.file_path}`;
    cdnUrlCache.set(fileId, { url, exp: Date.now() + CDN_URL_TTL });
    return url;
  } catch { return null; }
}

// ── Cache-first chunk fetch (same pattern as getRequestFile) ────────────────
async function fetchChunkFromCacheOrOrigin(fileId: string): Promise<{ body: ReadableStream<Uint8Array>; fromCache: boolean }> {
  try {
    const cache = await caches.open('tg-chunks-v1');
    const cacheReq = new Request(`https://tg-cache/${fileId}`);
    const hit = await cache.match(cacheReq);
    if (hit?.body) return { body: hit.body, fromCache: true };
  } catch {}

  const cdnUrl = await getTgUrl(fileId);
  if (!cdnUrl) throw new Error('No CDN URL for chunk');
  const upstream = await fetch(cdnUrl);
  if (!upstream.ok) throw new Error(`Upstream failed: ${upstream.status}`);

  try {
    const cache = await caches.open('tg-chunks-v1');
    const cacheReq = new Request(`https://tg-cache/${fileId}`);
    await cache.put(cacheReq, upstream.clone());
  } catch {}

  return { body: upstream.body!, fromCache: false };
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'mkv': return 'video/x-matroska';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain; charset=utf-8';
    case 'md': return 'text/markdown; charset=utf-8';
    case 'json': return 'application/json; charset=utf-8';
    case 'html': return 'text/html; charset=utf-8';
    case 'css': return 'text/css; charset=utf-8';
    case 'js': return 'text/javascript; charset=utf-8';
    case 'ts': return 'text/plain; charset=utf-8';
    case 'xml': return 'application/xml; charset=utf-8';
    case 'ipxe': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function normalizePath(input: string): string {
  return decodeURIComponent(input)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/{2,}/g, '/');
}

function splitPublicPrefix(path: string): { raw: boolean; path: string } {
  const clean = normalizePath(path);
  if (clean.startsWith('raw/')) {
    return { raw: true, path: clean.slice(4) };
  }
  return { raw: false, path: clean };
}

function parseRange(range: string | null, size: number) {
  if (!range?.startsWith('bytes=')) return null;

  const [startStr, endStr] = range.replace('bytes=', '').split('-');
  let start = startStr ? Number(startStr) : 0;
  let end = endStr ? Number(endStr) : size - 1;

  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end)) end = size - 1;
  if (start < 0) start = 0;
  if (end >= size) end = size - 1;

  if (start > end || start >= size) return null;
  return { start, end };
}

async function fetchMetaJson(metaFileId: string): Promise<any> {
  const metaRes = await fetch(`${TELE_API}/getFile?file_id=${encodeURIComponent(metaFileId)}`);
  const metaJson = await metaRes.json();
  if (!metaJson?.ok) throw new Error('Meta file lookup failed');

  const metaUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${metaJson.result.file_path}`;
  const res = await fetch(metaUrl);
  if (!res.ok) throw new Error(`Meta download failed: ${res.status}`);

  return await res.json();
}

function contentDisposition(fileName: string, download: boolean) {
  const mode = download ? 'attachment' : 'inline';
  return `${mode}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export const GET: RequestHandler = async ({ params, url, request }) => {
  const wanted = splitPublicPrefix(params.filename ?? '');
  const publicPath = wanted.path;

  if (!publicPath) return new Response('Not found', { status: 404 });

  const download = url.searchParams.get('download') === 'true' || url.searchParams.get('download') === '1';

  const file = await getPublicFileByPath(publicPath);
  if (file) {
    let meta: any;
    try {
      meta = await fetchMetaJson(file.metaFileId);
    } catch (e) {
      console.error('public file meta error:', e);
      return new Response('Meta fail', { status: 500 });
    }

    const type = file.type || meta?.type || mimeFromName(file.fileName);
    const size = Number(meta?.totalBytes ?? file.totalBytes ?? 0);
    const rangeHeader = request.headers.get('range');
    const range = size > 0 ? parseRange(rangeHeader, size) : null;

    const headers = new Headers({
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Disposition': contentDisposition(file.fileName, download)
    });

    if (!meta?.chunked) {
      const tgUrl = await getTgUrl(meta?.telegramFileId || file.telegramFileId || file.metaFileId);
      if (!tgUrl) return new Response('No file url', { status: 500 });

      const res = await fetch(tgUrl, {
        headers: range ? { Range: `bytes=${range.start}-${range.end}` } : {}
      });

      if (!res.ok && res.status !== 206) {
        return new Response(`Upstream failed: ${res.status}`, { status: 502 });
      }

      if (range) {
        headers.set('Content-Range', res.headers.get('Content-Range') || `bytes ${range.start}-${range.end}/${size}`);
        headers.set('Content-Length', String(range.end - range.start + 1));
        return new Response(res.body, { status: 206, headers });
      }

      if (size > 0) headers.set('Content-Length', String(size));
      return new Response(res.body, { status: 200, headers });
    }

    const chunks = [...(meta?.chunks ?? [])].sort((a: any, b: any) => a.index - b.index);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let offset = 0;

          for (const chunk of chunks) {
            const chunkSize = Number(chunk.size ?? 0);
            const start = offset;
            const end = offset + chunkSize - 1;
            offset += chunkSize;

            if (range && end < range.start) continue;
            if (range && start > range.end) break;

            const { body } = await fetchChunkFromCacheOrOrigin(chunk.file_id);

            if (range) {
              const overlapStart = Math.max(0, range.start - start);
              const overlapEnd = Math.min(chunkSize - 1, range.end - start);
              const need = overlapEnd - overlapStart + 1;
              const reader = body.getReader();
              let skipped = 0;
              let taken = 0;
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (!value) continue;
                if (skipped + value.length <= overlapStart) { skipped += value.length; continue; }
                const startInChunk = Math.max(0, overlapStart - skipped);
                const sliced = value.slice(startInChunk);
                if (taken + sliced.length > need) {
                  controller.enqueue(sliced.slice(0, need - taken));
                  taken = need;
                  break;
                }
                taken += sliced.length;
                controller.enqueue(sliced);
                skipped += value.length;
              }
            } else {
              const reader = body.getReader();
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) controller.enqueue(value);
              }
            }
          }

          controller.close();
        } catch (e) {
          console.error('public stream error:', e);
          controller.error(e);
        }
      }
    });

    if (range) {
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      headers.set('Content-Length', String(range.end - range.start + 1));
      return new Response(stream, { status: 206, headers });
    }

    if (size > 0) headers.set('Content-Length', String(size));
    return new Response(stream, { status: 200, headers });
  }

  const folder = await getPublicFolderByPath(publicPath);
  if (folder && !wanted.raw) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/public/folder/${publicPath}` }
    });
  }

  return new Response('Not found', { status: 404 });
};
