/**
 * Interior lighting rig.
 *
 * Environment-first: `scene.environment` (a real HDRI through PMREMGenerator)
 * provides the base response, then each room gets *physical* fixtures:
 *   * a soft overhead RectAreaLight standing in for the ceiling panel,
 *   * a low-intensity point fill so corners never go pitch black,
 *   * accent spots for consoles / hazard areas.
 *
 * Emissive trim exists in the materials, but it is never the reason a room is
 * bright — pull every light out of this rig and the ship goes dark.
 */

import {
  Color,
  Group,
  HemisphereLight,
  PointLight,
  RectAreaLight,
  SpotLight,
  Object3D,
} from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

import type { QualityProfile } from '../../core/renderer';
import { ROOMS, CORRIDORS, DECK_HEIGHT, type RoomDef } from './layout';

let uniformsReady = false;

export interface MoodSpec {
  /** Ceiling panel colour + intensity. */
  key: number;
  keyIntensity: number;
  /** Ambient fill colour. */
  fill: number;
  fillIntensity: number;
}

export const MOODS: Record<RoomDef['mood'], MoodSpec> = {
  command: { key: 0xd6e6ff, keyIntensity: 5.5, fill: 0x2a4460, fillIntensity: 1.1 },
  utility: { key: 0xc8d6e4, keyIntensity: 4.6, fill: 0x22303f, fillIntensity: 0.9 },
  crew: { key: 0xffd9ac, keyIntensity: 4.8, fill: 0x3d2f24, fillIntensity: 1.3 },
  medical: { key: 0xeff8ff, keyIntensity: 7.0, fill: 0x33485c, fillIntensity: 1.2 },
  engineering: { key: 0xffbe72, keyIntensity: 4.4, fill: 0x40281a, fillIntensity: 1.0 },
  science: { key: 0xcdf3ff, keyIntensity: 5.4, fill: 0x1f4450, fillIntensity: 1.1 },
  cargo: { key: 0xcfd9e6, keyIntensity: 4.2, fill: 0x232b36, fillIntensity: 0.85 },
  service: { key: 0xdfe9f5, keyIntensity: 4.4, fill: 0x2c3742, fillIntensity: 1.0 },
};

export interface InteriorLights {
  group: Group;
  /** Flicker/pulse hook used during warp spin-up and alerts. */
  setPulse(v: number): void;
  setAlert(on: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

export function buildInteriorLighting(profile: QualityProfile): InteriorLights {
  if (!uniformsReady) {
    RectAreaLightUniformsLib.init();
    uniformsReady = true;
  }

  const group = new Group();
  group.name = 'interior-lights';

  const panels: Array<{ light: RectAreaLight; base: number; mood: RoomDef['mood'] }> = [];
  const fills: Array<{ light: PointLight; base: number }> = [];
  const alerts: SpotLight[] = [];

  // Global controlled fill so nothing is ever fully black; kept low.
  const hemi = new HemisphereLight(0x9fb8d8, 0x1a1f26, 0.35);
  group.add(hemi);

  const addPanel = (
    x: number, z: number, w: number, h: number, ceiling: number, mood: RoomDef['mood'],
  ): void => {
    const spec = MOODS[mood];
    const light = new RectAreaLight(new Color(spec.key).getHex(), spec.keyIntensity, w, h);
    light.position.set(x, ceiling - 0.12, z);
    light.rotation.x = -Math.PI / 2;
    group.add(light);
    panels.push({ light, base: spec.keyIntensity, mood });
  };

  const addFill = (x: number, y: number, z: number, mood: RoomDef['mood'], dist: number): void => {
    const spec = MOODS[mood];
    const p = new PointLight(new Color(spec.fill).getHex(), spec.fillIntensity, dist, 1.8);
    p.position.set(x, y, z);
    p.castShadow = false;
    group.add(p);
    fills.push({ light: p, base: spec.fillIntensity });
  };

  for (const room of ROOMS) {
    const w = room.x1 - room.x0;
    const d = room.z1 - room.z0;
    const ceiling = room.ceiling ?? DECK_HEIGHT;
    // one panel per ~7 m of room so big rooms are evenly lit
    const nx = Math.max(1, Math.round(w / 7));
    const nz = Math.max(1, Math.round(d / 7));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = room.x0 + (w * (i + 0.5)) / nx;
        const z = room.z0 + (d * (j + 0.5)) / nz;
        addPanel(x, z, Math.min(3.6, w / nx * 0.7), Math.min(2.2, d / nz * 0.6), ceiling, room.mood);
      }
    }
    addFill((room.x0 + room.x1) / 2, ceiling * 0.55, (room.z0 + room.z1) / 2, room.mood, Math.max(w, d) * 1.1);

    if (room.mood === 'engineering' || room.id === 'defense') {
      const s = new SpotLight(0xff3344, 0, 12, Math.PI / 4, 0.7, 1.4);
      s.position.set((room.x0 + room.x1) / 2, ceiling - 0.3, (room.z0 + room.z1) / 2);
      const t = new Object3D();
      t.position.set((room.x0 + room.x1) / 2, 0, (room.z0 + room.z1) / 2);
      group.add(t);
      s.target = t;
      group.add(s);
      alerts.push(s);
    }
  }

