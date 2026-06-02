<!-- src/routes/generators/dither/+page.svelte -->
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

  // ── Controls ──────────────────────────────────────────────────────────
  type DitherAlg = 'floyd-steinberg' | 'atkinson' | 'none';
  let ditherAlg: DitherAlg = $state('floyd-steinberg');
  type PaletteMode = '2' | '4' | '8' | '16' | 'custom';
  let paletteMode: PaletteMode = $state('4');
  let customColors = $state(['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']);
  let brightness = $state(0);
  let contrast = $state(0);
  let canvasW = $state(800);
  let canvasH = $state(600);

  // ── Save ──────────────────────────────────────────────────────────────
  let showSave = $state(false);
  let canvas: HTMLCanvasElement;
  let generating = $state(false);

  // ── Image ─────────────────────────────────────────────────────────────
  let uploadedImage = $state<HTMLImageElement | null>(null);
  let imageLoaded = $state(false);

  // ── Tooltip ───────────────────────────────────────────────────────────
  let tooltip = $state<{text:string, x:number, y:number} | null>(null);
  function showTip(e: MouseEvent, text: string) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tooltip = { text, x: r.left + r.width / 2, y: r.top - 8 };
  }
  function hideTip() { tooltip = null; }

  // ── Preset palettes ───────────────────────────────────────────────────
  const PALETTES: Record<string, [number, number, number][]> = {
    '2': [[0,0,0],[255,255,255]],
    '4': [[0,0,0],[255,255,255],[255,0,0],[0,0,255]],
    '8': [[0,0,0],[255,255,255],[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255]],
    '16': [[0,0,0],[32,32,32],[64,64,64],[96,96,96],[128,128,128],[160,160,160],[192,192,192],[224,224,224],[255,255,255],[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255],[128,64,0]],
  };

  function getActivePalette(): [number, number, number][] {
    if (paletteMode === 'custom') {
      return customColors.map(hex => {
        const h = hex.replace('#', '');
        return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)] as [number, number, number];
      });
    }
    return PALETTES[paletteMode] ?? PALETTES['4'];
  }

  function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }

  function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r,g,b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2,'0')).join('');
  }

  // ── Templates ─────────────────────────────────────────────────────────
  const TEMPLATES = [
    { name: 'B&W Classic', desc: '2-color black and white', apply: () => { paletteMode='2'; ditherAlg='floyd-steinberg'; brightness=0; contrast=0; }},
    { name: '4-Color', desc: 'Limited 4-color palette', apply: () => { paletteMode='4'; ditherAlg='floyd-steinberg'; brightness=0; contrast=0; }},
    { name: '16-Grayscale', desc: '16-level grayscale', apply: () => { paletteMode='16'; ditherAlg='atkinson'; brightness=0; contrast=0; }},
    { name: 'No Dither', desc: 'Nearest color, no error diffusion', apply: () => { paletteMode='8'; ditherAlg='none'; brightness=0; contrast=0; }},
    { name: 'Atkinson', desc: 'Atkinson dithering, punchy look', apply: () => { paletteMode='8'; ditherAlg='atkinson'; brightness=0; contrast=10; }},
  ];

  // ── Tooltips map ──────────────────────────────────────────────────────
  const TIPS: Record<string, string> = {
    ditherAlg: 'Floyd-Steinberg: smooth, Atkinson: higher contrast, None: posterized',
    paletteMode: 'Number of colors in the output palette',
    brightness: 'Shift all pixel brightness before dithering',
    contrast: 'Increase/decrease contrast before dithering',
    canvasSize: 'Output resolution',
  };

  // ── File upload ───────────────────────────────────────────────────────
  function handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        uploadedImage = img;
        imageLoaded = true;
        generate();
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  // ── Nearest palette color ─────────────────────────────────────────────
  function nearestColor(r: number, g: number, b: number, palette: [number, number, number][]): [number, number, number] {
    let best = palette[0];
    let bestDist = Infinity;
    for (const [pr, pg, pb] of palette) {
      const dr = r - pr, dg = g - pg, db = b - pb;
      const dist = dr*dr + dg*dg + db*db;
      if (dist < bestDist) { bestDist = dist; best = [pr, pg, pb]; }
    }
    return best;
  }

  // ── Apply brightness/contrast ─────────────────────────────────────────
  function adjustPixel(r: number, g: number, b: number): [number, number, number] {
    let nr = r, ng = g, nb = b;
    // Brightness
    nr += brightness; ng += brightness; nb += brightness;
    // Contrast
    if (contrast !== 0) {
      const f = (259 * (contrast + 255)) / (255 * (259 - contrast));
      nr = f * (nr - 128) + 128;
      ng = f * (ng - 128) + 128;
      nb = f * (nb - 128) + 128;
    }
    return [Math.max(0, Math.min(255, nr)), Math.max(0, Math.min(255, ng)), Math.max(0, Math.min(255, nb))];
  }

  // ── Generate ──────────────────────────────────────────────────────────
  function generate() {
    if (!canvas || !uploadedImage) return;
    generating = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d')!;
      canvas.width = canvasW; canvas.height = canvasH;

      // Draw uploaded image scaled to canvas
      ctx.drawImage(uploadedImage, 0, 0, canvasW, canvasH);
      const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
      const pixels = imgData.data;
      const palette = getActivePalette();

      // Apply brightness/contrast first
      for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b] = adjustPixel(pixels[i], pixels[i+1], pixels[i+2]);
        pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b;
      }

      if (ditherAlg === 'none') {
        for (let i = 0; i < pixels.length; i += 4) {
          const [r, g, b] = nearestColor(pixels[i], pixels[i+1], pixels[i+2], palette);
          pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b;
        }
      } else {
        const w = canvasW, h = canvasH;
        const errBuf = new Float32Array(w * h * 3);
        // Load into error buffer
        for (let i = 0; i < pixels.length; i += 4) {
          const idx = (i / 4) * 3;
          errBuf[idx] = pixels[i];
          errBuf[idx+1] = pixels[i+1];
          errBuf[idx+2] = pixels[i+2];
        }

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const pi = (y * w + x) * 3;
            let r = errBuf[pi], g = errBuf[pi+1], b = errBuf[pi+2];
            r = Math.max(0, Math.min(255, r));
            g = Math.max(0, Math.min(255, g));
            b = Math.max(0, Math.min(255, b));

            const [nr, ng, nb] = nearestColor(r, g, b, palette);
            const er = r - nr, eg = g - ng, eb = b - nb;

            errBuf[pi] = nr; errBuf[pi+1] = ng; errBuf[pi+2] = nb;

            const distribute = (dx: number, dy: number, weight: number) => {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                const ni = (ny * w + nx) * 3;
                errBuf[ni]   += er * weight;
                errBuf[ni+1] += eg * weight;
                errBuf[ni+2] += eb * weight;
              }
            };

            if (ditherAlg === 'floyd-steinberg') {
              distribute(1, 0, 7/16);
              distribute(-1, 1, 3/16);
              distribute(0, 1, 5/16);
              distribute(1, 1, 1/16);
            } else if (ditherAlg === 'atkinson') {
              const w = 1/8;
              distribute(1, 0, w);
              distribute(2, 0, w);
              distribute(-1, 1, w);
              distribute(0, 1, w);
              distribute(1, 1, w);
              distribute(0, 2, w);
            }
          }
        }

        // Write back
        for (let i = 0; i < pixels.length; i += 4) {
          const idx = (i / 4) * 3;
          pixels[i]   = Math.max(0, Math.min(255, Math.round(errBuf[idx])));
          pixels[i+1] = Math.max(0, Math.min(255, Math.round(errBuf[idx+1])));
          pixels[i+2] = Math.max(0, Math.min(255, Math.round(errBuf[idx+2])));
        }
      }

      ctx.putImageData(imgData, 0, 0);
      generating = false;
    }));
  }

  function randomize() {
    brightness = Math.floor(Math.random() * 40) - 20;
    contrast = Math.floor(Math.random() * 30) - 15;
  }

  $effect(() => {
    const _ = ditherAlg + paletteMode + customColors.join('') + brightness + contrast + canvasW + canvasH + imageLoaded;
    if (canvas && uploadedImage) generate();
  });
