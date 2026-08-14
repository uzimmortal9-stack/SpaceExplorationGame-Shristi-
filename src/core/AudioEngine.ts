export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private ambient?: GainNode;
  private humNodes: AudioNode[] = [];
  private waterfallGain?: GainNode;
  private environment: 'ship' | 'space' | 'warp' | 'entry' | 'jungle' = 'ship';
  private ambienceTimer = 0;
  private enabled = false;
  private volume = 0.72;

  async start(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.ambient = this.context.createGain();
      this.master.gain.value = this.volume;
      this.ambient.gain.value = 0.12;
      this.ambient.connect(this.master);
      this.master.connect(this.context.destination);
      this.createShipAmbience();
      this.createWaterfallAmbience();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.enabled = true;
  }

  setVolume(value: number): void {
    this.volume = value;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.04);
    }
  }

  private createShipAmbience(): void {
    if (!this.context || !this.ambient) return;
    const low = this.context.createOscillator();
    const upper = this.context.createOscillator();
    const lowGain = this.context.createGain();
    const upperGain = this.context.createGain();
    low.type = 'sine';
    low.frequency.value = 42;
    lowGain.gain.value = 0.22;
    upper.type = 'triangle';
    upper.frequency.value = 83;
    upperGain.gain.value = 0.035;
    low.connect(lowGain).connect(this.ambient);
    upper.connect(upperGain).connect(this.ambient);

    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer(3);
    noise.loop = true;
    const filter = this.context.createBiquadFilter();
    const noiseGain = this.context.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.45;
    noiseGain.gain.value = 0.055;
    noise.connect(filter).connect(noiseGain).connect(this.ambient);
    low.start();
    upper.start();
    noise.start();
    this.humNodes.push(low, upper, noise);
  }

  private createWaterfallAmbience(): void {
    if (!this.context || !this.master) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer(3);
    source.loop = true;
    const lowPass = this.context.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 1350;
    const highPass = this.context.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 110;
    this.waterfallGain = this.context.createGain();
    this.waterfallGain.gain.value = 0;
    source.connect(lowPass).connect(highPass).connect(this.waterfallGain).connect(this.master);
    source.start();
    this.humNodes.push(source);
  }

  private noiseBuffer(seconds = 1): AudioBuffer {
    if (!this.context) throw new Error('Audio context not initialized');
    const frameCount = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < frameCount; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.965 + white * 0.035;
      data[i] = last;
    }
    return buffer;
  }

  setEnvironment(environment: 'ship' | 'space' | 'warp' | 'entry' | 'jungle'): void {
    this.environment = environment;
    this.ambienceTimer = 0;
    if (!this.context || !this.ambient) return;
    const levels = { ship: 0.12, space: 0.055, warp: 0.22, entry: 0.17, jungle: 0.045 };
    this.ambient.gain.setTargetAtTime(levels[environment], this.context.currentTime, 0.6);
    if (environment === 'jungle') this.jungleChirp();
    else this.waterfallGain?.gain.setTargetAtTime(0, this.context.currentTime, 0.3);
  }

  update(delta: number): void {
    if (!this.enabled || this.environment !== 'jungle') return;
    this.ambienceTimer -= delta;
    if (this.ambienceTimer <= 0) {
      this.jungleChirp();
      this.tone(95 + Math.random() * 55, 1.8, 0.012, 'sine', 0.2);
      this.ambienceTimer = 2.8 + Math.random() * 5.5;
    }
  }

  setSurfaceListener(x: number, z: number): void {
    if (!this.context || !this.waterfallGain || this.environment !== 'jungle') return;
    const distance = Math.hypot(x - 22, z - 161);
    const gain = Math.max(0, Math.min(0.17, (1 - distance / 75) * 0.17));
    this.waterfallGain.gain.setTargetAtTime(gain, this.context.currentTime, 0.2);
  }

  tone(frequency: number, duration: number, gain = 0.08, type: OscillatorType = 'sine', delay = 0): void {
    if (!this.enabled || !this.context || !this.master) return;
    const now = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const envelope = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(envelope).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  hover(): void {
    this.tone(1200, 0.035, 0.022, 'sine');
  }

  click(): void {
    this.tone(135, 0.07, 0.09, 'square');
    this.tone(72, 0.1, 0.06, 'triangle', 0.018);
  }

  confirm(): void {
    this.tone(520, 0.09, 0.055, 'sine');
    this.tone(780, 0.13, 0.045, 'sine', 0.075);
  }

  deny(): void {
    this.tone(180, 0.12, 0.07, 'sawtooth');
    this.tone(135, 0.16, 0.055, 'sawtooth', 0.09);
  }

  door(opening: boolean): void {
    if (!this.enabled || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer(0.65);
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(opening ? 420 : 280, now);
    filter.frequency.exponentialRampToValueAtTime(opening ? 1100 : 680, now + 0.45);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.tone(opening ? 630 : 390, 0.07, 0.035, 'square', 0.48);
  }

  footstep(material: 'metal' | 'moss' | 'stone' = 'metal'): void {
    const base = material === 'metal' ? 105 : material === 'stone' ? 72 : 48;
    this.tone(base + Math.random() * 12, 0.055, 0.045, material === 'metal' ? 'square' : 'triangle');
    this.tone(base * 0.52, 0.09, 0.035, 'sine', 0.015);
  }

  warpCharge(progress: number): void {
    if (Math.floor(progress * 20) % 3 === 0) this.tone(90 + progress * 620, 0.08, 0.025, 'sawtooth');
  }

  warpBurst(): void {
    for (let i = 0; i < 10; i += 1) this.tone(85 + i * 90, 0.8 - i * 0.035, 0.035, 'sawtooth', i * 0.025);
  }

  landingImpact(): void {
    this.tone(38, 0.8, 0.2, 'sine');
    this.tone(64, 0.35, 0.11, 'triangle');
  }

  private jungleChirp(): void {
    this.tone(1800 + Math.random() * 600, 0.12, 0.018, 'sine', 0.4);
    this.tone(2300 + Math.random() * 500, 0.08, 0.012, 'sine', 0.55);
  }
}
