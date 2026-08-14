import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { AudioEngine } from '../core/AudioEngine';
import type { CollisionSystem } from '../world/CollisionSystem';
import type { GameSettings } from '../types';
import { damp } from '../core/Tween';

export class PlayerController {
  readonly rig = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  readonly position = new THREE.Vector3(0, 0, 50);
  velocity = new THREE.Vector3();
  yaw = Math.PI;
  pitch = 0;
  enabled = false;
  noclip = false;
  flashlightOn = false;
  onSurface = false;
  private input: Input;
  private collision: CollisionSystem;
  private audio: AudioEngine;
  private settings: GameSettings;
  private verticalVelocity = 0;
  private grounded = true;
  private eyeHeight = 1.68;
  private bobPhase = 0;
  private stepPhase = 0;
  private flashlight: THREE.SpotLight;

  constructor(input: Input, collision: CollisionSystem, audio: AudioEngine, settings: GameSettings) {
    this.input = input;
    this.collision = collision;
    this.audio = audio;
    this.settings = settings;
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 220000);
    this.camera.rotation.order = 'YXZ';
    this.flashlight = new THREE.SpotLight(0xc8f7ff, 0, 22, Math.PI * 0.2, 0.5, 1.3);
    this.flashlight.position.set(0.14, -0.08, 0);
    this.flashlight.target.position.set(0, 0, -4);
    this.camera.add(this.flashlight, this.flashlight.target);
    this.rig.add(this.camera);
  }

  setSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  teleport(x: number, y: number, z: number, yaw?: number): void {
    this.position.set(x, y, z);
    if (yaw !== undefined) this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.syncCamera(0);
  }

  setSurface(active: boolean): void {
    this.onSurface = active;
  }

  update(delta: number): void {
    if (!this.enabled) return;
    const sensitivity = this.settings.sensitivity * 0.0017;
    this.yaw -= this.input.mouseDX * sensitivity;
    this.pitch -= this.input.mouseDY * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI * 0.48, Math.PI * 0.48);

    const crouching = this.input.down('ControlLeft') || this.input.down('KeyC');
    const targetEyeHeight = crouching ? 1.06 : 1.68;
    this.eyeHeight = damp(this.eyeHeight, targetEyeHeight, 14, delta);

    const xInput = Number(this.input.down('KeyD')) - Number(this.input.down('KeyA'));
    const zInput = Number(this.input.down('KeyS')) - Number(this.input.down('KeyW'));
    const moving = Math.abs(xInput) + Math.abs(zInput) > 0;
    const sprint = this.input.down('ShiftLeft') && !crouching;
    const maxSpeed = crouching ? 1.65 : sprint ? (this.onSurface ? 7.2 : 5.9) : this.onSurface ? 4.2 : 3.35;

    const desired = new THREE.Vector3(xInput, 0, zInput);
    if (desired.lengthSq() > 0) {
      desired.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).multiplyScalar(maxSpeed);
    }
    this.velocity.x = damp(this.velocity.x, desired.x, moving ? 14 : 9, delta);
    this.velocity.z = damp(this.velocity.z, desired.z, moving ? 14 : 9, delta);

    if (this.noclip) {
      const vertical = Number(this.input.down('Space')) - Number(this.input.down('ControlLeft'));
      this.position.y += vertical * maxSpeed * delta;
      this.position.addScaledVector(this.velocity, delta);
    } else {
      if (this.input.consume('Space') && this.grounded && !crouching) {
        this.verticalVelocity = this.onSurface ? 6.1 : 5.2;
        this.grounded = false;
      }
      this.verticalVelocity -= (this.onSurface ? 13.5 : 14.8) * delta;
      const next = this.position.clone().addScaledVector(this.velocity, delta);
      this.collision.resolveHorizontal(next, crouching ? 0.31 : 0.36, next.y, next.y + this.eyeHeight);
      this.position.x = next.x;
      this.position.z = next.z;
      this.position.y += this.verticalVelocity * delta;
      const floor = this.collision.floorAt(this.position.x, this.position.z, 0);
      if (this.position.y <= floor) {
        this.position.y = floor;
        this.verticalVelocity = 0;
        this.grounded = true;
      }
    }

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && horizontalSpeed > 0.45) {
      this.bobPhase += delta * horizontalSpeed * (sprint ? 2.5 : 2.15);
      this.stepPhase += delta * horizontalSpeed;
      const interval = sprint ? 2.45 : 2.05;
      if (this.stepPhase > interval) {
        this.stepPhase = 0;
        this.audio.footstep(this.collision.materialAt(this.position));
      }
    } else {
      this.bobPhase = damp(this.bobPhase, Math.round(this.bobPhase / Math.PI) * Math.PI, 8, delta);
      this.stepPhase = 0;
    }

    if (this.input.consume('KeyF')) {
      this.flashlightOn = !this.flashlightOn;
      this.flashlight.intensity = this.flashlightOn ? 18 : 0;
      this.audio.click();
    }
    this.syncCamera(horizontalSpeed);
  }

  private syncCamera(speed: number): void {
    const motion = this.settings.motion;
    const bobX = this.grounded && speed > 0.4 ? Math.sin(this.bobPhase * 0.5) * 0.018 * motion : 0;
    const bobY = this.grounded && speed > 0.4 ? Math.abs(Math.sin(this.bobPhase)) * 0.028 * motion : 0;
    this.rig.position.copy(this.position);
    this.camera.position.set(bobX, this.eyeHeight + bobY, 0);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
