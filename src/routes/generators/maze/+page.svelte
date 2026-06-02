<!-- src/routes/generators/maze/+page.svelte -->
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
  let gridW = $state(20);
  let gridH = $state(15);
  let seed = $state(Math.floor(Math.random() * 99999));
  let wallColor = $state('#e2e2e2');
  let pathColor = $state('#6366f1');
  let bgColor = $state('#080808');
  let showSolution = $state(false);
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
    { name: 'Dark', desc: 'Classic dark theme', apply: () => { wallColor='#e2e2e2'; pathColor='#6366f1'; bgColor='#080808'; }},
    { name: 'Neon', desc: 'Vibrant neon colors', apply: () => { wallColor='#00ff88'; pathColor='#ff00ff'; bgColor='#0a0a0a'; }},
    { name: 'Paper', desc: 'Clean paper look', apply: () => { wallColor='#333333'; pathColor='#666666'; bgColor='#f5f5f0'; }},
    { name: 'Forest', desc: 'Natural green tones', apply: () => { wallColor='#4ade80'; pathColor='#166534'; bgColor='#0d1a0f'; }},
    { name: 'Ocean', desc: 'Deep sea blues', apply: () => { wallColor='#38bdf8'; pathColor='#0c4a6e'; bgColor='#0c1929'; }},
  ];

  // ── Tooltips map ──────────────────────────────────────────────────────
  const TIPS: Record<string, string> = {
    seed: 'Random seed — same seed always produces the same maze',
    gridW: 'Number of columns in the maze grid',
    gridH: 'Number of rows in the maze grid',
    wallColor: 'Color of the maze walls',
    pathColor: 'Color of the solution path overlay',
    bgColor: 'Canvas background color',
    showSolution: 'Show the solution path from top-left to bottom-right',
    canvasSize: 'Output resolution — higher = larger file, slower render',
  };

  // ── RNG ───────────────────────────────────────────────────────────────
  function mulberry32(s: number) {
    return () => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ── Maze Generation (Recursive Backtracking) ──────────────────────────
  type Cell = { top: boolean; right: boolean; bottom: boolean; left: boolean; visited: boolean };

  function generateMaze(w: number, h: number, rand: () => number): Cell[][] {
    const grid: Cell[][] = [];
    for (let r = 0; r < h; r++) {
      grid[r] = [];
      for (let c = 0; c < w; c++) {
        grid[r][c] = { top: true, right: true, bottom: true, left: true, visited: false };
      }
    }

    const stack: [number, number][] = [];
    const startR = 0, startC = 0;
    grid[startR][startC].visited = true;
    stack.push([startR, startC]);

    const dirs: [number, number, keyof Cell, keyof Cell][] = [
      [-1, 0, 'top', 'bottom'],
      [0, 1, 'right', 'left'],
      [1, 0, 'bottom', 'top'],
      [0, -1, 'left', 'right'],
    ];

    while (stack.length > 0) {
      const [cr, cc] = stack[stack.length - 1];
      const neighbors: [number, number, keyof Cell, keyof Cell][] = [];
      for (const [dr, dc, wall, opposite] of dirs) {
        const nr = cr + dr, nc = cc + dc;
        if (nr >= 0 && nr < h && nc >= 0 && nc < w && !grid[nr][nc].visited) {
          neighbors.push([nr, nc, wall, opposite]);
        }
      }
      if (neighbors.length === 0) {
        stack.pop();
      } else {
        const idx = Math.floor(rand() * neighbors.length);
        const [nr, nc, wall, opposite] = neighbors[idx];
        grid[cr][cc][wall] = false;
        grid[nr][nc][opposite] = false;
        grid[nr][nc].visited = true;
        stack.push([nr, nc]);
      }
    }
    return grid;
  }

  // ── Solve maze (BFS shortest path) ────────────────────────────────────
  function solveMaze(grid: Cell[][], w: number, h: number): [number, number][] | null {
    const visited = Array.from({ length: h }, () => new Uint8Array(w));
    const parent = Array.from({ length: h }, () => new Int32Array(w).fill(-1));
    const q: [number, number][] = [[0, 0]];
    visited[0][0] = 1;
    const dirs: [number, number, keyof Cell][] = [
      [-1, 0, 'top'], [0, 1, 'right'], [1, 0, 'bottom'], [0, -1, 'left'],
    ];

    while (q.length > 0) {
      const [cr, cc] = q.shift()!;
      if (cr === h - 1 && cc === w - 1) {
        const path: [number, number][] = [];
        let r = h - 1, c = w - 1;
        while (r !== 0 || c !== 0) {
          path.unshift([r, c]);
          const p = parent[r][c];
          r = Math.floor(p / w);
          c = p % w;
        }
        path.unshift([0, 0]);
        return path;
      }
      for (const [dr, dc, wall] of dirs) {
        const nr = cr + dr, nc = cc + dc;
        if (nr >= 0 && nr < h && nc >= 0 && nc < w && !visited[nr][nc] && !grid[cr][cc][wall]) {
          visited[nr][nc] = 1;
          parent[nr][nc] = cr * w + cc;
          q.push([nr, nc]);
        }
      }
    }
    return null;
  }

  // ── Generate ──────────────────────────────────────────────────────────
  function generate() {
    if (!canvas) return;
    generating = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d')!;
      canvas.width = canvasW; canvas.height = canvasH;

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasW, canvasH);

      const rand = mulberry32(seed);
      const maze = generateMaze(gridW, gridH, rand);

      const cellW = canvasW / gridW;
      const cellH = canvasH / gridH;
      const wallThick = Math.max(1, Math.min(cellW, cellH) * 0.08);

      // Draw paths (open cells)
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Draw walls
      ctx.strokeStyle = wallColor;
      ctx.lineWidth = wallThick;
      ctx.lineCap = 'round';

      for (let r = 0; r < gridH; r++) {
        for (let c = 0; c < gridW; c++) {
          const x = c * cellW;
          const y = r * cellH;
          const cell = maze[r][c];
          if (cell.top) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cellW, y); ctx.stroke(); }
          if (cell.right) { ctx.beginPath(); ctx.moveTo(x + cellW, y); ctx.lineTo(x + cellW, y + cellH); ctx.stroke(); }
          if (cell.bottom) { ctx.beginPath(); ctx.moveTo(x, y + cellH); ctx.lineTo(x + cellW, y + cellH); ctx.stroke(); }
          if (cell.left) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + cellH); ctx.stroke(); }
        }
      }

      // Draw outer border
      ctx.strokeStyle = wallColor;
      ctx.lineWidth = wallThick * 1.5;
      ctx.strokeRect(0, 0, canvasW, canvasH);

      // Draw solution path
      if (showSolution) {
        const path = solveMaze(maze, gridW, gridH);
        if (path) {
          ctx.strokeStyle = pathColor;
          ctx.lineWidth = wallThick * 1.8;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i < path.length; i++) {
            const [pr, pc] = path[i];
            const cx = (pc + 0.5) * cellW;
            const cy = (pr + 0.5) * cellH;
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
          }
          ctx.stroke();

          // Draw start/end markers
          ctx.fillStyle = pathColor;
          ctx.beginPath();
          ctx.arc((0 + 0.5) * cellW, (0 + 0.5) * cellH, wallThick * 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc((gridW - 0.5) * cellW, (gridH - 0.5) * cellH, wallThick * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      generating = false;
    }));
  }

  function randomize() { seed = Math.floor(Math.random() * 99999); }

  $effect(() => {
    const _ = gridW + gridH + seed + wallColor + pathColor + bgColor + String(showSolution) + canvasW + canvasH;
    if (canvas) generate();
  });
