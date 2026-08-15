# Aurora Voyager — UI / UX Research & Decisions

This document records the interface choices for the game, benchmarked against
professional sci‑fi interfaces (*Star Citizen* mobiGlas, *Elite Dangerous*
holographic cockpits, *Dead Space* diegetic suit projections, *Alien: Isolation*
retro CRTs).

## Principles

1. **No permanent control hints.** Controls are shown once on first entering the
   ship and are reopenable from Settings.
2. **Zero flat overlays during exploration.** No health bars or floating markers
   cover the world while walking; the only on‑screen UI is a small crosshair and
   contextual interaction prompts.
3. **Diegetic cockpit HUD.** In flight the telemetry reads like an MFD cluster
   (speed, throttle, fuel, hull, target, distance, camera, gear, warp) instead of
   a modern flat HUD.

## Palette & typography

- **Primary flight/nav data:** tactical cyan `#00F0FF` with a subtle bloom.
- **Cautions:** hazard orange `#FFB000` and emergency red `#FF2244`.
- **Background panels:** low‑opacity dark obsidian glass
  `rgba(10,15,22,0.72)` with a 1px brushed‑metal border `#1F3347` and backdrop
  blur.
- **Type:** `Share Tech Mono` (monospaced, technical), with system
  monospace fallback so the UI is fully self‑contained offline.

## Interaction model

- **Interaction prompts** appear near reachable, faceable objects
  ("Sit in Pilot Seat", "Open Crate", "Warp Lever").
- Every interactive uses the tactile loop: hover → **click sound**, depress →
  **mechanical clunk**, engage → **confirm chime**.
- Sitting/standing and warp/landing use eased camera transitions (not FOV bumps
  alone).

## Menus

- **Main menu:** Start, Settings, Controls, Credits.
- **Settings:** mouse sensitivity, master volume, graphics, fullscreen, controls.
- **Pause:** resume / settings / controls.
- **End screen:** the "Signal Found" resolution card.

## Accessibility

- Keyboard + mouse fully supported; audio is procedural and has a volume control;
  there is no reliance on color alone for critical warnings (blinking lights +
  tones).
