import * as THREE from 'three';
import type { PBRMaps } from '../core/PBRMaps';
import { deckPlating, fabric, metalPanels, rock } from '../core/PBRMaps';

export const COLORS = {
  obsidian: 0x071016,
  hull: 0x26323b,
  hullDark: 0x101a21,
  panel: 0x15242e,
  steel: 0x52616a,
  cyan: 0x00f0ff,
  amber: 0xffb000,
  orange: 0xff6600,
  red: 0xff2244,
  white: 0xd9f4ff,
  warm: 0xffb86b,
  green: 0x65ffb0,
  purple: 0x9d66ff,
};

// Shared authored PBR detail maps (light-gray albedo so material.color tints them).
let panelMaps: PBRMaps;
let hullMaps: PBRMaps;
let deckMaps: PBRMaps;
let fabricMaps: PBRMaps;
let rockMaps: PBRMaps;

function getPanelMaps(): PBRMaps {
  if (!panelMaps) panelMaps = metalPanels(0xd2d2d2, { panelsX: 2, panelsY: 2, rivets: true, brushed: true, seed: 0x51a7e });
  return panelMaps;
}

function getHullMaps(): PBRMaps {
  if (!hullMaps) hullMaps = metalPanels(0xd6d6d6, { panelsX: 4, panelsY: 4, rivets: true, seed: 0x2b77f1 });
  return hullMaps;
}

function getDeckMaps(): PBRMaps {
  if (!deckMaps) deckMaps = deckPlating(0xd8d8d8, { panelsX: 6, seed: 0xdec0de });
  return deckMaps;
}

function getFabricMaps(): PBRMaps {
  if (!fabricMaps) fabricMaps = fabric(0xd4d4d4, { panelsX: 8, seed: 0xfab71c });
  return fabricMaps;
}

function getRockMaps(): PBRMaps {
  if (!rockMaps) rockMaps = rock(0xcfcfcf, { seed: 0x0c0c0c });
  return rockMaps;
}

function applyMaps(material: THREE.MeshStandardMaterial, maps: PBRMaps, envIntensity: number): void {
  material.map = maps.map;
  material.normalMap = maps.normalMap;
  material.roughnessMap = maps.roughnessMap;
  material.envMapIntensity = envIntensity;
  if (maps.repeat) {
    if (material.map) material.map.repeat.copy(maps.repeat);
    if (material.normalMap) material.normalMap.repeat.copy(maps.repeat);
    if (material.roughnessMap) material.roughnessMap.repeat.copy(maps.repeat);
  }
}

/** Brushed/plated metal — panels, hulls, consoles, crates. */
export function metal(color = COLORS.hull, roughness = 0.62, metalness = 0.8): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness });
  applyMaps(material, getPanelMaps(), 0.75);
  material.roughness = THREE.MathUtils.clamp(roughness * 1.5, 0.25, 1);
  return material;
}

/** Coarse paneled hull plating (exterior). */
export function hullMetal(color = COLORS.hull, roughness = 0.5, metalness = 0.88): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness });
  applyMaps(material, getHullMaps(), 0.85);
  material.roughness = THREE.MathUtils.clamp(roughness * 1.5, 0.25, 1);
  return material;
}

/** Soft matte cloth / rubberised surface — seats, beds, suits, cushions. */
export function matte(color = COLORS.panel, roughness = 0.78): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.06 });
  applyMaps(material, getFabricMaps(), 0.28);
  return material;
}

/** Deck plating for walkable floors. */
export function deck(color = 0x1d282e, roughness = 0.6, metalness = 0.55): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness });
  applyMaps(material, getDeckMaps(), 0.55);
  material.roughness = THREE.MathUtils.clamp(roughness * 1.4, 0.3, 1);
  return material;
}

/** Mottled rock / stone for terrain, ruins, trunks and asteroids. */
export function rockMat(color = 0x33403d, roughness = 0.94): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
  applyMaps(material, getRockMaps(), 0.35);
  return material;
}

export function emissive(color = COLORS.cyan, intensity = 2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.32,
    metalness: 0.18,
    toneMapped: false,
  });
}

export function glass(color = 0x8fdfff, opacity = 0.18): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.08,
    metalness: 0.15,
    transmission: Math.max(0, 0.75 - opacity),
    thickness: 0.12,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export function cloneMaterial<T extends THREE.Material>(material: T): T {
  return material.clone() as T;
}

export const shared = {
  hull: hullMetal(),
  hullDark: hullMetal(COLORS.hullDark, 0.52, 0.78),
  panel: metal(COLORS.panel, 0.58, 0.62),
  floor: deck(),
  floorInset: deck(0x0d161b, 0.7, 0.45),
  ceiling: metal(0x27343b, 0.62, 0.6),
  cyan: emissive(COLORS.cyan, 2.4),
  amber: emissive(COLORS.amber, 2.1),
  red: emissive(COLORS.red, 2.6),
  warm: emissive(COLORS.warm, 1.7),
};
