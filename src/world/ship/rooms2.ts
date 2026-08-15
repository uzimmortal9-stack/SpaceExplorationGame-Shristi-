/**
 * Rooms, part two — service, crew-comfort, medical, science and defence decks.
 * (Split from rooms.ts purely to keep each file readable.)
 */

import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  Vector3,
} from 'three';

import { clamp, easeInOutCubic, lerp } from '../../core/math';
import { PALETTE } from '../materials';
import type { RoomCtx } from './rooms';
import { ROOM_BY_ID } from './layout';

function screenTexture(
  lines: Array<{ text: string; size: number; color: string; y: number; mono?: boolean; align?: CanvasTextAlign }>,
  opts: { w?: number; h?: number; bg?: string; grid?: boolean; border?: string } = {},
): CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = opts.bg ?? '#060b12';
  g.fillRect(0, 0, w, h);
  if (opts.grid) {
    g.strokeStyle = 'rgba(0,240,255,0.07)';
    for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }
  if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); }
  for (const l of lines) {
    g.fillStyle = l.color;
    g.font = `${l.mono ? '' : '700 '}${l.size}px ${l.mono ? 'ui-monospace, monospace' : 'Rajdhani, sans-serif'}`;
    g.textAlign = l.align ?? 'center';
    g.textBaseline = 'middle';
    g.fillText(l.text, l.align === 'left' ? 24 : l.align === 'right' ? w - 24 : w / 2, l.y);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearFilter;
  return t;
}

function wallScreen(
  ctx: RoomCtx, x: number, y: number, z: number, ry: number,
  lines: Parameters<typeof screenTexture>[0], w = 1.3, h = 0.66, intensity = 0.8,
): Mesh {
  const tex = screenTexture(lines, { grid: true, border: '#1f3347' });
  const m = new Mesh(
    new PlaneGeometry(w, h),
    new MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: new Color(0xffffff),
      emissiveIntensity: intensity, roughness: 0.24, metalness: 0.02,
    }),
  );
  m.position.set(x, y, z);
  m.rotation.y = ry;
  ctx.runtime.group.add(m);
  return m;
}

// ---------------------------------------------------------------- washrooms

export function furnishWashroom(ctx: RoomCtx, id: 'washroom_a' | 'washroom_b'): void {
  const { mats, props, interact, audio, runtime } = ctx;
  const room = ROOM_BY_ID.get(id)!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;

  props.place('toilet', room.x0 + 1.1, room.z0 + 1.3, { ry: Math.PI / 2, height: 0.82, solid: true });
  props.place('sink', room.x1 - 1.0, room.z0 + 1.4, { ry: -Math.PI / 2, height: 0.92, solid: true });
  props.place('shower', room.x0 + 1.3, room.z1 - 1.5, { height: 2.1, solid: true, colliderScale: 0.7 });
  props.place('bathtub', cx + 1.0, room.z1 - 1.5, { ry: Math.PI / 2, height: 0.62, solid: true });
  props.place('towel', room.x1 - 0.3, room.z0 + 3.0, { ry: -Math.PI / 2, height: 0.7 });
  props.place('trashcan', room.x0 + 0.7, room.z0 + 3.2, { height: 0.42 });
  props.place('drawer', room.x1 - 1.0, room.z1 - 3.4, { ry: -Math.PI / 2, height: 0.85, solid: true });

  // mirror above the sink — a real reflective panel
  const mirror = new Mesh(
    new PlaneGeometry(0.9, 0.75),
    new MeshStandardMaterial({ color: 0xdfeaf2, roughness: 0.04, metalness: 1.0, envMapIntensity: 1.6 }),
  );
  mirror.position.set(room.x1 - 0.09, 1.62, room.z0 + 1.4);
  mirror.rotation.y = -Math.PI / 2;
  g.add(mirror);
  const mirrorFrame = new Mesh(new BoxGeometry(0.05, 0.86, 1.02), mats.trim);
  mirrorFrame.position.set(room.x1 - 0.05, 1.62, room.z0 + 1.4);
  g.add(mirrorFrame);

  // fogging overlay for the steam effect
  const fog = new Mesh(
    new PlaneGeometry(0.9, 0.75),
    new MeshBasicMaterial({ color: 0xdfeef6, transparent: true, opacity: 0 }),
  );
  fog.position.set(room.x1 - 0.11, 1.62, room.z0 + 1.4);
  fog.rotation.y = -Math.PI / 2;
  g.add(fog);

  let steam = 0;
  interact.register({
    id: `${id}_sink`,
    position: new Vector3(room.x1 - 0.8, 1.0, room.z0 + 1.4),
    radius: 1.6,
    kind: 'use',
    label: 'Run the basin',
    onUse: () => {
      audio.noiseBurst({ duration: 1.6, gain: 0.14, filter: 2600, filterEnd: 1400, q: 0.7, attack: 0.2 });
      steam = 1;
      return 'Run the basin';
    },
  });
  interact.register({
    id: `${id}_shower`,
    position: new Vector3(room.x0 + 1.3, 1.2, room.z1 - 2.3),
    radius: 1.8,
    kind: 'use',
    label: 'Activate shower',
    onUse: () => {
      audio.noiseBurst({ duration: 2.6, gain: 0.18, filter: 3200, filterEnd: 1600, q: 0.5, attack: 0.4 });
      steam = 1;
      return 'Activate shower';
    },
  });
  interact.register({
    id: `${id}_toilet`,
    position: new Vector3(room.x0 + 1.1, 0.8, room.z0 + 1.3),
    radius: 1.5,
    kind: 'use',
    label: 'Vacuum flush',
    onUse: () => {
      audio.noiseBurst({ duration: 0.9, gain: 0.26, filter: 1800, filterEnd: 320, q: 1.6 });
      return 'Vacuum flush';
    },
  });

  const fogMat = fog.material as MeshBasicMaterial;
  runtime.tickers.push((dt) => {
    steam = clamp(steam - dt * 0.1, 0, 1);
    fogMat.opacity = steam * 0.62;
  });
}

