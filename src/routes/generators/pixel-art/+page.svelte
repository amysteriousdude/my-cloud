<!-- src/routes/generators/pixel-art/+page.svelte -->
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
  });

  const DARK  = {'--bg-1':'#080808','--bg-2':'#101010','--bg-3':'#141414','--text-1':'#e2e2e2','--text-2':'#888','--text-3':'#444','--border':'#1a1a1a','--border-hover':'#333','--accent':'#6366f1','--hover':'rgba(255,255,255,.04)','--red':'#f87171'};
  const LIGHT = {'--bg-1':'#fafafa','--bg-2':'#ffffff','--bg-3':'#f0f0f0','--text-1':'#1a1a1a','--text-2':'#555','--text-3':'#999','--border':'#e0e0e0','--border-hover':'#bbb','--accent':'#4f46e5','--hover':'rgba(0,0,0,.04)','--red':'#dc2626'};

  type Tool = 'pen' | 'eraser' | 'fill' | 'line' | 'rect' | 'circle';
  let gridSize = $state(16);
  let tool: Tool = $state('pen');
  let brushSize = $state(1);
  let showGrid = $state(true);
  let mirrorMode = $state(false);
  let currentColor = $state('#6366f1');

  const PALETTES: Record<string, string[]> = {
    'PICO-8': ['#000000','#1D2B53','#7E2553','#008751','#AB5236','#5F574F','#C2C3C7','#FFF1E8','#FF004D','#FFA300','#FFEC27','#00E436','#29ADFF','#83769C','#FF77A8','#FFCCAA'],
    'Gameboy': ['#0f380f','#306230','#8bac0f','#9bbc0f'],
    'Endesga': ['#be4a2f','#d77643','#ead4aa','#e4a672','#b86f50','#733e39','#3e2731','#a22633','#e43b44','#f77622','#feae34','#fee761','#63c74d','#3e8948','#265c42','#193c3e','#124e89','#0099db','#2ce8f5','#ffffff','#c0cbdc','#8b9bb4','#5a6988','#3a4466','#262b44','#181425','#ff0044','#68386c','#b55088','#f6757a','#e8b796','#c28569'],
    'Custom': ['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#ff8800','#8800ff'],
  };
  let paletteName = $state('PICO-8');
  let palette = $derived(PALETTES[paletteName] ?? PALETTES['PICO-8']);

  let pixels: string[][] = $state([]);
  let isDrawing = $state(false);
  let startCell = $state<{r:number,c:number}|null>(null);
  let previewPixels = $state<{r:number,c:string}[]>([]);

  let showSave = $state(false);
  let canvas: HTMLCanvasElement;

  function initGrid() {
    pixels = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => '')
    );
  }

  onMount(() => { initGrid(); });

  $effect(() => {
    const _ = gridSize;
    initGrid();
  });

  function getCellFromEvent(e: MouseEvent): {r:number,c:number} | null {
    const rect = canvas.getBoundingClientRect();
    const cellPx = rect.width / gridSize;
    const c = Math.floor((e.clientX - rect.left) / cellPx);
    const r = Math.floor((e.clientY - rect.top) / cellPx);
    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return null;
    return { r, c };
  }

  function setPixel(r: number, c: number, color: string) {
    if (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
      pixels[r][c] = color;
      if (mirrorMode) {
        const mc = gridSize - 1 - c;
        if (mc >= 0 && mc < gridSize) pixels[r][mc] = color;
      }
    }
  }

  function floodFill(startR: number, startC: number, fillColor: string) {
    const target = pixels[startR][startC];
    if (target === fillColor) return;
    const stack = [[startR, startC]];
    const visited = new Set<string>();
    while (stack.length) {
      const [r, c] = stack.pop()!;
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) continue;
      if (pixels[r][c] !== target) continue;
      visited.add(key);
      pixels[r][c] = fillColor;
      stack.push([r-1,c],[r+1,c],[r,c-1],[r,c+1]);
    }
  }

  function drawLine(r0: number, c0: number, r1: number, c1: number, color: string) {
    const dx = Math.abs(c1 - c0), dy = Math.abs(r1 - r0);
    const sx = c0 < c1 ? 1 : -1, sy = r0 < r1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      setPixel(r0, c0, color);
      if (r0 === r1 && c0 === c1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; c0 += sx; }
      if (e2 < dx) { err += dx; r0 += sy; }
    }
  }

  function drawRect(r0: number, c0: number, r1: number, c1: number, color: string) {
    const minR = Math.min(r0,r1), maxR = Math.max(r0,r1);
    const minC = Math.min(c0,c1), maxC = Math.max(c0,c1);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (r === minR || r === maxR || c === minC || c === maxC) setPixel(r, c, color);
      }
    }
  }

  function drawCircleShape(r0: number, c0: number, r1: number, c1: number, color: string) {
    const cx = (c0 + c1) / 2, cy = (r0 + r1) / 2;
    const rx = Math.abs(c1 - c0) / 2, ry = Math.abs(r1 - r0) / 2;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
      const c = Math.round(cx + Math.cos(angle) * rx);
      const r = Math.round(cy + Math.sin(angle) * ry);
      setPixel(r, c, color);
    }
  }

  function handleMouseDown(e: MouseEvent) {
    const cell = getCellFromEvent(e);
    if (!cell) return;
    isDrawing = true;
    startCell = cell;

    if (tool === 'pen' || tool === 'eraser') {
      const color = tool === 'pen' ? currentColor : '';
      for (let dr = 0; dr < brushSize; dr++) {
        for (let dc = 0; dc < brushSize; dc++) {
          setPixel(cell.r + dr, cell.c + dc, color);
        }
      }
    } else if (tool === 'fill') {
      floodFill(cell.r, cell.c, currentColor);
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDrawing) return;
    const cell = getCellFromEvent(e);
    if (!cell) return;

    if (tool === 'pen' || tool === 'eraser') {
      const color = tool === 'pen' ? currentColor : '';
      for (let dr = 0; dr < brushSize; dr++) {
        for (let dc = 0; dc < brushSize; dc++) {
          setPixel(cell.r + dr, cell.c + dc, color);
        }
      }
    } else if (startCell && (tool === 'line' || tool === 'rect' || tool === 'circle')) {
      // preview handled via $effect
    }
  }

  function handleMouseUp(e: MouseEvent) {
    if (!isDrawing || !startCell) { isDrawing = false; return; }
    const cell = getCellFromEvent(e) ?? startCell;

    if (tool === 'line') drawLine(startCell.r, startCell.c, cell.r, cell.c, currentColor);
    else if (tool === 'rect') drawRect(startCell.r, startCell.c, cell.r, cell.c, currentColor);
    else if (tool === 'circle') drawCircleShape(startCell.r, startCell.c, cell.r, cell.c, currentColor);

    isDrawing = false;
    startCell = null;
  }

  function renderCanvas() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const px = Math.floor(500 / gridSize);
    canvas.width = px * gridSize;
    canvas.height = px * gridSize;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (pixels[r]?.[c]) {
          ctx.fillStyle = pixels[r][c];
          ctx.fillRect(c * px, r * px, px, px);
        }
        if (showGrid) {
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(c * px, r * px, px, px);
        }
      }
    }
  }

  $effect(() => {
    const _ = pixels + showGrid + gridSize;
    renderCanvas();
  });

  function clearCanvas() {
    pixels = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => '')
    );
  }
