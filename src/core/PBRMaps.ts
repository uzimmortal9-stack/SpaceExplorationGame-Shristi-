import * as THREE from 'three';

/**
 * Authored image-based PBR detail maps for every code-generated surface.
 *
 * No surface in the game ships as a flat color: hull plating, decking, fabrics,
 * rock and organic matter all receive a painted albedo (panel lines, rivets,
 * grunge, baked edge AO) plus a derived tangent-space normal and a roughness
 * map. These combine with the CC0 HDRI environment (AssetLibrary) to produce
 * genuine PBR response under the scene lighting.
 *
 * Maps are generated once at startup and cached; instanced surfaces reuse them.
 */

export interface PBRMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  repeat: THREE.Vector2;
}

interface PanelOptions {
  size?: number;
  seed?: number;
  panelsX?: number;
  panelsY?: number;
  groove?: number;
  grunge?: number;
  rivets?: boolean;
  brushed?: boolean;
}

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext('2d')!];
}

/** Small deterministic PRNG so authored textures are stable across reloads. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function rgbString(color: [number, number, number], scale = 1): string {
  return `rgb(${Math.round(color[0] * scale)},${Math.round(color[1] * scale)},${Math.round(color[2] * scale)})`;
}

/** Converts a grayscale height canvas into a tangent-space normal map via Sobel. */
function heightToNormalCanvas(heightCanvas: HTMLCanvasElement, strength = 1): HTMLCanvasElement {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d')!.getImageData(0, 0, w, h);
  const out = createCanvas(w)[0];
  const context = out.getContext('2d')!;
  const image = context.createImageData(w, h);
  const d = src.data;
  const o = image.data;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const left = d[((y * w + ((x - 1 + w) % w)) * 4)];
      const right = d[((y * w + ((x + 1) % w)) * 4)];
      const up = d[((((y - 1 + h) % h) * w + x) * 4)];
      const down = d[((((y + 1) % h) * w + x) * 4)];
      const dx = ((left - right) / 255) * strength;
      const dy = ((up - down) / 255) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const nx = -dx * inv;
      const ny = -dy * inv;
      const nz = inv;
      const i = (y * w + x) * 4;
      o[i] = (nx * 0.5 + 0.5) * 255;
      o[i + 1] = (ny * 0.5 + 0.5) * 255;
      o[i + 2] = (nz * 0.5 + 0.5) * 255;
      o[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return out;
}

function toTexture(canvas: HTMLCanvasElement, colorSpace: THREE.ColorSpace): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function paintGrunge(context: CanvasRenderingContext2D, size: number, rand: () => number, amount: number): void {
  const speckles = Math.floor(size * size * 0.02);
  for (let i = 0; i < speckles; i += 1) {
    const shade = Math.floor(rand() * 64);
    context.fillStyle = `rgba(${shade},${shade},${shade},${amount * (0.04 + rand() * 0.12)})`;
    context.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
  // Subtle large-scale mottling.
  for (let i = 0; i < 14; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = size * (0.12 + rand() * 0.3);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const tone = rand() > 0.5 ? 255 : 0;
    gradient.addColorStop(0, `rgba(${tone},${tone},${tone},${amount * 0.05})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
}

function bakeEdgeAO(context: CanvasRenderingContext2D, size: number, strength: number): void {
  const inset = size * 0.045;
  const gradient = context.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, `rgba(0,0,0,${strength})`);
  gradient.addColorStop(0.08, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.92, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, inset);
  context.fillRect(0, size - inset, size, inset);
}

/** Painted metal hull/panel surface: plates, grooves, rivets, grunge, AO. */
export function metalPanels(colorHex: number, options: PanelOptions = {}): PBRMaps {
  const size = options.size ?? 256;
  const rand = prng(options.seed ?? 0x7a11e1);
  const base = hexToRgb(colorHex);
  const [albedoCanvas, albedo] = createCanvas(size);
  const [heightCanvas, height] = createCanvas(size);
  const [roughnessCanvas, roughness] = createCanvas(size);

  albedo.fillStyle = rgbString(base);
  albedo.fillRect(0, 0, size, size);
  height.fillStyle = 'rgb(118,118,122)';
  height.fillRect(0, 0, size, size);
  roughness.fillStyle = 'rgb(96,96,100)';
  roughness.fillRect(0, 0, size, size);

  const panelsX = options.panelsX ?? 3;
  const panelsY = options.panelsY ?? 3;
  const groove = options.groove ?? 0.9;

  // Per-plate tint variation keeps large surfaces from reading as one flat slab.
  for (let py = 0; py < panelsY; py += 1) {
    for (let px = 0; px < panelsX; px += 1) {
      const tint = 0.92 + rand() * 0.14;
      albedo.fillStyle = rgbString(base, tint);
      albedo.fillRect((px * size) / panelsX + 1, (py * size) / panelsY + 1, size / panelsX - 2, size / panelsY - 2);
    }
  }

  // Panel grooves (dark seams in albedo, recessed in height).
  const seam = size / (panelsX * panelsY * 0.5);
  albedo.strokeStyle = 'rgba(0,0,0,0.55)';
  albedo.lineWidth = Math.max(1, seam);
  height.strokeStyle = 'rgb(26,26,30)';
  height.lineWidth = Math.max(1.5, seam * 1.4);
  roughness.strokeStyle = 'rgb(150,150,150)';
  roughness.lineWidth = Math.max(1, seam);
  for (let x = 0; x <= panelsX; x += 1) {
    const cx = (x * size) / panelsX;
    albedo.beginPath(); albedo.moveTo(cx, 0); albedo.lineTo(cx, size); albedo.stroke();
    height.beginPath(); height.moveTo(cx, 0); height.lineTo(cx, size); height.stroke();
    roughness.beginPath(); roughness.moveTo(cx, 0); roughness.lineTo(cx, size); roughness.stroke();
  }
  for (let y = 0; y <= panelsY; y += 1) {
    const cy = (y * size) / panelsY;
    albedo.beginPath(); albedo.moveTo(0, cy); albedo.lineTo(size, cy); albedo.stroke();
    height.beginPath(); height.moveTo(0, cy); height.lineTo(size, cy); height.stroke();
    roughness.beginPath(); roughness.moveTo(0, cy); roughness.lineTo(size, cy); roughness.stroke();
  }
  // Highlight catch on the upper groove lip.
  albedo.strokeStyle = 'rgba(255,255,255,0.12)';
  albedo.lineWidth = 1;
  for (let x = 0; x <= panelsX; x += 1) {
    const cx = (x * size) / panelsX + 1;
    albedo.beginPath(); albedo.moveTo(cx, 0); albedo.lineTo(cx, size); albedo.stroke();
  }

  // Rivets / fasteners at plate corners.
  if (options.rivets !== false) {
    const rivetRadius = Math.max(1, size / 64);
    for (let x = 1; x < panelsX; x += 1) {
      for (let y = 1; y < panelsY; y += 1) {
        const cx = (x * size) / panelsX;
        const cy = (y * size) / panelsY;
        height.fillStyle = 'rgb(235,235,240)';
        roughness.fillStyle = 'rgb(60,60,66)';
        albedo.fillStyle = 'rgba(255,255,255,0.18)';
        height.beginPath(); height.arc(cx, cy, rivetRadius, 0, Math.PI * 2); height.fill();
        roughness.beginPath(); roughness.arc(cx, cy, rivetRadius, 0, Math.PI * 2); roughness.fill();
        albedo.beginPath(); albedo.arc(cx, cy, rivetRadius * 0.6, 0, Math.PI * 2); albedo.fill();
      }
    }
  }

  if (options.brushed !== false) {
    // Fine directional brushing in both height and roughness.
    for (let i = 0; i < size * 1.2; i += 1) {
      const y = rand() * size;
      const len = size * (0.1 + rand() * 0.4);
      const x = rand() * size;
      height.strokeStyle = `rgba(${120 + Math.floor(rand() * 30)},${120 + Math.floor(rand() * 30)},${124 + Math.floor(rand() * 30)},0.5)`;
      height.lineWidth = 1;
      height.beginPath(); height.moveTo(x, y); height.lineTo(x + len, y + (rand() - 0.5)); height.stroke();
    }
  }

  paintGrunge(height, size, rand, options.grunge ?? 0.5);
  paintGrunge(albedo, size, rand, (options.grunge ?? 0.5) * 0.8);
  paintGrunge(roughness, size, rand, 0.4);
  bakeEdgeAO(albedo, size, 0.42);

  const normalCanvas = heightToNormalCanvas(heightCanvas, groove);
  return {
    map: toTexture(albedoCanvas, THREE.SRGBColorSpace),
    normalMap: toTexture(normalCanvas, THREE.NoColorSpace),
    roughnessMap: toTexture(roughnessCanvas, THREE.NoColorSpace),
    repeat: new THREE.Vector2(panelsX, panelsY),
  };
}

/** Deck plating: long tread plates with grooves and hazard grit. */
export function deckPlating(colorHex: number, options: PanelOptions = {}): PBRMaps {
  const size = options.size ?? 256;
  const rand = prng(options.seed ?? 0x9c0ffee);
  const base = hexToRgb(colorHex);
  const [albedoCanvas, albedo] = createCanvas(size);
  const [heightCanvas, height] = createCanvas(size);
  const [roughnessCanvas, roughness] = createCanvas(size);

  albedo.fillStyle = rgbString(base);
  albedo.fillRect(0, 0, size, size);
  height.fillStyle = 'rgb(112,112,116)';
  height.fillRect(0, 0, size, size);
  roughness.fillStyle = 'rgb(150,150,150)';
  roughness.fillRect(0, 0, size, size);

  const rows = options.panelsX ?? 6;
  for (let row = 0; row < rows; row += 1) {
    const cy = ((row + 0.5) * size) / rows;
    const tint = 0.9 + rand() * 0.18;
    albedo.fillStyle = rgbString(base, tint);
    albedo.fillRect(0, (row * size) / rows + 1, size, size / rows - 2);
    // Tread groove across each plate.
    height.strokeStyle = 'rgb(30,30,36)';
    height.lineWidth = 2;
    albedo.strokeStyle = 'rgba(0,0,0,0.45)';
    albedo.lineWidth = 1.5;
    roughness.strokeStyle = 'rgb(200,200,200)';
    roughness.lineWidth = 1.5;
    for (const strokeCtx of [height, albedo, roughness]) {
      strokeCtx.beginPath();
      strokeCtx.moveTo(0, cy);
      strokeCtx.lineTo(size, cy);
      strokeCtx.stroke();
    }
    // Diamond grip ticks.
    for (let tick = 0; tick < size / 16; tick += 1) {
      const x = (tick * 16 + (row % 2) * 8) % size;
      albedo.fillStyle = 'rgba(255,255,255,0.08)';
      albedo.fillRect(x, cy - 3, 3, 3);
      height.fillStyle = 'rgb(150,150,156)';
      height.fillRect(x, cy - 3, 3, 3);
    }
  }

  paintGrunge(height, size, rand, 0.7);
  paintGrunge(albedo, size, rand, 0.55);
  paintGrunge(roughness, size, rand, 0.5);
  bakeEdgeAO(albedo, size, 0.3);

  return {
    map: toTexture(albedoCanvas, THREE.SRGBColorSpace),
    normalMap: toTexture(heightToNormalCanvas(heightCanvas, 1.1), THREE.NoColorSpace),
    roughnessMap: toTexture(roughnessCanvas, THREE.NoColorSpace),
    repeat: new THREE.Vector2(2, 2),
  };
}

/** Woven fabric with soft highlight and thread-level normal detail. */
export function fabric(colorHex: number, options: PanelOptions = {}): PBRMaps {
  const size = options.size ?? 128;
  const rand = prng(options.seed ?? 0xfab71c);
  const base = hexToRgb(colorHex);
  const [albedoCanvas, albedo] = createCanvas(size);
  const [heightCanvas, height] = createCanvas(size);
  const [roughnessCanvas, roughness] = createCanvas(size);

  albedo.fillStyle = rgbString(base);
  albedo.fillRect(0, 0, size, size);
  height.fillStyle = 'rgb(128,128,128)';
  height.fillRect(0, 0, size, size);
  roughness.fillStyle = 'rgb(210,210,210)';
  roughness.fillRect(0, 0, size, size);

  const threads = options.panelsX ?? 8;
  const cell = size / threads;
  for (let y = 0; y < threads; y += 1) {
    for (let x = 0; x < threads; x += 1) {
      const lift = (x + y) % 2 === 0;
      const tone = lift ? 1.06 : 0.94;
      albedo.fillStyle = rgbString(base, tone);
      albedo.fillRect(x * cell, y * cell, cell, cell);
      height.fillStyle = lift ? 'rgb(150,150,150)' : 'rgb(108,108,108)';
      height.fillRect(x * cell, y * cell, cell, cell);
      // Thread striations.
      for (let s = 0; s < 3; s += 1) {
        const sy = y * cell + cell * (0.2 + s * 0.25);
        height.fillStyle = 'rgba(255,255,255,0.12)';
        height.fillRect(x * cell, sy, cell, 1);
      }
    }
  }
  paintGrunge(albedo, size, rand, 0.35);

  return {
    map: toTexture(albedoCanvas, THREE.SRGBColorSpace),
    normalMap: toTexture(heightToNormalCanvas(heightCanvas, 0.8), THREE.NoColorSpace),
    roughnessMap: toTexture(roughnessCanvas, THREE.NoColorSpace),
    repeat: new THREE.Vector2(2, 2),
  };
}

/** Mottled rock / stone with occluded crevices. */
export function rock(colorHex: number, options: PanelOptions = {}): PBRMaps {
  const size = options.size ?? 256;
  const rand = prng(options.seed ?? 0x0c0c0c);
  const base = hexToRgb(colorHex);
  const [albedoCanvas, albedo] = createCanvas(size);
  const [heightCanvas, height] = createCanvas(size);
  const [roughnessCanvas, roughness] = createCanvas(size);

  albedo.fillStyle = rgbString(base);
  albedo.fillRect(0, 0, size, size);
  height.fillStyle = 'rgb(110,110,114)';
  height.fillRect(0, 0, size, size);
  roughness.fillStyle = 'rgb(190,190,190)';
  roughness.fillRect(0, 0, size, size);

  // Large chunky facets.
  for (let i = 0; i < 90; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.05 + rand() * 0.2);
    const tone = 0.82 + rand() * 0.36;
    const grad = albedo.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgbString(base, tone));
    grad.addColorStop(1, rgbString(base, tone * 0.82));
    albedo.fillStyle = grad;
    albedo.fillRect(x - r, y - r, r * 2, r * 2);
    const hgrad = height.createRadialGradient(x, y, 0, x, y, r);
    const htone = 90 + Math.floor(rand() * 90);
    hgrad.addColorStop(0, `rgb(${htone},${htone},${htone + 4})`);
    hgrad.addColorStop(1, `rgb(${htone * 0.5},${htone * 0.5},${htone * 0.5})`);
    height.fillStyle = hgrad;
    height.fillRect(x - r, y - r, r * 2, r * 2);
  }
  paintGrunge(albedo, size, rand, 0.6);
  paintGrunge(height, size, rand, 0.7);
  paintGrunge(roughness, size, rand, 0.5);
  bakeEdgeAO(albedo, size, 0.28);

  return {
    map: toTexture(albedoCanvas, THREE.SRGBColorSpace),
    normalMap: toTexture(heightToNormalCanvas(heightCanvas, 1.4), THREE.NoColorSpace),
    roughnessMap: toTexture(roughnessCanvas, THREE.NoColorSpace),
    repeat: new THREE.Vector2(1, 1),
  };
}
