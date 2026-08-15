/**
 * Space — the solar system the ship flies in.
 *
 * The scene is rendered at a compressed scale (1 unit = 1 m near the ship,
 * distances to bodies are scaled down by SYSTEM_SCALE) so a 60 000-unit far
 * plane can hold the whole system without depth fighting. Planets use real
 * downloaded albedo textures where available and physically-lit spheres
 * otherwise — never emissive-as-lighting.
 */

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from 'three';

import type { AssetLoader } from '../assets/assetLoader';
import { rng } from '../core/math';

export interface Body {
  id: string;
  name: string;
  kind: 'planet' | 'moon' | 'star' | 'station';
  /** World position in scene units. */
  position: Vector3;
  radius: number;
  color: number;
  /** Orbit parameters (about the parent). */
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  parent?: string;
  node: Group;
  description: string;
  /** Only one body is the mission destination. */
  landable: boolean;
}

export const SYSTEM_SCALE = 1;

const BODY_DEFS = [
  {
    id: 'sun', name: 'Aurelis', kind: 'star' as const, radius: 900, color: 0xffd9a0,
    orbitRadius: 0, orbitSpeed: 0, description: 'G-type main sequence star.', landable: false,
  },
  {
    id: 'kepler', name: 'Kepler', kind: 'planet' as const, radius: 130, color: 0xa8794f,
    orbitRadius: 5200, orbitSpeed: 0.011, description: 'Scorched rock. No atmosphere.', landable: false,
  },
  {
    id: 'vashti', name: 'Vashti', kind: 'planet' as const, radius: 210, color: 0x5f8fd0,
    orbitRadius: 9400, orbitSpeed: 0.0072, description: 'Ocean world. Permanent storm belt.', landable: false,
  },
  {
    id: 'ilex', name: 'Ilex Prime', kind: 'planet' as const, radius: 260, color: 0x46c17a,
    orbitRadius: 15200, orbitSpeed: 0.0048, description: 'Jungle biosphere. Source of the repeating signal.',
    landable: true,
  },
  {
    id: 'ilex_moon', name: 'Ilex Minor', kind: 'moon' as const, radius: 62, color: 0xb9b4a8,
    orbitRadius: 780, orbitSpeed: 0.05, parent: 'ilex', description: 'Tidally locked moon.', landable: false,
  },
  {
    id: 'hesper', name: 'Hesper', kind: 'planet' as const, radius: 480, color: 0xd0a05a,
    orbitRadius: 23000, orbitSpeed: 0.0026, description: 'Gas giant with a bright ring system.', landable: false,
  },
  {
    id: 'hesper_moon', name: 'Calla', kind: 'moon' as const, radius: 78, color: 0x8fa0ad,
    orbitRadius: 1350, orbitSpeed: 0.034, parent: 'hesper', description: 'Ice moon. Hydrogen-rich.', landable: false,
  },
];

export class SolarSystem {
  readonly group = new Group();
  readonly bodies: Body[] = [];
  readonly sunLight: DirectionalLight;
  private readonly byId = new Map<string, Body>();
  private time = 0;
  private readonly sunSprite: Sprite;

