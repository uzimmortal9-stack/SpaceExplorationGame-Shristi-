/**
 * Materials — the shared palette.
 *
 * Rules enforced here (the previous build failed on exactly these):
 *   * No canvas-painted "PBR" maps. Albedo/normal/roughness come from the
 *     downloaded ambientCG / three.js sets via AssetLoader, or from plain,
 *     honest constant-colour PBR values.
 *   * Emissive is only ever used for things that genuinely emit: screens,
 *     indicator LEDs, holograms, the warp core, bioluminescence. Its intensity
 *     is kept low enough that bloom does the work, not raw brightness.
 */

import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Texture,
} from 'three';

import type { AssetLoader, SurfaceSet } from '../assets/assetLoader';

export const PALETTE = {
  hullLight: 0xb9c2cc,
  hullMid: 0x6e7885,
  hullDark: 0x2d343d,
  deck: 0x3a4149,
  trim: 0x141920,
  accent: 0x00d8ff,
  accentWarm: 0xffb000,
  warn: 0xff6600,
  danger: 0xff2244,
  screen: 0x0a1622,
  glass: 0x9fd4e8,
  jungle: 0x2f7a3f,
  bio: 0x46f5c8,
  bioViolet: 0xb46cff,
} as const;

export interface MaterialLibrary {
  hull: MeshStandardMaterial;
  hullDark: MeshStandardMaterial;
  deck: MeshStandardMaterial;
  deckPlate: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  glassTint: MeshPhysicalMaterial;
  smartGlass: MeshPhysicalMaterial;
  screenDark: MeshStandardMaterial;
  chrome: MeshStandardMaterial;
  brushed: MeshStandardMaterial;
  copper: MeshStandardMaterial;
  padding: MeshStandardMaterial;
  warnStripe: MeshStandardMaterial;
  rock: MeshStandardMaterial;
  stone: MeshStandardMaterial;
  ground: MeshStandardMaterial;
  foliage: MeshStandardMaterial;
  water: MeshPhysicalMaterial;
  /** Emissive accents — bloom carries these, they do not light the room. */
  accent(color: number, intensity?: number): MeshStandardMaterial;
  glow(color: number, opacity?: number): MeshBasicMaterial;
  screen(color: number, intensity?: number): MeshStandardMaterial;
  dispose(): void;
}

