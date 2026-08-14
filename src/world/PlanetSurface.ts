import * as THREE from 'three';
import type { CollisionSystem } from './CollisionSystem';
import type { AmbientSystem } from '../systems/AmbientSystem';
import type { Quality } from '../types';
import { Random } from '../core/Random';
import { normalizeGeometryPivot, normalizedBox, normalizedCylinder, snapToSurface } from './geometryAlignment';
import { COLORS, emissive, glass, matte, metal, rockMat } from './materials';
import { rock as rockMaps } from '../core/PBRMaps';

export class PlanetSurface {
  readonly root = new THREE.Group();
  readonly ground = new THREE.Group();
  readonly terrain: THREE.Mesh;
  readonly terrainSize = 440;
  visible = false;
  private collision: CollisionSystem;
  private ambient: AmbientSystem;
  private random = new Random(0x4e454d4f);
  private raycaster = new THREE.Raycaster();
  private spores!: THREE.Points;
  private mist!: THREE.Points;
  private waterMaterials: THREE.ShaderMaterial[] = [];
  private foliageMaterials: THREE.MeshStandardMaterial[] = [];
  private elapsed = 0;
  private collidableObjects: Array<{ object: THREE.Object3D; radius: number }> = [];

  constructor(scene: THREE.Scene, collision: CollisionSystem, ambient: AmbientSystem, quality: Quality) {
    this.collision = collision;
    this.ambient = ambient;
    this.root.name = 'Nemora IV — Procedural Jungle';
    this.ground.name = 'Nemora IV — Ground Detail';
    this.root.visible = false;
    this.root.add(this.ground);
    this.terrain = this.buildTerrain(quality);
    this.ground.add(this.terrain);
    scene.add(this.root);
    this.root.updateMatrixWorld(true);
    this.buildSky();
    this.buildVegetation(quality);
    this.buildRocks(quality);
    this.buildRuins();
    this.buildWaterfall();
    this.buildAtmosphere(quality);
    this.buildClearPath();
    this.root.updateMatrixWorld(true);
    this.registerSurfaceColliders();
  }

  /** Offsets the ground vertically (metres) so the landing descent reads as motion. */
  setDescent(offsetY: number): void {
    this.ground.position.y = offsetY;
  }

  terrainHeightAt = (x: number, z: number): number => {
    // The landing pad is mathematically flattened and the ramp ends exactly on it.
    if (Math.abs(x) < 28 && z > -76 && z < 92) return -4.2;
    const pathDistance = this.distanceToPath(x, z, [new THREE.Vector2(0, 82), new THREE.Vector2(3, 110), new THREE.Vector2(-15, 132), new THREE.Vector2(18, 157)]);
    const base = -4.0
      + Math.sin(x * 0.035) * 2.4
      + Math.cos(z * 0.027) * 2.1
      + Math.sin((x + z) * 0.055) * 0.85
      + Math.sin(Math.hypot(x - 80, z - 160) * 0.045) * 1.15;
    return pathDistance < 5.5 ? THREE.MathUtils.lerp(base, -3.7 + Math.sin(z * 0.06) * 0.3, 0.72) : base;
  };

  terrainNormalAt = (x: number, z: number): THREE.Vector3 => {
    const epsilon = 0.35;
    const left = this.terrainHeightAt(x - epsilon, z);
    const right = this.terrainHeightAt(x + epsilon, z);
    const front = this.terrainHeightAt(x, z - epsilon);
    const back = this.terrainHeightAt(x, z + epsilon);
    return new THREE.Vector3(left - right, epsilon * 2, front - back).normalize();
  };

