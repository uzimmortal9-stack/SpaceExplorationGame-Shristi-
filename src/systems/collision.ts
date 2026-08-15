import * as THREE from "three";
import { AABB, makeAABB } from "../core/math";

/**
 * CollisionWorld — a collection of axis-aligned obstacle boxes with a
 * circle-vs-AABB resolver for the first-person player.
 */
export class CollisionWorld {
  private boxes: AABB[] = [];

  addBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): AABB {
    const b = makeAABB(minX, minY, minZ, maxX, maxY, maxZ);
    this.boxes.push(b);
    return b;
  }

  addFromMesh(mesh: THREE.Object3D, expand = 0.0): AABB | null {
    const b = new THREE.Box3().setFromObject(mesh);
    const size = b.getSize(new THREE.Vector3());
    if (size.lengthSq() < 1e-6) return null;
    return this.addBox(b.min.x - expand, b.min.y, b.min.z - expand, b.max.x + expand, b.max.y, b.max.z + expand);
  }

  clear(): void {
    this.boxes = [];
  }

  /**
   * Resolve a player (circle radius r at height segment) against all boxes,
   * axis-separated to allow smooth sliding along walls.
   * @returns whether anything was hit
   */
  resolveCircle(cx: number, cy: number, cz: number, r: number, height: number): { hit: boolean; nx: number; nz: number } {
    let hit = false;
    let nx = 0;
    let nz = 0;
    // Vertical overlap check used to include box only if player's body overlaps.
    for (const b of this.boxes) {
      if (!(cy < b.max.y && cy + height > b.min.y)) continue;
      // closest point on box to circle center
      const px = Math.max(b.min.x, Math.min(cx, b.max.x));
      const pz = Math.max(b.min.z, Math.min(cz, b.max.z));
      const dx = cx - px;
      const dz = cz - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      const d = Math.sqrt(d2) || 1e-6;
      // normal points from box surface to circle
      const push = r - d;
      if (d > 1e-5) {
        nx += dx / d;
        nz += dz / d;
      } else {
        // center inside box — push out along the axis of least penetration
        const penL = cx - b.min.x;
        const penR = b.max.x - cx;
        const penB = cz - b.min.z;
        const penT = b.max.z - cz;
        const m = Math.min(penL, penR, penB, penT);
        if (m === penL) {
          nx = -1;
        } else if (m === penR) {
          nx = 1;
        } else if (m === penB) {
          nz = -1;
        } else {
          nz = 1;
        }
        void push;
      }
    }
    return { hit, nx, nz };
  }

  /** Query vertical collision at a point for terrain-like ground snapping. */
  pointBoxes(x: number, y: number, z: number): boolean {
    for (const b of this.boxes) {
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && y > b.min.y && y < b.max.y) return true;
    }
    return false;
  }

  /** True if the circle overlaps any box (used for door obstruction). */
  obstructed(cx: number, cy: number, cz: number, r: number, height: number): boolean {
    for (const b of this.boxes) {
      if (!(cy < b.max.y && cy + height > b.min.y)) continue;
      const px = Math.max(b.min.x, Math.min(cx, b.max.x));
      const pz = Math.max(b.min.z, Math.min(cz, b.max.z));
      const d2 = (cx - px) ** 2 + (cz - pz) ** 2;
      if (d2 < r * r) return true;
    }
    return false;
  }

  get count(): number {
    return this.boxes.length;
  }
}
