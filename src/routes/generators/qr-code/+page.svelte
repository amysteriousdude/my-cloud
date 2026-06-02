<!-- src/routes/generators/qr-code/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { IconArrowLeft, IconDownload, IconRefresh, IconInfoCircle } from '@tabler/icons-svelte';
  import SaveDialog from '$lib/components/SaveDialog.svelte';
  import { env } from '$env/dynamic/public';
  import QRCode from 'qrcode';
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

  let text = $state('https://example.com');
  let qrSize = $state(400);
  let fgColor = $state('#000000');
  let bgColor = $state('#ffffff');
  let errorLevel: 'L' | 'M' | 'Q' | 'H' = $state('M');
  let margin = $state(4);
  let logoFile = $state<File | null>(null);
  let logoDataUrl = $state('');

  let showSave = $state(false);
  let canvas: HTMLCanvasElement;
  let generating = $state(false);

  function handleLogo(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      logoFile = file;
      const reader = new FileReader();
      reader.onload = () => { logoDataUrl = reader.result as string; };
      reader.readAsDataURL(file);
    }
  }

  async function generate() {
    if (!canvas) return;
    generating = true;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const ctx = canvas.getContext('2d')!;
    const size = qrSize + margin * 2;
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    try {
      await QRCode.toCanvas(canvas, text || ' ', {
        width: qrSize,
        margin: 0,
        color: { dark: fgColor, light: bgColor },
        errorCorrectionLevel: errorLevel,
      });

      if (logoDataUrl) {
        const img = new Image();
        img.onload = () => {
          const logoSize = qrSize * 0.22;
          const lx = (size - logoSize) / 2;
          const ly = (size - logoSize) / 2;
          ctx.fillStyle = bgColor;
          ctx.fillRect(lx - 4, ly - 4, logoSize + 8, logoSize + 8);
          ctx.drawImage(img, lx, ly, logoSize, logoSize);
          generating = false;
        };
        img.src = logoDataUrl;
        return;
      }
    } catch (e) {
      console.error(e);
    }
    generating = false;
  }

  $effect(() => {
    const _ = text + qrSize + fgColor + bgColor + errorLevel + margin + logoDataUrl;
    if (canvas) generate();
  });
</script>

<svelte:head>
  <title>QR Code · Generators · {NAME}'s Cloud</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

<SaveDialog
  open={showSave}
  defaultName="qrcode"
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
    <span class="topbar-title">QR Code</span>
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
        <h3 class="ctrl-section-title">Content</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Text / URL</label>
          <input type="text" bind:value={text} placeholder="https://example.com" class="text-input"/>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Appearance</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Size</span><span class="ctrl-val">{qrSize}px</span></label>
          <input type="range" bind:value={qrSize} min="100" max="1000" step="10"/>
        </div>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label><span class="label-row">Margin</span><span class="ctrl-val">{margin}</span></label>
          <input type="range" bind:value={margin} min="0" max="20"/>
        </div>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Error correction</label>
          <div class="chip-row">
            {#each ['L','M','Q','H'] as level}
              <button class="chip" class:active={errorLevel===level} onclick={()=>errorLevel=level as 'L'|'M'|'Q'|'H'}>{level}</button>
            {/each}
          </div>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-section-title">Colors</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Foreground</label>
          <div class="color-row">
            <input type="color" bind:value={fgColor} class="color-swatch"/>
            <span class="mono small">{fgColor}</span>
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
        <h3 class="ctrl-section-title">Logo (optional)</h3>
        <div class="ctrl-group">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Upload logo</label>
          <input type="file" accept="image/*" onchange={handleLogo} class="file-input"/>
        </div>
        {#if logoDataUrl}
          <div class="logo-preview">
            <img src={logoDataUrl} alt="Logo preview"/>
            <button class="chip" onclick={()=>{ logoFile=null; logoDataUrl=''; }}>Remove</button>
          </div>
        {/if}
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
  input[type="text"]{width:100%;background:var(--bg-1);border:1px solid var(--border);border-radius:7px;padding:6px 10px;color:var(--text-1);font-size:13px;font-family:'Geist Mono',monospace;outline:none;transition:border-color .13s;}
  input[type="text"]:focus{border-color:var(--border-hover);}
  .text-input{min-height:60px;}
  .color-row{display:flex;align-items:center;gap:10px;}
  .color-swatch{width:30px;height:30px;border-radius:7px;border:1px solid var(--border);padding:2px;background:var(--bg-1);cursor:pointer;flex-shrink:0;}
  .color-row .mono{font-size:11.5px;color:var(--text-3);}
  .chip-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
  .chip{padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .chip.active{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,.1);}
  .chip:hover{border-color:var(--border-hover);color:var(--text-1);}
  .file-input{font-size:12px;color:var(--text-2);}
  .file-input::file-selector-button{background:var(--bg-3);border:1px solid var(--border);border-radius:6px;padding:4px 10px;color:var(--text-2);font-size:12px;cursor:pointer;font-family:'Geist',sans-serif;margin-right:8px;}
  .logo-preview{display:flex;align-items:center;gap:10px;margin-top:6px;}
  .logo-preview img{width:40px;height:40px;border-radius:6px;border:1px solid var(--border);object-fit:contain;}
  @media(max-width:700px){.layout{flex-direction:column;}.controls{width:100%;border-left:none;border-top:1px solid var(--border);}.topbar-title{display:none;}}
</style>
