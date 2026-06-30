import type { RequestHandler } from './$types';
import {
  getVaultContext,
  loadVaultRegistry,
  decryptVaultFile
} from '../_vault';
import { downloadFileFromTelegram } from '$lib/telegramStorage';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
  const userId = locals.user?.id || 'default_user';
  const ctx = await getVaultContext(userId, cookies);
  const fileId = url.searchParams.get('id');

  if (!ctx || !fileId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const registry = await loadVaultRegistry(ctx.key, ctx.index.registryFileId!);
  const file = registry.files.find((f) => f.id === fileId);

  if (!file) {
    return new Response('File not found', { status: 404 });
  }

  const chunks: ArrayBuffer[] = [];

  for (const chunk of [...file.chunks].sort((a, b) => a.index - b.index)) {
    const downloaded = await downloadFileFromTelegram(chunk.file_id);
    chunks.push(
      downloaded.data.buffer.slice(
        downloaded.data.byteOffset,
        downloaded.data.byteOffset + downloaded.data.byteLength
      )
    );
  }

  const total = chunks.reduce((sum, b) => sum + b.byteLength, 0);
  const merged = new Uint8Array(total);

  let offset = 0;
  for (const c of chunks) {
    merged.set(new Uint8Array(c), offset);
    offset += c.byteLength;
  }

  const decrypted = await decryptVaultFile(ctx.key, file.iv, merged.buffer);

  return new Response(decrypted, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.name}"`
    }
  });
};