// ------------------------------------------------------------------- lounge

export function furnishLounge(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('lounge')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  props.place('couch', cx - 1.4, cz + 1.6, { ry: Math.PI, height: 0.85, solid: true, colliderScale: 0.85 });
  props.place('couch_small', cx + 2.4, cz + 0.4, { ry: -Math.PI / 2, height: 0.85, solid: true, colliderScale: 0.85 });
  props.place('chair_soft', cx - 3.0, cz - 0.6, { ry: 0.6, height: 0.95, solid: true, colliderScale: 0.7 });
  const table = props.place('table_round', cx - 1.2, cz - 0.2, { height: 0.48, solid: true, colliderScale: 0.8 });
  props.place('mug', cx - 1.0, cz - 0.1, { height: 0.11, y: 0.48 });
  props.place('plate', cx - 1.5, cz - 0.35, { height: 0.03, y: 0.48 });
  props.place('plant_b', room.x1 - 1.0, room.z0 + 1.0, { height: 1.0 });
  props.place('plant_c', room.x0 + 1.0, room.z1 - 1.0, { height: 0.95 });
  props.place('bookshelf', room.x1 - 0.9, cz + 2.2, { ry: -Math.PI / 2, height: 1.8, solid: true });
  props.place('carpet', cx - 1.2, cz + 0.4, { width: 4.2, noShadow: true });
  void table;

  // large viewport onto space
  const view = new Mesh(new PlaneGeometry(6.4, 1.7), mats.glass);
  view.position.set(room.x1 - 0.08, 1.75, cz);
  view.rotation.y = -Math.PI / 2;
  g.add(view);
  for (let i = -2; i <= 2; i++) {
    const bar = new Mesh(new BoxGeometry(0.16, 1.9, 0.1), mats.trim);
    bar.position.set(room.x1 - 0.04, 1.75, cz + i * 1.3);
    bar.rotation.y = -Math.PI / 2;
    g.add(bar);
  }

  // media panel
  wallScreen(ctx, room.x0 + 0.08, 1.85, cz, Math.PI / 2, [
    { text: 'AURORA MEDIA', size: 30, color: '#eaf6ff', y: 46 },
    { text: 'ARCHIVE · 214 TITLES', size: 19, color: '#00f0ff', y: 88, mono: true },
    { text: 'NOW PLAYING', size: 17, color: '#8095ab', y: 140, mono: true },
    { text: 'Orbital Sunrise — Loop', size: 21, color: '#ffb000', y: 176, mono: true },
  ], 1.9, 0.96, 0.7);

  // mission clock
  const clockTex = screenTexture(
    [
      { text: 'MISSION TIME', size: 18, color: '#8095ab', y: 30, mono: true },
      { text: '412:07:44', size: 56, color: '#ffb000', y: 90, mono: true },
    ],
    { w: 384, h: 140, bg: '#05090f' },
  );
  const clock = new Mesh(
    new PlaneGeometry(0.86, 0.32),
    new MeshStandardMaterial({
      map: clockTex, emissiveMap: clockTex, emissive: new Color(0xffffff),
      emissiveIntensity: 0.9, roughness: 0.22,
    }),
  );
  clock.position.set(room.x0 + 0.08, 2.4, cz + 2.6);
  clock.rotation.y = Math.PI / 2;
  g.add(clock);

  // ---- beverage dispenser --------------------------------------------------
  const dx = room.x0 + 1.4;
  const dz = room.z0 + 1.2;
  props.place('vessel_tall', dx, dz, { height: 1.35, solid: true });
  const cup = ctx.assets.instance('mug');
  const cupInfo = ctx.assets.info('mug');
  cup.scale.setScalar(cupInfo ? 0.1 / Math.max(cupInfo.size.y, 0.01) : 0.1);
  cup.position.set(dx + 0.34, 0.86, dz + 0.1);
  cup.visible = false;
  g.add(cup);

  let brewing = 0;
  interact.register({
    id: 'coffee',
    position: new Vector3(dx, 1.1, dz + 0.5),
    radius: 1.9,
    kind: 'button',
    label: 'Brew a coffee',
    onUse: () => {
      if (brewing > 0) return 'Brewing…';
      brewing = 2.6;
      audio.uiClick();
      audio.pour();
      state.toast('Galley: brewing', 'info');
      return 'Brew a coffee';
    },
  });
  runtime.tickers.push((dt) => {
    if (brewing > 0) {
      brewing -= dt;
      cup.visible = true;
      if (brewing <= 0) {
        audio.tone({ freq: 900, duration: 0.09, gain: 0.06 });
        brewing = 0;
      }
    }
  });

  // zero-g ornament: a tethered floating sphere
  const orb = new Mesh(
    new SphereGeometry(0.075, 16, 12),
    new MeshStandardMaterial({ color: 0xc8d8e8, roughness: 0.3, metalness: 0.8 }),
  );
  orb.position.set(cx + 0.6, 1.75, cz - 2.0);
  g.add(orb);
  runtime.tickers.push((_dt, t) => {
    orb.position.y = 1.75 + Math.sin(t * 0.9) * 0.09;
    orb.position.x = cx + 0.6 + Math.cos(t * 0.6) * 0.06;
    orb.rotation.y = t * 0.4;
  });
}

