/**
 * Ilex Prime — the alien jungle surface.
 *
 * Terrain is a chunked heightfield generated from layered value noise, with a
 * real downloaded ground albedo. Vegetation, rocks and ruins are instanced
 * copies of downloaded CC0 models, scattered with slope/altitude rules and
 * snapped to the terrain by sampling the same height function the collider
 * uses — so nothing floats and nothing sinks.
 *
 * Landmarks: a cliff with a cascading waterfall draining into a glowing pool,
 * and an overgrown ruin complex holding the signal source.
 */

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';

import type { AssetLoader } from '../assets/assetLoader';
import type { AudioEngine } from '../core/audio';
import { clamp, fbm2D, lerp, makeNoise2D, rng, smoothstep } from '../core/math';
import type { QualityProfile } from '../core/renderer';
import type { GameState } from '../core/state';
import type { CollisionWorld, GroundSample } from '../systems/collision';
import type { InteractionSystem } from '../systems/interaction';
import type { MaterialLibrary } from './materials';

export const TERRAIN_SIZE = 620;
const TERRAIN_SEG = 176;
const HEIGHT_SCALE = 34;

/** Escarpment shape — the waterfall pours over this edge. */
const CLIFF_DROP = 40;
const CLIFF_SHARPNESS = 2.6;
const CLIFF_EDGE_OFFSET = 44;
const POOL_RADIUS = 30;

/** Ruin terrace — keeps the plaza level and above the waterline. */
const RUIN_RADIUS = 34;
const RUIN_LEVEL = 6.5;
const POOL_FLOOR = -3.4;

/** Landing pad centre; kept flat so the ship sits cleanly. */
export const PAD = new Vector3(0, 0, 0);
const PAD_RADIUS = 44;

export const WATERFALL = new Vector3(-118, 0, -158);
export const POOL = new Vector3(-104, 0, -112);
export const RUINS = new Vector3(126, 0, -96);
export const SIGNAL = new Vector3(132, 0, -104);

export interface PlanetDeps {
  assets: AssetLoader;
  mats: MaterialLibrary;
  collision: CollisionWorld;
  interact: InteractionSystem;
  audio: AudioEngine;
  state: GameState;
  profile: QualityProfile;
}

export class Planet {
  readonly group = new Group();
  readonly sun: DirectionalLight;
  readonly fog: Fog;

  private readonly noise = makeNoise2D(0x11ce);
  private readonly detail = makeNoise2D(0x5a71);
  private readonly tickers: Array<(dt: number, t: number) => void> = [];
  private elapsed = 0;
  private readonly poolLight: PointLight;

  constructor(private readonly deps: PlanetDeps) {
    this.group.name = 'planet';
    const { mats, collision, profile } = deps;

    // ---------------------------------------------------------------- terrain
    const geo = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);

      // vertex tint: dark loam in hollows, mossy green mid, pale rock high
      const t = clamp(h / HEIGHT_SCALE, -0.4, 1);
      if (t < 0.08) c.setHSL(0.36, 0.42, 0.17);
      else if (t < 0.4) c.setHSL(0.31, 0.5, 0.22 + t * 0.18);
      else c.setHSL(0.16, 0.22, 0.3 + t * 0.22);
      // damp patch around the pool
      const dPool = Math.hypot(x - POOL.x, z - POOL.z);
      if (dPool < 55) c.lerp(new Color(0x2f6f5c), (1 - dPool / 55) * 0.55);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const groundMat = mats.ground.clone();
    groundMat.vertexColors = true;
    groundMat.color.setHex(0xffffff);
    const ground = new Mesh(geo, groundMat);
    ground.receiveShadow = true;
    ground.name = 'terrain';
    this.group.add(ground);

    // heightfield collision + surface type
    collision.setHeightField((x, z): GroundSample | null => {
      const half = TERRAIN_SIZE / 2 - 2;
      const cx = clamp(x, -half, half);
      const cz = clamp(z, -half, half);
      const h = this.heightAt(cx, cz);
      const dPool = Math.hypot(x - POOL.x, z - POOL.z);
      const surface: GroundSample['surface'] =
        dPool < 22 ? 'water' : Math.hypot(x - PAD.x, z - PAD.z) < PAD_RADIUS ? 'stone' : 'grass';
      return { height: h, surface };
    });

