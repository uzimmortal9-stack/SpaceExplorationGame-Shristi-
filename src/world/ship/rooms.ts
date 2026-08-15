/**
 * Rooms — furnishes and wires up every compartment named in the design brief.
 *
 * Each `furnishX` function places real downloaded models and registers the
 * interactions for that room. Anything that needs per-frame motion (fans,
 * hologram, reactor pulse, freezer glass) returns an updater collected into
 * `RoomRuntime.tickers`.
 */

import {
  AdditiveBlending,
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
  Object3D,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
} from 'three';

import type { AssetLoader } from '../../assets/assetLoader';
import type { AudioEngine } from '../../core/audio';
import { clamp, easeInOutCubic, lerp, rng } from '../../core/math';
import type { GameState } from '../../core/state';
import type { CollisionWorld } from '../../systems/collision';
import type { InteractionSystem } from '../../systems/interaction';
import type { MaterialLibrary } from '../materials';
import { PALETTE } from '../materials';
import { PropPlacer } from './props';
import { PILOT_SEAT, COPILOT_SEAT, ROOM_BY_ID } from './layout';

export type Ticker = (dt: number, elapsed: number) => void;

export interface RoomRuntime {
  group: Group;
  tickers: Ticker[];
  /** Nodes the flight/warp systems need to animate or read. */
  refs: {
    hologram?: Group;
    holoPlanets?: Array<{ node: Object3D; radius: number; speed: number; angle: number }>;
    throttleLid?: Object3D;
    throttleButton?: Object3D;
    warpCover?: Object3D;
    warpLever?: Object3D;
    warpCore?: Object3D;
    warpCoreLight?: PointLight;
    reactorCore?: Object3D;
    freezerGlass?: [Object3D, Object3D];
    pilotSeat?: Object3D;
    mfdNav?: Mesh;
    mfdStatus?: Mesh;
    bridgeScreens?: Mesh[];
  };
}

/** A reusable label/screen texture drawn once (signage, MFD faces, labels). */
function makeLabelTexture(
  lines: Array<{ text: string; size: number; color: string; y: number; mono?: boolean; align?: CanvasTextAlign }>,
  opts: { w?: number; h?: number; bg?: string; border?: string; grid?: boolean } = {},
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
    g.lineWidth = 1;
    for (let x = 0; x < w; x += 24) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    for (let y = 0; y < h; y += 24) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
  }
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
  }
  for (const l of lines) {
    g.fillStyle = l.color;
    g.font = `${l.mono ? '' : '700 '}${l.size}px ${l.mono ? 'ui-monospace, monospace' : 'Rajdhani, sans-serif'}`;
    g.textAlign = l.align ?? 'center';
    g.textBaseline = 'middle';
    const x = l.align === 'left' ? 26 : l.align === 'right' ? w - 26 : w / 2;
    g.fillText(l.text, x, l.y);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export interface RoomCtx {
  assets: AssetLoader;
  mats: MaterialLibrary;
  props: PropPlacer;
  collision: CollisionWorld;
  interact: InteractionSystem;
  audio: AudioEngine;
  state: GameState;
  runtime: RoomRuntime;
}

const r = rng(0x51a1c3);

// ---------------------------------------------------------------- signage

export function addSignage(ctx: RoomCtx): void {
  for (const room of ROOM_BY_ID.values()) {
    const tex = makeLabelTexture(
      [
        { text: room.name, size: 46, color: '#eaf6ff', y: 92 },
        { text: room.subtitle, size: 22, color: '#00f0ff', y: 148, mono: true },
      ],
      { w: 512, h: 220, bg: '#080d14', border: '#1f3347' },
    );
    const mat = new MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new Color(0xffffff),
      emissiveIntensity: 0.55,
      roughness: 0.45,
      metalness: 0.1,
    });
    const sign = new Mesh(new PlaneGeometry(1.5, 0.64), mat);
    // hang beside the doorway on the room's spine-facing wall
    const cx = (room.x0 + room.x1) / 2;
    const towardSpine = cx < 0 ? 1 : -1;
    const wallX = cx < 0 ? room.x1 : room.x0;
    sign.position.set(wallX + towardSpine * 0.08, 2.28, (room.z0 + room.z1) / 2);
    sign.rotation.y = towardSpine > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (room.id === 'bridge' || room.id === 'warp' || room.id === 'cargo') {
      sign.position.set(cx, 2.28, room.id === 'bridge' ? room.z1 - 0.08 : room.z0 + 0.08);
      sign.rotation.y = room.id === 'bridge' ? 0 : Math.PI;
    }
    ctx.runtime.group.add(sign);
  }
}

// ------------------------------------------------------------------ bridge

