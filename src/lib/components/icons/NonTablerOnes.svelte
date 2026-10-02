<!-- hello there, tf u doing on my code???? -->
<script module lang="ts">
  export type NonTablerVariant = 'outline' | 'filled';

  export type NonTablerEntry = {
    title: string;
    viewBox?: string;
    tags?: string[];
    variants: Partial<Record<NonTablerVariant, string>>;
    defaultVariant?: NonTablerVariant;
  };

  export const NON_TABLER_ICONS: Record<string, NonTablerEntry> = {
    Roblox: {
      title: 'Roblox',
      viewBox: '0 0 24 24',
      tags: ['brand', 'game', 'logo'],
      defaultVariant: 'filled',
      variants: {
        outline: '<path d="M18.926 23.998 0 18.892 5.075.002 24 5.108Z"/><path d="M15.348 10.09l-5.282-1.453-1.414 5.273 5.282 1.453z"/>',
        filled: '<path fill-rule="evenodd" d="M18.926 23.998 0 18.892 5.075.002 24 5.108ZM15.348 10.09l-5.282-1.453-1.414 5.273 5.282 1.453z"/>'
      }
    }
  };

  export function resolveNonTabler(name: string): { key: string; variant: NonTablerVariant } | null {
    if (NON_TABLER_ICONS[name]) {
      return { key: name, variant: NON_TABLER_ICONS[name].defaultVariant ?? 'outline' };
    }
    const m = name.match(/^(.+)-(filled|outline)$/i);
    if (m && NON_TABLER_ICONS[m[1]]) {
      return { key: m[1], variant: m[2].toLowerCase() as NonTablerVariant };
    }
    return null;
  }
</script>

<script lang="ts">
  let {
    name,
    variant,
    size = 24,
    stroke = 1.5
  }: { name: string; variant?: NonTablerVariant; size?: number; stroke?: number } = $props();

  let resolved = $derived.by(() => {
    const r = resolveNonTabler(name);
    if (!r) return null;
    const entry = NON_TABLER_ICONS[r.key];
    const v = variant ?? r.variant;
    const svg = entry.variants[v] ?? entry.variants[entry.defaultVariant ?? 'outline'] ?? entry.variants.outline ?? entry.variants.filled;
    return svg ? { entry, v, svg } : null;
  });

  let isFilled = $derived(resolved?.v === 'filled');
</script>

{#if resolved}
  <svg
    width={size}
    height={size}
    viewBox={resolved.entry.viewBox ?? '0 0 24 24'}
    fill={isFilled ? 'currentColor' : 'none'}
    stroke={isFilled ? 'none' : 'currentColor'}
    stroke-width={isFilled ? undefined : stroke}
    stroke-linecap="round"
    stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="img"
    aria-label={resolved.entry.title}
  >
    {@html resolved.svg}
  </svg>
{/if}
