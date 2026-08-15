/**
 * Doors — automatic bi-parting sliding doors with hydraulics and safety.
 *
 * Behaviour:
 *   * Opens automatically when the player enters the trigger radius.
 *   * Stays open while anything occupies the doorway (obstruction safety) and
 *     re-opens instantly if the player steps back in while closing.
 *   * The collider is disabled only once the leaves are far enough apart, so
 *     the player can never be pushed through geometry.
 *   * Airlocks use `interlock` so an outer door refuses to open while the inner
 *     one is not fully sealed.
 */

import { Box3, Object3D, Vector3 } from 'three';

import type { AudioEngine } from '../core/audio';
import { clamp, easeInOutCubic } from '../core/math';
import type { Collider, CollisionWorld } from './collision';

export type DoorState = 'closed' | 'opening' | 'open' | 'closing' | 'locked';

export interface DoorConfig {
  id: string;
  /** Left and right (or single) leaf nodes. */
  leaves: Object3D[];
  /** Local axis each leaf slides along, in metres at full open. */
  travel: Vector3[];
  /** World-space centre of the doorway. */
  center: Vector3;
  collider?: Collider;
  triggerRadius?: number;
  /** Doorway volume used for the obstruction check. */
  clearance: Box3;
  autoOpen?: boolean;
  openTime?: number;
  holdTime?: number;
  locked?: boolean;
  /** This door refuses to open while the referenced door is not closed. */
  interlock?: string;
  onStateChange?: (state: DoorState) => void;
}

export class Door {
  state: DoorState;
  private t = 0;
  private holdTimer = 0;
  private readonly rest: Vector3[];
  private lastAudible: DoorState | null = null;

  constructor(readonly cfg: DoorConfig, private readonly audio: AudioEngine) {
    this.state = cfg.locked ? 'locked' : 'closed';
    this.rest = cfg.leaves.map((l) => l.position.clone());
  }

  get id(): string {
    return this.cfg.id;
  }

  get openAmount(): number {
    return this.t;
  }

  get isPassable(): boolean {
    return this.t > 0.55;
  }

  lock(locked: boolean): void {
    if (locked) {
      this.state = 'locked';
    } else if (this.state === 'locked') {
      this.state = this.t > 0.99 ? 'open' : 'closed';
    }
  }

  requestOpen(): void {
    if (this.state === 'locked') return;
    if (this.state === 'closed' || this.state === 'closing') this.state = 'opening';
    this.holdTimer = this.cfg.holdTime ?? 1.6;
  }

  requestClose(): void {
    if (this.state === 'open' || this.state === 'opening') this.state = 'closing';
  }

  update(
    dt: number,
    playerPos: Vector3,
    playerRadius: number,
    playerHeight: number,
    doors: Map<string, Door>,
  ): void {
    const cfg = this.cfg;
    const dist = playerPos.distanceTo(cfg.center);
    const trigger = cfg.triggerRadius ?? 3.4;
    const blocked = cfg.clearance.intersectsBox(
      new Box3(
        new Vector3(playerPos.x - playerRadius, playerPos.y, playerPos.z - playerRadius),
        new Vector3(playerPos.x + playerRadius, playerPos.y + playerHeight, playerPos.z + playerRadius),
      ),
    );

    if (this.state !== 'locked') {
      const interlockOk = !cfg.interlock || (doors.get(cfg.interlock)?.t ?? 0) < 0.02;
      const wantOpen = (cfg.autoOpen ?? true) && dist < trigger && interlockOk;

      if (wantOpen || blocked) {
        if (interlockOk || blocked) {
          if (this.state === 'closed' || this.state === 'closing') this.state = 'opening';
          this.holdTimer = cfg.holdTime ?? 1.6;
        }
      } else if (this.state === 'open') {
        this.holdTimer -= dt;
        if (this.holdTimer <= 0) this.state = 'closing';
      }

      // Safety: never close on the player.
      if (this.state === 'closing' && blocked) this.state = 'opening';
    }

    const speed = 1 / (cfg.openTime ?? 1.0);
    if (this.state === 'opening') {
      this.t = clamp(this.t + dt * speed, 0, 1);
      if (this.t >= 1) this.state = 'open';
    } else if (this.state === 'closing') {
      this.t = clamp(this.t - dt * speed, 0, 1);
      if (this.t <= 0) this.state = 'closed';
    } else if (this.state === 'locked') {
      this.t = clamp(this.t - dt * speed, 0, 1);
    }

    // audio triggers on state edges only
    if (this.state !== this.lastAudible) {
      if (this.state === 'opening') this.audio.doorSlide(true);
      else if (this.state === 'closing') this.audio.doorSlide(false);
      this.lastAudible = this.state;
      cfg.onStateChange?.(this.state);
    }

    const e = easeInOutCubic(this.t);
    for (let i = 0; i < cfg.leaves.length; i++) {
      const leaf = cfg.leaves[i];
      const travel = cfg.travel[i] ?? cfg.travel[0];
      leaf.position.copy(this.rest[i]).addScaledVector(travel, e);
    }

    if (cfg.collider) cfg.collider.enabled = this.t < 0.55;
  }
}

export class DoorSystem {
  readonly doors = new Map<string, Door>();

  constructor(private readonly audio: AudioEngine, private readonly collision: CollisionWorld) {}

  add(cfg: DoorConfig): Door {
    const door = new Door(cfg, this.audio);
    this.doors.set(cfg.id, door);
    return door;
  }

  get(id: string): Door | undefined {
    return this.doors.get(id);
  }

  clear(): void {
    this.doors.clear();
  }

  update(dt: number, playerPos: Vector3, radius: number, height: number): void {
    for (const d of this.doors.values()) d.update(dt, playerPos, radius, height, this.doors);
    void this.collision;
  }
}
