import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";

/**
 * AssetLoader — resolves every real asset from /assets (which are downloaded,
 * verified files in public/assets). Any asset a player has dropped into the
 * repo per ASSET_DOWNLOAD_MANIFEST.md is picked up automatically because the
 * loader always prefers the real file path on disk.
 */

const BASE = "assets/";

export class AssetLoader {
  private texLoader = new THREE.TextureLoader();
  private gltfLoader = new GLTFLoader();
  private exrLoader = new EXRLoader();
  private texCache = new Map<string, THREE.Texture>();
  private gltfCache = new Map<string, THREE.Group>();

  setPathForTextures(base: string): void {
    void base;
  }

  texture(path: string, repeat = 1): THREE.Texture {
    const key = `${path}|${repeat}`;
    const hit = this.texCache.get(key);
    if (hit) return hit;
    const tex = this.texLoader.load(BASE + path);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 8;
    this.texCache.set(key, tex);
    return tex;
  }

  /** Load a texture WITHOUT sRGB / repeat (e.g. normal maps, data maps). */
  dataTexture(path: string, repeat = 1): THREE.Texture {
    const key = `d|${path}|${repeat}`;
    const hit = this.texCache.get(key);
    if (hit) return hit;
    const tex = this.texLoader.load(BASE + path);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 8;
    this.texCache.set(key, tex);
    return tex;
  }

  async gltf(path: string): Promise<THREE.Group> {
    const hit = this.gltfCache.get(path);
    if (hit) return hit;
    const gltf = await this.gltfLoader.loadAsync(BASE + path);
    this.gltfCache.set(path, gltf.scene);
    return gltf.scene;
  }

  async hdri(path: string): Promise<THREE.DataTexture> {
    const tex = await this.exrLoader.loadAsync(BASE + path);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  /** Build an environment from an HDRI via PMREM. */
  async environment(renderer: THREE.WebGLRenderer, hdriPath: string): Promise<THREE.Texture> {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const hdri = await this.hdri(hdriPath);
    const env = pmrem.fromEquirectangular(hdri).texture;
    hdri.dispose();
    pmrem.dispose();
    return env;
  }
}

export const assetLoader = new AssetLoader();
