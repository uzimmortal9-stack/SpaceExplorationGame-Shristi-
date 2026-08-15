/**
 * Material palettisation for atlas-based kits.
 *
 * A few Quaternius packs (Ultimate Space Kit, Ultimate Stylized Nature) UV-map
 * every mesh into one shared colour atlas — a small PNG of flat swatches. The
 * public CC0 mirror this project downloads from carries the geometry but not
 * those atlases, so the meshes arrive with a single neutral `baseColorFactor`
 * and no map: correct data, but visually flat grey.
 *
 * Rather than ship grey foliage or fake a texture, we key off the material name
 * the artist authored ("NormalTree_Leaves", "Rocks", "Flowers", …) and assign
 * the matching flat colour with sensible PBR values. Each swatch is a solid
 * colour exactly as the atlas encodes it, so the result matches the intended
 * look while staying honest about what was downloaded.
 *
 * If the real atlas is later placed in `public/assets/kit/`, the model's own
 * `baseColorTexture` takes priority and this table is skipped automatically.
 */

export interface Swatch {
  color: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** Foliage cards look better lit from both faces. */
  doubleSided?: boolean;
}

/** Ordered rules: the first substring that matches the material name wins. */
const RULES: Array<[RegExp, Swatch]> = [
  // ---- vegetation --------------------------------------------------------
  [/leaves|leaf|foliage|canopy/i, { color: 0x3f9c4a, roughness: 0.82, doubleSided: true }],
  [/bark|trunk|wood|branch/i, { color: 0x5c4632, roughness: 0.92 }],
  [/grass/i, { color: 0x59a34a, roughness: 0.88, doubleSided: true }],
  [/flower|petal|blossom/i, { color: 0xd85fa8, roughness: 0.7, doubleSided: true }],
  [/mushroom|fungus|fungi/i, { color: 0xd88a4a, roughness: 0.78 }],
  [/bush|shrub|fern|plant/i, { color: 0x37884a, roughness: 0.85, doubleSided: true }],

  // ---- terrain -----------------------------------------------------------
  [/rock|stone|pebble|cliff|boulder/i, { color: 0x7f8288, roughness: 0.95 }],
  [/sand|dirt|soil|ground|path/i, { color: 0x9a8460, roughness: 0.97 }],
  [/snow|ice/i, { color: 0xdfeaf2, roughness: 0.35 }],
  [/water|liquid/i, { color: 0x2f7f96, roughness: 0.12 }],

  // ---- built surfaces ----------------------------------------------------
  [/glass|window|screen/i, { color: 0x9fd4e8, roughness: 0.08, metalness: 0.0 }],
  [/metal|steel|iron|chrome|hull/i, { color: 0x9aa4b0, roughness: 0.35, metalness: 0.85 }],
  [/gold|brass/i, { color: 0xd0a04a, roughness: 0.3, metalness: 0.95 }],
  [/dark|black|shadow/i, { color: 0x23272d, roughness: 0.55, metalness: 0.4 }],
  [/white|light/i, { color: 0xdde3e9, roughness: 0.5, metalness: 0.1 }],
  [/red|danger|alert/i, { color: 0xc0392b, roughness: 0.5 }],
  [/orange|warn/i, { color: 0xd87a2a, roughness: 0.55 }],
  [/yellow|accent/i, { color: 0xd8b02a, roughness: 0.5 }],
  [/blue|cyan/i, { color: 0x2f7fc0, roughness: 0.45 }],
  [/green/i, { color: 0x3f9c5a, roughness: 0.6 }],
];

/**
 * Per-asset overrides for the alien flora, so Ilex Prime reads as another world
 * rather than an Earth forest. Keyed by model id.
 */