// ------------------------------------------------------------------- galley

export function furnishGalley(ctx: RoomCtx): void {
  const { props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('galley')!;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // kitchen run along the outboard wall
  props.line('kitchen_counter', [room.x1 - 1.0, room.z0 + 1.4], [room.x1 - 1.0, room.z0 + 4.4], 3, {
    ry: -Math.PI / 2, height: 0.92, solid: true,
  });
  props.place('kitchen_sink', room.x1 - 1.0, room.z0 + 5.6, { ry: -Math.PI / 2, height: 0.92, solid: true });
  props.place('oven', room.x1 - 1.0, room.z1 - 1.3, { ry: -Math.PI / 2, height: 0.95, solid: true });
  props.place('fridge', room.x0 + 1.1, room.z0 + 1.5, { ry: Math.PI / 2, height: 1.9, solid: true });
  props.line('kitchen_cabinet', [room.x1 - 0.6, room.z0 + 1.6], [room.x1 - 0.6, room.z0 + 4.6], 3, {
    ry: -Math.PI / 2, height: 0.75, y: 1.45, solid: false,
  });

  // dining table with seating for the crew
  const table = props.place('table_long', cx - 1.2, cz, { height: 0.76, solid: true, colliderScale: 0.9 });
  const top = 0.76;
  for (let i = 0; i < 3; i++) {
    props.place('stool', cx - 2.6 + i * 1.4, cz - 1.35, { height: 0.72, solid: true, colliderScale: 0.6 });
    props.place('stool', cx - 2.6 + i * 1.4, cz + 1.35, { height: 0.72, solid: true, colliderScale: 0.6 });
  }
  void table;

  // trays, cups, sealed food containers on the table
  for (let i = 0; i < 3; i++) {
    props.place('plate', cx - 2.6 + i * 1.4, cz - 0.4, { height: 0.03, y: top });
    props.place('mug', cx - 2.4 + i * 1.4, cz + 0.35, { height: 0.1, y: top });
  }
  props.place('healthpack', cx - 0.4, cz + 0.1, { height: 0.12, y: top, ry: 0.4 });

  // food dispenser
  const fdX = room.x0 + 1.2;
  const fdZ = cz + 1.6;
  props.place('vessel', fdX, fdZ, { height: 1.2, solid: true });
  let dispensing = 0;
  interact.register({
    id: 'food_dispenser',
    position: new Vector3(fdX, 1.1, fdZ + 0.5),
    radius: 1.9,
    kind: 'button',
    label: 'Dispense ration',
    onUse: () => {
      if (dispensing > 0) return 'Heating…';
      dispensing = 2.2;
      audio.uiClick();
      audio.noiseBurst({ duration: 1.5, gain: 0.12, filter: 700, filterEnd: 1400, attack: 0.3 });
      state.toast('Rehydration cycle started', 'info');
      return 'Dispense ration';
    },
  });
  runtime.tickers.push((dt) => {
    if (dispensing > 0) {
      dispensing -= dt;
      if (dispensing <= 0) { audio.tone({ freq: 780, duration: 0.12, gain: 0.06 }); dispensing = 0; }
    }
  });

  interact.register({
    id: 'galley_cabinet',
    position: new Vector3(room.x1 - 0.9, 1.5, room.z0 + 3.0),
    radius: 1.8,
    kind: 'open',
    label: 'Open supply cabinet',
    onUse: () => {
      audio.switchClunk();
      state.subtitle('Sealed pouches, powdered stock, and someone’s hoarded chilli sauce.', 4);
      return 'Open supply cabinet';
    },
  });

  wallScreen(ctx, room.x0 + 0.08, 1.8, room.z1 - 1.8, Math.PI / 2, [
    { text: 'GALLEY', size: 28, color: '#eaf6ff', y: 42 },
    { text: 'STORES  412 DAYS', size: 20, color: '#3ee88b', y: 92, mono: true },
    { text: 'WATER RECLAIM  98%', size: 20, color: '#3ee88b', y: 130, mono: true },
    { text: 'STERILISER  READY', size: 20, color: '#00f0ff', y: 168, mono: true },
  ], 1.3, 0.66, 0.7);
}

// ------------------------------------------------------------------ medical

export function furnishMedical(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('medical')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // two medical beds
  const bedA = props.place('bed', cx - 2.2, cz - 1.4, { ry: Math.PI / 2, height: 0.62, solid: true });
  props.place('bed', cx - 2.2, cz + 1.6, { ry: Math.PI / 2, height: 0.62, solid: true });
  void bedA;

  // overhead scanner arms
  for (const bz of [cz - 1.4, cz + 1.6]) {
    const arm = new Group();
    const post = new Mesh(new CylinderGeometry(0.05, 0.05, 1.5, 12), mats.chrome);
    post.position.set(cx - 2.2, 2.2, bz - 1.3);
    arm.add(post);
    const boom = new Mesh(new BoxGeometry(0.12, 0.12, 1.5), mats.chrome);
    boom.position.set(cx - 2.2, 2.9, bz - 0.6);
    arm.add(boom);
    const head = new Mesh(new CylinderGeometry(0.24, 0.3, 0.14, 20), mats.brushed);
    head.position.set(cx - 2.2, 2.72, bz);
    arm.add(head);
    const lamp = new SpotLight(0xf4fbff, 22, 6, Math.PI / 5, 0.5, 1.5);
    lamp.position.set(cx - 2.2, 2.6, bz);
    const tgt = new Group();
    tgt.position.set(cx - 2.2, 0.6, bz);
    g.add(tgt);
    lamp.target = tgt;
    arm.add(lamp);
    g.add(arm);
  }

  // cryo pod, cabinets, tools
  props.place('pod', room.x1 - 1.5, room.z0 + 2.0, { ry: -Math.PI / 2, height: 2.3, solid: true, colliderScale: 0.75 });
  props.place('capsule', room.x1 - 1.5, room.z0 + 4.4, { height: 1.5, solid: true });
  props.line('shelves_thin', [room.x0 + 0.9, room.z1 - 1.4], [room.x0 + 0.9, room.z1 - 3.4], 2, {
    ry: Math.PI / 2, height: 1.9, solid: true, colliderScale: 0.7,
  });
  props.place('desk_medium', cx + 1.4, room.z1 - 1.3, { ry: Math.PI, height: 0.8, solid: true });
  props.scatter(['syringe', 'health_tube', 'healthpack'], cx + 0.5, room.z1 - 1.6, cx + 2.3, room.z1 - 1.0, 6, {
    height: 0.15, y: 0.8,
  });
  props.scatter(['health_tube', 'healthpack', 'syringe'],
    room.x0 + 0.7, room.z1 - 3.5, room.x0 + 1.1, room.z1 - 1.3, 8, { height: 0.14, y: 1.1 });

  // vitals monitors
  const vitals = wallScreen(ctx, room.x0 + 0.08, 1.9, cz - 1.4, Math.PI / 2, [
    { text: 'PATIENT 01', size: 24, color: '#00f0ff', y: 34, mono: true, align: 'left' },
    { text: 'BPM   68', size: 30, color: '#3ee88b', y: 90, mono: true, align: 'left' },
    { text: 'SPO2  98%', size: 30, color: '#3ee88b', y: 138, mono: true, align: 'left' },
    { text: 'TEMP  36.6C', size: 30, color: '#3ee88b', y: 186, mono: true, align: 'left' },
  ], 1.2, 0.62, 0.85);
  void vitals;

  wallScreen(ctx, room.x0 + 0.08, 1.9, cz + 1.6, Math.PI / 2, [
    { text: 'CREW HEALTH', size: 26, color: '#00f0ff', y: 34, mono: true, align: 'left' },
    { text: 'OKONKWO   FIT', size: 26, color: '#3ee88b', y: 92, mono: true, align: 'left' },
    { text: 'MEIER     FIT', size: 26, color: '#3ee88b', y: 140, mono: true, align: 'left' },
    { text: 'STASIS BAY  READY', size: 20, color: '#8095ab', y: 196, mono: true, align: 'left' },
  ], 1.2, 0.62, 0.85);

  // scanner interaction
  const scannerRing = new Mesh(new TorusGeometry(0.55, 0.05, 12, 40), mats.accent(PALETTE.accent, 0.7));
  scannerRing.position.set(cx - 2.2, 1.3, cz - 1.4);
  scannerRing.rotation.y = Math.PI / 2;
  g.add(scannerRing);

  let scanning = 0;
  interact.register({
    id: 'med_scanner',
    position: new Vector3(cx - 2.2, 1.1, cz - 1.4),
    radius: 2.2,
    kind: 'use',
    label: 'Run medical scan',
    onUse: () => {
      scanning = 3.2;
      audio.tone({ freq: 520, freqEnd: 1400, duration: 1.4, gain: 0.07, type: 'sine' });
      state.toast('Diagnostic scan running…', 'info');
      return 'Run medical scan';
    },
  });
  const ringMat = scannerRing.material as MeshStandardMaterial;
  runtime.tickers.push((dt, t) => {
    if (scanning > 0) {
      scanning -= dt;
      scannerRing.position.z = cz - 1.4 + Math.sin(t * 2.4) * 0.9;
      ringMat.emissiveIntensity = 1.6;
      if (scanning <= 0) {
        state.subtitle('Scan complete. No anomalies. Elevated cortisol — recommend rest.', 5);
        audio.uiConfirm();
        scanning = 0;
      }
    } else {
      ringMat.emissiveIntensity = 0.5;
    }
  });
}

// -------------------------------------------------------------- science lab

export function furnishScience(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('science')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  props.line('desk_large', [room.x0 + 1.6, room.z0 + 1.6], [room.x0 + 1.6, room.z1 - 1.6], 3, {
    ry: Math.PI / 2, height: 0.85, solid: true,
  });
  props.line('shelves_tall', [room.x1 - 0.9, room.z0 + 1.8], [room.x1 - 0.9, room.z1 - 1.8], 3, {
    ry: -Math.PI / 2, height: 2.0, solid: true, colliderScale: 0.7,
  });

  // samples, vials, canisters
  props.scatter(['health_tube', 'syringe', 'vessel', 'capsule'],
    room.x0 + 1.1, room.z0 + 1.8, room.x0 + 2.1, room.z1 - 1.8, 12, { height: 0.2, y: 0.85 });
  props.scatter(['crate', 'container_full', 'ammo_box'],
    room.x1 - 1.3, room.z0 + 2.0, room.x1 - 0.7, room.z1 - 2.0, 6, { height: 0.22, y: 1.1 });

  // plant containment
  const tank = new Mesh(new CylinderGeometry(0.55, 0.55, 1.5, 24, 1, true), mats.glassTint);
  tank.position.set(cx + 2.2, 1.05, room.z0 + 1.8);
  g.add(tank);
  props.place('plant_c', cx + 2.2, room.z0 + 1.8, { height: 1.0, y: 0.3 });
  const tankBase = new Mesh(new CylinderGeometry(0.62, 0.66, 0.3, 24), mats.brushed);
  tankBase.position.set(cx + 2.2, 0.15, room.z0 + 1.8);
  g.add(tankBase);
  ctx.collision.addBox(cx + 2.2, 0.9, room.z0 + 1.8, 1.3, 1.8, 1.3);
  const tankLight = new PointLight(0x62ffb0, 3.0, 4, 2);
  tankLight.position.set(cx + 2.2, 1.2, room.z0 + 1.8);
  g.add(tankLight);

  // ---- holographic analysis table -----------------------------------------
  const tableX = cx + 1.2;
  const tableZ = cz + 1.0;
  props.place('console', tableX, tableZ, { height: 1.0, solid: true });
  const holo = new Group();
  holo.position.set(tableX, 1.35, tableZ);
  g.add(holo);
  const specimen = new Mesh(
    new SphereGeometry(0.22, 20, 16),
    new MeshBasicMaterial({ color: 0x5ef0c8, wireframe: true, transparent: true, opacity: 0.65 }),
  );
  holo.add(specimen);
  const halo = new Mesh(
    new TorusGeometry(0.34, 0.006, 8, 48),
    new MeshBasicMaterial({ color: 0x5ef0c8, transparent: true, opacity: 0.5, side: DoubleSide }),
  );
  halo.rotation.x = Math.PI / 2;
  holo.add(halo);

  const resultScreen = wallScreen(ctx, room.x0 + 0.08, 1.85, cz, Math.PI / 2, [
    { text: 'SPECTROGRAPH', size: 24, color: '#00f0ff', y: 32, mono: true, align: 'left' },
    { text: 'AWAITING SAMPLE', size: 30, color: '#8095ab', y: 110 },
    { text: 'PLACE SPECIMEN ON PLINTH', size: 17, color: '#8095ab', y: 190, mono: true },
  ], 1.6, 0.8, 0.8);

  let analysing = 0;
  interact.register({
    id: 'lab_analyse',
    position: new Vector3(tableX, 1.2, tableZ),
    radius: 2.1,
    kind: 'use',
    label: 'Analyse sample',
    onUse: () => {
      if (analysing > 0) return 'Analysing…';
      analysing = 3.6;
      audio.tone({ freq: 400, freqEnd: 1600, duration: 1.8, gain: 0.06, type: 'triangle' });
      state.toast('Spectrograph running…', 'info');
      return 'Analyse sample';
    },
  });

  const resMat = resultScreen.material as MeshStandardMaterial;
  runtime.tickers.push((dt, t) => {
    specimen.rotation.y = t * 0.7;
    specimen.rotation.x = Math.sin(t * 0.4) * 0.3;
    halo.rotation.z = t * 0.9;
    if (analysing > 0) {
      analysing -= dt;
      resMat.emissiveIntensity = 1.1 + Math.sin(t * 18) * 0.25;
      if (analysing <= 0) {
        const tex = screenTexture([
          { text: 'SPECTROGRAPH', size: 24, color: '#00f0ff', y: 32, mono: true, align: 'left' },
          { text: 'ILEX PRIME — CANOPY', size: 24, color: '#eaf6ff', y: 84 },
          { text: 'C/H/O + UNKNOWN Xi-4', size: 21, color: '#ffb000', y: 126, mono: true },
          { text: 'BIOLUMINESCENT · ACTIVE', size: 20, color: '#3ee88b', y: 166, mono: true },
          { text: 'ORIGIN: NON-TERRESTRIAL', size: 18, color: '#ff6600', y: 206, mono: true },
        ], { grid: true, border: '#1f3347' });
        resMat.map = tex;
        resMat.emissiveMap = tex;
        resMat.needsUpdate = true;
        audio.uiConfirm();
        state.subtitle('Xi-4 has no terrestrial analogue. It is still metabolising after 40 days in vacuum.', 6);
        analysing = 0;
      }
    } else {
      resMat.emissiveIntensity = 0.8;
    }
  });

  // artifact case
  const caseBox = new Mesh(new BoxGeometry(0.6, 0.5, 0.6), mats.glassTint);
  caseBox.position.set(room.x1 - 1.4, 1.2, cz - 2.4);
  g.add(caseBox);
  props.place('pebble_2', room.x1 - 1.4, cz - 2.4, { height: 0.22, y: 0.95 });
  props.place('desk_small', room.x1 - 1.4, cz - 2.4, { height: 0.95, solid: true });
}

// -------------------------------------------------------------- comms room

export function furnishComms(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('comms')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // central table with six seats
  const table = props.place('table_long', cx, cz, { height: 0.76, solid: true, colliderScale: 0.9 });
  void table;
  const seatPositions: Array<[number, number, number]> = [
    [cx - 1.6, cz - 1.5, 0], [cx, cz - 1.5, 0], [cx + 1.6, cz - 1.5, 0],
    [cx - 1.6, cz + 1.5, Math.PI], [cx, cz + 1.5, Math.PI], [cx + 1.6, cz + 1.5, Math.PI],
  ];
  for (const [x, z, ry] of seatPositions) {
    props.place('chair_soft', x, z, { ry, height: 0.95, solid: true, colliderScale: 0.6 });
  }

  // holographic table display
  const holo = new Group();
  holo.position.set(cx, 0.82, cz);
  g.add(holo);
  const disc = new Mesh(
    new SphereGeometry(0.34, 24, 18),
    new MeshBasicMaterial({ color: 0x3fd0ff, wireframe: true, transparent: true, opacity: 0.4 }),
  );
  disc.position.y = 0.4;
  holo.add(disc);
  const holoLight = new PointLight(0x3fd0ff, 2.2, 4, 2);
  holoLight.position.set(cx, 1.3, cz);
  g.add(holoLight);

  // big wall screen (briefing / star chart)
  const briefing = wallScreen(ctx, room.x1 - 0.09, 1.95, cz, -Math.PI / 2, [
    { text: 'MISSION BRIEFING', size: 30, color: '#eaf6ff', y: 42 },
    { text: 'TARGET: ILEX PRIME (III)', size: 22, color: '#ffb000', y: 92, mono: true },
    { text: 'REPEATING SIGNAL · 11.4 H', size: 20, color: '#00f0ff', y: 132, mono: true },
    { text: 'BEARING 214.6 MARK 9', size: 20, color: '#8095ab', y: 170, mono: true },
    { text: 'AUTHORISATION: OKONKWO', size: 17, color: '#8095ab', y: 212, mono: true },
  ], 3.0, 1.5, 0.75);
  void briefing;

  props.place('console', room.x0 + 1.3, room.z0 + 1.4, { ry: Math.PI / 2, height: 1.15, solid: true });
  props.place('console_small', room.x0 + 1.3, room.z1 - 1.4, { ry: Math.PI / 2, height: 1.4, solid: true });
  props.place('satellite_dish', room.x0 + 1.4, cz, { height: 1.6, solid: true, colliderScale: 0.6 });

  interact.register({
    id: 'comms_brief',
    position: new Vector3(cx, 1.1, cz),
    radius: 2.6,
    kind: 'use',
    label: 'Play mission briefing',
    onUse: () => {
      audio.uiConfirm();
      state.subtitle(
        '“Aurora Drift, this is Gateway Control. The Ilex relay has been repeating for eleven months. You are the closest hull. Investigate and report.”',
        9,
      );
      state.completeObjective('briefing');
      return 'Play mission briefing';
    },
  });
  interact.register({
    id: 'comms_console',
    position: new Vector3(room.x0 + 1.3, 1.2, room.z0 + 1.4),
    radius: 1.9,
    kind: 'use',
    label: 'Long-range comms',
    onUse: () => {
      audio.noiseBurst({ duration: 1.2, gain: 0.1, filter: 1400, filterEnd: 600, q: 2.5 });
      state.subtitle('Static. Then, faintly, the signal again — eleven tones, always in the same order.', 6);
      return 'Long-range comms';
    },
  });

  runtime.tickers.push((_dt, t) => {
    disc.rotation.y = t * 0.35;
    holoLight.intensity = 2.0 + Math.sin(t * 3) * 0.35;
  });
  void mats;
  void lerp;
  void easeInOutCubic;
  void clamp;
}

// ------------------------------------------------------------------ defence

export function furnishDefense(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('defense')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // weapon lockers with visible arms
  props.line('locker', [room.x0 + 0.9, room.z0 + 1.4], [room.x0 + 0.9, room.z1 - 1.4], 4, {
    ry: Math.PI / 2, height: 1.95, solid: true,
  });
  props.place('rifle', room.x0 + 1.6, room.z0 + 2.2, { height: 0.14, y: 1.35, ry: Math.PI / 2 });
  props.place('sniper', room.x0 + 1.6, room.z0 + 3.6, { height: 0.14, y: 1.35, ry: Math.PI / 2 });
  props.place('pistol', room.x0 + 1.6, room.z0 + 4.8, { height: 0.1, y: 1.35, ry: Math.PI / 2 });
  props.place('ammo_box', cx - 0.5, room.z1 - 1.3, { height: 0.32, solid: true });
  props.place('crate', cx + 0.9, room.z1 - 1.3, { height: 0.6, solid: true });

  // security console bank
  props.line('console', [room.x1 - 1.3, room.z0 + 1.6], [room.x1 - 1.3, room.z1 - 1.6], 3, {
    ry: -Math.PI / 2, height: 1.2, solid: true,
  });

  // camera feeds
  const feeds = ['BOW CAM', 'CARGO CAM', 'ENGINE CAM', 'AFT CAM'];
  const feedMats: MeshStandardMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const s = wallScreen(
      ctx, room.x1 - 0.09, 1.62 + Math.floor(i / 2) * 0.72, cz - 1.1 + (i % 2) * 2.2, -Math.PI / 2,
      [
        { text: feeds[i], size: 20, color: '#00f0ff', y: 26, mono: true, align: 'left' },
        { text: 'SIGNAL OK', size: 26, color: '#3ee88b', y: 84 },
        { text: '—— NO CONTACT ——', size: 17, color: '#8095ab', y: 140, mono: true },
      ],
      1.0, 0.56, 0.65,
    );
    feedMats.push(s.material as MeshStandardMaterial);
  }

  // threat board
  wallScreen(ctx, cx, 2.15, room.z0 + 0.09, 0, [
    { text: 'THREAT BOARD', size: 26, color: '#ff6600', y: 36 },
    { text: 'CONTACTS  0', size: 34, color: '#3ee88b', y: 96, mono: true },
    { text: 'HULL INTEGRITY 100%', size: 20, color: '#3ee88b', y: 150, mono: true },
    { text: 'TURRETS  STOWED', size: 20, color: '#ffb000', y: 190, mono: true },
  ], 2.0, 1.0, 0.8);

  let alert = false;
  interact.register({
    id: 'security_alert',
    position: new Vector3(room.x1 - 1.3, 1.3, cz),
    radius: 2.2,
    kind: 'toggle',
    label: 'Toggle red alert',
    onUse: () => {
      alert = !alert;
      audio.switchClunk();
      if (alert) audio.alarm();
      state.toast(alert ? 'RED ALERT — all hands' : 'Alert cleared', alert ? 'warn' : 'good');
      window.dispatchEvent(new CustomEvent('aurora:alert', { detail: alert }));
      return alert ? 'Clear red alert' : 'Toggle red alert';
    },
  });

  interact.register({
    id: 'turret_control',
    position: new Vector3(room.x1 - 1.3, 1.3, cz + 2.2),
    radius: 2.0,
    kind: 'use',
    label: 'Turret camera',
    onUse: () => {
      audio.beep(700);
      state.subtitle('Aft turret slews to bearing 180. Nothing but stars and the slow wheel of the belt.', 5);
      return 'Turret camera';
    },
  });

  interact.register({
    id: 'door_override',
    position: new Vector3(room.x1 - 1.3, 1.3, cz - 2.2),
    radius: 2.0,
    kind: 'button',
    label: 'Door lock override',
    onUse: () => {
      audio.uiClick();
      state.toast('All doors unlocked', 'good');
      return 'Door lock override';
    },
  });

  runtime.tickers.push((_dt, t) => {
    for (let i = 0; i < feedMats.length; i++) {
      feedMats[i].emissiveIntensity = 0.6 + Math.sin(t * 3 + i * 1.7) * 0.08;
    }
  });
  void mats;
  void g;
}
