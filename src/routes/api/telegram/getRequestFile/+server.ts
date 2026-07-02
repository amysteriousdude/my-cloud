// src/routes/api/telegram/getRequestFile/+server.ts
import type { RequestHandler } from './$types';
import { getRecordByApiKey } from '$lib/telegramStorage';
import { env } from '$env/dynamic/private';

const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN!;
const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const CDN_URL_TTL = 50 * 60 * 1000;
const META_TTL = 10 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1000, 2000];
const INTER_CHUNK_DELAY_MS = 50;

const cdnUrlCache = new Map<string, { url: string; exp: number }>();
const metaCache = new Map<string, { meta: any; exp: number }>();

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
    const url = await getTelegramUrl(metaFileId);
    const r = await fetch(url);
    const meta = JSON.parse(await r.text());
    metaCache.set(metaFileId, { meta, exp: Date.now() + META_TTL });
    return meta;
  } catch { return null; }
}

function isPreviewable(type: string) {
  return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/') || type === 'application/pdf';
}

function parseRange(header: string, total: number) {
  const m = header.match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;
  const start = m[1] ? parseInt(m[1]) : total - parseInt(m[2]);
  const end = m[2] ? Math.min(parseInt(m[2]), total - 1) : total - 1;
  return { start, end };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchChunkBytes(fileId: string, expectedSize: number, chunkIndex: number): Promise<Uint8Array> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const cdnUrl = await getTelegramUrl(fileId);
      const res = await fetch(cdnUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('Empty body');

      const reader = res.body.getReader();
      const bufs: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) { bufs.push(value); totalBytes += value.length; }
      }

      if (expectedSize > 0 && totalBytes !== expectedSize) {
        throw new Error(`Size mismatch: got ${totalBytes}, expected ${expectedSize}`);
      }

      if (bufs.length === 1) return bufs[0];
      return Buffer.concat(bufs);
    } catch (e) {
      lastError = e as Error;
      console.error(`getRequestFile chunk ${chunkIndex} failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${lastError.message}`);
      if (attempt < MAX_RETRIES - 1) await delay(RETRY_DELAYS[attempt]);
    }
  }

  throw new Error(`Chunk ${chunkIndex} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

async function pumpFromChunks(
  sorted: any[],
  writer: WritableStreamDefaultWriter<Uint8Array>,
  range?: { start: number; end: number }
): Promise<number> {
  let bytesWritten = 0;
  let pos = 0;

  for (let i = 0; i < sorted.length; i++) {
    const chunkSize = Number(sorted[i].size ?? 0);
    const chunkStart = pos;
    const chunkEnd = pos + chunkSize - 1;
    pos += chunkSize;

    if (range && chunkEnd < range.start) continue;
    if (range && chunkStart > range.end) break;

    const data = await fetchChunkBytes(sorted[i].file_id, chunkSize, i);

    if (range) {
      const overlapStart = Math.max(0, range.start - chunkStart);
      const overlapEnd = Math.min(chunkSize - 1, range.end - chunkStart);
      const sliced = data.slice(overlapStart, overlapEnd + 1);
      await writer.write(sliced);
      bytesWritten += sliced.length;
    } else {
      await writer.write(data);
      bytesWritten += data.length;
    }

    if (i < sorted.length - 1) await delay(INTER_CHUNK_DELAY_MS);
  }

  return bytesWritten;
}

export const GET: RequestHandler = async ({ request, url }) => {
  const apiKey = (request.headers.get('x-api-key') ?? url.searchParams.get('api_key') ?? '').trim();
  const metaFileId = (request.headers.get('x-meta-file-id') ?? url.searchParams.get('meta_file_id') ?? '').trim();
  const returnJson = (request.headers.get('x-json') ?? url.searchParams.get('json') ?? 'false') === 'true';
  const forceDown = (request.headers.get('x-download') ?? url.searchParams.get('download') ?? 'false') === 'true';

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
        fileName: meta.fileName,
        mimeType: meta.type,
        totalBytes: meta.totalBytes,
        time: meta.time,
        chunked: meta.chunked ?? false,
        compressed: meta.compressed ?? false,
        previewable: isPreviewable(meta.type),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const canPreview = isPreviewable(meta.type) && !forceDown;
    const disposition = `${canPreview ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`;
    const totalBytes: number = meta.totalBytes ?? 0;
    const rangeHeader = request.headers.get('range');

    // ── CHUNKED FILE ────────────────────────────────────────────────────────
    if (meta.chunked && Array.isArray(meta.chunks)) {
      const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);

      if (rangeHeader && totalBytes > 0) {
        const range = parseRange(rangeHeader, totalBytes);
        if (!range || range.start > range.end || range.start >= totalBytes)
          return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${totalBytes}` } });

        let bytesWritten = 0;
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              let pos = 0;
              for (let i = 0; i < sorted.length; i++) {
                const chunkSize = Number(sorted[i].size ?? 0);
                const chunkStart = pos;
                const chunkEnd = pos + chunkSize - 1;
                pos += chunkSize;

                if (chunkEnd < range.start || chunkStart > range.end) continue;

                const data = await fetchChunkBytes(sorted[i].file_id, chunkSize, i);
                const overlapStart = Math.max(0, range.start - chunkStart);
                const overlapEnd = Math.min(chunkSize - 1, range.end - chunkStart);
                const sliced = data.slice(overlapStart, overlapEnd + 1);
                controller.enqueue(sliced);
                bytesWritten += sliced.length;

                if (i < sorted.length - 1) await delay(INTER_CHUNK_DELAY_MS);
              }
              console.log(`getRequestFile range stream done — ${bytesWritten} bytes`);
              controller.close();
            } catch (err) {
              console.error(`getRequestFile range stream error after ${bytesWritten} bytes:`, (err as Error)?.message || err);
              controller.error(err);
            }
          }
        });

        return new Response(stream, {
          status: 206,
          headers: {
            'Content-Type': meta.type,
            'Content-Disposition': disposition,
            'Content-Range': `bytes ${range.start}-${range.end}/${totalBytes}`,
            'Content-Length': String(range.end - range.start + 1),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }

      // Full chunked file — ReadableStream keeps worker alive while browser consumes
      let bytesWritten = 0;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for (let i = 0; i < sorted.length; i++) {
              const chunk = sorted[i];
              const chunkSize = Number(chunk.size ?? 0);
              const data = await fetchChunkBytes(chunk.file_id, chunkSize, i);
              controller.enqueue(data);
              bytesWritten += data.length;

              if (i < sorted.length - 1) await delay(INTER_CHUNK_DELAY_MS);
            }
            if (totalBytes > 0 && bytesWritten !== totalBytes) {
              console.error(`Chunked stream mismatch: wrote ${bytesWritten} but expected ${totalBytes}`);
            }
            console.log(`getRequestFile stream done — ${bytesWritten} bytes`);
            controller.close();
          } catch (err) {
            console.error(`getRequestFile stream error after ${bytesWritten} bytes:`, (err as Error)?.message || err);
            controller.error(err);
          }
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': meta.type,
          'Content-Disposition': disposition,
          ...(totalBytes > 0 ? { 'Content-Length': String(totalBytes) } : {}),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
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
          'Content-Type': meta.type,
          'Content-Disposition': disposition,
          'Content-Range': `bytes ${range.start}-${range.end}/${totalBytes}`,
          'Content-Length': String(range.end - range.start + 1),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
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
        'Content-Type': meta.type,
        'Content-Disposition': disposition,
        ...(totalBytes > 0 ? { 'Content-Length': String(totalBytes) } : {}),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
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
