/**
 * AssetLoader — manifest-driven GLB / texture / HDRI loading.
 *
 * Contract with tools/fetch-assets.mjs:
 *   * `public/assets/manifest.json` lists every model, HDRI and PBR set with an
 *     `available` flag and the exact URL it should live at.
 *   * If `available` is false the loader substitutes a clearly-marked
 *     placeholder and records the id in `missing`, which the credits/settings
 *     screen surfaces. Dropping the real file at the manifest path and
 *     reloading picks it up with **zero code changes**.
 *
 * The loader also runs the geometry normalisation pipeline the design brief
 * calls for: bounding-box measurement, pivot calibration (bottom / center /
 * keep), shadow flags, anisotropy, and colour-space fixes.
 */

import {
  Box3,
  DoubleSide,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { Renderer } from '../core/renderer';
import { resolveSwatch, type Swatch } from './palette';
import { createPlaceholder } from './placeholder';
import {
  EMPTY_MANIFEST,
  type AssetManifest,
  type ManifestModel,
  type ManifestSurface,
} from './manifest';

export interface ModelInfo {
  id: string;
  size: Vector3;
  min: Vector3;
  max: Vector3;
  placeholder: boolean;
  triangles: number;
}

export interface SurfaceSet {
  id: string;
  map?: Texture;
  normalMap?: Texture;
  roughnessMap?: Texture;
  aoMap?: Texture;
  displacementMap?: Texture;
  available: boolean;
}

export type ProgressFn = (loaded: number, total: number, label: string) => void;

const BASE = import.meta.env.BASE_URL ?? '/';
const url = (p: string): string => `${BASE.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;

export class AssetLoader {
  manifest: AssetManifest = EMPTY_MANIFEST;

  readonly missing: string[] = [];

  private readonly gltf = new GLTFLoader();
  private readonly texLoader = new TextureLoader();
  private readonly prototypes = new Map<string, Object3D>();
  private readonly infos = new Map<string, ModelInfo>();
  private readonly surfaces = new Map<string, SurfaceSet>();
  private readonly textures = new Map<string, Texture>();
  private readonly modelSpec = new Map<string, ManifestModel>();

  constructor(private readonly renderer: Renderer) {}

  get stats() {
    return {
      models: this.prototypes.size,
      missing: this.missing.length,
      declared: this.manifest.counts.models,
    };
  }

  async loadManifest(): Promise<AssetManifest> {
    try {
      const res = await fetch(url('assets/manifest.json'), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.manifest = (await res.json()) as AssetManifest;
    } catch (err) {
      console.warn('[assets] manifest.json missing — running entirely on placeholders.', err);
      this.manifest = EMPTY_MANIFEST;
    }
    for (const m of this.manifest.models) this.modelSpec.set(m.id, m);
    return this.manifest;
  }

  /** Load every declared model + surface set, reporting progress. */
  async loadAll(onProgress?: ProgressFn): Promise<void> {
    const models = this.manifest.models;
    const surfaces = this.manifest.surfaces;
    const total = models.length + surfaces.length;
    let done = 0;

    const step = (label: string) => {
      done++;
      onProgress?.(done, total, label);
    };

    // GLBs in small parallel batches keeps the browser's socket pool happy.
    const BATCH = 8;
    for (let i = 0; i < models.length; i += BATCH) {
      await Promise.all(
        models.slice(i, i + BATCH).map(async (spec) => {
          await this.loadModel(spec);
          step(spec.id);
        }),
      );
    }

    for (const s of surfaces) {
      await this.loadSurface(s);
      step(s.id);
    }
  }

  private async loadModel(spec: ManifestModel): Promise<void> {
    if (this.prototypes.has(spec.id)) return;

    if (!spec.available) {
      this.registerPlaceholder(spec);
      return;
    }

    try {
      const gltf = await this.gltf.loadAsync(url(spec.url));
      const root = gltf.scene;
      this.prepare(root, spec);
      this.prototypes.set(spec.id, root);
    } catch (err) {
      console.warn(`[assets] failed to load "${spec.id}" — using placeholder`, err);
      this.registerPlaceholder(spec);
    }
  }

  private registerPlaceholder(spec: ManifestModel): void {
    const size = (spec.size ?? [0.8, 0.8, 0.8]) as [number, number, number];
    const node = createPlaceholder(spec.id, size);
    this.prototypes.set(spec.id, node);
    this.infos.set(spec.id, {
      id: spec.id,
      size: new Vector3(...size),
      min: new Vector3(-size[0] / 2, 0, -size[2] / 2),
      max: new Vector3(size[0] / 2, size[1], size[2] / 2),
      placeholder: true,
      triangles: 12,
    });
    if (!this.missing.includes(spec.id)) this.missing.push(spec.id);
  }

  /**
   * Geometry alignment pipeline: measure the AABB, normalise the pivot per the
   * asset's role, fix material/texture settings, enable shadows.
   */
  private prepare(root: Object3D, spec: ManifestModel): void {
    root.updateMatrixWorld(true);

    let triangles = 0;
    const aniso = this.renderer.maxAnisotropy;

    root.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;

      const geo = mesh.geometry;
      if (geo) {
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        if (!geo.attributes.normal) geo.computeVertexNormals();
        const idx = geo.index;
        triangles += idx ? idx.count / 3 : (geo.attributes.position?.count ?? 0) / 3;
      }

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as MeshStandardMaterial;
        if (!std) continue;

        // Atlas-based kits arrive with no baseColorTexture (the shared atlas is
        // not part of the CC0 mirror). Give those materials the flat colour the
        // atlas encodes, keyed off the artist's own material name. Anything
        // that *does* carry a real texture is left untouched.
        if (!std.map) {
          const tint: Swatch | null = resolveSwatch(spec.id, std.name || '');
          if (tint) {
            std.color.setHex(tint.color);
            if (tint.roughness !== undefined) std.roughness = tint.roughness;
            if (tint.metalness !== undefined) std.metalness = tint.metalness;
            if (tint.emissive !== undefined) {
              std.emissive.setHex(tint.emissive);
              std.emissiveIntensity = tint.emissiveIntensity ?? 0.2;
            }
            if (tint.doubleSided) std.side = DoubleSide;
          }
        }
        for (const slot of ['map', 'emissiveMap'] as const) {
          const t = std[slot] as Texture | null;
          if (t) {
            t.colorSpace = SRGBColorSpace;
            t.anisotropy = aniso;
            t.needsUpdate = true;
          }
        }
        for (const slot of ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
          const t = std[slot] as Texture | null;
          if (t) {
            t.anisotropy = aniso;
            t.needsUpdate = true;
          }
        }
        // Quaternius kits ship as pure dielectrics; give them a plausible
        // roughness floor so the HDRI produces real specular response.
        if (typeof std.roughness === 'number') {
          std.roughness = Math.min(Math.max(std.roughness, 0.18), 0.98);
        }
        std.shadowSide = undefined as never;
        std.needsUpdate = true;
      }
    });

    // ---- pivot normalisation ------------------------------------------------
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());

    // The converter already applied the requested pivot; this is a safety net
    // for any asset whose exporter disagreed (and for hand-supplied files).
    const offset = new Vector3();
    if (spec.pivot === 'bottom') {
      offset.set(-center.x, -box.min.y, -center.z);
    } else if (spec.pivot === 'center') {
      offset.copy(center).negate();
    }
    if (offset.lengthSq() > 1e-8) {
      for (const child of [...root.children]) child.position.add(offset);
      root.updateMatrixWorld(true);
      box.setFromObject(root);
      box.getSize(size);
    }

    this.infos.set(spec.id, {
      id: spec.id,
      size,
      min: box.min.clone(),
      max: box.max.clone(),
      placeholder: false,
      triangles: Math.round(triangles),
    });
  }

  private async loadSurface(spec: ManifestSurface): Promise<void> {
    const set: SurfaceSet = { id: spec.id, available: spec.available };
    if (spec.available) {
      for (const [slot, path] of Object.entries(spec.maps)) {
        try {
          const tex = await this.texture(path as string, slot === 'map');
          (set as unknown as Record<string, unknown>)[slot] = tex;
        } catch (err) {
          console.warn(`[assets] surface "${spec.id}" slot "${slot}" failed`, err);
          set.available = false;
        }
      }
    } else if (!this.missing.includes(`surface:${spec.id}`)) {
      this.missing.push(`surface:${spec.id}`);
    }
    this.surfaces.set(spec.id, set);
  }

  async texture(path: string, srgb = true, repeat = 1): Promise<Texture> {
    const key = `${path}|${srgb}|${repeat}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const tex = await this.texLoader.loadAsync(url(path));
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = this.renderer.maxAnisotropy;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    if (srgb) tex.colorSpace = SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }

  /** Get a surface (PBR map set) by id, or a stub when it never downloaded. */
  surface(id: string): SurfaceSet {
    return this.surfaces.get(id) ?? { id, available: false };
  }

  info(id: string): ModelInfo | null {
    return this.infos.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.prototypes.has(id);
  }

  isPlaceholder(id: string): boolean {
    return this.infos.get(id)?.placeholder ?? true;
  }

  /**
   * Instantiate a model. Cloned nodes share geometry and materials with the
   * prototype, so hundreds of props cost almost nothing extra in GPU memory.
   */
  instance(id: string, opts: { scale?: number; clone?: boolean } = {}): Group {
    const proto = this.prototypes.get(id);
    const group = new Group();
    group.name = id;
    if (!proto) {
      const stand = createPlaceholder(id);
      group.add(stand);
      if (!this.missing.includes(id)) this.missing.push(id);
      return group;
    }
    const node = opts.clone === false ? proto : proto.clone(true);
    group.add(node);
    if (opts.scale && opts.scale !== 1) group.scale.setScalar(opts.scale);
    group.userData.assetId = id;
    return group;
  }

  /** Instantiate scaled so the model's largest horizontal axis equals `metres`. */
  instanceSizedX(id: string, metres: number): Group {
    const info = this.info(id);
    const g = this.instance(id);
    if (info && info.size.x > 1e-4) g.scale.setScalar(metres / info.size.x);
    return g;
  }

  /** Instantiate scaled so the model's height equals `metres`. */
  instanceSizedY(id: string, metres: number): Group {
    const info = this.info(id);
    const g = this.instance(id);
    if (info && info.size.y > 1e-4) g.scale.setScalar(metres / info.size.y);
    return g;
  }

  environmentUrl(id: string): string | null {
    const e = this.manifest.environment.find((x) => x.id === id);
    return e && e.available ? url(e.url) : null;
  }

  creditRows(): Array<{ pack: string; author: string; license: string; count: number; source: string }> {
    const byPack = new Map<string, { pack: string; author: string; license: string; count: number; source: string }>();
    for (const m of this.manifest.models) {
      const key = m.pack;
      const row = byPack.get(key);
      if (row) row.count++;
      else
        byPack.set(key, {
          pack: key,
          author: m.author,
          license: m.license,
          count: 1,
          source: m.source.split('/contents/')[0],
        });
    }
    return [...byPack.values()].sort((a, b) => b.count - a.count);
  }
}