  // Corridor strip lighting: small panels at regular intervals down the spine.
  for (const c of CORRIDORS) {
    const len = Math.max(c.x1 - c.x0, c.z1 - c.z0);
    const along = c.z1 - c.z0 > c.x1 - c.x0 ? 'z' : 'x';
    const count = Math.max(1, Math.round(len / 6));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const x = along === 'z' ? (c.x0 + c.x1) / 2 : c.x0 + (c.x1 - c.x0) * t;
      const z = along === 'z' ? c.z0 + (c.z1 - c.z0) * t : (c.z0 + c.z1) / 2;
      addPanel(x, z, along === 'x' ? 3.0 : 1.6, along === 'z' ? 3.0 : 1.6, DECK_HEIGHT, 'utility');
    }
  }

  // Shadow-casting is expensive indoors; use a few "hero" shadow lights only.
  if (profile.shadows) {
    const heroSpots: Array<[number, number, number]> = [
      [0, -24, 3.2],  // bridge
      [0, 55, 4.6],   // warp core
      [0, 70, 4.2],   // cargo bay
    ];
    for (const [x, z, ceil] of heroSpots) {
      const s = new SpotLight(0xffffff, 40, 26, Math.PI / 3.2, 0.6, 1.5);
      s.position.set(x, ceil - 0.25, z);
      s.castShadow = true;
      s.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      s.shadow.bias = -0.0012;
      s.shadow.normalBias = 0.035;
      s.shadow.camera.near = 0.4;
      s.shadow.camera.far = 30;
      const t = new Object3D();
      t.position.set(x, 0, z);
      group.add(t);
      s.target = t;
      group.add(s);
    }
  }

  let pulse = 0;
  let alertOn = false;
  let time = 0;

  return {
    group,
    setPulse(v: number) {
      pulse = v;
    },
    setAlert(on: boolean) {
      alertOn = on;
    },
    update(dt: number) {
      time += dt;
      if (pulse > 0.001) {
        // rhythmic dip during warp spin-up
        const f = 1 - pulse * 0.45 * (0.5 + 0.5 * Math.sin(time * 11));
        for (const p of panels) p.light.intensity = p.base * f;
        for (const f2 of fills) f2.light.intensity = f2.base * (1 - pulse * 0.3);
      } else {
        for (const p of panels) p.light.intensity = p.base;
        for (const f2 of fills) f2.light.intensity = f2.base;
      }
      const a = alertOn ? (0.5 + 0.5 * Math.sin(time * 6)) * 26 : 0;
      for (const s of alerts) s.intensity = a;
    },
    dispose() {
      group.clear();
      panels.length = 0;
      fills.length = 0;
    },
  };
}