</script>

<svelte:head>
  <title>Dither · Generators · {NAME}'s Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

{#if tooltip}
  <div class="tooltip" style="left:{tooltip.x}px;top:{tooltip.y}px">{tooltip.text}</div>
{/if}

<SaveDialog
  open={showSave}
  defaultName={`dither-${ditherAlg}`}
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
    <span class="topbar-title">Dither</span>
    <div class="topbar-actions">
      <button class="action-btn" onclick={randomize} disabled={generating}><IconRefresh size={15}/> Randomize</button>
      <button class="action-btn primary" onclick={() => showSave=true} disabled={!imageLoaded}><IconDownload size={15}/> Save</button>
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
        <h3 class="ctrl-section-title">Image</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Upload image <button class="tip-btn" onmouseenter={(e)=>showTip(e,'Upload any image to dither')} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <label class="upload-btn">
            Choose file
            <input type="file" accept="image/*" onchange={handleFileUpload} hidden/>
          </label>
          {#if imageLoaded}
            <span class="mono small" style="color:var(--text-3);margin-top:4px;">Image loaded</span>
          {/if}
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Dithering</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Algorithm <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.ditherAlg)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="chip-row">
            {#each ['floyd-steinberg', 'atkinson', 'none'] as a}
              <button class="chip" class:active={ditherAlg===a} onclick={()=>ditherAlg=a as DitherAlg}>{a}</button>
            {/each}
          </div>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Palette</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Colors <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.paletteMode)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="chip-row">
            {#each ['2', '4', '8', '16', 'custom'] as p}
              <button class="chip" class:active={paletteMode===p} onclick={()=>paletteMode=p as PaletteMode}>{p === 'custom' ? 'Custom' : p + '-color'}</button>
            {/each}
          </div>
        </div>
        {#if paletteMode === 'custom'}
          <div class="ctrl-group">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label><span class="label-row">Custom colors</span></label>
            <div class="custom-colors">
              {#each customColors as color, i}
                <input type="color" bind:value={customColors[i]} class="color-swatch"/>
              {/each}
            </div>
          </div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Adjust</h3>
        <div class="ctrl-group">
          <label for="brightness"><span class="label-row">Brightness <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.brightness)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{brightness}</span></label>
          <input id="brightness" type="range" bind:value={brightness} min="-50" max="50"/>
        </div>
        <div class="ctrl-group">
          <label for="contrast"><span class="label-row">Contrast <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.contrast)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span><span class="ctrl-val">{contrast}</span></label>
          <input id="contrast" type="range" bind:value={contrast} min="-50" max="50"/>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Canvas</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Size <button class="tip-btn" onmouseenter={(e)=>showTip(e,TIPS.canvasSize)} onmouseleave={hideTip}><IconInfoCircle size={12}/></button></span></label>
          <div class="size-row">
            <input type="number" bind:value={canvasW} min="100" max="4000" step="100" placeholder="W"/>
            <span class="size-x">×</span>
            <input type="number" bind:value={canvasH} min="100" max="4000" step="100" placeholder="H"/>
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

  .upload-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:500;border:1px solid var(--border);background:var(--bg-3);color:var(--text-1);cursor:pointer;font-family:'Geist',sans-serif;transition:.13s;}
  .upload-btn:hover{border-color:var(--accent);color:var(--accent);}

  .custom-colors{display:flex;flex-wrap:wrap;gap:4px;}
  .custom-colors .color-swatch{width:28px;height:28px;}

  @media(max-width:700px){
    .layout{flex-direction:column;}
    .controls{width:100%;border-left:none;border-top:1px solid var(--border);}
    .topbar-title{display:none;}
  }
</style>