</script>

<svelte:head>
  <title>Pixel Art · Generators · {NAME}'s Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

<SaveDialog
  open={showSave}
  defaultName="pixel-art"
  apiKey={apiKey}
  onconfirm={(name) => { renderCanvas(); const a=document.createElement('a'); a.href=canvas.toDataURL('image/png'); a.download=name; a.click(); }}
  onsave={async (name, folderId) => {
    renderCanvas();
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
    <span class="topbar-title">Pixel Art</span>
    <div class="topbar-actions">
      <button class="action-btn" onclick={clearCanvas}><IconRefresh size={15}/> Clear</button>
      <button class="action-btn primary" onclick={() => showSave=true}><IconDownload size={15}/> Save</button>
    </div>
  </header>

  <div class="layout">
    <div class="preview-wrap">
      <canvas
        bind:this={canvas}
        class="preview-canvas pixel-canvas"
        onmousedown={handleMouseDown}
        onmousemove={handleMouseMove}
        onmouseup={handleMouseUp}
        onmouseleave={handleMouseUp}
      ></canvas>
    </div>

    <aside class="controls">
      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Grid</h3>
        <div class="chip-row">
          {#each [8,16,32,64] as g}
            <button class="chip" class:active={gridSize===g} onclick={()=>gridSize=g}>{g}×{g}</button>
          {/each}
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Tool</h3>
        <div class="chip-row">
          {#each ['pen','eraser','fill','line','rect','circle'] as t}
            <button class="chip" class:active={tool===t} onclick={()=>tool=t as Tool}>{t}</button>
          {/each}
        </div>
        <div class="ctrl-group">
          <label><span class="label-row">Brush size</span><span class="ctrl-val">{brushSize}</span></label>
          <input type="range" bind:value={brushSize} min="1" max="4"/>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Show grid</span>
          <button class="toggle" class:on={showGrid} onclick={()=>showGrid=!showGrid}>{showGrid?'on':'off'}</button>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Mirror mode</span>
          <button class="toggle" class:on={mirrorMode} onclick={()=>mirrorMode=!mirrorMode}>{mirrorMode?'on':'off'}</button>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Palette</h3>
        <div class="chip-row">
          {#each Object.keys(PALETTES) as p}
            <button class="chip small" class:active={paletteName===p} onclick={()=>paletteName=p}>{p}</button>
          {/each}
        </div>
        <div class="palette-grid">
          {#each palette as color}
            <button
              class="palette-swatch"
              class:active={currentColor===color}
              style="background:{color}"
              onclick={()=>currentColor=color}
              title={color}
            ></button>
          {/each}
        </div>
        <div class="ctrl-group" style="margin-top:8px;">
          <label>Custom color</label>
          <div class="color-row">
            <input type="color" bind:value={currentColor} class="color-swatch"/>
            <span class="mono small">{currentColor}</span>
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
  .pixel-canvas{image-rendering:pixelated;cursor:crosshair;}
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
  .palette-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;}
  .palette-swatch{width:100%;aspect-ratio:1;border-radius:5px;border:2px solid transparent;cursor:pointer;transition:.13s;}
  .palette-swatch.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent);}
  .palette-swatch:hover{transform:scale(1.1);}
  @media(max-width:700px){.layout{flex-direction:column;}.controls{width:100%;border-left:none;border-top:1px solid var(--border);}.topbar-title{display:none;}}
</style>
