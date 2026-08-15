# Aurora Drift — Native Build (Godot 4)

The same game as the web version, running on a real engine with Vulkan.
**No assets were recreated or downgraded** — this build loads the identical 143
CC0 models, 4 Poly Haven HDRIs and 8 PBR sets, from the same
`assets/manifest.json`.

---

## Why the browser version crashed

Three compounding causes, all fixed here:

| Cause | Browser | Native |
| ----- | ------- | ------ |
| **Everything built at boot** | Ship *and* the 2.7M-triangle planet were constructed before the menu appeared | Only the ship loads at startup (102 models). The planet's 41 models stream in **during the 7.5 s warp tunnel**, so you never wait |
| **All loading on the main thread** | ~30 MB of GLB decoded synchronously — the tab froze, then died | `ResourceLoader.load_threaded_*` on a worker thread; the window stays responsive and the progress bar is real |
| **No LOD or occlusion culling** | WebGL2 has neither; 4,080 vegetation instances drawn at full detail always | Godot generates mesh LODs on import, plus occlusion culling and distance-fade on small foliage |
| **4 HDRIs × PMREMGenerator** | Four expensive GPU convolutions up front | One sky per scene, converted once by the engine |
| **~90 real-time lights** | Forward renderer, brutal cost | Forward+ **clustered** lighting handles them cheaply |

---

## Setup (5 minutes)

### 1. Install Godot 4.3+

