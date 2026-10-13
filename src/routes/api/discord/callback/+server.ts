// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import { generateApiKeyForDiscordId, readIndex } from '$lib/telegramStorage';
import { encrypt } from '$lib/crypto';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url, cookies }) => {
  try {
    const OWNER_ID = env.OWNER_ID;
    const CLIENT_ID = env.DISCORD_CLIENT_ID;
    const CLIENT_SECRET = env.DISCORD_CLIENT_SECRET;

    if (!OWNER_ID || !CLIENT_ID || !CLIENT_SECRET) {
      return json({ error: 'Missing env vars', missing: {
        OWNER_ID: !!OWNER_ID, CLIENT_ID: !!CLIENT_ID, CLIENT_SECRET: !!CLIENT_SECRET
      }}, 500);
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const expectedState = cookies.get('discord_state');
    cookies.delete('discord_state', { path: '/' });

    if (!code) return json({ error: 'Missing code' }, 400);
    if (!expectedState || state !== expectedState) return json({ error: 'Invalid state' }, 400);

    const redirectUri = `${url.origin}/api/discord/callback`;

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    }).toString();

    const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => '');
      return json({ error: 'Discord OAuth failed at token exchange', status: tokenRes.status, details: errBody }, 500);
    }

    const token = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `${token.token_type ?? 'Bearer'} ${token.access_token}`
      }
    });

    if (!userRes.ok) {
      const errBody = await userRes.text().catch(() => '');
      return json({ error: 'Failed to fetch user', status: userRes.status, details: errBody }, 500);
    }

    const user = await userRes.json();

    if (user.id !== OWNER_ID) {
      return json({ error: 'Unauthorized' }, 403);
    }

    const index = await readIndex().catch(() => ({}) as Record<string, any>);
    const isNew = !index[user.id];

    const rec = await generateApiKeyForDiscordId(user.id, user.username);

    cookies.set('session', encrypt(rec.apiKey), {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    });

    if (isNew) {
      return json({ user, apiKey: rec.apiKey }, 200);
    }

    return new Response(null, {
      status: 302,
      headers: { Location: '/' }
    });
  } catch (err) {
    return json({ error: 'Discord OAuth failed', message: (err as Error).message }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
