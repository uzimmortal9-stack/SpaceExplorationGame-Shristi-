import * as THREE from 'three';
import type { CelestialTarget } from '../types';
import { Random } from '../core/Random';
import { COLORS, emissive, glass, metal } from './materials';

export class SpaceEnvironment {
  readonly root = new THREE.Group();
  readonly starRoot = new THREE.Group();
  readonly targets: CelestialTarget[] = [];
  readonly directionalLight: THREE.DirectionalLight;
  private celestialRoot = new THREE.Group();
  private targetMeshes: THREE.Mesh[] = [];
  private atmospheres: THREE.Mesh[] = [];
  private starPoints: THREE.Points;
  private asteroidBelt!: THREE.InstancedMesh;
  private elapsed = 0;
  private selected = 0;

  constructor(scene: THREE.Scene, quality: 'low' | 'medium' | 'high') {
    this.root.name = 'Local Solar System';
    this.starRoot.name = 'Infinite Star Field';
    this.root.add(this.celestialRoot);
    scene.add(this.starRoot, this.root);
    this.starPoints = this.buildStars(quality === 'high' ? 6200 : quality === 'medium' ? 3600 : 1800);
    this.starRoot.add(this.starPoints);
    this.buildSun();
    this.buildSystem(quality);
    this.directionalLight = new THREE.DirectionalLight(0xd7eaff, 2.5);
    this.directionalLight.position.set(-8000, 5000, -10000);
    this.directionalLight.target.position.set(0, 0, 0);
    scene.add(this.directionalLight, this.directionalLight.target);
  }

