<!-- src/routes/generators/gradient/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { IconArrowLeft, IconDownload, IconRefresh, IconPlus, IconX } from '@tabler/icons-svelte';
  import SaveDialog from '$lib/components/SaveDialog.svelte';
  import { env } from '$env/dynamic/public';
  const NAME = env.PUBLIC_NAME ?? "Omar";

  let { data } = $props();
  let apiKey = $derived(data?.apiKey ?? "");

  onMount(() => {
    const saved = localStorage.getItem('theme') ?? 'system';
    const isDark = saved === 'dark' || (saved === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);
    const vars = isDark ? DARK : LIGHT;
    const el = document.documentElement;
    el.setAttribute('data-theme', isDark ? 'dark' : 'light');
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    generate();
  });

  const DARK  = {'--bg-1':'#080808','--bg-2':'#101010','--bg-3':'#141414','--text-1':'#e2e2e2','--text-2':'#888','--text-3':'#444','--border':'#1a1a1a','--border-hover':'#333','--accent':'#6366f1','--hover':'rgba(255,255,255,.04)','--red':'#f87171'};
  const LIGHT = {'--bg-1':'#fafafa','--bg-2':'#ffffff','--bg-3':'#f0f0f0','--text-1':'#1a1a1a','--text-2':'#555','--text-3':'#999','--border':'#e0e0e0','--border-hover':'#bbb','--accent':'#4f46e5','--hover':'rgba(0,0,0,.04)','--red':'#dc2626'};

  type Direction = 'linear' | 'radial' | 'conic';
  let direction: Direction = $state('linear');
  let angle = $state(0);
  let canvasW = $state(800);
  let canvasH = $state(500);
  let useNoise = $state(false);
  let noiseAmount = $state(0.3);
  let dithering = $state(false);

  let stops = $state<{ color: string; position: number }[]>([
    { color: '#6366f1', position: 0 },
    { color: '#a78bfa', position: 0.5 },
    { color: '#f87171', position: 1 },
  ]);

  let showSave = $state(false);
  let canvas: HTMLCanvasElement;
  let generating = $state(false);

  function addStop() {
    const last = stops[stops.length - 1];
    const secondLast = stops.length > 1 ? stops[stops.length - 2] : { position: 0 };
    stops = [...stops, { color: '#ffffff', position: Math.min(1, (last.position + secondLast.position) / 2 + 0.25) }];
  }

  function removeStop(idx: number) {
    if (stops.length <= 2) return;
    stops = stops.filter((_, i) => i !== idx);
  }

  function mulberry32(s: number) {
    return () => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function createPerlin(rand: ()=>number) {
    const p = new Uint8Array(512);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
      p[i + 256] = p[i];
    }
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (t: number, a: number, b: number) => a + t * (b - a);
    const grad = (h: number, x: number, y: number) => {
      const u = (h & 8) ? y : x, v = (h & 4) ? x : (h & 12) === 12 ? x : y;
      return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    };
    return (x: number, y: number) => {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      const u = fade(x), v = fade(y);
      const a = p[X]+Y, b = p[X+1]+Y;
      return lerp(v, lerp(u, grad(p[a], x, y), grad(p[b], x-1, y)),
                     lerp(u, grad(p[a+1], x, y-1), grad(p[b+1], x-1, y-1)));
    };
  }

  function hexToRgb(hex: string) {
    const h = hex.replace('#','');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }

  function lerpColor(c1: number[], c2: number[], t: number) {
    return c1.map((v,i) => Math.round(v + (c2[i] - v) * t));
  }

  function sampleGradient(t: number): [number, number, number] {
    const sorted = [...stops].sort((a, b) => a.position - b.position);
    if (t <= sorted[0].position) return hexToRgb(sorted[0].color);
    if (t >= sorted[sorted.length - 1].position) return hexToRgb(sorted[sorted.length - 1].color);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (t >= sorted[i].position && t <= sorted[i+1].position) {
        const local = (t - sorted[i].position) / (sorted[i+1].position - sorted[i].position);
        return lerpColor(hexToRgb(sorted[i].color), hexToRgb(sorted[i+1].color), local);
      }
    }
    return hexToRgb(sorted[0].color);
  }

  function generate() {
    if (!canvas) return;
    generating = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d')!;
      canvas.width = canvasW; canvas.height = canvasH;
      const imageData = ctx.createImageData(canvasW, canvasH);
      const data = imageData.data;
      const rand = mulberry32(42);
      const noise = useNoise ? createPerlin(rand) : null;
      const rad = angle * Math.PI / 180;
      const cosA = Math.cos(rad), sinA = Math.sin(rad);
      const cx = canvasW / 2, cy = canvasH / 2;
      for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
          let t: number;
          if (direction === 'linear') {
            const dx = x - cx, dy = y - cy;
            t = (dx * cosA + dy * sinA) / Math.sqrt(canvasW * canvasW + canvasH * canvasH) + 0.5;
          } else if (direction === 'radial') {
            const dx = (x - cx) / canvasW, dy = (y - cy) / canvasH;
            t = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
          } else {
            t = ((Math.atan2(y - cy, x - cx) / Math.PI + 1) / 2);
          }
          t = Math.max(0, Math.min(1, t));
          if (noise) {
            const nv = noise(x * 0.005, y * 0.005) * noiseAmount;
            t = Math.max(0, Math.min(1, t + nv));
          }
          let [r, g, b] = sampleGradient(t);
          if (dithering) {
            const dither = (rand() - 0.5) * 16;
            r = Math.max(0, Math.min(255, r + dither));
            g = Math.max(0, Math.min(255, g + dither));
            b = Math.max(0, Math.min(255, b + dither));
          }
          const idx = (y * canvasW + x) * 4;
          data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      generating = false;
    }));
  }

  $effect(() => {
    const _ = direction + angle + canvasW + canvasH + useNoise + noiseAmount + dithering + JSON.stringify(stops);
    if (canvas) generate();
  });
