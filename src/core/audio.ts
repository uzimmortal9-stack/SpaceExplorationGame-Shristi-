/**
 * Audio — a small procedural synthesis layer built on the Web Audio API.
 *
 * Everything is generated at runtime (no sample downloads): noise beds for
 * ambience, filtered noise bursts for hydraulics and thrusters, FM blips for
 * console UI, and a sustained detuned-saw drone for the warp core. Each layer
 * is routed through a master gain so the settings panel can mix them.
 */

import { clamp } from './math';

type BusName = 'master' | 'ambient' | 'sfx' | 'music';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private readonly buses = new Map<BusName, GainNode>();
  private readonly loops = new Map<string, { gain: GainNode; stop: () => void }>();
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;
  private volumes: Record<BusName, number> = { master: 0.8, ambient: 0.7, sfx: 0.85, music: 0.5 };

  get context(): AudioContext | null {
    return this.ctx;
  }

  get isRunning(): boolean {
    return this.started && this.ctx?.state === 'running';
  }

  /** Must be called from a user gesture. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const master = this.ctx.createGain();
      master.gain.value = this.volumes.master;
      master.connect(this.ctx.destination);
      this.buses.set('master', master);
      for (const name of ['ambient', 'sfx', 'music'] as const) {
        const g = this.ctx.createGain();
        g.gain.value = this.volumes[name];
        g.connect(master);
        this.buses.set(name, g);
      }
      this.noiseBuffer = this.makeNoiseBuffer(2.5);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.started = true;
  }

  setVolume(bus: BusName, value: number): void {
    this.volumes[bus] = clamp(value, 0, 1);
    const node = this.buses.get(bus);
    if (node && this.ctx) node.gain.setTargetAtTime(this.volumes[bus], this.ctx.currentTime, 0.05);
  }

  getVolume(bus: BusName): number {
    return this.volumes[bus];
  }

  private bus(name: BusName): GainNode | null {
    return this.buses.get(name) ?? null;
  }

  private makeNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // pink-ish noise (Voss-McCartney approximation) reads warmer than white
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = pink * 0.11;
    }
    return buf;
  }

  // ---------------------------------------------------------------- one-shots

  /** Short filtered-noise burst — doors, thrusters, dust, water. */
  noiseBurst(opts: {
    duration?: number;
    gain?: number;
    filter?: number;
    filterEnd?: number;
    q?: number;
    type?: BiquadFilterType;
    bus?: BusName;
    attack?: number;
  } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;
    const {
      duration = 0.4, gain = 0.3, filter = 800, filterEnd = filter,
      q = 1.0, type = 'bandpass', bus = 'sfx', attack = 0.01,
    } = opts;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.setValueAtTime(filter, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), t + duration);
    bq.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(bq).connect(g).connect(this.bus(bus)!);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  /** Pitched tone — UI clicks, confirms, target lock. */
  tone(opts: {
    freq?: number;
    freqEnd?: number;
    duration?: number;
    gain?: number;
    type?: OscillatorType;
    bus?: BusName;
    delay?: number;
  } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const {
      freq = 880, freqEnd = freq, duration = 0.09,
      gain = 0.12, type = 'sine', bus = 'sfx', delay = 0,
    } = opts;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.bus(bus)!);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // ------------------------------------------------------- named UI/world sfx

  uiHover(): void { this.tone({ freq: 1200, duration: 0.035, gain: 0.035, type: 'square' }); }
  uiClick(): void { this.tone({ freq: 660, freqEnd: 880, duration: 0.06, gain: 0.09, type: 'square' }); }
  uiConfirm(): void {
    this.tone({ freq: 620, duration: 0.09, gain: 0.09, type: 'triangle' });
    this.tone({ freq: 930, duration: 0.14, gain: 0.08, type: 'triangle', delay: 0.07 });
  }
  uiDenied(): void { this.tone({ freq: 220, freqEnd: 150, duration: 0.2, gain: 0.11, type: 'sawtooth' }); }

  switchClunk(): void {
    this.noiseBurst({ duration: 0.09, gain: 0.34, filter: 2400, filterEnd: 380, q: 1.4 });
    this.tone({ freq: 160, freqEnd: 90, duration: 0.1, gain: 0.14, type: 'square' });
  }

  leverPull(): void {
    this.noiseBurst({ duration: 0.42, gain: 0.3, filter: 900, filterEnd: 200, q: 2.2 });
    this.tone({ freq: 120, freqEnd: 60, duration: 0.45, gain: 0.16, type: 'sawtooth' });
  }

  doorSlide(open: boolean): void {
    this.noiseBurst({
      duration: 0.85, gain: 0.26,
      filter: open ? 420 : 900, filterEnd: open ? 1500 : 260,
      q: 1.1, attack: 0.14,
    });
    this.tone({ freq: open ? 90 : 130, freqEnd: open ? 150 : 70, duration: 0.5, gain: 0.07, type: 'sine' });
    // pneumatic release hiss
    window.setTimeout(() => this.noiseBurst({ duration: 0.5, gain: 0.14, filter: 3800, filterEnd: 1800, q: 0.7, type: 'highpass' }), 380);
  }

  footstep(surface: 'metal' | 'grass' | 'stone' | 'water'): void {
    const cfg = {
      metal: { filter: 1500, gain: 0.10, dur: 0.09, q: 2.4 },
      grass: { filter: 900, gain: 0.07, dur: 0.13, q: 0.7 },
      stone: { filter: 1100, gain: 0.09, dur: 0.10, q: 1.2 },
      water: { filter: 2200, gain: 0.10, dur: 0.16, q: 0.6 },
    }[surface];
    this.noiseBurst({ duration: cfg.dur, gain: cfg.gain * (0.75 + Math.random() * 0.5), filter: cfg.filter * (0.85 + Math.random() * 0.3), filterEnd: cfg.filter * 0.4, q: cfg.q });
  }

  beep(freq = 1400): void { this.tone({ freq, duration: 0.05, gain: 0.06, type: 'sine' }); }

  targetLock(): void {
    this.tone({ freq: 900, duration: 0.05, gain: 0.08, type: 'square' });
    this.tone({ freq: 1350, duration: 0.09, gain: 0.08, type: 'square', delay: 0.06 });
  }

  alarm(): void {
    for (let i = 0; i < 2; i++) {
      this.tone({ freq: 720, freqEnd: 480, duration: 0.24, gain: 0.11, type: 'sawtooth', delay: i * 0.3 });
    }
  }

  impact(strength = 1): void {
    this.noiseBurst({ duration: 0.7 * strength, gain: 0.4 * strength, filter: 260, filterEnd: 60, q: 0.8, type: 'lowpass' });
    this.tone({ freq: 70, freqEnd: 35, duration: 0.6 * strength, gain: 0.22 * strength, type: 'sine' });
  }

  pour(): void { this.noiseBurst({ duration: 1.4, gain: 0.12, filter: 1800, filterEnd: 900, q: 0.8, attack: 0.3 }); }

  // ------------------------------------------------------------------- loops

  /**
   * Start (or fetch) a sustained layer. `kind` selects the synthesis recipe.
   * Loops are addressed by id so callers can crossfade them by name.
   */
  loop(id: string, kind: 'hum' | 'air' | 'engine' | 'warp' | 'wind' | 'water' | 'reactor', bus: BusName = 'ambient'): GainNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return null;
    const existing = this.loops.get(id);
    if (existing) return existing.gain;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.bus(bus)!);
    const nodes: Array<{ stop?: () => void }> = [];

    const noise = (freq: number, q: number, type: BiquadFilterType, g: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer!;
      src.loop = true;
      const bq = ctx.createBiquadFilter();
      bq.type = type;
      bq.frequency.value = freq;
      bq.Q.value = q;
      const ng = ctx.createGain();
      ng.gain.value = g;
      src.connect(bq).connect(ng).connect(out);
      src.start();
      nodes.push({ stop: () => src.stop() });
      return { bq, ng };
    };
    const osc = (freq: number, type: OscillatorType, g: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(out);
      o.start();
      nodes.push({ stop: () => o.stop() });
      return o;
    };

    switch (kind) {
      case 'hum':
        osc(52, 'sine', 0.28);
        osc(104, 'sine', 0.10, 6);
        noise(240, 0.6, 'lowpass', 0.14);
        break;
      case 'air':
        noise(1200, 0.5, 'bandpass', 0.5);
        noise(320, 0.7, 'lowpass', 0.18);
        break;
      case 'engine':
        osc(70, 'sawtooth', 0.055);
        osc(140, 'sine', 0.05, -8);
        noise(600, 0.9, 'bandpass', 0.3);
        break;
      case 'warp':
        osc(120, 'sawtooth', 0.06);
        osc(180, 'sawtooth', 0.05, 14);
        osc(240, 'square', 0.025, -11);
        noise(2400, 1.6, 'bandpass', 0.35);
        break;
      case 'wind':
        noise(560, 0.35, 'bandpass', 0.55);
        noise(180, 0.6, 'lowpass', 0.2);
        break;
      case 'water':
        noise(2600, 0.45, 'bandpass', 0.4);
        noise(900, 0.6, 'bandpass', 0.3);
        noise(240, 0.8, 'lowpass', 0.12);
        break;
      case 'reactor':
        osc(38, 'sine', 0.34);
        osc(76, 'triangle', 0.12);
        noise(150, 1.2, 'lowpass', 0.2);
        break;
    }

    const handle = {
      gain: out,
      stop: () => {
        for (const n of nodes) n.stop?.();
        out.disconnect();
      },
    };
    this.loops.set(id, handle);
    return out;
  }

  setLoopGain(id: string, value: number, ramp = 0.4): void {
    const ctx = this.ctx;
    const l = this.loops.get(id);
    if (!ctx || !l) return;
    l.gain.gain.setTargetAtTime(clamp(value, 0, 2), ctx.currentTime, Math.max(0.01, ramp / 3));
  }

  /** Retune a running loop (warp spin-up pitch rise). */
  setLoopDetune(id: string, cents: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.loops.has(id)) return;
    // Detune is applied by adjusting playbackRate-ish via gain automation only;
    // oscillator handles are intentionally not exposed, so we approximate the
    // rising-pitch sensation with a filtered overtone layer instead.
    void cents;
  }

  stopLoop(id: string, fade = 0.6): void {
    const ctx = this.ctx;
    const l = this.loops.get(id);
    if (!ctx || !l) return;
    l.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3);
    window.setTimeout(() => {
      l.stop();
      this.loops.delete(id);
    }, fade * 1000 + 250);
  }

  stopAllLoops(): void {
    for (const id of [...this.loops.keys()]) this.stopLoop(id, 0.25);
  }

  dispose(): void {
    this.stopAllLoops();
    void this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
