import * as THREE from "three";
import { mat, tinted, emissiveSurface } from "./materials";
import { group, roundedBox, box, cyl, cone, sphere, torus, capsule, glowStrip, groundPivot } from "./geo";

/**
 * PropFactory — authored, beveled props with correct pivots (origin at floor /
 * contact point). Materials come from the real-PBR library.
 */

export const matMesh = (g: THREE.BufferGeometry, m: THREE.Material) => new THREE.Mesh(g, m);

function floorGroup(...children: THREE.Object3D[]): THREE.Group {
  const g = group(...children);
  groundPivot(g);
  return g;
}

/** Swivel office / bridge chair. */
export function seat(accent: number = 0x223a5a): THREE.Group {
  const base = cyl(0.16, 0.22, 0.06, mat("hullDark"));
  const post = cyl(0.05, 0.05, 0.3, mat("steel"));
  const seatPad = roundedBox(0.48, 0.08, 0.46, 0.05, mat("fabric"));
  seatPad.position.y = 0.34;
  const back = roundedBox(0.46, 0.5, 0.08, 0.04, mat("fabric"));
  back.position.set(0, 0.62, -0.2);
  back.rotation.x = -0.1;
  const armL = roundedBox(0.06, 0.1, 0.4, 0.02, mat("hullDark"));
  armL.position.set(-0.26, 0.48, -0.02);
  const armR = armL.clone();
  armR.position.x = 0.26;
  const glow = glowStrip(0.3, 0.02, emissiveSurface(accent, 1.2));
  glow.position.set(0, 0.42, 0.24);
  const out = floorGroup(base, post, seatPad, back, armL, armR, glow);
  out.userData.kind = "seat";
  return out;
}

/** Pilot seat (bridge) — taller, with controls arm. */
export function pilotSeat(accent: number): THREE.Group {
  const s = seat(accent);
  // lift seat slightly and add a control arm console
  const arm = roundedBox(0.32, 0.06, 0.4, 0.03, mat("console"));
  arm.position.set(0.42, 0.66, 0.0);
  const stick = cyl(0.02, 0.025, 0.22, mat("hullDark"));
  stick.position.set(0.42, 0.78, 0.1);
  const grip = sphere(0.04, mat("rubber"));
  grip.position.set(0.42, 0.9, 0.1);
  s.add(arm, stick, grip);
  s.userData.kind = "pilotSeat";
  return s;
}

/** Dashboard / console with screens. */
export function console({ w = 1.6, h = 0.9, d = 0.6, screens = 3 }: { w?: number; h?: number; d?: number; screens?: number }): THREE.Group {
  const body = roundedBox(w, h, d, 0.04, mat("console"));
  const top = roundedBox(w, 0.06, d * 0.9, 0.03, mat("hullDark"));
  top.position.y = h / 2 + 0.03;
  const out = floorGroup(body, top);
  const screenW = (w - 0.2) / screens;
  for (let i = 0; i < screens; i++) {
    const scr = box(screenW - 0.05, h * 0.55, 0.02, emissiveSurface(0x22e6ff, 1.1));
    scr.position.set(-w / 2 + 0.1 + screenW * (i + 0.5), h * 0.28, d / 2 + 0.01);
    scr.rotation.x = 0.35;
    out.add(scr);
  }
  // indicator lights
  for (let i = 0; i < 5; i++) {
    const led = sphere(0.012, emissiveSurface([0x39ff88, 0xffb000, 0xff2244][i % 3], 2));
    led.position.set(-w / 2 + 0.12 + i * 0.09, h * 0.02, d / 2 + 0.01);
    out.add(led);
  }
  out.userData.kind = "console";
  return out;
}

/** Wall-mounted screen with emissive content. */
export function wallScreen(w: number, h: number, color = 0x22e6ff): THREE.Group {
  const frame = box(w + 0.08, h + 0.08, 0.05, mat("hullDark"));
  const scr = box(w, h, 0.03, emissiveSurface(color, 1.0));
  scr.position.z = 0.03;
  const out = group(frame, scr);
  out.userData.kind = "screen";
  return out;
}

