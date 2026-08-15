/**
 * captureEntry — builds the REAL game scenes headlessly for visual QA.
 *
 * This is compiled by `npm run capture` (Vite SSR build) and driven by
 * tools/capture.mjs. It deliberately instantiates the same Ship, Planet and
 * ShipExterior classes the game uses, so what gets rendered for inspection is
 * the shipping content and not a mock-up.
 */

import { DoubleSide, Group, Mesh, MeshStandardMaterial, Object3D, Scene, Vector3 } from 'three';

import { resolveSwatch } from './assets/palette';

import type { AssetLoader } from './assets/assetLoader';
import { AudioEngine } from './core/audio';
import { GameState } from './core/state';
import { QUALITY, type QualityProfile } from './core/renderer';
import { InteractionSystem } from './systems/interaction';
import { CollisionWorld } from './systems/collision';
import { createMaterials } from './world/materials';
import { Planet, PAD, POOL, RUINS, SIGNAL } from './world/planet';
import { Ship } from './world/ship/ship';
import { ShipExterior } from './world/shipExterior';
import { SolarSystem } from './world/space';

export { runSmoke } from './smoke';

export interface CaptureResult {
  scene: Scene;
  /** Suggested camera framing for the renderer. */
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number };
  stats: Record<string, number>;
}

function crop(root: Object3D, center: Vector3, radius: number): Group {
  /** Keep only nodes near `center` so a single room can be inspected. */
  const out = new Group();
  const keep: Object3D[] = [];
  root.updateMatrixWorld(true);
  root.traverse((n) => {
    if (n === root) return;
    const inst = n as { isInstancedMesh?: boolean };
    const isMesh = (n as { isMesh?: boolean }).isMesh;
    if (!isMesh && !inst.isInstancedMesh) return;
    // Structure is batched into scene-wide InstancedMeshes whose node origin is
    // the world origin, so a distance test would wrongly discard them. Always
    // keep them; the framing camera does the visual cropping.
    if (inst.isInstancedMesh) { keep.push(n); return; }
    const p = new Vector3();
    n.getWorldPosition(p);
    if (p.distanceTo(center) <= radius) keep.push(n);
  });
  for (const n of keep) {
    const clone = n.clone();
    clone.matrix.copy(n.matrixWorld);
    clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
    out.add(clone);
  }
  return out;
}

/**
 * The capture harness loads GLBs directly, bypassing AssetLoader.prepare(), so
 * apply the same atlas palettisation here — otherwise QA renders would show
 * grey foliage that the real game never displays.
 */
export function applyCapturePalette(root: Object3D, id: string): void {
  root.traverse((n) => {
    const mesh = n as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as MeshStandardMaterial;
      if (!std || std.map || std.userData.__palettised) continue;
      const tint = resolveSwatch(id, std.name || '');
      if (!tint) continue;
      std.userData.__palettised = true;
      std.color.setHex(tint.color);
      if (tint.roughness !== undefined) std.roughness = tint.roughness;
      if (tint.metalness !== undefined) std.metalness = tint.metalness;
      if (tint.emissive !== undefined) {
        std.emissive.setHex(tint.emissive);
        std.emissiveIntensity = tint.emissiveIntensity ?? 0.2;
      }
      if (tint.doubleSided) std.side = DoubleSide;
    }
  });
}

