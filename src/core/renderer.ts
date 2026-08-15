/**
 * Renderer — WebGL2 device, ACES tone mapping, soft shadows and the post chain.
 *
 * Lighting philosophy (this is deliberate, see README):
 *   1. A real HDRI drives `scene.environment` through PMREMGenerator so every
 *      PBR surface has something to reflect. That is the primary source of
 *      believable brightness.
 *   2. Physical lights (rect area / spot / directional) provide shaping.
 *   3. Emissive is an *accent* only — glow trim, indicators, hologram — and is
 *      pushed through bloom rather than being used to fake illumination.
 */

import {
  ACESFilmicToneMapping,
  Clock,
  EquirectangularReflectionMapping,
  LinearSRGBColorSpace,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Texture,
  Vector2,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

import { clamp } from './math';
import { WarpDistortShader } from './shaders/warpDistort';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityProfile {
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  anisotropy: number;
  envResolution: number;
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: { pixelRatio: 0.75, shadows: false, shadowMapSize: 1024, bloom: false, anisotropy: 2, envResolution: 128 },
  medium: { pixelRatio: 1.0, shadows: true, shadowMapSize: 1024, bloom: true, anisotropy: 4, envResolution: 256 },
  high: { pixelRatio: 1.35, shadows: true, shadowMapSize: 2048, bloom: true, anisotropy: 8, envResolution: 512 },
};

export class Renderer {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly clock = new Clock();

  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private bloomPass!: UnrealBloomPass;
  private distortPass!: ShaderPass;
  private gammaPass!: ShaderPass;
  private outputPass!: OutputPass;

  private readonly pmrem: PMREMGenerator;
  private readonly envCache = new Map<string, Texture>();
  private readonly hdrLoader = new RGBELoader();

  private scene: Scene | null = null;
  private quality: QualityLevel = 'high';
  private profile: QualityProfile = QUALITY.high;

  /** Screen-shake state, driven by warp / re-entry / touchdown. */
  private shakeAmp = 0;
  private shakeDecay = 1.6;
  private shakeTime = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(0x05070c, 1);

    this.camera = new PerspectiveCamera(65, 1, 0.05, 60000);
    this.camera.position.set(0, 1.7, 0);

    this.pmrem = new PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();

    this.buildComposer();
    this.applyQuality('high');
    this.resize();
  }

  private buildComposer(): void {
    const size = this.renderer.getSize(new Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(new Scene(), this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(new Vector2(size.x, size.y), 0.42, 0.72, 0.85);
    this.composer.addPass(this.bloomPass);

    this.distortPass = new ShaderPass(WarpDistortShader);
    this.distortPass.enabled = false;
    this.composer.addPass(this.distortPass);

    // Bloom works in linear space; convert once at the end.
    this.gammaPass = new ShaderPass(GammaCorrectionShader);
    this.composer.addPass(this.gammaPass);

    this.outputPass = new OutputPass();
    this.outputPass.enabled = false;
    this.composer.addPass(this.outputPass);
  }

  setScene(scene: Scene): void {
    this.scene = scene;
    this.renderPass.scene = scene;
  }

  get activeScene(): Scene | null {
    return this.scene;
  }

  /** Load an equirectangular .hdr and turn it into a PMREM environment map. */
  async loadEnvironment(url: string): Promise<Texture | null> {
    const cached = this.envCache.get(url);
    if (cached) return cached;
    try {
      const hdr = await this.hdrLoader.loadAsync(url);
      hdr.mapping = EquirectangularReflectionMapping;
      hdr.colorSpace = LinearSRGBColorSpace;
      const env = this.pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      this.envCache.set(url, env);
      return env;
    } catch (err) {
      console.warn(`[renderer] HDRI unavailable: ${url}`, err);
      return null;
    }
  }

  applyQuality(level: QualityLevel): void {
    this.quality = level;
    this.profile = QUALITY[level];
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.bloomPass.enabled = this.profile.bloom;
    this.resize();
  }

  get qualityLevel(): QualityLevel {
    return this.quality;
  }

  get qualityProfile(): QualityProfile {
    return this.profile;
  }

  get maxAnisotropy(): number {
    return Math.min(this.profile.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
  }

  setExposure(v: number): void {
    this.renderer.toneMappingExposure = clamp(v, 0.05, 4);
  }

  setBloom(strength: number, radius = 0.72, threshold = 0.85): void {
    this.bloomPass.strength = strength;
    this.bloomPass.radius = radius;
    this.bloomPass.threshold = threshold;
  }

  /** Warp-tunnel radial blur + chromatic aberration. `amount` in 0..1. */
  setDistortion(amount: number, chroma = amount * 0.6): void {
    const active = amount > 0.001;
    this.distortPass.enabled = active;
    if (!active) return;
    this.distortPass.uniforms.uAmount.value = amount;
    this.distortPass.uniforms.uChroma.value = chroma;
  }

  addShake(amplitude: number, decay = 1.6): void {
    this.shakeAmp = Math.max(this.shakeAmp, amplitude);
    this.shakeDecay = decay;
  }

  /** Returns the per-frame positional/rotational shake offset. */
  sampleShake(dt: number): { x: number; y: number; roll: number } {
    if (this.shakeAmp <= 0.00001) return { x: 0, y: 0, roll: 0 };
    this.shakeTime += dt;
    this.shakeAmp = Math.max(0, this.shakeAmp - this.shakeDecay * dt * this.shakeAmp);
    if (this.shakeAmp < 0.00001) this.shakeAmp = 0;
    const t = this.shakeTime;
    const a = this.shakeAmp;
    return {
      x: Math.sin(t * 47.3) * Math.sin(t * 13.1) * a,
      y: Math.cos(t * 39.7) * Math.sin(t * 17.9) * a,
      roll: Math.sin(t * 23.3) * a * 0.6,
    };
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.profile.pixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.distortPass.uniforms.uResolution?.value?.set(w, h);
  }

  render(): void {
    if (!this.scene) return;
    this.composer.render();
  }

  get info() {
    return this.renderer.info;
  }

  dispose(): void {
    this.pmrem.dispose();
    for (const t of this.envCache.values()) t.dispose();
    this.envCache.clear();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