/** Bed with bedding, pillow, smart-window beside. */
export function bed(withWindow: boolean): THREE.Group {
  const frame = roundedBox(0.95, 0.24, 2.0, 0.05, mat("hullLight"));
  frame.position.y = 0.12;
  const mattress = roundedBox(0.9, 0.16, 1.95, 0.06, mat("bedding"));
  mattress.position.y = 0.3;
  const pillow = roundedBox(0.5, 0.1, 0.32, 0.04, mat("fabric"));
  pillow.position.set(0, 0.42, -0.82);
  const blanket = roundedBox(0.88, 0.08, 1.3, 0.05, tinted("fabric", 0x2e4a6e));
  blanket.position.set(0, 0.42, 0.25);
  const out = floorGroup(frame, mattress, pillow, blanket);
  if (withWindow) {
    const win = roundedBox(0.7, 0.5, 0.05, 0.02, mat("glass"));
    win.position.set(0, 1.3, -1.0);
    win.userData.isWindow = true;
    win.userData.pdlc = true;
    out.add(win);
    const btn = sphere(0.03, emissiveSurface(0x22e6ff, 1.5));
    btn.position.set(0, 0.9, -1.05);
    btn.userData.toggleWindow = true;
    out.add(btn);
  }
  out.userData.kind = "bed";
  return out;
}

/** Desk + chair workstation. */
export function workstation(withLaptop: boolean): THREE.Group {
  const deskTop = roundedBox(1.2, 0.05, 0.7, 0.02, mat("hullLight"));
  deskTop.position.y = 0.72;
  const legL = box(0.06, 0.72, 0.6, mat("hullDark"));
  legL.position.set(-0.5, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.5;
  const chair = seat(0x2a5a4a);
  chair.position.set(0, 0, 0.75);
  const out = floorGroup(deskTop, legL, legR, chair);
  if (withLaptop) {
    const laptop = roundedBox(0.42, 0.02, 0.28, 0.01, mat("hullDark"));
    laptop.position.set(0, 0.76, 0.02);
    const screenLaptop = box(0.42, 0.28, 0.015, emissiveSurface(0x88d8ff, 0.9));
    screenLaptop.position.set(0, 0.9, 0.02);
    screenLaptop.rotation.x = -0.15;
    const mouse = roundedBox(0.08, 0.03, 0.11, 0.01, mat("rubber"));
    mouse.position.set(0.3, 0.76, 0.15);
    out.add(laptop, screenLaptop, mouse);
    const notebook = roundedBox(0.22, 0.015, 0.3, 0.005, mat("bedding"));
    notebook.position.set(-0.3, 0.76, 0.0);
    notebook.rotation.y = 0.3;
    out.add(notebook);
  }
  out.userData.kind = "workstation";
  return out;
}

/** Locker / cabinet that can open (visual). */
export function locker(): THREE.Group {
  const body = roundedBox(0.6, 1.9, 0.5, 0.02, mat("hullLight"));
  body.position.y = 0.95;
  const handle = roundedBox(0.28, 0.03, 0.02, 0.01, mat("steel"));
  handle.position.set(-0.12, 1.15, 0.26);
  const out = floorGroup(body, handle);
  out.userData.kind = "locker";
  out.userData.openOffset = new THREE.Vector3(0, 0, -0.42); // door swing handled by animator
  return out;
}

/** Shelf unit with small items. */
export function shelf(items: number): THREE.Group {
  const out = new THREE.Group();
  const w = 1.4;
  const posts: THREE.Object3D[] = [];
  for (const x of [-w / 2, w / 2]) {
    const p = box(0.05, 1.9, 0.3, mat("hullDark"));
    p.position.set(x, 0.95, 0);
    posts.push(p);
  }
  for (let i = 0; i < 4; i++) {
    const s = box(w, 0.04, 0.3, mat("hullLight"));
    s.position.set(0, 0.4 + i * 0.4, 0);
    out.add(s);
    // small items
    for (let j = 0; j < items; j++) {
      const item = sphere(0.03 + Math.random() * 0.02, mat("gold"));
      item.position.set(-w / 2 + 0.15 + Math.random() * (w - 0.3), 0.4 + i * 0.4 + 0.05, Math.random() * 0.1 - 0.05);
      out.add(item);
    }
  }
  out.add(...posts);
  groundPivot(out);
  out.userData.kind = "shelf";
  return out;
}

/** Artificial plant. */
export function plant(): THREE.Group {
  const pot = cone(0.16, 0.24, mat("hullDark"), 16);
  const stem = cyl(0.012, 0.012, 0.5, mat("plant"));
  stem.position.y = 0.24;
  const leaves: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const leaf = roundedBox(0.12, 0.3, 0.02, 0.01, tinted("plant", 0x2f8f4f));
    leaf.position.y = 0.4 + Math.random() * 0.2;
    leaf.rotation.x = -0.4;
    leaf.rotation.y = (i / 6) * Math.PI * 2;
    leaf.rotation.z = 0.3 * (i % 2 === 0 ? 1 : -1);
    leaves.push(leaf);
  }
  const out = floorGroup(pot, stem, ...leaves);
  out.userData.kind = "plant";
  return out;
}

