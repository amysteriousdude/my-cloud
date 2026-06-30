import type { RequestHandler } from './$types';
import { getVaultContext, loadVaultRegistry, saveVaultState } from '../_vault';

async function deleteTelegramMessage(message_id: number) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_BACKUP_CHAT_ID,
      message_id
    })
  }).catch(() => {});
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const userId = locals.user?.id || 'default_user';
  const ctx = await getVaultContext(userId, cookies);

  if (!ctx) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? '').trim();

  if (!id) {
    return new Response('Missing id', { status: 400 });
  }

  const registry = await loadVaultRegistry(ctx.key, ctx.index.registryFileId!);
  const pos = registry.files.findIndex((f) => f.id === id);

  if (pos === -1) {
    return new Response('File not found', { status: 404 });
  }

  const file = registry.files[pos];

  for (const chunk of file.chunks) {
    await deleteTelegramMessage(chunk.message_id);
  }

  registry.files.splice(pos, 1);
  registry.updatedAt = Date.now();

  await saveVaultState(ctx.key, ctx.index, registry, {
    previousRegistryMessageId: ctx.index.registryMessageId
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
