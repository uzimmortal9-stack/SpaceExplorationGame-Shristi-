/**
 * Placeholder factory — the *only* code path that invents geometry.
 *
 * It is used exclusively when an entry in the manifest is unavailable (see
 * ASSET_DOWNLOAD_MANIFEST.md). A stand-in is intentionally styled to be
 * obvious: a magenta hazard-striped block that is clearly not shipping art, so
 * a missing asset can never quietly masquerade as finished work.
 *
 * The real asset is swapped in automatically on the next load once the file
 * exists at the manifest path — no code changes required.
 */

import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';

let hazardTexture: CanvasTexture | null = null;

function makeHazardTexture(): CanvasTexture {
  if (hazardTexture) return hazardTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1a1020';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#ff21c3';
  g.lineWidth = 10;
  for (let i = -64; i < 128; i += 24) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 64, 64);
    g.stroke();
  }
  hazardTexture = new CanvasTexture(c);
  hazardTexture.wrapS = hazardTexture.wrapT = RepeatWrapping;
  hazardTexture.colorSpace = SRGBColorSpace;
  return hazardTexture;
}

/**
 * Build a stand-in sized to the requested footprint so layout, collision and
 * navigation stay correct even while the art is missing.
 */
export function createPlaceholder(id: string, size: [number, number, number] = [0.8, 0.8, 0.8]): Group {
  const group = new Group();
  group.name = `placeholder:${id}`;
  group.userData.placeholder = true;
  group.userData.assetId = id;

  const tex = makeHazardTexture();
  const mat = new MeshStandardMaterial({
    map: tex,
    roughness: 0.75,
    metalness: 0.0,
    emissive: 0x25001c,
    emissiveIntensity: 0.4,
  });

  const [w, h, d] = size;
  const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