  private buildStars(count: number): THREE.Points {
    const random = new Random(0xa57a3);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color(0xd7f5ff), new THREE.Color(0x8bbcff), new THREE.Color(0xffd6a1), new THREE.Color(0xbca7ff)];
    for (let i = 0; i < count; i += 1) {
      const radius = random.range(90000, 190000);
      const theta = random.range(0, Math.PI * 2);
      const phi = Math.acos(random.range(-1, 1));
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const color = random.pick(palette).clone().multiplyScalar(random.range(0.45, 1));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 45, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false }));
  }

  private buildSun(): void {
    const sunMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, colorA: { value: new THREE.Color(0xff6a18) }, colorB: { value: new THREE.Color(0xfff1ad) } },
      vertexShader: `varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        uniform float time; uniform vec3 colorA; uniform vec3 colorB; varying vec3 vPos;
        float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        void main(){float n=hash(floor(normalize(vPos)*34.0+time*0.7));float bands=sin(vPos.y*.012+time*1.7)*.12;vec3 c=mix(colorA,colorB,.54+n*.35+bands);gl_FragColor=vec4(c,1.0);}
      `,
      toneMapped: false,
    });
    sunMaterial.userData.isSun = true;
    const sun = new THREE.Mesh(new THREE.SphereGeometry(6200, 42, 28), sunMaterial);
    sun.name = 'Helios — G2V Star';
    sun.position.set(-62000, 14000, -98000);
    const coronaMaterial = emissive(0xff9b35, 2.5);
    coronaMaterial.transparent = true;
    coronaMaterial.opacity = 0.15;
    coronaMaterial.side = THREE.BackSide;
    const corona = new THREE.Mesh(new THREE.SphereGeometry(7500, 32, 20), coronaMaterial);
    sun.add(corona);
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture('#fff3b0', '#ff6818'), color: 0xffb04f, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    flare.scale.set(22000, 22000, 1);
    sun.add(flare);
    for (let i = 0; i < 12; i += 1) {
      const ray = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture('#ffb454', 'transparent'), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      ray.scale.set(16000 + i * 1700, 2400, 1);
      ray.material.rotation = (i / 12) * Math.PI * 2;
      sun.add(ray);
    }
    this.celestialRoot.add(sun);
  }

  private radialTexture(inner: string, outer: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(128, 128, 1, 128, 128, 128);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(0.28, inner);
    gradient.addColorStop(1, outer);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildSystem(quality: 'low' | 'medium' | 'high'): void {
    const definitions: Array<CelestialTarget & { rings?: boolean; moon?: boolean }> = [
      { name: 'KHEPRI', subtitle: 'SCORCHED INNER WORLD', color: 0xc16d48, radius: 1450, distance: 28, position: new THREE.Vector3(-14000, -1400, -24000), fuelCost: 5 },
      { name: 'TALOS', subtitle: 'MINERAL MOON', color: 0x8498a5, radius: 1080, distance: 41, position: new THREE.Vector3(24000, 3400, -31000), fuelCost: 7, moon: true },
      { name: 'CAELUM', subtitle: 'RINGED GAS GIANT', color: 0xd19d72, radius: 4100, distance: 96, position: new THREE.Vector3(53000, -7200, 62000), fuelCost: 13, rings: true },
      { name: 'NEMORA IV', subtitle: 'VERDANT SIGNAL ORIGIN', color: 0x2c9c79, radius: 3200, distance: 128, position: new THREE.Vector3(-71000, 9000, -79000), fuelCost: 18, isDestination: true, moon: true },
      { name: 'ORISON', subtitle: 'CRYOVOLCANIC MOON', color: 0x93cdf0, radius: 820, distance: 142, position: new THREE.Vector3(-76000, 11800, -73500), fuelCost: 20, moon: true },
    ];
    this.targets.push(...definitions);

    definitions.forEach((definition, index) => {
      const segments = quality === 'high' ? 48 : quality === 'medium' ? 32 : 20;
      const material = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.82, metalness: 0.02 });
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>\nfloat band = sin(vNormal.y * ${18 + index * 5}.0 + vNormal.x * 4.0) * .08; diffuseColor.rgb += band;`,
        );
      };
      const planet = new THREE.Mesh(new THREE.SphereGeometry(definition.radius, segments, Math.max(16, segments / 2)), material);
      planet.name = definition.name;
      planet.position.copy(definition.position);
      this.celestialRoot.add(planet);
      this.targetMeshes.push(planet);

      const atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: index === 3 ? 0x52d9ba : index === 2 ? 0xe8b67a : 0x70b4e2,
        transparent: true,
        opacity: index === 3 ? 0.12 : 0.065,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(definition.radius * 1.065, segments, Math.max(16, segments / 2)), atmosphereMaterial);
      planet.add(atmosphere);
      this.atmospheres.push(atmosphere);

      if (definition.rings) {
        const rings = new THREE.Mesh(new THREE.RingGeometry(definition.radius * 1.35, definition.radius * 2.25, 96), new THREE.MeshStandardMaterial({ color: 0xc6b19e, side: THREE.DoubleSide, transparent: true, opacity: 0.58, roughness: 0.75 }));
        rings.rotation.x = Math.PI / 2.35;
        planet.add(rings);
      }
      if (definition.moon && !definition.isDestination) {
        const moon = new THREE.Mesh(new THREE.SphereGeometry(definition.radius * 0.17, 18, 12), metal(0x9eaaa9, 0.88, 0.02));
        moon.position.set(definition.radius * 1.8, definition.radius * 0.35, 0);
        planet.add(moon);
      }

      // Visible orbital paths around the local star use compressed illustrative scale.
      const orbitRadius = definition.position.length();
      const points = Array.from({ length: 128 }, (_, p) => {
        const angle = (p / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * orbitRadius, definition.position.y * 0.2, Math.sin(angle) * orbitRadius);
      });
      const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: index === this.selected ? COLORS.cyan : 0x244052, transparent: true, opacity: 0.22 }));
      this.celestialRoot.add(orbit);
    });
    this.buildAsteroids(quality === 'high' ? 540 : quality === 'medium' ? 260 : 120);
  }

  private buildAsteroids(count: number): void {
    const random = new Random(0xb317);
    const geometry = new THREE.IcosahedronGeometry(45, 1);
    const material = metal(0x4d514d, 0.94, 0.08);
    this.asteroidBelt = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      const angle = random.range(0, Math.PI * 2);
      const radius = random.range(36000, 41000);
      dummy.position.set(Math.cos(angle) * radius, random.range(-1800, 1800), Math.sin(angle) * radius);
      dummy.rotation.set(random.range(0, 6), random.range(0, 6), random.range(0, 6));
      dummy.scale.set(random.range(0.2, 2.2), random.range(0.25, 1.3), random.range(0.2, 1.7));
      dummy.updateMatrix();
      this.asteroidBelt.setMatrixAt(i, dummy.matrix);
    }
    this.asteroidBelt.instanceMatrix.needsUpdate = true;
    this.celestialRoot.add(this.asteroidBelt);
  }

  selectTarget(index: number): CelestialTarget {
    this.selected = ((index % this.targets.length) + this.targets.length) % this.targets.length;
    this.targetMeshes.forEach((mesh, meshIndex) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.emissive.setHex(meshIndex === this.selected ? 0x123b42 : 0x000000);
      material.emissiveIntensity = meshIndex === this.selected ? 0.8 : 0;
    });
    return this.targets[this.selected];
  }

  get selectedTarget(): CelestialTarget {
    return this.targets[this.selected];
  }

  setObserver(position: THREE.Vector3, orientation: THREE.Quaternion): void {
    const inverse = orientation.clone().invert();
    this.celestialRoot.quaternion.copy(inverse);
    this.celestialRoot.position.copy(position).multiplyScalar(-1).applyQuaternion(inverse);
    this.starRoot.quaternion.copy(inverse);
  }

  placeObserverNearTarget(target: CelestialTarget): THREE.Vector3 {
    return target.position.clone().add(new THREE.Vector3(0, target.radius * 0.18, target.radius * 2.8));
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
    this.starRoot.visible = visible;
  }

  update(delta: number): void {
    this.elapsed += delta;
    this.targetMeshes.forEach((mesh, index) => {
      mesh.rotation.y += delta * (0.008 + index * 0.002);
    });
    this.atmospheres.forEach((mesh, index) => (mesh.rotation.y -= delta * (0.006 + index * 0.001)));
    const sun = this.celestialRoot.getObjectByName('Helios — G2V Star') as THREE.Mesh | undefined;
    if (sun) {
      sun.rotation.y += delta * 0.012;
      const material = sun.material as THREE.ShaderMaterial;
      material.uniforms.time.value = this.elapsed;
    }
    this.asteroidBelt.rotation.y += delta * 0.00012;
  }
}
