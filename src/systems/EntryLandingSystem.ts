import * as THREE from 'three';
import type { FlightSystem } from './FlightSystem';
import type { ShipExterior } from '../world/ShipExterior';
import type { AudioEngine } from '../core/AudioEngine';
import type { GameSettings } from '../types';
import { smoothstep, easeInOutCubic } from '../core/Tween';

export type EntryPhase = 'idle' | 'plasma' | 'clouds' | 'gear-hold' | 'landing' | 'complete';

export class EntryLandingSystem {
  readonly root = new THREE.Group();
  phase: EntryPhase = 'idle';
  progress = 0;
  onPhase?: (phase: EntryPhase, progress: number) => void;
  onComplete?: () => void;
  private flight: FlightSystem;
  private exterior: ShipExterior;
  private audio: AudioEngine;
  private settings: GameSettings;
  private plasma: THREE.Mesh;
  private clouds: THREE.Points;
  private dustRing: THREE.Mesh;
  private timer = 0;
  private camera: THREE.Camera;
  private initialFov = 68;

  constructor(scene: THREE.Scene, flight: FlightSystem, exterior: ShipExterior, audio: AudioEngine, settings: GameSettings) {
    this.flight = flight;
    this.exterior = exterior;
    this.audio = audio;
    this.settings = settings;
    this.camera = flight.activeCamera;
    this.root.name = 'Atmospheric Entry Effects';
    this.plasma = this.buildPlasma();
    this.clouds = this.buildClouds();
    this.dustRing = this.buildDustRing();
    this.root.add(this.plasma, this.clouds);
    scene.add(this.root, this.dustRing);
    this.root.visible = false;
    this.dustRing.visible = false;
  }

