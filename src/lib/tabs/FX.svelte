<script lang="ts">
  import { onDestroy } from 'svelte';
  import { uid } from '$lib/music/engine';
  import {
    IconWaveSine, IconPlayerPlay, IconPlayerPause, IconPlayerStop,
    IconUpload, IconTrash, IconDownload, IconEye, IconEyeOff,
    IconPlus, IconCloud,
  } from '@tabler/icons-svelte';

  type FXType = 'reverb' | 'delay' | 'eq' | 'compressor' | 'distortion' | 'filter' | 'chorus' | 'limiter' | 'flanger' | 'phaser' | 'tremolo' | 'bitcrusher' | 'saturation' | 'speed';

  type FXNode = {
    id: string;
    type: FXType;
    enabled: boolean;
    params: Record<string, number>;
  };

  const FX_DEFS: Record<FXType, { label: string; color: string; icon: string; params: Record<string, { min: number; max: number; step: number; default: number; unit?: string }> }> = {
    speed: {
      label: 'Speed',
      color: '#a78bfa',
      icon: '~',
      params: {
        rate: { min: 0.1, max: 4, step: 0.05, default: 1, unit: 'x' },
        pitch: { min: -12, max: 12, step: 1, default: 0, unit: 'st' },
      },
    },
    reverb: {
      label: 'Reverb',
      color: '#60a5fa',
      icon: '::',
      params: {
        decay: { min: 0.1, max: 10, step: 0.1, default: 2, unit: 's' },
        mix: { min: 0, max: 1, step: 0.01, default: 0.3 },
      },
    },
    delay: {
      label: 'Delay',
      color: '#f472b6',
      icon: '..',
      params: {
        time: { min: 0.01, max: 2, step: 0.01, default: 0.3, unit: 's' },
        feedback: { min: 0, max: 0.95, step: 0.01, default: 0.4 },
        mix: { min: 0, max: 1, step: 0.01, default: 0.3 },
      },
    },
    eq: {
      label: 'EQ',
      color: '#34d399',
      icon: '~~~',
      params: {
        low: { min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
        mid: { min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
        high: { min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
      },
    },
    compressor: {
      label: 'Compressor',
      color: '#fbbf24',
      icon: '<>',
      params: {
        threshold: { min: -60, max: 0, step: 1, default: -20, unit: 'dB' },
        ratio: { min: 1, max: 20, step: 0.5, default: 4 },
        attack: { min: 0.001, max: 0.1, step: 0.001, default: 0.003, unit: 's' },
        release: { min: 0.01, max: 1, step: 0.01, default: 0.25, unit: 's' },
      },
    },
    distortion: {
      label: 'Distortion',
      color: '#f87171',
      icon: '^^',
      params: {
        amount: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
    filter: {
      label: 'Filter',
      color: '#818cf8',
      icon: '\\/',
      params: {
        frequency: { min: 20, max: 20000, step: 1, default: 1000, unit: 'Hz' },
        resonance: { min: 0.1, max: 20, step: 0.1, default: 1 },
      },
    },
    chorus: {
      label: 'Chorus',
      color: '#2dd4bf',
      icon: '~~',
      params: {
        rate: { min: 0.1, max: 10, step: 0.1, default: 1.5, unit: 'Hz' },
        depth: { min: 0, max: 0.01, step: 0.0005, default: 0.002, unit: 's' },
        mix: { min: 0, max: 1, step: 0.01, default: 0.3 },
      },
    },
    limiter: {
      label: 'Limiter',
      color: '#fb923c',
      icon: '|',
      params: {
        threshold: { min: -12, max: 0, step: 0.5, default: -1, unit: 'dB' },
        release: { min: 0.01, max: 0.5, step: 0.01, default: 0.01, unit: 's' },
      },
    },
    flanger: {
      label: 'Flanger',
      color: '#e879f9',
      icon: '><',
      params: {
        rate: { min: 0.01, max: 10, step: 0.01, default: 0.5, unit: 'Hz' },
        depth: { min: 0, max: 0.01, step: 0.0005, default: 0.003, unit: 's' },
        feedback: { min: 0, max: 0.95, step: 0.01, default: 0.5 },
        mix: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
    phaser: {
      label: 'Phaser',
      color: '#c084fc',
      icon: '/\\',
      params: {
        rate: { min: 0.01, max: 10, step: 0.01, default: 0.5, unit: 'Hz' },
        depth: { min: 0, max: 5000, step: 100, default: 2000, unit: 'Hz' },
        feedback: { min: 0, max: 0.95, step: 0.01, default: 0.5 },
        mix: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
    tremolo: {
      label: 'Tremolo',
      color: '#fb7185',
      icon: 'vv',
      params: {
        rate: { min: 0.1, max: 20, step: 0.1, default: 5, unit: 'Hz' },
        depth: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
    bitcrusher: {
      label: 'Bit Crusher',
      color: '#facc15',
      icon: '##',
      params: {
        bits: { min: 1, max: 16, step: 1, default: 8 },
        mix: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
    saturation: {
      label: 'Saturation',
      color: '#f59e0b',
      icon: '**',
      params: {
        drive: { min: 0, max: 10, step: 0.1, default: 2 },
        warmth: { min: 0, max: 1, step: 0.01, default: 0.5 },
        mix: { min: 0, max: 1, step: 0.01, default: 0.5 },
      },
    },
  };

  const ALL_FX_TYPES = Object.keys(FX_DEFS) as FXType[];

  const { apiKey }: { apiKey?: string } = $props();

  let ctx: AudioContext | null = null;
  let sourceNode: AudioBufferSourceNode | null = null;
  let audioBuffer: AudioBuffer | null = $state(null);
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

  let showCloudPicker = $state(false);
  let cloudFiles = $state<{ fileName: string; metaFileId: string }[]>([]);
  let cloudLoading = $state(false);
  let cloudSearch = $state('');

  let analyser: AnalyserNode | null = null;
  let waveformData = $state<number[]>(new Array(64).fill(0));

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

  let chainNodes: AudioNode[] = [];
  let chainGain: GainNode | null = null;

  function createFXNode(type: FXType, params: Record<string, number>): AudioNode | null {
    const c = ensureCtx();
    switch (type) {
      case 'speed': {
        return null;
      }
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
    if (idx < 0) return;
    const fx = effects[idx];
    if (fx.type === 'speed') {
      if (key === 'rate' && sourceNode && isPlaying) {
        sourceNode.playbackRate.value = value;
      }
      return;
    }
    const node = chainNodes[idx] as any;
    const type = fx.type;

    if (type === 'filter') {
      if (key === 'frequency') (node as BiquadFilterNode).frequency.value = value;
      if (key === 'resonance') (node as BiquadFilterNode).Q.value = value;
    } else if (type === 'eq') {
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
        rebuildChain();
        return;
      }
    }
  }

  function getSpeedRate(): number {
    const speedFx = effects.find(f => f.type === 'speed' && f.enabled);
    return speedFx ? (speedFx.params.rate ?? 1) : 1;
  }

  function rebuildChain() {
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
    analyser.fftSize = 128;

    let lastNode: AudioNode = chainGain;

    for (const fx of effects) {
      if (!fx.enabled || fx.type === 'speed') continue;
      const node = createFXNode(fx.type, fx.params);
      if (!node) continue;
      lastNode.connect(node);
      lastNode = node;
      chainNodes.push(node);
    }

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
    sourceNode.playbackRate.value = getSpeedRate();
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
    const speed = getSpeedRate();
    const tick = () => {
      if (!isPlaying || isPaused) return;
      currentTime = startOffset + ((ctx?.currentTime ?? 0) - startCtxTime) * speed;
      if (currentTime >= duration) {
        currentTime = duration;
        progress = 100;
        return;
      }
      progress = (currentTime / duration) * 100;

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
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
    const speedFx = effects.find(f => f.type === 'speed' && f.enabled);
    const rate = speedFx ? (speedFx.params.rate ?? 1) : 1;

    const newLength = Math.ceil(audioBuffer.length / rate);
    const offCtx = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      newLength,
      audioBuffer.sampleRate
    );

    const src = offCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.playbackRate.value = rate;

    let lastNode: AudioNode = src;
    for (const fx of effects) {
      if (!fx.enabled || fx.type === 'speed') continue;
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
        ws.oversample = 'none';
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

  async function fetchCloudFiles() {
    if (!apiKey) return;
    cloudLoading = true;
    try {
      const resp = await fetch(`/api/telegram/ls?api_key=${apiKey}`);
      const data = await resp.json();
      const allFiles: { fileName: string; metaFileId: string }[] = data.files ?? [];
      cloudFiles = allFiles.filter(f => /\.(mp3|wav|ogg|flac|m4a|aac|wma|opus)$/i.test(f.fileName));
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

  async function loadFromCloud(file: { fileName: string; metaFileId: string }) {
    showCloudPicker = false;
    loading = true;
    fileName = file.fileName;
    try {
      const c = ensureCtx();
      const resp = await fetch(`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}&download=true`);
      const blob = await resp.blob();
      const arrayBuf = await blob.arrayBuffer();
      audioBuffer = await c.decodeAudioData(arrayBuf);
      duration = audioBuffer.duration;
    } catch (err) {
      console.error('Failed to load from cloud:', err);
      fileName = '';
      audioBuffer = null;
    } finally {
      loading = false;
    }
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
        <div class="fx-pulse"></div>
        <p class="fx-drop-label">Decoding...</p>
      {:else}
        <div class="fx-drop-icon">
          <IconWaveSine size={40} stroke={1.2} />
        </div>
        <p class="fx-drop-label">Drop audio here</p>
        <p class="fx-drop-sub">MP3, WAV, OGG, FLAC</p>
        {#if apiKey}
          <button class="fx-cloud-btn" onclick={openCloudPicker}>
            <IconCloud size={15} /> Browse Cloud
          </button>
        {/if}
      {/if}
    </div>
  {:else}
    <!-- Header -->
    <div class="fx-header">
      <div class="fx-file-info">
        <div class="fx-file-dot" style="background: var(--accent)"></div>
        <span class="fx-filename">{fileName}</span>
        <span class="fx-duration">{formatTime(duration)}</span>
      </div>
      <div class="fx-header-actions">
        <button class="fx-btn-ghost" onclick={() => { audioBuffer = null; fileName = ''; stop(); effects = []; }} title="New file">
          <IconUpload size={14} />
        </button>
        <button class="fx-btn-ghost" onclick={exportWav} title="Export WAV">
          <IconDownload size={14} />
        </button>
      </div>
    </div>

    <!-- Transport -->
    <div class="fx-transport">
      <button class="fx-play-btn" onclick={() => isPlaying ? pause() : play()}>
        {#if isPlaying}
          <IconPlayerPause size={18} />
        {:else}
          <IconPlayerPlay size={18} style="margin-left: 2px" />
        {/if}
      </button>
      <button class="fx-stop-btn" onclick={() => stop()}>
        <IconPlayerStop size={16} />
      </button>
      <div class="fx-progress" onclick={seek} role="button" tabindex="-1">
        <div class="fx-progress-fill" style="width: {progress}%"></div>
      </div>
      <span class="fx-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
    </div>

    <!-- Waveform -->
    <div class="fx-waveform">
      <svg class="fx-waveform-svg" viewBox="0 0 {waveformData.length} 100" preserveAspectRatio="none">
        {#each waveformData as v, i}
          <rect
            x={i}
            y={100 - (v / 255) * 100}
            width="0.8"
            height={(v / 255) * 100}
            fill="var(--accent)"
            opacity={0.4 + (v / 255) * 0.6}
            rx="0.4"
          />
        {/each}
      </svg>
    </div>

    <!-- FX Chain -->
    <div class="fx-chain">
      <div class="fx-chain-header">
        <span class="fx-chain-title">Effects</span>
        <div class="fx-add-wrap">
          <button class="fx-add-btn" onclick={() => showAddMenu = !showAddMenu}>
            <IconPlus size={13} /> Add
          </button>
          {#if showAddMenu}
            <div class="fx-add-menu" onclick={(e) => e.stopPropagation()}>
              {#each ALL_FX_TYPES as type}
                <button class="fx-add-item" onclick={() => addEffect(type)}>
                  <span class="fx-add-dot" style="background: {FX_DEFS[type].color}"></span>
                  {FX_DEFS[type].label}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      {#if effects.length === 0}
        <div class="fx-empty">
          <span class="fx-empty-icon">~</span>
          <p>No effects yet</p>
          <p class="fx-empty-sub">Add effects to shape your sound</p>
        </div>
      {/if}

      <div class="fx-modules">
        {#each effects as fx, i (fx.id)}
          <div class="fx-module" class:disabled={!fx.enabled} style="--fx-color: {FX_DEFS[fx.type].color}">
            <div class="fx-module-header">
              <span class="fx-module-index">{i + 1}</span>
              <span class="fx-module-dot" style="background: {FX_DEFS[fx.type].color}"></span>
              <span class="fx-module-label">{FX_DEFS[fx.type].label}</span>
              <div class="fx-module-actions">
                <button class="fx-mod-btn" onclick={() => toggleEffect(fx.id)} title={fx.enabled ? 'Bypass' : 'Enable'}>
                  {#if fx.enabled}
                    <IconEye size={13} />
                  {:else}
                    <IconEyeOff size={13} />
                  {/if}
                </button>
                <button class="fx-mod-btn fx-mod-btn-rm" onclick={() => removeEffect(fx.id)} title="Remove">
                  <IconTrash size={12} />
                </button>
              </div>
            </div>
            <div class="fx-params">
              {#each Object.entries(FX_DEFS[fx.type].params) as [key, def]}
                <div class="fx-param">
                  <span class="fx-param-label">
                    {key}
                  </span>
                  <input
                    type="range"
                    class="fx-slider"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={fx.params[key] ?? def.default}
                    oninput={(e) => updateParam(fx.id, key, parseFloat((e.target as HTMLInputElement).value))}
                  />
                  <span class="fx-param-value">{(fx.params[key] ?? def.default).toFixed(def.step < 1 ? 2 : 0)}{def.unit ? ` ${def.unit}` : ''}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if showCloudPicker}
    <div class="fx-overlay" onclick={() => showCloudPicker = false} role="presentation">
      <div class="fx-picker" onclick={(e) => e.stopPropagation()} role="dialog">
        <div class="fx-picker-header">
          <IconCloud size={15} />
          <span>Import from Cloud</span>
          <button class="fx-btn-ghost" onclick={() => showCloudPicker = false}>
            <IconTrash size={13} />
          </button>
        </div>
        <input
          class="fx-picker-search"
          type="text"
          placeholder="Search audio files..."
          bind:value={cloudSearch}
        />
        <div class="fx-picker-list">
          {#if cloudLoading}
            <div class="fx-loading">Loading files...</div>
          {:else}
            {#each cloudFiles.filter(f => !cloudSearch || f.fileName.toLowerCase().includes(cloudSearch.toLowerCase())) as file}
              <button class="fx-picker-item" onclick={() => loadFromCloud(file)}>
                <IconWaveSine size={13} />
                <span>{file.fileName}</span>
              </button>
            {/each}
            {#if cloudFiles.length === 0}
              <div class="fx-loading">No audio files found</div>
            {/if}
          {/if}
        </div>
      </div>
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

  /* Dropzone */
  .fx-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    height: 100%;
    min-height: 320px;
    margin: 16px;
    border-radius: 16px;
    border: 1.5px dashed var(--border);
    transition: all 0.3s ease;
    position: relative;
  }
  .fx-dropzone.dragover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 4%, transparent);
  }
  .fx-drop-icon {
    width: 72px;
    height: 72px;
    border-radius: 20px;
    background: var(--bg-2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-3);
    transition: all 0.3s ease;
  }
  .fx-dropzone:hover .fx-drop-icon {
    background: var(--accent);
    color: white;
    transform: scale(1.05);
  }
  .fx-drop-label {
    margin: 0;
    font-size: 15px;
    font-weight: 500;
    color: var(--text-2);
  }
  .fx-drop-sub {
    margin: 0;
    font-size: 12px;
    color: var(--text-3);
    letter-spacing: 0.5px;
  }
  .fx-pulse {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--accent);
    animation: fx-pulse 1.2s ease-in-out infinite;
  }
  @keyframes fx-pulse {
    0%, 100% { transform: scale(0.8); opacity: 0.4; }
    50% { transform: scale(1.2); opacity: 1; }
  }

  .fx-cloud-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 18px;
    color: var(--text-2);
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    transition: all 0.2s ease;
  }
  .fx-cloud-btn:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    transform: translateY(-1px);
  }

  /* Header */
  .fx-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 20px;
    border-bottom: 1px solid var(--border);
  }
  .fx-file-info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .fx-file-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .fx-filename {
    font-weight: 500;
    font-size: 13px;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fx-duration {
    font-size: 12px;
    color: var(--text-3);
    font-family: 'Geist Mono', monospace;
  }
  .fx-header-actions { display: flex; gap: 2px; }

  /* Buttons */
  .fx-btn-ghost {
    background: none;
    border: none;
    border-radius: 6px;
    padding: 6px;
    color: var(--text-3);
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: all 0.15s ease;
  }
  .fx-btn-ghost:hover { background: var(--bg-2); color: var(--text-1); }

  /* Transport */
  .fx-transport {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--border);
  }
  .fx-play-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent);
    border: none;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }
  .fx-play-btn:hover { transform: scale(1.08); filter: brightness(1.1); }
  .fx-play-btn:active { transform: scale(0.95); }

  .fx-stop-btn {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    color: var(--text-3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }
  .fx-stop-btn:hover { color: var(--text-1); border-color: var(--text-3); }

  .fx-progress {
    flex: 1;
    height: 4px;
    background: var(--bg-2);
    border-radius: 2px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: height 0.15s ease;
  }
  .fx-progress:hover { height: 6px; }
  .fx-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white));
    border-radius: 2px;
    transition: width 0.08s linear;
  }
  .fx-time {
    font-size: 11px;
    color: var(--text-3);
    font-family: 'Geist Mono', monospace;
    min-width: 72px;
    text-align: right;
    flex-shrink: 0;
  }

  /* Waveform */
  .fx-waveform {
    height: 48px;
    padding: 0 20px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-1);
    display: flex;
    align-items: center;
  }
  .fx-waveform-svg {
    width: 100%;
    height: 100%;
  }

  /* FX Chain */
  .fx-chain {
    flex: 1;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }
  .fx-chain-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fx-chain-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-3);
  }
  .fx-add-wrap { position: relative; margin-left: auto; }
  .fx-add-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--accent);
    border: none;
    border-radius: 8px;
    padding: 5px 12px;
    color: white;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .fx-add-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .fx-add-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 4px;
    z-index: 10;
    min-width: 150px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    max-height: 320px;
    overflow-y: auto;
  }
  .fx-add-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 7px 10px;
    color: var(--text-1);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.1s ease;
  }
  .fx-add-item:hover { background: var(--border); }
  .fx-add-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .fx-empty {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-3);
  }
  .fx-empty-icon {
    font-size: 28px;
    opacity: 0.3;
    display: block;
    margin-bottom: 8px;
  }
  .fx-empty p { margin: 0; font-size: 13px; }
  .fx-empty-sub { font-size: 11px !important; opacity: 0.6; margin-top: 4px !important; }

  /* Modules */
  .fx-modules {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .fx-module {
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--fx-color, var(--accent)) 25%, var(--border));
    background: var(--bg-2);
    overflow: hidden;
    transition: all 0.2s ease;
  }
  .fx-module:hover {
    border-color: color-mix(in srgb, var(--fx-color, var(--accent)) 50%, var(--border));
  }
  .fx-module.disabled {
    opacity: 0.4;
  }
  .fx-module-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--fx-color, var(--accent)) 5%, transparent);
  }
  .fx-module-index {
    font-size: 10px;
    font-family: 'Geist Mono', monospace;
    color: var(--text-3);
    min-width: 14px;
  }
  .fx-module-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .fx-module-label {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-1);
  }
  .fx-module-actions {
    display: flex;
    gap: 2px;
  }
  .fx-mod-btn {
    background: none;
    border: none;
    color: var(--text-3);
    cursor: pointer;
    padding: 3px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: all 0.1s ease;
  }
  .fx-mod-btn:hover { color: var(--text-1); background: var(--bg-1); }
  .fx-mod-btn-rm:hover { color: #f87171; }

  .fx-params {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px 10px;
  }
  .fx-param {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fx-param-label {
    font-size: 11px;
    color: var(--text-3);
    min-width: 64px;
    text-transform: capitalize;
  }
  .fx-slider {
    flex: 1;
    height: 3px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--border);
    border-radius: 1.5px;
    outline: none;
    transition: height 0.1s ease;
  }
  .fx-slider:hover { height: 5px; }
  .fx-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--fx-color, var(--accent));
    cursor: pointer;
    border: 2px solid var(--bg-2);
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    transition: transform 0.1s ease;
  }
  .fx-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }
  .fx-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--fx-color, var(--accent));
    cursor: pointer;
    border: 2px solid var(--bg-2);
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  }
  .fx-param-value {
    font-size: 10px;
    font-family: 'Geist Mono', monospace;
    color: var(--text-3);
    min-width: 52px;
    text-align: right;
  }

  /* Overlay */
  .fx-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .fx-picker {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 14px;
    width: 400px;
    max-height: 480px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 48px rgba(0,0,0,0.3);
  }
  .fx-picker-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    font-weight: 500;
    font-size: 13px;
  }
  .fx-picker-header .fx-btn-ghost { margin-left: auto; }
  .fx-picker-search {
    margin: 8px 12px;
    padding: 8px 12px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-1);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s ease;
  }
  .fx-picker-search:focus { border-color: var(--accent); }
  .fx-picker-search::placeholder { color: var(--text-3); }
  .fx-picker-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 12px 12px;
  }
  .fx-picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 8px 10px;
    color: var(--text-1);
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.1s ease;
  }
  .fx-picker-item:hover { background: var(--bg-2); }
  .fx-picker-item span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fx-loading {
    text-align: center;
    padding: 20px;
    color: var(--text-3);
    font-size: 13px;
  }
</style>
