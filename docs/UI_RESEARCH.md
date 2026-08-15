# Aurora Drift — UI / UX Notes

Interface decisions, benchmarked against *Star Citizen* (mobiGlas), *Elite
Dangerous* (holographic cockpits), *Dead Space* (diegetic suit projections) and
*Alien: Isolation* (retro-industrial CRTs).

## Principles

1. **Nothing permanent covers gameplay.** While exploring on foot the screen
   carries a 5 px reticle and, only when something is in range, a single
   contextual prompt. No health bar, no minimap, no floating objective markers.
2. **Prefer the world over the overlay.** Room signage, system telemetry,
   personal logs, camera feeds, reactor readouts, the suit station and the
   nav hologram are all rendered as physical surfaces inside the 3D scene, lit
   as emissive materials and legible from a natural standing distance.
3. **Avionics only when flying.** The MFD gauges, velocity readout and target
   card fade in when the player takes the pilot seat and fade out when they
   stand up.
4. **Controls are taught once.** The controls panel appears the first time the
   player boards and never again automatically; it is reopenable from Settings.

## Visual language

| Role | Token | Value |
| ---- | ----- | ----- |
| Primary flight / nav data | tactical cyan | `#00F0FF` |
| Secondary telemetry | amber | `#FFB000` |
| Caution | hazard orange | `#FF6600` |
| Emergency | red | `#FF2244` |
| Confirmation | green | `#3EE88B` |
| Panel background | obsidian glass | `rgba(10,15,22,0.75)` + 12 px backdrop blur |
| Panel border | brushed metal | 1 px `#1F3347` |

**Typography** — *Rajdhani* (600/700) for headings and labels, *Share Tech
Mono* for all telemetry, on a strict scale: 14 px headers, 11 px subheads,
9.5–10.5 px mono data. Uppercase with wide letter-spacing for anything that
reads as instrumentation.

## Diegetic surfaces

`src/world/ship/screens.ts` renders text to a canvas *once*, then maps it onto a
world-space quad as both `map` and `emissiveMap`. These are UI glyphs on a
display panel — not a substitute for a material texture.

Every compartment has at least one: room signage beside each door, mission
briefing in Comms, personal logs on the cabin laptops, vitals and crew health in
Medical, spectrograph results in the lab, pressure/temperature/flow in Fuel
Processing, power draw by system in Power Distribution, warp charge and field
geometry in the drive room, camera feeds and a threat board in Defence, hatch
status and EVA suit telemetry in the Cargo Bay.

The two bridge MFDs are angled to sit flush with the dashboard's physical rake
rather than floating upright.

## Tactile feedback

Every switch, lever and cover has a three-state loop:

1. **Hover** — the reticle expands and the prompt fades in.
2. **Depress** — the mesh physically moves (the throttle lid hinges open, the
   warp cover lifts, the lever rotates through its arc, breaker levers throw)
   and a mechanical clunk plays.
3. **Engage** — a confirm chime, an emissive state change, and where relevant a
   progress readout on a nearby screen.

The throttle button will not respond until the safety lid is actually open; the
warp lever will not respond until the red cover is lifted *and* a destination is
locked. Both are gated on the animated state of the physical object, not a flag.

## Cinematic presentation

Letterbox bars, HUD suppression and camera authority are driven by a single
`cinematic` flag on the game state. The warp and descent sequences use real
composed camera shots — a wide three-quarter approach, a tight low chase as the
plasma sheath builds, an orbit around the descending hull with the ground
rushing up behind it, and a low flare framing as the dust ring blooms — rather
than FOV changes on a static view.

## Accessibility & settings

Graphics quality (low / medium / high — pixel ratio, shadows, bloom, vegetation
density), master / ambience / effects volume, mouse sensitivity, invert-Y,
fullscreen, and the controls reference. Interaction prompts are text, not
icon-only. Subtitles carry every spoken line and log excerpt.
