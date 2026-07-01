import type { RequestHandler } from './$types';
import { getPublicFileByPath, getPublicFolderByPath } from '$lib/telegramStorage';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1000, 2000];
const INTER_CHUNK_DELAY_MS = 50;

// ── In-memory CDN URL cache (warm after first request per file) ─────────────
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchChunkBytes(fileId: string, expectedSize: number, chunkIndex: number): Promise<Uint8Array> {
  // Try edge cache first — 0 subrequests on hit
  try {
    const cache = await caches.open('tg-chunks-v1');
    const hit = await cache.match(new Request(`https://tg-cache/${fileId}`));
    if (hit?.body) {
      const reader = hit.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) { chunks.push(value); totalBytes += value.length; }
      }
      if (expectedSize <= 0 || totalBytes === expectedSize) {
        return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
      }
      console.error(`public chunk ${chunkIndex}: cache size mismatch (${totalBytes} vs ${expectedSize}), refetching`);
    }
  } catch {}

  // Cache miss or size mismatch — fetch from Telegram CDN
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const cdnUrl = await getTgUrl(fileId);
      if (!cdnUrl) throw new Error('No CDN URL');

      const res = await fetch(cdnUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('Empty body');

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) { chunks.push(value); totalBytes += value.length; }
      }

      if (expectedSize > 0 && totalBytes !== expectedSize) {
        throw new Error(`Size mismatch: got ${totalBytes}, expected ${expectedSize}`);
      }

      const data = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);

      // Cache for next time
      try {
        const cache = await caches.open('tg-chunks-v1');
        const headers = new Headers({ 'Content-Type': 'application/octet-stream', 'Content-Length': String(totalBytes) });
        await cache.put(new Request(`https://tg-cache/${fileId}`), new Response(data, { headers }));
      } catch {}

      return data;
    } catch (e) {
      lastError = e as Error;
      console.error(`public chunk ${chunkIndex} failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${lastError.message}`);
      if (attempt < MAX_RETRIES - 1) await delay(RETRY_DELAYS[attempt]);
    }
  }

  throw new Error(`Chunk ${chunkIndex} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

function normalizePath(input: string): string {
  return decodeURIComponent(input)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/{2,}/g, '/');
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
  const publicPath = normalizePath(params.filename ?? '');

  if (!publicPath) return new Response('Not found', { status: 404 });

  const download = url.searchParams.get('download') === 'true' || url.searchParams.get('download') === '1';

  const file = await getPublicFileByPath(publicPath);
  if (!file) {
    const folder = await getPublicFolderByPath(publicPath);
    if (folder) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/public/folder/${publicPath}` }
      });
    }
    return new Response('Not found', { status: 404 });
  }

  let meta: any;
  try {
    meta = await fetchMetaJson(file.metaFileId);
  } catch (e) {
    console.error('public file meta error:', e);
    return new Response('Meta fail', { status: 500 });
  }

  const type = file.type || meta?.type || 'application/octet-stream';
  const size = Number(meta?.totalBytes ?? file.totalBytes ?? 0);
  const rangeHeader = request.headers.get('range');
  const range = size > 0 ? parseRange(rangeHeader, size) : null;

  const headers = new Headers({
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Disposition': contentDisposition(file.fileName, download)
  });

  // ── NON-CHUNKED: single fetch ─────────────────────────────────────────────
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

  // ── CHUNKED: fetch each chunk, verify size, stream to client ──────────────
  const chunks = [...(meta?.chunks ?? [])].sort((a: any, b: any) => a.index - b.index);
  console.log(`public: streaming ${chunks.length} chunks (${(size / 1048576).toFixed(1)}MB) for ${file.fileName}`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let bytesWritten = 0;
      try {
        let offset = 0;

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkSize = Number(chunk.size ?? 0);
          const chunkStart = offset;
          const chunkEnd = offset + chunkSize - 1;
          offset += chunkSize;

          if (range && chunkEnd < range.start) continue;
          if (range && chunkStart > range.end) break;

          const data = await fetchChunkBytes(chunk.file_id, chunkSize, i);

          if (range) {
            const overlapStart = Math.max(0, range.start - chunkStart);
            const overlapEnd = Math.min(chunkSize - 1, range.end - chunkStart);
            const sliced = data.slice(overlapStart, overlapEnd + 1);
            controller.enqueue(sliced);
            bytesWritten += sliced.length;
          } else {
            controller.enqueue(data);
            bytesWritten += data.length;
          }

          if (i < chunks.length - 1) await delay(INTER_CHUNK_DELAY_MS);
        }

        if (size > 0 && bytesWritten !== size) {
          console.error(`public stream mismatch: wrote ${bytesWritten} but expected ${size}`);
        }
        console.log(`public: stream done — ${bytesWritten} bytes`);
        controller.close();
      } catch (e) {
        console.error(`public stream ABORTED after ${bytesWritten} bytes (${chunks.length} chunks):`, e);
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
};