function std(params: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial {
  return new MeshStandardMaterial({ side: FrontSide, ...params });
}

function applySurface(mat: MeshStandardMaterial, set: SurfaceSet, repeat: number): void {
  if (!set.available) return;
  const assign = (slot: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap', tex?: Texture) => {
    if (!tex) return;
    const t = tex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = tex.wrapS;
    t.repeat.set(repeat, repeat);
    (mat as unknown as Record<string, Texture>)[slot] = t;
  };
  assign('map', set.map);
  assign('normalMap', set.normalMap);
  assign('roughnessMap', set.roughnessMap);
  mat.needsUpdate = true;
}

export function createMaterials(assets: AssetLoader): MaterialLibrary {
  const cache = new Map<string, MeshStandardMaterial | MeshBasicMaterial>();
  const owned: Array<{ dispose(): void }> = [];
  const own = <T extends { dispose(): void }>(m: T): T => {
    owned.push(m);
    return m;
  };

  const hull = own(std({ color: PALETTE.hullLight, roughness: 0.46, metalness: 0.62 }));
  const hullDark = own(std({ color: PALETTE.hullDark, roughness: 0.52, metalness: 0.72 }));
  const deck = own(std({ color: PALETTE.deck, roughness: 0.68, metalness: 0.35 }));
  const deckPlate = own(std({ color: 0x2a3038, roughness: 0.58, metalness: 0.55 }));
  const trim = own(std({ color: PALETTE.trim, roughness: 0.38, metalness: 0.8 }));
  const rubber = own(std({ color: 0x14171c, roughness: 0.93, metalness: 0.0 }));
  const chrome = own(std({ color: 0xdfe6ee, roughness: 0.14, metalness: 1.0 }));
  const brushed = own(std({ color: 0x8d97a3, roughness: 0.34, metalness: 0.9 }));
  const copper = own(std({ color: 0xc0713a, roughness: 0.3, metalness: 0.95 }));
  const padding = own(std({ color: 0x232a34, roughness: 0.88, metalness: 0.02 }));
  const warnStripe = own(std({ color: PALETTE.warn, roughness: 0.6, metalness: 0.1, emissive: new Color(PALETTE.warn), emissiveIntensity: 0.12 }));
  const screenDark = own(std({ color: PALETTE.screen, roughness: 0.22, metalness: 0.1 }));

  const glass = own(
    new MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.03,
      metalness: 0.0,
      transmission: 0.96,
      thickness: 0.05,
      ior: 1.45,
      transparent: true,
      opacity: 1,
      side: DoubleSide,
      envMapIntensity: 1.3,
    }),
  );
  const glassTint = own(
    new MeshPhysicalMaterial({
      color: PALETTE.glass,
      roughness: 0.07,
      metalness: 0.0,
      transmission: 0.86,
      thickness: 0.08,
      ior: 1.5,
      transparent: true,
      side: DoubleSide,
      envMapIntensity: 1.2,
    }),
  );
  /** PDLC smart film: opacity/roughness are animated between clear and opaque. */
  const smartGlass = own(
    new MeshPhysicalMaterial({
      color: 0xdfeaf2,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.95,
      thickness: 0.03,
      ior: 1.45,
      transparent: true,
      side: DoubleSide,
    }),
  );

  const rock = own(std({ color: 0x8b8f96, roughness: 0.95, metalness: 0.02 }));
  applySurface(rock, assets.surface('rock'), 6);
  const stone = own(std({ color: 0x9aa08f, roughness: 0.92, metalness: 0.02 }));
  applySurface(stone, assets.surface('stone'), 3);
  const ground = own(std({ color: 0x4c6b3a, roughness: 0.98, metalness: 0.0 }));
  applySurface(ground, assets.surface('ground'), 48);
  const foliage = own(
    std({ color: PALETTE.jungle, roughness: 0.85, metalness: 0.0, side: DoubleSide }),
  );

  const water = own(
    new MeshPhysicalMaterial({
      color: 0x1d6f88,
      roughness: 0.08,
      metalness: 0.0,
      transmission: 0.7,
      thickness: 1.2,
      ior: 1.33,
      transparent: true,
      side: DoubleSide,
      emissive: new Color(PALETTE.bio),
      emissiveIntensity: 0.22,
      envMapIntensity: 1.4,
    }),
  );

  const accent = (color: number, intensity = 1.1): MeshStandardMaterial => {
    const key = `a${color}:${intensity}`;
    const hit = cache.get(key);
    if (hit) return hit as MeshStandardMaterial;
    const m = own(
      std({
        color: 0x05070a,
        roughness: 0.4,
        metalness: 0.2,
        emissive: new Color(color),
        emissiveIntensity: intensity,
      }),
    );
    cache.set(key, m);
    return m;
  };

  const glow = (color: number, opacity = 0.55): MeshBasicMaterial => {
    const key = `g${color}:${opacity}`;
    const hit = cache.get(key);
    if (hit) return hit as MeshBasicMaterial;
    const m = own(
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
        side: BackSide,
      }),
    );
    cache.set(key, m);
    return m;
  };

  const screen = (color: number, intensity = 0.85): MeshStandardMaterial => {
    const key = `s${color}:${intensity}`;
    const hit = cache.get(key);
    if (hit) return hit as MeshStandardMaterial;
    const m = own(
      std({
        color: 0x060a10,
        roughness: 0.18,
        metalness: 0.05,
        emissive: new Color(color),
        emissiveIntensity: intensity,
      }),
    );
    cache.set(key, m);
    return m;
  };

  return {
    hull, hullDark, deck, deckPlate, trim, rubber, chrome, brushed, copper,
    padding, warnStripe, screenDark, glass, glassTint, smartGlass,
    rock, stone, ground, foliage, water,
    accent, glow, screen,
    dispose() {
      for (const m of owned) m.dispose();
      cache.clear();
    },
  };
}
