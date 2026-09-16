<script lang="ts">
  import { onMount } from 'svelte';
  import { IconArrowLeft, IconDownload, IconRefresh, IconUpload, IconVideo, IconPhoto, IconPlayerPlay, IconPlayerPause, IconPlayerSkipBack, IconPlayerSkipForward, IconLoader2, IconCloud, IconX, IconFile } from '@tabler/icons-svelte';
  import SaveDialog from '$lib/components/SaveDialog.svelte';
  import { applyEffects, type VHSParams, DEFAULT_PARAMS } from '$lib/generators/vhs-effects';
  import { PRESETS, applyPreset } from '$lib/generators/vhs-presets';

  let { data } = $props();
  let apiKey = $derived(data?.apiKey ?? '');

  onMount(() => {
    const saved = localStorage.getItem('theme') ?? 'system';
    const isDark = saved === 'dark' || (saved === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);
    const vars = isDark ? DARK : LIGHT;
    const el = document.documentElement;
    el.setAttribute('data-theme', isDark ? 'dark' : 'light');
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  });

  const DARK  = {'--bg-1':'#080808','--bg-2':'#101010','--bg-3':'#141414','--text-1':'#e2e2e2','--text-2':'#888','--text-3':'#444','--border':'#1a1a1a','--border-hover':'#333','--accent':'#6366f1'};
  const LIGHT = {'--bg-1':'#fafafa','--bg-2':'#ffffff','--bg-3':'#f0f0f0','--text-1':'#1a1a1a','--text-2':'#555','--text-3':'#999','--border':'#e0e0e0','--border-hover':'#bbb','--accent':'#4f46e5'};

  type Mode = 'image' | 'video';
  let mode = $state<Mode>('image');

  let canvas: HTMLCanvasElement;
  let generating = $state(false);
  let showSave = $state(false);
  let seed = $state(1);
  let time = $state(0);

  let params = $state<VHSParams>({ ...DEFAULT_PARAMS });

  let sourceImage = $state<HTMLImageElement | null>(null);
  let sourceImageUrl = $state<string | null>(null);
  let imageLoaded = $state(false);

  let videoEl = $state<HTMLVideoElement | null>(null);
  let videoUrl = $state<string | null>(null);
  let videoLoaded = $state(false);
  let videoPlaying = $state(false);
  let videoDuration = $state(0);
  let videoCurrentTime = $state(0);
  let videoW = $state(640);
  let videoH = $state(360);
  let videoFrame = $state(0);
  let videoTotalFrames = $state(0);

  let exporting = $state(false);
  let exportProgress = $state(0);
  let exportTotal = $state(0);

  let showCloudPicker = $state(false);
  let cloudFiles = $state<{ fileName: string; metaFileId: string }[]>([]);
  let cloudLoading = $state(false);
  let cloudSearch = $state('');

  let collapseState = $state<Record<string, boolean>>({
    signal: false, geometry: false, noise: false, vhs: false,
    color: false, scanlines: false, edge: false, web: false, canvas: false, presets: true,
  });

  function toggleSection(key: string) { collapseState[key] = !collapseState[key]; }

  function handleImageUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    loadImageFromFile(file);
    input.value = '';
  }

  function loadImageFromFile(file: File) {
    const url = URL.createObjectURL(file);
    sourceImageUrl = url;
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      imageLoaded = true;
      mode = 'image';
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      generate();
    };
    img.src = url;
  }

  function handleDropFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.type.startsWith('video/')) {
      handleVideoUpload(e);
    } else {
      loadImageFromFile(file);
    }
    input.value = '';
  }

  function generate() {
    if (!canvas) return;
    if (mode === 'image' && sourceImage) {
      generating = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const ctx = canvas.getContext('2d')!;
        if (!sourceImage) { generating = false; return; }
        ctx.drawImage(sourceImage, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyEffects(imageData.data, canvas.width, canvas.height, { ...params, time, seed });
        ctx.putImageData(imageData, 0, 0);
        generating = false;
      }));
    }
  }

  function generateVideoFrame() {
    if (!canvas || !videoEl) return;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(videoEl, 0, 0, videoW, videoH);
    const imageData = ctx.getImageData(0, 0, videoW, videoH);
    applyEffects(imageData.data, videoW, videoH, { ...params, time: videoEl.currentTime, seed });
    ctx.putImageData(imageData, 0, 0);
  }

  $effect(() => {
    const _ = params.signalArtifactColor + params.signalChromaLowpass + params.signalLuminanceLowpass +
      params.signalCompositeBlend + params.geoWaveAmplitude + params.geoWaveFrequency +
      params.geoRollingBars + params.geoVerticalSync + params.geoHorizontalSync + params.geoBarrelDistortion +
      params.noiseStatic + params.noiseSnow + params.noiseGhostingDelay + params.noiseGhostingDecay + params.noiseChroma +
      params.vhsTapeSpeed + params.vhsHeadSwitching + params.vhsOverwrite + params.vhsChromaBlur +
      params.colorSaturation + params.colorHueShift + params.colorBrightness + params.colorContrast + params.colorFringingOffset +
      params.scanlineThickness + params.scanlineIntensity + params.scanlineBeam +
      params.edgeGlowThreshold + params.edgeGlowAmount + params.interlaceOffset + time + seed;
    if (mode === 'image' && imageLoaded) generate();
    if (mode === 'video' && videoLoaded) generateVideoFrame();
  });

  async function handleVideoUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    videoUrl = URL.createObjectURL(file);
    await new Promise<void>((resolve) => {
      const v = document.createElement('video');
      v.preload = 'auto';
      v.onloadedmetadata = () => {
        videoW = v.videoWidth;
        videoH = v.videoHeight;
        videoDuration = v.duration;
        videoTotalFrames = Math.floor(v.duration * 30);
        videoEl = v;
        videoLoaded = true;
        canvas.width = videoW;
        canvas.height = videoH;
        v.currentTime = 0;
        resolve();
      };
      v.src = videoUrl!;
    });
  }

  function togglePlay() {
    if (!videoEl) return;
    if (videoPlaying) {
      videoEl.pause();
      videoPlaying = false;
      cancelAnimationFrame(videoAnimFrame);
    } else {
      videoPlaying = true;
      videoEl.play();
      videoLoop();
    }
  }

  let videoAnimFrame = 0;
  function videoLoop() {
    if (!videoPlaying || !videoEl) return;
    videoCurrentTime = videoEl.currentTime;
    videoFrame = Math.floor(videoEl.currentTime * 30);
    generateVideoFrame();
    videoAnimFrame = requestAnimationFrame(videoLoop);
  }

  function seekVideo(offset: number) {
    if (!videoEl) return;
    videoEl.currentTime = Math.max(0, Math.min(videoDuration, videoEl.currentTime + offset));
    videoCurrentTime = videoEl.currentTime;
    videoFrame = Math.floor(videoEl.currentTime * 30);
    generateVideoFrame();
  }

  function seekTo(e: Event) {
    if (!videoEl) return;
    const v = parseFloat((e.target as HTMLInputElement).value);
    videoEl.currentTime = v;
    videoCurrentTime = v;
    videoFrame = Math.floor(v * 30);
    generateVideoFrame();
  }

  async function exportVideo() {
    if (!videoEl) return;
    exporting = true;
    exportProgress = 0;
    exportTotal = videoTotalFrames;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = videoW;
    offCanvas.height = videoH;
    const offCtx = offCanvas.getContext('2d')!;

    const stream = offCanvas.captureStream(30);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm',
      videoBitsPerSecond: 8000000,
    });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

    videoEl.currentTime = 0;
    await new Promise<void>((r) => { videoEl!.onseeked = () => r(); });

    recorder.start();

    for (let f = 0; f < videoTotalFrames; f++) {
      offCtx.drawImage(videoEl!, 0, 0, videoW, videoH);
      const imageData = offCtx.getImageData(0, 0, videoW, videoH);
      applyEffects(imageData.data, videoW, videoH, { ...params, time: videoEl!.currentTime, seed });
      offCtx.putImageData(imageData, 0, 0);

      await new Promise<void>((r) => {
        videoEl!.currentTime = f / 30;
        videoEl!.onseeked = () => r();
      });

      exportProgress = f + 1;
      await new Promise((r) => setTimeout(r, 0));
    }

    recorder.stop();
    await done;

    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vhs-export.webm';
    a.click();
    URL.revokeObjectURL(url);

    exporting = false;
    videoEl.currentTime = 0;
    videoCurrentTime = 0;
    videoFrame = 0;
    generateVideoFrame();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.type.startsWith('video/')) {
      mode = 'video';
      videoUrl = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'auto';
      v.onloadedmetadata = () => {
        videoW = v.videoWidth; videoH = v.videoHeight; videoDuration = v.duration;
        videoTotalFrames = Math.floor(v.duration * 30);
        videoEl = v; videoLoaded = true; canvas.width = videoW; canvas.height = videoH;
      };
      v.src = videoUrl!;
    } else {
      loadImageFromFile(file);
    }
  }

  function randomize() { seed = Math.floor(Math.random() * 99999); }
  function resetParams() { params = { ...DEFAULT_PARAMS }; time = 0; }

  function applyPresetToParams(presetName: string) {
    const p = PRESETS.find(pr => pr.name === presetName);
    if (p) params = applyPreset({ ...DEFAULT_PARAMS }, p);
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function downloadCanvas() {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'vhs-filter.png';
    a.click();
  }

  async function fetchCloudFiles() {
    if (!apiKey) return;
    cloudLoading = true;
    try {
      const resp = await fetch(`/api/telegram/ls?api_key=${apiKey}`);
      const data = await resp.json();
      const allFiles: { fileName: string; metaFileId: string }[] = data.files ?? [];
      cloudFiles = allFiles.filter(f => /\.(png|jpe?g|gif|apng|webp|avif|bmp|tiff?|svg|mp4|webm|avi|mov|mkv)$/i.test(f.fileName));
    } catch {
      cloudFiles = [];
    } finally {
      cloudLoading = false;
    }
  }

  function openCloudPicker() {
    showCloudPicker = true;
    fetchCloudFiles();
  }

  function loadFromCloudFile(file: { fileName: string; metaFileId: string }) {
    showCloudPicker = false;
    const isVideo = /\.(mp4|webm|avi|mov|mkv)$/i.test(file.fileName);
    if (isVideo) {
      loadVideoFromUrl(`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}&download=true`);
    } else {
      loadImageFromUrl(`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}&download=true`);
    }
  }

  function loadImageFromUrl(url: string) {
    mode = 'image';
    sourceImageUrl = url;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      sourceImage = img;
      imageLoaded = true;
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      generate();
    };
    img.src = url;
  }

  async function loadVideoFromUrl(url: string) {
    mode = 'video';
    videoUrl = url;
    await new Promise<void>((resolve) => {
      const v = document.createElement('video');
      v.preload = 'auto';
      v.onloadedmetadata = () => {
        videoW = v.videoWidth;
        videoH = v.videoHeight;
        videoDuration = v.duration;
        videoTotalFrames = Math.floor(v.duration * 30);
        videoEl = v;
        videoLoaded = true;
        canvas.width = videoW;
        canvas.height = videoH;
        v.currentTime = 0;
        resolve();
      };
      v.src = url;
    });
  }
