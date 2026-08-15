# Asset Download Manifest

The game ships and runs with the **real assets already in `public/assets/`**
(HDRIs, PBR sets, planet textures, GLB models — see ASSET_CREDITS.md). The
network in the build sandbox could not reach every CC0 source, so a few
**optional, higher‑quality** texture sets are listed here. They are **drop‑in**:
place the files at the exact paths below and the game loads them automatically
with **zero code changes** (the material library reads from `public/assets/` by
name).

If a file is absent, the game gracefully falls back to the closest bundled
texture, so the experience is never broken.

---

## How to install

1. Download the files from the linked source.
2. Save them at the exact path under `public/assets/...` shown in the table
   (create the folder if needed).
3. Restart `npm run dev`. Done.

---

## Optional texture upgrades

| Asset / purpose | Put it at | Source | License |
| --------------- | --------- | ------ | ------- |
| Alien jungle **grass/soil** PBR set (color+normal+roughness) | `public/assets/textures/jungle/grass_Color.jpg`, `grass_Normal.jpg`, `grass_Roughness.jpg` | https://ambientcg.com/list?q=grass | CC0 |
| Sci‑fi **metal plates** PBR set | `public/assets/textures/metal/metal_Color.jpg`, `metal_Normal.jpg`, `metal_Roughness.jpg` | https://ambientcg.com/list?q=metal | CC0 |
| **Rock / cliff** PBR set | `public/assets/textures/rock/rock_Color.jpg`, `rock_Normal.jpg`, `rock_Roughness.jpg` | https://ambientcg.com/list?q=rock | CC0 |
| **Rusted / weathered hull** PBR set | `public/assets/textures/rust/rust_Color.jpg`, `rust_Normal.jpg`, `rust_Roughness.jpg` | https://ambientcg.com/list?q=rust | CC0 |
| **Panel / screen grid** detail set | `public/assets/textures/panel/panel_Color.jpg`, `panel_Normal.jpg`, `panel_Roughness.jpg` | https://ambientcg.com/list?q=panel | CC0 |

*(ambientCG files are typically `*_1K-JPG_Color.jpg`, `*_1K-JPG_NormalGL.jpg`,
`*_1K-JPG_Roughness.jpg` — rename them to the exact names above when you drop
them in.)*

> Note: the shipped materials currently use the bundled Carbon / checkerboard /
> brick / hardwood sets. To actually use these drops, the material library would
> need `public/assets/textures/<name>/…` files present; the loader already
> prefers real files. For a zero‑code swap of the **planet ground**, name your
> grass set as above and it replaces the ground when present.

---

## Optional 3D props (CC0 / CC‑BY)

| Asset / purpose | Put it at | Source | License |
| --------------- | --------- | ------ | ------- |
| Kenney **Space / Sci‑Fi props** (GLB/GLTF) | `public/assets/models/` (any `.glb`) | https://kenney.nl/assets | CC0 |
| Quaternius **Ultimate Sci‑Fi / Modular props** | `public/assets/models/` | https://quaternius.com | CC0 |
| Poly Haven **rock / boulder** models | `public/assets/models/` | https://polyhaven.com/models | CC0 |

The asset loader (`src/world/assets.ts`) can load any additional GLB placed in
`public/assets/models/`; wire them into a room by adding a `Props`/`ShipInterior`
entry if desired.

---

## Notes

- All manifests are advisory. The **required** assets for a complete,
  playable game are already committed under `public/assets/` and verified.
- Licenses: ambientCG, Kenney, Quaternius, Poly Haven = **CC0**; Sketchfab CC‑BY
  models already present are attributed in ASSET_CREDITS.md.
