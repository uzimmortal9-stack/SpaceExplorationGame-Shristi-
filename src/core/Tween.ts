import * as THREE from 'three';

export function damp(current: number, target: number, smoothing: number, delta: number): number {
  return THREE.MathUtils.damp(current, target, smoothing, delta);
}

export function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function smoothstep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}