</script>

<svelte:head>
  <title>Gradient &middot; Generators &middot; {NAME}'s Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

<SaveDialog
  open={showSave}
  defaultName="gradient"
  apiKey={apiKey}
  onconfirm={(name) => { const a=document.createElement('a'); a.href=canvas.toDataURL('image/png'); a.download=name; a.click(); }}
  onsave={async (name, folderId) => {
    const dataUrl = canvas.toDataURL('image/png');
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], name, { type: 'image/png' });
    const CHUNK = 18 * 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK));
    const chunks: any[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const sliceBlob = file.slice(i * CHUNK, Math.min((i + 1) * CHUNK, file.size));
      const form = new FormData();
      form.append('file', new Blob([sliceBlob], { type: 'image/png' }), name);
      const r = await fetch('/api/telegram/uploadChunk', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'X-Chunk-Index': String(i), 'X-File-Name': encodeURIComponent(name) },
        body: form,
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      chunks.push(d);
    }
    const fin = await fetch('/api/telegram/finalizeUpload', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: name, type: 'image/png', totalBytes: file.size, chunks, folderId: folderId ?? null }),
    });
    const j = await fin.json();
    if (j.error) throw new Error(j.error);
  }}
  onclose={() => showSave=false}
/>

<div class="page">
  <header class="topbar">
    <a href="/" class="back-btn"><IconArrowLeft size={16} stroke={1.8}/> Back</a>
    <span class="topbar-title">Gradient</span>
    <div class="topbar-actions">
      <button class="action-btn" onclick={generate} disabled={generating}><IconRefresh size={15}/> Regenerate</button>
      <button class="action-btn primary" onclick={() => showSave=true}><IconDownload size={15}/> Save</button>
    </div>
  </header>

  <div class="layout">
    <div class="preview-wrap">
      <canvas bind:this={canvas} class="preview-canvas"></canvas>
      {#if generating}<div class="gen-overlay">generating...</div>{/if}
    </div>

    <aside class="controls">
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Direction</h3>
        <div class="chip-row">
          {#each ['linear','radial','conic'] as d}
            <button class="chip" class:active={direction===d} onclick={()=>direction=d as Direction}>{d}</button>
          {/each}
        </div>
        {#if direction === 'linear'}
          <div class="ctrl-group">
            <label><span class="label-row">Angle</span><span class="ctrl-val">{angle}&deg;</span></label>
            <input type="range" bind:value={angle} min="0" max="360"/>
          </div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Color Stops</h3>
        {#each stops as stop, i}
          <div class="stop-row">
            <input type="color" bind:value={stop.color} class="color-swatch"/>
            <input type="range" bind:value={stop.position} min="0" max="1" step="0.01" class="stop-slider"/>
            <span class="mono small">{Math.round(stop.position * 100)}%</span>
            <button class="stop-remove" onclick={() => removeStop(i)} disabled={stops.length <= 2}>
              <IconX size={12}/>
            </button>
          </div>
        {/each}
        <button class="add-stop-btn" onclick={addStop}>
          <IconPlus size={14}/> Add stop
        </button>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Effects</h3>
        <div class="toggle-row">
          <span class="toggle-label">Noise overlay</span>
          <button class="toggle" class:on={useNoise} onclick={()=>useNoise=!useNoise}>{useNoise?'on':'off'}</button>
        </div>
        {#if useNoise}
          <div class="ctrl-group">
            <label><span class="label-row">Amount</span><span class="ctrl-val">{noiseAmount.toFixed(2)}</span></label>
            <input type="range" bind:value={noiseAmount} min="0.05" max="1" step="0.05"/>
          </div>
        {/if}
        <div class="toggle-row">
          <span class="toggle-label">Dithering</span>
          <button class="toggle" class:on={dithering} onclick={()=>dithering=!dithering}>{dithering?'on':'off'}</button>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Canvas</h3>
        <div class="ctrl-group">
          <label>Size</label>
          <div class="size-row">
            <input type="number" bind:value={canvasW} min="200" max="4000" step="100" placeholder="W"/>
            <span class="size-x">&times;</span>
            <input type="number" bind:value={canvasH} min="200" max="4000" step="100" placeholder="H"/>
          </div>
        </div>
        <div class="preset-row">
          {#each [['16:9','1920x1080'],['1:1','1000x1000'],['4:3','1600x1200'],['Phone','1080x1920']] as [label, size]}
            <button class="chip small" onclick={() => { const [w,h]=size.split('x').map(Number); canvasW=w; canvasH=h; }}>{label}</button>
          {/each}
        </div>
      </section>
    </aside>
  </div>
</div>

<style>
  :global(*,*::before,*::after){box-sizing:border-box;margin:0;}
  :global(body){background:var(--bg-1,#080808);font-family:'Geist',sans-serif;color:var(--text-1,#e2e2e2);}
  .page{min-height:100vh;display:flex;flex-direction:column;}
  .topbar{display:flex;align-items:center;gap:12px;padding:11px 20px;border-bottom:1px solid var(--border);background:var(--bg-2);position:sticky;top:0;z-index:10;}
  .back-btn{display:flex;align-items:center;gap:6px;color:var(--text-3);text-decoration:none;font-size:13px;padding:5px 10px;border-radius:7px;border:1px solid var(--border);transition:.13s;white-space:nowrap;}
  .back-btn:hover{color:var(--text-1);border-color:var(--border-hover);}
  .topbar-title{font-size:14px;font-weight:600;color:var(--text-1);flex:1;}
  .topbar-actions{display:flex;gap:8px;}
  .action-btn{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:500;border:1px solid var(--border);background:var(--bg-3);color:var(--text-1);cursor:pointer;font-family:'Geist',sans-serif;transition:.13s;white-space:nowrap;}
  .action-btn:hover{border-color:var(--border-hover);}
  .action-btn:disabled{opacity:.4;cursor:not-allowed;}
  .action-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;}
  .action-btn.primary:hover{opacity:.88;}
  .layout{display:flex;flex:1;min-height:0;}
  .preview-wrap{flex:1;padding:20px;display:flex;align-items:flex-start;justify-content:center;position:relative;min-width:0;background:var(--bg-1);}
  .preview-canvas{max-width:100%;height:auto;border-radius:10px;border:1px solid var(--border);display:block;}
  .gen-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);color:var(--text-3);font-size:13px;font-family:'Geist Mono',monospace;}
  .controls{width:270px;flex-shrink:0;background:var(--bg-2);border-left:1px solid var(--border);padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;}
  .ctrl-section{padding:12px 0;border-bottom:1px solid var(--border);}
  .ctrl-section:last-child{border-bottom:none;}
  .ctrl-section-title{font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;}
  .ctrl-group{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;}
  .ctrl-group:last-child{margin-bottom:0;}
  .ctrl-group label{font-size:12.5px;color:var(--text-2);font-weight:500;display:flex;justify-content:space-between;align-items:center;}
  .ctrl-val{color:var(--text-3);font-weight:400;}
  .mono{font-family:'Geist Mono',monospace;}
  .small{font-size:11px;}
  .label-row{display:flex;align-items:center;gap:4px;}
  input[type="range"]{width:100%;accent-color:var(--accent);cursor:pointer;}
  input[type="number"]{width:100%;background:var(--bg-1);border:1px solid var(--border);border-radius:7px;padding:6px 10px;color:var(--text-1);font-size:13px;font-family:'Geist Mono',monospace;outline:none;transition:border-color .13s;}
  input[type="number"]:focus{border-color:var(--border-hover);}
  .size-row{display:flex;align-items:center;gap:6px;}
  .size-row input{flex:1;}
  .size-x{color:var(--text-3);font-size:13px;flex-shrink:0;}
  .preset-row{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;}
  .color-swatch{width:30px;height:30px;border-radius:7px;border:1px solid var(--border);padding:2px;background:var(--bg-1);cursor:pointer;flex-shrink:0;}
  .chip-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
  .chip{padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .chip.active{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}
  .chip.small{padding:3px 8px;font-size:11px;}
  .chip:hover{border-color:var(--border-hover);color:var(--text-1);}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
  .toggle-label{font-size:12.5px;color:var(--text-2);}
  .toggle{padding:3px 10px;border-radius:20px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-3);font-size:11px;font-family:'Geist Mono',monospace;cursor:pointer;transition:.13s;}
  .toggle.on{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}
  .stop-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
  .stop-slider{flex:1;}
  .stop-remove{background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px;border-radius:5px;display:flex;transition:.13s;}
  .stop-remove:hover{color:var(--red);background:rgba(248,113,113,.1);}
  .stop-remove:disabled{opacity:.3;cursor:not-allowed;}
  .add-stop-btn{display:flex;align-items:center;gap:4px;padding:6px 10px;border-radius:6px;border:1px dashed var(--border);background:var(--bg-3);color:var(--text-3);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;width:100%;}
  .add-stop-btn:hover{border-color:var(--accent);color:var(--accent);}
  @media(max-width:700px){.layout{flex-direction:column;}.controls{width:100%;border-left:none;border-top:1px solid var(--border);}.topbar-title{display:none;}}
</style>
