/**
 * Descent — atmospheric entry and landing.
 *
 * A scripted but physically-framed sequence with real composed camera shots:
 *
 *   approach   external three-quarter shot, planet filling the frame
 *   entry      plasma sheath builds, camera pushes to a low chase, heavy shake
 *   clouds     the ship punches through a cloud deck, sky colour shifts
 *   descent    the ground is visibly rushing up; gear deploys
 *   flare      nose pitches up, thrusters flare, dust ring blooms
 *   touchdown  contact thump, settle, engines spool down
 *
 * The ship's altitude is genuinely animated against the terrain, so the surface
 * visibly moves relative to the hull throughout — that was an explicit
 * requirement.
 */

import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';

import type { AudioEngine } from '../core/audio';
import { clamp, easeInCubic, easeInOutCubic, easeOutCubic, lerp, smoothstep } from '../core/math';
import type { Renderer } from '../core/renderer';
import type { GameState } from '../core/state';
import type { ShipExterior } from '../world/shipExterior';

export type DescentStage =
  | 'idle' | 'approach' | 'entry' | 'clouds' | 'descent' | 'flare' | 'touchdown' | 'done';

interface StageSpec {
  stage: DescentStage;
  duration: number;
}

const TIMELINE: StageSpec[] = [
  { stage: 'approach', duration: 6.0 },
  { stage: 'entry', duration: 9.0 },
  { stage: 'clouds', duration: 5.0 },
  { stage: 'descent', duration: 8.0 },
  { stage: 'flare', duration: 4.0 },
  { stage: 'touchdown', duration: 3.5 },
];

/** Altitudes (metres above the landing pad) at each stage boundary. */
const ALT_APPROACH = 26000;
const ALT_ENTRY = 12000;
const ALT_CLOUDS = 3400;
const ALT_DESCENT = 420;
const ALT_FLARE = 46;
const ALT_GROUND = 0;

export class DescentSystem {
  readonly group = new Group();
  stage: DescentStage = 'idle';
  /** Metres above the pad; the planet scene reads this for fog/scale. */
  altitude = ALT_APPROACH;
  /** 0..1 how much atmosphere we are in (drives sky blend + audio). */
  atmosphere = 0;

  private index = -1;
  private t = 0;
  private onDone: (() => void) | null = null;
  private readonly plasma: Mesh;
  private readonly dustRing: Mesh;
  private readonly cloudDeck: Group;
  private dustT = -1;
  private shipYaw = 0;

