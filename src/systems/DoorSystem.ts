import * as THREE from 'three';
import type { AudioEngine } from '../core/AudioEngine';
import type { BoxCollider, CollisionSystem } from '../world/CollisionSystem';
import { normalizedBox } from '../world/geometryAlignment';
import { COLORS, emissive, metal } from '../world/materials';
import { damp } from '../core/Tween';

interface Door {
  id: string;
  group: THREE.Group;
  left: THREE.Mesh;
  right: THREE.Mesh;
  center: THREE.Vector3;
  axis: 'x' | 'z';
  progress: number;
  target: number;
  collider: BoxCollider;
  sounded: boolean;
  locked: boolean;
}

export class DoorSystem {
  readonly doors: Door[] = [];
  private collision: CollisionSystem;
  private audio: AudioEngine;

  constructor(collision: CollisionSystem, audio: AudioEngine) {
    this.collision = collision;
    this.audio = audio;
  }

  create(id: string, center: THREE.Vector3, axis: 'x' | 'z' = 'x', width = 2.7, height = 2.75): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(center);
    const panelMaterial = metal(0x344752, 0.34, 0.88);
    const panelWidth = width * 0.49;
    const left = new THREE.Mesh(normalizedBox(panelWidth, height, 0.16, 'floor'), panelMaterial.clone());
    const right = new THREE.Mesh(normalizedBox(panelWidth, height, 0.16, 'floor'), panelMaterial.clone());
    left.position.set(-panelWidth * 0.51, 0, 0);
    right.position.set(panelWidth * 0.51, 0, 0);
    if (axis === 'z') group.rotation.y = Math.PI / 2;

    const stripeGeometry = normalizedBox(0.035, height * 0.75, 0.18, 'floor');
    const stripeL = new THREE.Mesh(stripeGeometry, emissive(COLORS.cyan, 1.7));
    const stripeR = stripeL.clone();
    stripeL.position.set(panelWidth * 0.37, height * 0.12, 0);
    stripeR.position.set(-panelWidth * 0.37, height * 0.12, 0);
    left.add(stripeL);
    right.add(stripeR);

    const lintel = new THREE.Mesh(normalizedBox(width + 0.5, 0.22, 0.4, 'center'), metal(0x121d24, 0.45, 0.85));
    lintel.position.y = height + 0.11;
    const status = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.08), emissive(COLORS.cyan, 2.5));
    status.position.set(0, 0, 0.24);
    lintel.add(status);
    group.add(left, right, lintel);

    const thickness = 0.24;
    const min = axis === 'x'
      ? new THREE.Vector3(center.x - width / 2, center.y, center.z - thickness / 2)
      : new THREE.Vector3(center.x - thickness / 2, center.y, center.z - width / 2);
    const max = axis === 'x'
      ? new THREE.Vector3(center.x + width / 2, center.y + height, center.z + thickness / 2)
      : new THREE.Vector3(center.x + thickness / 2, center.y + height, center.z + width / 2);
    const collider = this.collision.addBox(`door:${id}`, min, max);
    this.doors.push({ id, group, left, right, center: center.clone(), axis, progress: 0, target: 0, collider, sounded: false, locked: false });
    return group;
  }

  setLocked(id: string, locked: boolean): void {
    const door = this.doors.find((entry) => entry.id === id);
    if (door) door.locked = locked;
  }

  open(id: string): void {
    const door = this.doors.find((entry) => entry.id === id);
    if (door && !door.locked) door.target = 1;
  }

  update(delta: number, playerPosition: THREE.Vector3): void {
    for (const door of this.doors) {
      const local = playerPosition.clone().sub(door.center);
      const along = door.axis === 'x' ? Math.abs(local.x) : Math.abs(local.z);
      const across = door.axis === 'x' ? Math.abs(local.z) : Math.abs(local.x);
      const nearby = along < 2.15 && across < 2.8;
      const obstruction = along < 1.65 && across < 0.75;
      door.target = !door.locked && (nearby || obstruction) ? 1 : 0;
      if (Math.abs(door.target - door.progress) > 0.12 && !door.sounded) {
        this.audio.door(door.target > door.progress);
        door.sounded = true;
      }
      if (Math.abs(door.target - door.progress) < 0.05) door.sounded = false;
      door.progress = damp(door.progress, door.target, 7.5, delta);
      const travel = 1.37 * door.progress;
      door.left.position.x = -0.68 - travel;
      door.right.position.x = 0.68 + travel;
      door.collider.enabled = door.progress < 0.78;
    }
  }
}
