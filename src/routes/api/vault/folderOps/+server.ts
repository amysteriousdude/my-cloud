import type { RequestHandler } from './$types';
import { getVaultContext, loadVaultRegistry, saveVaultState, randomUUID } from '../_vault';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const userId = locals.user?.id || 'default_user';
  const ctx = await getVaultContext(userId, cookies);

  if (!ctx) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? '').trim();

  if (!action) {
    return new Response('Missing action', { status: 400 });
  }

  const registry = await loadVaultRegistry(ctx.key, ctx.index.registryFileId!);

  if (!registry.folders) registry.folders = [];

  switch (action) {
    case 'create': {
      const name = String(body?.name ?? 'New Folder').trim() || 'New Folder';
      const parentId = body?.parentId ? String(body.parentId) : undefined;

      const folder = {
        id: randomUUID(),
        name,
        createdAt: Date.now(),
        ...(parentId ? { parentId } : {})
      };

      registry.folders.push(folder);
      registry.updatedAt = Date.now();

      await saveVaultState(ctx.key, ctx.index, registry, {
        previousRegistryMessageId: ctx.index.registryMessageId
      });

      return new Response(JSON.stringify({ ok: true, folder }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    case 'rename': {
      const folderId = String(body?.folderId ?? '').trim();
      const name = String(body?.name ?? '').trim();

      if (!folderId || !name) {
        return new Response('Missing folderId or name', { status: 400 });
      }

      const folder = registry.folders.find(f => f.id === folderId);
      if (!folder) {
        return new Response('Folder not found', { status: 404 });
      }

      folder.name = name;
      registry.updatedAt = Date.now();

      await saveVaultState(ctx.key, ctx.index, registry, {
        previousRegistryMessageId: ctx.index.registryMessageId
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    case 'delete': {
      const folderId = String(body?.folderId ?? '').trim();

      if (!folderId) {
        return new Response('Missing folderId', { status: 400 });
      }

      // Collect all child folder IDs recursively
      const toRemove = new Set<string>();
      function collectChildren(parentId: string) {
        for (const f of registry.folders) {
          if (f.parentId === parentId) {
            toRemove.add(f.id);
            collectChildren(f.id);
          }
        }
      }
      collectChildren(folderId);
      toRemove.add(folderId);

      // Remove files in those folders (delete their chunks from Telegram)
      for (const file of registry.files) {
        if (file.folderId && toRemove.has(file.folderId)) {
          for (const chunk of file.chunks) {
            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: process.env.TELEGRAM_BACKUP_CHAT_ID,
                message_id: chunk.message_id
              })
            }).catch(() => {});
          }
        }
      }

      registry.files = registry.files.filter(f => !f.folderId || !toRemove.has(f.folderId));
      registry.folders = registry.folders.filter(f => !toRemove.has(f.id));
      registry.updatedAt = Date.now();

      await saveVaultState(ctx.key, ctx.index, registry, {
        previousRegistryMessageId: ctx.index.registryMessageId
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    case 'moveFile': {
      const fileId = String(body?.fileId ?? '').trim();
      const folderId = body?.folderId ? String(body.folderId) : null;

      if (!fileId) {
        return new Response('Missing fileId', { status: 400 });
      }

      const file = registry.files.find(f => f.id === fileId);
      if (!file) {
        return new Response('File not found', { status: 404 });
      }

      if (folderId) {
        file.folderId = folderId;
      } else {
        delete file.folderId;
      }

      registry.updatedAt = Date.now();

      await saveVaultState(ctx.key, ctx.index, registry, {
        previousRegistryMessageId: ctx.index.registryMessageId
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    default:
      return new Response('Unknown action', { status: 400 });
  }
};
