/**
 * Interaction — proximity + look-at registry for every usable object.
 *
 * Objects register a world anchor, a radius, a prompt verb and a handler. Each
 * frame the closest candidate within range *and* roughly in front of the camera
 * wins, which is far more forgiving than pure raycasting for small props while
 * still feeling precise.
 */

import { Object3D, Vector3 } from 'three';

export type InteractionKind =
  | 'use' | 'open' | 'close' | 'sit' | 'lever' | 'button'
  | 'toggle' | 'read' | 'pickup' | 'ramp';

export interface Interactable {
  id: string;
  /** Anchor in world space; if `node` is given the anchor tracks it. */
  position: Vector3;
  node?: Object3D;
  radius: number;
  kind: InteractionKind;
  /** Short verb shown in the prompt, e.g. "Open freezer". */
  label: string;
  /** Optional secondary line, e.g. "Requires power". */
  detail?: string;
  enabled: boolean;
  /** Return a new label to refresh the prompt after use. */
  onUse: () => void | string;
  /** Hover callback for highlight states. */
  onHover?: (hovered: boolean) => void;
}

export interface InteractionCandidate {
  id: string;
  label: string;
  detail?: string;
  kind: InteractionKind;
  distance: number;
}

const tmp = new Vector3();
const fwd = new Vector3();

export class InteractionSystem {
  private readonly items = new Map<string, Interactable>();
  private hovered: string | null = null;
  current: InteractionCandidate | null = null;

  register(item: Omit<Interactable, 'enabled'> & { enabled?: boolean }): Interactable {
    const full: Interactable = { enabled: true, ...item };
    this.items.set(full.id, full);
    return full;
  }

  unregister(id: string): void {
    this.items.delete(id);
    if (this.hovered === id) this.hovered = null;
  }

  get(id: string): Interactable | undefined {
    return this.items.get(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const i = this.items.get(id);
    if (i) i.enabled = enabled;
  }

  setLabel(id: string, label: string): void {
    const i = this.items.get(id);
    if (i) i.label = label;
  }

  clear(): void {
    this.items.clear();
    this.hovered = null;
    this.current = null;
  }

  /** Find the best candidate from the camera's position and facing. */
  update(eye: Vector3, quaternion: { x: number; y: number; z: number; w: number }): void {
    fwd.set(0, 0, -1).applyQuaternion(quaternion as never);

    let best: Interactable | null = null;
    let bestScore = -Infinity;
    let bestDist = 0;

    for (const item of this.items.values()) {
      if (!item.enabled) continue;
      if (item.node) item.node.getWorldPosition(tmp);
      else tmp.copy(item.position);

      const dist = tmp.distanceTo(eye);
      if (dist > item.radius) continue;

      tmp.sub(eye);
      const len = tmp.length() || 1e-5;
      tmp.divideScalar(len);
      const facing = tmp.dot(fwd);
      // Require the object to be broadly in front (or very close by).
      if (facing < 0.35 && dist > 1.1) continue;

      // Prefer things we are looking straight at, then things that are near.
      const score = facing * 2.2 - dist / Math.max(item.radius, 0.001);
      if (score > bestScore) {
        bestScore = score;
        best = item;
        bestDist = dist;
      }
    }

    const nextId = best?.id ?? null;
    if (nextId !== this.hovered) {
      if (this.hovered) this.items.get(this.hovered)?.onHover?.(false);
      best?.onHover?.(true);
      this.hovered = nextId;
    }

    this.current = best
      ? { id: best.id, label: best.label, detail: best.detail, kind: best.kind, distance: bestDist }
      : null;
  }

  /** Trigger the active candidate. Returns true if something happened. */
  activate(): boolean {
    if (!this.current) return false;
    const item = this.items.get(this.current.id);
    if (!item || !item.enabled) return false;
    const next = item.onUse();
    if (typeof next === 'string') item.label = next;
    return true;
  }

  get size(): number {
    return this.items.size;
  }
}
