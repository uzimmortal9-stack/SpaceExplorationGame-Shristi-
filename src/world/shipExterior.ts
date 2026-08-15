/**
 * Exterior hull.
 *
 * The hull is a real downloaded model (Quaternius Ultimate Spaceships, CC0)
 * scaled to match the interior's footprint, with authored additions that the
 * base mesh does not carry: retractable landing gear, thruster nozzles with
 * pooled exhaust, navigation strobes, a re-entry heat shell and a ramp door.
 */

import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  SphereGeometry,
  Vector3,
} from 'three';

import type { AssetLoader } from '../assets/assetLoader';
import { clamp, easeInOutCubic, lerp } from '../core/math';
import type { MaterialLibrary } from './materials';

/** Interior spans z -30..78 and x -15..15; the hull is scaled to enclose it. */
const HULL_LENGTH = 128;

export class ShipExterior {
  readonly group = new Group();
  /** Origin matches the interior's coordinate frame. */
  readonly hull: Group;

  private readonly gearLegs: Group[] = [];
  private readonly thrusters: Array<{ cone: Mesh; light: PointLight; core: Mesh }> = [];
  private readonly strobes: Mesh[] = [];
  private readonly heatShell: Mesh;
  private readonly rampDoor: Mesh;

  private gearT = 0;
  private heat = 0;
  private thrust = 0;
  private elapsed = 0;

  constructor(assets: AssetLoader, private readonly mats: MaterialLibrary) {
    this.group.name = 'ship-exterior';

    // ---- the authored hull mesh --------------------------------------------
    this.hull = assets.instance('hull_imperial');
    const info = assets.info('hull_imperial');
    if (info && info.size.z > 1) {
      const s = HULL_LENGTH / info.size.z;
      this.hull.scale.setScalar(s);
    }
    // the model's pivot is centred; slide it so the hull wraps the interior
    this.hull.position.set(0, 1.4, 24);
    this.hull.rotation.y = Math.PI;
    this.group.add(this.hull);

    // Darken and metallise so the hull reads as a real spacecraft rather than
    // the kit's flat toy palette, and so the HDRI/sun produce real specular.
    this.hull.traverse((child) => {
      const m = child as Mesh;
      if (!m.isMesh) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of list) {
        const std = mat as MeshStandardMaterial;
        if (!std?.isMeshStandardMaterial) continue;
        // The kit hull is authored near-white; retone it to a real spacecraft
        // livery — a cool graphite base with strong metallic response so the
        // sun and the HDRI actually shape the panels.
        std.color.setRGB(0.30, 0.325, 0.36);
        std.metalness = 0.86;
        std.roughness = 0.34;
        std.envMapIntensity = 1.3;
      }
    });

    // hull accent stripes so the silhouette reads at distance
    for (const sx of [-1, 1]) {
      const stripe = new Mesh(new BoxGeometry(0.5, 0.35, 62), mats.accent(0x00d8ff, 0.55));
      stripe.position.set(sx * 12.5, 2.3, 22);
      this.group.add(stripe);
      const livery = new Mesh(new BoxGeometry(0.7, 1.1, 26), mats.warnStripe);
      livery.position.set(sx * 12.2, 0.6, 4);
      this.group.add(livery);
    }

    // ---- landing gear -------------------------------------------------------
    const gearPositions: Array<[number, number]> = [
      [-11, -14], [11, -14], [-12, 44], [12, 44], [0, 66],
    ];
    for (const [gx, gz] of gearPositions) {
      const leg = new Group();
      leg.position.set(gx, -1.1, gz);

      const strut = new Mesh(new CylinderGeometry(0.34, 0.28, 4.2, 12), mats.brushed);
      strut.position.y = -2.1;
      strut.castShadow = true;
      leg.add(strut);

      const knee = new Mesh(new SphereGeometry(0.42, 12, 10), mats.trim);
      knee.position.y = -4.1;
      leg.add(knee);

      const foot = new Mesh(new CylinderGeometry(1.05, 1.25, 0.42, 16), mats.hullDark);
      foot.position.y = -4.4;
      foot.castShadow = true;
      leg.add(foot);

      const pad = new Mesh(new CylinderGeometry(1.2, 1.2, 0.12, 16), mats.rubber);
      pad.position.y = -4.64;
      leg.add(pad);

      leg.visible = false;
      this.group.add(leg);
      this.gearLegs.push(leg);
    }

