<!-- src/routes/generators/fractal/+page.svelte -->
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

  // ── Controls ──────────────────────────────────────────────────────────
  type FractalType = 'mandelbrot' | 'julia';
  let fractalType: FractalType = $state('mandelbrot');
  let maxIter = $state(100);
  type Palette = 'turbo' | 'inferno' | 'ice' | 'neon' | 'grayscale';
  let palette: Palette = $state('turbo');
  let juliaReal = $state(-0.7);
  let juliaImag = $state(0.27015);
  let canvasW = $state(800);
  let canvasH = $state(600);

  // ── Save ──────────────────────────────────────────────────────────────
  let showSave = $state(false);
  let canvas: HTMLCanvasElement;
  let generating = $state(false);

  // ── Tooltip ───────────────────────────────────────────────────────────
  let tooltip = $state<{text:string, x:number, y:number} | null>(null);
  function showTip(e: MouseEvent, text: string) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tooltip = { text, x: r.left + r.width / 2, y: r.top - 8 };
  }
  function hideTip() { tooltip = null; }

  // ── Templates ─────────────────────────────────────────────────────────
  const TEMPLATES = [
    { name: 'Turbo MB', desc: 'Classic Mandelbrot, turbo palette', apply: () => { fractalType='mandelbrot'; palette='turbo'; maxIter=100; }},
    { name: 'Inferno MB', desc: 'Mandelbrot, inferno palette', apply: () => { fractalType='mandelbrot'; palette='inferno'; maxIter=150; }},
    { name: 'Julia Spiral', desc: 'Spiral Julia set', apply: () => { fractalType='julia'; palette='neon'; maxIter=120; juliaReal=-0.7; juliaImag=0.27015; }},
    { name: 'Julia Dendrite', desc: 'Branching Julia set', apply: () => { fractalType='julia'; palette='ice'; maxIter=150; juliaReal=0; juliaImag=1; }},
    { name: 'Grayscale', desc: 'Monochrome Mandelbrot', apply: () => { fractalType='mandelbrot'; palette='grayscale'; maxIter=80; }},
    { name: 'Deep Zoom', desc: 'High iteration detail', apply: () => { fractalType='mandelbrot'; palette='turbo'; maxIter=500; }},
  ];

  // ── Tooltips map ──────────────────────────────────────────────────────
  const TIPS: Record<string, string> = {
    fractalType: 'Mandelbrot: classic fractal. Julia: use a fixed c parameter for different shapes',
    maxIter: 'Higher = more detail but slower render. 50-200 is usually enough',
    palette: 'Color mapping for iteration counts',
    juliaReal: 'Real component of the Julia set c parameter',
    juliaImag: 'Imaginary component of the Julia set c parameter',
    canvasSize: 'Output resolution',
  };

  // ── Color Palettes ────────────────────────────────────────────────────
  function turbo(t: number): [number, number, number] {
    t = Math.max(0, Math.min(1, t));
    const r = Math.round(255 * (0.13572138 + t * (4.6153926 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))))));
    const g = Math.round(255 * (0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (7.56348409 + t * 0.15444412))))));
    const b = Math.round(255 * (0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))))));
    return [r, g, b];
  }

  function inferno(t: number): [number, number, number] {
    t = Math.max(0, Math.min(1, t));
    const r = Math.round(255 * Math.min(1, Math.max(0, 0.0002 + t * (4.2 + t * (-8.6 + t * 8.4)))));
    const g = Math.round(255 * Math.min(1, Math.max(0, t * t * (3.3 - t * 2.7))));
    const b = Math.round(255 * Math.min(1, Math.max(0, 0.1 + t * (-1.5 + t * (4.5 - t * 3.5)))));
    return [r, g, b];
  }

  function ice(t: number): [number, number, number] {
    t = Math.max(0, Math.min(1, t));
    return [Math.round(180 + 75 * t), Math.round(220 + 35 * t * t), Math.round(255)];
  }

  function neon(t: number): [number, number, number] {
    t = Math.max(0, Math.min(1, t));
    return [
      Math.round(255 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 + 0))),
      Math.round(255 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 + 2.094))),
      Math.round(255 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 + 4.189))),
    ];
  }

  function grayscale(t: number): [number, number, number] {
    const v = Math.round(255 * t);
    return [v, v, v];
  }

  function getPalette(p: Palette, t: number): [number, number, number] {
    switch (p) {
      case 'turbo': return turbo(t);
      case 'inferno': return inferno(t);
      case 'ice': return ice(t);
      case 'neon': return neon(t);
      case 'grayscale': return grayscale(t);
    }
  }

  // ── Generate ──────────────────────────────────────────────────────────
  function generate() {
    if (!canvas) return;
    generating = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d')!;
      canvas.width = canvasW; canvas.height = canvasH;

      const imgData = ctx.createImageData(canvasW, canvasH);
      const data = imgData.data;

      for (let py = 0; py < canvasH; py++) {
        for (let px = 0; px < canvasW; px++) {
          const x0 = (px / canvasW) * 3.5 - 2.5;
          const y0 = (py / canvasH) * 3.0 - 1.5;

          let zx: number, zy: number, cx: number, cy: number;

          if (fractalType === 'mandelbrot') {
            zx = 0; zy = 0; cx = x0; cy = y0;
          } else {
            zx = x0; zy = y0; cx = juliaReal; cy = juliaImag;
          }

          let iter = 0;
          while (zx * zx + zy * zy <= 4 && iter < maxIter) {
            const tmp = zx * zx - zy * zy + cx;
            zy = 2 * zx * zy + cy;
            zx = tmp;
            iter++;
          }

          let color: [number, number, number];
          if (iter === maxIter) {
            color = [0, 0, 0];
          } else {
            // Smooth coloring
            const log2 = Math.log(2);
            const sl = iter + 1 - Math.log(Math.log(Math.sqrt(zx * zx + zy * zy))) / log2;
            const t = sl / maxIter;
            color = getPalette(palette, t);
          }

          const idx = (py * canvasW + px) * 4;
          data[idx] = color[0];
          data[idx + 1] = color[1];
          data[idx + 2] = color[2];
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      generating = false;
    }));
  }

  function randomize() {
    if (fractalType === 'julia') {
      juliaReal = Math.random() * 2 - 1;
      juliaImag = Math.random() * 2 - 1;
    }
  }

  $effect(() => {
    const _ = fractalType + maxIter + palette + juliaReal + juliaImag + canvasW + canvasH;
    if (canvas) generate();
  });