</script>

<svelte:window ondragover={(e) => e.preventDefault()} ondrop={handleDrop} />

<svelte:head>
  <title>VHS Filter . Generators</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</svelte:head>

<SaveDialog
  open={showSave}
  defaultName="vhs-filter"
  {apiKey}
  onconfirm={(name) => { const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = name; a.click(); }}
  onsave={async (name, folderId) => {
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await (await fetch(dataUrl)).blob();
    const chunkSize = 18 * 1024 * 1024;
    const totalChunks = Math.ceil(blob.size / chunkSize);
    const chunks: number[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, blob.size);
      const chunk = blob.slice(start, end);
      const formData = new FormData();
      formData.append('chunk', chunk, `chunk-${i}`);
      const res = await fetch('/api/telegram/uploadChunk', {
        method: 'POST', body: formData,
        headers: { 'X-Api-Key': apiKey, 'X-Chunk-Index': String(i), 'X-File-Name': name },
      });
      if (!res.ok) throw new Error('Chunk upload failed');
      chunks.push(i);
    }
    const finRes = await fetch('/api/telegram/finalizeUpload', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ fileName: name, type: 'image/png', totalBytes: blob.size, chunks, folderId }),
    });
    if (!finRes.ok) throw new Error('Finalize failed');
  }}
  onclose={() => showSave = false}
