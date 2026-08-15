import * as THREE from "three";
import { clamp, smoothstep } from "../core/math";
import { audio } from "../core/audio";

export type LandingPhase = "idle" | "entry" | "cloud" | "descent" | "touchdown" | "landed";

/**
 * LandingSystem — scripted atmospheric entry + landing. Drives the ship down
 * onto the jungle terrain with plasma re-entry, a cloud-canopy transition, and
 * a touchdown dust impact.
 */
export class LandingSystem {
  phase: LandingPhase = "idle";
  private t = 0;
  private startPos = new THREE.Vector3();
  private endPos = new THREE.Vector3();
  private ship: THREE.Object3D;
  private onLanded: (() => void) | null = null;
  private cloudOpacity = 0;
  shake = 0;
  heat = 0;

  constructor(ship: THREE.Object3D, private scene: THREE.Scene, private jungle: THREE.Object3D, private planet: THREE.Object3D) {
    this.ship = ship;
  }

  start(landSite: THREE.Vector3, onLanded: () => void): void {
    this.onLanded = onLanded;
    this.startPos = this.ship.position.clone();
    this.endPos = landSite.clone();
    this.endPos.y = 0;
    this.phase = "entry";
    this.t = 0;
    this.cloudOpacity = 0;
    // reveal jungle at landing site, hide the planet sphere
    this.planet.visible = false;
    this.jungle.visible = true;
    this.jungle.position.copy(this.endPos);
    this.scene.add(this.jungle);
    audio.reentry(0.1);
  }

  get isActive(): boolean {
    return this.phase !== "idle" && this.phase !== "landed";
  }

  update(dt: number): void {
    if (!this.isActive) return;
    this.t += dt;
    switch (this.phase) {
      case "entry": {
        const k = smoothstep(0, 7, this.t);
        this.heat = 0.3 + k * 0.7;
        this.shake = k * 0.05;
        // fast descent, angled nose-up slightly
        const p = new THREE.Vector3().lerpVectors(this.startPos, this.endPos.clone().setY(120), k);
        this.ship.position.copy(p);
        this.ship.lookAt(p.x, p.y - 100, p.z);
        audio.reentry(k);
        if (this.t >= 7) {
          this.phase = "cloud";
          this.t = 0;
        }
        break;
      }
      case "cloud": {
        const k = smoothstep(0, 2.5, this.t);
        this.cloudOpacity = k;
        this.shake = 0.05 * (1 - k * 0.4);
        this.heat = (1 - k) * 0.6;
        const p = new THREE.Vector3().lerpVectors(this.endPos.clone().setY(120), this.endPos.clone().setY(55), k);
        this.ship.position.copy(p);
        if (this.t >= 2.5) {
          this.phase = "descent";
          this.t = 0;
        }
        break;
      }
      case "descent": {
        const k = smoothstep(0, 6, this.t);
        this.heat = 0.05 + (1 - k) * 0.2;
        this.shake = 0.03 * (1 - k);
        const p = new THREE.Vector3().lerpVectors(this.endPos.clone().setY(55), this.endPos.clone().setY(3), k);
        this.ship.position.copy(p);
        this.ship.lookAt(p.x, p.y - 60, p.z);
        audio.engineThrust(0.6 + k * 0.3);
        if (this.t >= 6) {
          this.phase = "touchdown";
          this.t = 0;
          audio.gearDeploy();
        }
        break;
      }
      case "touchdown": {
        const k = smoothstep(0, 2, this.t);
        this.ship.position.y = clamp(this.endPos.y + (3 - k * 3), this.endPos.y, 3);
        this.ship.rotation.set(0, this.ship.rotation.y, 0);
        if (k > 0.85 && !this.impacted) {
          this.impacted = true;
          this.dustBurst = 1;
          audio.touchdown();
        }
        this.dustBurst = Math.max(0, this.dustBurst - dt);
        this.shake = this.impacted ? Math.max(0, 0.05 - (k - 0.85) * 0.2) : 0;
        if (this.t >= 2.5) {
          this.phase = "landed";
          this.shake = 0;
          this.heat = 0;
          if (this.onLanded) this.onLanded();
        }
        break;
      }
    }
  }

  private impacted = false;
  dustBurst = 0;

  /** Cloud overlay alpha for the HUD post effect. */
  get cloud(): number {
    return this.cloudOpacity;
  }

  stop(): void {
    this.phase = "idle";
    this.shake = 0;
    this.heat = 0;
    this.cloudOpacity = 0;
  }
}
