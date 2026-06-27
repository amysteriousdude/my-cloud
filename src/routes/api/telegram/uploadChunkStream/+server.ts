// src/routes/api/telegram/uploadChunkStream/+server.ts
// Uploads a batch of chunks to Telegram in a single Worker invocation.
// Binary framing: [4B index LE][4B length LE][data]...
// Client sends batches of up to 5 chunks (90MB) to stay under CF body limits.
import type { RequestHandler } from './$types';
import { getRecordByApiKey } from '$lib/telegramStorage';
import { TG_SAFE_CHUNK_BYTES } from '$lib/telegramLimits';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_BACKUP_CHAT_ID!;
const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function uploadChunkToTelegram(
  data: Uint8Array,
  filename: string
): Promise<{ file_id: string; message_id: number }> {
  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  form.append('document', new Blob([data]), filename);

  const res = await fetch(`${TELE_API}/sendDocument`, { method: 'POST', body: form });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`sendDocument ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json() as any;
  if (!json?.ok) throw new Error('sendDocument failed: ' + JSON.stringify(json).slice(0, 200));

  return { file_id: json.result.document.file_id, message_id: json.result.message_id };
}

export const POST: RequestHandler = async ({ request }) => {
  const apiKey = (request.headers.get('x-api-key') ?? '').trim();
  const fileName = decodeURIComponent(request.headers.get('x-file-name') ?? 'file');
  const batchSize = parseInt(request.headers.get('x-batch-size') ?? '0');

  if (!apiKey)
    return new Response(JSON.stringify({ error: 'Missing X-Api-Key' }), { status: 403 });

  const rec = await getRecordByApiKey(apiKey);
  if (!rec)
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  if (!batchSize || batchSize < 1)
    return new Response(JSON.stringify({ error: 'Missing X-Batch-Size' }), { status: 400 });

  try {
    const buf = new Uint8Array(await request.arrayBuffer());
    const results: { index: number; file_id: string; message_id: number; size: number }[] = [];
    let offset = 0;

    for (let i = 0; i < batchSize; i++) {
      if (offset + 8 > buf.length) break;

      const index = buf[offset] | (buf[offset+1] << 8) | (buf[offset+2] << 16) | (buf[offset+3] << 24);
      const chunkLen = buf[offset+4] | (buf[offset+5] << 8) | (buf[offset+6] << 16) | (buf[offset+7] << 24);
      offset += 8;

      if (chunkLen > TG_SAFE_CHUNK_BYTES) {
        return new Response(JSON.stringify({ error: `Chunk ${index} too large: ${chunkLen}` }), { status: 413 });
      }
      if (offset + chunkLen > buf.length) {
        return new Response(JSON.stringify({ error: `Chunk ${index} truncated` }), { status: 400 });
      }

      const data = buf.slice(offset, offset + chunkLen);
      offset += chunkLen;

      const { file_id, message_id } = await uploadChunkToTelegram(data, `${fileName}.chunk${index}`);
      results.push({ index, file_id, message_id, size: chunkLen });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('uploadChunkStream error:', err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500 });
  }
};
