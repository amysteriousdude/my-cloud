<!-- src/routes/generators/palette/+page.svelte -->
<script lang="ts">
  import { IconArrowLeft, IconRefresh, IconCheck, IconDownload } from '@tabler/icons-svelte';
  import { env } from '$env/dynamic/public';
  const NAME = env.PUBLIC_NAME ?? "Omar";

  let { data } = $props();
  let apiKey = $derived(data?.apiKey ?? "");

  let baseColor = $state('#6366f1');
  let paletteType = $state<'complementary' | 'analogous' | 'triadic' | 'split' | 'tetradic' | 'monochromatic'>('analogous');
  let palette = $state<string[]>([]);
  let copiedIdx = $state(-1);
  let count = $state(5);

  const TYPES = [
    { id: 'complementary', label: 'Complementary' },
    { id: 'analogous', label: 'Analogous' },
    { id: 'triadic', label: 'Triadic' },
    { id: 'split', label: 'Split-Comp' },
    { id: 'tetradic', label: 'Tetradic' },
    { id: 'monochromatic', label: 'Monochrome' },
  ];

  function hexToHsl(hex: string): [number, number, number] {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s * 100, l * 100];
  }

  function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function generate() {
    const [h, s, l] = hexToHsl(baseColor);
    const colors: string[] = [baseColor];

    switch (paletteType) {
      case 'complementary':
        colors.push(hslToHex(h + 180, s, l));
        colors.push(hslToHex(h, s, Math.min(l + 20, 90)));
        colors.push(hslToHex(h + 180, s, Math.min(l + 20, 90)));
        colors.push(hslToHex(h, s, Math.max(l - 20, 10)));
        break;
      case 'analogous': {
        const step = 30;
        for (let i = 1; i < count; i++) colors.push(hslToHex(h + step * i, s, l));
        break;
      }
      case 'triadic':
        colors.push(hslToHex(h + 120, s, l));
        colors.push(hslToHex(h + 240, s, l));
        colors.push(hslToHex(h, s, Math.min(l + 20, 90)));
        colors.push(hslToHex(h + 120, s, Math.min(l + 20, 90)));
        break;
      case 'split':
        colors.push(hslToHex(h + 150, s, l));
        colors.push(hslToHex(h + 210, s, l));
        colors.push(hslToHex(h, s, Math.min(l + 20, 90)));
        colors.push(hslToHex(h + 150, s, Math.min(l + 20, 90)));
        break;
      case 'tetradic':
        colors.push(hslToHex(h + 90, s, l));
        colors.push(hslToHex(h + 180, s, l));
        colors.push(hslToHex(h + 270, s, l));
        colors.push(hslToHex(h, s, Math.min(l + 25, 90)));
        break;
      case 'monochromatic': {
        for (let i = 1; i < count; i++)
          colors.push(hslToHex(h, s, Math.max(10, l - 30 + (i * 60 / count))));
        break;
      }
    }
    palette = colors.slice(0, count);
  }

  function copyColor(hex: string, idx: number) {
    navigator.clipboard.writeText(hex);
    copiedIdx = idx;
    setTimeout(() => copiedIdx = -1, 1200);
  }

  function luminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function exportCSS() {
    const css = `:root {\n${palette.map((c, i) => `  --color-${i + 1}: ${c};`).join('\n')}\n}`;
    const blob = new Blob([css], { type: 'text/css' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'palette.css';
    a.click();
  }

  function randomColor() {
    baseColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    generate();
  }

  generate();
</script>

<div class="pal-wrap">
  <div class="pal-top">
    <a href="/generators" class="pal-back"><IconArrowLeft size={16}/> Generators</a>
    <h1 class="pal-title">Color Palette Generator</h1>
    <p class="pal-sub">Generate harmonious color palettes from a base color</p>
  </div>

  <div class="pal-controls">
    <div class="pal-color-row">
      <label class="pal-label">Base Color</label>
      <div class="pal-color-input">
        <input type="color" bind:value={baseColor} class="pal-color-picker"/>
        <input type="text" bind:value={baseColor} class="pal-color-hex" spellcheck="false"/>
        <button class="pal-rand" onclick={randomColor} title="Random color">🎲</button>
      </div>
    </div>

    <div class="pal-type-row">
      <label class="pal-label">Harmony</label>
      <div class="pal-types">
        {#each TYPES as t}
          <button class="pal-type-btn" class:active={paletteType === t.id}
            onclick={() => { paletteType = t.id as any; generate(); }}>
            {t.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="pal-count-row">
      <label class="pal-label">Colors</label>
      <input type="range" min="3" max="10" bind:value={count} oninput={generate} class="pal-range"/>
      <span class="pal-count-val">{count}</span>
    </div>

    <div class="pal-actions">
      <button class="pal-btn" onclick={generate}><IconRefresh size={14}/> Regenerate</button>
      <button class="pal-btn" onclick={exportCSS}><IconDownload size={14}/> Export CSS</button>
    </div>
  </div>

  <div class="pal-strip">
    {#each palette as color, i}
      {@const dark = luminance(color) < 0.5}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="pal-swatch" style="background:{color}; color:{dark ? '#fff' : '#000'}"
        onclick={() => copyColor(color, i)}>
        <span class="pal-swatch-hex">{color}</span>
        {#if copiedIdx === i}
          <span class="pal-swatch-copied"><IconCheck size={14}/> Copied!</span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="pal-details">
    {#each palette as color}
      {@const [h, s, l] = hexToHsl(color)}
      <div class="pal-detail-card">
        <div class="pal-detail-swatch" style="background:{color}"></div>
        <div class="pal-detail-info">
          <span class="pal-detail-hex">{color.toUpperCase()}</span>
          <span class="pal-detail-hsl">HSL({Math.round(h)}, {Math.round(s)}%, {Math.round(l)}%)</span>
          <span class="pal-detail-rgb">RGB({parseInt(color.slice(1,3),16)}, {parseInt(color.slice(3,5),16)}, {parseInt(color.slice(5,7),16)})</span>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .pal-wrap { padding: 32px 40px; max-width: 900px; }
  .pal-top { margin-bottom: 24px; }
  .pal-back { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); text-decoration: none; font-size: 12px; font-weight: 500; margin-bottom: 10px; }
  .pal-back:hover { text-decoration: underline; }
  .pal-title { font-size: 22px; font-weight: 700; color: var(--text-1); margin: 0 0 4px; }
  .pal-sub { color: var(--text-3); font-size: 13px; margin: 0; }

  .pal-controls { margin-bottom: 24px; display: flex; flex-direction: column; gap: 14px; }
  .pal-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--text-3); margin-bottom: 4px; display: block; }
  .pal-color-row { display: flex; flex-direction: column; }
  .pal-color-input { display: flex; align-items: center; gap: 8px; }
  .pal-color-picker { width: 40px; height: 36px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: none; padding: 2px; }
  .pal-color-hex { flex: 0 0 100px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-3); color: var(--text-1); font-size: 13px; font-family: 'Geist Mono', monospace; text-transform: uppercase; outline: none; }
  .pal-color-hex:focus { border-color: var(--accent); }
  .pal-rand { background: var(--bg-3); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 16px; }

  .pal-types { display: flex; gap: 6px; flex-wrap: wrap; }
  .pal-type-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-3); color: var(--text-2); font-size: 12px; font-weight: 500; font-family: 'Geist', sans-serif; cursor: pointer; transition: .13s; }
  .pal-type-btn:hover { border-color: var(--border-hover); color: var(--text-1); }
  .pal-type-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

  .pal-count-row { display: flex; align-items: center; gap: 10px; }
  .pal-range { flex: 1; accent-color: var(--accent); }
  .pal-count-val { font-size: 13px; font-weight: 600; color: var(--text-1); min-width: 20px; text-align: center; }

  .pal-actions { display: flex; gap: 8px; }
  .pal-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-3); color: var(--text-2); font-size: 12px; font-weight: 500; font-family: 'Geist', sans-serif; cursor: pointer; transition: .13s; }
  .pal-btn:hover { border-color: var(--accent); color: var(--accent); }

  .pal-strip { display: flex; border-radius: 12px; overflow: hidden; margin-bottom: 24px; height: 120px; }
  .pal-swatch { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; transition: flex .2s; }
  .pal-swatch:hover { flex: 1.5; }
  .pal-swatch-hex { font-size: 12px; font-weight: 700; font-family: 'Geist Mono', monospace; opacity: 0; transition: .15s; }
  .pal-swatch:hover .pal-swatch-hex { opacity: 1; }
  .pal-swatch-copied { font-size: 11px; font-weight: 600; }

  .pal-details { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .pal-detail-card { display: flex; gap: 10px; padding: 10px; border-radius: 10px; background: var(--bg-3); border: 1px solid var(--border); }
  .pal-detail-swatch { width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0; }
  .pal-detail-info { display: flex; flex-direction: column; gap: 2px; }
  .pal-detail-hex { font-size: 12px; font-weight: 700; color: var(--text-1); font-family: 'Geist Mono', monospace; }
  .pal-detail-hsl, .pal-detail-rgb { font-size: 10px; color: var(--text-3); font-family: 'Geist Mono', monospace; }

  @media (max-width: 600px) {
    .pal-wrap { padding: 16px; }
    .pal-strip { height: 80px; }
    .pal-details { grid-template-columns: 1fr 1fr; }
  }
</style>
