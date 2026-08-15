# Aurora Voyager — Space Exploration

A fully playable, first-person **3D sci‑fi space exploration game** built with
[three.js](https://threejs.org) and TypeScript. Explore a lived‑in starship
interior, sit in the pilot seat, fly 6‑DOF through a small solar system, jump
to **warp**, re‑enter an alien atmosphere, land on a jungle world, and explore
its glowing pool, ruins and ancient ruins on foot.

> Built from scratch. Every texture and model is a **real, downloaded, legally
> reusable asset** (Poly Haven, ambientCG, three.js sample assets, NASA) — no
> runtime‑painted fake PBR. Lighting is driven by a **real HDRI environment
> through PMREMGenerator** plus real lights; emissive is used only as an accent.

---

## Run it

```bash
npm install
npm run dev
# open http://localhost:5173
```

Production build / preview:

```bash
npm run build   # typecheck + bundle
npm run preview
```

Requires a browser with WebGL2 (Chrome, Edge, Firefox, Safari all fine).

---

## How to play

- **Start** — click **START MISSION** on the main menu.
- You spawn in the ship's main corridor. Move around, open the automatic
  sliding doors, and explore the rooms.

### Controls

| Key | Action |
| --- | ------ |
| `W A S D` | Move |
| `Mouse` | Look |
| `Space` | Jump |
| `Shift` | Sprint |
| `Ctrl` | Crouch |
| `E` / `Left Click` | Interact |
| `F` | Sit / Stand |
| `Esc` | Pause / menu |

**Flight (pilot seat)**

| Key | Action |
| --- | ------ |
| `W` / `S` | Throttle / reverse |
| `I K J L` or arrows | Pitch / yaw |
| `Q E` | Roll |
| `Shift` | Boost |
| `C` | Camera (cockpit → chase → orbital) |
| `T` | Cycle warp target |
| `B` | Auto‑land (assist) |

The full control list is also available in‑game under **Controls** (shown once
on your first entry, reopenable from Settings).

---

## The mission loop

1. **Explore the ship** — bridge/cockpit, crew cabins, washrooms, storage
   (with a split‑glass freezer), fuel processing, comms, lounge, galley,
   medical, defense, science lab, reactor, engineering/warp drive, life support,
   power distribution, and a cargo bay with a rear ramp.
2. **Reach the bridge**, sit in the **pilot seat** (`E`).
3. **Open the safety lid** and engage the throttle, fly around the solar system.
4. **Select a target** (`T`) — the story destination is **Lumis Prime**.
5. **Open the red cover and pull the warp lever** to begin the warp jump
   (spin‑up → tunnel → exit).
6. **Descend into the atmosphere** (plasma re‑entry, cloud canopy) and **land**
   (gear, touchdown dust).
7. **Stand up**, walk to the **cargo ramp**, lower it, and step out onto the
   alien jungle.
8. Follow the **signal source** to the bioluminescent pool and the ancient
   ruins for the resolution.

Everything transitions with composed cinematic camera work — no hard cuts.

---

## Tech highlights

- **Real environment lighting** — Poly Haven HDRIs loaded through
  `PMREMGenerator`; ACES tone mapping; subtle bloom.
- **Real PBR materials** — downloaded albedo / normal / roughness maps
  (ambientCG, three.js PBR samples). Emissive is accent‑only.
- **Modular starship** — authored, beveled props with correct pivots, real
  surface snapping, axis‑aligned collision, automatic sliding doors with
  obstruction safety.
- **Procedural alien world** — seeded value‑noise terrain, instanced vegetation,
  ruins, waterfall and glowing pool with particle systems.
- **Procedural audio** — the entire soundtrack and effects are synthesized with
  the WebAudio API (no audio files required).
- **Performance** — instancing for vegetation, pooled particle points,
  frustum culling, tiled real textures, limited shadow‑casting lights.

## Project structure

```
src/
  main.ts              entry point
  game.ts              state machine & orchestration
  core/                renderer, input, audio, tween, math
  world/               materials, geometry, assets, ship, exterior, solar, jungle
  systems/             player, collision, doors, interact, flight, warp, landing, save
  ui/                  DOM sci‑fi HUD / menus
public/assets/         downloaded GLB models, HDRI, and PBR texture sets
```

## External assets

See **[ASSET_CREDITS.md](ASSET_CREDITS.md)** for every external asset, its
author, source and license, and **[ASSET_DOWNLOAD_MANIFEST.md](ASSET_DOWNLOAD_MANIFEST.md)**
for the optional, higher‑quality texture sets you can drop in for even better
planet surface materials.
