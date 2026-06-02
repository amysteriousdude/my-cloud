import type { SongState, Track, Pattern, NoteEvent, MixerChannel, EffectType } from "./engine";
import { noteToFreq, uid } from "./engine";

type SynthVoice = {
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  note: number;
  startTime: number;
};

type TrackAudioState = {
  gainNode: GainNode;
  panNode: StereoPannerNode;
  effects: AudioNode[];
  lastScheduledBeat: number;
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  masterCompressor: DynamicsCompressorNode | null = null;
  masterLimiter: DynamicsCompressorNode | null = null;

  private voices: Map<string, SynthVoice> = new Map();
  private drumBuffers: Map<string, AudioBuffer> = new Map();
  private scheduledEvents: number[] = [];
  private analyser: AnalyserNode | null = null;
  private _isPlaying = false;
  private _currentBeat = 0;
  private _startCtxTime = 0;
  private _startBeat = 0;
  private animFrame = 0;
  private lookAheadInterval: ReturnType<typeof setInterval> | null = null;
  private song: SongState | null = null;
  private onBeatChange: ((beat: number) => void) | null = null;
  private onEnd: (() => void) | null = null;

  // Per-track audio routing
  private trackStates: Map<string, TrackAudioState> = new Map();

  // Look-ahead scheduler config
  private readonly LOOK_AHEAD_SEC = 0.1;
  private readonly SCHEDULE_INTERVAL_MS = 25;

  get isPlaying() { return this._isPlaying; }
  get currentBeat() { return this._currentBeat; }

  get analyserData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  get timeDomainData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -12;
    this.masterCompressor.knee.value = 10;
    this.masterCompressor.ratio.value = 4;
    this.masterCompressor.attack.value = 0.003;
    this.masterCompressor.release.value = 0.25;

    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -1;
    this.masterLimiter.knee.value = 0;
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.001;
    this.masterLimiter.release.value = 0.01;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.masterGain.connect(this.masterCompressor);
    this.masterCompressor.connect(this.masterLimiter);
    this.masterLimiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    await this.loadDrumSamples();
  }

  private async loadDrumSamples() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const drums: Record<string, number[]> = {
      kick: [80, 0.5, 0.15],
      snare: [200, 0.3, 0.08],
      hihat: [800, 0.15, 0.03],
      openhat: [600, 0.2, 0.12],
      clap: [400, 0.25, 0.06],
      rim: [1200, 0.1, 0.02],
      tom: [150, 0.35, 0.1],
    };

    for (const [name, [freq, dur, attack]] of Object.entries(drums)) {
      const length = sampleRate * dur;
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = t < attack ? t / attack : Math.exp(-(t - attack) / (dur * 0.3));
        const noise = (Math.random() * 2 - 1) * 0.3;
        const tone = Math.sin(2 * Math.PI * freq * t * Math.exp(-t * 8));
        data[i] = (tone + noise) * env;
      }
      this.drumBuffers.set(name, buffer);
    }
  }

  setSong(song: SongState) {
    this.song = song;
    this.rebuildTrackAudio();
  }

  onBeat(cb: (beat: number) => void) { this.onBeatChange = cb; }
  onSongEnd(cb: () => void) { this.onEnd = cb; }

  setMasterVolume(v: number) {
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  // ── Per-track audio routing ──────────────────────────────────────────

  private rebuildTrackAudio() {
    if (!this.ctx || !this.masterGain) return;

    // Disconnect old track states
    for (const [, ts] of this.trackStates) {
      try { ts.gainNode.disconnect(); } catch {}
      try { ts.panNode.disconnect(); } catch {}
      for (const eff of ts.effects) {
        try { eff.disconnect(); } catch {}
      }
    }
    this.trackStates.clear();

    if (!this.song) return;

    for (let i = 0; i < this.song.tracks.length; i++) {
      const track = this.song.tracks[i];
      const ch = this.song.mixerChannels[i + 1]; // +1 because index 0 is Master

      const gainNode = this.ctx.createGain();
      gainNode.gain.value = ch?.volume ?? 0.7;

      const panNode = this.ctx.createStereoPanner();
      panNode.pan.value = ch?.pan ?? 0;

      // Chain: gain -> pan -> effects -> masterGain
      gainNode.connect(panNode);

      let lastNode: AudioNode = panNode;
      const effects: AudioNode[] = [];

      if (ch?.effects) {
        for (const eff of ch.effects) {
          if (!eff.enabled) continue;
          const webNode = this.createEffectNode(eff.type, eff.params);
          if (webNode) {
            lastNode.connect(webNode);
            lastNode = webNode;
            effects.push(webNode);
          }
        }
      }

      lastNode.connect(this.masterGain);
      this.trackStates.set(track.id, { gainNode, panNode, effects, lastScheduledBeat: -1 });
    }
  }

  private createEffectNode(type: EffectType, params: Record<string, number>): AudioNode | null {
    if (!this.ctx) return null;

    switch (type) {
      case "filter": {
        const node = this.ctx.createBiquadFilter();
        node.type = "lowpass";
        node.frequency.value = params.frequency ?? 1000;
        node.Q.value = params.resonance ?? 1;
        return node;
      }
      case "eq": {
        // Simple 3-band EQ using 3 filters in series
        const low = this.ctx.createBiquadFilter();
        low.type = "lowshelf";
        low.frequency.value = 320;
        low.gain.value = params.low ?? 0;
        const mid = this.ctx.createBiquadFilter();
        mid.type = "peaking";
        mid.frequency.value = 1000;
        mid.Q.value = 0.7;
        mid.gain.value = params.mid ?? 0;
        const high = this.ctx.createBiquadFilter();
        high.type = "highshelf";
        high.frequency.value = 3200;
        high.gain.value = params.high ?? 0;
        low.connect(mid);
        mid.connect(high);
        return low; // return first node, but chain is low->mid->high
      }
      case "compressor": {
        const node = this.ctx.createDynamicsCompressor();
        node.threshold.value = params.threshold ?? -20;
        node.ratio.value = params.ratio ?? 4;
        node.attack.value = params.attack ?? 0.003;
        node.release.value = params.release ?? 0.25;
        return node;
      }
      case "delay": {
        const delay = this.ctx.createDelay(5);
        delay.delayTime.value = params.time ?? 0.3;
        const feedback = this.ctx.createGain();
        feedback.gain.value = params.feedback ?? 0.4;
        const wet = this.ctx.createGain();
        wet.gain.value = params.mix ?? 0.3;
        const dry = this.ctx.createGain();
        dry.gain.value = 1 - (params.mix ?? 0.3);
        // Simple delay: input -> dry -> output, input -> delay -> feedback -> delay, delay -> wet -> output
        const merger = this.ctx.createGain();
        dry.connect(merger);
        wet.connect(merger);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        return { connect: (dest: AudioNode) => { dry.connect(dest); }, disconnect: () => {} } as any as AudioNode;
      }
      case "distortion": {
        const ws = this.ctx.createWaveShaper();
        const amount = params.amount ?? 0.5;
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = ((3 + amount * 20) * x * Math.PI / 6) / (Math.PI / 2 + (3 + amount * 20) * Math.abs(x));
        }
        ws.curve = curve;
        ws.oversample = "4x";
        return ws;
      }
      case "chorus": {
        const delay = this.ctx.createDelay();
        delay.delayTime.value = params.depth ?? 0.002;
        const lfo = this.ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = params.rate ?? 1.5;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.001;
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        lfo.start();
        const wet = this.ctx.createGain();
        wet.gain.value = params.mix ?? 0.3;
        delay.connect(wet);
        return delay;
      }
      case "limiter": {
        const node = this.ctx.createDynamicsCompressor();
        node.threshold.value = params.threshold ?? -1;
        node.knee.value = 0;
        node.ratio.value = 20;
        node.attack.value = 0.001;
        node.release.value = params.release ?? 0.01;
        return node;
      }
      case "reverb": {
        const convolver = this.ctx.createConvolver();
        const rate = this.ctx.sampleRate;
        const length = rate * (params.decay ?? 2);
        const impulse = this.ctx.createBuffer(2, length, rate);
        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch);
          for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
          }
        }
        convolver.buffer = impulse;
        const wet = this.ctx.createGain();
        wet.gain.value = params.mix ?? 0.3;
        convolver.connect(wet);
        return convolver;
      }
      default:
        return null;
    }
  }

  updateTrackVolume(trackId: string, volume: number) {
    const ts = this.trackStates.get(trackId);
    if (ts) ts.gainNode.gain.value = volume;
  }

  updateTrackPan(trackId: string, pan: number) {
    const ts = this.trackStates.get(trackId);
    if (ts) ts.panNode.pan.value = pan;
  }

  updateTrackMute(trackId: string, muted: boolean) {
    const ts = this.trackStates.get(trackId);
    if (ts) ts.gainNode.gain.value = muted ? 0 : 0.7; // Will be overridden by mixer
  }

  // ── Note playback ────────────────────────────────────────────────────

  playNote(note: number, velocity: number = 0.7, duration: number = 0.3, synthType: string = "sawtooth", trackId?: string) {
    if (!this.ctx) return;
    const id = uid();
    const freq = noteToFreq(note);
    const when = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = synthType as OscillatorType;
    osc.frequency.value = freq;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq * 4;
    filter.Q.value = 1;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(velocity * 0.3, when + 0.01);
    gain.gain.setValueAtTime(velocity * 0.3, when + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, when + duration);

    osc.connect(filter);
    filter.connect(gain);

    // Connect to track channel if available, otherwise master
    if (trackId && this.trackStates.has(trackId)) {
      gain.connect(this.trackStates.get(trackId)!.gainNode);
    } else if (this.masterGain) {
      gain.connect(this.masterGain);
    }

    osc.start(when);
    osc.stop(when + duration + 0.01);

    this.voices.set(id, { osc, gain, filter, note, startTime: when });
    osc.onended = () => {
      this.voices.delete(id);
      gain.disconnect();
      filter.disconnect();
    };
  }

  playDrum(name: string, velocity: number = 0.7, trackId?: string) {
    if (!this.ctx) return;
    const buffer = this.drumBuffers.get(name);
    if (!buffer) {
      this.playNote(60 + Math.floor(Math.random() * 12), velocity, 0.1, "sawtooth", trackId);
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = velocity;

    source.connect(gain);

    // Connect to track channel if available, otherwise master
    if (trackId && this.trackStates.has(trackId)) {
      gain.connect(this.trackStates.get(trackId)!.gainNode);
    } else if (this.masterGain) {
      gain.connect(this.masterGain);
    }

    source.start();
  }

  stopAllNotes() {
    for (const [, voice] of this.voices) {
      try { voice.osc.stop(); } catch {}
    }
    this.voices.clear();
  }

  // ── Look-ahead scheduler ─────────────────────────────────────────────

  private scheduleNotesUpTo(lookAheadBeat: number) {
    if (!this.ctx || !this.song) return;
    const beatsPerSec = this.song.bpm / 60;

    for (let ti = 0; ti < this.song.tracks.length; ti++) {
      const track = this.song.tracks[ti];
      if (track.type !== "pattern") continue;

      const ts = this.trackStates.get(track.id);
      const lastBeat = ts?.lastScheduledBeat ?? -1;

      for (const patId of track.patterns) {
        const pattern = this.song.patterns.find(p => p.id === patId);
        if (!pattern) continue;

        for (let bar = 0; bar < this.song.songLengthBars; bar++) {
          const barStartBeat = bar * this.song.timeSignatureNum;

          for (const note of pattern.notes) {
            const noteBeat = barStartBeat + note.startBeat;

            // Only schedule notes we haven't scheduled yet, within look-ahead window
            if (noteBeat <= lastBeat || noteBeat > lookAheadBeat) continue;
            if (noteBeat < this._currentBeat - 0.1) continue; // Skip notes that are already past

            const noteTime = this._startCtxTime + (noteBeat - this._startBeat) / beatsPerSec;
            const durTime = note.durationBeats / beatsPerSec;

            // Don't schedule notes in the past
            if (noteTime < this.ctx.currentTime - 0.05) continue;

            if (track.instrument === "drums") {
              this.scheduleDrumAt(this.drumNameFromNote(note.note), note.velocity, noteTime, track.id);
            } else {
              this.scheduleNoteAt(note.note, note.velocity, durTime, noteTime, "sawtooth", track.id);
            }
          }
        }
      }

      // Update last scheduled beat for this track
      if (ts) ts.lastScheduledBeat = lookAheadBeat;
    }
  }

  private scheduleNoteAt(note: number, velocity: number, duration: number, when: number, synthType: string, trackId: string) {
    if (!this.ctx) return;
    const id = uid();
    const freq = noteToFreq(note);

    const osc = this.ctx.createOscillator();
    osc.type = synthType as OscillatorType;
    osc.frequency.value = freq;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq * 4;
    filter.Q.value = 1;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(velocity * 0.3, when + 0.01);
    gain.gain.setValueAtTime(velocity * 0.3, when + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, when + duration);

    osc.connect(filter);
    filter.connect(gain);

    if (this.trackStates.has(trackId)) {
      gain.connect(this.trackStates.get(trackId)!.gainNode);
    } else if (this.masterGain) {
      gain.connect(this.masterGain);
    }

    osc.start(when);
    osc.stop(when + duration + 0.01);

    this.voices.set(id, { osc, gain, filter, note, startTime: when });
    osc.onended = () => {
      this.voices.delete(id);
      gain.disconnect();
      filter.disconnect();
    };
  }

  private scheduleDrumAt(name: string, velocity: number, when: number, trackId: string) {
    if (!this.ctx) return;
    const buffer = this.drumBuffers.get(name);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = velocity;

    source.connect(gain);

    if (this.trackStates.has(trackId)) {
      gain.connect(this.trackStates.get(trackId)!.gainNode);
    } else if (this.masterGain) {
      gain.connect(this.masterGain);
    }

    source.start(when);
  }

  private drumNameFromNote(note: number): string {
    const drums = ["kick", "snare", "hihat", "openhat", "clap", "rim", "tom"];
    return drums[(note - 36) % drums.length] ?? "kick";
  }

  // ── Song transport ───────────────────────────────────────────────────

  playSong(song: SongState, fromBeat: number = 0) {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    this.stopSong();
    this.song = song;
    this._isPlaying = true;
    this._startBeat = fromBeat;
    this._startCtxTime = this.ctx.currentTime;
    this._currentBeat = fromBeat;

    // Reset lastScheduledBeat for all tracks
    for (const [, ts] of this.trackStates) {
      ts.lastScheduledBeat = fromBeat - 1;
    }

    const beatsPerSec = song.bpm / 60;

    // Start look-ahead scheduler
    this.lookAheadInterval = setInterval(() => {
      if (!this._isPlaying || !this.ctx) return;
      const elapsed = this.ctx.currentTime - this._startCtxTime;
      this._currentBeat = this._startBeat + elapsed * beatsPerSec;
      const lookAheadBeat = this._currentBeat + this.LOOK_AHEAD_SEC * beatsPerSec;
      this.scheduleNotesUpTo(lookAheadBeat);
    }, this.SCHEDULE_INTERVAL_MS);

    // Schedule initial batch
    const beatsPerSecInit = song.bpm / 60;
    this.scheduleNotesUpTo(this._startBeat + this.LOOK_AHEAD_SEC * beatsPerSecInit);

    // Animation frame for UI updates
    const tick = () => {
      if (!this._isPlaying || !this.ctx) return;
      const elapsed = this.ctx.currentTime - this._startCtxTime;
      this._currentBeat = this._startBeat + elapsed * beatsPerSec;

      if (this._currentBeat >= song.totalBeats) {
        this.stopSong();
        this.onEnd?.();
        return;
      }

      this.onBeatChange?.(this._currentBeat);
      this.animFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  stopSong() {
    this._isPlaying = false;
    cancelAnimationFrame(this.animFrame);
    if (this.lookAheadInterval) {
      clearInterval(this.lookAheadInterval);
      this.lookAheadInterval = null;
    }
    this.stopAllNotes();
  }

  pauseSong() {
    this._isPlaying = false;
    cancelAnimationFrame(this.animFrame);
    if (this.lookAheadInterval) {
      clearInterval(this.lookAheadInterval);
      this.lookAheadInterval = null;
    }
    this.stopAllNotes();
  }

  resumeSong(song: SongState) {
    if (!this.ctx) return;
    this.playSong(song, this._currentBeat);
  }

  beatToTime(beat: number, bpm: number): number {
    return beat / (bpm / 60);
  }

  timeToBeat(time: number, bpm: number): number {
    return time * (bpm / 60);
  }

  async renderOffline(song: SongState, progressCb?: (p: number) => void): Promise<AudioBuffer> {
    const sampleRate = 44100;
    const duration = song.totalBeats / (song.bpm / 60);
    const totalSamples = Math.ceil(duration * sampleRate);
    const offline = new OfflineAudioContext(2, totalSamples, sampleRate);

    const master = offline.createGain();
    master.gain.value = 0.8;
    master.connect(offline.destination);

    const beatsPerSec = song.bpm / 60;

    for (let ti = 0; ti < song.tracks.length; ti++) {
      const track = song.tracks[ti];
      if (track.type !== "pattern") continue;

      const ch = song.mixerChannels[ti + 1];
      const trackGain = offline.createGain();
      trackGain.gain.value = ch?.volume ?? 0.7;
      const trackPan = offline.createStereoPanner();
      trackPan.pan.value = ch?.pan ?? 0;
      trackGain.connect(trackPan);
      trackPan.connect(master);

      for (const patId of track.patterns) {
        const pattern = song.patterns.find(p => p.id === patId);
        if (!pattern) continue;
        for (let bar = 0; bar < song.songLengthBars; bar++) {
          for (const note of pattern.notes) {
            const beat = bar * song.timeSignatureNum + note.startBeat;
            const time = beat / beatsPerSec;
            const dur = note.durationBeats / beatsPerSec;

            const osc = offline.createOscillator();
            osc.type = track.instrument === "drums" ? "square" : "sawtooth";
            osc.frequency.value = noteToFreq(note.note);

            const gain = offline.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(note.velocity * 0.2, time + 0.01);
            gain.gain.setValueAtTime(note.velocity * 0.2, time + dur - 0.05);
            gain.gain.linearRampToValueAtTime(0, time + dur);

            osc.connect(gain);
            gain.connect(trackGain);
            osc.start(time);
            osc.stop(time + dur + 0.01);
          }
        }
      }
    }

    progressCb?.(50);
    const rendered = await offline.startRendering();
    progressCb?.(100);
    return rendered;
  }

  destroy() {
    this.stopSong();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
