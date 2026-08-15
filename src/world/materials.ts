import * as THREE from "three";
import { assetLoader as AL } from "./assets";

/**
 * Materials — a PBR material library. Albedo/normal/roughness maps are real
 * downloaded textures (ambientCG, three.js sample PBR sets, Poly Haven).
 * Emissive is used strictly as a small accent (buttons, indicator strips),
 * never as the primary illumination.
 */

export type MatName =
  | "hull"
  | "hullLight"
  | "hullDark"
  | "floor"
  | "floorDark"
  | "wall"
  | "wallDark"
  | "trim"
  | "console"
  | "panel"
  | "metal"
  | "steel"
  | "gold"
  | "rubber"
  | "fabric"
  | "bedding"
  | "plant"
  | "glass"
  | "jungleGround"
  | "jungleGround2"
  | "rock"
  | "treeBark"
  | "leaf"
  | "ruin"
  | "water"
  | "ice"
  | "emissiveCyan"
  | "emissiveAmber"
  | "emissiveRed"
  | "emissiveGreen"
  | "emissiveBlue"
  | "soil"
  | "sand"
  | "moss";

const mats = new Map<MatName, THREE.Material>();

function std(
  name: MatName,
  opts: {
    color?: number;
    map?: THREE.Texture;
    normal?: THREE.Texture;
    rough?: number;
    metal?: number;
    emissive?: number;
    emissiveIntensity?: number;
    roughnessMap?: THREE.Texture;
    transparent?: boolean;
    opacity?: number;
    side?: THREE.Side;
  },
): THREE.MeshStandardMaterial {
  const params: THREE.MeshStandardMaterialParameters = {
    color: opts.color ?? 0xffffff,
    roughness: opts.rough ?? 0.6,
    metalness: opts.metal ?? 0.0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  };
  if (opts.map) params.map = opts.map;
  if (opts.normal) params.normalMap = opts.normal;
  if (opts.roughnessMap) params.roughnessMap = opts.roughnessMap;
  const m = new THREE.MeshStandardMaterial(params);
  mats.set(name, m);
  return m;
}

function emis(name: MatName, color: number, intensity = 2.5): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.0,
  });
  mats.set(name, m);
  return m;
}

