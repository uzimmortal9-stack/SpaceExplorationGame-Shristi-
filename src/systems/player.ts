/**
 * Player — first-person capsule controller.
 *
 * Handles walk/sprint/crouch/jump with smooth accel-decel, gravity, head bob,
 * footstep audio keyed to the surface, a helmet lamp, and the seated state used
 * by the pilot chair (camera eases into the seat rather than snapping).
 */

import { Object3D, PerspectiveCamera, SpotLight, Vector3 } from 'three';

import type { AudioEngine } from '../core/audio';
import type { Input } from '../core/input';
import { clamp, damp, easeInOutCubic, lerp } from '../core/math';
import type { CollisionWorld } from './collision';

const EYE_STAND = 1.66;
const EYE_CROUCH = 0.98;
const RADIUS = 0.34;
const HEIGHT_STAND = 1.78;
const HEIGHT_CROUCH = 1.12;
const GRAVITY = 18.5;
const JUMP_SPEED = 5.4;

export type PlayerMode = 'walking' | 'seated' | 'transition' | 'frozen';

export interface SeatTarget {
  /** World position the camera settles at. */
  position: Vector3;
  /** Yaw/pitch the camera eases to. */
  yaw: number;
  pitch: number;
  /** Where the player stands when they get up. */
  exit: Vector3;
}

export class Player {
  readonly position = new Vector3(0, 0, 0);
  readonly velocity = new Vector3();
  yaw = 0;
  pitch = 0;

  mode: PlayerMode = 'walking';
  grounded = false;
  crouching = false;
  sprinting = false;
  /** Set false in zero-g / seated states. */
  gravityEnabled = true;
  /** Multiplies walk speed (e.g. slower in a suit). */
  speedScale = 1;

  readonly lamp: SpotLight;
  lampOn = false;

  private eyeHeight = EYE_STAND;
  private bobPhase = 0;
  private bobAmount = 0;
  private stepAccumulator = 0;
  private landingImpulse = 0;