  /** Where the ship lands, in planet-scene coordinates. */
  readonly padPosition = new Vector3(0, 0, 0);

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly renderer: Renderer,
    private readonly audio: AudioEngine,
    private readonly state: GameState,
    private readonly exterior: ShipExterior,
  ) {
    this.group.name = 'descent-fx';
    this.group.visible = false;

    // plasma sheath that wraps the nose during entry
    this.plasma = new Mesh(
      new SphereGeometry(1, 40, 26),
      new MeshBasicMaterial({
        color: 0xff8a3a,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        side: BackSide,
        depthWrite: false,
      }),
    );
    this.plasma.scale.set(46, 22, 96);
    this.group.add(this.plasma);

    // touchdown dust shockwave
    this.dustRing = new Mesh(
      new RingGeometry(2, 8, 64),
      new MeshBasicMaterial({
        color: 0xd8c8a8,
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    this.dustRing.rotation.x = -Math.PI / 2;
    this.group.add(this.dustRing);

    // a cloud deck the ship physically flies through
    this.cloudDeck = new Group();
    for (let i = 0; i < 26; i++) {
      const plane = new Mesh(
        new PlaneGeometry(2600, 2600),
        new MeshBasicMaterial({
          color: new Color().setHSL(0.58, 0.12, 0.86),
          transparent: true,
          opacity: 0.11,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(
        (Math.random() - 0.5) * 2400,
        ALT_CLOUDS + (Math.random() - 0.5) * 1500,
        (Math.random() - 0.5) * 2400,
      );
      this.cloudDeck.add(plane);
    }
    this.group.add(this.cloudDeck);
  }

  get isActive(): boolean {
    return this.stage !== 'idle' && this.stage !== 'done';
  }

  begin(onDone: () => void): void {
    this.stage = 'approach';
    this.index = 0;
    this.t = 0;
    this.altitude = ALT_APPROACH;
    this.onDone = onDone;
    this.group.visible = true;
    this.state.setCinematic(true);
    this.audio.loop('wind', 'wind', 'sfx');
    this.audio.setLoopGain('wind', 0, 0.1);
  }

  private stageAltitudes(stage: DescentStage): [number, number] {
    switch (stage) {
      case 'approach': return [ALT_APPROACH, ALT_ENTRY];
      case 'entry': return [ALT_ENTRY, ALT_CLOUDS];
      case 'clouds': return [ALT_CLOUDS, ALT_DESCENT];
      case 'descent': return [ALT_DESCENT, ALT_FLARE];
      case 'flare': return [ALT_FLARE, ALT_GROUND + 6.6];
      case 'touchdown': return [ALT_GROUND + 6.6, ALT_GROUND];
      default: return [0, 0];
    }
  }

  update(dt: number): void {
    if (!this.isActive) return;

    const spec = TIMELINE[this.index];
    if (!spec) {
      this.finish();
      return;
    }
    this.t += dt;
    const p = clamp(this.t / spec.duration, 0, 1);
    this.stage = spec.stage;

    const [a0, a1] = this.stageAltitudes(spec.stage);
    // ease so the descent decelerates naturally rather than dropping linearly
    const curve =
      spec.stage === 'flare' || spec.stage === 'touchdown' ? easeOutCubic(p) : easeInOutCubic(p);
    this.altitude = lerp(a0, a1, curve);
    this.atmosphere = clamp(1 - this.altitude / ALT_ENTRY, 0, 1);

    const plasmaMat = this.plasma.material as MeshBasicMaterial;
    const shipPos = new Vector3(this.padPosition.x, this.altitude, this.padPosition.z);

    switch (spec.stage) {
      case 'approach': {
        this.exterior.setThrust(0.35);
        this.exterior.setHeat(0);
        // wide three-quarter hero shot, slowly closing in
        const ang = -0.9 + p * 0.5;
        const dist = lerp(420, 240, easeInOutCubic(p));
        this.camera.position.set(
          shipPos.x + Math.cos(ang) * dist,
          shipPos.y + lerp(120, 60, p),
          shipPos.z + Math.sin(ang) * dist,
        );
        this.camera.lookAt(shipPos);
        this.camera.fov = lerp(52, 46, p);
        if (p > 0.5 && this.state.systems.landingGear < 0.01) {
          this.state.subtitle('Ilex Prime. Atmospheric interface in ninety seconds.', 4);
        }
        break;
      }

      case 'entry': {
        this.exterior.setThrust(0.15);
        const heat = Math.sin(p * Math.PI) ** 0.7;
        this.exterior.setHeat(heat);
        plasmaMat.opacity = heat * 0.55;
        (plasmaMat.color as Color).setHSL(lerp(0.075, 0.015, heat), 1, lerp(0.55, 0.62, heat));
        this.plasma.position.copy(shipPos).add(new Vector3(0, 0, -18));
        this.plasma.scale.set(46 + heat * 16, 22 + heat * 10, 96 + heat * 60);

        // camera drops into a tight low chase so the plasma wraps the frame
        const dist = lerp(240, 130, easeInCubic(p));
        const ang = -0.4 - p * 0.35;
        this.camera.position.set(
          shipPos.x + Math.cos(ang) * dist,
          shipPos.y + lerp(60, 22, p),
          shipPos.z + Math.sin(ang) * dist,
        );
        this.camera.lookAt(shipPos);
        this.camera.fov = lerp(46, 68, easeInCubic(p));

        this.renderer.addShake(0.006 + heat * 0.03, 5.0);
        this.renderer.setDistortion(heat * 0.35, heat * 0.3);
        this.audio.setLoopGain('wind', heat * 0.75, 0.4);
        if (p > 0.15 && p < 0.2) {
          this.audio.noiseBurst({ duration: 3.0, gain: 0.3, filter: 240, filterEnd: 1200, attack: 0.8 });
          this.state.subtitle('Hull temperature climbing. Ionisation blackout in three… two…', 4);
        }
        break;
      }

      case 'clouds': {
        this.exterior.setThrust(0.2);
        this.exterior.setHeat(lerp(0.5, 0, p));
        plasmaMat.opacity = lerp(0.3, 0, p);
        this.renderer.setDistortion(lerp(0.2, 0, p), 0);
        this.renderer.addShake(0.012 * (1 - p * 0.6), 4.0);

        // fly the cloud deck past the camera
        this.cloudDeck.position.y = -this.altitude + ALT_CLOUDS;
        for (const c of this.cloudDeck.children) {
          const m = (c as Mesh).material as MeshBasicMaterial;
          m.opacity = 0.16 * (1 - Math.abs(p - 0.5) * 1.4);
        }

        const dist = lerp(130, 110, p);
        this.camera.position.set(shipPos.x + dist * 0.7, shipPos.y + 26, shipPos.z + dist * 0.7);
        this.camera.lookAt(shipPos);
        this.camera.fov = lerp(68, 60, p);
        this.audio.setLoopGain('wind', 0.55, 0.5);
        if (p > 0.7 && p < 0.75) this.state.subtitle('Through the deck. Visual on the canopy.', 3.5);
        break;
      }

      case 'descent': {
        // gear comes down mid-descent, visibly
        const gear = clamp((p - 0.2) / 0.5, 0, 1);
        this.state.systems.landingGear = gear;
        this.exterior.setGear(gear);
        this.exterior.setThrust(0.3 + p * 0.35);
        this.exterior.setHeat(0);
        plasmaMat.opacity = 0;
        this.renderer.setDistortion(0);
        this.renderer.addShake(0.006, 3.0);

        if (p > 0.2 && p < 0.24) {
          this.audio.noiseBurst({ duration: 1.6, gain: 0.3, filter: 700, filterEnd: 200, q: 1.6 });
          this.state.subtitle('Landing gear down and locked.', 3);
        }

        // orbit slowly around the descending hull; the ground rushes up behind
        const ang = 0.6 + p * 1.1;
        const dist = lerp(110, 62, p);
        this.camera.position.set(
          shipPos.x + Math.cos(ang) * dist,
          shipPos.y + lerp(30, 16, p),
          shipPos.z + Math.sin(ang) * dist,
        );
        this.camera.lookAt(shipPos.clone().add(new Vector3(0, -6, 0)));
        this.camera.fov = lerp(60, 55, p);
        this.audio.setLoopGain('wind', lerp(0.5, 0.25, p), 0.6);
        break;
      }

      case 'flare': {
        // nose pitches up, thrusters bite, dust starts to lift
        this.shipYaw = lerp(this.shipYaw, 0.16, dt * 2);
        this.exterior.setThrust(lerp(0.65, 1.0, p));
        this.state.systems.landingGear = 1;
        this.exterior.setGear(1);
        this.renderer.addShake(0.01 + p * 0.012, 3.5);

        const dist = lerp(62, 46, p);
        this.camera.position.set(
          shipPos.x + Math.cos(1.7) * dist,
          shipPos.y + lerp(16, 9, p) + 6,
          shipPos.z + Math.sin(1.7) * dist,
        );
        this.camera.lookAt(shipPos.clone().add(new Vector3(0, -2, 0)));
        this.camera.fov = lerp(55, 58, p);

        this.audio.setLoopGain('wind', lerp(0.25, 0.12, p), 0.5);
        if (p > 0.3 && this.dustT < 0) {
          this.dustT = 0;
          this.audio.noiseBurst({ duration: 2.6, gain: 0.28, filter: 400, filterEnd: 900, attack: 0.5 });
        }
        break;
      }

      case 'touchdown': {
        this.exterior.setThrust(lerp(1.0, 0.0, easeInCubic(p)));
        this.shipYaw = lerp(this.shipYaw, 0, dt * 3);

        if (p > 0.12 && this.dustT < 0.01) this.dustT = 0;

        if (p > 0.14 && p < 0.2) {
          this.audio.impact(1.0);
          this.renderer.addShake(0.05, 2.2);
          this.state.subtitle('Contact. All six struts loaded. Welcome to Ilex Prime.', 5);
        }

        const dist = lerp(46, 40, p);
        this.camera.position.set(
          shipPos.x + Math.cos(2.2) * dist,
          shipPos.y + lerp(9, 7, p) + 4,
          shipPos.z + Math.sin(2.2) * dist,
        );
        this.camera.lookAt(shipPos.clone().add(new Vector3(0, 1, 0)));
        this.camera.fov = lerp(58, 54, p);
        this.audio.setLoopGain('wind', 0.08, 1.2);
        break;
      }

      default:
        break;
    }

    this.camera.updateProjectionMatrix();

    // ship transform for this frame
    this.exterior.group.position.set(this.padPosition.x, this.altitude, this.padPosition.z);
    this.exterior.group.rotation.set(this.shipYaw, 0, 0);
    this.exterior.setVisible(true);
    this.exterior.update(dt);

    // dust ring expansion
    if (this.dustT >= 0) {
      this.dustT += dt;
      const d = clamp(this.dustT / 3.2, 0, 1);
      const ringMat = this.dustRing.material as MeshBasicMaterial;
      this.dustRing.position.set(this.padPosition.x, 0.25, this.padPosition.z);
      this.dustRing.scale.setScalar(1 + d * 9);
      ringMat.opacity = (1 - d) * 0.55;
    }

    if (p >= 1) {
      this.index++;
      this.t = 0;
      if (this.index >= TIMELINE.length) this.finish();
    }
  }

  private finish(): void {
    this.stage = 'done';
    this.altitude = 0;
    this.exterior.setThrust(0);
    this.exterior.setHeat(0);
    this.state.systems.landingGear = 1;
    this.state.hasLanded = true;
    this.renderer.setDistortion(0);
    this.audio.setLoopGain('wind', 0.1, 2.0);
    this.state.setCinematic(false);
    const done = this.onDone;
    this.onDone = null;
    done?.();
    void smoothstep;
    void Quaternion;
  }
}
