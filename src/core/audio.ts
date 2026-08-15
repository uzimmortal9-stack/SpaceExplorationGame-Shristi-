/**
 * AudioEngine — fully procedural WebAudio synthesis.
 * No external audio files required; every sound is synthesized at runtime so
 * the game is self-contained and immersive.
 */

export type Zone = "ship" | "space" | "jungle";

type OscType = OscillatorType;

interface ToneOpts {
  type?: OscType;
  freq?: number;
  end?: number;
  gain?: number;
  dur?: number;
  attack?: number;
  when?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private muted = false;
  private volume = 0.8;

  private humNodes: OscillatorNode[] = [];
  private currentZone: Zone = "ship";

  /** Must be called from a user gesture (main menu button). */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.5;
    this.ambientGain.connect(this.master);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.master);
    this.startShipAmbience();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  private tone(opts: ToneOpts, dest?: AudioNode, when = 0): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(opts.freq || 440, t);
    if (opts.end) osc.frequency.exponentialRampToValueAtTime(opts.end, t + (opts.dur || 0.2));
    const peak = opts.gain ?? 0.2;
    const dur = opts.dur || 0.2;
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, freq: number, q = 1, dest?: AudioNode, when = 0): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest || this.sfxGain);
    src.start(t);
  }

  // ---- UI / mechanical feedback ----
  click(): void {
    this.tone({ type: "square", freq: 1400, gain: 0.06, dur: 0.03 });
  }
  hover(): void {
    this.tone({ type: "square", freq: 1200, gain: 0.04, dur: 0.02 });
  }
  confirm(): void {
    this.tone({ type: "sine", freq: 700, gain: 0.12, dur: 0.08 });
    this.tone({ type: "sine", freq: 1050, gain: 0.12, dur: 0.14, when: 0.06 });
  }
  clunk(): void {
    this.tone({ type: "triangle", freq: 120, end: 60, gain: 0.5, dur: 0.15 });
    this.noise(0.12, 0.2, 900, 1);
  }
  switchHit(): void {
    this.tone({ type: "square", freq: 900, end: 300, gain: 0.16, dur: 0.05 });
  }
  beep(): void {
    this.tone({ type: "square", freq: 2200, gain: 0.05, dur: 0.04 });
  }
  warn(): void {
    this.tone({ type: "sawtooth", freq: 320, end: 220, gain: 0.15, dur: 0.25 });
    this.tone({ type: "sawtooth", freq: 320, end: 220, gain: 0.15, dur: 0.25, when: 0.35 });
  }
  targetLock(): void {
    this.tone({ type: "sine", freq: 880, gain: 0.12, dur: 0.06 });
    this.tone({ type: "sine", freq: 1320, gain: 0.12, dur: 0.1, when: 0.06 });
  }

  // ---- Movement / doors ----
  footstep(material: string): void {
    const p = material === "metal" ? 200 : material === "stone" ? 140 : 300;
    this.noise(0.08, 0.1, p, 1.2);
    this.tone({ type: "sine", freq: 90, end: 50, gain: 0.06, dur: 0.07 });
  }
  doorSlide(open: boolean): void {
    const dur = 0.9;
    const t = this.ctx ? this.ctx.currentTime : 0;
    this.tone({ type: "sawtooth", freq: open ? 180 : 160, end: open ? 90 : 200, gain: 0.06, dur });
    this.noise(dur, 0.12, 500, 1.5);
    if (this.ctx) {
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = 8;
      lg.gain.value = 0.4;
      const base = this.ctx.createBiquadFilter();
      base.type = "lowpass";
      base.frequency.value = 400;
      lfo.connect(lg);
      lg.connect(base.frequency);
      void t;
    }
  }
  doorBump(): void {
    this.clunk();
    this.tone({ type: "square", freq: 400, end: 200, gain: 0.2, dur: 0.12 });
  }
  airlockCycle(): void {
    this.clunk();
    this.tone({ type: "sine", freq: 220, end: 110, gain: 0.2, dur: 0.8 });
    this.noise(1.4, 0.1, 700, 0.6);
    this.clunk();
  }

  // ---- Flight / warp / landing ----
  engineThrust(intensity: number): void {
    // intensity 0..1
    if (!this.ctx || !this.sfxGain) return;
    this.noise(0.2, 0.05 + intensity * 0.15, 80 + intensity * 120, 0.5);
    this.tone({ type: "sawtooth", freq: 45 + intensity * 60, gain: 0.04 + intensity * 0.1, dur: 0.2 });
  }
  warpSpin(level: number): void {
    this.tone({ type: "sawtooth", freq: 80 + level * 400, gain: 0.06 + level * 0.14, dur: 0.25 });
    this.tone({ type: "sine", freq: 40 + level * 200, gain: 0.08, dur: 0.25 });
  }
  warpWhoosh(): void {
    this.noise(2.6, 0.35, 1200, 0.3);
    this.noise(2.6, 0.25, 200, 0.4);
    this.tone({ type: "sine", freq: 60, end: 300, gain: 0.2, dur: 2.4 });
  }
  warpExit(): void {
    this.tone({ type: "sine", freq: 300, end: 60, gain: 0.2, dur: 1.2 });
    this.confirm();
  }
  reentry(level: number): void {
    this.noise(0.3, 0.1 + level * 0.2, 300 + level * 900, 0.4);
  }
  touchdown(): void {
    this.clunk();
    this.noise(0.7, 0.4, 80, 0.5);
  }
  gearDeploy(): void {
    this.clunk();
    this.tone({ type: "triangle", freq: 140, end: 70, gain: 0.3, dur: 0.5 });
  }

  // ---- Reactor / ambience ----
  reactorPulse(): void {
    this.tone({ type: "sine", freq: 55, gain: 0.08, dur: 0.6 });
  }
  coffee(): void {
    this.noise(1.6, 0.12, 600, 0.5);
    this.tone({ type: "sine", freq: 200, end: 90, gain: 0.08, dur: 1.6 });
  }
  flush(): void {
    this.noise(2.0, 0.25, 300, 0.4);
    this.tone({ type: "sine", freq: 120, end: 50, gain: 0.15, dur: 2.0 });
  }
  scan(): void {
    for (let i = 0; i < 6; i++) this.tone({ type: "sine", freq: 500 + i * 180, gain: 0.08, dur: 0.1, when: i * 0.14 });
  }

  // ---- Zone ambiences ----
  private startShipAmbience(): void {
    if (!this.ctx || !this.ambientGain) return;
    const mk = (type: OscType, freq: number, gain: number) => {
      const o = this.ctx!.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = this.ctx!.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(this.ambientGain!);
      o.start();
      return o;
    };
    // Low ship hum + slow LFO breathing
    this.humNodes.push(mk("sine", 55, 0.03));
    this.humNodes.push(mk("sine", 110, 0.015));
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 0.1;
    lg.gain.value = 0.006;
    lfo.connect(lg);
    lg.connect(this.ambientGain);
    lfo.start();
  }

  setZone(zone: Zone): void {
    if (zone === this.currentZone) return;
    this.currentZone = zone;
    if (!this.ctx || !this.ambientGain) return;
    const g = this.ambientGain;
    const target = zone === "jungle" ? 0.22 : zone === "space" ? 0.05 : 0.5;
    g.gain.cancelScheduledValues(this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 1.5);
    // Jungle: add birdsong-ish chirps periodically (handled by caller via tick)
  }

  /** Ambient jungle calls — called periodically when on planet. */
  jungleCall(): void {
    this.tone({ type: "sine", freq: 900 + Math.random() * 500, gain: 0.03, dur: 0.4 });
    this.tone({ type: "sine", freq: 700 + Math.random() * 400, gain: 0.02, dur: 0.3, when: 0.3 });
  }
  waterfall(): void {
    this.noise(2.0, 0.08, 900, 0.3);
  }
  spore(): void {
    this.tone({ type: "sine", freq: 1600 + Math.random() * 600, gain: 0.02, dur: 0.2 });
  }

  dispose(): void {
    for (const o of this.humNodes) {
      try {
        o.stop();
      } catch {
        /* noop */
      }
    }
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}

export const audio = new AudioEngine();
