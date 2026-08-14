import * as THREE from 'three';

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

export function metal(color = COLORS.hull, roughness = 0.42, metalness = 0.82): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export function matte(color = COLORS.panel, roughness = 0.74): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.2 });
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
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export function cloneMaterial<T extends THREE.Material>(material: T): T {
  return material.clone() as T;
}

export const shared = {
  hull: metal(),
  hullDark: metal(COLORS.hullDark, 0.52, 0.78),
  panel: matte(),
  floor: metal(0x1d282e, 0.6, 0.7),
  floorInset: metal(0x0d161b, 0.72, 0.55),
  ceiling: metal(0x27343b, 0.62, 0.65),
  cyan: emissive(COLORS.cyan, 2.4),
  amber: emissive(COLORS.amber, 2.1),
  red: emissive(COLORS.red, 2.6),
  warm: emissive(COLORS.warm, 1.7),
};
