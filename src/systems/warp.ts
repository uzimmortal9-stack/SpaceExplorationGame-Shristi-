/**
 * Warp — spin-up, tunnel and exit.
 *
 * The tunnel is a real screen-space effect stack: a streaked star volume that
 * the ship physically flies through, plus the renderer's radial-blur /
 * chromatic-aberration pass and an FOV push. Camera shake, light pulses and a
 * rising audio bed carry the build-up.
 */

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';

import type { AudioEngine } from '../core/audio';
import { clamp, easeInCubic, easeOutCubic, lerp, rng, smoothstep } from '../core/math';
import type { Renderer } from '../core/renderer';
import type { GameState } from '../core/state';

export type WarpStage = 'idle' | 'charging' | 'ready' | 'tunnel' | 'exit';

const CHARGE_TIME = 9.0;
const TUNNEL_TIME = 7.5;
const EXIT_TIME = 3.2;

export class WarpSystem {
  readonly group = new Group();
  stage: WarpStage = 'idle';
  /** 0..1 through the current stage. */
  progress = 0;

  private readonly streaks: Points;
  private readonly tunnel: Mesh;
  private readonly flash: Mesh;
  private t = 0;
  private onComplete: (() => void) | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly audio: AudioEngine,
    private readonly state: GameState,
  ) {
    this.group.name = 'warp-fx';
    this.group.visible = false;

    // ---- streaking star volume ---------------------------------------------
    const COUNT = 2600;
    const r = rng(0x77aa);
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const c = new Color();
    for (let i = 0; i < COUNT; i++) {
      const a = r() * Math.PI * 2;
      const rad = 12 + Math.pow(r(), 0.6) * 210;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = Math.sin(a) * rad;
      pos[i * 3 + 2] = (r() - 0.5) * 2400;
      c.setHSL(0.53 + r() * 0.12, 0.85, 0.6 + r() * 0.3);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    this.streaks = new Points(
      geo,
      new PointsMaterial({
        size: 3.4,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.streaks.frustumCulled = false;
    this.group.add(this.streaks);

    // ---- the tunnel wall -----------------------------------------------------
    this.tunnel = new Mesh(
      new CylinderGeometry(240, 240, 2600, 64, 24, true),
      new MeshBasicMaterial({
        color: 0x2ad0ff,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        side: BackSide,
        depthWrite: false,
        wireframe: true,
      }),
    );
    this.tunnel.rotation.x = Math.PI / 2;
    this.tunnel.frustumCulled = false;
    this.group.add(this.tunnel);

    // ---- entry/exit flash ----------------------------------------------------
    this.flash = new Mesh(
      new CylinderGeometry(1, 1, 1, 8),
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: BackSide,
      }),
    );
    this.flash.scale.setScalar(600);
    this.flash.frustumCulled = false;
    this.group.add(this.flash);
  }

  get isActive(): boolean {
    return this.stage !== 'idle';
  }

  /** Begin core spin-up. Resolves when the drive is ready for the lever. */
  beginCharge(): void {
    if (this.stage !== 'idle') return;
    this.stage = 'charging';
    this.t = 0;
    this.progress = 0;
    this.audio.loop('warp', 'warp', 'sfx');
    this.audio.setLoopGain('warp', 0.04, 1.5);
    this.state.toast('Warp core spinning up', 'info');
  }

  /** Fire the jump; called by the physical lever. */
  engage(onComplete: () => void): boolean {
    if (this.stage !== 'ready' && this.stage !== 'charging') return false;
    this.stage = 'tunnel';
    this.t = 0;
    this.progress = 0;
    this.onComplete = onComplete;
    this.group.visible = true;
    this.audio.setLoopGain('warp', 0.85, 0.5);
    this.audio.noiseBurst({ duration: 2.2, gain: 0.4, filter: 300, filterEnd: 5200, attack: 0.6, q: 0.7 });
    this.renderer.addShake(0.05, 0.6);
    return true;
  }

  abort(): void {
    this.stage = 'idle';
    this.group.visible = false;
    this.progress = 0;
    this.state.systems.warpCharge = 0;
    this.audio.stopLoop('warp', 1.2);
    this.renderer.setDistortion(0);
  }

  update(dt: number, shipPosition: Vector3, shipQuat: { x: number; y: number; z: number; w: number }): void {
    if (this.stage === 'idle') return;
    this.t += dt;

    const streakMat = this.streaks.material as PointsMaterial;
    const tunnelMat = this.tunnel.material as MeshBasicMaterial;
    const flashMat = this.flash.material as MeshBasicMaterial;

    // keep the effect volume glued to the ship
    this.group.position.copy(shipPosition);
    this.group.quaternion.set(shipQuat.x, shipQuat.y, shipQuat.z, shipQuat.w);

    switch (this.stage) {
      case 'charging': {
        this.progress = clamp(this.t / CHARGE_TIME, 0, 1);
        this.state.systems.warpCharge = this.progress;
        this.audio.setLoopGain('warp', 0.04 + this.progress * 0.4, 0.4);
        this.renderer.addShake(this.progress * 0.006, 3.5);
        if (this.progress >= 1) {
          this.stage = 'ready';
          this.audio.uiConfirm();
          this.state.toast('WARP CORE READY — pull the lever', 'good');
        }
        break;
      }

      case 'ready': {
        this.state.systems.warpCharge = 1;
        this.renderer.addShake(0.004, 3.0);
        break;
      }

      case 'tunnel': {
        this.progress = clamp(this.t / TUNNEL_TIME, 0, 1);
        const p = this.progress;
        // ramp in over the first 18%, hold, ramp out over the last 15%
        const intensity =
          p < 0.18 ? easeInCubic(p / 0.18) : p > 0.85 ? 1 - easeInCubic((p - 0.85) / 0.15) : 1;

        streakMat.opacity = intensity * 0.95;
        streakMat.size = 3.0 + intensity * 12;
        tunnelMat.opacity = intensity * 0.16;
        this.tunnel.rotation.y += dt * (2.0 + intensity * 5);
        this.streaks.position.z = -((this.t * 900) % 2400);

        this.renderer.setDistortion(intensity * 0.95, intensity * 0.8);
        this.renderer.addShake(0.008 + intensity * 0.02, 4.0);

        // entry and exit flash
        flashMat.opacity =
          p < 0.07 ? (1 - p / 0.07) * 0.7 : p > 0.93 ? ((p - 0.93) / 0.07) * 0.85 : 0;

        this.audio.setLoopGain('warp', 0.35 + intensity * 0.55, 0.3);

        if (this.progress >= 1) {
          this.stage = 'exit';
          this.t = 0;
          this.audio.setLoopGain('warp', 0.1, 1.0);
          this.audio.noiseBurst({ duration: 2.0, gain: 0.3, filter: 5000, filterEnd: 300, attack: 0.05 });
        }
        break;
      }

      case 'exit': {
        this.progress = clamp(this.t / EXIT_TIME, 0, 1);
        const fade = 1 - easeOutCubic(this.progress);
        streakMat.opacity = fade * 0.4;
        tunnelMat.opacity = fade * 0.06;
        flashMat.opacity = fade * 0.25;
        this.renderer.setDistortion(fade * 0.35, fade * 0.2);
        this.state.systems.warpCharge = lerp(1, 0, this.progress);

        if (this.progress >= 1) {
          this.stage = 'idle';
          this.group.visible = false;
          this.renderer.setDistortion(0);
          this.audio.stopLoop('warp', 2.0);
          this.state.systems.warpCharge = 0;
          const done = this.onComplete;
          this.onComplete = null;
          done?.();
        }
        break;
      }
    }
    void smoothstep;
  }
}
