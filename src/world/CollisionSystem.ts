import * as THREE from 'three';

export interface BoxCollider {
  id: string;
  box: THREE.Box3;
  enabled: boolean;
  material: 'metal' | 'moss' | 'stone';
}

export interface CylinderCollider {
  id: string;
  center: THREE.Vector3;
  radius: number;
  minY: number;
  maxY: number;
  enabled: boolean;
}

export class CollisionSystem {
  readonly boxes: BoxCollider[] = [];
  readonly cylinders: CylinderCollider[] = [];
  terrainHeight: ((x: number, z: number) => number) | null = null;
  terrainNormal: ((x: number, z: number) => THREE.Vector3) | null = null;

  addBox(id: string, min: THREE.Vector3, max: THREE.Vector3, material: BoxCollider['material'] = 'metal'): BoxCollider {
    const collider = { id, box: new THREE.Box3(min.clone(), max.clone()), enabled: true, material };
    this.boxes.push(collider);
    return collider;
  }

  addBoxFromObject(id: string, object: THREE.Object3D, material: BoxCollider['material'] = 'metal'): BoxCollider {
    object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(object);
    return this.addBox(id, bounds.min, bounds.max, material);
  }

  addCylinder(id: string, center: THREE.Vector3, radius: number, minY: number, maxY: number): CylinderCollider {
    const collider = { id, center: center.clone(), radius, minY, maxY, enabled: true };
    this.cylinders.push(collider);
    return collider;
  }

  removePrefix(prefix: string): void {
    for (let i = this.boxes.length - 1; i >= 0; i -= 1) if (this.boxes[i].id.startsWith(prefix)) this.boxes.splice(i, 1);
    for (let i = this.cylinders.length - 1; i >= 0; i -= 1) if (this.cylinders[i].id.startsWith(prefix)) this.cylinders.splice(i, 1);
  }

  resolveHorizontal(position: THREE.Vector3, radius: number, minY: number, maxY: number): void {
    for (let iteration = 0; iteration < 3; iteration += 1) {
      for (const collider of this.boxes) {
        if (!collider.enabled || maxY < collider.box.min.y || minY > collider.box.max.y) continue;
        const closestX = THREE.MathUtils.clamp(position.x, collider.box.min.x, collider.box.max.x);
        const closestZ = THREE.MathUtils.clamp(position.z, collider.box.min.z, collider.box.max.z);
        let dx = position.x - closestX;
        let dz = position.z - closestZ;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= radius * radius) continue;
        if (distanceSq < 1e-8) {
          const left = Math.abs(position.x - collider.box.min.x);
          const right = Math.abs(collider.box.max.x - position.x);
          const front = Math.abs(position.z - collider.box.min.z);
          const back = Math.abs(collider.box.max.z - position.z);
          const minimum = Math.min(left, right, front, back);
          if (minimum === left) position.x = collider.box.min.x - radius;
          else if (minimum === right) position.x = collider.box.max.x + radius;
          else if (minimum === front) position.z = collider.box.min.z - radius;
          else position.z = collider.box.max.z + radius;
          continue;
        }
        const distance = Math.sqrt(distanceSq);
        dx /= distance;
        dz /= distance;
        const push = radius - distance;
        position.x += dx * push;
        position.z += dz * push;
      }

      for (const collider of this.cylinders) {
        if (!collider.enabled || maxY < collider.minY || minY > collider.maxY) continue;
        const dx = position.x - collider.center.x;
        const dz = position.z - collider.center.z;
        const distance = Math.hypot(dx, dz);
        const minimum = radius + collider.radius;
        if (distance >= minimum) continue;
        const nx = distance > 1e-5 ? dx / distance : 1;
        const nz = distance > 1e-5 ? dz / distance : 0;
        position.x = collider.center.x + nx * minimum;
        position.z = collider.center.z + nz * minimum;
      }
    }
  }

  floorAt(x: number, z: number, defaultFloor = 0): number {
    if (this.terrainHeight) return this.terrainHeight(x, z);
    return defaultFloor;
  }

  materialAt(position: THREE.Vector3): BoxCollider['material'] {
    if (this.terrainHeight) {
      const h = this.terrainHeight(position.x, position.z);
      return Math.abs(position.y - h) < 1 ? (Math.abs(position.x) + Math.abs(position.z) > 80 ? 'stone' : 'moss') : 'metal';
    }
    return 'metal';
  }
}
