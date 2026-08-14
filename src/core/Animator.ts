import * as THREE from 'three';
import { easeInOutCubic } from './Tween';

type Ease = (value: number) => number;

interface TweenTarget {
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
}

interface ActiveTween {
  object: THREE.Object3D;
  key: string;
  duration: number;
  elapsed: number;
  ease: Ease;
  from: TweenTarget;
  to: TweenTarget;
  onComplete?: () => void;
}

/**
 * Lightweight transform tween registry that gives every mechanical control a
 * smooth, weighty motion instead of an instant state snap: doors, lockers,
 * freezer glass, crate lids, valves, levers and safety covers all animate
 * through here with eased interpolation and completion callbacks.
 */
export class Animator {
  private tweens = new Map<string, ActiveTween>();

  /** Animates an object's transform toward `target` over `duration` seconds. */
  tween(
    object: THREE.Object3D,
    key: string,
    target: TweenTarget,
    duration = 0.5,
    ease: Ease = easeInOutCubic,
    onComplete?: () => void,
  ): void {
    const from: TweenTarget = {
      position: object.position.clone(),
      rotation: new THREE.Euler(object.rotation.x, object.rotation.y, object.rotation.z, object.rotation.order),
      scale: object.scale.clone(),
    };
    this.tweens.set(key, {
      object,
      key,
      duration: Math.max(0.01, duration),
      elapsed: 0,
      ease,
      from,
      to: target,
      onComplete,
    });
  }

  /** Snaps the object and cancels any in-flight tween for that key. */
  stop(key: string): void {
    this.tweens.delete(key);
  }

  update(delta: number): void {
    for (const [key, tween] of this.tweens) {
      tween.elapsed += delta;
      const progress = Math.min(1, tween.elapsed / tween.duration);
      const eased = tween.ease(progress);
      const o = tween.object;
      if (tween.to.position && tween.from.position) {
        o.position.lerpVectors(tween.from.position, tween.to.position, eased);
      }
      if (tween.to.rotation && tween.from.rotation) {
        o.rotation.set(
          THREE.MathUtils.lerp(tween.from.rotation.x, tween.to.rotation.x, eased),
          THREE.MathUtils.lerp(tween.from.rotation.y, tween.to.rotation.y, eased),
          THREE.MathUtils.lerp(tween.from.rotation.z, tween.to.rotation.z, eased),
        );
      }
      if (tween.to.scale && tween.from.scale) {
        o.scale.lerpVectors(tween.from.scale, tween.to.scale, eased);
      }
      if (progress >= 1) {
        this.tweens.delete(key);
        tween.onComplete?.();
      }
    }
  }
}
