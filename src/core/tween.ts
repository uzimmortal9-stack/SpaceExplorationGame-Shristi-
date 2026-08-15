/** Minimal tween utilities for smooth cinematic motion. */

export type EaseFn = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  in: (t: number) => t * t,
  out: (t: number) => 1 - (1 - t) * (1 - t),
  cubicOut: (t: number) => 1 - Math.pow(1 - t, 3),
  cubicIn: (t: number) => t * t * t,
  smooth: (t: number) => t * t * (3 - 2 * t),
};

export interface Tweener {
  update(dt: number): void;
  tween(duration: number, update: (v: number) => void, onDone?: () => void, ease?: EaseFn, startDelay?: number): void;
  set(cb: () => void): void;
}

/** A simple scalar/function tween runner used by the cinematic director. */
export class TweenQueue implements Tweener {
  private list: { t: number; dur: number; delay: number; update: (v: number) => void; onDone?: () => void; ease: EaseFn; active: boolean }[] = [];

  update(dt: number): void {
    for (const tw of this.list) {
      if (!tw.active) continue;
      if (tw.delay > 0) {
        tw.delay -= dt;
        continue;
      }
      tw.t += dt;
      const k = tw.dur <= 0 ? 1 : Math.min(1, tw.t / tw.dur);
      tw.update(tw.ease(k));
      if (k >= 1) {
        tw.active = false;
        if (tw.onDone) tw.onDone();
      }
    }
    this.list = this.list.filter((t) => t.active);
  }

  tween(duration: number, update: (v: number) => void, onDone?: () => void, ease: EaseFn = Ease.inOut, startDelay = 0): void {
    this.list.push({ t: 0, dur: duration, delay: startDelay, update, onDone, ease, active: true });
  }

  set(cb: () => void): void {
    cb();
  }

  clear(): void {
    this.list = [];
  }

  get running(): boolean {
    return this.list.length > 0;
  }
}
