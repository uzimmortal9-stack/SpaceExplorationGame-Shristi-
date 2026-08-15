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

// ---------------------------------------------------------------- DOM shims

class FakeCtx {
  constructor(w, h) { this.canvas = { width: w, height: h }; }
  fillRect() {} strokeRect() {} beginPath() {} moveTo() {} lineTo() {}
  stroke() {} fill() {} fillText() {} strokeText() {} arc() {} closePath() {}
  save() {} restore() {} translate() {} rotate() {} scale() {} clearRect() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  drawImage() {} putImageData() {}
  getImageData(_x, _y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  measureText(t) { return { width: (t?.length ?? 0) * 8 }; }
  set font(_v) {} get font() { return ''; }
  set fillStyle(_v) {} get fillStyle() { return '#000'; }
  set strokeStyle(_v) {} get strokeStyle() { return '#000'; }
  set lineWidth(_v) {} get lineWidth() { return 1; }
  set textAlign(_v) {} get textAlign() { return 'left'; }
  set textBaseline(_v) {} get textBaseline() { return 'top'; }
  set globalAlpha(_v) {} get globalAlpha() { return 1; }
}

function makeCanvas(w = 300, h = 150) {
  return {
    width: w, height: h, style: {},
    getContext: () => new FakeCtx(w, h),
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
    addEventListener() {}, removeEventListener() {},
  };
}

globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = {
  createElementNS: (_ns, tag) => (tag === 'canvas' ? makeCanvas() : { style: {} }),
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {
    style: {}, className: '', dataset: {}, children: [],
    append() {}, appendChild() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    setAttribute() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  }),
  body: { append() {}, appendChild() {}, style: {} },
  documentElement: { style: {} },
  addEventListener() {}, removeEventListener() {},
  getElementById: () => null,
};
globalThis.HTMLCanvasElement = function () {};
globalThis.HTMLImageElement = function () {};
globalThis.ImageData = function () {};
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
globalThis.dispatchEvent = () => true;
globalThis.location = { href: 'http://localhost/', reload() {} };
globalThis.Blob = globalThis.Blob ?? class {};
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    Promise.resolve(blob.arrayBuffer()).then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};

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

const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'assets/manifest.json'), 'utf8'));

const gltfLoader = new GLTFLoader();
const paletteTargets = [];
const protoCache = new Map();
const infoCache = new Map();

async function loadModel(spec) {
  if (protoCache.has(spec.id)) return protoCache.get(spec.id);
  const buf = fs.readFileSync(path.join(PUBLIC, spec.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) =>
    gltfLoader.parse(ab, path.dirname(path.join(PUBLIC, spec.url)) + '/', res, rej),
  );
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  protoCache.set(spec.id, root);
  paletteTargets.push([root, spec.id]);
  infoCache.set(spec.id, { id: spec.id, size, min: box.min.clone(), max: box.max.clone(), placeholder: false, triangles: 0 });
  return root;
}

/** A stand-in AssetLoader with the same surface the world code uses. */
const assets = {
  manifest,
  missing: [],
  stats: { models: 0, missing: 0, declared: manifest.models.length },
  info: (id) => infoCache.get(id) ?? null,
  has: (id) => protoCache.has(id),
  isPlaceholder: () => false,
  surface: (id) => {
    const s = manifest.surfaces.find((x) => x.id === id);
    return s ? { id, available: false } : { id, available: false };
  },
  environmentUrl: () => null,
  creditRows: () => [],
  texture: async () => new THREE.Texture(),
  instance(id, opts = {}) {
    const proto = protoCache.get(id);
    const g = new THREE.Group();
    g.name = id;
    if (!proto) return g;
    g.add(opts.clone === false ? proto : proto.clone(true));
    if (opts.scale && opts.scale !== 1) g.scale.setScalar(opts.scale);
    return g;
  },
  instanceSizedX(id, m) {
    const i = infoCache.get(id); const g = this.instance(id);
    if (i && i.size.x > 1e-4) g.scale.setScalar(m / i.size.x);
    return g;
  },
  instanceSizedY(id, m) {
    const i = infoCache.get(id); const g = this.instance(id);
    if (i && i.size.y > 1e-4) g.scale.setScalar(m / i.size.y);
    return g;
  },
};

console.error('[capture] loading models…');
for (const spec of manifest.models) {
  if (!spec.available) continue;
  try { await loadModel(spec); } catch (e) { console.error('  fail', spec.id, e.message); }
}
// apply the same material palettisation the runtime loader performs
{
  const { applyCapturePalette } = await import('../.capture/captureEntry.mjs')
    .then((m) => ({ applyCapturePalette: m.applyCapturePalette }))
    .catch(() => ({ applyCapturePalette: null }));
  if (applyCapturePalette) for (const [root, id] of paletteTargets) applyCapturePalette(root, id);
}
assets.stats.models = protoCache.size;
console.error(`[capture] ${protoCache.size} models ready`);

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
