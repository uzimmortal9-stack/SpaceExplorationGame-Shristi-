import * as THREE from "three";

export interface Interactable {
  object: THREE.Object3D;
  label: string;
  range: number;
  onInteract: () => void;
  /** Optional secondary label when in a special state. */
  stateLabel?: () => string;
}

/**
 * InteractionSystem — finds the closest interactable near the player's view.
 * Pure proximity + facing check (no reliance on raycast against hidden geometry).
 */
export class InteractionSystem {
  private items: Interactable[] = [];

  add(item: Interactable): void {
    this.items.push(item);
  }

  clear(): void {
    this.items = [];
  }

  /** Nearest interactable within range and within the facing cone. */
  find(camera: THREE.PerspectiveCamera): Interactable | null {
    let best: Interactable | null = null;
    let bestScore = Infinity;
    const camPos = camera.position;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    for (const it of this.items) {
      const p = it.object.getWorldPosition(new THREE.Vector3());
      const dx = p.x - camPos.x;
      const dy = p.y - camPos.y;
      const dz = p.z - camPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > it.range) continue;
      // facing: dot of (toObj) and camDir
      const facing = dx * camDir.x + dy * camDir.y + dz * camDir.z;
      if (facing < 0.15) continue;
      const score = dist - facing * 0.4;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }
}
