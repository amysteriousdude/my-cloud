// hello there, tf u doing on my code????
import type { RequestHandler } from './$types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type Picked = { version: string; updated: string | null; versionCode?: string | null };

const ANDROID_SOURCES: { name: string; url: string; pick: (html: string) => Picked | null }[] = [
  {
    name: 'uptodown',
    url: 'https://roblox.en.uptodown.com/android',
    pick: (html) => {
      const version = html.match(/class="version">([^<]+)</)?.[1]?.trim();
      if (!version) return null;
      const updated = html.match(/class="date">([^<]+)</)?.[1]?.trim() ?? null;
      return { version, updated };
    },
  },
  {
    name: 'apkcombo',
    url: 'https://apkcombo.com/roblox/com.roblox.client/',
    pick: (html) => {
      const version = html.match(/"softwareVersion"\s*:\s*"([^"]+)"/)?.[1]?.trim();
      if (!version) return null;
      const updated = html.match(/Updated:\s*([0-9-]+)/)?.[1]?.trim() ?? null;
      const versionCode = html.match(/class="blur">\((\d+)\)</)?.[1] ?? null;
      return { version, updated, versionCode };
    },
  },
];

async function grab(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function androidVersion() {
  const errors: string[] = [];
  let uptodown: Picked | null = null;
  let combo: Picked | null = null;
  const results = await Promise.allSettled(ANDROID_SOURCES.map((s) => grab(s.url).then(s.pick)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.version) {
      if (i === 0) uptodown = r.value;
      else combo = r.value;
    } else {
      errors.push(`${ANDROID_SOURCES[i].name}: ${r.status === 'rejected' ? (r.reason?.message ?? 'failed') : 'no version in page'}`);
    }
  });
  const base = uptodown ?? combo;
  if (!base) throw new Error(errors.join('; '));
  const versionCode = combo?.versionCode ?? null;
  return {
    version: base.version,
    updated: base.updated ?? combo?.updated ?? null,
    source: uptodown ? 'uptodown' : 'apkcombo',
    download: versionCode ? `https://d.apkpure.com/b/XAPK/com.roblox.client?versionCode=${versionCode}` : null,
  };
}

async function iosVersion() {
  const res = await fetch('https://itunes.apple.com/lookup?bundleId=com.roblox.RobloxMobile');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.results?.[0];
  if (!r?.version) throw new Error('no iTunes result');
  return { version: r.version, updated: r.currentVersionReleaseDate ?? null, source: 'itunes', download: r.trackViewUrl ?? null };
}

export const GET: RequestHandler = async ({ url }) => {
  const platform = url.searchParams.get('platform') ?? 'android';
  try {
    const result = platform === 'ios' ? await iosVersion() : await androidVersion();
    return new Response(JSON.stringify({ platform, ...result }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ platform, error: err?.message ?? 'fetch failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