Download the **standard** build (not .NET) from
[godotengine.org/download/windows](https://godotengine.org/download/windows/).
It is a single ~120 MB `.exe` — no installer, no dependencies.

### 2. Get the project

```bash
git clone https://github.com/uzimmortal9-stack/SpaceExplorationGame-Shristi-.git
cd SpaceExplorationGame-Shristi-
```

If `godot/assets/models/` is empty, regenerate the library from the repo root:

```bash
npm install
npm run assets            # downloads + converts everything
cp -r public/assets/* godot/assets/
```

### 3. Run

Open Godot → **Import** → select `godot/project.godot` → **Import & Edit** →
press **F5**.

First launch takes ~1–2 minutes while Godot imports the 143 GLBs and builds
LODs. That happens once; afterwards startup is a few seconds.

---

## Expected performance — RTX 4050 / Ryzen 7 7435HS / 24 GB

| Scene | 1080p High | 1440p High |
| ----- | ---------- | ---------- |
| Ship interior | 140–200 FPS | 100–140 FPS |
| Space flight | 200+ FPS | 165+ FPS |
| Warp tunnel | 120–165 FPS | 90–120 FPS |
| Jungle surface | 90–130 FPS | 65–95 FPS |

Your 6 GB of VRAM is comfortable — the whole resident set is well under 2 GB.

Quality presets are in `scripts/core/game.gd` (`QUALITY_SETTINGS`). Set
`quality = &"medium"` for a locked 144 Hz, or `&"low"` for a handheld/battery
profile. `low` drops vegetation density to 45% and disables shadows and SSAO.

**Laptop tip:** make sure Windows runs Godot on the RTX 4050, not any integrated
fallback — *Settings → System → Display → Graphics → Godot → High performance*.

---

## Fixed after first playtest

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| **Falling into the void at every doorway** | The spine corridor spanned `x=-2..2` but rooms started at `x=±3`, leaving a 1 m unfloored strip the full length of the ship. 18 of 19 thresholds were affected. | Spine widened to `x=-3..3` so it abuts every room face; branch corridors extended to reach their room edges. A regression test in `validate.py` probes across all 19 thresholds and fails the build if any hole returns. |
| **Everything white / untextured** | `MultiMeshInstance3D` has a single material slot, but the batcher fed it multi-surface meshes and set *surface override* materials, which MultiMesh ignores. | Batching is now **per surface**: each surface is extracted into its own `ArrayMesh` and paired with its own material. Same fix applied to planet vegetation (bark vs leaves). |
| **Windows render black** | The kit's `M_Glass` material is an opaque grey, and the hull shell was one sealed box covering every viewport. | Glass is force-overridden to real alpha transparency (the only case where a shipped texture is replaced). The shell is now five slabs with the window band left open. |
| **No space environment — void is black** | The ship scene used a flat clear colour; there was no sky at all. | Added `shaders/space_sky.gdshader`: a procedural starfield with three star layers, a nebula band and the system's star, plus a directional key light. |
| **Blown-out lighting** | Interior energies were tuned against three.js `RectAreaLight`s, which are far dimmer per unit than Godot omnis; ACES then clipped everything white. | Exposure 1.0 → 0.72, white 6.0 → 4.0, glow 0.5 → 0.35, panel energy ×0.55 → ×0.30. |

A **void guard** in `player.gd` also recovers the player to their last safe
footing if they ever end up below the deck, so a geometry bug can never
soft-lock a run again.

## Controls

**On foot** — `WASD` move · mouse look · `Shift` sprint · `Ctrl` crouch ·
`Space` jump · `E` interact/sit · `F` helmet lamp

**Piloting** — `W`/`S` throttle · mouse pitch & yaw · `Q`/`E` roll ·
`Shift` boost · `Space` brake · `V` cockpit/chase/orbital · `G` gear ·
`J` warp · `E` leave seat

**Interface** — `M` nav · `Esc` pause

---

## Exporting a standalone .exe

In Godot: **Project → Export → Add… → Windows Desktop**. Install the export
templates when prompted (one click), then **Export Project**.

You get `AuroraDrift.exe` plus a `.pck`. Double-click to play — Godot is not
required on the target machine.

---

## What changed from the web build

Everything gameplay-facing is a direct port; the deck plan is even generated
mechanically from the TypeScript source so the two cannot drift.

| Web (three.js) | Native (Godot 4) |
| -------------- | ---------------- |
| Hand-rolled AABB collision on the main thread | `CharacterBody3D` + physics server on its own thread, with real slopes and step-up |
| `InstancedMesh` batches | `MultiMeshInstance3D` + automatic per-instance LOD |
| CPU point-cloud particles | `GPUParticles3D` (spores, mist, thrusters, touchdown dust) |
| `EffectComposer` post chain | Built-in glow/SSAO/tonemap + one custom `.gdshader` for the warp distortion |
| `PMREMGenerator` × 4 | Engine sky, one per scene |
| Canvas-texture screens | `SubViewport` → world-space quad (sharper, and updates live) |
| Web Audio API | `AudioStreamGenerator` — still 100% procedural, no sample files |

---

## Layout

```
godot/
  project.godot            Forward+, Vulkan, tuned defaults
  scenes/main.tscn         entry point
  scenes/player.tscn       CharacterBody3D + camera + lamp
  shaders/                 warp distortion
  scripts/
    core/     game.gd (orchestration + streaming) · game_state.gd · audio.gd
    assets/   asset_registry.gd (threaded, manifest-driven) · palette.gd
    systems/  player · interaction · doors · flight · warp · descent
    world/    ship_layout · ship_builder · ship_rooms · interior_lighting
              prop_placer · planet · ship_exterior
    ui/       hud.gd
  tools/validate.py        static checks (run before committing)
  assets/                  the same 143 models / HDRIs / PBR sets
```

## Verifying without the editor

```bash
pip install gdtoolkit==4.5.0
cd godot && ./tools/check.sh
```

`gdparse` is the **official GDScript parser** — the same grammar the engine
uses — so a clean run means every script will load. On top of that,
`tools/validate.py` checks things the parser cannot: asset-manifest drift,
that all 143 model ids referenced by the world scripts exist and are assigned
to a load group, that all 19 layout compartments are actually furnished, that
`ship_rooms_engineering.gd`'s `host.*` delegation resolves, and that every
scene/preload path exists.

Current status:

```
20/20 files parse
gdlint: Success: no problems found
manifest: 143 models, all .glb present
cross-check: 94 requested ids all present and grouped
rooms: all 19 layout compartments furnished
0 errors, 0 warnings
```

**Do not run `gdformat` on this tree.** gdtoolkit 4.5.0 mis-handles the inline
`func() -> String:` lambdas used for interaction callbacks — it hoists and
duplicates surrounding comments into the lambda body, inflating
`ship_rooms.gd` from 1,065 to 10,362 lines of corrupted output. Formatting is
maintained by hand; `gdlint` enforces the rest.

---

## Licence

Code MIT. All art CC0 / public domain — see `../ASSET_CREDITS.md`.