/**
 * Rooms, part three — the engineering half of the ship: fuel processing, life
 * support, power distribution, the reactor, the warp drive (lever + cover), the
 * maintenance workshop and the cargo bay / airlock ramp.
 */

import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  Vector3,
} from 'three';

import { clamp, easeInOutCubic, easeOutCubic, lerp } from '../../core/math';
import { PALETTE } from '../materials';
import type { RoomCtx } from './rooms';
import { ROOM_BY_ID, RAMP_LENGTH, RAMP_WIDTH } from './layout';
import { screenPanel } from './screens';

// ----------------------------------------------------------- fuel processing

export function furnishFuel(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('fuel')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // ---- tanks behind a bulletproof observation panel -----------------------
  const bayZ = room.z0 + 2.2;
  const tanks: Array<{ fluid: Mesh; base: number }> = [];
  for (let i = 0; i < 3; i++) {
    const tx = cx - 2.4 + i * 2.4;
    const shell = new Mesh(new CylinderGeometry(0.62, 0.62, 2.2, 24, 1, true), mats.glassTint);
    shell.position.set(tx, 1.25, bayZ);
    g.add(shell);
    const cap = new Mesh(new CylinderGeometry(0.68, 0.68, 0.18, 24), mats.brushed);
    cap.position.set(tx, 2.38, bayZ);
    g.add(cap);
    const foot = new Mesh(new CylinderGeometry(0.7, 0.74, 0.3, 24), mats.brushed);
    foot.position.set(tx, 0.15, bayZ);
    g.add(foot);

    // animated liquid level
    const fluid = new Mesh(
      new CylinderGeometry(0.56, 0.56, 1.7, 24),
      new MeshStandardMaterial({
        color: 0x2ad4ff,
        emissive: new Color(0x1090c0),
        emissiveIntensity: 0.5,
        roughness: 0.15,
        metalness: 0.0,
        transparent: true,
        opacity: 0.82,
      }),
    );
    fluid.position.set(tx, 1.0, bayZ);
    g.add(fluid);
    tanks.push({ fluid, base: 1.0 });

    const tankLight = new PointLight(0x36c8ff, 2.4, 4.5, 2);
    tankLight.position.set(tx, 1.4, bayZ + 0.6);
    g.add(tankLight);
    ctx.collision.addBox(tx, 1.2, bayZ, 1.5, 2.5, 1.5);
  }

  // the observation glass itself
  const obs = new Mesh(new PlaneGeometry(8.0, 2.3), mats.glass);
  obs.position.set(cx, 1.35, bayZ + 1.4);
  g.add(obs);
  for (let i = -2; i <= 2; i++) {
    const mullion = new Mesh(new BoxGeometry(0.12, 2.5, 0.18), mats.trim);
    mullion.position.set(cx + i * 2.0, 1.35, bayZ + 1.4);
    g.add(mullion);
  }
  ctx.collision.addBox(cx, 1.35, bayZ + 1.45, 8.0, 2.6, 0.3);

  // ---- pipes and valves ----------------------------------------------------
  for (let i = 0; i < 4; i++) {
    const pz = cz + 1.0 + i * 0.9;
    const pipe = new Mesh(new CylinderGeometry(0.09, 0.09, 9.5, 12), mats.brushed);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(cx, 2.5 - i * 0.16, pz);
    g.add(pipe);
  }

  const valves: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const vx = cx - 2.0 + i * 2.0;
    const vz = cz + 1.9;
    const body = new Mesh(new CylinderGeometry(0.13, 0.13, 0.3, 14), mats.copper);
    body.position.set(vx, 1.35, vz);
    g.add(body);
    const wheel = new Mesh(new TorusGeometry(0.19, 0.032, 8, 22), mats.copper);
    wheel.position.set(vx, 1.55, vz);
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
    valves.push(wheel);

    let open = false;
    interact.register({
      id: `valve_${i}`,
      position: new Vector3(vx, 1.5, vz),
      radius: 1.7,
      kind: 'toggle',
      label: `Valve ${i + 1}`,
      onUse: () => {
        open = !open;
        audio.noiseBurst({ duration: 0.5, gain: 0.16, filter: 900, filterEnd: 2400, q: 1.6 });
        audio.switchClunk();
        wheel.userData.target = open ? Math.PI * 2.5 : 0;
        return open ? `Close valve ${i + 1}` : `Open valve ${i + 1}`;
      },
    });
  }

  // ---- extractor + processor ----------------------------------------------
  props.place('vessel_tall', room.x1 - 1.6, cz + 1.0, { height: 2.2, solid: true });
  props.place('barrel_large', room.x1 - 1.6, cz + 2.8, { height: 1.4, solid: true });
  props.place('console', room.x0 + 1.3, cz + 1.4, { ry: Math.PI / 2, height: 1.15, solid: true });

  const monitor = screenPanel(ctx, room.x0 + 0.08, 1.9, cz - 0.6, Math.PI / 2, [
    { text: 'FUEL PROCESSING', size: 24, color: '#ffb000', y: 32, mono: true, align: 'left' },
    { text: 'PRESSURE  212 kPa', size: 22, color: '#3ee88b', y: 82, mono: true, align: 'left' },
    { text: 'TEMP       -21 C', size: 22, color: '#3ee88b', y: 120, mono: true, align: 'left' },
    { text: 'FLOW      0.0 L/s', size: 22, color: '#8095ab', y: 158, mono: true, align: 'left' },
    { text: 'PURITY     99.2%', size: 22, color: '#3ee88b', y: 196, mono: true, align: 'left' },
  ], 1.5, 0.76, 0.85);

  let extracting = 0;
  interact.register({
    id: 'fuel_extractor',
    position: new Vector3(room.x1 - 1.6, 1.3, cz + 1.0),
    radius: 2.2,
    kind: 'use',
    label: 'Run hydrogen extractor',
    onUse: () => {
      if (extracting > 0) return 'Extracting…';
      if (state.systems.fuel > 0.985) {
        audio.uiDenied();
        state.toast('Tanks already full', 'warn');
        return 'Run hydrogen extractor';
      }
      extracting = 6;
      audio.uiConfirm();
      audio.noiseBurst({ duration: 2.4, gain: 0.16, filter: 400, filterEnd: 1400, attack: 0.5 });
      state.toast('Extracting hydrogen from local medium…', 'info');
      return 'Run hydrogen extractor';
    },
  });

  const monMat = monitor.material as MeshStandardMaterial;
  runtime.tickers.push((dt, t) => {
    for (const v of valves) {
      const target = (v.userData.target as number) ?? 0;
      v.rotation.z = lerp(v.rotation.z, target, 1 - Math.pow(0.001, dt));
    }
    if (extracting > 0) {
      extracting -= dt;
      state.systems.fuel = clamp(state.systems.fuel + dt * 0.03, 0, 1);
      monMat.emissiveIntensity = 1.0 + Math.sin(t * 14) * 0.2;
      if (extracting <= 0) {
        audio.uiConfirm();
        state.toast(`Fuel at ${Math.round(state.systems.fuel * 100)}%`, 'good');
        state.pushSystems();
        extracting = 0;
      }
    } else {
      monMat.emissiveIntensity = 0.85;
    }
    for (const tank of tanks) {
      const lvl = 0.35 + state.systems.fuel * 0.65;
      tank.fluid.scale.y = lerp(tank.fluid.scale.y, lvl, 1 - Math.pow(0.01, dt));
      tank.fluid.position.y = tank.base - (1 - tank.fluid.scale.y) * 0.85;
    }
  });

  // hazard striping on the deck
  for (let i = 0; i < 5; i++) {
    const stripe = new Mesh(new PlaneGeometry(0.35, 3.0), mats.warnStripe);
    stripe.rotation.x = -Math.PI / 2;
    stripe.rotation.z = Math.PI / 4;
    stripe.position.set(cx - 2.2 + i * 1.1, 0.012, cz + 3.2);
    g.add(stripe);
  }
}