    // ---- engine nozzles ------------------------------------------------------
    const nozzlePositions: Array<[number, number]> = [
      [-7.5, 82], [7.5, 82], [-14, 74], [14, 74],
    ];
    for (const [nx, nz] of nozzlePositions) {
      const bell = new Mesh(new CylinderGeometry(2.1, 2.9, 4.0, 20, 1, true), mats.hullDark);
      bell.position.set(nx, 1.2, nz);
      bell.rotation.x = Math.PI / 2;
      bell.castShadow = true;
      this.group.add(bell);

      const core = new Mesh(
        new CylinderGeometry(1.8, 1.8, 0.4, 20),
        new MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.0, blending: AdditiveBlending, depthWrite: false }),
      );
      core.position.set(nx, 1.2, nz + 1.6);
      core.rotation.x = Math.PI / 2;
      this.group.add(core);

      // exhaust plume
      const cone = new Mesh(
        new CylinderGeometry(1.9, 0.5, 16, 18, 1, true),
        new MeshBasicMaterial({
          color: 0x63d4ff,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
          side: BackSide,
        }),
      );
      cone.position.set(nx, 1.2, nz + 9);
      cone.rotation.x = -Math.PI / 2;
      this.group.add(cone);

      const light = new PointLight(0x63d4ff, 0, 40, 2);
      light.position.set(nx, 1.2, nz + 4);
      this.group.add(light);

      this.thrusters.push({ cone, light, core });
    }

    // ---- navigation strobes --------------------------------------------------
    const strobeSpots: Array<[number, number, number, number]> = [
      [-16, 2.6, -6, 0xff3344],
      [16, 2.6, -6, 0x33ff66],
      [0, 5.2, -22, 0xffffff],
      [0, 5.2, 60, 0xffffff],
      [-16, 2.6, 50, 0xff3344],
      [16, 2.6, 50, 0x33ff66],
    ];
    for (const [sx, sy, sz, color] of strobeSpots) {
      const bulb = new Mesh(
        new SphereGeometry(0.42, 12, 10),
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
      );
      bulb.position.set(sx, sy, sz);
      bulb.userData.color = color;
      this.group.add(bulb);
      this.strobes.push(bulb);
    }

    // ---- antennas / sensors --------------------------------------------------
    for (const [ax, az] of [[-6, -18], [6, -18], [0, 40]] as const) {
      const mast = new Mesh(new CylinderGeometry(0.09, 0.14, 3.4, 8), mats.chrome);
      mast.position.set(ax, 5.4, az);
      this.group.add(mast);
      const tip = new Mesh(new SphereGeometry(0.2, 10, 8), mats.accent(0x00d8ff, 0.9));
      tip.position.set(ax, 7.1, az);
      this.group.add(tip);
    }
    const dish = assets.instance('satellite_dish');
    const dInfo = assets.info('satellite_dish');
    if (dInfo && dInfo.size.y > 0.1) dish.scale.setScalar(4.5 / dInfo.size.y);
    dish.position.set(-4, 4.6, 30);
    this.group.add(dish);

    // ---- ramp door on the aft hull -------------------------------------------
    this.rampDoor = new Mesh(new BoxGeometry(6.4, 0.4, 9.5), mats.hullDark);
    this.rampDoor.position.set(0, 0.2, 82);
    this.rampDoor.castShadow = true;
    this.group.add(this.rampDoor);

    // ---- re-entry heat shell ---------------------------------------------------
    this.heatShell = new Mesh(
      new SphereGeometry(1, 40, 28),
      new MeshBasicMaterial({
        color: 0xff7a2a,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        side: BackSide,
        depthWrite: false,
      }),
    );
    this.heatShell.scale.set(30, 12, 72);
    this.heatShell.position.set(0, 1.5, 22);
    this.group.add(this.heatShell);
  }

  /** 0 = stowed, 1 = deployed. */
  setGear(t: number): void {
    this.gearT = clamp(t, 0, 1);
  }

  /** 0..1 main-drive output; drives plume length and light. */
  setThrust(t: number): void {
    this.thrust = clamp(t, 0, 1);
  }

  /** 0..1 atmospheric-entry heating. */
  setHeat(t: number): void {
    this.heat = clamp(t, 0, 1);
  }

  /** Hide the hull when the camera is inside it (first-person interior). */
  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  update(dt: number): void {
    this.elapsed += dt;
    const t = this.elapsed;

    // gear
    const e = easeInOutCubic(this.gearT);
    for (const leg of this.gearLegs) {
      leg.visible = this.gearT > 0.001;
      leg.scale.y = lerp(0.06, 1, e);
      leg.position.y = lerp(0.6, -1.1, e);
    }

    // thrusters
    for (const th of this.thrusters) {
      const flick = 0.85 + Math.sin(t * 40 + th.cone.position.x) * 0.15;
      const amount = this.thrust * flick;
      (th.cone.material as MeshBasicMaterial).opacity = amount * 0.55;
      th.cone.scale.set(0.5 + amount * 0.6, 0.35 + amount * 1.5, 0.5 + amount * 0.6);
      (th.core.material as MeshBasicMaterial).opacity = amount * 0.9;
      th.light.intensity = amount * 260;
    }

    // strobes
    const phase = (t * 1.1) % 2;
    for (let i = 0; i < this.strobes.length; i++) {
      const s = this.strobes[i];
      const on = phase < 0.14 || (phase > 0.28 && phase < 0.36);
      const m = s.material as MeshBasicMaterial;
      m.opacity = on ? 1 : 0.18;
      s.scale.setScalar(on ? 1.5 : 1);
    }

    // heat shell
    const hm = this.heatShell.material as MeshBasicMaterial;
    hm.opacity = this.heat * (0.42 + Math.sin(t * 22) * 0.08);
    (hm.color as Color).setHSL(lerp(0.09, 0.02, this.heat), 1, lerp(0.5, 0.66, this.heat));
    this.heatShell.scale.set(30 + this.heat * 6, 12 + this.heat * 4, 72 + this.heat * 16);

    // ramp door slides aside as the interior ramp lowers
    void this.mats;
  }

  setRampDoor(open: number): void {
    this.rampDoor.position.y = lerp(0.2, -0.4, open);
    this.rampDoor.rotation.x = open * 0.6;
    this.rampDoor.position.z = lerp(82, 84.5, open);
  }

  /** World-space anchor where the exterior ramp foot touches down. */
  get rampFoot(): Vector3 {
    return new Vector3(0, 0, 88);
  }

  get root(): Object3D {
    return this.group;
  }
}
