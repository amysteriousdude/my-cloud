<script lang="ts">
  import { onDestroy } from 'svelte';
  import { uid } from '$lib/music/engine';
  import {
    IconWaveSine, IconPlayerPlay, IconPlayerPause, IconPlayerStop,
    IconUpload, IconTrash, IconDownload, IconEye, IconEyeOff,
    IconPlus, IconSettings,
  } from '@tabler/icons-svelte';

  type FXType = 'reverb' | 'delay' | 'eq' | 'compressor' | 'distortion' | 'filter' | 'chorus' | 'limiter' | 'flanger' | 'phaser' | 'tremolo' | 'bitcrusher' | 'saturation';

  type FXNode = {
    id: string;
    type: FXType;
    enabled: boolean;
    params: Record<string, number>;
  };

  const FX_DEFS: Record<FXType, { label: string; params: Record<string, { min: number; max: number; step: number; default: number; unit?: string }> }> = {
    reverb: {
      label: 'Reverb',
      params: {
        decay: { min: 0.1, max: 10, step: 0.1, default: 2, unit: 's' },
        mix: { min: 0, max: 1, step: 0.01, default: 0.3 },
      },
    },
    delay: {
      label: 'Delay',
      params: {
        time: { min: 0.01, max: 2, step: 0.01, default: 0.3, unit: 's' },
        feedback: { min: 0, max: 0.95, step: 0.01, default: 0.4 },
        mix: { min: 0, max: 1, step: 0.01, default: 0.3 },
      },
    },
    eq: {
      label: 'EQ',
      params: {
        low: { min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
        mid: { min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
        high: { min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
      },
    },
    compressor: {
      label: 'Compressor',
      params: {
        threshold: { min: -60, max: 0, step: 1, default: -20, unit: 'dB' },
        ratio: { min: 1, max: 20, step: 0.5, default: 4 },
        attack: { min: 0.001, max: 0.1, step: 0.001, default: 0.003, unit: 's' },
        release: { min: 0.01, max: 1, step: 0.01, default: 0.25, unit: 's' },
      },
    },
    distortion: {
      label: 'Distortion',
      params: {
        amount: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
    filter: {
      label: 'Filter',
      params: {
        frequency: { min: 20, max: 20000, step: 1, default: 1000, unit: 'Hz' },
        resonance: { min: 0.1, max: 20, step: 0.1, default: 1 },
      },
    },
    chorus: {
      label: 'Chorus',
      params: {
        rate: { min: 0.1, max: 10, step: 0.1, default: 1.5, unit: 'Hz' },
        depth: { min: 0, max: 0.01, step: 0.0005, default: 0.002, unit: 's' },
        mix: { min: 0, max: 1, step: 0.01, default: 0.3 },
      },
    },
    limiter: {
      label: 'Limiter',
      params: {
        threshold: { min: -12, max: 0, step: 0.5, default: -1, unit: 'dB' },
        release: { min: 0.01, max: 0.5, step: 0.01, default: 0.01, unit: 's' },
      },
    },
    flanger: {
      label: 'Flanger',
      params: {
        rate: { min: 0.01, max: 10, step: 0.01, default: 0.5, unit: 'Hz' },
        depth: { min: 0, max: 0.01, step: 0.0005, default: 0.003, unit: 's' },
        feedback: { min: 0, max: 0.95, step: 0.01, default: 0.5 },
        mix: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
    phaser: {
      label: 'Phaser',
      params: {
        rate: { min: 0.01, max: 10, step: 0.01, default: 0.5, unit: 'Hz' },
        depth: { min: 0, max: 5000, step: 100, default: 2000, unit: 'Hz' },
        feedback: { min: 0, max: 0.95, step: 0.01, default: 0.5 },
        mix: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
    tremolo: {
      label: 'Tremolo',
      params: {
        rate: { min: 0.1, max: 20, step: 0.1, default: 5, unit: 'Hz' },
        depth: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
    bitcrusher: {
      label: 'Bit Crusher',
      params: {
        bits: { min: 1, max: 16, step: 1, default: 8 },
        mix: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
    saturation: {
      label: 'Saturation',
      params: {
        drive: { min: 0, max: 10, step: 0.1, default: 2 },
        warmth: { min: 0, max: 1, step: 0.01, default: 0.5 },
        mix: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
  };

  const ALL_FX_TYPES = Object.keys(FX_DEFS) as FXType[];

  let ctx: AudioContext | null = null;
  let sourceNode: AudioBufferSourceNode | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let fileName = $state('');
  let isPlaying = $state(false);
  let isPaused = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let progress = $state(0);
  let animFrame = 0;
  let startOffset = 0;
  let startCtxTime = 0;

  let effects = $state<FXNode[]>([]);
  let showAddMenu = $state(false);
  let draggedOver = $state(false);
  let loading = $state(false);

  // Analyser for waveform
  let analyser: AnalyserNode | null = null;
  let waveformData = $state<number[]>(new Array(128).fill(0));

  function ensureCtx(): AudioContext {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  }

  function getDefaultParams(type: FXType): Record<string, number> {
    const def = FX_DEFS[type];
    const params: Record<string, number> = {};
    for (const [k, v] of Object.entries(def.params)) {
      params[k] = v.default;
    }
    return params;
  }

  function addEffect(type: FXType) {
    effects = [...effects, {
      id: uid(),
      type,
      enabled: true,
      params: getDefaultParams(type),
    }];
    showAddMenu = false;
    if (isPlaying) rebuildChain();
  }

  function removeEffect(id: string) {
    effects = effects.filter(e => e.id !== id);
    if (isPlaying) rebuildChain();
  }

  function toggleEffect(id: string) {
    effects = effects.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e);
    if (isPlaying) rebuildChain();
  }

  function updateParam(id: string, key: string, value: number) {
    effects = effects.map(e => e.id === id ? { ...e, params: { ...e.params, [key]: value } } : e);
    updateParamLive(id, key, value);
  }

  // ── Audio graph ────────────────────────────────────────────────────
  let lastChainOutput: AudioNode | null = null;
  let chainNodes: AudioNode[] = [];
  let chainGain: GainNode | null = null;

  function createFXNode(type: FXType, params: Record<string, number>): AudioNode | null {
    const c = ensureCtx();
    switch (type) {
      case 'filter': {
        const node = c.createBiquadFilter();
        node.type = 'lowpass';
        node.frequency.value = params.frequency ?? 1000;
        node.Q.value = params.resonance ?? 1;
        return node;
      }
      case 'eq': {
        const low = c.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = 320;
        low.gain.value = params.low ?? 0;
        const mid = c.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1000;
        mid.Q.value = 0.7;
        mid.gain.value = params.mid ?? 0;
        const high = c.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 3200;
        high.gain.value = params.high ?? 0;
        low.connect(mid);
        mid.connect(high);
        return low;
      }
      case 'compressor': {
        const node = c.createDynamicsCompressor();
        node.threshold.value = params.threshold ?? -20;
        node.ratio.value = params.ratio ?? 4;
        node.attack.value = params.attack ?? 0.003;
        node.release.value = params.release ?? 0.25;
        return node;
      }
      case 'delay': {
        const delay = c.createDelay(5);
        delay.delayTime.value = params.time ?? 0.3;
        const feedback = c.createGain();
        feedback.gain.value = params.feedback ?? 0.4;
        const wet = c.createGain();
        wet.gain.value = params.mix ?? 0.3;
        const dry = c.createGain();
        dry.gain.value = 1 - (params.mix ?? 0.3);
        const merger = c.createGain();
        dry.connect(merger);
        wet.connect(merger);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        (delay as any)._wet = wet;
        (delay as any)._dry = dry;
        (delay as any)._feedback = feedback;
        return delay;
      }
      case 'distortion': {
        const ws = c.createWaveShaper();
        const amount = params.amount ?? 0.5;
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = ((3 + amount * 20) * x * Math.PI / 6) / (Math.PI / 2 + (3 + amount * 20) * Math.abs(x));
        }
        ws.curve = curve;
        ws.oversample = '4x';
        return ws;
      }
      case 'chorus': {
        const delay = c.createDelay();
        delay.delayTime.value = params.depth ?? 0.002;
        const lfo = c.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = params.rate ?? 1.5;
        const lfoGain = c.createGain();
        lfoGain.gain.value = 0.001;
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        lfo.start();
        const wet = c.createGain();
        wet.gain.value = params.mix ?? 0.3;
        delay.connect(wet);
        (delay as any)._lfo = lfo;
        (delay as any)._wet = wet;
        return delay;
      }
      case 'limiter': {
        const node = c.createDynamicsCompressor();
        node.threshold.value = params.threshold ?? -1;
        node.knee.value = 0;
        node.ratio.value = 20;
        node.attack.value = 0.001;
        node.release.value = params.release ?? 0.01;
        return node;
      }
      case 'reverb': {
        const convolver = c.createConvolver();
        const rate = c.sampleRate;
        const length = rate * (params.decay ?? 2);
        const impulse = c.createBuffer(2, length, rate);
        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch);
          for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
          }
        }
        convolver.buffer = impulse;
        const wet = c.createGain();
        wet.gain.value = params.mix ?? 0.3;
        convolver.connect(wet);
        (convolver as any)._wet = wet;
        return convolver;
      }
      case 'flanger': {
        const delay = c.createDelay();
        delay.delayTime.value = params.depth ?? 0.003;
        const lfo = c.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = params.rate ?? 0.5;
        const lfoGain = c.createGain();
        lfoGain.gain.value = params.depth ?? 0.003;
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        lfo.start();
        const feedback = c.createGain();
        feedback.gain.value = params.feedback ?? 0.5;
        const wet = c.createGain();
        wet.gain.value = params.mix ?? 0.5;
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        (delay as any)._lfo = lfo;
        (delay as any)._wet = wet;
        return delay;
      }
      case 'phaser': {
        const stages = 4;
        const filters: BiquadFilterNode[] = [];
        for (let i = 0; i < stages; i++) {
          const f = c.createBiquadFilter();
          f.type = 'allpass';
          f.frequency.value = (params.depth ?? 2000) / stages * (i + 1);
          f.Q.value = 5;
          filters.push(f);
        }
        for (let i = 0; i < stages - 1; i++) {
          filters[i].connect(filters[i + 1]);
        }
        const lfo = c.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = params.rate ?? 0.5;
        const lfoGain = c.createGain();
        lfoGain.gain.value = (params.depth ?? 2000) / 2;
        lfo.connect(lfoGain);
        for (const f of filters) lfoGain.connect(f.frequency);
        lfo.start();
        const feedback = c.createGain();
        feedback.gain.value = params.feedback ?? 0.5;
        const wet = c.createGain();
        wet.gain.value = params.mix ?? 0.5;
        filters[stages - 1].connect(feedback);
        feedback.connect(filters[0]);
        filters[stages - 1].connect(wet);
        (filters[0] as any)._lfo = lfo;
        (filters[0] as any)._wet = wet;
        return filters[0];
      }
      case 'tremolo': {
        const gain = c.createGain();
        gain.gain.value = 0.5;
        const lfo = c.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = params.rate ?? 5;
        const lfoGain = c.createGain();
        lfoGain.gain.value = params.depth ?? 0.5;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        lfo.start();
        (gain as any)._lfo = lfo;
        return gain;
      }
      case 'bitcrusher': {
        const ws = c.createWaveShaper();
        const bits = params.bits ?? 8;
        const levels = Math.pow(2, bits);
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = Math.round(x * levels) / levels;
        }
        ws.curve = curve;
        ws.oversample = 'none';
        return ws;
      }
      case 'saturation': {
        const ws = c.createWaveShaper();
        const drive = params.drive ?? 2;
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = Math.tanh(x * drive);
        }
        ws.curve = curve;
        ws.oversample = '4x';
        const wet = c.createGain();
        wet.gain.value = params.mix ?? 0.5;
        ws.connect(wet);
        (ws as any)._wet = wet;
        return ws;
      }
      default: return null;
    }
  }

  function updateParamLive(id: string, key: string, value: number) {
    const idx = effects.findIndex(e => e.id === id);
    if (idx < 0 || !chainNodes[idx]) return;
    const node = chainNodes[idx] as any;
    const type = effects[idx].type;

    // Update live params where possible
    if (type === 'filter') {
      if (key === 'frequency') (node as BiquadFilterNode).frequency.value = value;
      if (key === 'resonance') (node as BiquadFilterNode).Q.value = value;
    } else if (type === 'eq') {
      // Rebuild eq chain on param change
      rebuildChain();
      return;
    } else if (type === 'compressor' || type === 'limiter') {
      if (key === 'threshold') (node as DynamicsCompressorNode).threshold.value = value;
      if (key === 'ratio') (node as DynamicsCompressorNode).ratio.value = value;
      if (key === 'attack') (node as DynamicsCompressorNode).attack.value = value;
      if (key === 'release') (node as DynamicsCompressorNode).release.value = value;
    } else if (type === 'distortion' || type === 'bitcrusher' || type === 'saturation') {
      rebuildChain();
      return;
    } else if (type === 'reverb') {
      if (key === 'mix' && node._wet) node._wet.gain.value = value;
    } else if (type === 'delay') {
      if (key === 'time') node.delayTime.value = value;
      if (key === 'feedback' && node._feedback) node._feedback.gain.value = value;
      if (key === 'mix' && node._wet) node._wet.gain.value = value;
    } else if (type === 'chorus' || type === 'flanger') {
      if (key === 'rate' && node._lfo) node._lfo.frequency.value = value;
      if (key === 'depth') node.delayTime.value = value;
      if (key === 'mix' && node._wet) node._wet.gain.value = value;
    } else if (type === 'phaser') {
      rebuildChain();
      return;
    } else if (type === 'tremolo') {
      if (key === 'rate' && node._lfo) node._lfo.frequency.value = value;
      if (key === 'depth' && node._lfo) {
        // depth controls lfo gain
        rebuildChain();
        return;
      }
    }
  }

  function rebuildChain() {
    // Disconnect old chain
    for (const n of chainNodes) {
      try { n.disconnect(); } catch {}
      const lfo = (n as any)._lfo;
      if (lfo) try { lfo.stop(); } catch {}
    }
    chainNodes = [];

    const c = ensureCtx();
    if (!audioBuffer || !sourceNode) return;

    chainGain = c.createGain();
    analyser = c.createAnalyser();
    analyser.fftSize = 256;

    let lastNode: AudioNode = chainGain;

    for (const fx of effects) {
      if (!fx.enabled) continue;
      const node = createFXNode(fx.type, fx.params);
      if (!node) continue;
      lastNode.connect(node);
      lastNode = node;
      chainNodes.push(node);
    }

    // wet output for effects that have _wet
    const lastFx = chainNodes[chainNodes.length - 1];
    const wetNode = lastFx ? (lastFx as any)._wet : null;
    if (wetNode) {
      wetNode.connect(analyser);
    } else {
      lastNode.connect(analyser);
    }
    analyser.connect(c.destination);
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    draggedOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    loading = true;
    fileName = file.name;

    try {
      const c = ensureCtx();
      const arrayBuf = await file.arrayBuffer();
      audioBuffer = await c.decodeAudioData(arrayBuf);
      duration = audioBuffer.duration;
    } catch (err) {
      console.error('Failed to decode audio:', err);
      fileName = '';
      audioBuffer = null;
    } finally {
      loading = false;
    }
  }

  function play() {
    if (!audioBuffer) return;
    const c = ensureCtx();

    if (isPaused && sourceNode) {
      c.resume();
      isPlaying = true;
      isPaused = false;
      startTracking();
      return;
    }

    stop(false);

    sourceNode = c.createBufferSource();
    sourceNode.buffer = audioBuffer;
    rebuildChain();

    sourceNode.connect(chainGain!);
    sourceNode.start(0, startOffset);
    startCtxTime = c.currentTime;
    isPlaying = true;
    isPaused = false;

    sourceNode.onended = () => {
      if (isPlaying && !isPaused) {
        isPlaying = false;
        isPaused = false;
        startOffset = 0;
        currentTime = 0;
        progress = 0;
        cancelAnimationFrame(animFrame);
      }
    };

    startTracking();
  }

  function startTracking() {
    const tick = () => {
      if (!isPlaying || isPaused) return;
      currentTime = startOffset + (ctx?.currentTime ?? 0) - startCtxTime;
      if (currentTime >= duration) {
        currentTime = duration;
        progress = 100;
        return;
      }
      progress = (currentTime / duration) * 100;

      // Update waveform
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        waveformData = Array.from(data);
      }

      animFrame = requestAnimationFrame(tick);
    };
    animFrame = requestAnimationFrame(tick);
  }

  function pause() {
    if (!isPlaying) return;
    ctx?.suspend();
    isPaused = true;
    isPlaying = false;
    cancelAnimationFrame(animFrame);
  }

  function stop(reset = true) {
    if (sourceNode) {
      try { sourceNode.stop(); } catch {}
      try { sourceNode.disconnect(); } catch {}
      sourceNode = null;
    }
    for (const n of chainNodes) {
      try { n.disconnect(); } catch {}
      const lfo = (n as any)._lfo;
      if (lfo) try { lfo.stop(); } catch {}
    }
    chainNodes = [];
    isPlaying = false;
    isPaused = false;
    if (reset) {
      startOffset = 0;
      currentTime = 0;
      progress = 0;
    }
    cancelAnimationFrame(animFrame);
  }

  function seek(e: MouseEvent) {
    if (!audioBuffer) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const wasPlaying = isPlaying;
    if (isPlaying) stop(false);
    startOffset = pct * duration;
    currentTime = startOffset;
    progress = pct * 100;
    if (wasPlaying) play();
  }

  async function exportWav() {
    if (!audioBuffer) return;
    const offCtx = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    const src = offCtx.createBufferSource();
    src.buffer = audioBuffer;

    let lastNode: AudioNode = src;
    for (const fx of effects) {
      if (!fx.enabled) continue;
      // Rebuild FX in offline context
      // (simplified — uses same params)
      const node = createOfflineFXNode(offCtx, fx.type, fx.params);
      if (node) {
        lastNode.connect(node);
        lastNode = node;
      }
    }
    lastNode.connect(offCtx.destination);
    src.start(0);

    const rendered = await offCtx.startRendering();
    const wav = audioBufferToWav(rendered);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/\.[^.]+$/, '') + '_fx.wav';
    a.click();
    URL.revokeObjectURL(url);
  }

  function createOfflineFXNode(offCtx: OfflineAudioContext, type: FXType, params: Record<string, number>): AudioNode | null {
    switch (type) {
      case 'filter': {
        const node = offCtx.createBiquadFilter();
        node.type = 'lowpass';
        node.frequency.value = params.frequency ?? 1000;
        node.Q.value = params.resonance ?? 1;
        return node;
      }
      case 'eq': {
        const low = offCtx.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = 320;
        low.gain.value = params.low ?? 0;
        const mid = offCtx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1000;
        mid.Q.value = 0.7;
        mid.gain.value = params.mid ?? 0;
        const high = offCtx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 3200;
        high.gain.value = params.high ?? 0;
        low.connect(mid);
        mid.connect(high);
        return low;
      }
      case 'compressor': {
        const node = offCtx.createDynamicsCompressor();
        node.threshold.value = params.threshold ?? -20;
        node.ratio.value = params.ratio ?? 4;
        node.attack.value = params.attack ?? 0.003;
        node.release.value = params.release ?? 0.25;
        return node;
      }
      case 'limiter': {
        const node = offCtx.createDynamicsCompressor();
        node.threshold.value = params.threshold ?? -1;
        node.knee.value = 0;
        node.ratio.value = 20;
        node.attack.value = 0.001;
        node.release.value = params.release ?? 0.01;
        return node;
      }
      case 'distortion': {
        const ws = offCtx.createWaveShaper();
        const amount = params.amount ?? 0.5;
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = ((3 + amount * 20) * x * Math.PI / 6) / (Math.PI / 2 + (3 + amount * 20) * Math.abs(x));
        }
        ws.curve = curve;
        return ws;
      }
      case 'bitcrusher': {
        const ws = offCtx.createWaveShaper();
        const bits = params.bits ?? 8;
        const levels = Math.pow(2, bits);
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = Math.round(x * levels) / levels;
        }
        ws.curve = curve;
        return ws;
      }
      case 'saturation': {
        const ws = offCtx.createWaveShaper();
        const drive = params.drive ?? 2;
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = Math.tanh(x * drive);
        }
        ws.curve = curve;
        return ws;
      }
      case 'reverb': {
        const convolver = offCtx.createConvolver();
        const rate = offCtx.sampleRate;
        const length = rate * (params.decay ?? 2);
        const impulse = offCtx.createBuffer(2, length, rate);
        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch);
          for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
          }
        }
        convolver.buffer = impulse;
        return convolver;
      }
      default: return null;
    }
  }

  function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = buffer.length * blockAlign;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;
    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    function writeString(offset: number, str: string) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  onDestroy(() => {
    stop();
    ctx?.close();
  });