export async function buildScene(
  name: string,
  assets: AssetLoader,
  quality: QualityProfile = QUALITY.high,
): Promise<CaptureResult> {
  const scene = new Scene();
  const audio = new AudioEngine();
  const state = new GameState();
  const interact = new InteractionSystem();
  const mats = createMaterials(assets);
  const stats: Record<string, number> = {};

  const shipOf = (): Ship =>
    new Ship({ assets, mats, audio, state, interact, profile: quality });

  switch (name) {
    case 'ship':
    case 'interior': {
      const ship = shipOf();
      scene.add(ship.group);
      stats.colliders = ship.collision.count;
      stats.interactions = interact.size;
      stats.walls = (ship.group.getObjectByName('ship-structure')?.userData.wallCount as number) ?? -1;
      let structureMeshes = 0;
      ship.group.getObjectByName('ship-structure')?.traverse((n) => {
        if ((n as { isMesh?: boolean }).isMesh) structureMeshes++;
      });
      stats.structureMeshes = structureMeshes;
      return {
        scene,
        camera: { position: [58, 96, 118], target: [0, 0, 24], fov: 48 },
        stats,
      };
    }

    case 'bridge': {
      const ship = shipOf();
      const g = crop(ship.group, new Vector3(0, 1.5, -24), 20);
      scene.add(g);
      return { scene, camera: { position: [0, 2.2, -18.5], target: [0, 1.3, -28.5], fov: 74 }, stats };
    }

    case 'bridge-wide': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(0, 1.5, -23), 22));
      return { scene, camera: { position: [7.5, 2.6, -18.0], target: [-1.0, 1.2, -26.5], fov: 76 }, stats };
    }

    case 'cabin': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(-9, 1.4, -2.5), 11));
      return { scene, camera: { position: [-4.2, 2.0, 0.2], target: [-12, 1.0, -4.0], fov: 76 }, stats };
    }

    case 'warp': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(0, 2, 55), 18));
      return { scene, camera: { position: [6.5, 2.4, 59.5], target: [0, 2.1, 55], fov: 76 }, stats };
    }

    case 'reactor': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(9, 2, 47), 14));
      return { scene, camera: { position: [5.0, 2.3, 49.5], target: [9.5, 1.8, 46.5], fov: 76 }, stats };
    }

    case 'cargo': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(0, 1.6, 71), 20));
      return { scene, camera: { position: [0, 2.6, 65.5], target: [0, 1.2, 76], fov: 76 }, stats };
    }

    case 'medical': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(9, 1.5, 18), 12));
      return { scene, camera: { position: [4.6, 2.1, 20.8], target: [10.5, 1.0, 17.0], fov: 76 }, stats };
    }

    case 'storage': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(-9, 1.5, 34), 12));
      return { scene, camera: { position: [-4.2, 2.1, 36.8], target: [-10.5, 1.1, 33.0], fov: 76 }, stats };
    }

    case 'lounge': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(9, 1.5, -2), 12));
      return { scene, camera: { position: [4.4, 2.1, 0.8], target: [11.0, 1.0, -3.2], fov: 76 }, stats };
    }

    case 'galley': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(9, 1.5, 8), 12));
      return { scene, camera: { position: [4.4, 2.1, 10.8], target: [11.0, 1.0, 7.0], fov: 76 }, stats };
    }

    case 'science': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(-9, 1.5, 24), 12));
      return { scene, camera: { position: [-4.2, 2.1, 26.8], target: [-10.5, 1.1, 23.0], fov: 76 }, stats };
    }

    case 'corridor': {
      const ship = shipOf();
      scene.add(crop(ship.group, new Vector3(0, 1.5, 20), 26));
      return { scene, camera: { position: [0, 1.7, -10], target: [0, 1.5, 40], fov: 78 }, stats };
    }

    case 'exterior': {
      const ext = new ShipExterior(assets, mats);
      ext.setGear(1);
      ext.setThrust(0.6);
      ext.update(0.016);
      scene.add(ext.group);
      return {
        scene,
        camera: { position: [150, 70, 200], target: [0, 2, 24], fov: 50 },
        stats,
      };
    }

    case 'space': {
      const sys = new SolarSystem(assets);
      sys.update(40);
      scene.add(sys.group);
      return { scene, camera: { position: [0, 3000, 9000], target: [0, 0, 0], fov: 55 }, stats };
    }

    case 'planet':
    case 'ruins':
    case 'pool': {
      const collision = new CollisionWorld();
      const planet = new Planet({
        assets, mats, collision, interact, audio, state, profile: quality,
      });
      scene.add(planet.group);
      stats.colliders = collision.count;

      if (name === 'ruins') {
        return {
          scene,
          camera: {
            position: [RUINS.x - 44, planet.heightAt(RUINS.x - 44, RUINS.z + 40) + 16, RUINS.z + 46],
            target: [SIGNAL.x, planet.heightAt(SIGNAL.x, SIGNAL.z) + 6, SIGNAL.z],
            fov: 60,
          },
          stats,
        };
      }
      if (name === 'pool') {
        return {
          scene,
          camera: {
            // frame the cliff face and the fall from across the basin
            position: [POOL.x + 26, 11, POOL.z + 40],
            target: [POOL.x - 6, 12, POOL.z - 22],
            fov: 62,
          },
          stats,
        };
      }
      return {
        scene,
        camera: {
          position: [PAD.x + 62, planet.heightAt(PAD.x + 62, PAD.z + 86) + 30, PAD.z + 96],
          target: [PAD.x, 4, PAD.z - 20],
          fov: 60,
        },
        stats,
      };
    }

    case 'landed': {
      const collision = new CollisionWorld();
      const planet = new Planet({ assets, mats, collision, interact, audio, state, profile: quality });
      scene.add(planet.group);
      const ext = new ShipExterior(assets, mats);
      ext.setGear(1);
      ext.update(0.016);
      ext.group.position.set(PAD.x, 6.6, PAD.z - 40);
      scene.add(ext.group);
      return {
        scene,
        camera: { position: [PAD.x + 78, 34, PAD.z + 62], target: [PAD.x, 6, PAD.z - 30], fov: 56 },
        stats,
      };
    }

    default:
      throw new Error(`unknown scene "${name}"`);
  }
}
