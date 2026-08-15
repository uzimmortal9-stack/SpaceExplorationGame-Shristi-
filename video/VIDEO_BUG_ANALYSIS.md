# Video Bug Report & Diagnostic Breakdown
**Source File**: `video/Godot_v4.3-stable_win64_bGxq4wlJIe.mp4`  
**Duration**: 4 min 41 sec (281.73s) | **Resolution**: 1920x1054 @ 30 FPS  
**Target Engine**: Godot Engine 4.3 Stable (Forward+ Vulkan / C# / GDScript)

---

## Executive Summary of Video Evidence

This document translates the gameplay video recording into structured diagnostic data, visual descriptions, and exact engine-level root causes.

```
+----------------------------------------------------------------------------------------------------+
|                                    GAMEPLAY CHRONOLOGY & BUG TIMELINE                              |
+----------------------------------------------------------------------------------------------------+
| 00:00 - 00:30  | Spawn at Bridge -> Lighting blowout, plain white walls, void drop at doorway       |
| 00:31 - 01:10  | Corridors & Cabins -> Plain white props, black opaque observation windows         |
| 01:11 - 01:50  | Falling in Void -> 100% black void, missing stars/skybox/environment              |
| 01:51 - 02:40  | Medical & Galley -> MultiMesh batching discard, white-on-white missing props       |
| 02:41 - 03:40  | Engineering & Reactor -> add_child hierarchy runtime exceptions, shader bugs       |
| 03:41 - 04:41  | Pilot Seat & Flight -> Debugger error spam on null flight / warp references        |
+----------------------------------------------------------------------------------------------------+
```

---

## Detailed Bug Breakdown (Timestamp by Timestamp)

### 1. Collision Hole at Room Thresholds & Void Drop
- **Timecodes in Video**: `00:18 - 00:35`, `01:15 - 01:45`, `02:40 - 03:00`
- **Visual Symptoms**: When the player attempts to enter any lateral room (Crew Cabins, Lounge, Galley, Medical, Science Lab) from the main central corridor, the player steps through the door and immediately drops into empty void space beneath the deck.
- **Root Cause in Code**: 
  - In `godot/scripts/world/ship_layout.gd`, the central spine corridor was defined with `CORRIDOR_HALF = 2.0` (spanning `x` from `-2.0` to `+2.0`).
  - However, all room compartments begin at `x = -3.0` (port side) and `x = +3.0` (starboard side).
  - This left a continuous **1.0-metre unfloored and uncollided void strip** on both sides of the corridor along the entire length of the ship.
- **Fix**:
  - Expanded `CORRIDORS` spine rectangle to span `x0 = -3.0, x1 = 3.0` so corridor floor tiles and static collision boxes seamlessly meet every room's floor boundary.
  - Added a defensive void recovery guard in `player.gd` that repositions the player to the last grounded deck position if `global_position.y < -1.0`.

---

### 2. Plain White Textures & "Missing" Props
- **Timecodes in Video**: `00:05 - 00:40`, `01:00 - 01:30`, `02:15 - 02:50`
- **Visual Symptoms**: Almost all structural geometry (floors, wall panels, ceilings, bulkheads) and furniture/tech props (desks, consoles, lockers, chairs, beds, tables) render in stark, flat white. Some props appear invisible because they are white models placed against identical white surfaces.
- **Root Cause in Code**:
  - `MultiMeshInstance3D` in Godot accepts only a single material override per instance node.
  - In `godot/scripts/world/ship_builder.gd`, multi-surface modular kit models (having 2 to 4 distinct surfaces for panels, trims, and frames) had materials assigned via node surface overrides. `MultiMesh` silently discarded these overrides at render time.
  - In `godot/scripts/assets/palette.gd`, when an imported GLB material name was empty or generic (e.g. `"Material.001"`), `resolve()` returned empty, leaving Godot's default `StandardMaterial3D` (`albedo_color = Color.WHITE`).
- **Fix**:
  - Updated `ship_builder.gd` to split multi-surface meshes into individual `ArrayMesh` surfaces via `_extract_surface()`, batching each surface independently in MultiMesh with its respective PBR material.
  - Added comprehensive fallback rules in `palette.gd` for sci-fi hull panels, metallic trims, and tech equipment.

---

### 3. Black Opaque Windows & Missing Outside Space View
- **Timecodes in Video**: `00:55 - 01:25`
- **Visual Symptoms**: Looking through viewport panels in the Bridge and Crew Cabins shows pitch-black rectangular slabs with no transparency and no stars outside.
- **Root Cause in Code**:
  - In `ship_builder.gd`, the procedural exterior hull shell was constructed as a single solid unbroken bounding box that encased and occluded all window openings.
  - The viewport glass material in `ship_rooms.gd` lacked correct alpha blend flags and depth testing parameters.
- **Fix**:
  - Segmented `_build_hull_shell()` into 5 individual structural slabs, leaving the viewport latitude band open.
  - Configured `_glass()` with `StandardMaterial3D.TRANSPARENCY_ALPHA`, `roughness = 0.05`, and `cull_mode = CULL_DISABLED`.

---

### 4. Void & Sky Completely Black (No Space Environment)
- **Timecodes in Video**: `01:20 - 01:50`
- **Visual Symptoms**: When the camera falls outside the ship, the surrounding world is 100% black with no starfield, nebula, planets, or cosmic lighting.
- **Root Cause in Code**:
  - `godot/scenes/main.tscn` had `Environment` configured with `background_mode = 1` (`BG_COLOR` set to black).
  - Space sky shaders and HDRIs were never bound to the active WorldEnvironment during the space / flight phase (only loaded upon planetary descent).
- **Fix**:
  - Created `godot/shaders/space_sky.gdshader` containing multi-octave procedural starfield layers, nebula dust glow, and stellar corona lighting.
  - Attached `PanoramaSkyMaterial` / `space_sky.gdshader` to `world_env.environment.sky` with `background_mode = BG_SKY` on startup.

---

### 5. Lighting Blowout & Over-Exposure
- **Timecodes in Video**: `00:05 - 00:25`, `02:00 - 02:30`
- **Visual Symptoms**: Extreme white clipping and glare on interior surfaces, obscuring wall panel textures and HUD crosshair readability.
- **Root Cause in Code**:
  - Light energy values ported from Three.js `RectAreaLight` (which has quadratic falloff over small areas) were transferred directly to Godot `OmniLight3D`, generating excessive lumen intensity.
  - Tonemapping exposure was set too high for ACES tonemapper.
- **Fix**:
  - Scaled down `InteriorLighting` omni energies from 2.5–3.5 down to 0.6–1.1.
  - Adjusted `tonemap_mode = 3` (Filmic) and `tonemap_exposure = 0.75` in `main.tscn`.

---

### 6. Godot 4.3 Runtime / GDScript Errors
- **Timecodes in Video**: `03:00 - 04:30`
- **Visual Symptoms / Error Log**:
  - `Parser Error: Function "add_child()" not found in base self.` in `ship_rooms_engineering.gd`.
  - `Invalid access to property or key 'host' on a base object of type 'Node3D'.`
  - `Invalid access to property or key 'active' on a base object of type 'Nil'.` in `game.gd:210`.
  - `SCREEN_TEXTURE` shader compilation warning in Godot 4.3.
- **Root Cause in Code**:
  - `ship_rooms_engineering.gd` is a `RefCounted` helper class; calls to `add_child()` needed delegation to `host.add_child()`, while calls on child nodes needed `.add_child()`.
  - `_process()` in `game.gd` accessed `flight.active` and `warp.is_active()` before nodes finished instantiating.
  - Godot 4.3 requires `uniform sampler2D screen_texture : hint_screen_texture` in canvas shaders.
- **Fix**:
  - Corrected all node hierarchy attachments and delegation methods.
  - Added null-safety checks (`if flight != null and flight.active:`) in `game.gd`.
  - Updated `warp_distort.gdshader` to Godot 4.3 syntax.

---

## Machine-Readable Code Export

A complete JSON dataset with milestone timecodes, bug tags, full diagnostic descriptions, and Base64-encoded frame snapshots is exported at:
`video/video_code_analysis.json`
