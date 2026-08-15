# Aurora Drift — Implementation Notes

Architecture and the reasoning behind the decisions that mattered.

## Stack

* **TypeScript** (strict, `noUnusedLocals`, `noImplicitOverride`), ES2022 modules
* **three.js 0.180** (WebGL2)
* **Vite 7** for dev server and bundling
* **Web Audio API** — all audio synthesised at runtime, no sample files
* **Python 3** (NumPy, Pillow) for the offline asset and verification tooling
  (build-time only, never shipped)

## Module layout

```
src/
  core/
    renderer.ts    WebGL device, PMREM environment loading, ACES, bloom,
                   warp post-pass, quality presets, screen shake
    input.ts       keyboard/mouse, pointer lock, semantic action bindings
    audio.ts       procedural synthesis: noise beds, bursts, tones, drones
    state.ts       phase machine + ship systems + typed event emitter
    math.ts        easing, damping, deterministic RNG, value noise / fBm
    events.ts      minimal typed pub/sub
    shaders/       warp radial blur + chromatic aberration
  assets/
    manifest.ts    shape of public/assets/manifest.json
    assetLoader.ts manifest-driven GLB/texture/HDRI loading, pivot
                   normalisation, placeholder fallback
    palette.ts     flat-colour palettisation for atlas-less kits
    placeholder.ts the deliberately-obvious missing-asset stand-in
  systems/
    collision.ts   AABB world + uniform grid broad-phase + heightfield
    player.ts      first-person capsule: accel, gravity, step-up, head bob,
                   footsteps, seated transitions
    interaction.ts proximity + look-at registry with prompts
    doors.ts       bi-parting sliding doors, obstruction safety, interlocks
    flight.ts      6-DOF rigid body, flight assist, 3 camera modes
    warp.ts        charge → tunnel → exit with the post stack
    descent.ts     six-stage atmospheric entry and landing cinematic
  world/
    materials.ts   shared PBR palette
    space.ts       solar system: bodies, orbits, sun, starfield
    planet.ts      terrain, instanced vegetation, waterfall, ruins, atmosphere
    shipExterior.ts hull, gear, thrusters, strobes, heat shell
    ship/
      layout.ts    the deck plan — single source of truth
      structure.ts modular shell assembly + collision
      lighting.ts  per-room light rig
      props.ts     placement helper (pivot-correct, collider-generating)
      rooms*.ts    per-compartment fit-out and interactions
      screens.ts   world-space diegetic display panels
      ship.ts      assembly + per-frame tick
  ui/hud.ts        HUD, overlays, settings, nav selector, credits
  game.ts          orchestration, phase machine, scene switching
  main.ts          boot screen, main menu
  smoke.ts         headless integration test
```

## Key decisions

### Lighting is environment-first

The previous attempt failed by adding emissive material to fake brightness.
Here the order is deliberate:

1. A real HDRI through `PMREMGenerator` becomes `scene.environment`, so PBR
   surfaces have something to reflect. `environmentIntensity` is tuned per
   scene (0.42 interior, 0.85 planet).
2. Physical lights shape the space: `RectAreaLight` ceiling panels sized per
   room, point fills, shadow-casting spots on hero areas, a directional sun
   with a hemisphere fill outdoors.
3. Emissive is an accent only — screens, indicator LEDs, holograms, the warp
   core, bioluminescence. Bloom carries it. Remove the lights and the ship is
   dark, which is the correct test.

Only three interior lights cast shadows (bridge, warp core, cargo bay);
everything else is unshadowed to keep the cost down.

### The deck plan is data

`layout.ts` declares rooms, corridors and doorways as rectangles on a 1 m grid.
Structure, collision, lighting, signage and the debug teleport list are all
derived from it, so they cannot drift apart.

`structure.ts` reads the kit's *measured* module conventions rather than
assuming them — wall panels run along local +Z with their inner face at local
`x = max.x`, so a panel is placed by subtracting its own measured face offset.
That one detail is what makes panels of different depths sit flush on the same
boundary plane.

Wall runs are computed by subtracting doorway spans from each room edge, so an
opening is exactly as wide as its door instead of deleting a whole 4 m panel.

### Pivots are normalised, twice

The USD→glTF converter bakes the requested pivot (bottom / centre / keep) into
the vertex data. `AssetLoader.prepare()` then re-measures the bounding box and
corrects any residual offset. `PropPlacer.place()` therefore just sets
`y = floor` and the object sits exactly on the deck. Colliders are derived from
the same measured bounds, so visual and physical footprints agree.

### Two scenes, one continuous experience

The ship (interior + exterior + solar system) and the planet surface are
separate `Scene` objects for culling and fog reasons. The handoff happens
*inside* the descent cinematic: the exterior hull is reparented into the planet
scene at altitude, and on touchdown the whole ship interior is moved to the pad.
There is no loading screen, and the player walks out of the same interior they
flew in.

Because the interior's colliders are authored in ship-local space, walking
around on the surface uses a small proxy that offsets collision queries by the
hull's world position — the player controller stays in world space throughout.

### Instancing

Structure modules are batched per source mesh into `InstancedMesh` (the whole
hull is ~46 draw calls). Vegetation is instanced the same way, one batch per
source mesh per scatter layer, with transforms generated by a deterministic RNG
so the world regenerates identically.

## Verification

No browser exists in the build environment, so the project carries its own:

* `tools/glbview.py` — a software rasteriser (z-buffer, perspective-correct
  interpolation, Lambert + Blinn-Phong, bilinear texture sampling, vertex
  colours, back-to-front alpha compositing, ACES tone mapping)
* `tools/contactsheet.py` — labelled grids of the model library with automatic
  float/sink pivot flagging
* `tools/capture.mjs` + `src/captureEntry.ts` — build the **real** game scenes
  under Node (with DOM shims) and export to `.glb` for rendering
* `src/smoke.ts` / `npm run smoke` — drives the real systems through the whole
  mission loop and asserts collision, clearance, flight, warp, descent
  monotonicity, terrain contact and asset health

Bugs this caught that type-checking could not: inverted wall rotations, a kit
"ceiling" module that was actually a vertical wall trim, doorways deleting
entire wall panels, a corridor misaligned to the tile grid, a waterfall
floating off its cliff, ruins half-drowned by terrain noise, room teleport
anchors embedded inside props, and six models referencing textures that were
never downloaded.
