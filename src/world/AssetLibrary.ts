import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

/**
 * Local asset library for professionally authored, legally reusable media.
 *
 * The HDRI environment maps are CC0-licensed Poly Haven environments shipped
 * inside the installed `@pmndrs/assets` package as base64 data URLs (no CDN
 * hot-linking, no runtime network access). They provide image-based lighting
 * and reflections for the ship interior, hull, spaceflight and jungle surface.
 * See ASSET_CREDITS.md for full attribution.
 *
 * Loads are dynamic and cached so the heavy EXR/PMREM work happens once.
 */
export type EnvironmentName = 'studio' | 'forest';

// Static import maps keep the bundler able to split these into on-demand chunks.
const ENV_MODULES: Record<EnvironmentName, () => Promise<{ default: string }>> = {
  studio: () => import('@pmndrs/assets/hdri/studio.exr.js'),
  forest: () => import('@pmndrs/assets/hdri/forest.exr.js'),
};

const exrLoader = new EXRLoader();
const envCache = new Map<string, THREE.Texture>();
let pmrem: THREE.PMREMGenerator | null = null;

/** Builds a PMREM-filtered environment map (CC0 HDRI) for image-based lighting. */
export async function loadEnvironment(renderer: THREE.WebGLRenderer, name: EnvironmentName): Promise<THREE.Texture> {
  const cached = envCache.get(name);
  if (cached) return cached;
  const mod = await ENV_MODULES[name]();
  const equirect = await exrLoader.loadAsync(mod.default);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(equirect).texture;
  environment.name = `env:${name}`;
  equirect.dispose();
  envCache.set(name, environment);
  return environment;
}

/** Releases GPU-side environment textures (used when quality drops). */
export function disposeEnvironmentCache(): void {
  for (const texture of envCache.values()) texture.dispose();
  envCache.clear();
  pmrem?.dispose();
  pmrem = null;
}