/** Desk lamp with toggleable light. */
export function lamp(): THREE.Group {
  const base = cyl(0.09, 0.11, 0.03, mat("hullDark"));
  const arm = cyl(0.02, 0.02, 0.4, mat("steel"));
  arm.position.y = 0.18;
  arm.rotation.z = 0.3;
  const head = cone(0.07, 0.06, mat("hullLight"), 12);
  head.position.set(0.2, 0.42, 0);
  head.rotation.z = -Math.PI / 2;
  const out = floorGroup(base, arm, head);
  out.userData.kind = "lamp";
  out.userData.lampLight = true;
  return out;
}

/** Toilet (space-friendly). */
export function toilet(): THREE.Group {
  const bowl = roundedBox(0.42, 0.42, 0.5, 0.08, mat("wall"));
  bowl.position.y = 0.24;
  const seatT = torus(0.17, 0.03, mat("wallDark"), 20);
  seatT.rotation.x = Math.PI / 2;
  seatT.position.y = 0.42;
  const tank = roundedBox(0.5, 0.5, 0.2, 0.04, mat("hullLight"));
  tank.position.set(0, 0.62, 0.28);
  const out = floorGroup(bowl, seatT, tank);
  out.userData.kind = "toilet";
  out.userData.toilet = true;
  return out;
}

/** Basin sink with mirror. */
export function sink(): THREE.Group {
  const basin = cyl(0.16, 0.16, 0.12, mat("wall"), 16);
  basin.position.y = 0.8;
  const stem = cyl(0.1, 0.14, 0.8, mat("hullLight"), 16);
  stem.position.y = 0.4;
  const faucet = roundedBox(0.3, 0.05, 0.05, 0.02, mat("steel"));
  faucet.position.set(0, 0.92, 0.1);
  const mirror = box(0.5, 0.6, 0.02, mat("glass"));
  mirror.position.set(0, 1.5, -0.4);
  const out = floorGroup(basin, stem, faucet, mirror);
  out.userData.kind = "sink";
  out.userData.sink = true;
  return out;
}

/** Shower / wash pod. */
export function showerPod(): THREE.Group {
  const base = roundedBox(0.9, 0.05, 0.9, 0.03, mat("wallDark"));
  base.position.y = 0.03;
  const glass = box(0.9, 2.0, 0.02, mat("glass"));
  glass.position.set(0, 1.0, -0.43);
  const head = cone(0.08, 0.05, mat("steel"), 12);
  head.position.set(0, 1.95, 0);
  const pole = cyl(0.02, 0.02, 1.9, mat("steel"));
  pole.position.set(-0.35, 0.95, 0);
  const out = floorGroup(base, glass, head, pole);
  out.userData.kind = "shower";
  out.userData.shower = true;
  return out;
}

/** Storage crate. */
export function crate(s: number, color = 0x3a4a5a): THREE.Group {
  const body = roundedBox(s, s * 0.7, s, 0.04, tinted("console", color));
  const rim = torus(s * 0.5, 0.02, mat("steel"), 16);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = s * 0.36;
  const out = floorGroup(body, rim);
  out.userData.kind = "crate";
  return out;
}

/** Fuel tank (vertical capsule). */
export function fuelTank(): THREE.Group {
  const body = capsule(0.35, 0.9, mat("hullLight"), 16);
  body.position.y = 0.8;
  const band1 = torus(0.36, 0.03, mat("gold"), 20);
  band1.rotation.x = Math.PI / 2;
  band1.position.y = 0.55;
  const band2 = band1.clone();
  band2.position.y = 1.05;
  const gauge = wallScreen(0.12, 0.2, 0xffb000);
  gauge.position.set(0.3, 0.8, 0);
  const out = floorGroup(body, band1, band2, gauge);
  out.userData.kind = "fuelTank";
  return out;
}

