// src/routes/generators/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { decrypt } from '$lib/crypto';
import { getRecordByApiKey } from '$lib/telegramStorage';

export const load: LayoutServerLoad = async ({ cookies }) => {
  const session = cookies.get('session');
  if (!session) throw redirect(302, '/');

  const apiKey = decrypt(session);
  if (!apiKey) throw redirect(302, '/');

  let rec;
  try {
    rec = await getRecordByApiKey(apiKey);
  } catch {
    throw redirect(302, '/');
  }
  if (!rec) throw redirect(302, '/');

  return {
    apiKey,
    user: { username: rec.username }
  };
};
