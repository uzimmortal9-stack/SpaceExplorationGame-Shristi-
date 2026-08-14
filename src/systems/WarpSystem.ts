import * as THREE from 'three';
import type { AudioEngine } from '../core/AudioEngine';
import type { GameSettings } from '../types';
import type { FlightSystem } from './FlightSystem';
import { easeInOutCubic, smoothstep } from '../core/Tween';

export type WarpPhase = 'idle' | 'charge' | 'tunnel' | 'exit';

export class WarpSystem {
  readonly root = new THREE.Group();
  phase: WarpPhase = 'idle';
  progress = 0;
  onPhase?: (phase: WarpPhase, progress: number) => void;
  onComplete?: () => void;
  private audio: AudioEngine;
  private flight: FlightSystem;
  private settings: GameSettings;
  private streaks: THREE.LineSegments;
  private tunnel: THREE.Mesh;
  private chargeLight: THREE.PointLight;
  private timer = 0;
  private lastPulse = -1;

  constructor(scene: THREE.Scene, audio: AudioEngine, flight: FlightSystem, settings: GameSettings) {
    this.audio = audio;
    this.flight = flight;
    this.settings = settings;
    this.root.name = 'Warp Distortion Field';
    this.root.visible = false;
    this.streaks = this.buildStreaks();
    this.tunnel = this.buildTunnel();
    this.chargeLight = new THREE.PointLight(0x34d9ff, 0, 80, 1.2);
    this.chargeLight.position.set(0, 2, -20);
    this.root.add(this.streaks, this.tunnel, this.chargeLight);
    scene.add(this.root);
  }

  private buildStreaks(): THREE.LineSegments {
    const count = 900;
    const positions = new Float32Array(count * 6);
    const colors = new Float32Array(count * 6);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 3 + Math.pow(Math.random(), 0.55) * 38;
      const z = -Math.random() * 240 + 45;
      const length = 1 + Math.random() * 20;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      positions.set([x, y, z, x * 1.025, y * 1.025, z + length], i * 6);
      const tint = Math.random();
      const color = new THREE.Color().setRGB(0.25 + tint * 0.55, 0.65 + tint * 0.25, 1);
      colors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
    return new THREE.LineSegments(geometry, material);
  }

  private buildTunnel(): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(38, 2.5, 260, 48, 32, true);
    geometry.rotateX(Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, intensity: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vPos; void main(){vUv=uv;vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform float time; uniform float intensity; varying vec2 vUv; varying vec3 vPos;
        void main(){float waves=sin(vUv.y*115.0-time*16.0+sin(vUv.x*32.0))*0.5+0.5;float ribs=pow(waves,8.0);float spiral=sin(vUv.x*40.0+vUv.y*18.0-time*5.0)*0.5+0.5;vec3 c=mix(vec3(.05,.25,.8),vec3(.4,.95,1.),spiral);gl_FragColor=vec4(c,(ribs*.28+spiral*.04)*intensity);}`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -82;
    return mesh;
  }

  setSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  start(): boolean {
    if (this.phase !== 'idle') return false;
    this.phase = 'charge';
    this.timer = 0;
    this.progress = 0;
    this.lastPulse = -1;
    this.root.visible = true;
    this.audio.setEnvironment('warp');
    this.flight.setWarpStatus('CHARGING 000%');
    this.onPhase?.(this.phase, 0);
    return true;
  }

  update(delta: number): void {
    if (this.phase === 'idle') return;
    this.timer += delta;
    const tunnelMaterial = this.tunnel.material as THREE.ShaderMaterial;
    tunnelMaterial.uniforms.time.value += delta;

    if (this.phase === 'charge') {
      this.progress = Math.min(1, this.timer / 4.8);
      const eased = smoothstep(this.progress);
      this.chargeLight.intensity = eased * 85;
      (this.streaks.material as THREE.LineBasicMaterial).opacity = eased * 0.42;
      this.streaks.scale.z = 0.1 + eased * 0.7;
      tunnelMaterial.uniforms.intensity.value = eased * 0.18;
      const pulse = Math.floor(this.progress * 20);
      if (pulse !== this.lastPulse) {
        this.lastPulse = pulse;
        this.audio.warpCharge(this.progress);
      }
      this.flight.setWarpStatus(`CHARGING ${String(Math.floor(this.progress * 100)).padStart(3, '0')}%`);
      this.onPhase?.(this.phase, this.progress);
      if (this.progress >= 1) {
        this.phase = 'tunnel';
        this.timer = 0;
        this.audio.warpBurst();
        this.flight.setWarpStatus('TRANSIT');
        this.onPhase?.(this.phase, 0);
      }
    } else if (this.phase === 'tunnel') {
      this.progress = Math.min(1, this.timer / 6.2);
      const intensity = 0.7 + Math.sin(this.timer * 7) * 0.16;
      tunnelMaterial.uniforms.intensity.value = intensity;
      this.streaks.position.z += delta * 165;
      if (this.streaks.position.z > 90) this.streaks.position.z = -100;
      this.streaks.scale.z = 3 + smoothstep(this.progress) * 7;
      this.chargeLight.intensity = 55 + Math.random() * 40;
      this.onPhase?.(this.phase, this.progress);
      if (this.progress >= 1) {
        this.phase = 'exit';
        this.timer = 0;
        this.flight.arriveAtSelectedTarget();
        this.flight.setWarpStatus('COOLDOWN');
        this.onPhase?.(this.phase, 0);
      }
    } else {
      this.progress = Math.min(1, this.timer / 2.3);
      const fade = 1 - easeInOutCubic(this.progress);
      tunnelMaterial.uniforms.intensity.value = fade * 0.65;
      (this.streaks.material as THREE.LineBasicMaterial).opacity = fade * 0.7;
      this.chargeLight.intensity = fade * 60;
      this.onPhase?.(this.phase, this.progress);
      if (this.progress >= 1) {
        this.phase = 'idle';
        this.progress = 0;
        this.root.visible = false;
        this.streaks.position.z = 0;
        this.streaks.scale.set(1, 1, 1);
        this.audio.setEnvironment('space');
        this.onComplete?.();
      }
    }
    const camera = this.flight.activeCamera;
    const shake = this.settings.motion * (this.phase === 'tunnel' ? 0.006 : this.progress * 0.0025);
    camera.rotation.z += (Math.random() - 0.5) * shake;
    camera.position.x += (Math.random() - 0.5) * shake * 0.7;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    this.root.position.copy(camera.position);
    this.root.quaternion.copy(camera.quaternion);
  }
}
