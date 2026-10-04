// hello there, tf u doing on my code????
import { env } from '$env/dynamic/public';

export type Branding = { name: string; icon: string; pfp: string };

const KEY = 'cloudBranding';

export const branding = $state<Branding>({
  name: env.PUBLIC_NAME ?? 'Omar',
  icon: 'cloud',
  pfp: '',
});

let loaded = false;

export function loadBranding() {
  if (loaded || typeof localStorage === 'undefined') return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (typeof p?.name === 'string' && p.name.trim()) branding.name = p.name.trim();
    if (typeof p?.icon === 'string' && p.icon) branding.icon = p.icon;
    if (typeof p?.pfp === 'string') branding.pfp = p.pfp;
  } catch {
    /* corrupted branding, keep defaults */
  }
}

export function saveBranding(patch: Partial<Branding>) {
  if (patch.name !== undefined) branding.name = patch.name.trim() || branding.name;
  if (patch.icon !== undefined) branding.icon = patch.icon;
  if (patch.pfp !== undefined) branding.pfp = patch.pfp;
  loaded = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(branding));
  } catch {
    /* quota — pfp too big, state still applied */
  }
}

loadBranding();
