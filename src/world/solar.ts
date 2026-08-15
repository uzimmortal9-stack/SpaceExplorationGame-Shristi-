import * as THREE from "three";
import { assetLoader as AL } from "./assets";
import { emissiveSurface } from "./materials";

export interface Target {
  id: string;
  name: string;
  type: "planet" | "moon" | "star";
  position: THREE.Vector3;
  radius: number;
}

export class SolarSystem {
  readonly root = new THREE.Group();
  readonly targets: Target[] = [];
  private sun!: THREE.Mesh;
  private orbitLines: THREE.Line[] = [];
  private planets: { mesh: THREE.Object3D; speed: number; radius: number; angle: number; radius3D: number }[] = [];
  readonly sunLight = new THREE.DirectionalLight(0xfff2cc, 0);

  constructor() {
    this.build();
  }

  private async build(): Promise<void> {
    // Sun
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 32), emissiveSurface(0xffaa33, 1.6));
    this.root.add(this.sun);
    // Sun light (not added to root; game adds to scene)
    this.sunLight.castShadow = true;

    const moonTex = AL.texture("textures/planets/moon_1024.jpg");

    // 1) Rocky inner world
    const rocky = new THREE.Mesh(
      new THREE.SphereGeometry(7, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x9a6a4a, roughness: 1, metalness: 0 }),
    );
    this.addPlanet(rocky, 60, 0.02, 7, "Atheron", "planet");

    // 2) Gas giant with rings
    const gasMat = new THREE.MeshStandardMaterial({
      color: 0xd8b58a,
      roughness: 0.9,
      metalness: 0,
    });
    const gas = new THREE.Mesh(new THREE.SphereGeometry(16, 40, 40), gasMat);
    const gasGroup = new THREE.Group();
    gasGroup.add(gas);
    const ringGeo = new THREE.RingGeometry(20, 30, 64);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xcbb89a, roughness: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -1.2;
    gasGroup.add(ring);
    this.addPlanet(gasGroup, 130, 0.012, 16, "Veyron", "planet");

    // moon of gas giant
    const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 24), new THREE.MeshStandardMaterial({ map: moonTex, roughness: 1 }));
    const moonOrbit = new THREE.Group();
    moonOrbit.position.copy(gasGroup.position);
    const moonHolder = new THREE.Group();
    moonHolder.add(moon);
    moon.position.set(30, 0, 0);
    this.root.add(moonHolder);
    this.planets.push({ mesh: moonHolder, speed: 0.05, radius: 30, angle: 0, radius3D: 3 });

    // 3) Ice world
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfe6f2, roughness: 0.2, metalness: 0.1 });
    const ice = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 32), iceMat);
    this.addPlanet(ice, 190, 0.009, 10, "Nullset", "planet");

    // 4) Jungle world (target) with atmosphere
    const jungleMat = new THREE.MeshStandardMaterial({ color: 0x2f6b4f, roughness: 0.9, metalness: 0 });
    const jungle = new THREE.Mesh(new THREE.SphereGeometry(14, 40, 40), jungleMat);
    const jungleAtmo = new THREE.Mesh(
      new THREE.SphereGeometry(14.6, 40, 40),
      new THREE.MeshBasicMaterial({ color: 0x4fd8b8, transparent: true, opacity: 0.16, side: THREE.BackSide }),
    );
    const jungleGroup = new THREE.Group();
    jungleGroup.add(jungle, jungleAtmo);
    this.addPlanet(jungleGroup, 260, 0.007, 40, "Lumis Prime", "planet");
    this.jungleTarget = this.targets[this.targets.length - 1];
    this.jungleMesh = jungleGroup;
    // give the jungle a richer surface look
    (jungle.material as THREE.MeshStandardMaterial).color.setHex(0x2f6b4f);

    // Orbit lines
    for (const t of this.targets) {
      if (t.type !== "planet") continue;
      const r = t.position.length();
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x224466, transparent: true, opacity: 0.4 }));
      this.root.add(line);
      this.orbitLines.push(line);
    }
  }

  private addPlanet(mesh: THREE.Object3D, radius: number, speed: number, radius3D: number, name: string, type: "planet" | "moon"): void {
    mesh.position.set(radius, 0, 0);
    mesh.rotation.y = Math.random() * 6;
    this.root.add(mesh);
    this.planets.push({ mesh, speed, radius, angle: Math.random() * 6, radius3D });
    this.targets.push({
      id: name.toLowerCase().replace(/[^a-z]/g, ""),
      name,
      type,
      position: mesh.position,
      radius: radius3D,
    });
  }

  private jungleTarget!: Target;
  jungleMesh: THREE.Group | null = null;

  get jungle(): Target {
    return this.jungleTarget;
  }

  setJungleCenter(newPos: THREE.Vector3): void {
    this.jungleTarget.position.copy(newPos);
  }

  /** Advance orbital motion (slow). */
  update(dt: number): void {
    for (const p of this.planets) {
      p.angle += p.speed * dt;
      p.mesh.position.set(Math.cos(p.angle) * p.radius, 0, Math.sin(p.angle) * p.radius);
    }
  }
}
