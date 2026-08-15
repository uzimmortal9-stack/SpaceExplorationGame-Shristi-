/**
 * Structure — builds the ship shell from the downloaded modular sci-fi kit.
 *
 * Kit conventions (measured from the actual GLB bounds, not assumed):
 *   * floor tiles  — 4 x 4 m, pivot at the tile centre, surface at y = 0
 *   * wall panels  — 4 m long running along local +Z, inner face at local
 *                    x = -2, so the module's "into the room" direction is +X
 *                    and its pivot sits at the *tile centre*, not on the wall
 *   * door frames  — 4.85 x 5.0 m, pivot on the floor, opening along local X
 *
 * Everything below is snapped to that 4 m grid, so panels meet flush and every
 * doorway keeps its full authored clearance.
 */

import {
  BackSide,
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';

import type { AssetLoader } from '../../assets/assetLoader';
import type { CollisionWorld } from '../../systems/collision';
import type { MaterialLibrary } from '../materials';
import {
  DECK_HEIGHT,
  DOORWAYS,
  ROOMS,
  type RoomDef,
  walkableRects,
} from './layout';

const TILE = 4;

export interface StructureResult {
  group: Group;
  doorFrames: Map<string, { center: Vector3; axis: 'x' | 'z'; width: number }>;
}

/** Batch identical source meshes into InstancedMeshes. */
class InstanceBatcher {
  private readonly batches = new Map<string, { mesh: Mesh; matrices: Matrix4[] }>();

  constructor(private readonly parent: Group) {}

  add(source: Object3D, matrix: Matrix4, keyPrefix: string): void {
    source.updateMatrixWorld(true);
    source.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const key = `${keyPrefix}|${mesh.uuid}`;
      let batch = this.batches.get(key);
      if (!batch) {
        batch = { mesh, matrices: [] };
        this.batches.set(key, batch);
      }
      batch.matrices.push(new Matrix4().multiplyMatrices(matrix, mesh.matrixWorld));
    });
  }

  flush(): void {
    for (const { mesh, matrices } of this.batches.values()) {
      if (matrices.length === 0) continue;
      const inst = new InstancedMesh(mesh.geometry, mesh.material, matrices.length);
      inst.castShadow = true;
      inst.receiveShadow = true;
      for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]);
      inst.instanceMatrix.needsUpdate = true;
      this.parent.add(inst);
    }
    this.batches.clear();
  }
}

function roomAtCell(cx: number, cz: number): RoomDef | null {
  for (const r of ROOMS) if (cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1) return r;
  return null;
}

interface Opening { x: number; z: number; axis: 'x' | 'z'; width: number }

function openings(): Opening[] {
  return DOORWAYS.map((d) => ({ x: d.x, z: d.z, axis: d.axis, width: d.width ?? 2.4 }));
}

/**
 * Subtract every doorway from a wall run, returning the solid pieces that
 * remain. This keeps openings exactly as wide as the door and never deletes a
 * whole 4 m panel for a 2.4 m opening.
 */
function subtractDoors(
  a: number, b: number, fixed: number, along: 'x' | 'z', list: Opening[],
): Array<[number, number]> {
  let pieces: Array<[number, number]> = [[a, b]];
  for (const o of list) {
    const perp = along === 'x' ? o.z : o.x;
    if (Math.abs(perp - fixed) > 1.4) continue;
    const c = along === 'x' ? o.x : o.z;
    const half = o.width / 2 + 0.12;
    const lo = c - half;
    const hi = c + half;
    const next: Array<[number, number]> = [];
    for (const [s0, s1] of pieces) {
      if (hi <= s0 || lo >= s1) { next.push([s0, s1]); continue; }
      if (lo > s0) next.push([s0, lo]);
      if (hi < s1) next.push([hi, s1]);
    }
    pieces = next;
  }
  return pieces.filter(([s0, s1]) => s1 - s0 > 0.08);
}

