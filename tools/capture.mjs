/**
 * capture.mjs — headless scene capture for visual QA.
 *
 * The sandbox has no browser, so this harness stands up just enough of a DOM
 * for three.js to build the *real* game scenes in Node, then exports the
 * result to .glb. tools/glbview.py rasterises those files so the geometry,
 * placement and composition can actually be looked at.
 *
 * Usage:  node tools/capture.mjs <scene> <out.glb>
 *         scenes: ship | bridge | warp | cargo | planet | ruins | pool | exterior
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

import './capture-dom.mjs';

const THREE = await import('three');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

// Serve public/ files to the loaders straight off disk.
THREE.DefaultLoadingManager.setURLModifier((url) => url);
const origLoad = THREE.FileLoader.prototype.load;
THREE.FileLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  let rel = String(url).replace(/^https?:\/\/[^/]+/, '');
  rel = rel.replace(/^\.?\//, '');
  const file = path.join(PUBLIC, rel);
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    const out = this.responseType === 'arraybuffer'
      ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      : buf.toString('utf8');
    setTimeout(() => onLoad(out), 0);
    return;
  }
  return origLoad.call(this, url, onLoad, onProgress, onError);
};

// TextureLoader can't decode images in Node; hand back a 1x1 stub so materials
// keep their structure (colour/roughness still export correctly).
THREE.TextureLoader.prototype.load = function (_url, onLoad) {
  const t = new THREE.Texture();
  t.image = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };
  t.needsUpdate = true;
  if (onLoad) setTimeout(() => onLoad(t), 0);
  return t;
};

// ------------------------------------------------------------------ helpers

import { loadAssets } from './capture-assets.mjs';

const assets = await loadAssets();

// ------------------------------------------------------------ build a scene

const [, , sceneName = 'ship', outPath = 'shot.glb'] = process.argv;

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
const { buildScene } = await import('../.capture/captureEntry.mjs');
const result = await buildScene(sceneName, assets);
const scene = result.scene;
console.error('[capture] stats', JSON.stringify(result.stats));
fs.writeFileSync(
  outPath.replace(/\.glb$/, '.cam.json'),
  JSON.stringify(result.camera),
);

// ------------------------------------------------------------------- export
//
// Node has no real canvas, so any CanvasTexture (the in-world UI screens) has
// no exportable image. Swap those slots for a representative flat colour so the
// panels still read as lit screens in the QA render instead of aborting it.
// The GLTF exporter writes InstancedMesh as an EXT_mesh_gpu_instancing node,
// which the offline rasteriser does not implement. Bake every instance into a
// plain Mesh so the QA render shows exactly what the game draws.
{
  const toBake = [];
  scene.traverse((n) => { if (n.isInstancedMesh) toBake.push(n); });
  for (const inst of toBake) {
    const parent = inst.parent ?? scene;
    const group = new THREE.Group();
    group.name = (inst.name || 'inst') + '_baked';
    const m = new THREE.Matrix4();
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, m);
      const mesh = new THREE.Mesh(inst.geometry, inst.material);
      mesh.applyMatrix4(m);
      group.add(mesh);
    }
    group.applyMatrix4(inst.matrix);
    parent.add(group);
    parent.remove(inst);
  }
  console.error(`[capture] baked ${toBake.length} instanced meshes`);
}

const texAvg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/texavg.json'), 'utf8'));

const stubbed = new Set();
scene.traverse((n) => {
  const mesh = n;
  if (!mesh.isMesh && !mesh.isInstancedMesh) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    if (!m || stubbed.has(m)) continue;
    stubbed.add(m);
    for (const slot of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'displacementMap']) {
      const tex = m[slot];
      if (!tex) continue;
      // fold the texture's average colour into the base colour so the QA render
      // still shows the real material palette
      if (slot === 'map' && m.color) {
        const name = tex.name || tex.image?.src || tex.userData?.file || '';
        const key = Object.keys(texAvg).find((k) => String(name).includes(k.replace(/\.[^.]+$/, '')));
        const avg = key ? texAvg[key] : null;
        if (avg) m.color.setRGB(m.color.r * avg[0] * 1.6, m.color.g * avg[1] * 1.6, m.color.b * avg[2] * 1.6);
      }
      if (slot === 'emissiveMap' && m.emissive) {
        m.emissive.setHex(0x24c8ff);
        m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 1, 1.1);
      }
      m[slot] = null;
      m.needsUpdate = true;
    }
  }
});

const exporter = new GLTFExporter();
const glb = await new Promise((res, rej) =>
  exporter.parse(scene, res, rej, { binary: true, onlyVisible: true, truncateDrawRange: false }),
);
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, Buffer.from(glb));
console.error(`[capture] wrote ${outPath} (${(glb.byteLength / 1e6).toFixed(1)} MB)`);