export function initMaterials(): void {
  const T = 8; // tiling factor helper

  // Hull / structures — carbon PBR set (real albedo + normal)
  const carbon = AL.texture("textures/Carbon.png", 4);
  const carbonN = AL.dataTexture("textures/Carbon_Normal.png", 4);
  std("hull", { map: carbon, normal: carbonN, rough: 0.35, metal: 0.9, color: 0xb8c4cc });
  std("hullLight", { map: carbon, normal: carbonN, rough: 0.3, metal: 0.85, color: 0xd4dee4 });
  std("hullDark", { map: carbon, normal: carbonN, rough: 0.5, metal: 0.7, color: 0x6b7480 });

  // Ship floors — real checkerboard PBR set
  const floor = AL.texture("textures/FloorsCheckerboard_S_Diffuse.jpg", T * 2);
  const floorN = AL.dataTexture("textures/FloorsCheckerboard_S_Normal.jpg", T * 2);
  std("floor", { map: floor, normal: floorN, rough: 0.65, metal: 0.15 });
  std("floorDark", { map: floor, normal: floorN, rough: 0.7, metal: 0.1, color: 0x8899aa });

  // Walls / panels — carbon tinted
  const wall = AL.texture("textures/Carbon.png", T);
  const wallN = AL.dataTexture("textures/Carbon_Normal.png", T);
  std("wall", { map: wall, normal: wallN, rough: 0.6, metal: 0.35, color: 0xc2cbd4 });
  std("wallDark", { map: wall, normal: wallN, rough: 0.55, metal: 0.4, color: 0x7c8693 });
  std("trim", { map: wall, normal: wallN, rough: 0.3, metal: 0.85, color: 0xe0e8f0 });

  std("console", { map: carbon, normal: carbonN, rough: 0.4, metal: 0.6, color: 0x39424c });
  std("panel", { map: carbon, normal: carbonN, rough: 0.45, metal: 0.5, color: 0x9aa7b3 });
  std("steel", { map: carbon, normal: carbonN, rough: 0.3, metal: 0.9, color: 0xcfd6dc });
  std("metal", { map: carbon, normal: carbonN, rough: 0.4, metal: 0.85, color: 0x9aa4ad });

  // Gold — real scratched gold normal set
  const goldN = AL.dataTexture("textures/gold/Scratched_gold_01_1K_Normal.png", 3);
  std("gold", { normal: goldN, rough: 0.18, metal: 1.0, color: 0xdfb34a });

  std("rubber", { color: 0x11141a, rough: 0.9, metal: 0.0 });
  std("fabric", { color: 0x39424f, rough: 1.0, metal: 0.0 });
  std("bedding", { color: 0x9aa8b8, rough: 0.95, metal: 0.0 });
  std("plant", { color: 0x2e7d4f, rough: 0.9, metal: 0.0 });

  // Glass
  const gm = new THREE.MeshPhysicalMaterial({
    color: 0xbfe6f0,
    transparent: true,
    opacity: 0.25,
    roughness: 0.08,
    metalness: 0.0,
    transmission: 0.6,
    thickness: 0.2,
    side: THREE.DoubleSide,
  });
  mats.set("glass", gm);

  // Jungle / planet
  const soil = AL.texture("textures/hardwood2_diffuse.jpg", 1);
  const soilN = AL.dataTexture("textures/hardwood2_bump.jpg", 1);
  std("jungleGround", { map: soil, normal: soilN, rough: 1.0, metal: 0.0, color: 0x3f5a33 });
  const soil2 = AL.texture("textures/brick_diffuse.jpg", 1);
  const soil2N = AL.dataTexture("textures/brick_bump.jpg", 1);
  std("jungleGround2", { map: soil2, normal: soil2N, rough: 1.0, metal: 0.0, color: 0x2c3f28 });
  std("soil", { map: soil, normal: soilN, rough: 1.0, metal: 0.0, color: 0x3a3226 });
  std("sand", { map: soil, normal: soilN, rough: 1.0, metal: 0.0, color: 0x9a8d6a });

  const rock = AL.texture("textures/ambientcg/Ice002_1K-JPG_Color.jpg", 1);
  const rockN = AL.dataTexture("textures/ambientcg/Ice002_1K-JPG_NormalGL.jpg", 1);
  std("rock", { map: rock, normal: rockN, rough: 0.95, metal: 0.0, color: 0x8b8b93 });
  std("ruin", { map: rock, normal: rockN, rough: 0.85, metal: 0.05, color: 0x77776e });
  std("moss", { map: soil, normal: soilN, rough: 1.0, metal: 0.0, color: 0x2f5d33 });

  const bark = AL.texture("textures/hardwood2_diffuse.jpg", 1);
  const barkN = AL.dataTexture("textures/hardwood2_bump.jpg", 1);
  std("treeBark", { map: bark, normal: barkN, rough: 0.95, metal: 0.0, color: 0x6d4c35 });

  const leaf = AL.texture("textures/hardwood2_diffuse.jpg", 1);
  const leafN = AL.dataTexture("textures/hardwood2_bump.jpg", 1);
  std("leaf", { map: leaf, normal: leafN, rough: 0.9, metal: 0.0, color: 0x3f8f4f });

  // Water — mostly color; a subtle emissive for the bioluminescent pool
  std("water", { color: 0x2ec9b8, rough: 0.15, metal: 0.0, transparent: true, opacity: 0.8 });

  const ice = AL.texture("textures/ambientcg/Ice003_1K-JPG_Color.jpg", 1);
  std("ice", { map: ice, rough: 0.25, metal: 0.0, color: 0xcfe8f2 });

  // Emissive accents only
  emis("emissiveCyan", 0x22e6ff, 1.6);
  emis("emissiveAmber", 0xffb000, 1.4);
  emis("emissiveRed", 0xff2244, 2.2);
  emis("emissiveGreen", 0x39ff88, 1.4);
  emis("emissiveBlue", 0x2b6bff, 1.4);
}

export function mat(name: MatName): THREE.Material {
  const m = mats.get(name);
  if (!m) throw new Error(`Material not found: ${name}`);
  return m;
}

export function standard(name: MatName): THREE.MeshStandardMaterial {
  return mat(name) as THREE.MeshStandardMaterial;
}

/** Clone helper for per-instance tinting without mutating the shared material. */
export function tinted(name: MatName, color: number): THREE.MeshStandardMaterial {
  const base = standard(name);
  const c = base.clone();
  c.color.set(color);
  return c;
}

export function emissiveSurface(color: number, intensity = 2): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
  return m;
}
