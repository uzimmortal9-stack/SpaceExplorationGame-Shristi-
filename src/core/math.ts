/** Small numeric helpers shared across systems. */

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : clamp((v - a) / (b - a), 0, 1);

export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export const smootherstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Frame-rate independent exponential smoothing factor. */
export const damp = (dt: number, halfLife: number): number =>
  halfLife <= 0 ? 1 : 1 - Math.pow(2, -dt / halfLife);

export const dampTo = (current: number, target: number, halfLife: number, dt: number): number =>
  lerp(current, target, damp(dt, halfLife));

export const moveTowards = (current: number, target: number, maxDelta: number): number => {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
};

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const wrapAngle = (a: number): number => {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
};

/** Deterministic 32-bit PRNG (mulberry32) so worlds regenerate identically. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  (): number;
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function rng(seed: number): Rng {
  const base = makeRng(seed);
  const r = (() => base()) as Rng;
  r.range = (lo, hi) => lo + base() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + base() * (hi - lo + 1));
  r.pick = (items) => items[Math.floor(base() * items.length) % items.length];
  r.chance = (p) => base() < p;
  return r;
}

/** Classic 2D value noise with smooth interpolation — used for terrain. */
export function makeNoise2D(seed: number): (x: number, y: number) => number {
  const perm = new Uint8Array(512);
  const r = makeRng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad = (hash: number, x: number, y: number): number => {
    switch (hash & 3) {
      case 0:
        return x + y;
      case 1:
        return -x + y;
      case 2:
        return x - y;
      default:
        return -x - y;
    }
  };

  return (x: number, y: number): number => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  };
}

/** Fractal Brownian motion over a value-noise basis. */
export function fbm2D(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2.0,
  gain = 0.5,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Format a number with fixed digits and a leading zero pad (HUD readouts). */
export const pad = (v: number, digits = 3): string =>
  Math.abs(v).toFixed(0).padStart(digits, '0');

export function formatDistance(metres: number): string {
  if (metres >= 1e9) return `${(metres / 1e9).toFixed(2)} Gm`;
  if (metres >= 1e6) return `${(metres / 1e6).toFixed(2)} Mm`;
  if (metres >= 1e3) return `${(metres / 1e3).toFixed(1)} km`;
  return `${metres.toFixed(0)} m`;
}
