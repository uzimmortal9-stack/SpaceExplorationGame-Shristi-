import * as THREE from "three";
import { Input } from "../core/input";
import { CollisionWorld } from "./collision";
import { clamp, damp } from "../core/math";

export interface TerrainSampler {
  heightAt(x: number, z: number): number;
}

/**
 * PlayerController — first-person movement. In the ship the player walks on
 * the floor (y=0) with wall collision; on the planet the player walks on the
 * sampled terrain height with no wall boxes (trees handled by collision boxes).
 */
export class PlayerController {
  readonly pos = new THREE.Vector3(0, 0, 0);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = true;
  eyeHeight = 1.65;
  radius = 0.34;
  crouched = false;
  speed = 4.0;

  private terrain: TerrainSampler | null = null;
  private footstepTimer = 0;
  private material = "metal";

  constructor(private collision: CollisionWorld, private input: Input) {}

  setTerrain(sampler: TerrainSampler | null): void {
    this.terrain = sampler;
  }
  setMaterial(m: string): void {
    this.material = m;
  }
  get groundMaterial(): string {
    return this.material;
  }

  teleport(x: number, y: number, z: number, yaw?: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
  }

  /** Advance the player one frame; returns {moved, footstep} events. */
  update(dt: number, lookYaw: number, lookPitch: number, worldScale = 1): { moved: boolean; step: boolean } {
    // look
    this.yaw += lookYaw;
    this.pitch = clamp(this.pitch + lookPitch, -Math.PI / 2, Math.PI / 2);

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let mx = 0;
    let mz = 0;
    if (this.input.down("w")) mz += 1;
    if (this.input.down("s")) mz -= 1;
    if (this.input.down("a")) mx -= 1;
    if (this.input.down("d")) mx += 1;

    const sprinting = this.input.down("shift");
    const running = this.input.down("ctrl") || this.crouched;
    let speed = this.speed * (sprinting ? 1.7 : running ? 0.5 : 1);

    const move = new THREE.Vector3(right.x * mx + forward.x * mz, 0, right.z * mx + forward.z * mz);
    if (move.lengthSq() > 0) move.normalize();

    // Horizontal acceleration
    const targetVx = move.x * speed * worldScale;
    const targetVz = move.z * speed * worldScale;
    this.vel.x = damp(this.vel.x, targetVx, 9, dt);
    this.vel.z = damp(this.vel.z, targetVz, 9, dt);

    // Gravity / vertical
    const g = 9.81 * worldScale;
    if (this.onGround) {
      this.vel.y = 0;
      if (this.input.justPressed(" ")) {
        this.vel.y = 4.2 * worldScale;
        this.onGround = false;
      }
    } else {
      this.vel.y -= g * dt;
    }

    // Integrate
    this.pos.x += this.vel.x * dt;
    this.resolveAxis(0);
    this.pos.z += this.vel.z * dt;
    this.resolveAxis(2);
    this.pos.y += this.vel.y * dt;

    // Ground
    if (this.terrain) {
      const th = this.terrain.heightAt(this.pos.x, this.pos.z);
      if (this.pos.y <= th) {
        this.pos.y = th;
        this.vel.y = 0;
        this.onGround = true;
      }
    } else {
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vel.y = 0;
        this.onGround = true;
      }
    }

    // Footsteps
    this.footstepTimer -= dt;
    let step = false;
    const moving = move.lengthSq() > 0.01 && this.onGround;
    if (moving && this.footstepTimer <= 0) {
      this.footstepTimer = sprinting ? 0.32 : 0.46;
      step = true;
    }
    return { moved: moving, step };
  }

  private resolveAxis(axis: 0 | 2): void {
    for (let pass = 0; pass < 3; pass++) {
      const r = this.collision.resolveCircle(this.pos.x, this.pos.y, this.pos.z, this.radius, this.crouched ? 1.2 : 1.8);
      if (!r.hit) break;
      if (axis === 0) {
        this.pos.x += r.nx * 0.5;
      } else {
        this.pos.z += r.nz * 0.5;
      }
    }
  }

  get eyePos(): THREE.Vector3 {
    const h = this.eyeHeight * (this.crouched ? 0.62 : 1);
    return this.pos.clone().setY(this.pos.y + h);
  }
}