// ------------------------------------------------------------- life support

export function furnishLifeSupport(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('lifesupport')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  props.line('vessel_tall', [room.x0 + 1.4, room.z0 + 1.5], [room.x0 + 1.4, room.z1 - 1.5], 3, {
    height: 2.1, solid: true,
  });
  props.place('barrel_large', room.x1 - 1.4, room.z0 + 1.6, { height: 1.5, solid: true });
  props.place('barrel_large', room.x1 - 1.4, room.z0 + 3.4, { height: 1.5, solid: true });
  props.place('console', cx + 1.0, room.z1 - 1.2, { ry: Math.PI, height: 1.15, solid: true });

  // ---- animated fans -------------------------------------------------------
  const fans: Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const fz = room.z0 + 2.0 + i * 2.0;
    const housing = new Mesh(new CylinderGeometry(0.62, 0.62, 0.28, 20, 1, true), mats.brushed);
    housing.rotation.z = Math.PI / 2;
    housing.position.set(room.x1 - 0.25, 2.0, fz);
    g.add(housing);
    const fan = ctx.assets.instance('fan');
    const info = ctx.assets.info('fan');
    fan.scale.setScalar(info ? 1.05 / Math.max(info.size.x, 0.01) : 1);
    fan.position.set(room.x1 - 0.3, 2.0, fz);
    fan.rotation.y = Math.PI / 2;
    g.add(fan);
    fans.push(fan);
  }

  // ---- diagnostics panels --------------------------------------------------
  const diag = screenPanel(ctx, room.x0 + 0.08, 1.9, cz, Math.PI / 2, [
    { text: 'LIFE SUPPORT', size: 26, color: '#00f0ff', y: 32, mono: true, align: 'left' },
    { text: 'O2        98%', size: 24, color: '#3ee88b', y: 82, mono: true, align: 'left' },
    { text: 'CO2 SCRUB  OK', size: 24, color: '#3ee88b', y: 120, mono: true, align: 'left' },
    { text: 'HUMIDITY  41%', size: 24, color: '#3ee88b', y: 158, mono: true, align: 'left' },
    { text: 'TEMP    21.4 C', size: 24, color: '#3ee88b', y: 196, mono: true, align: 'left' },
  ], 1.6, 0.8, 0.85);
  void diag;

  screenPanel(ctx, cx, 2.2, room.z1 - 0.09, Math.PI, [
    { text: 'WATER RECLAMATION', size: 24, color: '#00f0ff', y: 36 },
    { text: '98.4% RECOVERY', size: 34, color: '#3ee88b', y: 100 },
    { text: 'FILTER CYCLE  3 DAYS', size: 19, color: '#8095ab', y: 168, mono: true },
  ], 2.0, 1.0, 0.8);

  interact.register({
    id: 'ls_diag',
    position: new Vector3(cx + 1.0, 1.2, room.z1 - 1.2),
    radius: 2.1,
    kind: 'use',
    label: 'Run life-support diagnostic',
    onUse: () => {
      audio.tone({ freq: 500, freqEnd: 900, duration: 0.6, gain: 0.06, type: 'sine' });
      state.toast('Life support nominal on all loops', 'good');
      state.subtitle('Atmosphere, water and thermal loops all green. The ship is breathing fine.', 5);
      return 'Run life-support diagnostic';
    },
  });

  runtime.tickers.push((dt) => {
    for (const f of fans) f.rotation.z += dt * 7.5;
  });
}

