<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  let {
    label,
    jsPath,
    wasmPath,
    canvasId,
    moduleGlobal = '',
    active = false,
  }: {
    label: string;
    jsPath: string;
    wasmPath: string;
    canvasId: string;
    moduleGlobal?: string;
    active?: boolean;
  } = $props();

  let booted = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);

  let craftBase = '/';
  let urlPatched = false;

  function patchUrls(base: string) {
    craftBase = base;
    if (urlPatched) return;
    urlPatched = true;

    const resolve = (u: unknown) => {
      const s = String(u);
      if (!s || s.startsWith('data:') || s.startsWith('blob:')) return s;
      try {
        const abs = new URL(s, location.origin + craftBase);
        if (abs.origin === location.origin && (abs.pathname === '/worker.js' || abs.pathname === '/audio-worklet.js')) {
          abs.pathname = craftBase + abs.pathname.slice(1);
        }
        return abs.href;
      } catch {
        return s;
      }
    };

    const origAdd = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function (mod: RequestInfo | URL, options?: WorkletOptions) {
      return origAdd.call(this, resolve(mod) as RequestInfo, options);
    };

    const OrigWorker = window.Worker;
    window.Worker = class extends OrigWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(resolve(scriptURL) as string | URL, options);
      }
    };
  }

  async function loadWasmModule(path: string): Promise<WebAssembly.Module> {
    const res = await fetch(path.endsWith('.gz') ? path : path);
    if (!res.ok) throw new Error(`failed to fetch wasm: ${res.status}`);
    let bytes: ArrayBuffer;
    if (path.endsWith('.gz')) {
      const stream = res.body!.pipeThrough(new DecompressionStream('gzip'));
      bytes = await new Response(stream).arrayBuffer();
    } else {
      bytes = await res.arrayBuffer();
    }
    return WebAssembly.compile(bytes);
  }

  let audioPatched = false;
  function patchAudio() {
    if (audioPatched) return;
    audioPatched = true;
    const Orig = window.AudioContext;
    if (!Orig) return;
    const ctxs: AudioContext[] = [];
    const Wrapped = function (this: unknown, opts?: AudioContextOptions) {
      const c = new Orig(opts);
      ctxs.push(c);
      return c;
    } as any;
    Wrapped.prototype = Orig.prototype;
    window.AudioContext = Wrapped;
    const resumeAll = () => {
      for (const c of ctxs) {
        if (c.state === 'suspended') c.resume().catch(() => {});
      }
    };
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'keydown'] as const) {
      window.addEventListener(ev, resumeAll, { capture: true });
    }
  }

  async function boot() {
    if (booted) return;
    booted = true;
    loading = true;
    try {
      const base = jsPath.slice(0, jsPath.lastIndexOf('/') + 1);
      patchUrls(base);
      patchAudio();
      const mod = await import(/* @vite-ignore */ jsPath);
      const wasmModule = await loadWasmModule(wasmPath);
      if (moduleGlobal) (globalThis as any)[moduleGlobal] = wasmModule;
      await mod.default({ module_or_path: wasmModule });
      if (typeof mod.start === 'function') await mod.start(canvasId);
    } catch (e: any) {
      error = e?.message ?? String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (active) boot();
  });
</script>

<div class="craft-pane" class:craft-off={!active}>
  <canvas id={canvasId} tabindex="0"></canvas>
  {#if loading}
    <div class="craft-loading">
      <p>Loading {label}…</p>
      <p class="craft-sub">first time only, it's a big download</p>
    </div>
  {:else if error}
    <div class="craft-loading"><p>Failed to load {label}: {error}</p></div>
  {/if}
</div>

<style>
  .craft-pane {
    position: relative;
    width: 100%; height: 100%;
    background: #1c1c1c;
  }
  .craft-off { display: none; }
  canvas { width: 100%; height: 100%; display: block; outline: none; }
  .craft-loading {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    background: #1c1c1c; color: #9a9a9a; font-size: 13px; font-family: 'Geist', sans-serif;
  }
  .craft-loading p { margin: 0; }
  .craft-sub { font-size: 11px; color: #666; }
</style>
