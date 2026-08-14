# AEON DRIFT: The Verdant Signal

A complete browser-based 3D space-exploration mission built from the repository’s master technical design. Explore the **CSV Astraea** in first person, bring its systems online, fly through a procedural solar system, warp to Nemora IV, survive atmospheric entry, land, cycle the airlock, and investigate a bioluminescent alien jungle.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. For a production bundle:

```bash
npm run build
npm run preview
```

## Required mission flow

1. Begin inside the Astraea and follow the central deck toward the bridge.
2. Sit in either pilot seat with **E**.
3. Look down/left, open the amber throttle safety lid, then press the physical thrust-arm button.
4. Use the center navigation MFD to cycle targets until **NEMORA IV** is locked.
5. Open the red warp safety cover and pull its physical lever.
6. After warp exit, use the right-hand **Orbital Solution** display to initiate atmospheric entry.
7. During the descent hold, press **G** to deploy landing gear.
8. After touchdown, look away from a dashboard control and press **E** to stand.
9. Walk to the aft cargo bay. Optionally equip the EVA suit, then operate the airlock/ramp panel.
10. Follow the bioluminescent surface path to the glowing waterfall pool and resonant ruins.

Controls are shown once in-game and remain available under Settings. The exploration view deliberately has no permanent key legend, minimap, or health-bar overlay.

## Controls

### On foot

- **WASD** move
- **Mouse** look
- **Shift** sprint
- **Space** jump
- **C / Left Ctrl** crouch
- **E** interact, sit, or stand
- **F** helmet light
- **Esc** pause
- **Tab** mission reminder

### Flight

- **W / S** throttle and reverse
- **Mouse** pitch/yaw
- **Q / E** roll
- **Shift** boost
- **X** toggle dampeners
- **C** cockpit/chase/orbital camera
- **G** landing gear

### Hidden development diagnostics

Press **Backtick** to reveal teleport, collision, noclip, wireframe, and sequence-skip tools.

## Architecture

- `src/core` — input, runtime, procedural audio, saves, canvas display textures, deterministic random, tweening.
- `src/world` — ship rooms/props/exterior, solar system, geometry normalization, collision, interaction, and procedural planet.
- `src/systems` — player movement, doors, ambient animation, 6-DOF flight, collimated HUD, warp, entry, and landing.
- `src/ui` — terminal/slate menus and contextual feedback.
- `docs/UI_RESEARCH.md` — mandatory pre-implementation benchmark research and design translation.
- `docs/IMPLEMENTATION.md` — system and room implementation map.
- `ASSET_CREDITS.md` — complete dependency and asset manifest.

## Technical highlights

- TypeScript, Three.js/WebGL, Vite, Web Audio API.
- Procedural runtime geometry, materials, planets, terrain, jungle, particles, water, ruins, textures, and synthesized sound—no downloaded media assets.
- Automated floor/wall/ceiling/centroid pivot normalization and downward ray-clamp placement pipeline.
- Simplified AABB/cylinder collision hulls aligned to normalized geometry.
- Collision-safe automatic doors with obstruction checks.
- Full 6-DOF ship state, three flight cameras, target locking, fuel, dampeners, and physical interlocks.
- Multi-stage warp, re-entry, gear hold, descent, touchdown dust, and persistent landed state.
- LocalStorage checkpoints and settings.
- Instanced vegetation, stars, spores, and asteroid belt for stable rendering.

## Validation

```bash
npm run typecheck
npm run build
```

The game is designed for desktop browsers with WebGL2, keyboard/mouse input, and Web Audio support.
