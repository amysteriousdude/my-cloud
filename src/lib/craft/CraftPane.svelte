<!-- hello there, tf u doing on my code???? -->
<script lang="ts">
  let {
    label,
    jsPath,
    wasmPath,
    canvasId,
    active = false,
  }: {
    label: string;
    jsPath: string;
    wasmPath: string;
    canvasId: string;
    active?: boolean;
  } = $props();

  let booted = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function fetchWasm(path: string) {
    if (!path.endsWith('.gz')) return path;
    const res = await fetch(path);
    if (!res.ok) throw new Error(`failed to fetch wasm: ${res.status}`);
    const stream = res.body!.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }

  let workletPatched = false;
  function patchWorklet() {
    if (workletPatched) return;
    workletPatched = true;
    const orig = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function (mod: RequestInfo | URL, options?: WorkletOptions) {
      const s = String(mod);
      if (s === 'audio-worklet.js' || s.endsWith('/audio-worklet.js')) {
        return orig.call(this, '/filmcraft/audio-worklet.js', options);
      }
      return orig.call(this, mod, options);
    };
  }

  async function boot() {
    if (booted) return;
    booted = true;
    loading = true;
    try {
      patchWorklet();
      const mod = await import(/* @vite-ignore */ jsPath);
      await mod.default({ module_or_path: await fetchWasm(wasmPath) });
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
