import * as THREE from 'three';
import type { DynamicSystem } from '../types';

interface PulseEntry {
  material: THREE.MeshStandardMaterial;
  base: number;
  amplitude: number;
  speed: number;
  phase: number;
}

interface SpinEntry {
  object: THREE.Object3D;
  axis: THREE.Vector3;
  speed: number;
}

export class AmbientSystem implements DynamicSystem {
  private pulses: PulseEntry[] = [];
  private spins: SpinEntry[] = [];
  private floaters: { object: THREE.Object3D; baseY: number; phase: number; amplitude: number; speed: number }[] = [];

  pulse(material: THREE.MeshStandardMaterial, base = 1, amplitude = 1, speed = 1.5, phase = Math.random() * Math.PI * 2): void {
    this.pulses.push({ material, base, amplitude, speed, phase });
  }

  spin(object: THREE.Object3D, axis = new THREE.Vector3(0, 1, 0), speed = 0.4): void {
    this.spins.push({ object, axis: axis.clone().normalize(), speed });
  }

  float(object: THREE.Object3D, amplitude = 0.08, speed = 1.2): void {
    this.floaters.push({ object, baseY: object.position.y, phase: Math.random() * Math.PI * 2, amplitude, speed });
  }

  update(delta: number, elapsed: number): void {
    for (const entry of this.pulses) entry.material.emissiveIntensity = entry.base + Math.sin(elapsed * entry.speed + entry.phase) * entry.amplitude;
    for (const entry of this.spins) entry.object.rotateOnAxis(entry.axis, entry.speed * delta);
    for (const entry of this.floaters) entry.object.position.y = entry.baseY + Math.sin(elapsed * entry.speed + entry.phase) * entry.amplitude;
  }
}
