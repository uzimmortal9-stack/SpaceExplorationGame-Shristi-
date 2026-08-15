/** Minimal typed pub/sub used to decouple systems from the UI. */

export type Handler<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private readonly map = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(key: K, fn: Handler<Events[K]>): () => void {
    let set = this.map.get(key);
    if (!set) {
      set = new Set();
      this.map.set(key, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(key, fn);
  }

  once<K extends keyof Events>(key: K, fn: Handler<Events[K]>): () => void {
    const off = this.on(key, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends keyof Events>(key: K, fn: Handler<Events[K]>): void {
    this.map.get(key)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof Events>(key: K, payload: Events[K]): void {
    const set = this.map.get(key);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<Events[K]>)(payload);
  }

  clear(): void {
    this.map.clear();
  }
}