export function furnishBridge(ctx: RoomCtx): void {
  const { assets, mats, props, interact, audio, state, runtime } = ctx;
  const g = runtime.group;

  // ---- pilot + co-pilot seats (real authored chairs) ----------------------
  const seatL = props.place('seat', PILOT_SEAT.x, PILOT_SEAT.z, { ry: Math.PI, height: 1.5, solid: false });
  props.place('seat', COPILOT_SEAT.x, COPILOT_SEAT.z, { ry: Math.PI, height: 1.5, solid: false });
  runtime.refs.pilotSeat = seatL;

  // ---- dashboard: a real console bank curved in front of the seats --------
  const dashGroup = new Group();
  for (let i = -3; i <= 3; i++) {
    const angle = i * 0.16;
    const radius = 3.4;
    const x = Math.sin(angle) * radius;
    const z = -26.6 - Math.cos(angle) * radius * 0.18;
    props.place(i % 2 === 0 ? 'console' : 'console_small', x, z, {
      ry: Math.PI + angle,
      height: 1.15,
      solid: true,
      colliderScale: 0.8,
    });
  }
  g.add(dashGroup);

  // ---- the big forward viewport -------------------------------------------
  const viewport = new Mesh(new PlaneGeometry(15.6, 2.5), mats.glass);
  viewport.position.set(0, 1.75, -29.92);
  g.add(viewport);
  // structural mullions so it reads as a built window, not a hole
  for (let i = -3; i <= 3; i++) {
    const bar = new Mesh(new BoxGeometry(0.12, 2.6, 0.22), mats.trim);
    bar.position.set(i * 2.55, 1.75, -29.86);
    bar.castShadow = true;
    g.add(bar);
  }

  // ---- MFDs angled along the dashboard geometry ---------------------------
  const navTex = makeLabelTexture(
    [
      { text: 'NAV / TARGET', size: 26, color: '#00f0ff', y: 30, mono: true, align: 'left' },
      { text: 'NO TARGET', size: 44, color: '#ffb000', y: 96 },
      { text: 'SELECT DESTINATION — [M]', size: 20, color: '#8095ab', y: 156, mono: true },
      { text: 'WARP  ▸  STANDBY', size: 20, color: '#8095ab', y: 200, mono: true, align: 'left' },
    ],
    { w: 512, h: 256, grid: true, border: '#1f3347' },
  );
  const navMat = new MeshStandardMaterial({
    map: navTex, emissiveMap: navTex, emissive: new Color(0xffffff),
    emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.0,
  });
  const nav = new Mesh(new PlaneGeometry(1.15, 0.58), navMat);
  nav.position.set(-1.5, 1.28, -26.1);
  nav.rotation.set(-0.62, 0, 0);
  g.add(nav);
  runtime.refs.mfdNav = nav;

  const statusTex = makeLabelTexture(
    [
      { text: 'SYSTEMS', size: 26, color: '#00f0ff', y: 30, mono: true, align: 'left' },
      { text: 'HULL      100%', size: 24, color: '#3ee88b', y: 84, mono: true, align: 'left' },
      { text: 'FUEL       82%', size: 24, color: '#3ee88b', y: 122, mono: true, align: 'left' },
      { text: 'POWER      94%', size: 24, color: '#3ee88b', y: 160, mono: true, align: 'left' },
      { text: 'GEAR       UP', size: 24, color: '#ffb000', y: 198, mono: true, align: 'left' },
    ],
    { w: 512, h: 256, grid: true, border: '#1f3347' },
  );
  const statusMat = new MeshStandardMaterial({
    map: statusTex, emissiveMap: statusTex, emissive: new Color(0xffffff),
    emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.0,
  });
  const status = new Mesh(new PlaneGeometry(1.15, 0.58), statusMat);
  status.position.set(1.5, 1.28, -26.1);
  status.rotation.set(-0.62, 0, 0);
  g.add(status);
  runtime.refs.mfdStatus = status;

  // ---- holographic solar system between the seats -------------------------
  const holo = new Group();
  holo.position.set(0, 1.05, -24.3);
  g.add(holo);
  runtime.refs.hologram = holo;

  // physical emitter pedestal (real kit prop)
  props.place('teleporter', 0, -24.3, { height: 0.75, solid: true, colliderScale: 0.7 });

  const holoLight = new PointLight(0x38d8ff, 3.2, 5.5, 2);
  holoLight.position.set(0, 1.5, -24.3);
  g.add(holoLight);

  // sun
  const sun = new Mesh(
    new SphereGeometry(0.11, 20, 16),
    new MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.95 }),
  );
  sun.position.y = 0.62;
  holo.add(sun);
  const sunGlow = new Mesh(
    new SphereGeometry(0.2, 16, 12),
    mats.glow(0xffc06a, 0.32),
  );
  sunGlow.position.y = 0.62;
  holo.add(sunGlow);

  const planetDefs = [
    { name: 'Kepler', color: 0xa8794f, radius: 0.32, size: 0.032, speed: 0.55 },
    { name: 'Vashti', color: 0x5f8fd0, radius: 0.46, size: 0.044, speed: 0.38 },
    { name: 'Ilex Prime', color: 0x46c17a, radius: 0.62, size: 0.052, speed: 0.27 },
    { name: 'Hesper', color: 0xd0a05a, radius: 0.8, size: 0.07, speed: 0.19 },
  ];
  const holoPlanets: RoomRuntime['refs']['holoPlanets'] = [];
  for (const p of planetDefs) {
    const orbit = new Mesh(
      new RingGeometry(p.radius - 0.0035, p.radius + 0.0035, 96),
      new MeshBasicMaterial({
        color: 0x2fd0ff, transparent: true, opacity: 0.28,
        side: DoubleSide, blending: AdditiveBlending, depthWrite: false,
      }),
    );
    orbit.rotation.x = -Math.PI / 2;
    orbit.position.y = 0.62;
    holo.add(orbit);

    const node = new Mesh(
      new SphereGeometry(p.size, 16, 12),
      new MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.9 }),
    );
    node.position.set(p.radius, 0.62, 0);
    holo.add(node);
    holoPlanets.push({ node, radius: p.radius, speed: p.speed, angle: r() * Math.PI * 2 });
  }
  runtime.refs.holoPlanets = holoPlanets;

  // volumetric-ish projection cone from the pedestal
  const cone = new Mesh(
    new CylinderGeometry(0.86, 0.1, 0.62, 28, 1, true),
    new MeshBasicMaterial({
      color: 0x33c8ff, transparent: true, opacity: 0.055,
      side: DoubleSide, blending: AdditiveBlending, depthWrite: false,
    }),
  );
  cone.position.y = 0.31;
  holo.add(cone);

  interact.register({
    id: 'holo_nav',
    position: new Vector3(0, 1.1, -24.3),
    radius: 2.4,
    kind: 'use',
    label: 'Navigation hologram',
    detail: 'Open target selector',
    onUse: () => {
      audio.uiConfirm();
      state.events.emit('toast', { text: 'Navigation array online' });
      window.dispatchEvent(new CustomEvent('aurora:opennav'));
    },
  });

  // ---- throttle under a safety lid ----------------------------------------
  const throttleBase = new Mesh(new BoxGeometry(0.34, 0.09, 0.28), mats.trim);
  throttleBase.position.set(-0.72, 1.06, -25.5);
  throttleBase.castShadow = true;
  g.add(throttleBase);

  const lid = new Group();
  lid.position.set(-0.72, 1.11, -25.64);
  const lidPlate = new Mesh(new BoxGeometry(0.32, 0.03, 0.26), mats.warnStripe);
  lidPlate.position.z = 0.13;
  lidPlate.castShadow = true;
  lid.add(lidPlate);
  g.add(lid);
  runtime.refs.throttleLid = lid;

  const button = new Mesh(
    new CylinderGeometry(0.062, 0.062, 0.035, 20),
    mats.accent(PALETTE.accentWarm, 0.9),
  );
  button.position.set(-0.72, 1.115, -25.5);
  button.castShadow = true;
  g.add(button);
  runtime.refs.throttleButton = button;

  let lidOpen = false;
  let lidT = 0;
  interact.register({
    id: 'throttle_lid',
    position: new Vector3(-0.72, 1.12, -25.5),
    radius: 1.9,
    kind: 'open',
    label: 'Open throttle safety lid',
    onUse: () => {
      lidOpen = !lidOpen;
      audio.switchClunk();
      return lidOpen ? 'Close throttle safety lid' : 'Open throttle safety lid';
    },
  });

  interact.register({
    id: 'throttle_button',
    position: new Vector3(-0.72, 1.14, -25.5),
    radius: 1.7,
    kind: 'button',
    label: 'Engage main drive',
    detail: 'Safety lid must be open',
    enabled: false,
    onUse: () => {
      audio.uiConfirm();
      audio.leverPull();
      state.throttleUnlocked = true;
      state.toast('Main drive armed — take the pilot seat', 'good');
      state.completeObjective('throttle');
      interact.setEnabled('throttle_button', false);
      return 'Main drive armed';
    },
  });

  runtime.tickers.push((dt) => {
    lidT = clamp(lidT + (lidOpen ? dt * 2.4 : -dt * 2.4), 0, 1);
    lid.rotation.x = -easeInOutCubic(lidT) * 1.35;
    interact.setEnabled('throttle_button', lidT > 0.8 && !state.throttleUnlocked);
    const bm = button.material as MeshStandardMaterial;
    bm.emissiveIntensity = state.throttleUnlocked
      ? 1.5
      : lidT > 0.8
        ? 0.7 + Math.sin(performance.now() * 0.006) * 0.5
        : 0.12;
  });

  // ---- dashboard warp controls (mirror of the engine-room lever) ----------
  const warpPanel = new Mesh(new BoxGeometry(0.4, 0.06, 0.3), mats.trim);
  warpPanel.position.set(0.72, 1.06, -25.5);
  g.add(warpPanel);
  const warpBtn = new Mesh(
    new CylinderGeometry(0.055, 0.055, 0.032, 18),
    mats.accent(PALETTE.danger, 0.4),
  );
  warpBtn.position.set(0.72, 1.11, -25.5);
  g.add(warpBtn);

  interact.register({
    id: 'dash_warp',
    position: new Vector3(0.72, 1.12, -25.5),
    radius: 1.8,
    kind: 'button',
    label: 'Arm warp drive',
    detail: 'Requires a locked target',
    onUse: () => {
      if (!state.target) {
        audio.uiDenied();
        state.toast('No destination locked — use the nav hologram', 'warn');
        return 'Arm warp drive';
      }
      state.warpArmed = true;
      audio.uiConfirm();
      state.toast('Warp drive armed — pull the lever in the drive room', 'good');
      state.completeObjective('arm_warp');
      state.addObjective({ id: 'pull_lever', text: 'Pull the warp lever in the Warp Drive room', done: false });
      return 'Warp drive armed';
    },
  });
  runtime.tickers.push(() => {
    const m = warpBtn.material as MeshStandardMaterial;
    m.emissiveIntensity = state.warpArmed ? 1.4 + Math.sin(performance.now() * 0.008) * 0.4 : 0.25;
  });

  // ---- overhead switch banks & indicator strip ----------------------------
  const bank = new Group();
  for (let i = 0; i < 14; i++) {
    const sw = new Mesh(
      new BoxGeometry(0.05, 0.05, 0.09),
      i % 3 === 0 ? mats.accent(PALETTE.accent, 0.8) : mats.chrome,
    );
    sw.position.set(-1.6 + i * 0.24, 2.42, -26.6);
    bank.add(sw);
  }
  g.add(bank);

  // small screens across the dash
  const screens: Mesh[] = [];
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const t = makeLabelTexture(
      [
        { text: ['ATT', 'PWR', 'ENV', 'COM'][Math.abs(i) % 4], size: 22, color: '#00f0ff', y: 26, mono: true },
        { text: 'NOMINAL', size: 30, color: '#3ee88b', y: 70 },
      ],
      { w: 256, h: 112, bg: '#050a10', grid: true },
    );
    const m = new MeshStandardMaterial({
      map: t, emissiveMap: t, emissive: new Color(0xffffff),
      emissiveIntensity: 0.85, roughness: 0.25,
    });
    const s = new Mesh(new PlaneGeometry(0.52, 0.23), m);
    s.position.set(i * 0.95, 1.52, -26.42);
    s.rotation.x = -0.5;
    g.add(s);
    screens.push(s);
  }
  runtime.refs.bridgeScreens = screens;

  // side windows
  for (const sx of [-1, 1]) {
    const side = new Mesh(new PlaneGeometry(6.2, 1.5), mats.glass);
    side.position.set(sx * 8.92, 1.85, -23);
    side.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(side);
  }

  // ---- aft crew stations --------------------------------------------------
  // The bridge is the largest compartment; fill the aft half with working
  // stations so it reads as a crewed command deck rather than two chairs.
  for (const sx of [-1, 1]) {
    const bx = sx * 5.6;
    props.place('desk_large', bx, -21.0, { ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2, height: 0.85, solid: true });
    props.place('office_chair', bx - sx * 1.5, -21.0, { ry: sx > 0 ? Math.PI / 2 : -Math.PI / 2, height: 1.05, solid: true, colliderScale: 0.6 });
    props.place('console_small', bx + sx * 0.25, -21.0, { ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2, height: 0.4, y: 0.85 });
    props.place('mug', bx - sx * 0.4, -20.2, { height: 0.1, y: 0.85 });

    props.place('console', sx * 7.4, -24.4, { ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2, height: 1.15, solid: true });
    props.place('shelves_thin', sx * 7.8, -18.4, { ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2, height: 1.9, solid: true, colliderScale: 0.7 });
    props.place('plant_b', sx * 7.6, -17.0, { height: 0.9 });
    props.place('crate', sx * 6.6, -17.2, { height: 0.55, solid: true, ry: sx * 0.3 });

    // status boards flanking the command deck
    wallScreenBridge(ctx, sx * 8.9, 1.95, -21.5, sx > 0 ? -Math.PI / 2 : Math.PI / 2, sx > 0);
  }

  // engineering repeater at the rear bulkhead
  props.place('console', 0, -16.9, { ry: 0, height: 1.15, solid: true });
  props.place('railing', -4.5, -17.2, { width: 4.0 });
  props.place('railing', 4.5, -17.2, { width: 4.0 });
  props.place('light_floor', -8.4, -27.5, { height: 0.5 });
  props.place('light_floor', 8.4, -27.5, { height: 0.5 });

  // ambient clutter that sells "lived in"
  props.place('mug', -2.6, -25.4, { height: 0.11, y: 1.02 });
  props.place('keycard', 2.35, -25.6, { height: 0.02, y: 1.02, ry: 0.4 });
  props.place('healthpack', 6.2, -20.4, { height: 0.14, y: 0.85, ry: 0.5 });
  void assets;
}

