import * as THREE from "three";
import { mat, tinted, emissiveSurface } from "./materials";
import { fbm2D, makeNoise2D, RNG } from "../core/math";
import { CollisionWorld } from "../systems/collision";
import { cone, box, plane, roundedBox } from "./geo";

/**
 * Jungle — the procedural alien jungle planet surface: terrain, instanced
 * vegetation, rocks, ruins, waterfall and a glowing bioluminescent pool.
 */

export class Jungle {
  readonly root = new THREE.Group();
  private noise = makeNoise2D(1337);
  private rng = new RNG(42);
  private sporeParticles!: THREE.Points;
  private time = 0;
  private waterfallParticles!: THREE.Points;
  private poolParticles!: THREE.Points;
  readonly poolPos = new THREE.Vector3(62, 0, 44);

  constructor(private collision: CollisionWorld) {
    this.buildTerrain();
    this.buildVegetation();
    this.buildRocks();
    this.buildRuins();
    this.buildWaterfall();
    this.buildParticles();
    this.buildLighting();
  }

  /** Terrain height at world (x,z) with a flattened landing field at origin
   * that covers the whole 48 m ship footprint so the hull rests on the ground. */
  heightAt(x: number, z: number): number {
    if (Math.abs(x) < 7.5 && z > -16 && z < 36) return 0; // cleared landing field
    const d = Math.sqrt(x * x + z * z);
    let h = fbm2D(this.noise, x * 0.012, z * 0.012, 5) * 9;
    h += Math.max(0, d - 24) * 0.05;
    return Math.max(-2, h);
  }

  private buildTerrain(): void {
    const size = 420;
    const segs = 180;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(0x2a4a28);
    const cB = new THREE.Color(0x3f6b33);
    const cRock = new THREE.Color(0x5a5a52);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      tmp.copy(cA).lerp(cB, Math.min(1, Math.abs(h) * 0.08 + 0.3));
      // rock tint on steep spots
      const n = Math.sin(x * 0.3) * Math.sin(z * 0.3);
      tmp.lerp(cRock, Math.max(0, n) * 0.4);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.computeVertexNormals();
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const terrMat = new THREE.MeshStandardMaterial({
      map: (mat("jungleGround") as THREE.MeshStandardMaterial).map,
      color: 0xffffff,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, terrMat);
    mesh.receiveShadow = true;
    this.root.add(mesh);

    // landing pad flattened detail
    const pad = plane(24, 24, mat("soil"));
    pad.position.y = 0.02;
    pad.rotation.x = 0;
    this.root.add(pad);
  }

  private place(count: number, within: number, minDist: number, padR = 14): [number, number][] {
    const out: [number, number][] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 40) {
      const x = (this.rng.float() * 2 - 1) * within;
      const z = (this.rng.float() * 2 - 1) * within;
      const d = Math.sqrt(x * x + z * z);
      if (d < padR) continue;
      if (this.rng.float() < 0.25 && d < 40) continue; // keep near-landing clear-ish
      // avoid water pool
      const pd = Math.hypot(x - this.poolPos.x, z - this.poolPos.z);
      if (pd < 24) continue;
      let ok = true;
      for (const [px, pz] of out) {
        if (Math.hypot(px - x, pz - z) < minDist) {
          ok = false;
          break;
        }
      }
      if (ok) out.push([x, z]);
    }
    return out;
  }

