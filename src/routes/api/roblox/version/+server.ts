import type { RequestHandler } from './$types';

const PLATFORMS: Record<string, string> = {
  windows: 'Windows',
  mac: 'Mac',
  ios: 'iOS',
  android: 'Android',
  xbox: 'XboxOne',
  studio: 'WindowsStudio',
};

export const GET: RequestHandler = async ({ url }) => {
  const platform = url.searchParams.get('platform') ?? 'windows';
  const channel = url.searchParams.get('channel') ?? 'LIVE';
  const target = PLATFORMS[platform] ?? PLATFORMS.windows;

  try {
    const res = await fetch(
      `https://clientsettingscdn.roblox.com/v2/client-version/${target}?channel=${encodeURIComponent(channel)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return new Response(JSON.stringify({ error: `Roblox API ${res.status}` }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    return new Response(JSON.stringify({
      platform: target,
      channel,
      version: data.clientVersionUpload ?? data.version ?? null,
      versionNumber: data.version ?? null,
    }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'fetch failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
};
