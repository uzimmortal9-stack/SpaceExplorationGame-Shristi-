import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { assetLoader } from "../world/assets";

/**
 * Renderer — owns the WebGLRenderer, scene, camera, post-processing and
 * environment (real HDRI -> PMREM). Tone mapping is ACES; bloom is kept subtle
 * so emissive stays an accent rather than the main source of light.
 */

export type EnvKey = "ship" | "space" | "jungle";

const ENV_MAP: Record<EnvKey, string> = {
  ship: "hdri/studio.exr",
  space: "hdri/night.exr",
  jungle: "hdri/forest.exr",
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;

  private env: THREE.Texture | null = null;
  private envKey: EnvKey | null = null;
  private stars: THREE.Points | null = null;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.inset = "0";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    document.getElementById("app")!.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 6000);
    this.camera.position.set(0, 1.7, 0);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.85, 0.02);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.onResize();
    window.addEventListener("resize", () => this.onResize());
  }

  onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  /** Load the real HDRI environment for the given context (async, cached). */
  async setEnvironment(key: EnvKey): Promise<void> {
    if (this.envKey === key) return;
    this.envKey = key;
    const path = ENV_MAP[key];
    const env = await assetLoader.environment(this.renderer, path);
    this.scene.environment = env;
    this.scene.environmentIntensity = key === "jungle" ? 0.85 : key === "space" ? 0.35 : 0.7;
    if (this.env) this.env.dispose();
    this.env = env;
  }

  setBackgroundColor(color: number): void {
    this.scene.background = new THREE.Color(color);
    if (this.stars) this.stars.visible = false;
  }

  /** Procedural starfield (geometry, not a painted texture). */
  createStarfield(count = 4500, radius = 4500): THREE.Points {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = radius * (0.9 + Math.random() * 0.2);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.4;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const b = 0.4 + Math.random() * 0.6;
      const t = Math.random();
      const tint = t < 0.7 ? [1, 1, 1] : t < 0.85 ? [0.7, 0.85, 1] : [1, 0.9, 0.75];
      col[i * 3] = tint[0] * b;
      col[i * 3 + 1] = tint[1] * b;
      col[i * 3 + 2] = tint[2] * b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: 1.6,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    });
    this.stars = new THREE.Points(geo, m);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
    return this.stars;
  }

  /** Subtle animated cloud/nebula dome — a soft backdrop, not a PBR map. */
  createSpaceDome(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        colorA: { value: new THREE.Color(0x05070f) },
        colorB: { value: new THREE.Color(0x0a1226) },
        colorC: { value: new THREE.Color(0x1b1a3a) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform float time; uniform vec3 colorA; uniform vec3 colorB; uniform vec3 colorC;
        varying vec3 vPos;
        void main(){
          vec3 p = normalize(vPos);
          float neb = 0.0;
          neb += sin(p.x*6.0 + time*0.02)*sin(p.y*9.0+time*0.03)*0.5+0.5;
          neb += sin(p.z*7.0 - time*0.02)*0.5;
          vec3 col = mix(colorA, colorB, smoothstep(0.3,0.8,neb));
          col = mix(col, colorC, smoothstep(0.7,1.2,neb)*0.4);
          col += vec3(0.15,0.2,0.4) * pow(smoothstep(0.8,1.3,neb),2.0) * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(4300, 32, 24), mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    mesh.userData.shaderMat = mat;
    return mesh;
  }

  update(dt: number): void {
    if (this.scene.traverse) {
      this.scene.traverse((o) => {
        const shader = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (shader && shader.uniforms && shader.uniforms.time) shader.uniforms.time.value += dt;
      });
    }
  }

  render(): void {
    this.composer.render();
  }
}
