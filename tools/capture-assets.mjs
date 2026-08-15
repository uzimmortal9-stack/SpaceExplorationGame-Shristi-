/**
 * capture-assets.mjs — loads the real public/assets library for offline tools.
 *
 * Mirrors what AssetLoader does in the browser (GLB parsing, bounds
 * measurement, material palettisation) so headless renders and the smoke test
 * exercise the same content the game ships.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

export async function loadAssets({ quiet = false } = {}) {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

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

if (!quiet) console.error('[assets] loading models…');
  for (const spec of manifest.models) {
  if (!spec.available) continue;
  try { await loadModel(spec); } catch (e) { if (!quiet) console.error('  fail', spec.id, e.message); }
}
// apply the same material palettisation the runtime loader performs
  {
  const { applyCapturePalette } = await import('../.capture/captureEntry.mjs')
    .then((m) => ({ applyCapturePalette: m.applyCapturePalette }))
    .catch(() => ({ applyCapturePalette: null }));
  if (applyCapturePalette) for (const [root, id] of paletteTargets) applyCapturePalette(root, id);
}
  assets.stats.models = protoCache.size;
if (!quiet) console.error(`[assets] ${protoCache.size} models ready`);


  return assets;
}
