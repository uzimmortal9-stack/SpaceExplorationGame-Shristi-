# AEON DRIFT — UI/UX benchmark research

Research completed before HUD/menu implementation, as required by the master specification.

## Sources reviewed

1. **NASA, “Evaluation Methods for Testing Head-Up Display Flight Symbology”** — documents the evolution from collimated reflector sights, optical infinity focus, eye-reference/eyebox constraints, pitch-ladder variants, flight-path markers, and constrained/off-screen symbology.
   https://ntrs.nasa.gov/api/citations/19950017610/downloads/19950017610.pdf
2. **Star Citizen — official mobiGlas design notes** — describes a unified diegetic device, concurrent physical hologram and AR layers, contextual range/angle interaction, strong geometric grids, restrained color, solid backing for legibility, and world-state-driven glitches.
   https://robertsspaceindustries.com/en/comm-link/engineering/14466-Design-Notes-MobiGlas
3. **GDC coverage: Dead Space’s diegetic UI** — records the “diegetic by design and implementation” philosophy, the ship-as-character concept, suit/world displays, consistent color semantics, and the crucial rule that usability outranks diegesis when the two conflict.
   https://www.polygon.com/2013/3/31/4166250/dead-space-user-interface-gdc-2013/
4. **Alien: Isolation production/UI retrospective** — details the coherent retro-industrial visual language built from practical CRT/VHS artifacts, restricted color, borders, analogue noise, and tactile equipment rather than ornamental futuristic overlays.
   https://www.pcgamer.com/the-making-of-horror-masterpiece-alien-isolation-it-was-a-giddy-exhausting-intense-time/
5. **Elite Dangerous interface references** — reviewed its standardized amber holographic cockpit organization, physical dashboard relationship, side-panel grouping, and the readability advantages and drawbacks of transparent holographic data.
   https://tvtropes.org/pmwiki/pmwiki.php/Main/DiegeticInterface

## Design translation

### Exploration

- No persistent health bar, minimap, objective ribbon, or control legend.
- A 2 px optical reticle is the only resting overlay; it fades unless an interaction is available.
- Context prompts are one-line, distance-gated, and disappear immediately when gaze/range is lost.
- Settings and logs are presented as a dark-backed ship terminal/slate, not luminous text over arbitrary scenery.
- Ship systems use canvas textures on physical 3D screens. Important controls use actual animated meshes.

### Flight

- The physical multi-function displays carry speed, throttle, fuel, hull, gear, target, lock, and warp data.
- The forward flight-path marker is a world-direction marker at extreme virtual distance, not a reticle painted onto the glass. It therefore follows a target/velocity vector under head movement.
- Pitch ladder, boresight, heading ticks, and target diamond are sparse. Peripheral MFDs carry secondary data.
- Readout values use damped rolling interpolation to avoid snapping.

### Color semantics

- Navigation / nominal: tactical cyan `#00f0ff`.
- Ambient telemetry / selected: amber `#ffb000`.
- Caution: hazard orange `#ff6600`.
- Critical / locked: emergency red `#ff2244`.
- Panel backing: obsidian `rgba(10, 15, 22, .88)` with steel-blue `#1f3347` rules.

### Typography and scale

- Technical monospace stack: `Share Tech Mono` equivalent using local `ui-monospace`, `SFMono-Regular`, `Consolas`, monospace (no runtime font dependency).
- 14 pt bold headers; 11 pt medium subheads; 9–10 pt telemetry.
- Uppercase labels use tracking; values use tabular numerals.

### Interaction loop

Every interactive control has the full three-stage response:

1. **Hover:** edge/emissive highlight plus a restrained synthesized 1200 Hz micro-click.
2. **Depress:** mesh translates approximately 2 mm (scaled to the control), active color changes, synthesized mechanical clunk.
3. **Engage:** confirm chime, physical state animation, and the relevant world-screen status update.

### Accessibility and usability compromise

- Pause, first-run controls, and settings use an opaque-enough terminal panel because critical text must remain readable over every scene.
- Controls may be reopened from Settings; they are never permanently shown during play.
- Interaction text names the action, not merely the key (for example, `E  OPEN SAFETY COVER`).
- Motion intensity, mouse sensitivity, audio volume, and quality are adjustable.
