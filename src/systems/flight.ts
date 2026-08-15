/**
 * Flight — 6-DOF ship handling with three camera modes.
 *
 * The ship is a rigid body with Newtonian translation and torque-driven
 * rotation, plus an optional flight-assist that bleeds lateral velocity so the
 * handling feels weighty but controllable rather than arcade-twitchy.
 *
 * Cameras:
 *   cockpit  — first person at the pilot seat, hull hidden
 *   chase    — spring-damped follow behind and above
 *   orbital  — slow cinematic orbit for framing shots
 */

import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';

import type { AudioEngine } from '../core/audio';
import type { Input } from '../core/input';
import { clamp, damp, lerp } from '../core/math';
import type { GameState } from '../core/state';
import { PILOT_SEAT } from '../world/ship/layout';

export type CameraMode = 'cockpit' | 'chase' | 'orbital';

const MAX_SPEED = 620;
const BOOST_MULT = 2.7;
const ACCEL = 74;
const PITCH_TORQUE = 1.35;
const YAW_TORQUE = 1.1;
const ROLL_TORQUE = 2.0;
const ANGULAR_DAMP = 0.9;

export class FlightSystem {
  /** Ship transform in world space. */
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  readonly velocity = new Vector3();
  readonly angularVelocity = new Vector3();

  throttle = 0;
  boosting = false;
  flightAssist = true;
  cameraMode: CameraMode = 'cockpit';
  active = false;

