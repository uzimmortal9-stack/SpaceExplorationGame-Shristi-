/**
 * Collision — an AABB world for interiors plus a heightfield hook for terrain.
 *
 * Interiors are built from a modular grid, so axis-aligned boxes give exact,
 * cheap, tunnel-free collision. The player is a capsule approximated by a
 * vertical cylinder; resolution is per-axis (slide along walls, stand on tops).
 */

import { Box3, Vector3 } from 'three';

export interface Collider {
  box: Box3;
  /** Doors and hatches toggle this instead of being added/removed. */
  enabled: boolean;
  tag?: string;
}

export interface GroundSample {
  height: number;
  /** 'metal' | 'grass' | 'stone' | 'water' — drives footstep audio. */
  surface: 'metal' | 'grass' | 'stone' | 'water';
  normal?: Vector3;
}

export type HeightField = (x: number, z: number) => GroundSample | null;

const tmpBox = new Box3();

export class CollisionWorld {
  private readonly colliders: Collider[] = [];
  private readonly named = new Map<string, Collider>();
  private heightField: HeightField | null = null;

  /** Uniform grid for broad-phase; interiors are tens of metres across. */
  private readonly cellSize = 4;
  private readonly grid = new Map<string, Collider[]>();
  private gridDirty = true;

  clear(): void {
    this.colliders.length = 0;
    this.named.clear();
    this.grid.clear();
    this.heightField = null;
    this.gridDirty = true;
  }

  setHeightField(fn: HeightField | null): void {
    this.heightField = fn;
  }

  sampleGround(x: number, z: number): GroundSample | null {
    return this.heightField?.(x, z) ?? null;
  }

  add(min: Vector3, max: Vector3, tag?: string): Collider {
    const c: Collider = { box: new Box3(min.clone(), max.clone()), enabled: true, tag };
    this.colliders.push(c);
    if (tag) this.named.set(tag, c);
    this.gridDirty = true;
    return c;
  }

