<!-- src/routes/generators/patterns/+page.svelte -->
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

  type PatternType = 'tessellation' | 'mandala' | 'spirals' | 'waves' | 'grid' | 'circles';
  let patternType: PatternType = $state('tessellation');
  let primaryColor = $state('#6366f1');
  let secondaryColor = $state('#a78bfa');
  let bgColor = $state('#0d0d1a');
  let density = $state(12);
  let rotation = $state(0);
  let scale = $state(1.0);
  let mirrorX = $state(false);
  let mirrorY = $state(false);
  let canvasW = $state(800);
  let canvasH = $state(500);
  let seed = $state(Math.floor(Math.random() * 99999));

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

  function hexToRgb(hex: string) {
    const h = hex.replace('#','');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }

  function drawTessellation(ctx: CanvasRenderingContext2D, w: number, h: number, rand: ()=>number) {
    const [pr,pg,pb] = hexToRgb(primaryColor);
    const [sr,sg,sb] = hexToRgb(secondaryColor);
    const shapeSize = Math.max(20, 60 - density * 2);
    const cols = Math.ceil(w / shapeSize) + 2;
    const rows = Math.ceil(h / shapeSize) + 2;

    for (let r = -1; r < rows; r++) {
      for (let c = -1; c < cols; c++) {
        const x = c * shapeSize + (r % 2 ? shapeSize / 2 : 0);
        const y = r * shapeSize;
        const t = (Math.sin(x * 0.01 + y * 0.01 + rand() * 6.28) + 1) / 2;
        ctx.fillStyle = `rgba(${Math.round(pr + (sr-pr)*t)},${Math.round(pg + (sg-pg)*t)},${Math.round(pb + (sb-pb)*t)},0.85)`;
        ctx.beginPath();
        const sides = 3 + Math.floor(rand() * 4);
        for (let s = 0; s <= sides; s++) {
          const angle = (s / sides) * Math.PI * 2 + rand() * 0.3;
          const rad = shapeSize * 0.4 * (0.7 + rand() * 0.3);
          const px = x + Math.cos(angle) * rad;
          const py = y + Math.sin(angle) * rad;
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.3)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  function drawMandala(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const [pr,pg,pb] = hexToRgb(primaryColor);
    const [sr,sg,sb] = hexToRgb(secondaryColor);
    const cx = w / 2, cy = h / 2;
    const maxR = Math.min(w, h) * 0.45;
    const layers = density;

    for (let l = layers; l >= 1; l--) {
      const t = l / layers;
      const r = maxR * t;
      const petals = 6 + l * 2;
      const alpha = 0.3 + (1 - t) * 0.5;

      ctx.fillStyle = `rgba(${Math.round(pr + (sr-pr)*(1-t))},${Math.round(pg + (sg-pg)*(1-t))},${Math.round(pb + (sb-pb)*(1-t))},${alpha})`;
      ctx.beginPath();
      for (let p = 0; p < petals; p++) {
        const angle = (p / petals) * Math.PI * 2;
        const nextAngle = ((p + 1) / petals) * Math.PI * 2;
        const midAngle = (angle + nextAngle) / 2;
        const innerR = r * 0.3;
        const outerR = r;
        ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
        ctx.quadraticCurveTo(
          cx + Math.cos(midAngle) * outerR * 1.2, cy + Math.sin(midAngle) * outerR * 1.2,
          cx + Math.cos(nextAngle) * innerR, cy + Math.sin(nextAngle) * innerR
        );
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},${alpha * 0.6})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (let l = 1; l <= layers; l++) {
      const t = l / layers;
      const r = maxR * t;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},${0.15 + t * 0.2})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  function drawSpirals(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const [pr,pg,pb] = hexToRgb(primaryColor);
    const [sr,sg,sb] = hexToRgb(secondaryColor);
    const cx = w / 2, cy = h / 2;
    const arms = density;
    const maxR = Math.min(w, h) * 0.45;

    for (let a = 0; a < arms; a++) {
      const baseAngle = (a / arms) * Math.PI * 2;
      const t = a / arms;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${Math.round(pr + (sr-pr)*t)},${Math.round(pg + (sg-pg)*t)},${Math.round(pb + (sb-pb)*t)},0.8)`;
      ctx.lineWidth = 2;
      for (let i = 0; i <= 200; i++) {
        const frac = i / 200;
        const angle = baseAngle + frac * Math.PI * 6;
        const r = frac * maxR;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawWaves(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const [pr,pg,pb] = hexToRgb(primaryColor);
    const [sr,sg,sb] = hexToRgb(secondaryColor);
    const lines = density * 3;

    for (let i = 0; i < lines; i++) {
      const t = i / lines;
      const y = t * h;
      const alpha = 0.3 + Math.sin(t * Math.PI) * 0.5;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${Math.round(pr + (sr-pr)*t)},${Math.round(pg + (sg-pg)*t)},${Math.round(pb + (sb-pb)*t)},${alpha})`;
      ctx.lineWidth = 1.5;
      for (let x = 0; x <= w; x += 2) {
        const freq = 0.005 + t * 0.01;
        const amp = 20 + t * 30;
        const py = y + Math.sin(x * freq + t * 10) * amp;
        if (x === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
      }
      ctx.stroke();
    }
  }

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const [pr,pg,pb] = hexToRgb(primaryColor);
    const [sr,sg,sb] = hexToRgb(secondaryColor);
    const cellSize = Math.max(10, 80 - density * 3);
    const cols = Math.ceil(w / cellSize);
    const rows = Math.ceil(h / cellSize);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellSize, y = r * cellSize;
        const t = ((r + c) % 2) / 1;
        ctx.fillStyle = `rgba(${Math.round(pr + (sr-pr)*t)},${Math.round(pg + (sg-pg)*t)},${Math.round(pb + (sb-pb)*t)},0.6)`;
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.2)`;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }
    }
  }

  function drawCircles(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const [pr,pg,pb] = hexToRgb(primaryColor);
    const [sr,sg,sb] = hexToRgb(secondaryColor);
    const rings = density;

    for (let i = rings; i >= 1; i--) {
      const t = i / rings;
      const r = Math.min(w, h) * 0.45 * t;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.round(pr + (sr-pr)*(1-t))},${Math.round(pg + (sg-pg)*(1-t))},${Math.round(pb + (sb-pb)*(1-t))},${0.15 + (1-t)*0.3})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},${0.3 + t * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function generate() {
    if (!canvas) return;
    generating = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d')!;
      canvas.width = canvasW; canvas.height = canvasH;

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasW, canvasH);

      ctx.save();
      if (rotation !== 0) {
        ctx.translate(canvasW / 2, canvasH / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.translate(-canvasW / 2, -canvasH / 2);
      }
      if (scale !== 1) {
        ctx.translate(canvasW / 2, canvasH / 2);
        ctx.scale(scale, scale);
        ctx.translate(-canvasW / 2, -canvasH / 2);
      }

      const rand = mulberry32(seed);

      const drawOnce = () => {
        switch (patternType) {
          case 'tessellation': drawTessellation(ctx, canvasW, canvasH, rand); break;
          case 'mandala': drawMandala(ctx, canvasW, canvasH); break;
          case 'spirals': drawSpirals(ctx, canvasW, canvasH); break;
          case 'waves': drawWaves(ctx, canvasW, canvasH); break;
          case 'grid': drawGrid(ctx, canvasW, canvasH); break;
          case 'circles': drawCircles(ctx, canvasW, canvasH); break;
        }
      };

      drawOnce();
      if (mirrorX) { ctx.save(); ctx.scale(-1, 1); ctx.translate(-canvasW, 0); drawOnce(); ctx.restore(); }
      if (mirrorY) { ctx.save(); ctx.scale(1, -1); ctx.translate(0, -canvasH); drawOnce(); ctx.restore(); }
      if (mirrorX && mirrorY) { ctx.save(); ctx.scale(-1, -1); ctx.translate(-canvasW, -canvasH); drawOnce(); ctx.restore(); }

      ctx.restore();
      generating = false;
    }));
  }

  function randomize() { seed = Math.floor(Math.random() * 99999); }

  $effect(() => {
    const _ = patternType + primaryColor + secondaryColor + bgColor + density + rotation + scale
      + String(mirrorX) + String(mirrorY) + canvasW + canvasH + seed;
    if (canvas) generate();
  });
</script>

<svelte:head>
  <title>Patterns · Generators · {NAME}'s Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

<SaveDialog
  open={showSave}
  defaultName={`pattern-${seed}`}
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
    <span class="topbar-title">Patterns</span>
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
        <h3 class="ctrl-section-title">Pattern Type</h3>
        <div class="chip-row">
          {#each ['tessellation','mandala','spirals','waves','grid','circles'] as p}
            <button class="chip" class:active={patternType===p} onclick={()=>patternType=p as PatternType}>{p}</button>
          {/each}
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Parameters</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Density</span><span class="ctrl-val">{density}</span></label>
          <input type="range" bind:value={density} min="3" max="30"/>
        </div>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Scale</span><span class="ctrl-val">{scale.toFixed(1)}</span></label>
          <input type="range" bind:value={scale} min="0.2" max="3" step="0.1"/>
        </div>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Rotation</span><span class="ctrl-val">{rotation}°</span></label>
          <input type="range" bind:value={rotation} min="-180" max="180"/>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Colors</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Primary</label>
          <div class="color-row">
            <input type="color" bind:value={primaryColor} class="color-swatch"/>
            <span class="mono small">{primaryColor}</span>
          </div>
        </div>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Secondary</label>
          <div class="color-row">
            <input type="color" bind:value={secondaryColor} class="color-swatch"/>
            <span class="mono small">{secondaryColor}</span>
          </div>
        </div>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Background</label>
          <div class="color-row">
            <input type="color" bind:value={bgColor} class="color-swatch"/>
            <span class="mono small">{bgColor}</span>
          </div>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Transform</h3>
        <div class="toggle-row">
          <span class="toggle-label">Mirror X</span>
          <button class="toggle" class:on={mirrorX} onclick={()=>mirrorX=!mirrorX}>{mirrorX?'on':'off'}</button>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Mirror Y</span>
          <button class="toggle" class:on={mirrorY} onclick={()=>mirrorY=!mirrorY}>{mirrorY?'on':'off'}</button>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Canvas</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Size</label>
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
  input[type="range"]{width:100%;accent-color:var(--accent);cursor:pointer;}
  input[type="number"]{width:100%;background:var(--bg-1);border:1px solid var(--border);border-radius:7px;padding:6px 10px;color:var(--text-1);font-size:13px;font-family:'Geist Mono',monospace;outline:none;transition:border-color .13s;}
  input[type="number"]:focus{border-color:var(--border-hover);}
  .size-row{display:flex;align-items:center;gap:6px;}
  .size-row input{flex:1;}
  .size-x{color:var(--text-3);font-size:13px;flex-shrink:0;}
  .preset-row{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;}
  .color-row{display:flex;align-items:center;gap:10px;}
  .color-swatch{width:30px;height:30px;border-radius:7px;border:1px solid var(--border);padding:2px;background:var(--bg-1);cursor:pointer;flex-shrink:0;}
  .color-row .mono{font-size:11.5px;color:var(--text-3);}
  .chip-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
  .chip{padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .chip.active{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}
  .chip.small{padding:3px 8px;font-size:11px;}
  .chip:hover{border-color:var(--border-hover);color:var(--text-1);}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
  .toggle-label{font-size:12.5px;color:var(--text-2);}
  .toggle{padding:3px 10px;border-radius:20px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-3);font-size:11px;font-family:'Geist Mono',monospace;cursor:pointer;transition:.13s;}
  .toggle.on{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}
  @media(max-width:700px){.layout{flex-direction:column;}.controls{width:100%;border-left:none;border-top:1px solid var(--border);}.topbar-title{display:none;}}
</style>
