/**
 * World-space screen panels.
 *
 * Every in-world display in the ship is a real texture drawn to a 3D quad and
 * lit as an emissive surface — a diegetic canvas, per the UI brief, rather than
 * a flat 2D overlay pasted on the player's view. Text is rendered once into a
 * CanvasTexture; the pixels are UI glyphs, not a fake "PBR" material.
 */

import {
  CanvasTexture,
  Color,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';

import type { RoomCtx } from './rooms';

export interface ScreenLine {
  text: string;
  size: number;
  color: string;
  y: number;
  mono?: boolean;
  align?: CanvasTextAlign;
}

function makeTexture(lines: ScreenLine[], w = 512, h = 256): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;

  g.fillStyle = '#060b12';
  g.fillRect(0, 0, w, h);

  // faint technical grid
  g.strokeStyle = 'rgba(0,240,255,0.07)';
  g.lineWidth = 1;
  for (let x = 0; x < w; x += 24) {
    g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke();
  }
  for (let y = 0; y < h; y += 24) {
    g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke();
  }

  // brushed-metal bezel
  g.strokeStyle = '#1f3347';
  g.lineWidth = 4;
  g.strokeRect(2, 2, w - 4, h - 4);

  for (const l of lines) {
    g.fillStyle = l.color;
    g.font = `${l.mono ? '' : '700 '}${l.size}px ${l.mono ? 'ui-monospace, monospace' : 'Rajdhani, sans-serif'}`;
    g.textAlign = l.align ?? 'center';
    g.textBaseline = 'middle';
    const x = l.align === 'left' ? 24 : l.align === 'right' ? w - 24 : w / 2;
    g.fillText(l.text, x, l.y);
  }

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Build a wall-mounted screen and add it to the room group. */
export function screenPanel(
  ctx: RoomCtx,
  x: number,
  y: number,
  z: number,
  ry: number,
  lines: ScreenLine[],
  w = 1.3,
  h = 0.66,
  intensity = 0.8,
  texW = 512,
  texH = 256,
): Mesh {
  const tex = makeTexture(lines, texW, texH);
  const mesh = new Mesh(
    new PlaneGeometry(w, h),
    new MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new Color(0xffffff),
      emissiveIntensity: intensity,
      roughness: 0.24,
      metalness: 0.02,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  ctx.runtime.group.add(mesh);
  return mesh;
}

/** Regenerate a panel's texture in place (live telemetry). */
screenPanel.makeTexture = makeTexture;

/** Swap the texture of an existing panel. */
export function updateScreen(mesh: Mesh, lines: ScreenLine[], texW = 512, texH = 256): void {
  const mat = mesh.material as MeshStandardMaterial;
  mat.map?.dispose();
  const tex = makeTexture(lines, texW, texH);
  mat.map = tex;
  mat.emissiveMap = tex;
  mat.needsUpdate = true;
}