  private buildTerrain(quality: Quality): THREE.Mesh {
    const segments = quality === 'high' ? 150 : quality === 'medium' ? 105 : 70;
    const geometry = new THREE.PlaneGeometry(this.terrainSize, this.terrainSize, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const low = new THREE.Color(0x172b25);
    const moss = new THREE.Color(0x315c42);
    const bright = new THREE.Color(0x57894e);
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = this.terrainHeightAt(x, z);
      positions.setY(i, y);
      const normalFactor = THREE.MathUtils.clamp((y + 8) / 13, 0, 1);
      const color = low.clone().lerp(moss, normalFactor).lerp(bright, Math.max(0, Math.sin(x * 0.11 + z * 0.07)) * 0.18);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.02 });
    const detail = rockMaps(0xcfcfcf, { seed: 0x7e41a11 });
    material.normalMap = detail.normalMap;
    material.roughnessMap = detail.roughnessMap;
    material.normalScale = new THREE.Vector2(0.75, 0.75);
    const terrain = new THREE.Mesh(geometry, material);
    terrain.name = 'Nemora terrain collision surface';
    terrain.receiveShadow = true;
    return terrain;
  }

  private buildSky(): void {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x341b68) }, horizon: { value: new THREE.Color(0xd7508f) }, bottom: { value: new THREE.Color(0x162847) } },
      vertexShader: 'varying vec3 vWorld; void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 top;uniform vec3 horizon;uniform vec3 bottom;varying vec3 vWorld;void main(){float h=normalize(vWorld).y;vec3 c=h>0.0?mix(horizon,top,pow(h,.55)):mix(horizon,bottom,-h);gl_FragColor=vec4(c,1.0);}',
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(520, 36, 22), material);
    dome.position.y = 25;
    this.root.add(dome);

    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture(0xfff4b0, 0xff5ca8), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    sun.position.set(-145, 190, -250);
    sun.scale.set(55, 55, 1);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(19, 24, 16), rockMat(0x98b7d9, 0.9));
    moon.position.set(180, 125, -270);
    const ring = new THREE.Mesh(new THREE.RingGeometry(25, 42, 56), new THREE.MeshBasicMaterial({ color: 0xc6aaff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    ring.rotation.x = Math.PI / 2.5;
    moon.add(ring);
    this.root.add(sun, moon);

    const light = new THREE.DirectionalLight(0xffc5d9, 2.8);
    light.position.set(-110, 180, -90);
    light.target.position.set(10, 0, 120);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -240;
    light.shadow.camera.right = 240;
    light.shadow.camera.top = 240;
    light.shadow.camera.bottom = -240;
    light.shadow.camera.far = 520;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.5;
    this.root.add(light, light.target);
    const fill = new THREE.HemisphereLight(0x916ddd, 0x183423, 1.05);
    this.root.add(fill);
  }

  private radialTexture(inner: number, outer: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(128, 128, 2, 128, 128, 128);
    gradient.addColorStop(0, `#${inner.toString(16).padStart(6, '0')}`);
    gradient.addColorStop(0.25, `#${inner.toString(16).padStart(6, '0')}`);
    gradient.addColorStop(1, `#${outer.toString(16).padStart(6, '0')}00`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private snapObject(object: THREE.Object3D, x: number, z: number, align = false): void {
    object.position.set(x, 45, z);
    this.ground.add(object);
    this.ground.updateMatrixWorld(true);
    snapToSurface(object, [this.terrain], this.raycaster, { alignToNormal: align, epsilon: 0.001, maxDistance: 70 });
  }

  private buildVegetation(quality: Quality): void {
    const treeCount = quality === 'high' ? 105 : quality === 'medium' ? 70 : 42;
    const trunkGeometry = normalizedCylinder(0.72, 1.25, 14, 9);
    const trunkMaterial = rockMat(0x3a2845, 0.95);
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x357853, roughness: 0.78, emissive: 0x123d2c, emissiveIntensity: 0.32 });
    this.foliageMaterials.push(leafMaterial);
    for (let i = 0; i < treeCount; i += 1) {
      let x = this.random.range(-205, 205);
      let z = this.random.range(-190, 210);
      if (Math.abs(x) < 32 && z < 100) { x += x < 0 ? -35 : 35; }
      if (this.distanceToPath(x, z, [new THREE.Vector2(0, 82), new THREE.Vector2(3, 110), new THREE.Vector2(-15, 132), new THREE.Vector2(18, 157)]) < 8) { x += x < 0 ? -13 : 13; }
      const scale = this.random.range(0.7, 1.85);
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.scale.set(scale, scale, scale);
      trunk.rotation.z = this.random.range(-0.08, 0.08);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      tree.add(trunk);
      for (let level = 0; level < 3; level += 1) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry((4.6 - level * 0.6) * scale, 1), leafMaterial);
        crown.castShadow = true;
        crown.scale.y = 0.48;
        crown.position.set(this.random.range(-1, 1), (11.5 + level * 2.3) * scale, this.random.range(-1, 1));
        crown.rotation.y = this.random.range(0, Math.PI);
        tree.add(crown);
      }
      // Root buttresses give the giant trees a grounded, ancient silhouette.
      for (let rootIndex = 0; rootIndex < 5; rootIndex += 1) {
        const root = new THREE.Mesh(normalizedCylinder(0.18, 0.52, 3.2 * scale, 7), trunkMaterial);
        const angle = (rootIndex / 5) * Math.PI * 2;
        root.rotation.z = Math.PI / 2.5;
        root.rotation.y = angle;
        root.position.set(Math.cos(angle) * 1.1 * scale, 0.15, Math.sin(angle) * 1.1 * scale);
        tree.add(root);
      }
      this.snapObject(tree, x, z, false);
      this.collidableObjects.push({ object: tree, radius: 0.9 * scale });
    }

    const plantCount = quality === 'high' ? 650 : quality === 'medium' ? 380 : 180;
    const fernGeometry = normalizeGeometryPivot(new THREE.ConeGeometry(0.38, 1.4, 5), 'floor');
    const fernMaterial = new THREE.MeshStandardMaterial({ color: 0x49a263, roughness: 0.8, emissive: 0x0b2416, emissiveIntensity: 0.22 });
    const ferns = new THREE.InstancedMesh(fernGeometry, fernMaterial, plantCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < plantCount; i += 1) {
      let x = this.random.range(-215, 215);
      let z = this.random.range(-210, 215);
      if (Math.abs(x) < 26 && z > -80 && z < 96) x += x < 0 ? -28 : 28;
      dummy.position.set(x, 40, z);
      this.root.add(dummy);
      this.root.updateMatrixWorld(true);
      snapToSurface(dummy, [this.terrain], this.raycaster, { alignToNormal: true, epsilon: 0.002, maxDistance: 60 });
      this.root.remove(dummy);
      dummy.rotation.y += this.random.range(0, Math.PI * 2);
      const scale = this.random.range(0.45, 2.2);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      ferns.setMatrixAt(i, dummy.matrix);
    }
    ferns.instanceMatrix.needsUpdate = true;
    this.ground.add(ferns);

    const glowCount = quality === 'high' ? 160 : 90;
    const glowGeometry = normalizeGeometryPivot(new THREE.SphereGeometry(0.32, 9, 6), 'floor');
    const glowMaterial = emissive(0x74ffcf, 1.45);
    const glowPlants = new THREE.InstancedMesh(glowGeometry, glowMaterial, glowCount);
    for (let i = 0; i < glowCount; i += 1) {
      const x = this.random.range(-190, 190);
      const z = this.random.range(82, 205);
      dummy.position.set(x, 40, z);
      this.root.add(dummy);
      this.root.updateMatrixWorld(true);
      snapToSurface(dummy, [this.terrain], this.raycaster, { epsilon: 0.003, maxDistance: 60 });
      this.root.remove(dummy);
      const scale = this.random.range(0.25, 1.15);
      dummy.scale.set(scale * 0.7, scale * 2.5, scale * 0.7);
      dummy.rotation.set(0, this.random.range(0, 6), this.random.range(-0.35, 0.35));
      dummy.updateMatrix();
      glowPlants.setMatrixAt(i, dummy.matrix);
    }
    glowPlants.instanceMatrix.needsUpdate = true;
    this.ground.add(glowPlants);
    this.ambient.pulse(glowMaterial, 1.1, 0.7, 1.1);

    this.buildVines();
    this.buildFungi();
  }

  private buildVines(): void {
    const vineMaterial = new THREE.LineBasicMaterial({ color: 0x4da46f, transparent: true, opacity: 0.62 });
    for (let i = 0; i < 32; i += 1) {
      const x = this.random.range(-180, 180);
      const z = this.random.range(92, 200);
      const y = this.terrainHeightAt(x, z) + this.random.range(9, 22);
      const points = [
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(x + this.random.range(-2, 2), y - 5, z + this.random.range(-2, 2)),
        new THREE.Vector3(x + this.random.range(-3, 3), y - 11, z + this.random.range(-3, 3)),
      ];
      const curvePoints = new THREE.CatmullRomCurve3(points).getPoints(18);
      this.ground.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curvePoints), vineMaterial));
    }
  }

  private buildFungi(): void {
    for (let i = 0; i < 65; i += 1) {
      const group = new THREE.Group();
      const stem = new THREE.Mesh(normalizedCylinder(0.04, 0.08, this.random.range(0.35, 1.1), 7), matte(0xd3c5d9));
      const capMaterial = emissive(this.random.pick([0xff55bd, 0x8c67ff, 0x48e8ff]), 1.1);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(this.random.range(0.12, 0.35), 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), capMaterial);
      cap.position.y = stem.geometry.boundingBox?.max.y ?? 0.8;
      group.add(stem, cap);
      this.snapObject(group, this.random.range(-170, 170), this.random.range(92, 205), false);
      this.ambient.pulse(capMaterial, 0.8, 0.6, this.random.range(0.7, 1.8));
    }
  }

  private buildRocks(quality: Quality): void {
    const count = quality === 'high' ? 120 : 70;
    const material = rockMat(0x33403d, 0.98);
    for (let i = 0; i < count; i += 1) {
      const geometry = normalizeGeometryPivot(new THREE.DodecahedronGeometry(this.random.range(0.45, 2.8), 0), 'floor');
      const rock = new THREE.Mesh(geometry, material);
      rock.scale.set(this.random.range(0.7, 1.6), this.random.range(0.45, 1.25), this.random.range(0.7, 1.7));
      let x = this.random.range(-205, 205);
      const z = this.random.range(-160, 210);
      if (Math.abs(x) < 28 && z < 96) x += x < 0 ? -32 : 32;
      this.snapObject(rock, x, z, true);
      if (rock.scale.length() > 2.3) this.collidableObjects.push({ object: rock, radius: Math.max(rock.scale.x, rock.scale.z) * 0.8 });
    }
  }

  private buildRuins(): void {
    const ruin = new THREE.Group();
    ruin.name = 'The Resonant Ruins';
    const stone = rockMat(0x485552, 0.98);
    const rune = emissive(0x6affda, 1.5);
    const center = new THREE.Vector3(-28, this.terrainHeightAt(-28, 137), 137);
    ruin.position.copy(center);
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      const pillar = new THREE.Mesh(normalizedBox(1.1, this.random.range(5.5, 10.5), 1.25, 'floor'), stone);
      pillar.position.set(Math.cos(angle) * 8, 0, Math.sin(angle) * 8);
      pillar.rotation.y = angle + this.random.range(-0.18, 0.18);
      pillar.rotation.z = this.random.range(-0.08, 0.08);
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 2.2), rune);
      mark.position.set(0, 2.2, 0.631);
      pillar.add(mark);
      ruin.add(pillar);
      this.collidableObjects.push({ object: pillar, radius: 0.8 });
    }
    for (const side of [-1, 1]) {
      const archPost = new THREE.Mesh(normalizedBox(1.0, 7.5, 1.3, 'floor'), stone);
      archPost.position.set(side * 4.7, 0, -8.5);
      ruin.add(archPost);
      const archTop = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.65, 8, 28, Math.PI), stone);
      archTop.position.set(0, 7.5, -8.5);
      archTop.rotation.z = 0;
      ruin.add(archTop);
    }
    const monolithMaterial = metal(0x283b3b, 0.5, 0.28);
    const monolith = new THREE.Mesh(normalizedBox(2.2, 12, 1.6, 'floor'), monolithMaterial);
    monolith.position.set(0, 0, 0);
    const runeCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 1), rune);
    runeCore.position.set(0, 6.2, 0.85);
    monolith.add(runeCore);
    ruin.add(monolith);
    this.ambient.float(runeCore, 0.22, 1.2);
    this.ambient.spin(runeCore, new THREE.Vector3(0, 1, 0), 0.45);
    this.ambient.pulse(rune, 1.1, 1.2, 1.45);
    this.ground.add(ruin);
    this.collidableObjects.push({ object: monolith, radius: 1.5 });
  }

  private buildWaterfall(): void {
    const poolX = 22;
    const poolZ = 161;
    const baseY = this.terrainHeightAt(poolX, poolZ) + 0.2;
    const poolMaterial = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, base: { value: new THREE.Color(0x18d4c2) }, glow: { value: new THREE.Color(0xa37bff) } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.z+=sin(position.x*.35+position.y*.27)*.08;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
      fragmentShader: 'uniform float time;uniform vec3 base;uniform vec3 glow;varying vec2 vUv;void main(){float w=sin(vUv.x*42.0+time*2.0)+sin(vUv.y*31.0-time*1.4);float edge=smoothstep(.5,.05,distance(vUv,vec2(.5)));vec3 c=mix(base,glow,w*.25+.35);gl_FragColor=vec4(c,.58+edge*.24);}',
    });
    this.waterMaterials.push(poolMaterial);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(13, 64), poolMaterial);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(poolX, baseY, poolZ);
    this.ground.add(pool);

    const cliffStone = rockMat(0x2d3838, 0.98);
    for (let i = 0; i < 20; i += 1) {
      const rock = new THREE.Mesh(normalizeGeometryPivot(new THREE.DodecahedronGeometry(this.random.range(1.8, 4.8), 0), 'floor'), cliffStone);
      rock.scale.set(this.random.range(0.8, 1.8), this.random.range(1.0, 2.8), this.random.range(0.7, 1.5));
      rock.position.set(poolX - 10 + (i % 5) * 4.5, baseY + Math.floor(i / 5) * 3.3, poolZ + 13 + this.random.range(-1, 1));
      this.ground.add(rock);
      this.collidableObjects.push({ object: rock, radius: 1.6 });
    }

    const fallMaterial = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.z+=sin(position.y*1.7+position.x*2.1)*.13;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
      fragmentShader: 'uniform float time;varying vec2 vUv;void main(){float s=sin(vUv.x*45.0+vUv.y*12.0-time*7.0)*.5+.5;float foam=pow(s,4.0);gl_FragColor=vec4(mix(vec3(.1,.65,.8),vec3(.75,1.,1.),foam),.32+foam*.52);}',
    });
    this.waterMaterials.push(fallMaterial);
    const waterfall = new THREE.Mesh(new THREE.PlaneGeometry(9, 18, 18, 28), fallMaterial);
    waterfall.position.set(poolX, baseY + 11, poolZ + 11.7);
    this.ground.add(waterfall);

    const glow = new THREE.PointLight(0x36ffd2, 22, 48, 1.8);
    glow.position.set(poolX, baseY + 2.2, poolZ);
    this.ground.add(glow);
  }

  private buildAtmosphere(quality: Quality): void {
    const sporeCount = quality === 'high' ? 1600 : quality === 'medium' ? 850 : 420;
    const positions = new Float32Array(sporeCount * 3);
    const colors = new Float32Array(sporeCount * 3);
    for (let i = 0; i < sporeCount; i += 1) {
      positions[i * 3] = this.random.range(-205, 205);
      positions[i * 3 + 1] = this.random.range(-1, 36);
      positions[i * 3 + 2] = this.random.range(-50, 215);
      const color = new THREE.Color(this.random.pick([0x8affd1, 0xff7cd9, 0x8ac8ff]));
      colors.set([color.r, color.g, color.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.spores = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.17, vertexColors: true, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ground.add(this.spores);

    const mistCount = quality === 'high' ? 380 : 180;
    const mistPos = new Float32Array(mistCount * 3);
    for (let i = 0; i < mistCount; i += 1) {
      const angle = this.random.range(0, Math.PI * 2);
      const radius = this.random.range(0, 16);
      mistPos.set([22 + Math.cos(angle) * radius, this.terrainHeightAt(22, 161) + this.random.range(0, 9), 161 + Math.sin(angle) * radius], i * 3);
    }
    const mistGeometry = new THREE.BufferGeometry();
    mistGeometry.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
    this.mist = new THREE.Points(mistGeometry, new THREE.PointsMaterial({ size: 1.5, color: 0xb8faff, transparent: true, opacity: 0.18, depthWrite: false }));
    this.ground.add(this.mist);

    // Volumetric-style light cones approximate canopy god rays without post-process cost.
    const rayMaterial = new THREE.MeshBasicMaterial({ color: 0xffd5de, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 18; i += 1) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(this.random.range(3, 7), this.random.range(30, 55), 10, 1, true), rayMaterial);
      ray.position.set(this.random.range(-145, 145), 24, this.random.range(95, 205));
      ray.rotation.z = this.random.range(-0.18, 0.18);
      this.ground.add(ray);
    }

    const groundFog = new THREE.Mesh(new THREE.PlaneGeometry(420, 270), new THREE.MeshBasicMaterial({ color: 0x5c77a0, transparent: true, opacity: 0.035, depthWrite: false }));
    groundFog.rotation.x = -Math.PI / 2;
    groundFog.position.set(0, -1, 80);
    this.ground.add(groundFog);
  }

  private buildClearPath(): void {
    const pathMaterial = rockMat(0x40523d, 0.98);
    const points = [new THREE.Vector2(0, 84), new THREE.Vector2(4, 108), new THREE.Vector2(-14, 131), new THREE.Vector2(18, 158)];
    for (let segment = 0; segment < points.length - 1; segment += 1) {
      const start = points[segment];
      const end = points[segment + 1];
      const length = start.distanceTo(end);
      const angle = Math.atan2(end.x - start.x, end.y - start.y);
      const path = new THREE.Mesh(normalizedBox(5.2, 0.04, length, 'floor'), pathMaterial);
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      path.position.set(midpoint.x, this.terrainHeightAt(midpoint.x, midpoint.y) + 0.015, midpoint.y);
      path.rotation.y = angle;
      this.ground.add(path);
    }
  }

  private registerSurfaceColliders(): void {
    for (let index = 0; index < this.collidableObjects.length; index += 1) {
      const entry = this.collidableObjects[index];
      const world = entry.object.getWorldPosition(new THREE.Vector3());
      const bounds = new THREE.Box3().setFromObject(entry.object);
      this.collision.addCylinder(`surface:major:${index}`, world, entry.radius, bounds.min.y, bounds.max.y);
    }
  }

  private distanceToPath(x: number, z: number, points: THREE.Vector2[]): number {
    let minimum = Infinity;
    const p = new THREE.Vector2(x, z);
    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i];
      const end = points[i + 1];
      const direction = end.clone().sub(start);
      const t = THREE.MathUtils.clamp(p.clone().sub(start).dot(direction) / direction.lengthSq(), 0, 1);
      minimum = Math.min(minimum, p.distanceTo(start.clone().addScaledVector(direction, t)));
    }
    return minimum;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.visible = visible;
    if (visible) {
      this.collision.terrainHeight = (x, z) => {
        const halfWidth = z < -50.8 ? 10.55 : z < 61.5 ? 15.15 : 10.75;
        if (Math.abs(x) < halfWidth && z > -65 && z < 77.6) return 0; // enclosed ship floor only
        if (Math.abs(x) < 2.05 && z >= 77.4 && z <= 86.4) return -(z - 77.4) * (4.2 / 9); // ramp slope
        return this.terrainHeightAt(x, z);
      };
      this.collision.terrainNormal = this.terrainNormalAt;
      for (const collider of this.collision.cylinders) if (collider.id.startsWith('surface:')) collider.enabled = true;
    } else {
      this.collision.terrainHeight = null;
      this.collision.terrainNormal = null;
      for (const collider of this.collision.cylinders) if (collider.id.startsWith('surface:')) collider.enabled = false;
      this.ground.position.y = 0;
    }
  }

  update(delta: number): void {
    if (!this.visible) return;
    this.elapsed += delta;
    this.spores.rotation.y += delta * 0.004;
    this.spores.position.y = Math.sin(this.elapsed * 0.18) * 0.8;
    this.mist.rotation.y -= delta * 0.014;
    for (const material of this.waterMaterials) material.uniforms.time.value = this.elapsed;
    for (const material of this.foliageMaterials) material.emissiveIntensity = 0.25 + Math.sin(this.elapsed * 0.35) * 0.08;
  }
}