/** Reactor / warp core (glowing). */
export function core(glowColor: number, accent: number): THREE.Group {
  void accent;
  const outer = cyl(0.55, 0.7, 1.4, tinted("steel", 0x556), 24);
  outer.position.y = 0.9;
  const ring1 = torus(0.6, 0.05, mat("gold"), 24);
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = 0.9;
  const ring2 = torus(0.6, 0.05, mat("gold"), 24);
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 1.3;
  const inner = sphere(0.4, emissiveSurface(glowColor, 2.2), 24);
  inner.position.y = 0.9;
  inner.userData.pulse = true;
  const glowRing = torus(0.42, 0.03, emissiveSurface(glowColor, 2.5), 24);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.9;
  const out = floorGroup(outer, ring1, ring2, inner, glowRing);
  out.userData.kind = "core";
  out.userData.core = true;
  out.userData.pulseMesh = inner;
  return out;
}

/** Cargo ramp cargo crate stack. */
export function pallet(): THREE.Group {
  const base = box(1.0, 0.1, 0.9, mat("hullDark"));
  base.position.y = 0.05;
  const c1 = crate(0.6, 0x5a4a3a);
  c1.position.set(0, 0.1, 0);
  const c2 = crate(0.4, 0x4a5a4a);
  c2.position.set(0.22, 0.7, -0.1);
  const out = group(base, c1, c2);
  out.userData.kind = "pallet";
  return out;
}

/** Medical bed. */
export function medBed(): THREE.Group {
  const frame = roundedBox(0.8, 0.35, 2.0, 0.05, mat("hullLight"));
  frame.position.y = 0.35;
  const pad = roundedBox(0.72, 0.12, 1.8, 0.04, mat("bedding"));
  pad.position.y = 0.6;
  const railL = box(0.04, 0.2, 1.8, mat("steel"));
  railL.position.set(-0.38, 0.68, 0);
  const railR = railL.clone();
  railR.position.x = 0.38;
  const out = floorGroup(frame, pad, railL, railR);
  out.userData.kind = "medBed";
  return out;
}

/** Overhead surgical lamp. */
export function surgicalLamp(): THREE.Group {
  const arm = cyl(0.02, 0.02, 1.0, mat("steel"));
  arm.rotation.x = Math.PI / 2;
  const head = sphere(0.16, emissiveSurface(0xffffff, 1.6), 16);
  head.position.set(0, -0.2, 0);
  const out = group(arm, head);
  out.userData.kind = "surgicalLamp";
  out.userData.lampLight = true;
  return out;
}

/** EVA suit station (wall). */
export function suitStation(): THREE.Group {
  const back = box(0.6, 1.0, 0.1, mat("hullLight"));
  back.position.y = 1.0;
  const torso = roundedBox(0.4, 0.5, 0.25, 0.08, tinted("fabric", 0xe8eef4));
  torso.position.y = 1.0;
  const helmet = sphere(0.18, mat("glass"), 20);
  helmet.position.y = 1.4;
  const armL = capsule(0.08, 0.25, tinted("fabric", 0xd0d8e0));
  armL.rotation.z = Math.PI / 2;
  armL.position.set(-0.28, 1.0, 0);
  const armR = armL.clone();
  armR.position.x = 0.28;
  const out = group(back, torso, helmet, armL, armR);
  out.userData.kind = "suit";
  return out;
}

/** Couch (lounge). */
export function couch(): THREE.Group {
  const base = roundedBox(1.6, 0.18, 0.8, 0.06, mat("fabric"));
  base.position.y = 0.28;
  const back = roundedBox(1.6, 0.5, 0.2, 0.06, mat("fabric"));
  back.position.set(0, 0.6, -0.32);
  const armL = roundedBox(0.18, 0.45, 0.8, 0.05, mat("fabric"));
  armL.position.set(-0.79, 0.5, 0);
  const armR = armL.clone();
  armR.position.x = 0.79;
  const out = floorGroup(base, back, armL, armR);
  out.userData.kind = "couch";
  return out;
}

/** Coffee / beverage station. */
export function coffeeStation(): THREE.Group {
  const body = roundedBox(0.7, 0.9, 0.5, 0.04, mat("hullLight"));
  body.position.y = 0.45;
  const dispenser = roundedBox(0.2, 0.25, 0.2, 0.03, mat("hullDark"));
  dispenser.position.set(0, 0.85, 0.12);
  const nozzle = cone(0.03, 0.04, mat("steel"), 8);
  nozzle.position.set(0, 0.72, 0.12);
  const cup = cyl(0.04, 0.03, 0.07, tinted("wall", 0xffffff), 10);
  cup.position.set(0.15, 0.68, 0.1);
  const out = floorGroup(body, dispenser, nozzle, cup);
  out.userData.kind = "coffee";
  out.userData.coffee = true;
  return out;
}