export const ALIEN_TINTS: Record<string, Swatch> = {
  alien_tree_1: { color: 0x2f8f7a, roughness: 0.78, emissive: 0x0d3a32, emissiveIntensity: 0.18 },
  alien_tree_2: { color: 0x3a7f8f, roughness: 0.78, emissive: 0x0d2f3a, emissiveIntensity: 0.16 },
  alien_tree_3: { color: 0x6f5fa8, roughness: 0.8, emissive: 0x241d44, emissiveIntensity: 0.2 },
  alien_tree_4: { color: 0x8fa83f, roughness: 0.82 },
  alien_tree_5: { color: 0x46c8a0, roughness: 0.7, emissive: 0x1b7a5e, emissiveIntensity: 0.45 },
  alien_tree_6: { color: 0x9f5f8f, roughness: 0.8 },
  alien_bush_1: { color: 0x2f9c6a, roughness: 0.85, doubleSided: true },
  alien_bush_2: { color: 0x5fa83f, roughness: 0.85, doubleSided: true },
  alien_grass_1: { color: 0x62b04a, roughness: 0.88, doubleSided: true },
  alien_grass_2: { color: 0x4fa06f, roughness: 0.88, doubleSided: true },
  alien_plant_1: { color: 0x3fa8a0, roughness: 0.8, emissive: 0x145049, emissiveIntensity: 0.25 },
  alien_plant_2: { color: 0xa85f7f, roughness: 0.8 },
  flower_1: { color: 0xe86fb8, roughness: 0.68, emissive: 0x5a1740, emissiveIntensity: 0.22, doubleSided: true },
  flower_2: { color: 0xf0a83f, roughness: 0.68, emissive: 0x5a3a0d, emissiveIntensity: 0.2, doubleSided: true },
  mushroom_1: { color: 0x7fd8c8, roughness: 0.6, emissive: 0x2a8f7a, emissiveIntensity: 0.55 },
  mushroom_2: { color: 0xd8a03f, roughness: 0.72, emissive: 0x5a3a0d, emissiveIntensity: 0.3 },
  fern: { color: 0x2f9c5a, roughness: 0.84, doubleSided: true },
  jungle_tree_1: { color: 0x357f42, roughness: 0.84, doubleSided: true },
  jungle_tree_2: { color: 0x2f7f4f, roughness: 0.84, doubleSided: true },
  palm_1: { color: 0x3f9c62, roughness: 0.82, doubleSided: true },
  palm_2: { color: 0x4f9c52, roughness: 0.82, doubleSided: true },
  rock_1: { color: 0x77797f, roughness: 0.95 },
  rock_2: { color: 0x6f7278, roughness: 0.95 },
  rock_3: { color: 0x7f8188, roughness: 0.94 },
  rock_4: { color: 0x6a6d73, roughness: 0.96 },
  pebble_1: { color: 0x7a7d83, roughness: 0.95 },
  pebble_2: { color: 0x72757b, roughness: 0.95 },
};

/** Look up a swatch for a material name, or null if nothing matches. */
export function swatchFor(materialName: string): Swatch | null {
  for (const [re, sw] of RULES) if (re.test(materialName)) return sw;
  return null;
}

/**
 * Resolve the final swatch for one sub-material of a model.
 *
 * Priority:
 *   1. a name-based rule that identifies a *structural* role (bark, trunk,
 *      stone) — those must not be painted with the model's foliage tint;
 *   2. the per-model alien tint, for everything else (leaves, blobs, atlases);
 *   3. any other name rule;
 *   4. a neutral fallback so nothing is ever left flat white.
 */
const STRUCTURAL = /bark|trunk|wood|branch|stem|stone|rock|metal|dark/i;

export function resolveSwatch(modelId: string, materialName: string): Swatch | null {
  const name = materialName || '';
  if (STRUCTURAL.test(name)) return swatchFor(name);
  const alien = ALIEN_TINTS[modelId];
  if (alien) return alien;
  const byName = swatchFor(name);
  if (byName) return byName;
  // Unmatched atlas material: fall back to a muted organic green rather than
  // leaving it the exporter's default near-white.
  if (/atlas|main|default|material/i.test(name)) {
    return { color: 0x6f8f5f, roughness: 0.85 };
  }
  return null;
}
