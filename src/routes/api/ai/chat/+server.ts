import type { RequestHandler } from './$types';
import { getRecordByApiKey } from '$lib/telegramStorage';

const PROVIDER_MAP: Record<string, { apiBase: string; chatPath: string }> = {
  pollinations: { apiBase: 'https://g4f.space', chatPath: '/v1/chat/completions' },
  groq:         { apiBase: 'https://g4f.space', chatPath: '/v1/chat/completions' },
  ollama:       { apiBase: 'https://g4f.space', chatPath: '/v1/chat/completions' },
  nvidia:       { apiBase: 'https://g4f.space', chatPath: '/v1/chat/completions' },
  gemini:       { apiBase: 'https://g4f.space', chatPath: '/v1/chat/completions' },
  custom:       { apiBase: 'https://g4f.space/custom/srv_mrgynwuz08a167112109', chatPath: '/chat/completions' },
};

function auth(request: Request) {
  return (request.headers.get('x-api-key') ?? '').trim();
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const key = auth(request);
    const rec = await getRecordByApiKey(key);
    if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

    const body = await request.json();
    const { provider, model, messages, stream = false } = body as {
      provider: string;
      model: string;
      messages: { role: string; content: string }[];
      stream?: boolean;
    };

    if (!provider || !model || !messages?.length) {
      return new Response(JSON.stringify({ error: 'Missing provider, model, or messages' }), { status: 400 });
    }

    const cfg = PROVIDER_MAP[provider];
    if (!cfg) return new Response(JSON.stringify({ error: 'Unknown provider' }), { status: 400 });

    const target = `${cfg.apiBase}${cfg.chatPath}`;

    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }

    if (stream) {
      return new Response(res.body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('ai/chat error:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500 });
  }
};