  constructor(assets: AssetLoader) {
    this.group.name = 'solar-system';

    // ---- starfield ---------------------------------------------------------
    this.group.add(makeStarfield(9000, 42000));

    // ---- the sun -----------------------------------------------------------
    this.sunLight = new DirectionalLight(0xfff2df, 3.1);
    this.sunLight.position.set(1, 0.32, 0).normalize().multiplyScalar(1000);
    this.sunLight.castShadow = false;
    this.group.add(this.sunLight);
    this.group.add(this.sunLight.target);

    const surfaceTex = assets.surface('planet_temperate').map ?? null;
    const moonTex = assets.surface('planet_moon').map ?? null;

    for (const def of BODY_DEFS) {
      const node = new Group();
      node.name = def.id;

      if (def.kind === 'star') {
        const star = new Mesh(
          new SphereGeometry(def.radius, 48, 32),
          new MeshBasicMaterial({ color: 0xfff0cf }),
        );
        node.add(star);
        // corona shells
        for (let i = 0; i < 3; i++) {
          const glow = new Mesh(
            new SphereGeometry(def.radius * (1.18 + i * 0.3), 32, 20),
            new MeshBasicMaterial({
              color: i === 0 ? 0xffca7a : 0xff9c4a,
              transparent: true,
              opacity: 0.16 / (i + 1),
              blending: AdditiveBlending,
              side: BackSide,
              depthWrite: false,
            }),
          );
          node.add(glow);
        }
      } else {
        const isMoon = def.kind === 'moon';
        const tex: Texture | null = isMoon ? moonTex : surfaceTex;
        const mat = new MeshStandardMaterial({
          color: new Color(def.color),
          roughness: 0.92,
          metalness: 0.0,
        });
        if (tex) {
          const t = tex.clone();
          t.needsUpdate = true;
          mat.map = t;
          // tint the shared albedo so each world still reads as distinct
          mat.color.setHex(def.color).multiplyScalar(1.35);
        }
        const sphere = new Mesh(new SphereGeometry(def.radius, 56, 40), mat);
        node.add(sphere);

        // thin atmosphere shell on the habitable worlds
        if (def.id === 'ilex' || def.id === 'vashti') {
          const atmo = new Mesh(
            new SphereGeometry(def.radius * 1.035, 48, 32),
            new MeshBasicMaterial({
              color: def.id === 'ilex' ? 0x7fe8c0 : 0x8fc4ff,
              transparent: true,
              opacity: 0.17,
              blending: AdditiveBlending,
              side: BackSide,
              depthWrite: false,
            }),
          );
          node.add(atmo);
        }

        // gas giant rings
        if (def.id === 'hesper') {
          const ring = new Mesh(
            new RingGeometry(def.radius * 1.5, def.radius * 2.5, 128),
            new MeshBasicMaterial({
              color: 0xe0c79a,
              transparent: true,
              opacity: 0.42,
              side: 2,
              depthWrite: false,
            }),
          );
          ring.rotation.x = -Math.PI / 2 + 0.24;
          node.add(ring);
        }
      }

      const body: Body = {
        id: def.id,
        name: def.name,
        kind: def.kind,
        position: new Vector3(),
        radius: def.radius,
        color: def.color,
        orbitRadius: def.orbitRadius,
        orbitSpeed: def.orbitSpeed,
        orbitPhase: BODY_DEFS.indexOf(def) * 1.31,
        parent: (def as { parent?: string }).parent,
        node,
        description: def.description,
        landable: def.landable,
      };
      this.bodies.push(body);
      this.byId.set(body.id, body);
      this.group.add(node);

      // visible orbital path
      if (def.orbitRadius > 0 && !(def as { parent?: string }).parent) {
        this.group.add(makeOrbitLine(def.orbitRadius));
      }
    }

    // lens flare stand-in: an additive sprite that always faces the camera
    this.sunSprite = new Sprite(
      new SpriteMaterial({
        color: 0xffe6b8,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.sunSprite.scale.setScalar(4200);
    this.group.add(this.sunSprite);

    this.update(0);
  }

  get(id: string): Body | undefined {
    return this.byId.get(id);
  }

  update(dt: number): void {
    this.time += dt;
    for (const b of this.bodies) {
      if (b.orbitRadius === 0) {
        b.position.set(0, 0, 0);
      } else {
        const a = b.orbitPhase + this.time * b.orbitSpeed;
        const origin = b.parent ? (this.byId.get(b.parent)?.position ?? new Vector3()) : new Vector3();
        b.position.set(
          origin.x + Math.cos(a) * b.orbitRadius,
          origin.y + Math.sin(a * 0.35) * b.orbitRadius * 0.035,
          origin.z + Math.sin(a) * b.orbitRadius,
        );
      }
      b.node.position.copy(b.position);
      b.node.rotation.y += dt * (b.kind === 'star' ? 0.005 : 0.02);
    }
    this.sunSprite.position.set(0, 0, 0);
  }

  /** Point the sun light at the ship so the hull is always plausibly lit. */
  aimSunAt(target: Vector3): void {
    const sun = this.byId.get('sun');
    const origin = sun ? sun.position : new Vector3();
    this.sunLight.position.copy(target).add(
      new Vector3().subVectors(origin, target).normalize().multiplyScalar(600),
    );
    this.sunLight.target.position.copy(target);
    this.sunLight.target.updateMatrixWorld();
  }
}

function makeStarfield(count: number, radius: number): Points {
  const r = rng(0xbeef);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new Color();
  for (let i = 0; i < count; i++) {
    // uniform on a sphere
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const d = radius * (0.65 + r() * 0.35);
    pos[i * 3] = Math.cos(th) * s * d;
    pos[i * 3 + 1] = u * d;
    pos[i * 3 + 2] = Math.sin(th) * s * d;

    // realistic-ish stellar colours
    const t = r();
    if (t < 0.08) c.setHex(0x9fc4ff);
    else if (t < 0.24) c.setHex(0xd8e6ff);
    else if (t < 0.72) c.setHex(0xffffff);
    else if (t < 0.9) c.setHex(0xffe3b8);
    else c.setHex(0xffb887);
    const b = 0.45 + r() * 0.55;
    col[i * 3] = c.r * b;
    col[i * 3 + 1] = c.g * b;
    col[i * 3 + 2] = c.b * b;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  const pts = new Points(
    geo,
    new PointsMaterial({
      size: 60,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  pts.frustumCulled = false;
  return pts;
}

function makeOrbitLine(radius: number): Mesh {
  const ring = new Mesh(
    new RingGeometry(radius - 12, radius + 12, 256),
    new MeshBasicMaterial({
      color: 0x2a6f8a,
      transparent: true,
      opacity: 0.16,
      side: 2,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}
