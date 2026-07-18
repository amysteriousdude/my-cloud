import type { RequestHandler } from './$types';
import { getRecordByApiKey } from '$lib/telegramStorage';

const PROVIDER_MAP: Record<string, { apiBase: string; modelsPath: (id: string) => string }> = {
  pollinations: { apiBase: 'https://g4f.space', modelsPath: (id) => `/api/${id}/models` },
  groq:         { apiBase: 'https://g4f.space', modelsPath: (id) => `/api/${id}/models` },
  ollama:       { apiBase: 'https://g4f.space', modelsPath: (id) => `/api/${id}/models` },
  nvidia:       { apiBase: 'https://g4f.space', modelsPath: (id) => `/api/${id}/models` },
  gemini:       { apiBase: 'https://g4f.space', modelsPath: (id) => `/api/${id}/models` },
  custom:       { apiBase: 'https://g4f.space/custom/srv_mrgynwuz08a167112109', modelsPath: () => '/models' },
};

function auth(request: Request) {
  return (request.headers.get('x-api-key') ?? '').trim();
}

export const GET: RequestHandler = async ({ request, url }) => {
  try {
    const key = auth(request);
    const rec = await getRecordByApiKey(key);
    if (!rec) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

    const provider = url.searchParams.get('provider') ?? '';
    const cfg = PROVIDER_MAP[provider];
    if (!cfg) return new Response(JSON.stringify({ error: 'Unknown provider' }), { status: 400 });

    const target = `${cfg.apiBase}${cfg.modelsPath(provider)}`;
    const res = await fetch(target, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: any) {
    console.error('ai/models error:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), { status: 500 });
  }
};
