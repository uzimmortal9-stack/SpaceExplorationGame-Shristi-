/** Shape of public/assets/manifest.json, produced by tools/fetch-assets.mjs. */

export interface ManifestModel {
  id: string;
  url: string;
  pivot: 'bottom' | 'center' | 'keep';
  source: string;
  license: string;
  author: string;
  pack: string;
  available: boolean;
  bytes?: number;
  hash?: string;
  size?: [number, number, number];
  triangles?: number;
  materials?: number;
}

export interface ManifestEnvironment {
  id: string;
  url: string;
  available: boolean;
  credit: string;
  use: string;
  source: string;
}

export interface ManifestSurface {
  id: string;
  maps: Partial<Record<'map' | 'normalMap' | 'roughnessMap' | 'displacementMap' | 'aoMap', string>>;
  available: boolean;
  credit: string;
  use: string;
}

export interface AssetManifest {
  generated: string;
  generator: string;
  sources: Record<string, { repo: string; license: string; author: string; homepage: string; mirror?: string }>;
  counts: { models: number; modelsAvailable: number; environment: number; surfaces: number };
  environment: ManifestEnvironment[];
  surfaces: ManifestSurface[];
  models: ManifestModel[];
}

export const EMPTY_MANIFEST: AssetManifest = {
  generated: '',
  generator: 'none',
  sources: {},
  counts: { models: 0, modelsAvailable: 0, environment: 0, surfaces: 0 },
  environment: [],
  surfaces: [],
  models: [],
};

/** Every model id the game may ask for. Keeps call sites honest. */
export type ModelId = string;