/>

<div class="page">
  <header class="topbar">
    <a href="/" class="back-btn"><IconArrowLeft size={16} stroke={1.8}/> Back</a>
    <span class="topbar-title">VHS Filter</span>
    <div class="topbar-actions">
      <button class="action-btn" onclick={randomize}><IconRefresh size={14}/> Randomize</button>
      {#if mode === 'image' && imageLoaded}
        <button class="action-btn primary" onclick={() => showSave = true}><IconDownload size={15}/> Save</button>
      {/if}
      {#if mode === 'video' && videoLoaded && !exporting}
        <button class="action-btn primary" onclick={exportVideo}><IconDownload size={15}/> Export Video</button>
      {/if}
    </div>
  </header>

  <div class="layout">
    <div class="preview-wrap">
      <canvas bind:this={canvas} class="preview-canvas" width="800" height="600"></canvas>
      {#if generating}<div class="gen-overlay">processing...</div>{/if}

      {#if mode === 'video' && videoLoaded}
        <div class="video-controls">
          <button class="vc-btn" onclick={() => seekVideo(-1/30)}><IconPlayerSkipBack size={16}/></button>
          <button class="vc-btn" onclick={togglePlay}>
            {#if videoPlaying}<IconPlayerPause size={16}/>{:else}<IconPlayerPlay size={16}/>{/if}
          </button>
          <button class="vc-btn" onclick={() => seekVideo(1/30)}><IconPlayerSkipForward size={16}/></button>
          <input type="range" class="seek-bar" min="0" max={videoDuration} step="0.01" value={videoCurrentTime} oninput={seekTo} />
          <span class="vc-time">{formatTime(videoCurrentTime)} / {formatTime(videoDuration)}</span>
          <span class="vc-frame">F{videoFrame}/{videoTotalFrames}</span>
        </div>
      {/if}

      {#if exporting}
        <div class="export-overlay">
          <IconLoader2 size={24} class="spin-icon" />
          <span>Exporting {exportProgress}/{exportTotal} frames...</span>
          <div class="export-bar"><div class="export-fill" style="width:{(exportProgress/exportTotal)*100}%"></div></div>
        </div>
      {/if}

      {#if !imageLoaded && !videoLoaded}
        <div class="drop-hint">
          <IconUpload size={32} stroke={1.2} />
          <span>Drop an image or video here</span>
          <div class="drop-actions">
            <label class="drop-btn" for="drop-file-upload"><IconUpload size={13}/> Browse Files</label>
            <input type="file" id="drop-file-upload" accept="image/*,video/*" onchange={handleDropFileUpload} style="display:none"/>
            <button class="drop-btn" onclick={openCloudPicker}><IconCloud size={13}/> Import from Cloud</button>
          </div>
        </div>
      {/if}
    </div>

    <aside class="controls">

      <section class="ctrl-section">
        <h3 class="ctrl-title">Source</h3>
        <div class="seg">
          <button class="seg-btn" class:active={mode==='image'} onclick={() => mode='image'}><IconPhoto size={13}/> Image</button>
          <button class="seg-btn" class:active={mode==='video'} onclick={() => mode='video'}><IconVideo size={13}/> Video</button>
        </div>
        {#if mode === 'image'}
          <div class="ctrl-group" style="margin-top:8px">
            <label class="upload-btn" for="img-upload"><IconUpload size={13}/> Upload Image</label>
            <input type="file" id="img-upload" accept="image/*" onchange={handleImageUpload} style="display:none"/>
          </div>
        {:else}
          <div class="ctrl-group" style="margin-top:8px">
            <label class="upload-btn" for="vid-upload"><IconUpload size={13}/> Upload Video</label>
            <input type="file" id="vid-upload" accept="video/*" onchange={handleVideoUpload} style="display:none"/>
          </div>
        {/if}
        <div class="ctrl-group" style="margin-top:4px">
          <button class="upload-btn cloud-btn" onclick={openCloudPicker}><IconCloud size={13}/> Import from Cloud</button>
        </div>
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title" onclick={() => toggleSection('presets')} role="button" tabindex="0">
          Presets {collapseState.presets ? '▸' : '▾'}
        </h3>
        {#if !collapseState.presets}
          <div class="preset-grid">
            {#each PRESETS as preset}
              <button class="preset-btn" onclick={() => applyPresetToParams(preset.name)}>{preset.name}</button>
            {/each}
          </div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title" onclick={() => toggleSection('signal')} role="button" tabindex="0">
          Signal {collapseState.signal ? '▸' : '▾'}
        </h3>
        {#if !collapseState.signal}
          <div class="ctrl-group"><label>Artifact Color <span class="val">{params.signalArtifactColor.toFixed(2)}</span></label><input type="range" bind:value={params.signalArtifactColor} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Chroma Lowpass <span class="val">{params.signalChromaLowpass.toFixed(2)}</span></label><input type="range" bind:value={params.signalChromaLowpass} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Luminance Lowpass <span class="val">{params.signalLuminanceLowpass.toFixed(2)}</span></label><input type="range" bind:value={params.signalLuminanceLowpass} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Composite Blend <span class="val">{params.signalCompositeBlend.toFixed(2)}</span></label><input type="range" bind:value={params.signalCompositeBlend} min="0" max="1" step="0.01"/></div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title" onclick={() => toggleSection('geometry')} role="button" tabindex="0">
          Geometry {collapseState.geometry ? '▸' : '▾'}
        </h3>
        {#if !collapseState.geometry}
          <div class="ctrl-group"><label>Wave Amplitude <span class="val">{params.geoWaveAmplitude.toFixed(2)}</span></label><input type="range" bind:value={params.geoWaveAmplitude} min="0" max="20" step="0.1"/></div>
          <div class="ctrl-group"><label>Wave Frequency <span class="val">{params.geoWaveFrequency.toFixed(2)}</span></label><input type="range" bind:value={params.geoWaveFrequency} min="0.1" max="5" step="0.1"/></div>
          <div class="ctrl-group"><label>Rolling Bars <span class="val">{params.geoRollingBars.toFixed(2)}</span></label><input type="range" bind:value={params.geoRollingBars} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Vertical Sync <span class="val">{params.geoVerticalSync.toFixed(2)}</span></label><input type="range" bind:value={params.geoVerticalSync} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Horizontal Sync <span class="val">{params.geoHorizontalSync.toFixed(2)}</span></label><input type="range" bind:value={params.geoHorizontalSync} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Barrel Distortion <span class="val">{params.geoBarrelDistortion.toFixed(2)}</span></label><input type="range" bind:value={params.geoBarrelDistortion} min="0" max="1" step="0.01"/></div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title" onclick={() => toggleSection('noise')} role="button" tabindex="0">
          Noise {collapseState.noise ? '▸' : '▾'}
        </h3>
        {#if !collapseState.noise}
          <div class="ctrl-group"><label>Static <span class="val">{params.noiseStatic.toFixed(2)}</span></label><input type="range" bind:value={params.noiseStatic} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Snow <span class="val">{params.noiseSnow.toFixed(2)}</span></label><input type="range" bind:value={params.noiseSnow} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Ghosting Delay <span class="val">{params.noiseGhostingDelay.toFixed(2)}</span></label><input type="range" bind:value={params.noiseGhostingDelay} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Ghosting Decay <span class="val">{params.noiseGhostingDecay.toFixed(2)}</span></label><input type="range" bind:value={params.noiseGhostingDecay} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Chroma Noise <span class="val">{params.noiseChroma.toFixed(2)}</span></label><input type="range" bind:value={params.noiseChroma} min="0" max="1" step="0.01"/></div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title" onclick={() => toggleSection('vhs')} role="button" tabindex="0">
          VHS {collapseState.vhs ? '▸' : '▾'}
        </h3>
        {#if !collapseState.vhs}
          <div class="ctrl-group"><label>Tape Speed <span class="val">{params.vhsTapeSpeed.toFixed(2)}</span></label><input type="range" bind:value={params.vhsTapeSpeed} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Head Switching <span class="val">{params.vhsHeadSwitching.toFixed(2)}</span></label><input type="range" bind:value={params.vhsHeadSwitching} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Overwrite <span class="val">{params.vhsOverwrite.toFixed(2)}</span></label><input type="range" bind:value={params.vhsOverwrite} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Chroma Blur <span class="val">{params.vhsChromaBlur.toFixed(2)}</span></label><input type="range" bind:value={params.vhsChromaBlur} min="0" max="1" step="0.01"/></div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title" onclick={() => toggleSection('color')} role="button" tabindex="0">
          Color {collapseState.color ? '▸' : '▾'}
        </h3>
        {#if !collapseState.color}
          <div class="ctrl-group"><label>Saturation <span class="val">{params.colorSaturation.toFixed(2)}</span></label><input type="range" bind:value={params.colorSaturation} min="0" max="2" step="0.01"/></div>
          <div class="ctrl-group"><label>Hue Shift <span class="val">{params.colorHueShift.toFixed(0)}°</span></label><input type="range" bind:value={params.colorHueShift} min="-180" max="180" step="1"/></div>
          <div class="ctrl-group"><label>Brightness <span class="val">{params.colorBrightness.toFixed(2)}</span></label><input type="range" bind:value={params.colorBrightness} min="-0.5" max="0.5" step="0.01"/></div>
          <div class="ctrl-group"><label>Contrast <span class="val">{params.colorContrast.toFixed(2)}</span></label><input type="range" bind:value={params.colorContrast} min="0" max="3" step="0.01"/></div>
          <div class="ctrl-group"><label>Color Fringing <span class="val">{params.colorFringingOffset.toFixed(2)}</span></label><input type="range" bind:value={params.colorFringingOffset} min="0" max="5" step="0.1"/></div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title" onclick={() => toggleSection('scanlines')} role="button" tabindex="0">
          Scanlines {collapseState.scanlines ? '▸' : '▾'}
        </h3>
        {#if !collapseState.scanlines}
          <div class="ctrl-group"><label>Thickness <span class="val">{params.scanlineThickness.toFixed(2)}</span></label><input type="range" bind:value={params.scanlineThickness} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Intensity <span class="val">{params.scanlineIntensity.toFixed(2)}</span></label><input type="range" bind:value={params.scanlineIntensity} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Beam Glow <span class="val">{params.scanlineBeam.toFixed(2)}</span></label><input type="range" bind:value={params.scanlineBeam} min="0" max="1" step="0.01"/></div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title" onclick={() => toggleSection('edge')} role="button" tabindex="0">
          Edge {collapseState.edge ? '▸' : '▾'}
        </h3>
        {#if !collapseState.edge}
          <div class="ctrl-group"><label>Glow Threshold <span class="val">{params.edgeGlowThreshold.toFixed(2)}</span></label><input type="range" bind:value={params.edgeGlowThreshold} min="0" max="1" step="0.01"/></div>
          <div class="ctrl-group"><label>Glow Amount <span class="val">{params.edgeGlowAmount.toFixed(2)}</span></label><input type="range" bind:value={params.edgeGlowAmount} min="0" max="1" step="0.01"/></div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title" onclick={() => toggleSection('web')} role="button" tabindex="0">
          Web-Only {collapseState.web ? '▸' : '▾'}
        </h3>
        {#if !collapseState.web}
          <div class="ctrl-group"><label>Interlace Offset <span class="val">{params.interlaceOffset.toFixed(0)}</span></label><input type="range" bind:value={params.interlaceOffset} min="-4" max="4" step="1"/></div>
        {/if}
      </section>

      <section class="ctrl-section">
        <h3 class="ctrl-title" onclick={() => toggleSection('canvas')} role="button" tabindex="0">
          Canvas {collapseState.canvas ? '▸' : '▾'}
        </h3>
        {#if !collapseState.canvas}
          <div class="ctrl-group"><label>Time <span class="val">{time.toFixed(2)}</span></label><input type="range" bind:value={time} min="0" max="10" step="0.01"/></div>
          <div class="ctrl-group"><label>Seed <span class="val">{seed}</span></label><input type="range" bind:value={seed} min="1" max="99999" step="1"/></div>
          <button class="action-btn" onclick={resetParams} style="width:100%;justify-content:center;">Reset All</button>
        {/if}
      </section>

    </aside>
  </div>
</div>

{#if showCloudPicker}
  <div class="modal-overlay" onclick={() => showCloudPicker = false} role="presentation">
    <div class="modal-picker" onclick={(e) => e.stopPropagation()} role="dialog">
      <div class="modal-header">
        <IconCloud size={15} />
        <span>Import from Cloud</span>
        <button class="modal-close" onclick={() => showCloudPicker = false}><IconX size={14}/></button>
      </div>
      <input class="modal-search" type="text" placeholder="Search files..." bind:value={cloudSearch} />
      <div class="modal-list">
        {#if cloudLoading}
          <div class="modal-empty">Loading files...</div>
        {:else}
          {#each cloudFiles.filter(f => !cloudSearch || f.fileName.toLowerCase().includes(cloudSearch.toLowerCase())) as file}
            <button class="modal-item" onclick={() => loadFromCloudFile(file)}>
              <IconFile size={13} />
              <span>{file.fileName}</span>
            </button>
          {/each}
          {#if cloudFiles.length === 0}
            <div class="modal-empty">No image or video files found</div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  :global(*,*::before,*::after){box-sizing:border-box;margin:0;}
  :global(body){background:var(--bg-1,#080808);font-family:'Geist',sans-serif;color:var(--text-1,#e2e2e2);}
  .page{min-height:100vh;display:flex;flex-direction:column;}
  .topbar{display:flex;align-items:center;gap:12px;padding:11px 20px;border-bottom:1px solid var(--border);background:var(--bg-2);position:sticky;top:0;z-index:10;}
  .back-btn{display:flex;align-items:center;gap:6px;color:var(--text-3);text-decoration:none;font-size:13px;padding:5px 10px;border-radius:7px;border:1px solid var(--border);transition:.13s;white-space:nowrap;}
  .back-btn:hover{color:var(--text-1);border-color:var(--border-hover);}
  .topbar-title{font-size:14px;font-weight:600;flex:1;}
  .topbar-actions{display:flex;gap:8px;}
  .action-btn{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:500;border:1px solid var(--border);background:var(--bg-3);color:var(--text-1);cursor:pointer;font-family:'Geist',sans-serif;transition:.13s;white-space:nowrap;}
  .action-btn:hover{border-color:var(--border-hover);}
  .action-btn:disabled{opacity:.4;cursor:not-allowed;}
  .action-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;}
  .action-btn.primary:hover{opacity:.88;}
  .layout{display:flex;flex:1;min-height:0;}
  .preview-wrap{flex:1;padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;position:relative;background:var(--bg-1);gap:10px;}
  .preview-canvas{max-width:100%;height:auto;border-radius:6px;border:1px solid var(--border);display:block;image-rendering:pixelated;}
  .gen-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);color:var(--text-3);font-size:13px;font-family:'Geist Mono',monospace;border-radius:6px;pointer-events:none;}
  .controls{width:270px;flex-shrink:0;background:var(--bg-2);border-left:1px solid var(--border);padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;}
  .ctrl-section{padding:10px 0;border-bottom:1px solid var(--border);}
  .ctrl-section:last-child{border-bottom:none;}
  .ctrl-title{font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;cursor:pointer;user-select:none;}
  .ctrl-title:hover{color:var(--text-2);}
  .ctrl-group{display:flex;flex-direction:column;gap:5px;margin-bottom:9px;}
  .ctrl-group:last-child{margin-bottom:0;}
  .ctrl-group label{font-size:12px;color:var(--text-2);display:flex;justify-content:space-between;align-items:center;}
  .val{color:var(--text-3);font-family:'Geist Mono',monospace;font-size:11px;}
  input[type="range"]{width:100%;accent-color:var(--accent);cursor:pointer;}
  .seg{display:flex;border:1px solid var(--border);border-radius:7px;overflow:hidden;}
  .seg-btn{flex:1;padding:5px 0;font-size:11px;font-family:'Geist',sans-serif;background:var(--bg-1);color:var(--text-2);border:none;cursor:pointer;transition:.13s;display:flex;align-items:center;justify-content:center;gap:4px;}
  .seg-btn:hover{color:var(--text-1);}
  .seg-btn.active{background:var(--accent);color:#fff;}
  .upload-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:8px;border:1px dashed var(--border);background:var(--bg-1);color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .upload-btn:hover{border-color:var(--accent);color:var(--text-1);}
  .drop-hint{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-3);font-size:13px;pointer-events:none;}
  .drop-sub{font-size:11px;opacity:.5;}
  .video-controls{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;width:100%;max-width:800px;}
  .vc-btn{background:none;border:none;color:var(--text-2);cursor:pointer;padding:4px;display:flex;align-items:center;}
  .vc-btn:hover{color:var(--text-1);}
  .seek-bar{flex:1;accent-color:var(--accent);cursor:pointer;}
  .vc-time{font-size:11px;color:var(--text-3);font-family:'Geist Mono',monospace;white-space:nowrap;}
  .vc-frame{font-size:10px;color:var(--text-3);font-family:'Geist Mono',monospace;}
  .export-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,.7);color:var(--text-1);font-size:13px;border-radius:6px;}
  .export-bar{width:200px;height:4px;background:var(--bg-3);border-radius:99px;overflow:hidden;}
  .export-fill{height:100%;background:var(--accent);border-radius:99px;transition:width .2s;}
  :global(.spin-icon){animation:spin 1s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .preset-grid{display:flex;flex-wrap:wrap;gap:5px;}
  .preset-btn{padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:11px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .preset-btn:hover{border-color:var(--accent);color:var(--text-1);}
  .drop-actions{display:flex;gap:8px;margin-top:4px;}
  .drop-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-2);color:var(--text-2);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;transition:.13s;}
  .drop-btn:hover{border-color:var(--accent);color:var(--text-1);}
  .cloud-btn{border-style:dashed;width:100%;justify-content:center;}
  .modal-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;}
  .modal-picker{background:var(--bg-2);border:1px solid var(--border);border-radius:14px;width:90%;max-width:420px;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden;}
  .modal-header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border);font-size:13px;font-weight:500;color:var(--text-1);}
  .modal-header span{flex:1;}
  .modal-close{background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px;display:flex;}
  .modal-close:hover{color:var(--text-1);}
  .modal-search{margin:8px 14px;padding:7px 12px;border-radius:8px;background:var(--bg-1);border:1px solid var(--border);color:var(--text-1);font-size:13px;font-family:'Geist',sans-serif;outline:none;}
  .modal-search:focus{border-color:var(--border-hover);}
  .modal-list{overflow-y:auto;padding:4px 8px 12px;display:flex;flex-direction:column;gap:2px;}
  .modal-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:none;padding:7px 10px;color:var(--text-1);font-size:12px;font-family:'Geist',sans-serif;cursor:pointer;border-radius:6px;}
  .modal-item:hover{background:var(--bg-3);}
  .modal-empty{padding:16px;text-align:center;color:var(--text-3);font-size:12px;}
  @media(max-width:700px){.layout{flex-direction:column;}.controls{width:100%;border-left:none;border-top:1px solid var(--border);}.topbar-title{display:none;}}
</style>
