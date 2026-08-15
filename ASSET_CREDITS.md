# Asset Credits

All external assets in this project are **legally reusable** (CC0, public
domain, or CC‑BY with attribution). Files were downloaded and verified
(magic‑byte checked) into `public/assets/`. No asset is hot‑linked — everything
is self‑hosted.

---

## Engines & libraries

| Library | Version | License | Purpose |
| ------- | ------- | ------- | ------- |
| [three.js](https://threejs.org) | ^0.179 | MIT | 3D engine (WebGL2) |
| [Vite](https://vitejs.dev) | ^7 | MIT | Dev server / bundler |
| [TypeScript](https://www.typescriptlang.org) | ^5.9 | Apache‑2.0 | Typed source |

---

## Environment HDRIs — Poly Haven (CC0)

Real HDRIs used for the scene environment via `PMREMGenerator`. Distributed by
the `@pmndrs/assets` npm package (itself CC0), sourced from
[Poly Haven](https://polyhaven.com). CC0 1.0 — no attribution required, but
credit is given to Poly Haven.

| File (`public/assets/hdri/`) | Used for |
| ---------------------------- | -------- |
| `studio.exr` | Ship interior reflections |
| `forest.exr` | Alien jungle planet |
| `night.exr` | Deep space ambient |
| `warehouse.exr`, `dawn.exr`, `sky.exr`, `sunrise.exr`, `sunset.exr`, `venice.exr`, `park.exr`, `hall.exr`, `lobby.exr`, `lab.exr`, `city.exr`, `bridge.exr`, `apartment.exr`, `esplanade.exr`, `workshop.exr`, `memorial.exr` | Alternative environments / optional |

HDRI authors (Poly Haven): Greg Zaal, Rob Tuytel, Andreas Mischok and other
contributors — all Poly Haven assets are CC0.

---

## PBR texture sets — ambientCG (CC0)

Downloaded via the three.js official example asset pack
(`examples/textures/ambientcg`), originally from
[ambientCG](https://ambientcg.com). ambientCG releases all textures under
**CC0 1.0**.

| Files (`public/assets/textures/ambientcg/`) | Use |
| ------------------------------------------- | --- |
| `Ice002_1K-JPG_Color / _NormalGL / _Roughness / _Displacement` | Rocky/ice planet material |
| `Ice003_1K-JPG_Color` | Ice / glassy surfaces |

---

## PBR texture sets — three.js official examples

These real albedo/normal/roughness maps ship with the three.js repository
(`examples/textures/`) and are redistributed under the three.js MIT project
(sources are CC0/public‑domain photographs).

| Files (`public/assets/textures/`) | Use |
| --------------------------------- | --- |
| `Carbon.png`, `Carbon_Normal.png` | Hull panels, walls, consoles |
| `FloorsCheckerboard_S_Diffuse.jpg`, `FloorsCheckerboard_S_Normal.jpg` | Ship floor |
| `brick_diffuse.jpg`, `brick_bump.jpg`, `brick_roughness.jpg` | Planet ground detail |
| `hardwood2_diffuse.jpg`, `hardwood2_bump.jpg`, `hardwood2_roughness.jpg` | Bark / soil |
| `gold/Scratched_gold_01_1K_Normal.png` | Gold trim / fittings |

---

## Planet surface textures — NASA / public domain

Real Earth & Moon imagery (US Government / NASA — public domain), distributed
with the three.js examples.

| Files (`public/assets/textures/planets/`) | Use |
| ----------------------------------------- | --- |
| `earth_day_4096.jpg`, `earth_atmos_2048.jpg`, `earth_night_4096.jpg`, `earth_normal_2048.jpg`, `earth_specular_2048.jpg`, `earth_bump_roughness_clouds_4096.jpg`, `land_ocean_ice_cloud_2048.jpg` | Solar‑system world shading |
| `moon_1024.jpg` | Planetary moon |

---

## GLB models — Sketchfab (CC‑BY, attribution honored)

| File (`public/assets/models/`) | Model | Author | License |
| ------------------------------ | ----- | ------ | ------- |
| `space_ship_hallway.glb` | [Space Ship Hallway](https://skfb.ly/6SqUF) | [yeeyeeman](https://sketchfab.com/yeeyeeman) | [CC Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `PrimaryIonDrive.glb` | [Primary Ion Drive](https://blog.sketchfab.com/art-spotlight-primary-ion-drive/) | [Mike Murdock](https://mjmurdock.com) | CC Attribution |

Both models are redistributed as they appear in the three.js official examples
(`examples/models/gltf/`), which carry the same licenses.

---

## Photographic normal maps & matcaps — CC0

Real photographic material captures, distributed by the `@pmndrs/assets`
package (CC0).

| Folder | Use |
| ------ | --- |
| `public/assets/normals/*.webp` | Surface bump detail |
| `public/assets/matcaps/*.webp` | Photographic material shading |

---

### License summary

- **CC0 1.0** — Poly Haven HDRIs, ambientCG textures, @pmndrs normal/matcaps.
- **Public domain** — NASA planet textures.
- **CC‑BY 4.0 / CC Attribution** — `space_ship_hallway.glb`, `PrimaryIonDrive.glb`
  (attributed above).
- **MIT** — three.js sample textures, three.js, Vite, TypeScript.
