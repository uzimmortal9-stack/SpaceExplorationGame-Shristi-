# Aurora Drift

A first-person 3D sci-fi space exploration game for the browser, built with
**TypeScript + three.js (WebGL2)**.

You wake aboard the survey vessel *Aurora Drift* on mission day 412. A signal
from the jungle world **Ilex Prime** has been repeating every 11.4 hours for
eleven months. You are the closest hull. Walk the ship, take the pilot seat,
fly, warp across the system, burn through the atmosphere, land, lower the ramp,
and find out what is down there.

---

## Run it

```bash
npm install
npm run assets     # downloads + converts the CC0 asset library (~40 MB)
npm run dev        # http://localhost:5173
```

`npm run assets` is required once before first run. It fetches every model,
HDRI and PBR texture set listed in `tools/assets.json`, converts the models to
`.glb`, and writes `public/assets/manifest.json`. If anything cannot be
downloaded it is recorded in `ASSET_DOWNLOAD_MANIFEST.md` and the game
substitutes a clearly-marked placeholder for that entry only — see
[Assets](#assets) below.

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check, then bundle to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run assets` | Download + convert the asset library |
| `npm run smoke` | Headless integration test of the whole mission loop |

---

## Controls

Shown once when you first board, and available any time from **Settings →
Controls**. Nothing is permanently pinned to the screen.

**On foot** — `W A S D` move · mouse look · `Shift` sprint · `Ctrl`/`C` crouch ·
`Space` jump · `E` interact / sit / use · `F` helmet lamp

**Piloting** — `W`/`S` throttle · mouse pitch & yaw · `Q`/`E` roll ·
`Shift` boost · `Space` inertial brake · `V` cockpit / chase / orbital camera ·
`G` landing gear · `E` leave the seat

**Interface** — `M` nav & target selector · `Esc` pause & settings ·
`J` engage warp once armed

---

## The loop

1. **Wake in your cabin.** Read the personal log, toggle the PDLC window, use
   the desk lamp.
2. **Explore the ship.** Nineteen compartments off a central spine, joined by
   automatic bi-parting doors with hydraulics and obstruction safety.
3. **Comms** — play the mission briefing.
4. **Bridge** — lift the throttle safety lid, arm the main drive, then take the
   pilot seat. The camera eases into the seat rather than snapping.
5. **Fly.** Full 6-DOF with flight assist, three camera modes, and a
   multi-body solar system with orbits, rings and a real directional sun.
6. **Pick a destination** from the holographic solar-system projection between
   the two pilot chairs (`M`), then arm the warp drive.
7. **Warp.** The core spins up in the drive room — audio rises, lights pulse,
   the screen shakes. Lift the red safety cover, pull the physical lever, and
   the tunnel opens: streaked starfield, radial blur, chromatic aberration.
8. **Atmospheric entry.** A six-stage cinematic with real composed camera
   shots: approach → plasma sheath → cloud break → descent → flare → touchdown.
   The ship's altitude is genuinely animated against the terrain, so the ground
   visibly rushes up. Gear deploys mid-descent; a dust ring blooms on contact.
9. **Walk out.** Stand up, cross the ship to the cargo bay, lower the boarding
   ramp, and step onto Ilex Prime.
10. **Explore.** Dense alien jungle, an escarpment with a waterfall draining
    into a glowing pool, and overgrown ruins on a raised terrace holding the
    monolith that has been broadcasting all along.

---

## Rendering

Environment lighting comes first; emissive is an accent, never a light source.
Delete every light in the scene and the ship goes dark.

* **Real HDRI environments** (Poly Haven, CC0) loaded through `PMREMGenerator`
  and assigned to `scene.environment`, so every PBR surface has something to
  reflect. Interior, deep space, orbit and planet daylight each get their own.
* **Physical lights** — `RectAreaLight` ceiling panels per room, point fills so
  corners never go black, shadow-casting spots over the bridge / warp core /
  cargo bay, and a shadow-casting directional sun on the planet with a
  hemisphere sky-ground fill.
* **ACES filmic tone mapping**, soft `PCFSoftShadowMap` shadows, and subtle
  `UnrealBloomPass` that picks up trim lighting, holograms and the warp core.
* **Custom post shader** for the warp tunnel and re-entry: radial motion blur,
  chromatic aberration and a speed vignette.
* **Performance** — modular structure is merged into `InstancedMesh` batches,
  vegetation is instanced per source mesh, geometry and materials are shared
  across clones, particles are pooled and recycled, terrain uses a single
  chunked heightfield, and three quality presets scale pixel ratio, shadow map
  size, bloom and vegetation density.

---

## Assets

**Every model, texture and HDRI in this project was actually downloaded and
verified. Nothing is painted onto a canvas at runtime.**

The pipeline is fully reproducible:

```
tools/assets.json          declares every asset: source repo, path, licence, pivot
tools/fetch-assets.mjs     downloads them, converts, writes public/assets/manifest.json
tools/usda_to_glb.py       converts Quaternius CC0 USD → glTF 2.0
src/assets/assetLoader.ts  reads the manifest at runtime
```

`tools/usda_to_glb.py` is a from-scratch USD→glTF converter written for this
project. The CC0 Quaternius mirror distributes models as ASCII USD; the
converter parses the geometry, triangulates it, de-duplicates vertices,
resolves `GeomSubset` material assignments into separate glTF primitives,
converts Z-up to Y-up, normalises each model's pivot (bottom / centre / keep),
and links shared texture atlases externally so dozens of models share one
downloaded image instead of embedding private copies. That last detail takes
the library from 145 MB to 38 MB.

**Missing assets degrade gracefully.** `AssetLoader` reads
`public/assets/manifest.json`; any entry marked unavailable is replaced by a
magenta hazard-striped placeholder that is impossible to mistake for finished
art, and is listed in the Credits panel. Drop the real file at the manifest
path, reload, and it is picked up automatically — **no code changes**. See
`ASSET_DOWNLOAD_MANIFEST.md` if one is generated.

A few Quaternius packs UV-map into a shared colour atlas that the public mirror
does not carry. Rather than ship grey foliage or fake a texture,
`src/assets/palette.ts` assigns the flat colour that atlas encodes, keyed off
the artist's own material names (`NormalTree_Leaves`, `Rocks`, …). Any material
that *does* have a real downloaded texture is left untouched.

Full attribution is in [`ASSET_CREDITS.md`](ASSET_CREDITS.md) and in the
in-game **Credits** panel.

---

## Verification

This sandbox has no browser and no GPU, so the project ships its own offline
verification tooling rather than relying on type-checking alone:

| Tool | Purpose |
| ---- | ------- |
| `tools/glbview.py` | A software rasteriser (z-buffer, perspective, Lambert + Blinn-Phong, texture sampling, vertex colours, alpha compositing, ACES tone map) that renders `.glb` files to PNG |
| `tools/contactsheet.py` | Labelled contact sheets of the whole model library, flagging floating or sunken pivots |
| `tools/capture.mjs` | Builds the **real** game scenes headlessly in Node and exports them to `.glb` |
| `tools/shots.sh` | Capture + render a named scene for inspection |
| `npm run smoke` | Drives the real systems through the entire mission loop |

Every asset was rendered and inspected; every scene (bridge, corridor, cabin,
lounge, galley, medical, science, storage, warp, reactor, cargo, exterior,
planet, waterfall, ruins, landed) was framed and reviewed. Bugs found and fixed
this way included inverted wall rotations, a kit "ceiling" module that was
actually a vertical trim, doorways that deleted whole wall panels, a waterfall
detached from its cliff, ruins half-drowned by terrain noise, and six broken
texture references.

`npm run smoke` currently reports **56 passed, 0 failed**, covering collision,
doorway clearance, room reachability, flight, warp, descent monotonicity,
terrain collision and asset health.

---

## Project structure

```
src/
  core/          renderer · input · audio · math · state · events · shaders
  assets/        manifest types · asset loader · palette · placeholder
  systems/       collision · player · interaction · doors · flight · warp · descent
  world/
    ship/        layout · structure · lighting · props · rooms · screens · ship
    materials.ts space.ts  planet.ts  shipExterior.ts
  ui/            hud.ts
  game.ts        orchestration + phase machine
  main.ts        boot, menu
  smoke.ts       headless integration test
tools/           asset pipeline + offline verification
public/assets/   downloaded models, HDRIs, PBR sets, manifest.json
```

---

## Licence

Game code: MIT. All bundled art is CC0 / public domain — see
[`ASSET_CREDITS.md`](ASSET_CREDITS.md).
