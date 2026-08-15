import * as THREE from "three";
import { mat, emissiveSurface } from "./materials";
import { roundedBox, cyl, cone, box, sphere, glowStrip } from "./geo";

/**
 * ShipExterior — the visible hull. Only shown from outside (chase/orbital
 * cameras, landing, and after exiting on the planet).
 */
export class ShipExterior {
  readonly root = new THREE.Group();
  private thrusterGlow!: THREE.Mesh;
  private running: THREE.Mesh[] = [];
  private gear: THREE.Object3D[] = [];

  constructor() {
    this.buildHull();
    this.buildThrusters();
    this.buildLights();
    this.buildGear();
  }

  private buildHull(): void {
    const hullMat = mat("hull");
    // main body (long rounded hull), extends beyond interior
    const body = roundedBox(11.4, 3.6, 44, 1.4, hullMat, 3);
    body.position.set(0, 1.2, 9.5);
    this.root.add(body);
    // nose cone
    const nose = cone(4.6, 6, hullMat, 4);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.scale.set(1, 1, 1.6);
    nose.position.set(0, 1.2, -14.5);
    this.root.add(nose);
    // cockpit glass band near nose
    const band = box(6.5, 1.4, 0.06, mat("glass"));
    band.position.set(0, 2.1, -11.0);
    band.rotation.y = 0;
    this.root.add(band);
    // tail cap
    const tail = box(8.0, 3.4, 2.5, mat("hullDark"));
    tail.position.set(0, 1.1, 32.5);
    this.root.add(tail);
    // fins
    for (const s of [1, -1]) {
      const fin = cone(2.2, 4, mat("hullLight"), 3);
      fin.rotation.x = 0;
      fin.position.set(s * 4.2, 1.4, 28);
      fin.scale.set(0.25, 1, 1);
      fin.rotation.z = s * 0.6;
      this.root.add(fin);
    }
    // panel seams
    const seamMat = emissiveSurface(0x0a1620, 0.5);
    for (let i = 0; i < 6; i++) {
      const seam = glowStrip(0.02, 4.4, seamMat);
      seam.rotation.x = -Math.PI / 2;
      seam.rotation.y = Math.PI / 2;
      seam.position.set(0, 2.4, 2 + i * 4);
      this.root.add(seam);
    }
  }

  private buildThrusters(): void {
    // two main engine bells at tail
    for (const s of [1, -1]) {
      const bell = cone(0.7, 1.4, mat("hullDark"), 20);
      bell.rotation.x = -Math.PI / 2;
      bell.position.set(s * 1.8, 0.9, 33.6);
      this.root.add(bell);
      const glow = cone(0.5, 0.4, emissiveSurface(0x66d9ff, 2.0), 16);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(s * 1.8, 0.9, 34.3);
      glow.userData.thrusterGlow = true;
      this.root.add(glow);
    }
    // maneuvering thrusters on hull
    for (const [x, z] of [
      [-4.5, 20],
      [4.5, 20],
      [-4.5, -6],
      [4.5, -6],
    ] as const) {
      const p = cone(0.18, 0.3, mat("hullDark"), 10);
      p.position.set(x, 0.5, z);
      p.rotation.z = x < 0 ? -Math.PI / 2 : Math.PI / 2;
      this.root.add(p);
    }
    this.thrusterGlow = cone(0.5, 0.4, emissiveSurface(0x66d9ff, 2.0), 16);
    this.thrusterGlow.rotation.x = -Math.PI / 2;
    this.thrusterGlow.position.set(0, 0.9, 34.3);
    this.root.add(this.thrusterGlow);
  }

  private buildLights(): void {
    const navL = emissiveSurface(0xff2244, 2.5);
    const navR = emissiveSurface(0x39ff88, 2.5);
    for (const s of [1, -1]) {
      const l = sphere(0.09, s > 0 ? navR : navL, 12);
      l.position.set(s * 5.6, 0.4, -8);
      this.root.add(l);
    }
    // landing lights (pointing down) at nose
    for (const [x, z] of [
      [-1.5, -8],
      [1.5, -8],
    ] as const) {
      const ll = sphere(0.07, emissiveSurface(0xffffff, 2.2), 12);
      ll.position.set(x, 0.25, z);
      this.root.add(ll);
    }
    // running strip lights
    for (const [x, z, len] of [
      [4.4, 12, 10],
      [-4.4, 12, 10],
    ] as const) {
      const strip = glowStrip(0.04, len, emissiveSurface(0x39ff88, 1.0));
      strip.rotation.y = Math.PI / 2;
      strip.position.set(x, 2.2, z);
      this.root.add(strip);
      this.running.push(strip);
    }
  }

  private buildGear(): void {
    // three landing gear struts (deployed state; animated by landing system)
    for (const [x, z] of [
      [-3.5, 8],
      [3.5, 8],
      [0, 22],
    ] as const) {
      const g = new THREE.Group();
      const leg = cyl(0.08, 0.1, 1.1, mat("steel"), 10);
      leg.position.y = -0.55;
      const wheel = cyl(0.16, 0.16, 0.18, mat("rubber"), 12);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.y = -1.0;
      g.add(leg, wheel);
      g.position.set(x, 0, z);
      this.root.add(g);
      this.gear.push(g);
    }
  }

  /** Place the ramp group (shared visual) and hide/show gear. */
  setRamp(ramp: THREE.Object3D | null): void {
    if (!ramp) return;
    // ramp sits at tail; reparent into exterior for visibility
    this.root.add(ramp);
    ramp.position.set(0, 0, 33.4);
  }

  setGearDeployed(deployed: boolean): void {
    const k = deployed ? 1 : 0;
    for (const g of this.gear) {
      g.scale.y = k;
      g.position.y = 0 * k;
      g.visible = deployed;
    }
  }

  update(dt: number, thrust: number): void {
    // animate thruster glow with thrust
    const glow = this.thrusterGlow as THREE.Mesh;
    const m = glow.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = 1.2 + thrust * 3;
    void dt;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }
}