// -------------------------------------------------------- power distribution

export function furnishPower(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('power')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // battery banks
  props.line('crate_large', [room.x0 + 1.4, room.z0 + 1.6], [room.x0 + 1.4, room.z1 - 1.6], 3, {
    ry: Math.PI / 2, height: 1.6, solid: true,
  });
  props.line('capsule', [room.x1 - 1.4, room.z0 + 1.8], [room.x1 - 1.4, room.z1 - 1.8], 4, {
    height: 1.5, solid: true, colliderScale: 0.7,
  });

  // breaker wall with physical switches
  const systems = ['ENGINES', 'LIFE SUP', 'WARP CORE', 'LIGHTS', 'SHIELDS', 'SCIENCE'];
  const levers: Array<{ node: Mesh; on: boolean }> = [];
  for (let i = 0; i < systems.length; i++) {
    const sx = cx - 2.0 + (i % 3) * 2.0;
    const sy = 1.9 - Math.floor(i / 3) * 0.65;
    const plate = new Mesh(new BoxGeometry(0.5, 0.42, 0.09), mats.trim);
    plate.position.set(sx, sy, room.z0 + 0.14);
    g.add(plate);

    const lever = new Mesh(new BoxGeometry(0.09, 0.2, 0.06), mats.accent(PALETTE.accent, 0.9));
    lever.position.set(sx, sy + 0.02, room.z0 + 0.22);
    g.add(lever);
    levers.push({ node: lever, on: true });

    const lbl = screenPanel(ctx, sx, sy - 0.26, room.z0 + 0.15, 0, [
      { text: systems[i], size: 30, color: '#8095ab', y: 32, mono: true },
    ], 0.46, 0.12, 0.5, 256, 64);
    void lbl;

    const idx = i;
    interact.register({
      id: `breaker_${i}`,
      position: new Vector3(sx, sy, room.z0 + 0.5),
      radius: 1.5,
      kind: 'toggle',
      label: `${systems[i]} breaker`,
      onUse: () => {
        const l = levers[idx];
        l.on = !l.on;
        audio.switchClunk();
        (l.node.material as MeshStandardMaterial).emissiveIntensity = l.on ? 0.9 : 0.06;
        l.node.rotation.x = l.on ? 0 : 0.6;
        state.toast(`${systems[idx]} ${l.on ? 'ONLINE' : 'ISOLATED'}`, l.on ? 'good' : 'warn');
        return `${systems[idx]} breaker`;
      },
    });
  }

  // power draw board
  const board = screenPanel(ctx, room.x1 - 0.09, 1.95, cz, -Math.PI / 2, [
    { text: 'POWER DISTRIBUTION', size: 24, color: '#ffb000', y: 32, mono: true, align: 'left' },
    { text: 'ENGINES     34%', size: 22, color: '#3ee88b', y: 78, mono: true, align: 'left' },
    { text: 'LIFE SUP    12%', size: 22, color: '#3ee88b', y: 112, mono: true, align: 'left' },
    { text: 'WARP CORE   28%', size: 22, color: '#ffb000', y: 146, mono: true, align: 'left' },
    { text: 'LIGHTS       6%', size: 22, color: '#3ee88b', y: 180, mono: true, align: 'left' },
    { text: 'RESERVE     20%', size: 22, color: '#00f0ff', y: 214, mono: true, align: 'left' },
  ], 1.7, 0.85, 0.85);
  void board;

  // glowing conduits along the ceiling
  for (let i = 0; i < 4; i++) {
    const conduit = new Mesh(
      new CylinderGeometry(0.045, 0.045, room.z1 - room.z0 - 1, 8),
      mats.accent(PALETTE.accentWarm, 0.55),
    );
    conduit.rotation.x = Math.PI / 2;
    conduit.position.set(cx - 1.5 + i * 1.0, 2.72, cz);
    g.add(conduit);
  }
  props.place('access_point', cx, room.z1 - 1.2, { height: 0.6, solid: true });
}

// ------------------------------------------------------------------ reactor