/** Status board on a bridge side bulkhead. */
function wallScreenBridge(ctx: RoomCtx, x: number, y: number, z: number, ry: number, right: boolean): void {
  const tex = makeLabelTexture(
    right
      ? [
          { text: 'PROPULSION', size: 26, color: '#00f0ff', y: 32, mono: true, align: 'left' },
          { text: 'MAIN DRIVE   IDLE', size: 22, color: '#ffb000', y: 86, mono: true, align: 'left' },
          { text: 'RCS          NOM', size: 22, color: '#3ee88b', y: 124, mono: true, align: 'left' },
          { text: 'REACTOR      72%', size: 22, color: '#3ee88b', y: 162, mono: true, align: 'left' },
          { text: 'WARP CORE  COLD', size: 22, color: '#8095ab', y: 200, mono: true, align: 'left' },
        ]
      : [
          { text: 'NAVIGATION', size: 26, color: '#00f0ff', y: 32, mono: true, align: 'left' },
          { text: 'SYSTEM  AURELIS', size: 22, color: '#dbe7f3', y: 86, mono: true, align: 'left' },
          { text: 'BODIES        6', size: 22, color: '#dbe7f3', y: 124, mono: true, align: 'left' },
          { text: 'BEARING 214.6', size: 22, color: '#ffb000', y: 162, mono: true, align: 'left' },
          { text: 'DRIFT     0.02', size: 22, color: '#3ee88b', y: 200, mono: true, align: 'left' },
        ],
    { w: 512, h: 256, grid: true, border: '#1f3347' },
  );
  const m = new Mesh(
    new PlaneGeometry(1.5, 0.75),
    new MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: new Color(0xffffff),
      emissiveIntensity: 0.8, roughness: 0.24,
    }),
  );
  m.position.set(x, y, z);
  m.rotation.y = ry;
  ctx.runtime.group.add(m);
}