/** Holo / meeting table with embedded display. */
export function holoTable(): THREE.Group {
  const top = roundedBox(1.8, 0.06, 1.0, 0.03, mat("hullLight"));
  top.position.y = 0.72;
  const leg = cyl(0.15, 0.2, 0.72, mat("hullDark"), 16);
  leg.position.y = 0.36;
  const holo = box(1.2, 0.7, 0.02, emissiveSurface(0x22e6ff, 0.8));
  holo.position.set(0, 0.86, 0);
  holo.userData.holo = true;
  const out = floorGroup(top, leg, holo);
  out.userData.kind = "holoTable";
  return out;
}

/** Dining table with chairs. */
export function diningTable(): THREE.Group {
  const top = roundedBox(1.4, 0.06, 0.9, 0.03, mat("hullLight"));
  top.position.y = 0.74;
  const leg = box(1.2, 0.72, 0.7, mat("hullDark"));
  leg.position.y = 0.36;
  const out = floorGroup(top, leg);
  // chairs
  for (const [cx, cz] of [
    [-0.7, 0.55],
    [0.7, 0.55],
    [-0.7, -0.55],
    [0.7, -0.55],
  ] as const) {
    const chair = seat(0x5a3a2a);
    chair.position.set(cx, 0, cz);
    chair.rotation.y = Math.atan2(-cx, -cz);
    out.add(chair);
  }
  // plates
  for (const [cx, cz] of [
    [-0.4, 0.2],
    [0.4, 0.2],
    [-0.4, -0.2],
    [0.4, -0.2],
  ] as const) {
    const plate = cyl(0.09, 0.09, 0.015, mat("wall"), 12);
    plate.position.set(cx, 0.77, cz);
    out.add(plate);
  }
  out.userData.kind = "diningTable";
  return out;
}

/** Lab bench with samples. */
export function labBench(): THREE.Group {
  const top = roundedBox(1.6, 0.05, 0.75, 0.02, mat("wall"));
  top.position.y = 0.78;
  const cab = roundedBox(1.5, 0.78, 0.7, 0.03, mat("hullLight"));
  cab.position.y = 0.39;
  const out = floorGroup(top, cab);
  // test tubes
  for (let i = 0; i < 5; i++) {
    const tube = cyl(0.02, 0.02, 0.18, mat("glass"), 8);
    tube.position.set(-0.6 + i * 0.3, 0.88, 0);
    const cap = sphere(0.02, emissiveSurface(0x39ff88, 1.2));
    cap.position.set(-0.6 + i * 0.3, 0.98, 0);
    out.add(tube, cap);
  }
  // microscope
  const ms = roundedBox(0.12, 0.3, 0.12, 0.02, mat("hullDark"));
  ms.position.set(0.55, 0.82, 0.1);
  const msTube = cyl(0.015, 0.015, 0.25, mat("steel"));
  msTube.rotation.x = 0.4;
  msTube.position.set(0.58, 0.95, 0.15);
  out.add(ms, msTube);
  out.userData.kind = "labBench";
  out.userData.scanner = true;
  return out;
}

/** Security weapon rack. */
export function weaponRack(): THREE.Group {
  const back = box(1.2, 0.06, 0.12, mat("hullDark"));
  back.position.y = 1.2;
  const rack = box(0.1, 1.2, 0.1, mat("hullLight"));
  rack.position.y = 0.6;
  const out = floorGroup(back, rack);
  for (let i = 0; i < 4; i++) {
    const gun = roundedBox(0.05, 0.6, 0.05, 0.01, mat("hullDark"));
    gun.position.set(-0.45 + i * 0.3, 0.9, 0);
    gun.rotation.x = -0.2;
    out.add(gun);
  }
  out.userData.kind = "weaponRack";
  return out;
}

/** Pipes / conduit run along a wall. */
export function conduit(len: number, h: number): THREE.Group {
  const out = new THREE.Group();
  for (const [x, r] of [
    [0.0, 0.05],
    [0.09, 0.03],
  ] as const) {
    const pipe = cyl(r, r, len, mat("hullDark"), 12);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, h, 0);
    out.add(pipe);
  }
  out.userData.kind = "conduit";
  return out;
}

/** Wall vent / fan. */
export function vent(): THREE.Group {
  const frame = roundedBox(0.6, 0.6, 0.08, 0.02, mat("hullDark"));
  const grill = box(0.4, 0.4, 0.02, mat("hullLight"));
  const out = group(frame, grill);
  out.userData.kind = "vent";
  return out;
}
