<!-- src/routes/generators/noise/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { IconArrowLeft, IconDownload, IconRefresh, IconInfoCircle } from '@tabler/icons-svelte';
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

  type NoiseType = 'perlin' | 'simplex' | 'value' | 'voronoi';
  type ColorMode = 'grayscale' | 'heatmap' | 'terrain' | 'custom';
  let noiseType: NoiseType = $state('perlin');
  let scale = $state(50);
  let octaves = $state(4);
  let persistence = $state(0.5);
  let seed = $state(Math.floor(Math.random() * 99999));
  let colorMode: ColorMode = $state('grayscale');
  let canvasW = $state(800);
  let canvasH = $state(500);
  let customColor1 = $state('#6366f1');
  let customColor2 = $state('#f87171');

  let showSave = $state(false);
  let canvas: HTMLCanvasElement;
  let generating = $state(false);

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

  function createValue(rand: ()=>number) {
    const grid: number[][] = [];
    const gs = 256;
    for (let i = 0; i < gs; i++) { grid[i] = []; for (let j = 0; j < gs; j++) grid[i][j] = rand(); }
    return (x: number, y: number) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const i00 = grid[(ix & (gs-1))][(iy & (gs-1)) & (gs-1)];
      const i10 = grid[((ix+1) & (gs-1))][(iy & (gs-1)) & (gs-1)];
      const i01 = grid[(ix & (gs-1))][((iy+1) & (gs-1)) & (gs-1)];
      const i11 = grid[((ix+1) & (gs-1))][((iy+1) & (gs-1)) & (gs-1)];
      return i00*(1-sx)*(1-sy) + i10*sx*(1-sy) + i01*(1-sx)*sy + i11*sx*sy;
    };
  }

  function createVoronoi(rand: ()=>number) {
    const points: {x:number,y:number}[] = [];
    const count = 40;
    for (let i = 0; i < count; i++) points.push({ x: rand() * 1000, y: rand() * 1000 });
    return (x: number, y: number) => {
      let minD = Infinity;
      for (const p of points) {
        const d = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
        if (d < minD) minD = d;
      }
      return Math.min(1, minD / 100);
    };
  }

  function fbm(noiseFn: (x:number,y:number)=>number, x: number, y: number, oct: number, pers: number) {
    let val = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < oct; i++) {
      val += noiseFn(x * freq, y * freq) * amp;
      max += amp;
      amp *= pers;
      freq *= 2;
    }
    return val / max;
  }

  function hexToRgb(hex: string) {
    const h = hex.replace('#','');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }

  function lerpColor(c1: number[], c2: number[], t: number) {
    return c1.map((v,i) => Math.round(v + (c2[i] - v) * t));
  }

  function getPixelColor(v: number): [number, number, number] {
    switch (colorMode) {
      case 'grayscale': { const g = Math.round(v * 255); return [g, g, g]; }
      case 'heatmap': {
        const t = Math.max(0, Math.min(1, v));
        if (t < 0.25) return lerpColor([0,0,128], [0,0,255], t*4);
        if (t < 0.5) return lerpColor([0,0,255], [0,255,255], (t-0.25)*4);
        if (t < 0.75) return lerpColor([0,255,255], [255,255,0], (t-0.5)*4);
        return lerpColor([255,255,0], [255,0,0], (t-0.75)*4);
      }
      case 'terrain': {
        const t = Math.max(0, Math.min(1, v));
        if (t < 0.3) return lerpColor([20,50,20], [34,120,34], t/0.3);
        if (t < 0.6) return lerpColor([34,120,34], [180,160,80], (t-0.3)/0.3);
        if (t < 0.8) return lerpColor([180,160,80], [140,120,60], (t-0.6)/0.2);
        return lerpColor([140,120,60], [240,240,240], (t-0.8)/0.2);
      }
      case 'custom': {
        const c1 = hexToRgb(customColor1);
        const c2 = hexToRgb(customColor2);
        return lerpColor(c1, c2, v) as [number, number, number];
      }
    }
  }

  function generate() {
    if (!canvas) return;
    generating = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d')!;
      canvas.width = canvasW; canvas.height = canvasH;

      const rand = mulberry32(seed);
      let noiseFn: (x:number,y:number)=>number;

      switch (noiseType) {
        case 'perlin': noiseFn = createPerlin(rand); break;
        case 'value': noiseFn = createValue(rand); break;
        case 'voronoi': noiseFn = createVoronoi(rand); break;
        default: noiseFn = createPerlin(rand); break;
      }

      const imageData = ctx.createImageData(canvasW, canvasH);
      const data = imageData.data;
      const scaleVal = scale / 1000;

      for (let y = 0; y < canvasH; y++) {
        for (let x = 0; x < canvasW; x++) {
          const v = fbm(noiseFn, x * scaleVal, y * scaleVal, octaves, persistence);
          const [r, g, b] = getPixelColor(v);
          const idx = (y * canvasW + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      generating = false;
    }));
  }

  function randomize() { seed = Math.floor(Math.random() * 99999); }

  $effect(() => {
    const _ = noiseType + scale + octaves + persistence + seed + colorMode + canvasW + canvasH + customColor1 + customColor2;
    if (canvas) generate();
  });