</script>

<svelte:head>
  <title>Fractal · Generators · {NAME}'s Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

{#if tooltip}
  <div class="tooltip" style="left:{tooltip.x}px;top:{tooltip.y}px">{tooltip.text}</div>
{/if}

<SaveDialog
  open={showSave}
  defaultName={`fractal-${fractalType}`}
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
    <span class="topbar-title">Fractal</span>
    <div class="topbar-actions">
      <button class="action-btn" onclick={randomize} disabled={generating || fractalType !== 'julia'}><IconRefresh size={15}/> Randomize</button>
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
        <h3 class="ctrl-section-title">Templates</h3>
        <div class="template-grid">
          {#each TEMPLATES as tpl}
            <button class="tpl-btn" onclick={tpl.apply} title={tpl.desc}>{tpl.name}</button>
          {/each}
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Fractal</h3>
        <div class="ctrl-group">
          <label><span class="label-row">Type <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.fractalType)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="chip-row">
            {#each ['mandelbrot', 'julia'] as t}
              <button class="chip" class:active={fractalType===t} onclick={()=>fractalType=t as FractalType}>{t}</button>
            {/each}
          </div>
        </div>
        <div class="ctrl-group">
          <label for="maxIter"><span class="label-row">Max iterations <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.maxIter)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{maxIter}</span></label>
          <input id="maxIter" type="range" bind:value={maxIter} min="10" max="500" step="10"/>
        </div>
        <div class="ctrl-group">
          <label><span class="label-row">Palette <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.palette)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="chip-row">
            {#each ['turbo', 'inferno', 'ice', 'neon', 'grayscale'] as p}
              <button class="chip" class:active={palette===p} onclick={()=>palette=p as Palette}>{p}</button>
            {/each}
          </div>
        </div>
      </section>

      {#if fractalType === 'julia'}
        <section class="ctrl-section">
          <h3 class="ctrl-section-title">Julia Parameter</h3>
          <div class="ctrl-group">
            <label for="juliaReal"><span class="label-row">Real <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.juliaReal)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val mono">{juliaReal.toFixed(4)}</span></label>
            <input id="juliaReal" type="range" bind:value={juliaReal} min="-2" max="2" step="0.01"/>
          </div>
          <div class="ctrl-group">
            <label for="juliaImag"><span class="label-row">Imaginary <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.juliaImag)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val mono">{juliaImag.toFixed(4)}</span></label>
            <input id="juliaImag" type="range" bind:value={juliaImag} min="-2" max="2" step="0.01"/>
          </div>
        </section>
      {/if}

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Canvas</h3>
        <div class="ctrl-group">
          <label><span class="label-row">Size <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.canvasSize)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="size-row">
            <input type="number" bind:value={canvasW} min="200" max="4000" step="100" placeholder="W"/>
            <span class="size-x">×</span>
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
  .tip-btn{background:none;border:none;padding:0;cursor:pointer;color:var(--text-3);display:flex;align-items:center;transition:color .13s;line-height:1;}
  .tip-btn:hover{color:var(--accent);}

  .tooltip{position:fixed;transform:translate(-50%,-100%);background:#1e1e2e;border:1px solid var(--border);color:var(--text-2);font-size:11.5px;padding:6px 10px;border-radius:7px;max-width:220px;text-align:center;pointer-events:none;z-index:9999;line-height:1.4;white-space:normal;font-family:'Geist',sans-serif;}

  input[type="range"]{width:100%;accent-color:var(--accent);cursor:pointer;}
  input[type="number"]{width:100%;background:var(--bg-1);border:1px solid var(--border);border-radius:7px;padding:6px 10px;color:var(--text-1);font-size:13px;font-family:'Geist Mono',monospace;outline:none;transition:border-color .13s;}
  input[type="number"]:focus{border-color:var(--border-hover);}

  .size-row{display:flex;align-items:center;gap:6px;}
  .size-row input{flex:1;}
  .size-x{color:var(--text-3);font-size:13px;flex-shrink:0;}
  .preset-row{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;}

  .chip-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
  .chip{padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .chip.active{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}
  .chip.small{padding:3px 8px;font-size:11px;}
  .chip:hover{border-color:var(--border-hover);color:var(--text-1);}

  .template-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
  .tpl-btn{padding:6px 8px;border-radius:7px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:11.5px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .tpl-btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.08);}

  @media(max-width:700px){
    .layout{flex-direction:column;}
    .controls{width:100%;border-left:none;border-top:1px solid var(--border);}
    .topbar-title{display:none;}
  }
</style>
