import * as THREE from "three";
import { Input } from "../core/input";
import { damp, clamp } from "../core/math";
import { audio } from "../core/audio";

export type CameraMode = "cockpit" | "chase" | "orbital";

/**
 * FlightSystem — 6-DOF ship flight. The shipGroup carries the interior +
 * exterior; the cockpit camera is a child of the ship so it moves with it.
 */
export class FlightSystem {
  mode: CameraMode = "cockpit";
  speed = 0;
  throttle = 0;
  maxSpeed = 260;
  dampeners = true;
  boosting = false;
  fuel = 100;
  hull = 100;
  thrustIntensity = 0;

  private vel = new THREE.Vector3();
  private bank = 0;

  constructor(readonly shipGroup: THREE.Group, readonly forward: THREE.Vector3 = new THREE.Vector3(0, 0, -1)) {}

  sitIn(camera: THREE.PerspectiveCamera): void {
    camera.position.set(0, 1.5, -9.2);
    camera.quaternion.set(0, 0, 0, 1);
    this.shipGroup.add(camera);
    this.shipGroup.updateMatrixWorld(true);
  }

  stand(camera: THREE.PerspectiveCamera): void {
    if (this.shipGroup.children.includes(camera)) this.shipGroup.remove(camera);
  }

  setOrientationFrom(camera: THREE.PerspectiveCamera): void {
    // when standing, camera returns to player
    void camera;
  }

  update(dt: number, input: Input, cam: THREE.PerspectiveCamera): void {
    // rotational inputs
    let pitch = 0;
    let yaw = 0;
    let roll = 0;
    if (input.down("i") || input.down("arrowup")) pitch += 1;
    if (input.down("k") || input.down("arrowdown")) pitch -= 1;
    if (input.down("j") || input.down("arrowleft")) yaw += 1;
    if (input.down("l") || input.down("arrowright")) yaw -= 1;
    if (input.down("q")) roll += 1;
    if (input.down("e")) roll -= 1;

    // mouse look adds pitch/yaw
    const look = input.consumeLook();
    yaw += look.yaw * 0.6;
    pitch -= look.pitch * 0.6;

    const sens = 1.1;
    const quat = this.shipGroup.quaternion;
    const e = new THREE.Euler();
    e.setFromQuaternion(quat, "YXZ");
    e.y += yaw * sens * dt;
    e.x += pitch * sens * dt;
    e.z = damp(e.z, roll * 1.4, 4, dt);
    // auto level roll slowly when dampeners on
    if (this.dampeners) e.z = damp(e.z, 0, 1.2, dt);
    quat.setFromEuler(e);

    // throttle
    if (input.down("shift") && input.down("w")) this.boosting = true;
    else this.boosting = false;
    if (input.down("w")) this.throttle = damp(this.throttle, 1, 1.2, dt);
    else if (input.down("s")) this.throttle = damp(this.throttle, -0.35, 1.5, dt);
    else this.throttle = damp(this.throttle, 0, 1.0, dt);

    // compute forward in world
    const fwd = this.forward.clone().applyQuaternion(quat).normalize();
    const target = fwd.clone().multiplyScalar(this.maxSpeed * (this.boosting ? 1.8 : 1) * this.throttle);
    const dampCoef = this.dampeners ? 0.5 : 0.15;
    this.vel.lerp(target, 1 - Math.exp(-dampCoef * dt));
    this.speed = this.vel.length();
    this.thrustIntensity = clamp(Math.abs(this.throttle) * (this.boosting ? 1.5 : 1), 0, 1);

    // integrate position
    this.shipGroup.position.addScaledVector(this.vel, dt);
    this.shipGroup.position.y = clamp(this.shipGroup.position.y, -900, 900);

    // subtle bank visual
    this.bank = damp(this.bank, roll * 0.4 + yaw * -0.3, 3, dt);

    // fuel burn
    if (Math.abs(this.throttle) > 0.01) this.fuel = clamp(this.fuel - dt * 0.05, 0, 100);

    if (Math.abs(this.throttle) > 0.02) audio.engineThrust(this.thrustIntensity);
    void cam;
  }

  /** Point ship toward a world direction (used by warp/landing scripts). */
  lookToward(worldTarget: THREE.Vector3, dt: number, strength = 2): void {
    const dir = worldTarget.clone().sub(this.shipGroup.position).normalize();
    const targetQuat = new THREE.Quaternion();
    targetQuat.setFromUnitVectors(this.forward, dir);
    this.shipGroup.quaternion.slerp(targetQuat, 1 - Math.exp(-strength * dt));
  }

  get position(): THREE.Vector3 {
    return this.shipGroup.position;
  }

  get forwardWorld(): THREE.Vector3 {
    return this.forward.clone().applyQuaternion(this.shipGroup.quaternion).normalize();
  }
}