  private orbitAngle = 0;
  private readonly camPos = new Vector3();
  private readonly camQuat = new Quaternion();
  private shakeAccum = 0;
  /** Free-look offset while seated in the cockpit. */
  private lookYaw = 0;
  private lookPitch = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly audio: AudioEngine,
    private readonly state: GameState,
  ) {}

  get speed(): number {
    return this.velocity.length();
  }

  get forward(): Vector3 {
    return new Vector3(0, 0, -1).applyQuaternion(this.quaternion);
  }

  /** Enter flight mode; the ship starts where the interior origin is. */
  begin(origin: Vector3, orientation: Quaternion): void {
    this.active = true;
    this.position.copy(origin);
    this.quaternion.copy(orientation);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.camPos.copy(origin);
    this.camQuat.copy(orientation);
    this.audio.loop('engine', 'engine', 'sfx');
    this.audio.setLoopGain('engine', 0.05, 1.2);
  }

  end(): void {
    this.active = false;
    this.throttle = 0;
    this.audio.setLoopGain('engine', 0, 0.8);
  }

  cycleCamera(): CameraMode {
    this.cameraMode =
      this.cameraMode === 'cockpit' ? 'chase' : this.cameraMode === 'chase' ? 'orbital' : 'cockpit';
    this.audio.uiClick();
    return this.cameraMode;
  }

  /** Nudge the ship (used by the warp exit and landing sequences). */
  setTransform(position: Vector3, quaternion: Quaternion): void {
    this.position.copy(position);
    this.quaternion.copy(quaternion);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }

  update(dt: number, input: Input, allowInput: boolean): void {
    if (!this.active) return;

    if (allowInput) {
      // throttle
      const tAxis = input.axis('throttleDown', 'throttleUp');
      this.throttle = clamp(this.throttle + tAxis * dt * 0.72, 0, 1);
      this.boosting = input.isDown('boost') && this.throttle > 0.05;
      if (input.isDown('brake')) {
        this.throttle = lerp(this.throttle, 0, damp(dt, 0.25));
        this.velocity.multiplyScalar(1 - damp(dt, 0.55));
      }
      if (input.wasPressed('cameraCycle')) this.cycleCamera();

      // attitude from mouse + roll keys
      const { dx, dy } = input.consumeMouse();
      this.angularVelocity.x += -dy * PITCH_TORQUE * 5.5;
      this.angularVelocity.y += -dx * YAW_TORQUE * 5.5;
      const roll = (input.isDown('rollLeft') ? 1 : 0) - (input.isDown('rollRight') ? 1 : 0);
      this.angularVelocity.z += roll * ROLL_TORQUE * dt * 3.4;
    }

    // integrate rotation
    const damping = Math.pow(1 - ANGULAR_DAMP, dt);
    this.angularVelocity.multiplyScalar(damping);
    if (this.angularVelocity.lengthSq() > 1e-9) {
      const dq = new Quaternion().setFromEuler(
        new Euler(
          this.angularVelocity.x * dt,
          this.angularVelocity.y * dt,
          this.angularVelocity.z * dt,
          'XYZ',
        ),
      );
      this.quaternion.multiply(dq).normalize();
    }

    // thrust
    const maxSpeed = MAX_SPEED * (this.boosting ? BOOST_MULT : 1);
    const accel = ACCEL * (this.boosting ? BOOST_MULT : 1) * this.throttle;
    if (accel > 0.01) {
      this.velocity.addScaledVector(this.forward, accel * dt);
    }

    // flight assist: bleed off velocity not aligned with the nose
    if (this.flightAssist) {
      const fwd = this.forward;
      const along = fwd.clone().multiplyScalar(this.velocity.dot(fwd));
      const lateral = this.velocity.clone().sub(along);
      this.velocity.sub(lateral.multiplyScalar(damp(dt, 0.9)));
      if (this.throttle < 0.02) this.velocity.multiplyScalar(1 - damp(dt, 2.2));
    }

    if (this.velocity.length() > maxSpeed) this.velocity.setLength(maxSpeed);
    this.position.addScaledVector(this.velocity, dt);

    // audio + haptics scale with output
    const load = this.throttle * (this.boosting ? 1.5 : 1);
    this.audio.setLoopGain('engine', 0.05 + load * 0.5, 0.35);
    this.shakeAccum = lerp(this.shakeAccum, load * 0.0035, damp(dt, 0.3));

    this.updateCamera(dt, input, allowInput);
    this.state.systems.fuel = clamp(
      this.state.systems.fuel - dt * load * 0.0012,
      0,
      1,
    );
  }

  private updateCamera(dt: number, input: Input, allowInput: boolean): void {
    const cam = this.camera;

    if (this.cameraMode === 'cockpit') {
      // Seat sits at the interior's pilot chair, transformed into world space.
      const seatLocal = new Vector3(PILOT_SEAT.x, 1.32, PILOT_SEAT.z + 0.15);
      const target = seatLocal.clone().applyQuaternion(this.quaternion).add(this.position);
      this.camPos.lerp(target, damp(dt, 0.05));

      // small free-look so the pilot can glance around the cockpit
      if (allowInput) {
        this.lookYaw = lerp(this.lookYaw, 0, damp(dt, 0.6));
        this.lookPitch = lerp(this.lookPitch, 0, damp(dt, 0.6));
      }
      const look = new Quaternion().setFromEuler(new Euler(this.lookPitch, this.lookYaw, 0, 'YXZ'));
      this.camQuat.slerp(this.quaternion.clone().multiply(look), damp(dt, 0.06));
      cam.position.copy(this.camPos);
      cam.quaternion.copy(this.camQuat);
      cam.fov = lerp(cam.fov, this.boosting ? 82 : 70, damp(dt, 0.25));
    } else if (this.cameraMode === 'chase') {
      const offset = new Vector3(0, 34, 172).applyQuaternion(this.quaternion);
      const target = this.position.clone().add(offset);
      this.camPos.lerp(target, damp(dt, 0.22));
      const lookAt = this.position.clone().addScaledVector(this.forward, 90);
      cam.position.copy(this.camPos);
      cam.lookAt(lookAt);
      this.camQuat.copy(cam.quaternion);
      cam.fov = lerp(cam.fov, this.boosting ? 78 : 66, damp(dt, 0.3));
    } else {
      this.orbitAngle += dt * 0.14;
      if (allowInput) this.orbitAngle += input.consumeWheel() * 0.06;
      const dist = 300;
      const off = new Vector3(
        Math.cos(this.orbitAngle) * dist,
        95,
        Math.sin(this.orbitAngle) * dist,
      );
      this.camPos.lerp(this.position.clone().add(off), damp(dt, 0.3));
      cam.position.copy(this.camPos);
      cam.lookAt(this.position);
      this.camQuat.copy(cam.quaternion);
      cam.fov = lerp(cam.fov, 52, damp(dt, 0.4));
    }
    cam.updateProjectionMatrix();
  }

  get engineShake(): number {
    return this.shakeAccum;
  }

  /** Distance to a world point, for the target readout. */
  distanceTo(p: Vector3): number {
    return this.position.distanceTo(p);
  }
}