  private buildVegetation(): void {
    const treePos = this.place(140, 190, 7);
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 8);
    const canopyGeo = new THREE.DodecahedronGeometry(2.2, 0);
    const trunkMat = mat("treeBark");
    const canopyMat = mat("leaf");
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePos.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treePos.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    treePos.forEach(([x, z], i) => {
      const h = this.heightAt(x, z);
      const scale = 0.8 + this.rng.float() * 0.7;
      p.set(x, h + 2.5 * scale, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.float() * 6);
      s.set(scale, scale * 1.3, scale);
      m4.compose(p, q, s);
      trunks.setMatrixAt(i, m4);
      p.y = h + 5.2 * scale;
      s.set(scale, scale, scale);
      m4.compose(p, q, s);
      canopies.setMatrixAt(i, m4);
    });
    trunks.castShadow = true;
    canopies.castShadow = true;
    this.root.add(trunks, canopies);
    // tree trunk collision (solid, walkable around)
    for (const [x, z] of treePos) {
      const h = this.heightAt(x, z);
      this.collision.addBox(x - 0.3, h, z - 0.3, x + 0.3, h + 4, z + 0.3);
    }

    // glowing flora
    const glowPos = this.place(90, 170, 6);
    const stemGeo = new THREE.CylinderGeometry(0.04, 0.06, 1.2, 6);
    const headGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const stemMat = mat("plant");
    const headMat = emissiveSurface(0x66ff99, 1.5);
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, glowPos.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, glowPos.length);
    glowPos.forEach(([x, z], i) => {
      const h = this.heightAt(x, z);
      const sc = 0.6 + this.rng.float() * 0.7;
      p.set(x, h + 0.6 * sc, z);
      q.identity();
      s.set(1, sc, 1);
      m4.compose(p, q, s);
      stems.setMatrixAt(i, m4);
      p.y = h + 1.2 * sc;
      s.set(sc, sc, sc);
      m4.compose(p, q, s);
      heads.setMatrixAt(i, m4);
    });
    this.root.add(stems, heads);

    // ferns
    const fernPos = this.place(200, 200, 3);
    const fernGeo = new THREE.ConeGeometry(0.5, 1.6, 6);
    const fernMat = tinted("leaf", 0x2f7a4a);
    const ferns = new THREE.InstancedMesh(fernGeo, fernMat, fernPos.length);
    fernPos.forEach(([x, z], i) => {
      const h = this.heightAt(x, z);
      const sc = 0.6 + this.rng.float() * 0.9;
      p.set(x, h + 0.8 * sc, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.float() * 6);
      s.set(sc, sc * 1.4, sc);
      m4.compose(p, q, s);
      ferns.setMatrixAt(i, m4);
    });
    this.root.add(ferns);

    // grass tufts
    const grassPos = this.place(600, 210, 1.2, 10);
    const grassGeo = new THREE.ConeGeometry(0.08, 0.5, 5);
    const grassMat = tinted("leaf", 0x4fae5a);
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassPos.length);
    grassPos.forEach(([x, z], i) => {
      const h = this.heightAt(x, z);
      const sc = 0.5 + this.rng.float() * 0.7;
      p.set(x, h + 0.25 * sc, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.float() * 6);
      s.set(sc, sc, sc);
      m4.compose(p, q, s);
      grass.setMatrixAt(i, m4);
    });
    this.root.add(grass);
  }

  private buildRocks(): void {
    const rockPos = this.place(70, 180, 6);
    const geo = new THREE.DodecahedronGeometry(1, 1);
    const rockMat = mat("rock");
    const rocks = new THREE.InstancedMesh(geo, rockMat, rockPos.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    rockPos.forEach(([x, z], i) => {
      const h = this.heightAt(x, z);
      const sc = 0.5 + this.rng.float() * 1.8;
      p.set(x, h + sc * 0.3, z);
      q.setFromEuler(new THREE.Euler(this.rng.float() * 2, this.rng.float() * 6, this.rng.float() * 2));
      s.set(sc, sc * 0.7, sc);
      m4.compose(p, q, s);
      rocks.setMatrixAt(i, m4);
    });
    rocks.castShadow = true;
    this.root.add(rocks);
  }

  private buildRuins(): void {
    const ruins = new THREE.Group();
    const stoneMat = mat("ruin");
    const glowMat = emissiveSurface(0x66d9ff, 1.2);
    const base = new THREE.Vector3(-60, 0, -48);
    // monoliths
    for (let i = 0; i < 8; i++) {
      const h = 2.5 + this.rng.float() * 4;
      const m = box(1.4, h, 1.4, stoneMat);
      const x = base.x + (this.rng.float() - 0.5) * 24;
      const z = base.z + (this.rng.float() - 0.5) * 20;
      const th = this.heightAt(x, z);
      m.position.set(x, th + h / 2, z);
      m.rotation.y = this.rng.float() * 6;
      ruins.add(m);
      // carved glowing symbols
      const sym = plane(0.8, 1.2, glowMat);
      sym.position.set(x + 0.72, th + h * 0.6, z);
      sym.rotation.y = -Math.PI / 2;
      ruins.add(sym);
      // register collision
      this.collision.addBox(x - 0.7, th, z - 0.7, x + 0.7, th + h, z + 0.7);
    }
    // broken arch
    for (const [sx, sz] of [
      [base.x - 4, base.z],
      [base.x + 4, base.z],
    ] as const) {
      const th = this.heightAt(sx, sz);
      const col = box(1.2, 6, 1.2, stoneMat);
      col.position.set(sx, th + 3, sz);
      col.rotation.z = 0.1;
      ruins.add(col);
    }
    const thC = this.heightAt(base.x, base.z);
    const archTop = box(10, 1.5, 1.2, stoneMat);
    archTop.position.set(base.x, thC + 6.3, base.z);
    archTop.rotation.z = 0.04;
    ruins.add(archTop);
    this.root.add(ruins);
  }

  private buildWaterfall(): void {
    const wf = new THREE.Group();
    const pos = this.poolPos.clone();
    const cliff = new THREE.Group();
    // cliff/rock wall behind the waterfall
    const rock1 = cone(8, 14, mat("rock"), 8);
    rock1.position.set(pos.x - 10, 6, pos.z + 2);
    cliff.add(rock1);
    const rock2 = cone(7, 12, mat("rock"), 8);
    rock2.position.set(pos.x + 8, 5, pos.z);
    cliff.add(rock2);
    const top = roundedBox(26, 4, 10, 1, mat("rock"));
    top.position.set(pos.x, 8, pos.z + 4);
    cliff.add(top);
    this.root.add(cliff);

    // water plane (falling sheet) — animated
    const waterGeo = new THREE.PlaneGeometry(5, 9, 1, 20);
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform float time; varying vec2 vUv;
        void main(){
          float n = sin(vUv.x*20.0 + time*8.0)*0.5 + sin(vUv.x*40.0 - time*12.0)*0.3;
          vec3 col = mix(vec3(0.3,0.8,0.9), vec3(0.1,0.5,0.7), n*0.5+0.5);
          gl_FragColor = vec4(col, 0.75);
        }
      `,
    });
    const sheet = new THREE.Mesh(waterGeo, waterMat);
    sheet.position.set(pos.x, 8, pos.z);
    sheet.rotation.x = 0;
    this.root.add(sheet);
    void wf;

    // glowing pool (emissive disc)
    const pool = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.MeshStandardMaterial({ color: 0x1a6b6b, emissive: 0x39c2a0, emissiveIntensity: 0.9, roughness: 0.2 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(pos.x, this.heightAt(pos.x, pos.z) + 0.2, pos.z);
    this.root.add(pool);

    // mist ring
    const mistGeo = new THREE.SphereGeometry(4, 16, 16);
    const mistMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ee, transparent: true, opacity: 0.12, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(mistGeo, mistMat);
      const a = (i / 10) * Math.PI * 2;
      m.position.set(pos.x + Math.cos(a) * 9, 1.5 + this.rng.float(), pos.z + Math.sin(a) * 9);
      m.scale.set(1.5, 0.7, 1.5);
      this.root.add(m);
    }
  }

  private buildParticles(): void {
    // spores
    const n = 500;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (this.rng.float() - 0.5) * 300;
      pos[i * 3 + 1] = 1 + this.rng.float() * 14;
      pos[i * 3 + 2] = (this.rng.float() - 0.5) * 300;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const sporeMat = new THREE.PointsMaterial({ color: 0xaaffcc, size: 0.18, transparent: true, opacity: 0.8, depthWrite: false });
    this.sporeParticles = new THREE.Points(geo, sporeMat);
    this.sporeParticles.userData.seed = new Float32Array(n).map(() => Math.random() * 100);
    this.root.add(this.sporeParticles);

    // waterfall droplets
    const wn = 220;
    const wgeo = new THREE.BufferGeometry();
    const wpos = new Float32Array(wn * 3);
    const wseed = new Float32Array(wn);
    for (let i = 0; i < wn; i++) {
      wpos[i * 3] = this.poolPos.x + (this.rng.float() - 0.5) * 5;
      wpos[i * 3 + 1] = 8;
      wpos[i * 3 + 2] = this.poolPos.z;
      wseed[i] = this.rng.float() * 5;
    }
    wgeo.setAttribute("position", new THREE.BufferAttribute(wpos, 3));
    const wmat = new THREE.PointsMaterial({ color: 0xbfeaff, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false });
    this.waterfallParticles = new THREE.Points(wgeo, wmat);
    this.waterfallParticles.userData.seed = wseed;
    this.root.add(this.waterfallParticles);

    // pool glow motes
    const pn = 300;
    const pgeo = new THREE.BufferGeometry();
    const ppos = new Float32Array(pn * 3);
    const pseed = new Float32Array(pn);
    for (let i = 0; i < pn; i++) {
      const a = this.rng.float() * Math.PI * 2;
      const r = this.rng.float() * 12;
      ppos[i * 3] = this.poolPos.x + Math.cos(a) * r;
      ppos[i * 3 + 1] = this.rng.float() * 2.5;
      ppos[i * 3 + 2] = this.poolPos.z + Math.sin(a) * r;
      pseed[i] = this.rng.float() * 10;
    }
    pgeo.setAttribute("position", new THREE.BufferAttribute(ppos, 3));
    const pmat = new THREE.PointsMaterial({ color: 0x66ffcc, size: 0.1, transparent: true, opacity: 0.8, depthWrite: false });
    this.poolParticles = new THREE.Points(pgeo, pmat);
    this.poolParticles.userData.seed = pseed;
    this.root.add(this.poolParticles);
  }

  private buildLighting(): void {
    // accent lights around pool and ruins
    const pl = new THREE.PointLight(0x39c2a0, 8, 40, 2);
    pl.position.set(this.poolPos.x, 4, this.poolPos.z);
    this.root.add(pl);
    const rl = new THREE.PointLight(0x66d9ff, 4, 30, 2);
    rl.position.set(-60, 5, -48);
    this.root.add(rl);
  }

  update(dt: number): void {
    this.time += dt;
    // spores drift
    const pos = this.sporeParticles.geometry.attributes.position as THREE.BufferAttribute;
    const seed = this.sporeParticles.userData.seed;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * 0.3;
      const x = pos.getX(i) + Math.sin(this.time * 0.5 + i) * dt * 0.2;
      if (y > 16) y = 1;
      pos.setXYZ(i, x, y, pos.getZ(i));
      void seed;
    }
    pos.needsUpdate = true;
    // waterfall droplets fall
    const wpos = this.waterfallParticles.geometry.attributes.position as THREE.BufferAttribute;
    const wseed = this.waterfallParticles.userData.seed;
    for (let i = 0; i < wpos.count; i++) {
      let y = wpos.getY(i) - dt * 9;
      if (y < 0.5) y = 8;
      wpos.setY(i, y);
      void wseed;
    }
    wpos.needsUpdate = true;
  }
}