  private buildPlasma(): THREE.Mesh {
    const geometry = new THREE.ConeGeometry(23, 75, 48, 24, true);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, intensity: { value: 0 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.x+=sin(position.z*.7+position.y*1.2)*.35;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
      fragmentShader: 'uniform float time;uniform float intensity;varying vec2 vUv;void main(){float n=sin(vUv.y*75.0-time*14.0+sin(vUv.x*32.0))*0.5+0.5;float e=pow(abs(vUv.x-.5)*2.0,2.0);vec3 c=mix(vec3(1.,.08,.01),vec3(1.,.78,.12),n);gl_FragColor=vec4(c,(n*.28+e*.38)*intensity);}',
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -28;
    return mesh;
  }

  private buildClouds(): THREE.Points {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 10 + Math.random() * 80;
      positions.set([Math.cos(angle) * radius, Math.sin(angle) * radius * 0.45, -20 - Math.random() * 190], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const texture = this.cloudTexture();
    const material = new THREE.PointsMaterial({ map: texture, size: 14, color: 0xe9d4ef, transparent: true, opacity: 0, depthWrite: false, blending: THREE.NormalBlending });
    return new THREE.Points(geometry, material);
  }

  private cloudTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,.8)');
    gradient.addColorStop(0.48, 'rgba(220,220,240,.28)');
    gradient.addColorStop(1, 'rgba(180,190,220,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  private buildDustRing(): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({ color: 0xc5927b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2, 4, 64), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, -4, 8);
    return ring;
  }

  setSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  start(): boolean {
    if (this.phase !== 'idle') return false;
    this.phase = 'plasma';
    this.timer = 0;
    this.progress = 0;
    this.root.visible = true;
    this.camera = this.flight.activeCamera;
    this.initialFov = (this.camera as THREE.PerspectiveCamera).fov ?? 68;
    this.flight.altitude = 128000;
    this.audio.setEnvironment('entry');
    this.flight.setWarpStatus('ATMOS ENTRY');
    this.onPhase?.(this.phase, 0);
    return true;
  }

  update(delta: number): void {
    if (this.phase === 'idle' || this.phase === 'complete') return;
    this.timer += delta;
    this.camera = this.flight.activeCamera;
    this.root.position.copy(this.camera.position);
    this.root.quaternion.copy(this.camera.quaternion);
    const plasmaMaterial = this.plasma.material as THREE.ShaderMaterial;
    plasmaMaterial.uniforms.time.value += delta;
    const cloudMaterial = this.clouds.material as THREE.PointsMaterial;

    if (this.phase === 'plasma') {
      this.progress = Math.min(1, this.timer / 6.3);
      const intensity = Math.sin(this.progress * Math.PI) * 1.3;
      plasmaMaterial.uniforms.intensity.value = intensity;
      this.exterior.setReentryHeat(intensity);
      this.flight.altitude = THREE.MathUtils.lerp(128000, 15000, smoothstep(this.progress));
      const camera = this.camera as THREE.PerspectiveCamera;
      const shake = intensity * this.settings.motion * 0.035;
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      camera.rotation.z += (Math.random() - 0.5) * shake * 0.12;
      camera.fov = this.initialFov + Math.sin(this.progress * Math.PI) * 8 * this.settings.motion;
      camera.updateProjectionMatrix();
      this.onPhase?.(this.phase, this.progress);
      if (this.progress >= 1) {
        this.phase = 'clouds';
        this.timer = 0;
        this.onPhase?.(this.phase, 0);
      }
    } else if (this.phase === 'clouds') {
      this.progress = Math.min(1, this.timer / 4.8);
      plasmaMaterial.uniforms.intensity.value = Math.max(0, 1 - this.progress * 2) * 0.45;
      this.exterior.setReentryHeat(Math.max(0, 1 - this.progress * 1.8));
      cloudMaterial.opacity = Math.sin(this.progress * Math.PI) * 0.75;
      this.clouds.position.z += delta * 36;
      this.flight.altitude = THREE.MathUtils.lerp(15000, 1200, smoothstep(this.progress));
      this.onPhase?.(this.phase, this.progress);
      if (this.progress >= 1) {
        this.phase = 'gear-hold';
        this.timer = 0;
        cloudMaterial.opacity = 0;
        this.onPhase?.(this.phase, 0);
      }
    } else if (this.phase === 'gear-hold') {
      this.progress = this.flight.gearDeployed ? Math.min(1, this.timer / 1.2) : 0;
      this.flight.altitude = 1200;
      this.onPhase?.(this.phase, this.progress);
      if (this.flight.gearDeployed && this.timer > 1.2) {
        this.phase = 'landing';
        this.timer = 0;
        this.onPhase?.(this.phase, 0);
      }
    } else if (this.phase === 'landing') {
      this.progress = Math.min(1, this.timer / 6.5);
      this.flight.altitude = THREE.MathUtils.lerp(1200, 0, easeInOutCubic(this.progress));
      this.flight.throttle = THREE.MathUtils.lerp(0.18, 0, this.progress);
      this.exterior.setThrust((1 - this.progress) * 0.6 + 0.12);
      this.onPhase?.(this.phase, this.progress);
      if (this.progress >= 1) {
        this.audio.landingImpact();
        this.dustRing.visible = true;
        this.timer = 0;
        this.phase = 'complete';
        this.progress = 0;
        this.root.visible = false;
        this.exterior.setReentryHeat(0);
        this.flight.setWarpStatus('LANDED');
        this.onPhase?.(this.phase, 0);
        this.onComplete?.();
      }
    }
  }

  updateDust(delta: number): void {
    if (!this.dustRing.visible) return;
    this.progress += delta * 0.32;
    const material = this.dustRing.material as THREE.MeshBasicMaterial;
    this.dustRing.scale.setScalar(1 + this.progress * 13);
    material.opacity = Math.max(0, 0.42 * (1 - this.progress));
    if (this.progress >= 1) {
      this.dustRing.visible = false;
      this.dustRing.scale.setScalar(1);
    }
  }

  reset(): void {
    this.phase = 'idle';
    this.timer = 0;
    this.progress = 0;
    this.root.visible = false;
    this.dustRing.visible = false;
    this.exterior.setReentryHeat(0);
  }
}
