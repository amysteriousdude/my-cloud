import type { RequestHandler } from './$types';
import { getVaultContext, loadVaultRegistry } from '../_vault';

export const GET: RequestHandler = async ({ locals, cookies }) => {
  const userId = locals.user?.id || 'default_user';
  const ctx = await getVaultContext(userId, cookies);

  if (!ctx) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const registry = await loadVaultRegistry(ctx.key, ctx.index.registryFileId!);

  return new Response(JSON.stringify({
    files: registry.files
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        createdAt: f.createdAt,
        chunks: f.chunks?.length || 0
      }))
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