// ------------------------------------------------------------- crew cabins

export function furnishCabin(ctx: RoomCtx, id: 'cabin_a' | 'cabin_b'): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get(id)!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // bed against the outboard wall, window beside it
  const bedZ = cz - 1.2;
  props.place('bed', room.x0 + 2.0, bedZ, { ry: Math.PI / 2, height: 0.62, solid: true, colliderScale: 0.95 });
  props.place('nightstand', room.x0 + 0.9, bedZ + 1.9, { height: 0.55, solid: true });
  props.place('desk_lamp', room.x0 + 0.9, bedZ + 1.9, { height: 0.42, y: 0.55 });

  const lampLight = new PointLight(0xffc98a, 0, 4.2, 2);
  lampLight.position.set(room.x0 + 0.9, 1.25, bedZ + 1.9);
  g.add(lampLight);
  let lampOn = true;
  lampLight.intensity = 4.5;
  interact.register({
    id: `${id}_lamp`,
    position: new Vector3(room.x0 + 0.9, 1.1, bedZ + 1.9),
    radius: 1.7,
    kind: 'toggle',
    label: 'Desk lamp',
    onUse: () => {
      lampOn = !lampOn;
      lampLight.intensity = lampOn ? 4.5 : 0;
      audio.switchClunk();
      return lampOn ? 'Switch off desk lamp' : 'Switch on desk lamp';
    },
  });

  // ---- PDLC smart window --------------------------------------------------
  const win = new Mesh(new PlaneGeometry(2.1, 1.15), mats.smartGlass.clone());
  win.position.set(room.x0 + 0.06, 1.6, bedZ);
  win.rotation.y = Math.PI / 2;
  g.add(win);
  const frame = new Mesh(new BoxGeometry(0.1, 1.32, 2.28), mats.trim);
  frame.position.set(room.x0 + 0.02, 1.6, bedZ);
  g.add(frame);

  let opaque = 0;
  let wantOpaque = false;
  interact.register({
    id: `${id}_window`,
    position: new Vector3(room.x0 + 0.5, 1.4, bedZ + 1.0),
    radius: 2.0,
    kind: 'toggle',
    label: 'Darken viewport (PDLC)',
    onUse: () => {
      wantOpaque = !wantOpaque;
      audio.tone({ freq: 420, freqEnd: 300, duration: 0.22, gain: 0.07, type: 'sine' });
      return wantOpaque ? 'Clear viewport (PDLC)' : 'Darken viewport (PDLC)';
    },
  });
  const winMat = win.material as MeshStandardMaterial & { transmission: number };
  runtime.tickers.push((dt) => {
    opaque = clamp(opaque + (wantOpaque ? dt * 1.4 : -dt * 1.4), 0, 1);
    winMat.transmission = lerp(0.95, 0.0, opaque);
    winMat.color.setRGB(lerp(0.87, 0.02, opaque), lerp(0.92, 0.02, opaque), lerp(0.95, 0.03, opaque));
    winMat.roughness = lerp(0.05, 0.85, opaque);
  });

  // ---- workstation --------------------------------------------------------
  const deskZ = cz + 2.2;
  const desk = props.place('desk_plain', room.x0 + 2.2, deskZ, { ry: Math.PI / 2, height: 0.76, solid: true });
  const deskTop = PropPlacer.topOf(desk);
  props.place('office_chair', room.x0 + 3.6, deskZ, { ry: -Math.PI / 2, height: 1.05, solid: true, colliderScale: 0.6 });

  // laptop: a real console model, scaled to a laptop footprint, on the desk
  props.place('console_small', room.x0 + 2.1, deskZ, {
    ry: Math.PI / 2, height: 0.32, y: deskTop,
  });
  const laptopScreen = new Mesh(
    new PlaneGeometry(0.34, 0.21),
    (() => {
      const t = makeLabelTexture(
        [
          { text: 'PERSONAL LOG', size: 22, color: '#00f0ff', y: 26, mono: true, align: 'left' },
          { text: 'Day 412 — still no', size: 19, color: '#dbe7f3', y: 62, mono: true, align: 'left' },
          { text: 'answer from Ilex relay.', size: 19, color: '#dbe7f3', y: 88, mono: true, align: 'left' },
          { text: 'Signal repeats every', size: 19, color: '#dbe7f3', y: 122, mono: true, align: 'left' },
          { text: '11.4 hours. Someone', size: 19, color: '#dbe7f3', y: 148, mono: true, align: 'left' },
          { text: 'is down there.', size: 19, color: '#ffb000', y: 174, mono: true, align: 'left' },
        ],
        { w: 384, h: 224, bg: '#050b12', grid: true },
      );
      return new MeshStandardMaterial({
        map: t, emissiveMap: t, emissive: new Color(0xffffff),
        emissiveIntensity: 0.9, roughness: 0.25,
      });
    })(),
  );
  laptopScreen.position.set(room.x0 + 2.02, deskTop + 0.26, deskZ);
  laptopScreen.rotation.y = Math.PI / 2;
  laptopScreen.rotation.x = -0.16;
  g.add(laptopScreen);

  interact.register({
    id: `${id}_laptop`,
    position: new Vector3(room.x0 + 2.1, deskTop + 0.25, deskZ),
    radius: 1.7,
    kind: 'read',
    label: 'Read personal log',
    onUse: () => {
      audio.beep(1100);
      state.subtitle(
        id === 'cabin_a'
          ? '“Day 412 — the Ilex relay still repeats every 11.4 hours. Command says it is debris. I have listened to it four hundred times. It is not debris.”'
          : '“Sample 118 from the Ilex canopy is still metabolising in vacuum. Whatever grows down there does not obey our biology.”',
        8,
      );
      return 'Read personal log';
    },
  });

  // mouse, notebook, stylus — real props scaled small
  props.place('keycard', room.x0 + 2.6, deskZ - 0.42, { height: 0.02, y: deskTop, ry: 0.3 });
  props.place('healthpack', room.x0 + 2.7, deskZ + 0.5, { height: 0.1, y: deskTop, ry: -0.4 });
  props.place('mug', room.x0 + 2.45, deskZ + 0.72, { height: 0.1, y: deskTop });

  // wall screen in front of the workstation
  const wallTex = makeLabelTexture(
    [
      { text: 'AURORA DRIFT', size: 34, color: '#eaf6ff', y: 44 },
      { text: 'SURVEY VESSEL · DECK 1', size: 18, color: '#00f0ff', y: 84, mono: true },
      { text: 'MISSION DAY 412', size: 22, color: '#ffb000', y: 132, mono: true },
      { text: 'CREW 2 · O2 NOMINAL', size: 18, color: '#8095ab', y: 170, mono: true },
    ],
    { w: 512, h: 256, grid: true, border: '#1f3347' },
  );
  const wallScreen = new Mesh(
    new PlaneGeometry(1.15, 0.58),
    new MeshStandardMaterial({
      map: wallTex, emissiveMap: wallTex, emissive: new Color(0xffffff),
      emissiveIntensity: 0.75, roughness: 0.24,
    }),
  );
  wallScreen.position.set(room.x0 + 0.07, 1.72, deskZ);
  wallScreen.rotation.y = Math.PI / 2;
  g.add(wallScreen);

  // ---- storage, clothing, personal items ----------------------------------
  props.place('closet', room.x1 - 1.1, cz + 0.4, { ry: -Math.PI / 2, height: 2.05, solid: true });
  props.place('locker', room.x1 - 1.1, cz - 2.0, { ry: -Math.PI / 2, height: 1.9, solid: true });
  props.place('bookshelf', cx + 1.6, room.z0 + 0.7, { height: 1.85, solid: true });
  props.place('plant_a', room.x1 - 1.2, room.z1 - 1.1, { height: 0.7, solid: false });
  props.place('crate', cx - 0.4, room.z1 - 1.2, { height: 0.5, ry: 0.3, solid: true });
  props.place('trashcan', room.x0 + 4.4, deskZ + 1.4, { height: 0.45 });
  props.place('carpet', cx, cz, { width: 3.0, noShadow: true });

  // family photo
  const photoTex = makeLabelTexture(
    [
      { text: id === 'cabin_a' ? 'OKONKWO' : 'MEIER', size: 26, color: '#ffd9ac', y: 100, mono: true },
      { text: 'EARTH · 2189', size: 16, color: '#8095ab', y: 130, mono: true },
    ],
    { w: 192, h: 160, bg: '#2b2119', border: '#7a6248' },
  );
  const photo = new Mesh(
    new PlaneGeometry(0.24, 0.2),
    new MeshStandardMaterial({ map: photoTex, roughness: 0.7 }),
  );
  photo.position.set(room.x0 + 0.08, 1.35, bedZ + 1.6);
  photo.rotation.y = Math.PI / 2;
  g.add(photo);

  // bed interaction
  interact.register({
    id: `${id}_bed`,
    position: new Vector3(room.x0 + 2.0, 0.7, bedZ),
    radius: 2.0,
    kind: 'use',
    label: 'Rest',
    onUse: () => {
      audio.tone({ freq: 300, freqEnd: 200, duration: 0.5, gain: 0.06, type: 'sine' });
      state.subtitle('You lie back for a while. The hull ticks as it cools.', 4);
      window.dispatchEvent(new CustomEvent('aurora:rest'));
      return 'Rest';
    },
  });
}