  private seat: SeatTarget | null = null;
  private transition = 0;
  private transitionDuration = 0.85;
  private transitionFrom = { pos: new Vector3(), yaw: 0, pitch: 0 };
  private transitionTo: SeatTarget | null = null;
  private transitionExiting = false;
  private onTransitionEnd: (() => void) | null = null;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly collision: CollisionWorld,
    private readonly audio: AudioEngine,
  ) {
    this.lamp = new SpotLight(0xdfeaff, 0, 22, Math.PI / 7, 0.45, 1.1);
    this.lamp.castShadow = false;
    this.lamp.target = new Object3D();
  }

  get height(): number {
    return this.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;
  }

  get eye(): Vector3 {
    return new Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  teleport(x: number, y: number, z: number, yaw = this.yaw): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.mode = 'walking';
    this.seat = null;
  }

  /** Begin the smooth sit-down transition. */
  sit(target: SeatTarget, onDone?: () => void): void {
    if (this.mode !== 'walking') return;
    this.transitionFrom.pos.copy(this.eye);
    this.transitionFrom.yaw = this.yaw;
    this.transitionFrom.pitch = this.pitch;
    this.transitionTo = target;
    this.transitionExiting = false;
    this.transition = 0;
    this.mode = 'transition';
    this.onTransitionEnd = () => {
      this.seat = target;
      this.mode = 'seated';
      onDone?.();
    };
  }

  /** Begin the smooth stand-up transition. */
  stand(onDone?: () => void): void {
    if (this.mode !== 'seated' || !this.seat) return;
    const seat = this.seat;
    this.transitionFrom.pos.copy(this.camera.position);
    this.transitionFrom.yaw = this.yaw;
    this.transitionFrom.pitch = this.pitch;
    this.transitionTo = {
      position: new Vector3(seat.exit.x, seat.exit.y + EYE_STAND, seat.exit.z),
      yaw: this.yaw,
      pitch: 0,
      exit: seat.exit,
    };
    this.transitionExiting = true;
    this.transition = 0;
    this.mode = 'transition';
    this.onTransitionEnd = () => {
      this.position.set(seat.exit.x, seat.exit.y, seat.exit.z);
      this.velocity.set(0, 0, 0);
      this.seat = null;
      this.mode = 'walking';
      onDone?.();
    };
  }

  /** Look input is shared by walking and seated states. */
  private applyLook(input: Input, limitPitch = 1.45): void {
    const { dx, dy } = input.consumeMouse();
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -limitPitch, limitPitch);
  }

  update(dt: number, input: Input, allowLook: boolean): void {
    if (this.mode === 'transition') {
      this.updateTransition(dt);
      return;
    }

    if (allowLook) this.applyLook(input, this.mode === 'seated' ? 1.0 : 1.45);

    if (this.mode === 'seated') {
      const seat = this.seat;
      if (seat) {
        // stay put; the flight system may nudge the seat with the ship
        this.camera.position.copy(seat.position);
      }
      this.applyCameraRotation();
      return;
    }

    if (this.mode === 'frozen') {
      this.applyCameraRotation();
      return;
    }

    this.updateWalking(dt, input);
  }

  private updateTransition(dt: number): void {
    const to = this.transitionTo;
    if (!to) {
      this.mode = 'walking';
      return;
    }
    this.transition = Math.min(1, this.transition + dt / this.transitionDuration);
    const t = easeInOutCubic(this.transition);
    this.camera.position.lerpVectors(this.transitionFrom.pos, to.position, t);
    // shortest-arc yaw blend
    let dyaw = to.yaw - this.transitionFrom.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw = this.transitionFrom.yaw + dyaw * t;
    this.pitch = lerp(this.transitionFrom.pitch, to.pitch, t);
    this.applyCameraRotation();

    if (this.transition >= 1) {
      const done = this.onTransitionEnd;
      this.onTransitionEnd = null;
      this.transitionTo = null;
      if (this.transitionExiting) this.eyeHeight = EYE_STAND;
      done?.();
    }
  }

  private updateWalking(dt: number, input: Input): void {
    const wantCrouch = input.isDown('crouch');
    if (wantCrouch !== this.crouching) {
      if (!wantCrouch) {
        // only stand if there is headroom
        const probe = this.position.clone();
        if (!this.collision.overlaps(probe, RADIUS, HEIGHT_STAND)) this.crouching = false;
      } else {
        this.crouching = true;
      }
    }

    this.sprinting = input.isDown('sprint') && !this.crouching && this.grounded;

    const forward = input.axis('back', 'forward');
    const strafe = input.axis('left', 'right');
    const hasInput = forward !== 0 || strafe !== 0;

    const baseSpeed = this.crouching ? 1.9 : this.sprinting ? 6.1 : 3.5;
    const speed = baseSpeed * this.speedScale;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // -Z is forward in three.js camera space
    let wishX = -sin * forward + cos * strafe;
    let wishZ = -cos * forward - sin * strafe;
    const len = Math.hypot(wishX, wishZ);
    if (len > 1e-5) {
      wishX /= len;
      wishZ /= len;
    }

    const targetVX = wishX * speed;
    const targetVZ = wishZ * speed;
    // Air control is deliberately weaker so jumps feel weighty.
    const accelHalfLife = this.grounded ? (hasInput ? 0.055 : 0.075) : 0.35;
    const k = damp(dt, accelHalfLife);
    this.velocity.x = lerp(this.velocity.x, targetVX, k);
    this.velocity.z = lerp(this.velocity.z, targetVZ, k);

    if (this.gravityEnabled) this.velocity.y -= GRAVITY * dt;
    else this.velocity.y = lerp(this.velocity.y, 0, damp(dt, 0.3));

    if (input.wasPressed('jump') && this.grounded && !this.crouching) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
      this.audio.noiseBurst({ duration: 0.12, gain: 0.06, filter: 700, filterEnd: 300 });
    }

    const wasGrounded = this.grounded;
    const res = this.collision.move(this.position, this.velocity, RADIUS, this.height, dt);
    this.position.copy(res.position);
    const nowGrounded = res.grounded;

    if (!wasGrounded && nowGrounded) {
      const impact = clamp(Math.abs(this.velocity.y) / 12, 0, 1);
      this.landingImpulse = impact * 0.16;
      if (impact > 0.12) this.audio.footstep(this.collision.surfaceAt(this.position.x, this.position.z));
    }
    this.grounded = nowGrounded;

    // ---- head bob + footsteps ----------------------------------------------
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = this.grounded && planarSpeed > 0.4;
    this.bobAmount = lerp(this.bobAmount, moving ? clamp(planarSpeed / 6, 0.15, 1) : 0, damp(dt, 0.12));
    if (moving) {
      const cadence = this.sprinting ? 9.4 : this.crouching ? 4.2 : 6.6;
      this.bobPhase += dt * cadence;
      this.stepAccumulator += planarSpeed * dt;
      const stride = this.sprinting ? 2.35 : 1.75;
      if (this.stepAccumulator >= stride) {
        this.stepAccumulator = 0;
        this.audio.footstep(this.collision.surfaceAt(this.position.x, this.position.z));
      }
    } else {
      this.stepAccumulator = 0;
    }

    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eyeHeight = lerp(this.eyeHeight, targetEye, damp(dt, 0.09));
    this.landingImpulse = lerp(this.landingImpulse, 0, damp(dt, 0.12));

    const bobY = Math.sin(this.bobPhase * 2) * 0.032 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.022 * this.bobAmount;
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    this.camera.position.set(
      this.position.x + rightX * bobX,
      this.position.y + this.eyeHeight + bobY - this.landingImpulse,
      this.position.z + rightZ * bobX,
    );
    this.applyCameraRotation(Math.sin(this.bobPhase) * 0.006 * this.bobAmount);

    if (input.wasPressed('flashlight')) {
      this.lampOn = !this.lampOn;
      this.audio.switchClunk();
    }
    this.updateLamp();
  }

  private applyCameraRotation(roll = 0): void {
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = roll;
  }

  private updateLamp(): void {
    this.lamp.intensity = this.lampOn ? 26 : 0;
    if (!this.lampOn) return;
    this.lamp.position.copy(this.camera.position);
    const dir = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.lamp.target.position.copy(this.camera.position).add(dir.multiplyScalar(8));
    this.lamp.target.updateMatrixWorld();
  }

  /** Keep the seated camera glued to a moving seat (ship in flight). */
  syncSeat(position: Vector3): void {
    if (this.seat) this.seat.position.copy(position);
  }

  get isSeated(): boolean {
    return this.mode === 'seated';
  }
}
