import * as THREE from 'three';
import type { AmbientSystem } from '../systems/AmbientSystem';
import { normalizedBox, normalizedCylinder } from './geometryAlignment';
import { COLORS, emissive, glass, matte, metal } from './materials';
import { damp } from '../core/Tween';

export class ShipExterior {
  readonly root = new THREE.Group();
  private gearGroups: THREE.Group[] = [];
  private thrusterMaterials: THREE.MeshStandardMaterial[] = [];
  private heatMaterials: THREE.MeshStandardMaterial[] = [];
  private gearProgress = 0;
  private gearTarget = 0;
  private thrust = 0;
  private heat = 0;

  constructor(ambient: AmbientSystem) {
    this.root.name = 'CSV Astraea Exterior Hull';
    const hull = metal(0x33444d, 0.3, 0.9);
    const armor = metal(0x56656c, 0.38, 0.86);
    const dark = metal(0x121c22, 0.42, 0.88);

    // Long-range exploration hull wrapped around the playable interior scale.
    const belly = new THREE.Mesh(normalizedBox(29.8, 0.7, 112, 'center'), hull);
    belly.position.set(0, -0.5, 5.5);
    this.root.add(belly);
    for (const side of [-1, 1]) {
      const flank = new THREE.Mesh(normalizedBox(0.7, 3.8, 111.5, 'floor'), hull.clone());
      flank.position.set(side * 15.45, -0.2, 5.5);
      this.root.add(flank);
      for (let z = -45; z < 60; z += 8) {
        const panel = new THREE.Mesh(normalizedBox(0.18, 2.2, 6.6, 'floor'), armor.clone());
        panel.position.set(side * 15.83, 0.38, z);
        panel.rotation.z = side * 0.035;
        this.root.add(panel);
        const line = new THREE.Mesh(normalizedBox(0.11, 0.1, 5.9, 'center'), emissive(z % 16 === 3 ? COLORS.amber : COLORS.cyan, 1.45));
        line.position.set(side * 15.94, 2.25, z);
        this.root.add(line);
      }
    }

    // Dorsal armor is segmented so the silhouette reads as a manufactured ship.
    for (let z = -43; z <= 56; z += 11) {
      const top = new THREE.Mesh(normalizedBox(28.6, 0.42, 10.2, 'center'), z % 22 === 1 ? armor : hull);
      top.position.set(0, 3.52, z);
      top.rotation.x = (z % 3) * 0.004;
      this.root.add(top);
      for (const x of [-11.8, 11.8]) {
        const rail = new THREE.Mesh(normalizedBox(1.5, 0.58, 8.6, 'center'), dark);
        rail.position.set(x, 3.84, z);
        this.root.add(rail);
      }
    }

    // Cockpit nose shell and exterior glazing.
    const noseFloor = new THREE.Mesh(normalizedBox(19.8, 0.55, 15.5, 'center'), hull);
    noseFloor.position.set(0, -0.38, -57.7);
    const noseTop = new THREE.Mesh(normalizedBox(18.8, 0.48, 13, 'center'), armor);
    noseTop.position.set(0, 3.58, -57.8);
    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 2.7), glass(0x72bfff, 0.2));
    frontGlass.position.set(0, 1.82, -65.08);
    frontGlass.rotation.y = Math.PI;
    this.root.add(noseFloor, noseTop, frontGlass);
    for (const x of [-9.4, 9.4]) {
      const cheek = new THREE.Mesh(normalizedBox(1.6, 3.5, 13.3, 'floor'), hull);
      cheek.position.set(x, 0, -58.1);
      cheek.rotation.z = x > 0 ? -0.08 : 0.08;
      this.root.add(cheek);
    }

    // Cargo/aft casing and heavy propulsion pods.
    const aftTop = new THREE.Mesh(normalizedBox(21.8, 0.5, 17, 'center'), hull);
    aftTop.position.set(0, 4.55, 69.5);
    const aftBelly = new THREE.Mesh(normalizedBox(21.8, 0.6, 17, 'center'), hull);
    aftBelly.position.set(0, -0.45, 69.5);
    this.root.add(aftTop, aftBelly);
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(normalizedCylinder(2.3, 2.7, 10.5, 20, 'center'), dark);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(side * 12.9, 1.25, 68.5);
      this.root.add(pod);
      const nozzle = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.32, 12, 24), armor);
      nozzle.position.set(side * 12.9, 1.25, 73.8);
      const glowMaterial = emissive(0x49cfff, 1.3);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.75, 24), glowMaterial);
      glow.position.set(side * 12.9, 1.25, 73.84);
      this.root.add(nozzle, glow);
      this.thrusterMaterials.push(glowMaterial);
      ambient.pulse(glowMaterial, 1.2, 0.3, 5 + side);

      const fin = new THREE.Mesh(normalizedBox(5.8, 0.35, 10, 'center'), armor);
      fin.position.set(side * 16.7, 1.3, 66.5);
      fin.rotation.z = side * 0.06;
      this.root.add(fin);
    }

    // Heat-reactive leading armor for re-entry.
    for (const x of [-10.2, -5, 0, 5, 10.2]) {
      const heatMaterial = metal(0x313e44, 0.34, 0.9);
      const leading = new THREE.Mesh(normalizedBox(3.7, 0.28, 1.15, 'center'), heatMaterial);
      leading.position.set(x, -0.02, -65.1 + Math.abs(x) * 0.06);
      this.root.add(leading);
      this.heatMaterials.push(heatMaterial);
    }

    this.buildLandingGear();
    this.buildSensors();
    this.buildDecals();
  }

  private buildLandingGear(): void {
    const locations = [
      [-9.4, -48], [9.4, -48], [-9.4, 58], [9.4, 58],
    ];
    for (const [x, z] of locations) {
      const gear = new THREE.Group();
      gear.position.set(x, -0.15, z);
      const strut = new THREE.Mesh(normalizedCylinder(0.13, 0.17, 2.8, 10, 'floor'), metal(0x89979c, 0.26, 0.92));
      strut.rotation.z = x < 0 ? 0.2 : -0.2;
      const foot = new THREE.Mesh(normalizedBox(1.5, 0.2, 0.85, 'floor'), matte(0x151a1d, 0.86));
      foot.position.set(x < 0 ? -0.55 : 0.55, -2.65, 0);
      gear.add(strut, foot);
      this.root.add(gear);
      this.gearGroups.push(gear);
    }
  }

  private buildSensors(): void {
    for (const x of [-7.5, 0, 7.5]) {
      const mast = new THREE.Mesh(normalizedCylinder(0.035, 0.07, 1.4, 8, 'floor'), metal(0xa2b2b7, 0.26, 0.92));
      mast.position.set(x, 3.78, -37 + Math.abs(x));
      const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), emissive(x === 0 ? COLORS.amber : COLORS.cyan, 1.7));
      sensor.position.set(x, 5.15, -37 + Math.abs(x));
      this.root.add(mast, sensor);
    }
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.0, 0.28, 20, 1, true), metal(0x768991, 0.3, 0.86));
    dish.position.set(0, 4.35, 35);
    dish.rotation.x = -0.24;
    this.root.add(dish);
  }

  private buildDecals(): void {
    const makeDecal = (text: string): THREE.CanvasTexture => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 180;
      const context = canvas.getContext('2d')!;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = '700 86px ui-monospace, Consolas, monospace';
      context.fillStyle = '#d7e9ec';
      context.fillText(text, 42, 120);
      context.fillStyle = '#ffb000';
      context.fillRect(42, 138, 810, 8);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    for (const side of [-1, 1]) {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 1.45), new THREE.MeshBasicMaterial({ map: makeDecal('CSV ASTRAEA // EX-07'), transparent: true }));
      decal.position.set(side * 15.96, 1.24, -8);
      decal.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.root.add(decal);
    }
  }

  setGear(deployed: boolean): void {
    this.gearTarget = deployed ? 1 : 0;
  }

  setThrust(value: number): void {
    this.thrust = THREE.MathUtils.clamp(value, 0, 1);
  }

  setReentryHeat(value: number): void {
    this.heat = THREE.MathUtils.clamp(value, 0, 1);
  }

  update(delta: number): void {
    this.gearProgress = damp(this.gearProgress, this.gearTarget, 3.2, delta);
    for (const gear of this.gearGroups) {
      gear.rotation.z = (gear.position.x < 0 ? -1 : 1) * (1 - this.gearProgress) * 1.12;
      gear.position.y = THREE.MathUtils.lerp(1.75, -1.45, this.gearProgress);
      gear.visible = this.gearProgress > 0.02;
    }
    for (const material of this.thrusterMaterials) material.emissiveIntensity = 1.2 + this.thrust * 7.5 + Math.random() * this.thrust * 0.8;
    for (const material of this.heatMaterials) {
      material.emissive.setHex(this.heat > 0.01 ? 0xff3b12 : 0x000000);
      material.emissiveIntensity = this.heat * 5.5;
      material.color.setHex(this.heat > 0.55 ? 0x9e391e : 0x313e44);
    }
  }
}
