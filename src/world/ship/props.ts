/**
 * Props — furnishes every room with real downloaded models.
 *
 * Placement discipline (the "zero-float directive"):
 *   * every prop is instantiated through AssetLoader, which has already
 *     normalised its pivot to the model's bottom face;
 *   * `place()` therefore puts y = floor height and the object sits *exactly*
 *     on the deck — no floating, no sinking;
 *   * a matching simplified box collider is derived from the measured bounding
 *     box so the visual and physical footprints agree;
 *   * props are kept out of doorways and the walking spine by construction.
 */

import { Box3, Group, Object3D, Vector3 } from 'three';

import type { AssetLoader } from '../../assets/assetLoader';
import type { CollisionWorld } from '../../systems/collision';
import { rng } from '../../core/math';

export interface PlaceOptions {
  /** Yaw in radians. */
  ry?: number;
  /** Uniform scale, or a target height in metres via `height`. */
  scale?: number;
  height?: number;
  width?: number;
  /** Add a box collider derived from the model bounds. */
  solid?: boolean;
  /** Shrink/grow the collider relative to the visual bounds. */
  colliderScale?: number;
  /** Raise above the floor (for shelf-top items). */
  y?: number;
  tag?: string;
  /** Skip shadow casting for tiny clutter (perf). */
  noShadow?: boolean;
}

export class PropPlacer {
  readonly root = new Group();
  private readonly r = rng(0xa17ce);

  constructor(
    private readonly assets: AssetLoader,
    private readonly collision: CollisionWorld,
  ) {
    this.root.name = 'ship-props';
  }

  /** Place a model with its base flush to y (default: the deck). */
  place(id: string, x: number, z: number, opts: PlaceOptions = {}): Group {
    const g = this.assets.instance(id);
    const info = this.assets.info(id);

    let scale = opts.scale ?? 1;
    if (opts.height && info && info.size.y > 1e-4) scale = opts.height / info.size.y;
    else if (opts.width && info && info.size.x > 1e-4) scale = opts.width / info.size.x;
    g.scale.setScalar(scale);

    const y = opts.y ?? 0;
    g.position.set(x, y, z);
    g.rotation.y = opts.ry ?? 0;

    if (opts.noShadow) {
      g.traverse((c) => {
        (c as { castShadow?: boolean }).castShadow = false;
      });
    }

    this.root.add(g);

    if (opts.solid && info) {
      const cs = opts.colliderScale ?? 0.92;
      const sx = Math.max(info.size.x * scale * cs, 0.12);
      const sz = Math.max(info.size.z * scale * cs, 0.12);
      const sy = Math.max(info.size.y * scale, 0.12);
      // rotate the footprint for 90-degree yaws
      const ry = opts.ry ?? 0;
      const swap = Math.abs(Math.sin(ry)) > 0.7;
      this.collision.addBox(
        x, y + sy / 2, z,
        swap ? sz : sx,
        sy,
        swap ? sx : sz,
        opts.tag,
      );
    }
    return g;
  }

  /** Place several copies along a line, e.g. lockers down a wall. */
  line(
    id: string,
    from: [number, number],
    to: [number, number],
    count: number,
    opts: PlaceOptions = {},
  ): Group[] {
    const out: Group[] = [];
    if (count <= 0) return out;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = from[0] + (to[0] - from[0]) * t;
      const z = from[1] + (to[1] - from[1]) * t;
      out.push(this.place(id, x, z, opts));
    }
    return out;
  }

  /** Scatter small clutter inside a rectangle, avoiding the centre walkway. */
  scatter(
    ids: string[],
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    count: number,
    opts: PlaceOptions = {},
  ): void {
    for (let i = 0; i < count; i++) {
      const id = ids[Math.floor(this.r() * ids.length) % ids.length];
      const x = this.r.range(x0, x1);
      const z = this.r.range(z0, z1);
      this.place(id, x, z, { ...opts, ry: this.r.range(0, Math.PI * 2) });
    }
  }

  /** Bounding box of a placed node, in world space. */
  static bounds(node: Object3D): Box3 {
    return new Box3().setFromObject(node);
  }

  /** Top surface height of a placed node — used to stack items on desks. */
  static topOf(node: Object3D): number {
    return new Box3().setFromObject(node).max.y;
  }

  centre(node: Object3D): Vector3 {
    return new Box3().setFromObject(node).getCenter(new Vector3());
  }
}