// ------------------------------------------------------------------ storage

export function furnishStorage(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('storage')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;

  // shelving down both long walls
  props.line('shelves_tall', [room.x0 + 0.9, room.z0 + 1.6], [room.x0 + 0.9, room.z1 - 1.6], 4, {
    ry: Math.PI / 2, height: 2.1, solid: true, colliderScale: 0.8,
  });
  props.line('shelves_short', [room.x1 - 0.9, room.z0 + 2.0], [room.x1 - 0.9, room.z1 - 3.4], 3, {
    ry: -Math.PI / 2, height: 1.3, solid: true, colliderScale: 0.8,
  });

  // labelled crates and containers
  props.place('crate_large', cx + 1.4, room.z0 + 1.5, { height: 1.0, solid: true, ry: 0.1 });
  props.place('crate', cx + 1.2, room.z0 + 3.2, { height: 0.75, solid: true, ry: -0.2 });
  props.place('crate_tarp', cx - 1.0, room.z1 - 1.6, { height: 0.9, solid: true, ry: 0.4 });
  props.place('container_full', cx + 1.6, room.z1 - 3.0, { height: 0.55, solid: true });
  props.place('barrel', room.x1 - 2.2, room.z1 - 1.4, { height: 0.9, solid: true });
  props.place('barrel_open', room.x1 - 3.2, room.z1 - 1.4, { height: 0.9, solid: true });

  // tools & repair parts on the shelves
  props.scatter(['healthpack', 'health_tube', 'ammo_box', 'keycard', 'syringe'],
    room.x0 + 0.6, room.z0 + 1.8, room.x0 + 1.2, room.z1 - 1.8, 10, { height: 0.16, y: 1.05 });
  props.scatter(['mug', 'plate', 'healthpack'],
    room.x1 - 1.2, room.z0 + 2.2, room.x1 - 0.7, room.z1 - 3.6, 6, { height: 0.13, y: 0.72 });

  // ---- freezer with two-part sliding glass --------------------------------
  const fz = new Group();
  const fzX = cx - 1.6;
  const fzZ = room.z0 + 2.4;
  fz.position.set(fzX, 0, fzZ);
  g.add(fz);

  const cabinet = new Mesh(new BoxGeometry(2.0, 2.1, 0.9), mats.brushed);
  cabinet.position.set(0, 1.05, 0);
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  fz.add(cabinet);
  const cavity = new Mesh(new BoxGeometry(1.78, 1.82, 0.72), mats.hullDark);
  cavity.position.set(0, 1.05, 0.06);
  fz.add(cavity);
  ctx.collision.addBox(fzX, 1.05, fzZ, 2.0, 2.1, 0.9);

  // interior shelves + rations (real props)
  for (let s = 0; s < 3; s++) {
    const shelf = new Mesh(new BoxGeometry(1.7, 0.03, 0.62), mats.chrome);
    shelf.position.set(0, 0.42 + s * 0.6, 0.05);
    fz.add(shelf);
    for (let i = 0; i < 4; i++) {
      const item = ctx.assets.instance(['healthpack', 'ammo_box', 'health_tube', 'crate'][i % 4]);
      const info = ctx.assets.info(['healthpack', 'ammo_box', 'health_tube', 'crate'][i % 4]);
      const sc = info ? 0.22 / Math.max(info.size.y, 0.01) : 0.2;
      item.scale.setScalar(sc);
      item.position.set(-0.62 + i * 0.42, 0.44 + s * 0.6, fz.position.z * 0 + 0.05);
      item.rotation.y = r() * 0.6;
      fz.add(item);
    }
  }

  const glassL = new Mesh(new BoxGeometry(0.9, 0.92, 0.04), mats.glassTint);
  glassL.position.set(-0.45, 1.52, 0.46);
  fz.add(glassL);
  const glassR = new Mesh(new BoxGeometry(0.9, 0.92, 0.04), mats.glassTint);
  glassR.position.set(0.45, 0.58, 0.46);
  fz.add(glassR);
  runtime.refs.freezerGlass = [glassL, glassR];

  const chill = new PointLight(0x8fd8ff, 2.6, 3.4, 2);
  chill.position.set(fzX, 1.5, fzZ + 0.3);
  g.add(chill);

  let fzOpen = false;
  let fzT = 0;
  interact.register({
    id: 'freezer',
    position: new Vector3(fzX, 1.4, fzZ + 0.7),
    radius: 2.2,
    kind: 'open',
    label: 'Open freezer',
    onUse: () => {
      fzOpen = !fzOpen;
      audio.noiseBurst({ duration: 0.6, gain: 0.2, filter: 500, filterEnd: 1600, q: 0.9 });
      audio.tone({ freq: 180, duration: 0.3, gain: 0.05, type: 'sine' });
      return fzOpen ? 'Close freezer' : 'Open freezer';
    },
  });
  runtime.tickers.push((dt) => {
    fzT = clamp(fzT + (fzOpen ? dt * 1.5 : -dt * 1.5), 0, 1);
    const e = easeInOutCubic(fzT);
    glassL.position.y = lerp(1.52, 2.02, e);
    glassR.position.y = lerp(0.58, 0.1, e);
  });

  // ---- personal lockers that open ----------------------------------------
  for (let i = 0; i < 3; i++) {
    const lx = cx - 1.4 + i * 1.4;
    const lz = room.z1 - 1.0;
    const locker = props.place('locker', lx, lz, { ry: Math.PI, height: 1.9, solid: true });
    let open = false;
    let t = 0;
    interact.register({
      id: `locker_${i}`,
      position: new Vector3(lx, 1.1, lz - 0.6),
      radius: 1.8,
      kind: 'open',
      label: `Open locker ${i + 1}`,
      onUse: () => {
        open = !open;
        audio.switchClunk();
        return open ? `Close locker ${i + 1}` : `Open locker ${i + 1}`;
      },
    });
    runtime.tickers.push((dt) => {
      t = clamp(t + (open ? dt * 2.2 : -dt * 2.2), 0, 1);
      locker.rotation.y = Math.PI + easeInOutCubic(t) * 0.9;
    });
  }

  // cargo netting / straps: thin boxes over the crates keep the spacecraft feel
  for (let i = 0; i < 3; i++) {
    const strap = new Mesh(new BoxGeometry(2.6, 0.05, 0.05), mats.rubber);
    strap.position.set(cx + 1.4, 0.42 + i * 0.4, room.z0 + 1.5);
    strap.rotation.y = Math.PI / 2;
    g.add(strap);
  }

  interact.register({
    id: 'storage_manifest',
    position: new Vector3(room.x1 - 0.4, 1.5, room.z0 + 1.2),
    radius: 2.0,
    kind: 'read',
    label: 'Read supply manifest',
    onUse: () => {
      audio.beep();
      state.subtitle('Manifest: 412 days of rations remaining. Coolant at 61%. Two EVA suits serviceable.', 5);
      return 'Read supply manifest';
    },
  });
}