  /** Convenience: a box from centre + size. */
  addBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tag?: string): Collider {
    return this.add(
      new Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      new Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
      tag,
    );
  }

  /** A wall segment from a to b of given thickness and height. */
  addWall(ax: number, az: number, bx: number, bz: number, height: number, thickness = 0.25, baseY = 0): Collider {
    const minX = Math.min(ax, bx) - thickness / 2;
    const maxX = Math.max(ax, bx) + thickness / 2;
    const minZ = Math.min(az, bz) - thickness / 2;
    const maxZ = Math.max(az, bz) + thickness / 2;
    return this.add(new Vector3(minX, baseY, minZ), new Vector3(maxX, baseY + height, maxZ));
  }

  get(tag: string): Collider | undefined {
    return this.named.get(tag);
  }

  setEnabled(tag: string, enabled: boolean): void {
    const c = this.named.get(tag);
    if (c) c.enabled = enabled;
  }

  private key(ix: number, iz: number): string {
    return `${ix}|${iz}`;
  }

  private rebuild(): void {
    this.grid.clear();
    for (const c of this.colliders) {
      const x0 = Math.floor(c.box.min.x / this.cellSize);
      const x1 = Math.floor(c.box.max.x / this.cellSize);
      const z0 = Math.floor(c.box.min.z / this.cellSize);
      const z1 = Math.floor(c.box.max.z / this.cellSize);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const k = this.key(ix, iz);
          let list = this.grid.get(k);
          if (!list) {
            list = [];
            this.grid.set(k, list);
          }
          list.push(c);
        }
      }
    }
    this.gridDirty = false;
  }

  private candidates(box: Box3, out: Collider[]): Collider[] {
    out.length = 0;
    if (this.gridDirty) this.rebuild();
    const x0 = Math.floor(box.min.x / this.cellSize);
    const x1 = Math.floor(box.max.x / this.cellSize);
    const z0 = Math.floor(box.min.z / this.cellSize);
    const z1 = Math.floor(box.max.z / this.cellSize);
    const seen = new Set<Collider>();
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.grid.get(this.key(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (!c.enabled || seen.has(c)) continue;
          seen.add(c);
          out.push(c);
        }
      }
    }
    return out;
  }

  private readonly scratch: Collider[] = [];

  /** True when a capsule at this position would intersect solid geometry. */
  overlaps(pos: Vector3, radius: number, height: number, skip?: Collider): boolean {
    tmpBox.min.set(pos.x - radius, pos.y, pos.z - radius);
    tmpBox.max.set(pos.x + radius, pos.y + height, pos.z + radius);
    for (const c of this.candidates(tmpBox, this.scratch)) {
      if (c === skip) continue;
      if (c.box.intersectsBox(tmpBox)) return true;
    }
    return false;
  }

  /** Anything (e.g. the player) inside this volume? Used by door safety. */
  boxOccupied(box: Box3, point: Vector3, radius: number, height: number): boolean {
    tmpBox.min.set(point.x - radius, point.y, point.z - radius);
    tmpBox.max.set(point.x + radius, point.y + height, point.z + radius);
    return box.intersectsBox(tmpBox);
  }

  /**
   * Move a capsule with per-axis sliding.
   * Returns the resolved position and whether the mover is grounded.
   */
  move(
    position: Vector3,
    velocity: Vector3,
    radius: number,
    height: number,
    dt: number,
    stepHeight = 0.42,
  ): { position: Vector3; grounded: boolean; hitWall: boolean; hitCeiling: boolean } {
    const out = position.clone();
    let grounded = false;
    let hitWall = false;
    let hitCeiling = false;

    const tryAxis = (axis: 'x' | 'y' | 'z', delta: number): void => {
      if (delta === 0) return;
      const before = out[axis];
      out[axis] += delta;
      tmpBox.min.set(out.x - radius, out.y, out.z - radius);
      tmpBox.max.set(out.x + radius, out.y + height, out.z + radius);

      for (const c of this.candidates(tmpBox, this.scratch)) {
        if (!c.box.intersectsBox(tmpBox)) continue;

        if (axis === 'y') {
          if (delta < 0) {
            out.y = c.box.max.y;
            grounded = true;
            velocity.y = 0;
          } else {
            out.y = c.box.min.y - height;
            hitCeiling = true;
            velocity.y = 0;
          }
          tmpBox.min.y = out.y;
          tmpBox.max.y = out.y + height;
          continue;
        }

        // Step-up: if the obstacle top is a small ledge, climb it instead of blocking.
        const topGap = c.box.max.y - out.y;
        if (topGap > 0 && topGap <= stepHeight) {
          const lifted = out.clone();
          lifted.y = c.box.max.y + 0.001;
          if (!this.overlaps(lifted, radius, height, c)) {
            out.y = lifted.y;
            grounded = true;
            tmpBox.min.set(out.x - radius, out.y, out.z - radius);
            tmpBox.max.set(out.x + radius, out.y + height, out.z + radius);
            continue;
          }
        }

        out[axis] = before;
        hitWall = true;
        velocity[axis] = 0;
        tmpBox.min.set(out.x - radius, out.y, out.z - radius);
        tmpBox.max.set(out.x + radius, out.y + height, out.z + radius);
        break;
      }
    };

    tryAxis('x', velocity.x * dt);
    tryAxis('z', velocity.z * dt);
    tryAxis('y', velocity.y * dt);

    // Terrain heightfield takes precedence when it is above the box result.
    const g = this.heightField?.(out.x, out.z);
    if (g && out.y < g.height) {
      out.y = g.height;
      grounded = true;
      if (velocity.y < 0) velocity.y = 0;
    }

    return { position: out, grounded, hitWall, hitCeiling };
  }

  /** Surface type under a point (for footstep audio). */
  surfaceAt(x: number, z: number): 'metal' | 'grass' | 'stone' | 'water' {
    return this.heightField?.(x, z)?.surface ?? 'metal';
  }

  get count(): number {
    return this.colliders.length;
  }
}