</script>

<div
  class="fx-root"
  ondragover={(e) => { e.preventDefault(); draggedOver = true; }}
  ondragleave={() => draggedOver = false}
  ondrop={handleDrop}
  role="application"
>
  {#if !audioBuffer}
    <div class="fx-dropzone" class:dragover={draggedOver}>
      {#if loading}
        <div class="fx-loading">Decoding audio...</div>
      {:else}
        <IconWaveSine size={48} stroke={1} />
        <p>Drop an audio file here</p>
        <p class="fx-drop-hint">MP3, WAV, OGG, FLAC, etc.</p>
      {/if}
    </div>
  {:else}
    <div class="fx-header">
      <div class="fx-file-info">
        <IconWaveSine size={20} stroke={1.5} />
        <span class="fx-filename">{fileName}</span>
        <span class="fx-duration">{formatTime(duration)}</span>
      </div>
      <div class="fx-header-actions">
        <button class="fx-btn-sm" onclick={() => { audioBuffer = null; fileName = ''; stop(); effects = []; }} title="Load new file">
          <IconUpload size={14} />
        </button>
        <button class="fx-btn-sm" onclick={exportWav} title="Export WAV">
          <IconDownload size={14} />
        </button>
      </div>
    </div>

    <!-- Transport -->
    <div class="fx-transport">
      <button class="fx-transport-btn" onclick={() => isPlaying ? pause() : play()} disabled={!audioBuffer}>
        {#if isPlaying}
          <IconPlayerPause size={20} />
        {:else}
          <IconPlayerPlay size={20} />
        {/if}
      </button>
      <button class="fx-transport-btn" onclick={() => stop()} disabled={!audioBuffer}>
        <IconPlayerStop size={20} />
      </button>
      <div class="fx-progress" onclick={seek} role="button" tabindex="-1">
        <div class="fx-progress-fill" style="width: {progress}%"></div>
      </div>
      <span class="fx-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
    </div>

    <!-- Waveform -->
    <div class="fx-waveform">
      {#each waveformData as v}
        <div class="fx-wave-bar" style="height: {(v / 255) * 100}%"></div>
      {/each}
    </div>

    <!-- FX Chain -->
    <div class="fx-chain">
      <div class="fx-chain-header">
        <IconSettings size={16} stroke={1.5} />
        <span>FX Chain</span>
        <div class="fx-add-wrap">
          <button class="fx-add-btn" onclick={() => showAddMenu = !showAddMenu}>
            <IconPlus size={14} /> Add Effect
          </button>
          {#if showAddMenu}
            <div class="fx-add-menu">
              {#each ALL_FX_TYPES as type}
                <button class="fx-add-item" onclick={() => addEffect(type)}>
                  {FX_DEFS[type].label}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      {#if effects.length === 0}
        <div class="fx-empty">No effects added. Click "Add Effect" to start.</div>
      {/if}

      {#each effects as fx (fx.id)}
        <div class="fx-module" class:disabled={!fx.enabled}>
          <div class="fx-module-header">
            <button class="fx-eye-btn" onclick={() => toggleEffect(fx.id)} title={fx.enabled ? 'Disable' : 'Enable'}>
              {#if fx.enabled}
                <IconEye size={14} />
              {:else}
                <IconEyeOff size={14} />
              {/if}
            </button>
            <span class="fx-module-label">{FX_DEFS[fx.type].label}</span>
            <button class="fx-remove-btn" onclick={() => removeEffect(fx.id)} title="Remove">
              <IconTrash size={12} />
            </button>
          </div>
          <div class="fx-params">
            {#each Object.entries(FX_DEFS[fx.type].params) as [key, def]}
              <div class="fx-param">
                <label class="fx-param-label">
                  {key}
                  {#if def.unit}<span class="fx-param-unit">{def.unit}</span>{/if}
                </label>
                <input
                  type="range"
                  class="fx-slider"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={fx.params[key] ?? def.default}
                  oninput={(e) => updateParam(fx.id, key, parseFloat((e.target as HTMLInputElement).value))}
                />
                <span class="fx-param-value">{(fx.params[key] ?? def.default).toFixed(def.step < 1 ? 2 : 0)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .fx-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-1);
    color: var(--text-1);
    font-family: 'Geist', sans-serif;
    overflow-y: auto;
  }

  .fx-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    min-height: 300px;
    border: 2px dashed var(--border);
    border-radius: 12px;
    margin: 20px;
    color: var(--text-3);
    transition: border-color 0.2s, background 0.2s;
  }
  .fx-dropzone.dragover, .fx-dropzone:hover {
    border-color: var(--border-hover);
    background: var(--bg-2);
  }
  .fx-dropzone p { margin: 0; font-size: 14px; }
  .fx-drop-hint { font-size: 12px !important; color: var(--text-3); }
  .fx-loading { font-size: 14px; color: var(--text-2); }

  .fx-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .fx-file-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fx-filename {
    font-weight: 500;
    font-size: 14px;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fx-duration {
    font-size: 12px;
    color: var(--text-3);
    font-family: 'Geist Mono', monospace;
  }
  .fx-header-actions { display: flex; gap: 6px; }
  .fx-btn-sm {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px;
    color: var(--text-2);
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: background 0.15s;
  }
  .fx-btn-sm:hover { background: var(--border); color: var(--text-1); }

  .fx-transport {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
  }
  .fx-transport-btn {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    color: var(--text-1);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .fx-transport-btn:hover:not(:disabled) { background: var(--border); }
  .fx-transport-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .fx-progress {
    flex: 1;
    height: 6px;
    background: var(--bg-2);
    border-radius: 3px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }
  .fx-progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.05s linear;
  }
  .fx-time {
    font-size: 12px;
    color: var(--text-3);
    font-family: 'Geist Mono', monospace;
    min-width: 80px;
    text-align: right;
  }

  .fx-waveform {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 60px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-2);
  }
  .fx-wave-bar {
    flex: 1;
    background: var(--accent);
    border-radius: 1px 1px 0 0;
    min-height: 2px;
    opacity: 0.7;
  }

  .fx-chain {
    flex: 1;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .fx-chain-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-2);
  }
  .fx-add-wrap { position: relative; margin-left: auto; }
  .fx-add-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--accent);
    border: none;
    border-radius: 6px;
    padding: 5px 10px;
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .fx-add-btn:hover { opacity: 0.85; }
  .fx-add-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px;
    z-index: 10;
    min-width: 140px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }
  .fx-add-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 6px 10px;
    color: var(--text-1);
    font-size: 12px;
    cursor: pointer;
    border-radius: 4px;
  }
  .fx-add-item:hover { background: var(--border); }

  .fx-empty {
    text-align: center;
    color: var(--text-3);
    font-size: 13px;
    padding: 24px;
  }

  .fx-module {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    transition: opacity 0.15s;
  }
  .fx-module.disabled { opacity: 0.5; }
  .fx-module-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }
  .fx-eye-btn, .fx-remove-btn {
    background: none;
    border: none;
    color: var(--text-3);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    transition: color 0.15s;
  }
  .fx-eye-btn:hover { color: var(--text-1); }
  .fx-remove-btn:hover { color: var(--red); }
  .fx-module-label {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .fx-params {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
  }
  .fx-param {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fx-param-label {
    font-size: 11px;
    color: var(--text-3);
    min-width: 70px;
    text-transform: capitalize;
  }
  .fx-param-unit {
    font-size: 10px;
    opacity: 0.6;
  }
  .fx-slider {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--border);
    border-radius: 2px;
    outline: none;
  }
  .fx-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
  }
  .fx-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    border: none;
  }
  .fx-param-value {
    font-size: 11px;
    font-family: 'Geist Mono', monospace;
    color: var(--text-2);
    min-width: 40px;
    text-align: right;
  }
</style>