export function furnishReactor(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('reactor')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // ---- the core itself -----------------------------------------------------
  const core = new Group();
  core.position.set(cx, 0, cz);
  g.add(core);
  runtime.refs.reactorCore = core;

  const pedestal = new Mesh(new CylinderGeometry(1.1, 1.35, 0.5, 28), mats.hullDark);
  pedestal.position.y = 0.25;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  core.add(pedestal);
  const cap = new Mesh(new CylinderGeometry(1.1, 1.35, 0.5, 28), mats.hullDark);
  cap.position.y = 3.65;
  cap.rotation.x = Math.PI;
  core.add(cap);

  const column = new Mesh(
    new CylinderGeometry(0.62, 0.62, 3.0, 28, 1, true),
    mats.glassTint,
  );
  column.position.y = 1.95;
  core.add(column);

  const plasma = new Mesh(
    new CylinderGeometry(0.4, 0.4, 2.85, 24),
    new MeshBasicMaterial({
      color: 0xffb85e,
      transparent: true,
      opacity: 0.85,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  plasma.position.y = 1.95;
  core.add(plasma);

  const coreLight = new PointLight(0xffa445, 24, 16, 2);
  coreLight.position.set(cx, 2.0, cz);
  coreLight.castShadow = false;
  g.add(coreLight);

  // containment rings
  const rings: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new Mesh(new TorusGeometry(0.92, 0.055, 10, 40), mats.chrome);
    ring.position.y = 1.0 + i * 0.95;
    ring.rotation.x = Math.PI / 2;
    core.add(ring);
    rings.push(ring);
  }
  ctx.collision.addBox(cx, 1.9, cz, 2.8, 3.8, 2.8);

  // maintenance catwalk railings around the core
  for (const [dx, dz, ry] of [[0, 2.4, 0], [0, -2.4, 0], [2.4, 0, Math.PI / 2], [-2.4, 0, Math.PI / 2]] as const) {
    props.place('railing', cx + dx, cz + dz, { ry, width: 4.0 });
  }

  // control panels and hazard signage
  props.line('console', [room.x0 + 1.3, room.z0 + 1.6], [room.x0 + 1.3, room.z1 - 1.6], 3, {
    ry: Math.PI / 2, height: 1.15, solid: true,
  });
  props.place('barrel_large', room.x1 - 1.4, room.z0 + 1.5, { height: 1.4, solid: true });
  props.place('pipes', cx, cz, { scale: 1.0 });

  const reactorScreen = screenPanel(ctx, room.x0 + 0.08, 2.0, cz, Math.PI / 2, [
    { text: 'PRIMARY REACTOR', size: 24, color: '#ff6600', y: 32, mono: true, align: 'left' },
    { text: 'OUTPUT     72%', size: 26, color: '#3ee88b', y: 86, mono: true, align: 'left' },
    { text: 'CORE TEMP 2841 K', size: 26, color: '#ffb000', y: 128, mono: true, align: 'left' },
    { text: 'CONTAINMENT  OK', size: 26, color: '#3ee88b', y: 170, mono: true, align: 'left' },
    { text: '⚠ RADIATION HAZARD', size: 20, color: '#ff2244', y: 216, mono: true, align: 'left' },
  ], 1.7, 0.85, 0.9);

  interact.register({
    id: 'reactor_output',
    position: new Vector3(room.x0 + 1.3, 1.2, cz),
    radius: 2.2,
    kind: 'use',
    label: 'Raise reactor output',
    onUse: () => {
      state.systems.reactorOutput = clamp(state.systems.reactorOutput + 0.12, 0, 1);
      state.systems.power = clamp(state.systems.power + 0.05, 0, 1);
      audio.uiConfirm();
      audio.noiseBurst({ duration: 1.6, gain: 0.14, filter: 200, filterEnd: 500, attack: 0.4, type: 'lowpass' });
      state.toast(`Reactor output ${Math.round(state.systems.reactorOutput * 100)}%`, 'good');
      state.pushSystems();
      return 'Raise reactor output';
    },
  });

  const rsMat = reactorScreen.material as MeshStandardMaterial;
  const plasmaMat = plasma.material as MeshBasicMaterial;
  runtime.tickers.push((dt, t) => {
    const out = state.systems.reactorOutput;
    plasma.scale.set(1 + Math.sin(t * 5) * 0.035, 1, 1 + Math.cos(t * 4.3) * 0.035);
    plasmaMat.opacity = 0.6 + out * 0.3 + Math.sin(t * 9) * 0.06;
    coreLight.intensity = 16 + out * 18 + Math.sin(t * 7) * 3;
    for (let i = 0; i < rings.length; i++) {
      rings[i].rotation.z += dt * (0.4 + i * 0.22) * (0.5 + out);
    }
    rsMat.emissiveIntensity = 0.85 + Math.sin(t * 4) * 0.08;
  });

  // deck hazard chevrons
  for (let i = 0; i < 6; i++) {
    const stripe = new Mesh(new PlaneGeometry(0.3, 2.4), mats.warnStripe);
    stripe.rotation.x = -Math.PI / 2;
    stripe.rotation.z = Math.PI / 4;
    stripe.position.set(cx - 2.6 + i * 1.05, 0.012, cz - 3.0);
    g.add(stripe);
  }
}

// --------------------------------------------------------------- warp drive

export function furnishWarp(ctx: RoomCtx): void {
  const { mats, props, interact, audio, state, runtime } = ctx;
  const room = ROOM_BY_ID.get('warp')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // ---- the warp core -------------------------------------------------------
  const core = new Group();
  core.position.set(cx, 0, cz);
  g.add(core);
  runtime.refs.warpCore = core;

  const base = new Mesh(new CylinderGeometry(1.5, 1.9, 0.55, 32), mats.hullDark);
  base.position.y = 0.275;
  base.castShadow = true;
  base.receiveShadow = true;
  core.add(base);
  const top = new Mesh(new CylinderGeometry(1.5, 1.9, 0.55, 32), mats.hullDark);
  top.position.y = 4.05;
  top.rotation.x = Math.PI;
  core.add(top);

  const shell = new Mesh(new CylinderGeometry(0.95, 0.95, 3.3, 32, 1, true), mats.glassTint);
  shell.position.y = 2.16;
  core.add(shell);

  const energy = new Mesh(
    new CylinderGeometry(0.6, 0.6, 3.1, 28),
    new MeshBasicMaterial({
      color: 0x49e8ff,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  energy.position.y = 2.16;
  core.add(energy);

  const inner = new Mesh(
    new CylinderGeometry(0.24, 0.24, 3.2, 20),
    new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }),
  );
  inner.position.y = 2.16;
  core.add(inner);

  const coreLight = new PointLight(0x49e8ff, 18, 22, 2);
  coreLight.position.set(cx, 2.2, cz);
  g.add(coreLight);
  runtime.refs.warpCoreLight = coreLight;

  // rotating conduits around the core
  const conduits: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rod = new Mesh(new CylinderGeometry(0.075, 0.075, 3.2, 10), mats.brushed);
    rod.position.set(Math.cos(a) * 1.28, 2.16, Math.sin(a) * 1.28);
    core.add(rod);
    const glowRod = new Mesh(
      new CylinderGeometry(0.032, 0.032, 3.1, 8),
      new MeshBasicMaterial({ color: 0x8ef0ff, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }),
    );
    glowRod.position.copy(rod.position);
    core.add(glowRod);
    conduits.push(glowRod);
  }

  const spinRings: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const ring = new Mesh(new TorusGeometry(1.42, 0.05, 10, 48), mats.chrome);
    ring.position.y = 0.9 + i * 0.85;
    ring.rotation.x = Math.PI / 2;
    core.add(ring);
    spinRings.push(ring);
  }
  ctx.collision.addBox(cx, 2.1, cz, 4.0, 4.2, 4.0);

  // energy floor ring
  const floorRing = new Mesh(
    new RingGeometry(2.2, 2.65, 64),
    new MeshBasicMaterial({
      color: 0x49e8ff, transparent: true, opacity: 0.35,
      side: DoubleSide, blending: AdditiveBlending, depthWrite: false,
    }),
  );
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.position.set(cx, 0.015, cz);
  g.add(floorRing);

  // ---- warp pedestal: red cover + physical lever ---------------------------
  const pedX = cx + 3.6;
  const pedZ = cz + 1.4;
  props.place('console', pedX, pedZ, { ry: -Math.PI / 2, height: 1.1, solid: true });

  const coverPivot = new Group();
  coverPivot.position.set(pedX, 1.12, pedZ - 0.22);
  g.add(coverPivot);
  const cover = new Mesh(
    new BoxGeometry(0.42, 0.028, 0.42),
    new MeshStandardMaterial({
      color: 0xd21f33, roughness: 0.35, metalness: 0.25,
      emissive: new Color(0x600810), emissiveIntensity: 0.35,
    }),
  );
  cover.position.z = 0.21;
  cover.castShadow = true;
  coverPivot.add(cover);
  runtime.refs.warpCover = coverPivot;

  const leverPivot = new Group();
  leverPivot.position.set(pedX, 1.1, pedZ);
  g.add(leverPivot);
  const shaft = new Mesh(new CylinderGeometry(0.028, 0.034, 0.36, 12), mats.chrome);
  shaft.position.y = 0.18;
  leverPivot.add(shaft);
  const knob = new Mesh(new SphereGeometry(0.062, 16, 12), mats.accent(PALETTE.danger, 1.2));
  knob.position.y = 0.37;
  leverPivot.add(knob);
  runtime.refs.warpLever = leverPivot;

  let coverOpen = false;
  let coverT = 0;
  interact.register({
    id: 'warp_cover',
    position: new Vector3(pedX, 1.2, pedZ),
    radius: 1.9,
    kind: 'open',
    label: 'Lift warp safety cover',
    onUse: () => {
      coverOpen = !coverOpen;
      audio.switchClunk();
      audio.tone({ freq: 260, freqEnd: 180, duration: 0.16, gain: 0.1, type: 'square' });
      return coverOpen ? 'Close warp safety cover' : 'Lift warp safety cover';
    },
  });

  let leverT = 0;
  interact.register({
    id: 'warp_lever',
    position: new Vector3(pedX, 1.35, pedZ),
    radius: 1.8,
    kind: 'lever',
    label: 'Pull warp lever',
    detail: 'Cover must be open',
    enabled: false,
    onUse: () => {
      if (!state.warpArmed) {
        audio.uiDenied();
        state.toast('Warp not armed — lock a target and arm from the bridge', 'warn');
        return 'Pull warp lever';
      }
      audio.leverPull();
      state.warpLeverPulled = true;
      leverT = 1;
      window.dispatchEvent(new CustomEvent('aurora:warp'));
      interact.setEnabled('warp_lever', false);
      return 'Warp engaged';
    },
  });

  // ---- wall displays -------------------------------------------------------
  const chargeScreen = screenPanel(ctx, room.x0 + 0.09, 2.1, cz, Math.PI / 2, [
    { text: 'WARP DRIVE', size: 26, color: '#00f0ff', y: 34, mono: true, align: 'left' },
    { text: 'CHARGE     0%', size: 30, color: '#8095ab', y: 92, mono: true, align: 'left' },
    { text: 'CORE TEMP  318 K', size: 24, color: '#3ee88b', y: 140, mono: true, align: 'left' },
    { text: 'STABILITY  100%', size: 24, color: '#3ee88b', y: 180, mono: true, align: 'left' },
    { text: 'DEST:  —', size: 22, color: '#ffb000', y: 222, mono: true, align: 'left' },
  ], 2.0, 1.0, 0.9);

  screenPanel(ctx, room.x1 - 0.09, 2.1, cz, -Math.PI / 2, [
    { text: 'FIELD GEOMETRY', size: 26, color: '#00f0ff', y: 36 },
    { text: 'ALCUBIERRE — CLASS III', size: 20, color: '#8095ab', y: 84, mono: true },
    { text: 'BUBBLE  STABLE', size: 28, color: '#3ee88b', y: 140 },
    { text: 'DO NOT ENTER DURING CYCLE', size: 17, color: '#ff2244', y: 200, mono: true },
  ], 2.0, 1.0, 0.85);

  props.line('crate', [room.x0 + 1.4, room.z1 - 1.4], [room.x0 + 3.4, room.z1 - 1.4], 2, {
    height: 0.7, solid: true,
  });
  props.place('barrel', room.x1 - 1.5, room.z1 - 1.5, { height: 0.9, solid: true });
  props.place('column_pipes', room.x0 + 1.2, room.z0 + 1.2, { height: 4.4 });
  props.place('column_pipes', room.x1 - 1.2, room.z0 + 1.2, { height: 4.4 });

  const csMat = chargeScreen.material as MeshStandardMaterial;
  const energyMat = energy.material as MeshBasicMaterial;
  const innerMat = inner.material as MeshBasicMaterial;
  const ringMat = floorRing.material as MeshBasicMaterial;

  runtime.tickers.push((dt, t) => {
    coverT = clamp(coverT + (coverOpen ? dt * 2.6 : -dt * 2.6), 0, 1);
    coverPivot.rotation.x = -easeInOutCubic(coverT) * 1.5;
    interact.setEnabled('warp_lever', coverT > 0.85 && !state.warpLeverPulled);

    leverPivot.rotation.x = lerp(leverPivot.rotation.x, leverT * 0.95, 1 - Math.pow(0.002, dt));

    const charge = state.systems.warpCharge;
    const spin = 0.5 + charge * 9;
    for (let i = 0; i < spinRings.length; i++) {
      spinRings[i].rotation.z += dt * spin * (i % 2 === 0 ? 1 : -1) * (0.6 + i * 0.2);
    }
    core.rotation.y += dt * charge * 0.9;

    const pulse = 0.55 + charge * 0.4 + Math.sin(t * (4 + charge * 26)) * (0.05 + charge * 0.12);
    energyMat.opacity = pulse;
    innerMat.opacity = 0.5 + charge * 0.5;
    energy.scale.set(1 + charge * 0.12, 1, 1 + charge * 0.12);
    coreLight.intensity = 12 + charge * 60 + Math.sin(t * 12) * (2 + charge * 8);
    ringMat.opacity = 0.2 + charge * 0.55;
    floorRing.scale.setScalar(1 + Math.sin(t * 3) * 0.02 + charge * 0.08);
    for (const c of conduits) {
      (c.material as MeshBasicMaterial).opacity = 0.35 + charge * 0.55 + Math.sin(t * 8) * 0.08;
    }
    csMat.emissiveIntensity = 0.9 + charge * 0.6;
  });
}

// -------------------------------------------------------- engineering shop

export function furnishEngineering(ctx: RoomCtx): void {
  const { props, interact, audio, state } = ctx;
  const room = ROOM_BY_ID.get('engineering')!;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  props.place('desk_large', cx, room.z0 + 1.4, { height: 0.9, solid: true });
  props.line('shelves_tall', [room.x0 + 0.9, room.z0 + 3.0], [room.x0 + 0.9, room.z1 - 1.4], 2, {
    ry: Math.PI / 2, height: 2.0, solid: true, colliderScale: 0.7,
  });
  props.place('crate_large', room.x1 - 1.4, room.z1 - 1.5, { height: 1.0, solid: true });
  props.place('barrel_open', room.x1 - 1.4, room.z1 - 3.2, { height: 0.9, solid: true });
  props.scatter(['ammo_box', 'healthpack', 'keycard', 'health_tube'],
    cx - 1.2, room.z0 + 1.1, cx + 1.2, room.z0 + 1.7, 7, { height: 0.16, y: 0.9 });
  props.place('access_point', room.x1 - 1.0, cz, { height: 0.6, solid: true });

  screenPanel(ctx, room.x0 + 0.08, 1.85, cz - 1.0, Math.PI / 2, [
    { text: 'MAINTENANCE', size: 24, color: '#ffb000', y: 32, mono: true, align: 'left' },
    { text: 'OPEN TASKS   3', size: 24, color: '#ffb000', y: 88, mono: true, align: 'left' },
    { text: 'PORT RCS SEAL', size: 20, color: '#8095ab', y: 128, mono: true, align: 'left' },
    { text: 'COOLANT LOOP B', size: 20, color: '#8095ab', y: 162, mono: true, align: 'left' },
    { text: 'GEAR STRUT #3', size: 20, color: '#8095ab', y: 196, mono: true, align: 'left' },
  ], 1.3, 0.66, 0.8);

  interact.register({
    id: 'eng_diag',
    position: new Vector3(cx, 1.1, room.z0 + 1.4),
    radius: 2.2,
    kind: 'use',
    label: 'Run hull diagnostic',
    onUse: () => {
      audio.tone({ freq: 380, freqEnd: 820, duration: 0.8, gain: 0.06, type: 'triangle' });
      state.toast('Hull integrity 100% — no breaches', 'good');
      return 'Run hull diagnostic';
    },
  });
}

// ---------------------------------------------------- cargo bay + ramp + EVA

export interface CargoRefs {
  ramp: Group;
  setRamp(open: boolean): void;
  isRampOpen(): boolean;
}

export function furnishCargo(ctx: RoomCtx): CargoRefs {
  const { mats, props, interact, audio, state, collision, runtime } = ctx;
  const room = ROOM_BY_ID.get('cargo')!;
  const g = runtime.group;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // cargo containers, restraints, loader
  props.place('crate_large', room.x0 + 2.0, room.z0 + 2.0, { height: 1.5, solid: true, ry: 0.05 });
  props.place('crate_large', room.x0 + 2.0, room.z0 + 4.2, { height: 1.5, solid: true, ry: -0.05 });
  props.place('crate', room.x1 - 2.2, room.z0 + 2.0, { height: 1.1, solid: true });
  props.place('crate_tarp', room.x1 - 2.2, room.z0 + 4.2, { height: 1.2, solid: true, ry: 0.2 });
  props.place('container_full', room.x0 + 2.2, cz + 1.0, { height: 0.7, solid: true });
  props.place('barrel', room.x1 - 2.0, cz + 1.4, { height: 0.9, solid: true });
  props.place('clamp', room.x0 + 3.6, room.z0 + 1.2, { height: 0.3 });
  props.place('clamp', room.x1 - 3.6, room.z0 + 1.2, { height: 0.3 });

  // ---- EVA suit station ----------------------------------------------------
  const suits: Group[] = [];
  for (let i = 0; i < 2; i++) {
    const sx = room.x0 + 1.4;
    const sz = cz - 2.2 + i * 2.0;
    const alcove = new Mesh(new BoxGeometry(0.5, 2.2, 1.1), mats.hullDark);
    alcove.position.set(sx - 0.4, 1.1, sz);
    g.add(alcove);
    // the suit itself: a real pod prop reads as a suit locker/rack
    const suit = props.place('pod', sx, sz, { ry: Math.PI / 2, height: 2.0 });
    suits.push(suit);
    const light = new PointLight(0x7fd8ff, 1.6, 3, 2);
    light.position.set(sx + 0.4, 1.6, sz);
    g.add(light);
  }
  collision.addBox(room.x0 + 1.2, 1.1, cz - 1.2, 1.4, 2.2, 5.0);

  const suitScreen = screenPanel(ctx, room.x0 + 0.09, 1.9, cz + 1.4, Math.PI / 2, [
    { text: 'EVA SUIT STATION', size: 24, color: '#00f0ff', y: 32, mono: true, align: 'left' },
    { text: 'O2         100%', size: 24, color: '#3ee88b', y: 84, mono: true, align: 'left' },
    { text: 'PRESSURE   NOM', size: 24, color: '#3ee88b', y: 122, mono: true, align: 'left' },
    { text: 'BATTERY     98%', size: 24, color: '#3ee88b', y: 160, mono: true, align: 'left' },
    { text: 'STATUS   STOWED', size: 24, color: '#ffb000', y: 200, mono: true, align: 'left' },
  ], 1.5, 0.76, 0.85);

  interact.register({
    id: 'suit_up',
    position: new Vector3(room.x0 + 2.0, 1.3, cz - 1.2),
    radius: 2.4,
    kind: 'use',
    label: 'Don EVA suit',
    onUse: () => {
      state.suitOn = !state.suitOn;
      audio.noiseBurst({ duration: 1.2, gain: 0.2, filter: 500, filterEnd: 1800, attack: 0.25 });
      audio.uiConfirm();
      state.toast(state.suitOn ? 'EVA suit sealed — life support nominal' : 'EVA suit stowed', 'good');
      const tex = screenPanel.makeTexture([
        { text: 'EVA SUIT STATION', size: 24, color: '#00f0ff', y: 32, mono: true, align: 'left' },
        { text: 'O2         100%', size: 24, color: '#3ee88b', y: 84, mono: true, align: 'left' },
        { text: 'PRESSURE   NOM', size: 24, color: '#3ee88b', y: 122, mono: true, align: 'left' },
        { text: 'BATTERY     98%', size: 24, color: '#3ee88b', y: 160, mono: true, align: 'left' },
        {
          text: state.suitOn ? 'STATUS   ACTIVE' : 'STATUS   STOWED',
          size: 24, color: state.suitOn ? '#3ee88b' : '#ffb000', y: 200, mono: true, align: 'left',
        },
      ]);
      const m = suitScreen.material as MeshStandardMaterial;
      m.map = tex;
      m.emissiveMap = tex;
      m.needsUpdate = true;
      return state.suitOn ? 'Stow EVA suit' : 'Don EVA suit';
    },
  });

  // ---- the boarding ramp ---------------------------------------------------
  // Hinged at the aft edge; rotates down to meet the ground.
  const ramp = new Group();
  ramp.position.set(cx, 0.02, room.z1);
  g.add(ramp);

  const rampDeck = new Mesh(new BoxGeometry(RAMP_WIDTH, 0.16, RAMP_LENGTH), mats.deckPlate);
  rampDeck.position.set(0, -0.08, RAMP_LENGTH / 2);
  rampDeck.castShadow = true;
  rampDeck.receiveShadow = true;
  ramp.add(rampDeck);
  for (const sx of [-1, 1]) {
    const rail = new Mesh(new BoxGeometry(0.12, 0.5, RAMP_LENGTH), mats.trim);
    rail.position.set((sx * RAMP_WIDTH) / 2 - sx * 0.06, 0.2, RAMP_LENGTH / 2);
    ramp.add(rail);
  }
  for (let i = 1; i < 7; i++) {
    const grip = new Mesh(new BoxGeometry(RAMP_WIDTH - 0.3, 0.03, 0.1), mats.warnStripe);
    grip.position.set(0, 0.01, (i * RAMP_LENGTH) / 7);
    ramp.add(grip);
  }
  ramp.rotation.x = 0;

  // the hull door that the ramp doubles as
  const rampCollider = collision.addBox(cx, 1.6, room.z1 + 0.15, RAMP_WIDTH + 1.2, 3.2, 0.5, 'ramp_seal');

  let rampOpen = false;
  let rampT = 0;
  const setRamp = (open: boolean): void => {
    if (rampOpen === open) return;
    rampOpen = open;
    audio.noiseBurst({ duration: 2.4, gain: 0.3, filter: 260, filterEnd: 900, q: 1.0, attack: 0.5 });
    audio.tone({ freq: 70, freqEnd: 110, duration: 1.8, gain: 0.1, type: 'sawtooth' });
    state.toast(open ? 'Boarding ramp lowering' : 'Boarding ramp raising', 'info');
  };

  interact.register({
    id: 'cargo_ramp',
    position: new Vector3(cx, 1.2, room.z1 - 1.6),
    radius: 3.2,
    kind: 'ramp',
    label: 'Lower boarding ramp',
    onUse: () => {
      if (!state.hasLanded) {
        audio.uiDenied();
        state.toast('Cannot open the ramp in flight', 'warn');
        return 'Lower boarding ramp';
      }
      setRamp(!rampOpen);
      if (rampOpen) state.completeObjective('ramp');
      return rampOpen ? 'Raise boarding ramp' : 'Lower boarding ramp';
    },
  });

  // airlock warning beacons
  const beacons: Mesh[] = [];
  for (const sx of [-1, 1]) {
    const b = new Mesh(new SphereGeometry(0.09, 12, 10), mats.accent(PALETTE.warn, 0.6));
    b.position.set(cx + sx * (RAMP_WIDTH / 2 + 0.7), 2.6, room.z1 - 0.4);
    g.add(b);
    beacons.push(b);
  }

  const hatchPanel = screenPanel(ctx, cx + 3.4, 1.7, room.z1 - 0.11, Math.PI, [
    { text: 'HATCH STATUS', size: 24, color: '#ffb000', y: 34, mono: true },
    { text: 'SEALED', size: 40, color: '#3ee88b', y: 96 },
    { text: 'EXT PRESSURE  0.00 ATM', size: 17, color: '#8095ab', y: 160, mono: true },
  ], 1.4, 0.7, 0.85);

  runtime.tickers.push((dt, t) => {
    rampT = clamp(rampT + (rampOpen ? dt * 0.42 : -dt * 0.42), 0, 1);
    const e = easeOutCubic(rampT);
    // rotate down to ~ -34 degrees so the tip meets the ground cleanly
    ramp.rotation.x = e * 0.60;
    rampCollider.enabled = rampT < 0.25;
    state.systems.rampAngle = rampT;

    const flash = rampT > 0.02 && rampT < 0.99;
    for (const b of beacons) {
      (b.material as MeshStandardMaterial).emissiveIntensity =
        flash ? 0.4 + Math.abs(Math.sin(t * 7)) * 1.4 : 0.15;
    }
    const hm = hatchPanel.material as MeshStandardMaterial;
    hm.emissiveIntensity = flash ? 0.9 + Math.sin(t * 10) * 0.3 : 0.85;
  });

  // catwalk railings up the sides of the bay
  props.place('railing', room.x0 + 1.6, room.z0 + 6.2, { width: 4.0, ry: Math.PI / 2 });
  props.place('railing', room.x1 - 1.6, room.z0 + 6.2, { width: 4.0, ry: Math.PI / 2 });

  return { ramp, setRamp, isRampOpen: () => rampOpen };
}

// ------------------------------------------------------------------ corridor

export function furnishCorridors(ctx: RoomCtx): void {
  const { props } = ctx;
  // service details down the spine so it never feels like a bare tube
  for (let z = -12; z < 62; z += 8) {
    props.place('cable_a', -1.85, z, { scale: 1.0, y: 2.55, noShadow: true });
    props.place('access_point', 1.55, z + 4, { height: 0.55, ry: -Math.PI / 2 });
  }
  for (let z = -8; z < 60; z += 16) {
    props.place('crate', -1.5, z, { height: 0.5, solid: true, ry: 0.2 });
  }
}

// re-exported so the compiler keeps the helper types
export type { RoomCtx };
export { SpotLight };
