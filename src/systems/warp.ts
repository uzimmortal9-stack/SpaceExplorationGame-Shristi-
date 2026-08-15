import * as THREE from "three";
import { smoothstep } from "../core/math";
import { audio } from "../core/audio";

export type WarpPhase = "idle" | "spinup" | "tunnel" | "exit" | "done";

/**
 * WarpSystem — scripted warp sequence. Produces screen effects (shake, FOV,
 * chromatic tint, streaks) and positions the ship near the target on exit.
 */
export class WarpSystem {
  phase: WarpPhase = "idle";
  private t = 0;
  private baseFov = 70;
  shake = 0;
  fov = 70;
  tint = 0; // 0..1 chroma
  private onArrive: (() => void) | null = null;

  /** Begin warp toward a target (position drives the exit placement in the caller). */
  start(_targetWorld: THREE.Vector3, onArrive: () => void): void {
    this.onArrive = onArrive;
    this.phase = "spinup";
    this.t = 0;
    audio.warpSpin(0);
  }

  /** If idle, no sequence. */
  get isActive(): boolean {
    return this.phase === "spinup" || this.phase === "tunnel" || this.phase === "exit";
  }

  update(dt: number): void {
    if (!this.isActive) return;
    this.t += dt;
    if (this.phase === "spinup") {
      const k = smoothstep(0, 4, this.t);
      this.shake = k * 0.02;
      this.fov = this.baseFov + k * 8;
      this.tint = k * 0.3;
      audio.warpSpin(k);
      if (this.t >= 4) {
        this.phase = "tunnel";
        this.t = 0;
        audio.warpWhoosh();
      }
    } else if (this.phase === "tunnel") {
      const k = this.t / 6;
      this.shake = 0.05 + k * 0.02;
      this.fov = this.baseFov + 14 + k * 10;
      this.tint = 0.6 + Math.sin(this.t * 20) * 0.2;
      if (this.t >= 6) {
        this.phase = "exit";
        this.t = 0;
        audio.warpExit();
      }
    } else if (this.phase === "exit") {
      const k = smoothstep(0, 2.5, this.t);
      this.shake = (1 - k) * 0.05;
      this.fov = this.baseFov + (1 - k) * 16;
      this.tint = (1 - k) * 0.7;
      if (this.t >= 2.5) {
        this.phase = "done";
        this.fov = this.baseFov;
        this.shake = 0;
        this.tint = 0;
        if (this.onArrive) this.onArrive();
      }
    }
  }

  stop(): void {
    this.phase = "idle";
    this.fov = this.baseFov;
    this.shake = 0;
    this.tint = 0;
  }
}
