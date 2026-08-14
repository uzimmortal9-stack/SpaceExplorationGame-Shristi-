# Master specification implementation map

## Playable loop

The game begins in first-person exploration inside the ship. The player can traverse the central deck, enter every room, use the pilot seat, physically unlock thrust, select a body, physically unlock warp, complete a multi-stage warp, enter Nemora IV’s atmosphere, deploy landing gear, touch down, stand, cross the ship, cycle the aft airlock/ramp, explore the jungle, discover the waterfall/pool and activate the ruins mission-completion trigger, then walk back to the ship.

## Ship spaces

| Space | Implemented contents |
| --- | --- |
| Bridge | Two pilot seats, panoramic/side glazing, layered dashboard, dynamic MFDs, target selector, orbital-entry display, holographic orbits, throttle lid/button, warp cover/lever, side consoles, status displays |
| Cabin A / B | Beds, PDLC smart window buttons, workstation/chair, laptop/log, mouse, notebook, stylus, lamp, lockers, EVA suit, folded clothes, plant, photo, luggage, warm lighting, wall screen |
| Storage | Split sliding-glass freezer, ration packs, shelves, tool rack, crates, lockers, repair supplies |
| H₂ processing | Bulletproof observation glass, animated tanks/liquid, pipes, valves, diagnostic display, extractor/processing interaction |
| Washroom A / B | Vacuum toilet, sink, mirror, faucet, sonic shower, compact pod, hygiene locker |
| Comms/briefing | Six seats, holographic central table, long-range communication screen, mission briefing interaction |
| Crew lounge | Seats, table, media/time screen, plants, coffee dispenser with cup/brew cycle |
| Dining/galley | Six seats, dining table, cabinets, rehydration/beverage unit, galley status |
| Medical | Two scan beds, moving scanner arches, vital displays, medication locker, recovery pod |
| Defense/security | Weapon lockers, rifles/cells, threat/turret/camera console, tactical lighting |
| Science lab | Bench, sample scanner, holographic specimen, vials, artifact crate, xeno-analysis sequence |
| Reactor | Pulsing fusion core, containment rings, conduits, diagnostics, hazard palette |
| Engineering | Visible propulsion core, work table, tools, coolant and parts crates |
| Warp drive | Central animated warp core/rings, status display, physical engine-room lever |
| Cargo/airlock | Cargo restraints/crates, suit station/status, pressure display, split outer hatch, animated ramp |
| Life support | Air-recycling units, animated fans, O₂/CO₂/humidity screen, pipework |
| Power distribution | Battery banks, individual cells, load display, interactive reroute |
| Coolant/relay | Fans, batteries, tools, coolant pipes and access machinery |
| Utility/access | Continuous corridor, structural ribs, floor hatches, vents, conduits, docking status, signage |

## Systems

- **Movement:** damped WASD, sprint, jump, crouch, mouse look, gravity, head motion, surface/interior footsteps, terrain height following, AABB/cylinder resolution.
- **Doors:** paired physical leaves, proximity sensors, hydraulic sound, collision disabling only after clearance, obstruction hold-open behavior.
- **Interaction:** center-ray gaze, distance gates, dynamic verb prompts, three-stage highlight/depress/confirm feedback.
- **Flight:** virtual position/orientation, pitch/yaw/roll, throttle, reverse, boost, dampeners, fuel, target vector, cockpit/chase/orbital cameras.
- **HUD:** physical canvas-textured MFDs and world-direction collimated target/velocity markers; rolling damped telemetry.
- **Solar system:** animated sun/corona/rays, five targetable bodies, moons, ringed gas giant, orbital paths, instanced asteroid belt, procedural star field.
- **Warp:** preparation checks, core charge telemetry/audio, energy build, streak/tunnel shader, FOV response, travel, deceleration and target-relative arrival.
- **Atmospheric entry:** plasma shader, hull heat, clouds, altitude transitions, camera/FOV motion, landing-gear hold, thrust descent, touchdown and expanding dust ring.
- **Surface:** seeded height field, exact ship pad/ramp clamp, giant trees/roots, instanced ferns, glowing plants, fungi, vines, rocks, paths, ruins, emissive runes, waterfall/pool shaders, mist, spores, fog, god rays, alien sky, moon/rings.
- **Audio:** Web Audio oscillators/noise for ship ambience, airflow, UI, switches, doors, footsteps, warp charge/burst, touchdown and jungle cues.
- **Persistence:** settings and checkpoint state for location, target, landed/space state, suit, ramp, safety interlocks and toggles.
- **Optimization:** instancing, shared geometry/materials, quality-dependent counts/pixel ratio, procedural deterministic placement, simplified collision, hidden surface environment before landing.
- **Debug:** backtick diagnostics for FPS, teleport, noclip, collision, wireframe and sequence shortcuts.

## Geometry alignment directive

`src/world/geometryAlignment.ts` implements floor, wall, ceiling and center pivot modes from computed bounding boxes. Surface placement uses downward raycasts with a 0.001 m epsilon and optional quaternion alignment to the hit normal. Render bounds feed simplified colliders so visual/contact bottom planes remain conformant.

## UI directive

Exploration contains no static status overlays. Menus use an industrial command-slate language; gameplay state is primarily shown on physical world screens. Context prompts and cinematic statuses are temporary. Research and rationale are recorded in `docs/UI_RESEARCH.md`.
