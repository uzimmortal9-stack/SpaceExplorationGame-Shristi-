# Aurora Voyager — Implementation Notes

Technical architecture and design decisions for the game.

## Stack

- **Language:** TypeScript (strict), ES2022 modules.
- **Engine:** three.js 0.179 (WebGL2).
- **Build:** Vite 7 (`npm run dev` / `npm run build`).
- **Audio:** 100% procedural WebAudio (no audio files).

## Module layout

| Path | Responsibility |
| ---- | -------------- |
| `src/core/renderer.ts` | WebGL renderer, ACES tone mapping, PMREM HDRI environment, post (subtle bloom), starfield + space dome |
| `src/core/input.ts` | Keyboard/mouse, pointer lock, per‑frame edge events |
| `src/core/audio.ts` | Procedural synth: UI, doors, engines, warp, landing, ambience |
| `src/core/tween.ts`, `math.ts` | Tween queue, seeded noise/RNG, AABB helpers |
| `src/world/materials.ts` | PBR material library from real downloaded maps; emissive as accent only |
| `src/world/assets.ts` | Loads real GLB / HDRI / textures from `public/assets` (prefers real files) |
| `src/world/geo.ts`, `alignment.ts` | Beveled geometry helpers, pivot normalization / ground snapping |
| `src/world/props.ts` | Authored ship props with correct pivots |
| `src/world/ship.ts` | Ship interior: rooms, doors, collision, props, bridge |
| `src/world/exterior.ts` | Visible hull (space / chase / landing) |
| `src/world/solar.ts` | Sun + planets + moons + orbit lines, target list |
| `src/world/jungle.ts` | Procedural alien terrain, instanced vegetation, ruins, waterfall, glowing pool |
| `src/systems/player.ts` | FPS movement + collision (ship + planet terrain) |
| `src/systems/collision.ts` | Circle‑vs‑AABB resolver |
| `src/systems/doors.ts` | Sliding doors with obstruction safety |
| `src/systems/interact.ts` | Proximity + facing interaction |
| `src/systems/flight.ts` | 6‑DOF ship flight, camera modes, HUD data |
| `src/systems/warp.ts` | Scripted warp sequence (spin‑up → tunnel → exit) |
| `src/systems/landing.ts` | Scripted re‑entry + landing (plasma → cloud → descent → touchdown) |
| `src/systems/save.ts` | localStorage state |
| `src/ui/hud.ts` | DOM sci‑fi menus / HUD / interaction prompts |
| `src/game.ts` | State machine + orchestration |

## State machine

`loading → menu → explore → flight → warp → orbit → landing → planet`
(plus `paused`), all driven from `Game.frame()`.

- **explore** — first‑person walk with ship collision; camera follows the player eye.
- **flight / orbit** — camera is parented to the ship; the solar system is
  rendered around a *virtual* ship position (`virtualShip`) so the hull stays at
  scene origin (interior collision stays valid) while the world visibly moves.
- **warp** — FOV/tint/shake effects; on exit the virtual position is placed in
  orbit ahead of the target planet.
- **landing** — the ship group descends at the landing site; the planet sphere
  is hidden inside the cloud canopy and the procedural jungle is revealed so the
  terrain visibly rises past the cockpit. Landing field is flattened to the full
  ship footprint.
- **planet** — first‑person walk on sampled terrain; signal source interaction
  resolves the mission.

## Lighting (the core fix vs. the previous attempt)

1. **Real HDRI environment** loaded with `PMREMGenerator` (`studio` for the
   ship, `night` for space, `forest` for the jungle) → PBR surfaces reflect
   real light.
2. **Real lights** — shadow‑casting directional sun, hemispheric fill, and
   per‑room point lights.
3. **Emissive is accent‑only** (indicators, strips, cores); brightness comes
   from the environment + lights.
4. ACES tone mapping, soft PCF shadows, subtle UnrealBloom.

## Collision & doors

- The interior registers axis‑aligned wall/floor boxes; the player is a circle
  resolved axis‑separated for smooth sliding.
- Doors embed a collision box that collapses on open and restores on close
  (along the correct axis, X or Z), with an obstruction check so they never
  close on the player.

## Performance

- Instanced vegetation (trees, ferns, grass, rocks) and instanced props.
- Particle systems use single `BufferGeometry` points updated in place.
- Real tiled textures with `anisotropy`; limited shadow‑casting lights.
- Frustum culling enabled by default.

## Verification

`npm run typecheck` and `npm run build` pass. Scenes were exercised headlessly
(software WebGL) and render without console errors; see README for the QA hook
`window.__voyager.scene(...)`.
