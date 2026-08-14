# Asset credits

AEON DRIFT uses a mix of locally bundled, professionally authored media and runtime-procedural artwork. Nothing is hot-linked from a CDN; every external asset is installed with the project and served from local files.

## Externally sourced assets (downloaded, CC0 / public domain)

### HDRI environment maps — Poly Haven

Image-based lighting and reflection environments for the ship interior, hull, spaceflight and jungle surface. All HDRIs are authored by **Poly Haven** ([polyhaven.com](https://polyhaven.com)) and released under **CC0 1.0** (public domain).

- `studio.exr` — neutral studio rig (interior and hull reflections).
- `forest.exr` — woodland ambient (jungle IBL).

These files ship inside the `@pmndrs/assets` npm package as base64-encoded data URLs (the package itself is CC0-1.0, see `node_modules/@pmndrs/assets/LICENSE`). They are decoded at runtime with Three.js `EXRLoader` and filtered through `PMREMGenerator`.

## Procedural artwork (generated at runtime)

- **Geometry**: all meshes are built at runtime from custom buffer geometry and normalized primitives with authored bevels, pivots and UVs (`src/world/geometryAlignment.ts`).
- **PBR detail maps**: every major surface receives authored albedo, tangent-space normal and roughness maps painted to canvas at startup (`src/core/PBRMaps.ts`) — panel lines, rivets, brushed metal, deck treads, fabric weave, mottled rock, grunge and baked edge AO. No flat-color material ships as final art.
- **Materials**: standard/physical materials with PBR maps and environment-map intensity (`src/world/materials.ts`).
- **Lighting**: rectangular area lights, spotlights, controlled ambient/hemisphere fill and shadow-casting sun (`src/core/Game.ts`, `src/world/PlanetSurface.ts`).
- **Effects**: star fields, planets, sun corona, terrain, jungle, water shaders, spores, mist, warp tunnel, plasma and dust are procedural.
- **Audio**: synthesized at runtime with the Web Audio API.

## Tooling / engines

- [Three.js](https://threejs.org/) — MIT License.
- [Vite](https://vite.dev/) and TypeScript — MIT Licenses.
- [@pmndrs/assets](https://github.com/pmndrs/assets) — CC0-1.0 (asset distribution package).

The project title, lore, ship design, interface, and procedural art are original to this repository.