    // ------------------------------------------------------------- lighting
    // A real shadow-casting sun plus a sky/ground hemisphere fill. Emissive
    // bioluminescence is layered on top as accent, never as the light source.
    this.sun = new DirectionalLight(0xfff0d4, 3.4);
    this.sun.position.set(120, 190, -90);
    this.sun.castShadow = profile.shadows;
    if (profile.shadows) {
      this.sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      const cam = this.sun.shadow.camera;
      cam.left = -130; cam.right = 130; cam.top = 130; cam.bottom = -130;
      cam.near = 1; cam.far = 520;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.06;
    }
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    const hemi = new HemisphereLight(0x9fe8c8, 0x2b3a22, 1.15);
    this.group.add(hemi);

    this.fog = new Fog(0x88c9b4, 60, 460);

    // --------------------------------------------------------------- skydome
    const sky = new Mesh(
      new SphereGeometry(1800, 40, 26),
      new MeshBasicMaterial({ color: 0x7fc6d8, side: BackSide, fog: false, depthWrite: false }),
    );
    this.group.add(sky);
    // gradient band near the horizon
    const horizon = new Mesh(
      new CylinderGeometry(1780, 1780, 700, 48, 1, true),
      new MeshBasicMaterial({
        color: 0xd9f0e4, side: BackSide, transparent: true, opacity: 0.5,
        fog: false, depthWrite: false,
      }),
    );
    horizon.position.y = 120;
    this.group.add(horizon);

    // a visible local star and a distant moon
    const localStar = new Mesh(
      new SphereGeometry(58, 24, 18),
      new MeshBasicMaterial({ color: 0xfff4d8, fog: false, depthWrite: false }),
    );
    localStar.position.set(760, 900, -620);
    this.group.add(localStar);
    const starGlow = new Mesh(
      new SphereGeometry(150, 24, 18),
      new MeshBasicMaterial({
        color: 0xffe6a8, transparent: true, opacity: 0.22,
        blending: AdditiveBlending, side: BackSide, fog: false, depthWrite: false,
      }),
    );
    starGlow.position.copy(localStar.position);
    this.group.add(starGlow);

    const moon = new Mesh(
      new SphereGeometry(110, 28, 20),
      new MeshBasicMaterial({ color: 0xc7d4dd, fog: false, transparent: true, opacity: 0.72, depthWrite: false }),
    );
    moon.position.set(-880, 620, -1100);
    this.group.add(moon);

    // ------------------------------------------------------------ vegetation
    this.scatterVegetation();
    this.buildWaterfall();
    this.buildRuins();
    this.buildAtmosphere();
    this.buildPad();