</script>

<svelte:head>
  <title>Maze · Generators · {NAME}'s Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

{#if tooltip}
  <div class="tooltip" style="left:{tooltip.x}px;top:{tooltip.y}px">{tooltip.text}</div>
{/if}

<SaveDialog
  open={showSave}
  defaultName={`maze-${seed}`}
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
    <span class="topbar-title">Maze</span>
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
        <h3 class="ctrl-section-title">Templates</h3>
        <div class="template-grid">
          {#each TEMPLATES as tpl}
            <button class="tpl-btn" onclick={tpl.apply} title={tpl.desc}>{tpl.name}</button>
          {/each}
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Grid</h3>
        <div class="ctrl-group">
          <label for="gridW"><span class="label-row">Width <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.gridW)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{gridW}</span></label>
          <input id="gridW" type="range" bind:value={gridW} min="8" max="64"/>
        </div>
        <div class="ctrl-group">
          <label for="gridH"><span class="label-row">Height <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.gridH)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{gridH}</span></label>
          <input id="gridH" type="range" bind:value={gridH} min="8" max="64"/>
        </div>
        <div class="ctrl-group">
          <label for="seed"><span class="label-row">Seed <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.seed)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val mono">{seed}</span></label>
          <input id="seed" type="number" bind:value={seed} min="0" max="99999"/>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Colors</h3>
        <div class="ctrl-group">
          <label for="bgColor"><span class="label-row">Background <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.bgColor)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="color-row">
            <input id="bgColor" type="color" bind:value={bgColor} class="color-swatch"/>
            <span class="mono small">{bgColor}</span>
          </div>
        </div>
        <div class="ctrl-group">
          <label for="wallColor"><span class="label-row">Wall color <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.wallColor)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="color-row">
            <input id="wallColor" type="color" bind:value={wallColor} class="color-swatch"/>
            <span class="mono small">{wallColor}</span>
          </div>
        </div>
        <div class="toggle-row">
          <span class="label-row toggle-label">Show solution <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.showSolution)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span>
          <button class="toggle" class:on={showSolution} onclick={()=>showSolution=!showSolution}>{showSolution?'on':'off'}</button>
        </div>
        {#if showSolution}
          <div class="ctrl-group">
            <label for="pathColor"><span class="label-row">Path color <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.pathColor)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
            <div class="color-row">
              <input id="pathColor" type="color" bind:value={pathColor} class="color-swatch"/>
              <span class="mono small">{pathColor}</span>
            </div>
          </div>
        {/if}
      </section>

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

  .color-row{display:flex;align-items:center;gap:10px;}
  .color-swatch{width:30px;height:30px;border-radius:7px;border:1px solid var(--border);padding:2px;background:var(--bg-1);cursor:pointer;flex-shrink:0;}
  .color-row .mono{font-size:11.5px;color:var(--text-3);}

  .chip{padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .chip.small{padding:3px 8px;font-size:11px;}
  .chip:hover{border-color:var(--border-hover);color:var(--text-1);}

  .toggle-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
  .toggle-label{font-size:12.5px;color:var(--text-2);}
  .toggle{padding:3px 10px;border-radius:20px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-3);font-size:11px;font-family:'Geist Mono',monospace;cursor:pointer;transition:.13s;}
  .toggle.on{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}

  .template-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
  .tpl-btn{padding:6px 8px;border-radius:7px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:11.5px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .tpl-btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.08);}

  @media(max-width:700px){
    .layout{flex-direction:column;}
    .controls{width:100%;border-left:none;border-top:1px solid var(--border);}
    .topbar-title{display:none;}
  }
</style>
