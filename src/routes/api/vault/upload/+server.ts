import type { RequestHandler } from './$types';
import {
  getVaultContext,
  loadVaultRegistry,
  uploadVaultFileChunks,
  saveVaultState,
  randomUUID
} from '../_vault';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const userId = locals.user?.id || 'default_user';
  const ctx = await getVaultContext(userId, cookies);

  if (!ctx) {
    return new Response('Unauthorized', { status: 401 });
  }

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return new Response('No file', { status: 400 });
  }

  const name = String(form.get('name') || file.name).trim() || file.name;
  const folderId = String(form.get('folderId') || '').trim() || undefined;

  const registry = await loadVaultRegistry(ctx.key, ctx.index.registryFileId!);
  const raw = await file.arrayBuffer();

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    ctx.key,
    raw
  );

  const chunks = await uploadVaultFileChunks(encrypted, randomUUID());

  registry.files.push({
    id: randomUUID(),
    name,
    size: file.size,
    createdAt: Date.now(),
    iv: Buffer.from(iv).toString('base64'),
    chunks,
    ...(folderId ? { folderId } : {})
  });

  registry.updatedAt = Date.now();

  const result = await saveVaultState(ctx.key, ctx.index, registry, {
    previousRegistryMessageId: ctx.index.registryMessageId
  });

  if (result?.indexFileId) {
    cookies.set('vault_index_file_id', result.indexFileId, { path: '/' });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
