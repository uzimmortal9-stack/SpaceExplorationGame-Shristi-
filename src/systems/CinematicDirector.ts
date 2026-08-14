import * as THREE from 'three';
import { easeInOutCubic, smoothstep } from '../core/Tween';

/**
 * Cinematic director: composes and cuts between authored camera shots for the
 * warp spin-up/tunnel/exit and atmospheric entry/landing sequences. Each shot
 * is a keyframed position + look-target + field-of-view that eases with the
 * sequence progress, plus handheld drift and phase-scaled shake.
 *
 * The director writes its framing into the ship's chase camera each frame, so
 * the existing warp/entry effect systems and the active-camera selection keep
 * working without a parallel render pipeline.
 */
export type DirectorShot =
  | 'warp-charge'
  | 'warp-tunnel'
  | 'warp-exit'
  | 'entry-plasma'
  | 'entry-clouds'
  | 'entry-gear'
  | 'entry-landing';

interface Keyframe {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  shake: number;
}

const SHOTS: Record<DirectorShot, { from: Keyframe; to: Keyframe }> = {
  'warp-charge': {
    from: { position: new THREE.Vector3(-56, 22, 96), target: new THREE.Vector3(0, 1.5, -12), fov: 62, shake: 0.02 },
    to: { position: new THREE.Vector3(-16, 4.4, 30), target: new THREE.Vector3(0, 1.6, -26), fov: 53, shake: 0.05 },
  },
  'warp-tunnel': {
    from: { position: new THREE.Vector3(-2, 1.7, -12), target: new THREE.Vector3(0, 1.5, -150), fov: 60, shake: 0.08 },
    to: { position: new THREE.Vector3(-1, 1.55, 2), target: new THREE.Vector3(0, 1.4, -180), fov: 78, shake: 0.11 },
  },
  'warp-exit': {
    from: { position: new THREE.Vector3(-3, 2.2, -20), target: new THREE.Vector3(0, 1.2, -40), fov: 70, shake: 0.04 },
    to: { position: new THREE.Vector3(46, 14, 122), target: new THREE.Vector3(0, 1.2, -34), fov: 55, shake: 0.01 },
  },
  'entry-plasma': {
    from: { position: new THREE.Vector3(-44, 16, 74), target: new THREE.Vector3(0, 0.5, -36), fov: 64, shake: 0.07 },
    to: { position: new THREE.Vector3(-26, 8.5, 46), target: new THREE.Vector3(0, 0, -34), fov: 58, shake: 0.05 },
  },
  'entry-clouds': {
    from: { position: new THREE.Vector3(-25, 7.5, 42), target: new THREE.Vector3(0, 0, -30), fov: 58, shake: 0.03 },
    to: { position: new THREE.Vector3(-19, 4.6, 28), target: new THREE.Vector3(0, -0.5, -28), fov: 54, shake: 0.02 },
  },
  'entry-gear': {
    from: { position: new THREE.Vector3(-30, 6, 44), target: new THREE.Vector3(0, -0.5, -6), fov: 56, shake: 0.01 },
    to: { position: new THREE.Vector3(28, 5.2, 42), target: new THREE.Vector3(0, -0.5, -4), fov: 56, shake: 0.01 },
  },
  'entry-landing': {
    from: { position: new THREE.Vector3(-34, 10, 64), target: new THREE.Vector3(0, -1.5, 18), fov: 58, shake: 0.04 },
    to: { position: new THREE.Vector3(20, 4.2, 50), target: new THREE.Vector3(0, -2.2, 24), fov: 50, shake: 0.03 },
  },
};

const tmpFrom = new THREE.Vector3();
const tmpTo = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

export class CinematicDirector {
  private elapsed = 0;

  /** Writes the composed framing for `shot` into `camera`. */
  frame(camera: THREE.PerspectiveCamera, shot: DirectorShot, progress: number, delta: number, motion: number): void {
    this.elapsed += delta;
    const definition = SHOTS[shot];
    const t = progress >= 1 ? 1 : smoothstep(Math.min(1, Math.max(0, progress)));
    tmpFrom.copy(definition.from.position);
    tmpTo.copy(definition.to.position);
    tmpTarget.copy(definition.from.target).lerp(definition.to.target, t);
    camera.position.lerpVectors(tmpFrom, tmpTo, t);
    camera.lookAt(tmpTarget);
    camera.fov = THREE.MathUtils.lerp(definition.from.fov, definition.to.fov, t);

    // Subtle handheld drift keeps the shots alive without nausea.
    const drift = 0.18 * motion;
    camera.position.x += Math.sin(this.elapsed * 0.7) * drift;
    camera.position.y += Math.cos(this.elapsed * 0.9) * drift * 0.6;

    const shake = THREE.MathUtils.lerp(definition.from.shake, definition.to.shake, t) * motion;
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake * 0.8;
    camera.rotation.z += (Math.random() - 0.5) * shake * 0.4;

    camera.updateProjectionMatrix();
  }

  /** Eases the chase camera back to its neutral follow when a sequence ends. */
  settle(camera: THREE.PerspectiveCamera, delta: number): void {
    camera.fov = THREE.MathUtils.lerp(camera.fov, 70, Math.min(1, delta * 3));
    camera.updateProjectionMatrix();
  }
}
