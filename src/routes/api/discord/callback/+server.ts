// src/routes/api/discord/callback/+server.ts
import type { RequestHandler } from './$types';
import { generateApiKeyForDiscordId } from '$lib/telegramStorage';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url, fetch }) => {
  try {
    const OWNER_ID = env.OWNER_ID;
    const BASE_URL = env.PUBLIC_BASE_URL ?? 'http://localhost:5173';
    const CLIENT_ID = env.DISCORD_CLIENT_ID;
    const CLIENT_SECRET = env.DISCORD_CLIENT_SECRET;

    if (!OWNER_ID || !CLIENT_ID || !CLIENT_SECRET) {
      return json({ error: 'Missing env vars' }, 500);
    }

    const code = url.searchParams.get('code');
    if (!code) return json({ error: 'Missing code' }, 400);

    const redirectUri = `${BASE_URL}/api/discord/callback`;

    // 🔑 token exchange (FIXED: no .toString(), no axios)
    const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
      return json({ error: 'Discord OAuth failed at token exchange' }, 500);
    }

    const token = await tokenRes.json();

    // 👤 fetch user
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `${token.token_type ?? 'Bearer'} ${token.access_token}`
      }
    });

    if (!userRes.ok) {
      return json({ error: 'Failed to fetch user' }, 500);
    }

    const user = await userRes.json();

    // 🔐 owner gate
    if (user.id !== OWNER_ID) {
      return json({ error: 'Unauthorized' }, 403);
    }

    const rec = await generateApiKeyForDiscordId(user.id, user.username);

    return json({ user, apiKey: rec.apiKey }, 200);
  } catch {
    return json({ error: 'Discord OAuth failed' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