</script>

<svelte:head>
  <title>Noise · Generators · {NAME}'s Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

<SaveDialog
  open={showSave}
  defaultName={`noise-${seed}`}
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
    <span class="topbar-title">Noise</span>
    <div class="topbar-actions">
      <button class="action-btn" onclick={randomize} disabled={generating}><IconRefresh size={15}/> Randomize</button>
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
        <h3 class="ctrl-section-title">Noise Type</h3>
        <div class="chip-row">
          {#each ['perlin','simplex','value','voronoi'] as n}
            <button class="chip" class:active={noiseType===n} onclick={()=>noiseType=n as NoiseType}>{n}</button>
          {/each}
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Parameters</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Scale / Zoom</span><span class="ctrl-val">{scale}</span></label>
          <input type="range" bind:value={scale} min="5" max="200"/>
        </div>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Octaves</span><span class="ctrl-val">{octaves}</span></label>
          <input type="range" bind:value={octaves} min="1" max="8"/>
        </div>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Persistence</span><span class="ctrl-val">{persistence.toFixed(2)}</span></label>
          <input type="range" bind:value={persistence} min="0.1" max="0.9" step="0.05"/>
        </div>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Seed</span><span class="ctrl-val mono">{seed}</span></label>
          <input type="number" bind:value={seed} min="0" max="99999"/>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Color</h3>
        <div class="chip-row">
          {#each ['grayscale','heatmap','terrain','custom'] as c}
            <button class="chip" class:active={colorMode===c} onclick={()=>colorMode=c as ColorMode}>{c}</button>
          {/each}
        </div>
        {#if colorMode === 'custom'}
          <div class="ctrl-group">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label>Color 1</label>
            <div class="color-row">
              <input type="color" bind:value={customColor1} class="color-swatch"/>
              <span class="mono small">{customColor1}</span>
            </div>
          </div>
          <div class="ctrl-group">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label>Color 2</label>
            <div class="color-row">
              <input type="color" bind:value={customColor2} class="color-swatch"/>
              <span class="mono small">{customColor2}</span>
            </div>
          </div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Canvas</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Size</label>
          <div class="size-row">
            <input type="number" bind:value={canvasW} min="100" max="2000" step="50" placeholder="W"/>
            <span class="size-x">×</span>
            <input type="number" bind:value={canvasH} min="100" max="2000" step="50" placeholder="H"/>
          </div>
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
  .color-row{display:flex;align-items:center;gap:10px;}
  .color-swatch{width:30px;height:30px;border-radius:7px;border:1px solid var(--border);padding:2px;background:var(--bg-1);cursor:pointer;flex-shrink:0;}
  .color-row .mono{font-size:11.5px;color:var(--text-3);}
  .chip-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
  .chip{padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .chip.active{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}
  .chip:hover{border-color:var(--border-hover);color:var(--text-1);}
  @media(max-width:700px){.layout{flex-direction:column;}.controls{width:100%;border-left:none;border-top:1px solid var(--border);}.topbar-title{display:none;}}
</style>
