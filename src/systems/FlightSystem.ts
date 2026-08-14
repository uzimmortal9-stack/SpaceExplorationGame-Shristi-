import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { GameSettings } from '../types';
import type { SpaceEnvironment } from '../world/SpaceEnvironment';
import type { ShipInterior, FlightTelemetry } from '../world/ShipInterior';
import type { ShipExterior } from '../world/ShipExterior';
import type { AudioEngine } from '../core/AudioEngine';
import { damp } from '../core/Tween';
import { CollimatedHUD } from './CollimatedHUD';

export type FlightCameraMode = 'cockpit' | 'chase' | 'orbital';

export class FlightSystem {
  readonly shipPosition = new THREE.Vector3();
  readonly shipOrientation = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();
  readonly chaseCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 220000);
  readonly orbitalCamera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 220000);
  active = false;
  thrustArmed = false;
  dampeners = true;
  gearDeployed = false;
  cameraMode: FlightCameraMode = 'cockpit';
  throttle = 0;
  fuel = 100;
  hull = 100;
  altitude = 0;
  private input: Input;
  private settings: GameSettings;
  private space: SpaceEnvironment;
  private interior: ShipInterior;
  private exterior: ShipExterior;
  private audio: AudioEngine;
  private hud: CollimatedHUD;
  private cockpitCamera: THREE.PerspectiveCamera;
  private angularVelocity = new THREE.Vector3();
  private orbitalAngle = 0;
  private boost = 0;
  private telemetry: FlightTelemetry;
  private navUpdateTimer = 0;
  private onToast: (message: string) => void;

  constructor(
    scene: THREE.Scene,
    cockpitCamera: THREE.PerspectiveCamera,
    input: Input,
    settings: GameSettings,
    space: SpaceEnvironment,
    interior: ShipInterior,
    exterior: ShipExterior,
    audio: AudioEngine,
    onToast: (message: string) => void,
  ) {
    this.cockpitCamera = cockpitCamera;
    this.input = input;
    this.settings = settings;
    this.space = space;
    this.interior = interior;
    this.exterior = exterior;
    this.audio = audio;
    this.onToast = onToast;
    this.hud = new CollimatedHUD(scene);
    this.telemetry = {
      speed: 0, throttle: 0, fuel: 100, hull: 100, target: space.selectedTarget.name,
      distance: space.selectedTarget.distance, locked: false, warp: 'STANDBY', gear: false, altitude: 0,
    };
  }

  setSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.hud.update(this.cockpitCamera, new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1), false);
  }

  armThrust(): void {
    this.thrustArmed = true;
    this.audio.confirm();
  }

  setTarget(index: number): void {
    const target = this.space.selectTarget(index);
    this.telemetry.target = target.name;
    this.telemetry.distance = target.distance;
    this.telemetry.locked = true;
    this.interior.setTargetDisplay(target.name, target.distance, true);
    this.audio.confirm();
  }

  update(delta: number, allowInput = true): void {
    if (!this.active) return;
    if (allowInput) this.handleInput(delta);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.shipOrientation);
    const desiredSpeed = this.thrustArmed ? this.throttle * 480 + this.boost * 520 : 0;
    const forwardVelocity = forward.clone().multiplyScalar(desiredSpeed);
    if (this.dampeners) this.velocity.lerp(forwardVelocity, 1 - Math.exp(-delta * 1.25));
    else this.velocity.addScaledVector(forward, this.throttle * 52 * delta);
    this.shipPosition.addScaledVector(this.velocity, delta);
    this.fuel = Math.max(0, this.fuel - Math.abs(this.throttle) * delta * 0.011 - this.boost * delta * 0.035);
    this.space.setObserver(this.shipPosition, this.shipOrientation);
    this.exterior.setThrust(Math.max(0, this.throttle) * 0.65 + this.boost * 0.35);

    const target = this.space.selectedTarget;
    const liveDistance = target.position.distanceTo(this.shipPosition) / 1000;
    this.telemetry.distance = liveDistance;
    this.navUpdateTimer += delta;
    if (this.telemetry.locked && this.navUpdateTimer > 0.24) {
      this.navUpdateTimer = 0;
      this.interior.setTargetDisplay(target.name, liveDistance, true);
    }
    const targetWorldDirection = target.position.clone().sub(this.shipPosition).applyQuaternion(this.shipOrientation.clone().invert()).normalize();
    const localVelocity = this.velocity.clone().applyQuaternion(this.shipOrientation.clone().invert());
    const physicalTargetDirection = targetWorldDirection;
    const physicalVelocityDirection = localVelocity.lengthSq() > 0.01 ? localVelocity.normalize() : new THREE.Vector3(0, 0, -1);
    this.hud.update(this.activeCamera, physicalTargetDirection, physicalVelocityDirection, this.cameraMode === 'cockpit');

    this.updateCameras(delta);
    this.telemetry.speed = this.velocity.length();
    this.telemetry.throttle = Math.abs(this.throttle) * 100;
    this.telemetry.fuel = this.fuel;
    this.telemetry.hull = this.hull;
    this.telemetry.gear = this.gearDeployed;
    this.telemetry.altitude = this.altitude;
    this.interior.setTelemetry(this.telemetry);
  }

  private handleInput(delta: number): void {
    if (this.input.down('KeyW')) this.throttle += delta * 0.34;
    if (this.input.down('KeyS')) this.throttle -= delta * 0.42;
    this.throttle = THREE.MathUtils.clamp(this.throttle, -0.35, 1);
    if (!this.thrustArmed && (this.input.down('KeyW') || this.input.down('KeyS'))) this.throttle = 0;

    this.boost = damp(this.boost, this.input.down('ShiftLeft') && this.thrustArmed ? 1 : 0, 5, delta);
    const sensitivity = this.settings.sensitivity * 0.00036;
    const targetPitch = -this.input.mouseDY * sensitivity / Math.max(delta, 0.008);
    const targetYaw = -this.input.mouseDX * sensitivity / Math.max(delta, 0.008);
    const targetRoll = (Number(this.input.down('KeyQ')) - Number(this.input.down('KeyE'))) * 0.72;
    this.angularVelocity.x = damp(this.angularVelocity.x, targetPitch, 7, delta);
    this.angularVelocity.y = damp(this.angularVelocity.y, targetYaw, 7, delta);
    this.angularVelocity.z = damp(this.angularVelocity.z, targetRoll, 5, delta);
    const euler = new THREE.Euler(this.angularVelocity.x * delta, this.angularVelocity.y * delta, this.angularVelocity.z * delta, 'YXZ');
    this.shipOrientation.multiply(new THREE.Quaternion().setFromEuler(euler)).normalize();

    if (this.input.consume('KeyX')) {
      this.dampeners = !this.dampeners;
      this.audio.click();
      this.onToast(`FLIGHT DAMPENERS // ${this.dampeners ? 'ENABLED' : 'DISABLED'}`);
    }
    if (this.input.consume('KeyC')) this.cycleCamera();
    if (this.input.consume('KeyG')) {
      this.gearDeployed = !this.gearDeployed;
      this.exterior.setGear(this.gearDeployed);
      this.audio.click();
      this.onToast(`LANDING GEAR // ${this.gearDeployed ? 'DEPLOYED' : 'RETRACTED'}`);
    }
  }

  private updateCameras(delta: number): void {
    const shake = this.boost * this.settings.motion;
    this.cockpitCamera.position.x = -1.65 + (Math.random() - 0.5) * 0.01 * shake;
    this.cockpitCamera.position.y = 1.62 + (Math.random() - 0.5) * 0.008 * shake;
    this.cockpitCamera.position.z = -56.65;
    this.cockpitCamera.rotation.set(this.angularVelocity.x * 0.025, this.angularVelocity.y * 0.02, -this.angularVelocity.z * 0.085, 'YXZ');
    this.cockpitCamera.fov = damp(this.cockpitCamera.fov, 68 + this.boost * 7, 4, delta);
    this.cockpitCamera.updateProjectionMatrix();

    this.chaseCamera.position.set(0, 11, 92);
    this.chaseCamera.lookAt(0, 1.5, 36);
    this.chaseCamera.rotation.z = -this.angularVelocity.z * 0.12;
    this.orbitalAngle += delta * 0.11;
    this.orbitalCamera.position.set(Math.cos(this.orbitalAngle) * 74, 31 + Math.sin(this.orbitalAngle * 0.6) * 8, 25 + Math.sin(this.orbitalAngle) * 74);
    this.orbitalCamera.lookAt(0, 1.2, 7);
  }

  private cycleCamera(): void {
    const order: FlightCameraMode[] = ['cockpit', 'chase', 'orbital'];
    this.cameraMode = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.audio.confirm();
    this.onToast(`OPTICAL FEED // ${this.cameraMode.toUpperCase()}`);
  }

  get activeCamera(): THREE.PerspectiveCamera {
    if (this.cameraMode === 'chase') return this.chaseCamera;
    if (this.cameraMode === 'orbital') return this.orbitalCamera;
    return this.cockpitCamera;
  }

  setAspect(aspect: number): void {
    for (const camera of [this.chaseCamera, this.orbitalCamera]) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
  }

  setWarpStatus(status: string): void {
    this.telemetry.warp = status;
    this.hud.setWarp(status !== 'STANDBY' && status !== 'COOLDOWN');
  }

  arriveAtSelectedTarget(): void {
    const target = this.space.selectedTarget;
    this.shipPosition.copy(this.space.placeObserverNearTarget(target));
    const approachDirection = target.position.clone().sub(this.shipPosition).normalize();
    this.shipOrientation.setFromUnitVectors(new THREE.Vector3(0, 0, -1), approachDirection);
    this.velocity.set(0, 0, 0);
    this.throttle = 0;
    this.space.setObserver(this.shipPosition, this.shipOrientation);
  }

  reset(): void {
    this.shipPosition.set(0, 0, 0);
    this.shipOrientation.identity();
    this.velocity.set(0, 0, 0);
    this.throttle = 0;
    this.fuel = 100;
    this.thrustArmed = false;
    this.gearDeployed = false;
    this.cameraMode = 'cockpit';
  }
}
