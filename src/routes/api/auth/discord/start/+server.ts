// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = ({ url, cookies }) => {
  const CLIENT_ID = env.DISCORD_CLIENT_ID;
  if (!CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'Discord not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = crypto.randomUUID();
  cookies.set('discord_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  const authorize = new URL('https://discord.com/api/oauth2/authorize');
  authorize.searchParams.set('client_id', CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${url.origin}/api/discord/callback`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'identify');
  authorize.searchParams.set('state', state);

  redirect(302, authorize.toString());
};