    this.poolLight = new PointLight(0x46f5c8, 24, 90, 2);
    this.poolLight.position.set(POOL.x, 4, POOL.z);
    this.group.add(this.poolLight);
  }

  /** Terrain height. This is the single source of truth for ground level. */
  heightAt(x: number, z: number): number {
    const nx = x / 210;
    const nz = z / 210;
    let h = fbm2D(this.noise, nx, nz, 5, 2.05, 0.5) * HEIGHT_SCALE;
    h += fbm2D(this.detail, x / 52, z / 52, 3, 2.2, 0.45) * 3.4;

    // ---- escarpment ------------------------------------------------------
    // A raised plateau north-west of the pool whose southern edge is a genuine
    // cliff: height falls by CLIFF_DROP over just a few metres along `edgeZ`,
    // which is what the waterfall pours over.
    const edgeZ = WATERFALL.z + CLIFF_EDGE_OFFSET;
    const inPlateauX = 1 - smoothstep((Math.abs(x - WATERFALL.x) - 95) / 50);
    if (inPlateauX > 0.001) {
      // 0 south of the edge, 1 north of it, with a short sharp transition
      const rise = smoothstep((edgeZ - z) / CLIFF_SHARPNESS);
      h += rise * inPlateauX * CLIFF_DROP;
    }

    // ---- pool basin --------------------------------------------------------
    const dPool = Math.hypot(x - POOL.x, z - POOL.z);
    if (dPool < POOL_RADIUS) {
      const k = 1 - smoothstep(dPool / POOL_RADIUS);
      h = lerp(h, POOL_FLOOR, k * 0.95);
    }

    // ---- ruin plateau ------------------------------------------------------
    // The ruins sit on a raised, level terrace so the plaza reads as built and
    // the monolith is never half-drowned by the surrounding noise.
    const dRuin = Math.hypot(x - RUINS.x, z - RUINS.z);
    if (dRuin < RUIN_RADIUS + 26) {
      const k = 1 - smoothstep(clamp((dRuin - RUIN_RADIUS) / 26, 0, 1));
      h = lerp(h, RUIN_LEVEL, k);
    }

    // flatten the landing pad
    const dPad = Math.hypot(x - PAD.x, z - PAD.z);
    if (dPad < PAD_RADIUS + 26) {
      const k = 1 - smoothstep(clamp((dPad - PAD_RADIUS) / 26, 0, 1));
      h = lerp(h, 0, k);
    }
    return h;
  }

  /** Approximate surface normal, used to reject steep slopes when scattering. */
  private slopeAt(x: number, z: number): number {
    const d = 2.2;
    const hx = this.heightAt(x + d, z) - this.heightAt(x - d, z);
    const hz = this.heightAt(x, z + d) - this.heightAt(x, z - d);
    return Math.hypot(hx, hz) / (2 * d);
  }

  /**
   * Instanced scatter. Everything is placed with its base exactly on the
   * terrain and given a collider only when it is big enough to matter.
   */
  private scatterVegetation(): void {
    const { assets, collision, profile } = this.deps;
    const r = rng(0x9c3f);

    interface Layer {
      ids: string[];
      count: number;
      minScale: number;
      maxScale: number;
      maxSlope: number;
      solid: boolean;
      colliderRadius?: number;
      avoidPad: number;
      tilt: number;
    }

    const density = profile.pixelRatio >= 1.2 ? 1 : profile.pixelRatio >= 1 ? 0.7 : 0.45;

    const layers: Layer[] = [
      { ids: ['jungle_tree_1', 'jungle_tree_2', 'palm_1', 'palm_2'], count: Math.round(300 * density), minScale: 1.6, maxScale: 3.4, maxSlope: 0.55, solid: true, colliderRadius: 1.1, avoidPad: 52, tilt: 0.04 },
      { ids: ['alien_tree_1', 'alien_tree_2', 'alien_tree_3', 'alien_tree_4', 'alien_tree_5', 'alien_tree_6'], count: Math.round(210 * density), minScale: 1.1, maxScale: 2.6, maxSlope: 0.6, solid: true, colliderRadius: 0.9, avoidPad: 48, tilt: 0.07 },
      { ids: ['alien_bush_1', 'alien_bush_2', 'fern'], count: Math.round(520 * density), minScale: 0.7, maxScale: 1.7, maxSlope: 0.8, solid: false, avoidPad: 34, tilt: 0.12 },
      { ids: ['alien_grass_1', 'alien_grass_2'], count: Math.round(1500 * density), minScale: 0.6, maxScale: 1.5, maxSlope: 0.9, solid: false, avoidPad: 30, tilt: 0.16 },
      { ids: ['alien_plant_1', 'alien_plant_2'], count: Math.round(300 * density), minScale: 0.8, maxScale: 1.9, maxSlope: 0.75, solid: false, avoidPad: 32, tilt: 0.1 },
      { ids: ['flower_1', 'flower_2'], count: Math.round(420 * density), minScale: 0.6, maxScale: 1.4, maxSlope: 0.7, solid: false, avoidPad: 30, tilt: 0.14 },
      { ids: ['mushroom_1', 'mushroom_2'], count: Math.round(260 * density), minScale: 0.7, maxScale: 2.0, maxSlope: 0.7, solid: false, avoidPad: 30, tilt: 0.18 },
      { ids: ['rock_1', 'rock_2', 'rock_3', 'rock_4'], count: Math.round(150 * density), minScale: 0.8, maxScale: 2.6, maxSlope: 1.4, solid: true, colliderRadius: 1.6, avoidPad: 46, tilt: 0.2 },
      { ids: ['pebble_1', 'pebble_2'], count: Math.round(420 * density), minScale: 0.6, maxScale: 1.8, maxSlope: 1.2, solid: false, avoidPad: 26, tilt: 0.3 },
    ];

    const half = TERRAIN_SIZE / 2 - 14;

    for (const layer of layers) {
      // group transforms per source model so each becomes one InstancedMesh
      const perId = new Map<string, Matrix4[]>();
      for (let i = 0; i < layer.count; i++) {
        const x = r.range(-half, half);
        const z = r.range(-half, half);

        if (Math.hypot(x - PAD.x, z - PAD.z) < layer.avoidPad) continue;
        // keep the pool and the ruin plaza clear
        if (Math.hypot(x - POOL.x, z - POOL.z) < 30) continue;
        if (Math.hypot(x - RUINS.x, z - RUINS.z) < 20) continue;
        if (this.slopeAt(x, z) > layer.maxSlope) continue;

        const y = this.heightAt(x, z);
        if (y < -2.6) continue; // underwater

        const id = layer.ids[Math.floor(r() * layer.ids.length) % layer.ids.length];
        const s = r.range(layer.minScale, layer.maxScale);
        const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * Math.PI * 2);
        if (layer.tilt > 0) {
          // slight random lean so scattered growth never looks stamped
          q.multiply(
            new Quaternion().setFromEuler(
              new Euler(r.range(-layer.tilt, layer.tilt), 0, r.range(-layer.tilt, layer.tilt)),
            ),
          );
        }
        const m = new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(s, s, s));
        let list = perId.get(id);
        if (!list) { list = []; perId.set(id, list); }
        list.push(m);

        if (layer.solid && layer.colliderRadius) {
          const rad = layer.colliderRadius * s;
          collision.addBox(x, y + 2.5, z, rad * 2, 6, rad * 2);
        }
      }

      for (const [id, matrices] of perId) {
        if (matrices.length === 0) continue;
        const proto = assets.instance(id, { clone: false });
        proto.updateMatrixWorld(true);
        const meshes: Mesh[] = [];
        proto.traverse((n) => {
          const mm = n as Mesh;
          if (mm.isMesh) meshes.push(mm);
        });
        for (const src of meshes) {
          const inst = new InstancedMesh(src.geometry, src.material, matrices.length);
          inst.castShadow = layer.solid;
          inst.receiveShadow = true;
          const local = src.matrixWorld;
          const tmp = new Matrix4();
          for (let i = 0; i < matrices.length; i++) {
            tmp.multiplyMatrices(matrices[i], local);
            inst.setMatrixAt(i, tmp);
          }
          inst.instanceMatrix.needsUpdate = true;
          this.group.add(inst);
        }
      }
    }
  }

  /** Cliff, cascading water and the glowing pool. */
  private buildWaterfall(): void {
    const { mats, audio, interact, state, assets } = this.deps;

    // Anchor the fall to the measured cliff profile: scan south along the face
    // and take the lip (last high sample) and the foot (first basin sample).
    const lipX = WATERFALL.x + 6;
    const scanFrom = WATERFALL.z + CLIFF_EDGE_OFFSET - 14;
    const topY = this.heightAt(lipX, scanFrom);
    let lipZ = scanFrom;
    let footZ = scanFrom + 16;
    for (let z = scanFrom; z < scanFrom + 60; z += 0.25) {
      const hz = this.heightAt(lipX, z);
      if (hz > topY - 1.5) lipZ = z;
      if (hz < POOL_FLOOR + 1.5) { footZ = z; break; }
    }
    const lipY = this.heightAt(lipX, lipZ);
    const basinY = POOL_FLOOR;
    const fallHeight = Math.max(lipY - basinY, 16);
    const width = 18;
    // Hang the sheet vertically just in front of the face, spanning lip to basin.
    const faceZ = (lipZ + footZ) / 2;
    const sheetZ = faceZ + 1.6;

    const group = new Group();
    this.group.add(group);

    // Boulders flanking the lip, each sunk into the terrain it actually rests
    // on (measured, then biased down so no rock ever floats).
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const t = side * (width / 2 + 1.5 + (i % 3) * 3.2);
      const id = i % 2 ? 'rock_2' : 'rock_1';
      const rock = assets.instance(id);
      const info = assets.info(id);
      const sc = info && info.size.y > 0.1 ? (5.5 + (i % 3)) / info.size.y : 1;
      rock.scale.setScalar(sc);
      const rz = lipZ - 1.5 + (i % 3) * 1.2;
      const rx = lipX + t;
      rock.position.set(rx, this.heightAt(rx, rz) - 1.8, rz);
      rock.rotation.y = i * 1.3;
      group.add(rock);
    }

    // The falling sheet: a slightly tapered ribbon from lip to basin.
    const sheet = new Mesh(
      new PlaneGeometry(width, fallHeight, 1, 16),
      new MeshStandardMaterial({
        color: 0xd8f2f6,
        roughness: 0.06,
        metalness: 0.0,
        transparent: true,
        opacity: 0.72,
        side: DoubleSide,
        emissive: new Color(0x2ba6c4),
        emissiveIntensity: 0.25,
      }),
    );
    sheet.position.set(lipX, basinY + fallHeight / 2, sheetZ);
    group.add(sheet);

    const veils: Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const veil = new Mesh(
        new PlaneGeometry(width - i * 2.6, fallHeight * 0.98),
        new MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.1 + i * 0.04,
          blending: AdditiveBlending,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      veil.position.set(lipX, basinY + fallHeight / 2, sheetZ + 0.7 + i * 0.55);
      group.add(veil);
      veils.push(veil);
    }

    // ---- the glowing pool ---------------------------------------------------
    const poolMesh = new Mesh(new PlaneGeometry(64, 64, 32, 32), mats.water);
    poolMesh.rotation.x = -Math.PI / 2;
    poolMesh.position.set(POOL.x, -1.1, POOL.z);
    this.group.add(poolMesh);
    const poolGeo = poolMesh.geometry as PlaneGeometry;
    const poolPos = poolGeo.attributes.position as BufferAttribute;
    const basePool = Float32Array.from(poolPos.array as Float32Array);

    const glowFloor = new Mesh(
      new PlaneGeometry(56, 56),
      new MeshBasicMaterial({
        color: 0x2ff0c0,
        transparent: true,
        opacity: 0.4,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    glowFloor.rotation.x = -Math.PI / 2;
    glowFloor.position.set(POOL.x, -2.6, POOL.z);
    this.group.add(glowFloor);

    // ---- mist at the base ----------------------------------------------------
    const MIST = 420;
    const mp = new Float32Array(MIST * 3);
    const r = rng(0x4411);
    for (let i = 0; i < MIST; i++) {
      mp[i * 3] = lipX + (r() - 0.5) * (width + 18);
      mp[i * 3 + 1] = basinY + r() * 26;
      mp[i * 3 + 2] = footZ + 2 + (r() - 0.5) * 22;
    }
    const mistGeo = new BufferGeometry();
    mistGeo.setAttribute('position', new BufferAttribute(mp, 3));
    const mist = new Points(
      mistGeo,
      new PointsMaterial({
        color: 0xdff6ff,
        size: 3.2,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    mist.frustumCulled = false;
    this.group.add(mist);

    interact.register({
      id: 'pool',
      position: new Vector3(POOL.x, 1, POOL.z + 30),
      radius: 12,
      kind: 'use',
      label: 'Sample the pool',
      onUse: () => {
        audio.noiseBurst({ duration: 1.1, gain: 0.14, filter: 2400, filterEnd: 900, q: 0.6 });
        state.subtitle('The water is warm and faintly luminous. Whatever glows in it is alive.', 6);
        state.completeObjective('pool');
        return 'Sample the pool';
      },
    });

    const sheetMat = sheet.material as MeshStandardMaterial;
    this.tickers.push((dt, t) => {
      sheetMat.emissiveIntensity = 0.22 + Math.sin(t * 2.2) * 0.05;
      for (let i = 0; i < veils.length; i++) {
        const m = veils[i].material as MeshBasicMaterial;
        m.opacity = 0.08 + Math.abs(Math.sin(t * (1.6 + i * 0.5))) * 0.1;
        veils[i].scale.y = 1 + Math.sin(t * (2.1 + i)) * 0.012;
      }

      for (let i = 0; i < poolPos.count; i++) {
        const x = basePool[i * 3];
        const y = basePool[i * 3 + 1];
        poolPos.setZ(i, Math.sin(x * 0.11 + t * 1.5) * 0.36 + Math.cos(y * 0.13 + t * 1.1) * 0.3);
      }
      poolPos.needsUpdate = true;

      const arr = mistGeo.attributes.position as BufferAttribute;
      for (let i = 0; i < MIST; i++) {
        let y = arr.getY(i) + dt * (2.4 + (i % 7) * 0.4);
        if (y > basinY + 26) y = basinY;
        arr.setY(i, y);
      }
      arr.needsUpdate = true;

      this.poolLight.intensity = 20 + Math.sin(t * 1.3) * 5;
      (glowFloor.material as MeshBasicMaterial).opacity = 0.34 + Math.sin(t * 1.7) * 0.07;
    });

    audio.loop('water', 'water', 'ambient');
    audio.setLoopGain('water', 0, 0.1);
  }

  /** Overgrown alien ruins holding the signal source. */
  private buildRuins(): void {
    const { assets, mats, collision, interact, audio, state } = this.deps;
    const r = rng(0x7ee2);
    const base = this.heightAt(RUINS.x, RUINS.z);

    const place = (id: string, dx: number, dz: number, s: number, ry: number, solid = true): Object3D => {
      const x = RUINS.x + dx;
      const z = RUINS.z + dz;
      const y = this.heightAt(x, z);
      const node = assets.instance(id);
      const info = assets.info(id);
      const scale = info && info.size.y > 0.1 ? s / info.size.y : s;
      node.scale.setScalar(scale);
      node.position.set(x, y, z);
      node.rotation.y = ry;
      node.traverse((n) => {
        const m = n as Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      });
      this.group.add(node);
      if (solid && info) {
        collision.addBox(x, y + (info.size.y * scale) / 2, z,
          Math.max(info.size.x * scale * 0.8, 0.8),
          info.size.y * scale,
          Math.max(info.size.z * scale * 0.8, 0.8));
      }
      return node;
    };

    // a colonnade leading to the central plaza
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const dz = -26 + t * 52;
      place('ruin_column', -13, dz, 7.5 + r() * 1.5, r() * 0.3);
      place(i % 2 === 0 ? 'ruin_column' : 'ruin_column_short', 13, dz, 6.5 + r() * 2, r() * 0.3);
    }
    place('ruin_arch', 0, -30, 9.5, 0);
    place('ruin_arch_gothic', 0, 30, 9.0, Math.PI);
    place('ruin_wall_arch', -22, 6, 7.5, Math.PI / 2);
    place('ruin_wall', 22, -8, 6.0, -Math.PI / 2);
    place('ruin_wall_broken', 20, 14, 5.0, -Math.PI / 2 + 0.3);
    place('ruin_statue', -8, 16, 7.0, 0.6);
    place('ruin_stairs', 0, 12, 2.2, Math.PI);
    place('ruin_pot', 6, 8, 1.4, 0.4);
    place('ruin_pot', -5, -12, 1.2, -0.8);
    place('ruin_support', 16, -20, 8.0, 0.2);

    // ruin floor slabs across the plaza
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const x = RUINS.x + i * 7.5;
        const z = RUINS.z + j * 7.5;
        const y = this.heightAt(x, z);
        const slab = new Mesh(new PlaneGeometry(7.4, 7.4), mats.stone);
        slab.rotation.x = -Math.PI / 2;
        slab.position.set(x, y + 0.06, z);
        slab.receiveShadow = true;
        this.group.add(slab);
      }
    }

    // ---- carved glyphs and emissive markings --------------------------------
    const glyphMat = new MeshBasicMaterial({
      color: 0x6cf5d8, transparent: true, opacity: 0.7,
      blending: AdditiveBlending, side: DoubleSide, depthWrite: false,
    });
    const glyphs: Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rad = 17;
      const x = RUINS.x + Math.cos(a) * rad;
      const z = RUINS.z + Math.sin(a) * rad;
      const y = this.heightAt(x, z);
      const glyph = new Mesh(new PlaneGeometry(1.5, 1.5), glyphMat.clone());
      glyph.rotation.x = -Math.PI / 2;
      glyph.rotation.z = a;
      glyph.position.set(x, y + 0.1, z);
      this.group.add(glyph);
      glyphs.push(glyph);
    }

    // ---- the signal source ---------------------------------------------------
    const sigY = this.heightAt(SIGNAL.x, SIGNAL.z);
    const monolith = new Mesh(
      new SphereGeometry(1, 4, 2),
      new MeshStandardMaterial({
        color: 0x1b2630, roughness: 0.42, metalness: 0.55,
        emissive: new Color(0x1de0b4), emissiveIntensity: 0.5,
      }),
    );
    monolith.scale.set(2.0, 7.0, 2.0);
    monolith.position.set(SIGNAL.x, sigY + 6.6, SIGNAL.z);
    monolith.castShadow = true;
    this.group.add(monolith);
    collision.addBox(SIGNAL.x, sigY + 6, SIGNAL.z, 4.5, 12, 4.5);

    const halo = new Mesh(
      new SphereGeometry(4.2, 20, 14),
      new MeshBasicMaterial({
        color: 0x2ff0c0, transparent: true, opacity: 0.12,
        blending: AdditiveBlending, side: BackSide, depthWrite: false,
      }),
    );
    halo.position.copy(monolith.position);
    this.group.add(halo);

    const sigLight = new PointLight(0x2ff0c0, 26, 70, 2);
    sigLight.position.set(SIGNAL.x, sigY + 9, SIGNAL.z);
    this.group.add(sigLight);

    interact.register({
      id: 'signal_source',
      position: new Vector3(SIGNAL.x, sigY + 2, SIGNAL.z),
      radius: 8,
      kind: 'use',
      label: 'Touch the monolith',
      onUse: () => {
        if (state.signalFound) {
          state.subtitle('The tone continues, patient as ever. It has waited far longer than you have.', 6);
          return 'Touch the monolith';
        }
        state.signalFound = true;
        audio.tone({ freq: 220, freqEnd: 880, duration: 2.4, gain: 0.1, type: 'sine' });
        audio.tone({ freq: 330, duration: 2.0, gain: 0.06, type: 'triangle', delay: 0.3 });
        state.completeObjective('signal');
        state.subtitle(
          'The stone is warm. Eleven tones repeat under your palm — the same eleven the relay has sent for eleven months. It is not a warning. It is an invitation.',
          11,
        );
        state.toast('SIGNAL SOURCE LOCATED', 'good');
        window.dispatchEvent(new CustomEvent('aurora:signal'));
        return 'Touch the monolith';
      },
    });

    this.tickers.push((_dt, t) => {
      const pulse = 0.4 + Math.abs(Math.sin(t * 0.9)) * 0.7;
      (monolith.material as MeshStandardMaterial).emissiveIntensity = pulse;
      sigLight.intensity = 16 + pulse * 18;
      (halo.material as MeshBasicMaterial).opacity = 0.08 + pulse * 0.1;
      halo.scale.setScalar(1 + Math.sin(t * 0.9) * 0.06);
      for (let i = 0; i < glyphs.length; i++) {
        const m = glyphs[i].material as MeshBasicMaterial;
        m.opacity = 0.25 + Math.abs(Math.sin(t * 0.8 + i * 0.4)) * 0.5;
      }
    });
    void base;
  }

  /** Spores, god rays and drifting pollen. */
  private buildAtmosphere(): void {
    const r = rng(0x22ff);

    // ---- floating glowing spores --------------------------------------------
    const COUNT = 900;
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const c = new Color();
    const half = TERRAIN_SIZE / 2 - 30;
    for (let i = 0; i < COUNT; i++) {
      const x = r.range(-half, half);
      const z = r.range(-half, half);
      pos[i * 3] = x;
      pos[i * 3 + 1] = this.heightAt(x, z) + r.range(0.6, 26);
      pos[i * 3 + 2] = z;
      c.setHSL(r() < 0.7 ? 0.44 : 0.78, 0.85, 0.62);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    const spores = new Points(
      geo,
      new PointsMaterial({
        size: 1.5, vertexColors: true, transparent: true, opacity: 0.85,
        blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      }),
    );
    spores.frustumCulled = false;
    this.group.add(spores);

    const basePos = Float32Array.from(pos);
    this.tickers.push((_dt, t) => {
      const arr = geo.attributes.position as BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        arr.setX(i, basePos[i * 3] + Math.sin(t * 0.28 + i * 0.7) * 2.6);
        arr.setY(i, basePos[i * 3 + 1] + Math.sin(t * 0.42 + i * 1.3) * 1.5);
        arr.setZ(i, basePos[i * 3 + 2] + Math.cos(t * 0.24 + i * 0.9) * 2.6);
      }
      arr.needsUpdate = true;
    });

    // ---- god rays through the canopy ----------------------------------------
    const rayMat = new MeshBasicMaterial({
      color: 0xdcf7d8, transparent: true, opacity: 0.055,
      blending: AdditiveBlending, side: DoubleSide, depthWrite: false,
    });
    for (let i = 0; i < 22; i++) {
      const x = r.range(-half * 0.8, half * 0.8);
      const z = r.range(-half * 0.8, half * 0.8);
      const h = this.heightAt(x, z);
      const shaft = new Mesh(new CylinderGeometry(1.4, 8.5, 46, 8, 1, true), rayMat);
      shaft.position.set(x, h + 23, z);
      shaft.rotation.z = -0.22;
      this.group.add(shaft);
    }
  }

  /** A visible landing pad so the ship is grounded in the world. */
  private buildPad(): void {
    // Sunk slightly and given a solid rim so it never z-fights the terrain
    // mesh it sits inside.
    const pad = new Mesh(
      new CylinderGeometry(PAD_RADIUS, PAD_RADIUS + 2.5, 1.2, 72),
      new MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.92, metalness: 0.08 }),
    );
    pad.position.set(PAD.x, -0.55, PAD.z);
    pad.receiveShadow = true;
    this.group.add(pad);

    // landing-zone markings, lifted clear of the pad surface
    const ringMat = new MeshBasicMaterial({
      color: 0xffb000, transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false,
    });
    for (const r of [PAD_RADIUS - 4, PAD_RADIUS - 12]) {
      const ring = new Mesh(new RingGeometry(r - 0.7, r, 96), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(PAD.x, 0.09, PAD.z);
      this.group.add(ring);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const mark = new Mesh(new PlaneGeometry(1.1, 5.5), ringMat);
      mark.rotation.x = -Math.PI / 2;
      mark.rotation.z = -a;
      mark.position.set(
        PAD.x + Math.cos(a) * (PAD_RADIUS - 8),
        0.09,
        PAD.z + Math.sin(a) * (PAD_RADIUS - 8),
      );
      this.group.add(mark);
    }
  }

  update(dt: number, listener: Vector3): void {
    this.elapsed += dt;
    for (const t of this.tickers) t(dt, this.elapsed);

    // waterfall audio falls off with distance
    const { audio } = this.deps;
    if (audio.isRunning) {
      const d = Math.hypot(listener.x - POOL.x, listener.z - POOL.z);
      audio.setLoopGain('water', clamp(1 - d / 170, 0, 1) * 0.55, 0.5);
      const wind = 0.14 + clamp(listener.y / 60, 0, 1) * 0.16;
      audio.setLoopGain('wind', wind, 1.0);
    }

    // keep the sun shadow frustum centred on the player
    this.sun.position.set(listener.x + 120, 190, listener.z - 90);
    this.sun.target.position.set(listener.x, 0, listener.z);
    this.sun.target.updateMatrixWorld();
  }
}