export function buildStructure(
  assets: AssetLoader,
  mats: MaterialLibrary,
  collision: CollisionWorld,
): StructureResult {
  const group = new Group();
  group.name = 'ship-structure';

  const decks = new InstanceBatcher(group);
  const walls = new InstanceBatcher(group);
  const trims = new InstanceBatcher(group);

  const rects = walkableRects();
  const doors = openings();

  /** Is this point on walkable deck? (used to find the hull perimeter) */
  const walkable = (x: number, z: number): boolean => {
    for (const r of rects) if (x > r.x0 + 0.01 && x < r.x1 - 0.01 && z > r.z0 + 0.01 && z < r.z1 - 0.01) return true;
    return false;
  };

  /**
   * Split a span into whole 4 m modules plus a scaled remainder, so rooms of
   * any size tile seamlessly without gaps or overlap.
   */
  const spans = (a: number, b: number): Array<{ centre: number; scale: number }> => {
    const len = b - a;
    const whole = Math.floor(len / TILE + 1e-6);
    const out: Array<{ centre: number; scale: number }> = [];
    for (let i = 0; i < whole; i++) out.push({ centre: a + i * TILE + TILE / 2, scale: 1 });
    const rem = len - whole * TILE;
    if (rem > 0.05) out.push({ centre: a + whole * TILE + rem / 2, scale: rem / TILE });
    return out;
  };

  // ------------------------------------------------------------------ decks
  const floorFor = (room: RoomDef | null, cx: number, cz: number): string => {
    if (!room) return (Math.abs(Math.round(cx / TILE + cz / TILE)) | 0) % 2 ? 'floor_plates' : 'floor';
    switch (room.mood) {
      case 'engineering':
      case 'cargo':
        return 'floor_dark';
      case 'crew':
      case 'medical':
        return 'floor_squares';
      default:
        return 'floor_plates';
    }
  };

  for (const rect of rects) {
    const room = roomAtCell((rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2);
    for (const sx of spans(rect.x0, rect.x1)) {
      for (const sz of spans(rect.z0, rect.z1)) {
        const id = floorFor(room, sx.centre, sz.centre);
        decks.add(
          assets.instance(id, { clone: false }),
          new Matrix4().compose(
            new Vector3(sx.centre, 0, sz.centre),
            new Quaternion(),
            new Vector3(sx.scale, 1, sz.scale),
          ),
          id,
        );
        // ceiling: a floor tile flipped over (the kit has no horizontal top tile)
        decks.add(
          assets.instance('floor', { clone: false }),
          new Matrix4().compose(
            new Vector3(sx.centre, rect.ceiling, sz.centre),
            new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI),
            new Vector3(sx.scale, 1, sz.scale),
          ),
          'ceil',
        );
      }
    }
  }

  // ------------------------------------------------------------------ walls
  //
  // Wall modules run along local +Z with their inner face toward local +X, and
  // their pivot at the module centre. A yaw of atan2(-nz, nx) turns +X to the
  // inward normal n; the module is then placed half a tile back from the
  // boundary plane so its face lands exactly on it.
  // wall_flat / wall_band are true flat panels (0.1-0.2 m deep). The "Astra"
  // variants carry an angled decorative profile, so they are used sparingly as
  // accents rather than for every run.
  const wallVariants = ['wall_flat', 'wall_band', 'wall_flat', 'wall_divided'];
  const viewportRooms = new Set(['bridge', 'lounge', 'galley', 'cabin_a', 'cabin_b', 'medical', 'science']);
  let wallCount = 0;

  const emitWall = (
    bx: number, bz: number, nx: number, nz: number,
    length: number, ceiling: number, room: RoomDef | null,
  ): void => {
    const isOuter =
      (nx !== 0 && (bx <= -14.9 || bx >= 14.9)) || (nz !== 0 && (bz <= -29.9 || bz >= 77.9));
    const wantWindow = isOuter && room != null && viewportRooms.has(room.id);
    const id = wantWindow
      ? 'wall_window'
      : wallVariants[Math.abs(Math.round(bx / TILE + bz / TILE)) % wallVariants.length];

    const yaw = Math.atan2(-nz, nx);
    // The module faces local +X and its inner surface is at local x = max.x
    // (a negative number). Offsetting by -max.x lands that surface exactly on
    // the boundary plane for any panel depth in the kit.
    const info = assets.info(id);
    const faceOffset = info ? -info.max.x : TILE / 2;
    const px = bx + nx * faceOffset;
    const pz = bz + nz * faceOffset;

    walls.add(
      assets.instance(id, { clone: false }),
      new Matrix4().compose(
        new Vector3(px, 0, pz),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
        new Vector3(1, ceiling / 3.0, length / TILE),
      ),
      id,
    );
    wallCount++;

    const t = 0.45;
    if (nz !== 0) {
      collision.addBox(bx, ceiling / 2, bz + nz * t * 0.5, length, ceiling + 1.6, t);
    } else {
      collision.addBox(bx + nx * t * 0.5, ceiling / 2, bz, t, ceiling + 1.6, length);
    }
  };

  for (const rect of rects) {
    const room = roomAtCell((rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2);
    const ceiling = rect.ceiling;

    // ---- edges running along X (walls at z = z0 / z1) ---------------------
    for (const [zEdge, nz] of [[rect.z0, 1], [rect.z1, -1]] as const) {
      // find the exposed stretches of this edge
      let runStart: number | null = null;
      const emitRun = (from: number, to: number): void => {
        for (const [p0, p1] of subtractDoors(from, to, zEdge, 'x', doors)) {
          // tile the solid piece into <= 4 m modules
          for (const sp of spans(p0, p1)) {
            emitWall(sp.centre, zEdge, 0, nz, sp.scale * TILE, ceiling, room);
          }
        }
      };
      const step = 0.5;
      for (let x = rect.x0; x <= rect.x1 + 1e-6; x += step) {
        const exposed = x < rect.x1 && !walkable(x + step / 2, zEdge - nz * 0.5);
        if (exposed && runStart === null) runStart = x;
        if ((!exposed || x >= rect.x1) && runStart !== null) {
          emitRun(runStart, Math.min(x, rect.x1));
          runStart = null;
        }
      }
    }

    // ---- edges running along Z (walls at x = x0 / x1) ---------------------
    for (const [xEdge, nx] of [[rect.x0, 1], [rect.x1, -1]] as const) {
      let runStart: number | null = null;
      const emitRun = (from: number, to: number): void => {
        for (const [p0, p1] of subtractDoors(from, to, xEdge, 'z', doors)) {
          for (const sp of spans(p0, p1)) {
            emitWall(xEdge, sp.centre, nx, 0, sp.scale * TILE, ceiling, room);
          }
        }
      };
      const step = 0.5;
      for (let z = rect.z0; z <= rect.z1 + 1e-6; z += step) {
        const exposed = z < rect.z1 && !walkable(xEdge - nx * 0.5, z + step / 2);
        if (exposed && runStart === null) runStart = z;
        if ((!exposed || z >= rect.z1) && runStart !== null) {
          emitRun(runStart, Math.min(z, rect.z1));
          runStart = null;
        }
      }
    }
  }

  decks.flush();
  walls.flush();
  trims.flush();
  group.userData.wallCount = wallCount;

  // -------------------------------------------------------- floors/ceilings
  for (const rect of rects) {
    const cx = (rect.x0 + rect.x1) / 2;
    const cz = (rect.z0 + rect.z1) / 2;
    const sx = rect.x1 - rect.x0;
    const sz = rect.z1 - rect.z0;
    collision.addBox(cx, -0.5, cz, sx, 1.0, sz);
    collision.addBox(cx, rect.ceiling + 0.5, cz, sx, 1.0, sz);
  }

  // ------------------------------------------------------------- door frames
  const doorFrames = new Map<string, { center: Vector3; axis: 'x' | 'z'; width: number }>();
  for (const d of DOORWAYS) {
    const width = d.width ?? 2.4;
    doorFrames.set(d.id, { center: new Vector3(d.x, 0, d.z), axis: d.axis, width });

    // The kit's door frame is authored 5 m tall for a 5 m deck; squashing it
    // into a 3 m deck distorts the profile badly. Build the surround from the
    // kit's own flat wall panels instead: two jamb pieces plus a header, all
    // sharing the corridor material so the style stays consistent.
    const jambW = 0.55;
    const headerH = DECK_HEIGHT - 2.25;
    const along = new Vector3(d.axis === 'x' ? 1 : 0, 0, d.axis === 'z' ? 1 : 0);
    const across = new Vector3(d.axis === 'x' ? 0 : 1, 0, d.axis === 'x' ? 1 : 0);

    const surround = new Group();
    surround.name = `frame:${d.id}`;
    const frameMat = new MeshStandardMaterial({
      color: new Color(0x8c98a6),
      roughness: 0.42,
      metalness: 0.68,
    });
    const trimMat = new MeshStandardMaterial({
      color: new Color(0x161c24),
      roughness: 0.35,
      metalness: 0.85,
    });

    for (const sign of [-1, 1]) {
      const jamb = new Mesh(new BoxGeometry(jambW, DECK_HEIGHT - 0.05, 0.62), frameMat);
      jamb.position
        .set(d.x, (DECK_HEIGHT - 0.05) / 2, d.z)
        .addScaledVector(along, sign * (width / 2 + jambW / 2));
      jamb.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), d.axis === 'x' ? 0 : Math.PI / 2);
      jamb.castShadow = true;
      jamb.receiveShadow = true;
      surround.add(jamb);

      const light = new Mesh(new BoxGeometry(0.07, DECK_HEIGHT - 1.0, 0.07), trimMat);
      light.position
        .set(d.x, (DECK_HEIGHT - 1.0) / 2 + 0.2, d.z)
        .addScaledVector(along, sign * (width / 2 + 0.05))
        .addScaledVector(across, 0.33);
      surround.add(light);
    }

    const header = new Mesh(
      new BoxGeometry(width + jambW * 2, headerH, 0.62),
      frameMat,
    );
    header.position.set(d.x, DECK_HEIGHT - headerH / 2 - 0.03, d.z);
    header.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), d.axis === 'x' ? 0 : Math.PI / 2);
    header.castShadow = true;
    header.receiveShadow = true;
    surround.add(header);

    const sill = new Mesh(new BoxGeometry(width + jambW * 2, 0.03, 0.66), trimMat);
    sill.position.set(d.x, 0.015, d.z);
    sill.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), d.axis === 'x' ? 0 : Math.PI / 2);
    surround.add(sill);

    group.add(surround);

    // solid header above the opening so rooms stay visually separated
    if (d.axis === 'x') {
      collision.addBox(d.x, DECK_HEIGHT - headerH / 2, d.z, width, headerH, 0.6);
    } else {
      collision.addBox(d.x, DECK_HEIGHT - headerH / 2, d.z, 0.6, headerH, width);
    }

    // jambs so the opening keeps exactly `width` of clearance
    const half = width / 2;
    const jamb = 0.7;
    if (d.axis === 'x') {
      collision.addBox(d.x - half - jamb / 2, DECK_HEIGHT / 2, d.z, jamb, DECK_HEIGHT + 1.6, 0.6);
      collision.addBox(d.x + half + jamb / 2, DECK_HEIGHT / 2, d.z, jamb, DECK_HEIGHT + 1.6, 0.6);
    } else {
      collision.addBox(d.x, DECK_HEIGHT / 2, d.z - half - jamb / 2, 0.6, DECK_HEIGHT + 1.6, jamb);
      collision.addBox(d.x, DECK_HEIGHT / 2, d.z + half + jamb / 2, 0.6, DECK_HEIGHT + 1.6, jamb);
    }
  }

  // --------------------------------------------------------------- hull skin
  // A dark outer shell behind the modules: it seals the silhouette so a viewport
  // never looks into empty space between rooms, and catches the sun outside.
  const shell = new Mesh(
    new BoxGeometry(36, DECK_HEIGHT + 3.4, 118),
    new MeshStandardMaterial({
      color: new Color(0x0d1116),
      roughness: 0.55,
      metalness: 0.8,
      side: BackSide,
    }),
  );
  shell.position.set(0, (DECK_HEIGHT + 3.4) / 2 - 1.6, 24);
  shell.renderOrder = -2;
  group.add(shell);

  void mats;
  return { group, doorFrames };
}
