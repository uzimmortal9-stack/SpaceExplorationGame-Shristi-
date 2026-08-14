import * as THREE from 'three';
import type { Interaction } from '../types';
import type { AudioEngine } from '../core/AudioEngine';

export class InteractionSystem {
  private interactions: Interaction[] = [];
  private raycaster = new THREE.Raycaster();
  private active: Interaction | null = null;
  private prompt: (text: string | null) => void;
  private audio: AudioEngine;

  constructor(audio: AudioEngine, prompt: (text: string | null) => void) {
    this.audio = audio;
    this.prompt = prompt;
    this.raycaster.far = 4.2;
  }

  register(interaction: Interaction): Interaction {
    interaction.object.userData.interactionId = interaction.id;
    this.interactions.push(interaction);
    return interaction;
  }

  unregisterPrefix(prefix: string): void {
    this.interactions = this.interactions.filter((entry) => !entry.id.startsWith(prefix));
  }

  update(camera: THREE.Camera): void {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const available = this.interactions.filter((entry) => entry.enabled?.() !== false && entry.object.visible);
    const objectSet = available.map((entry) => entry.object);
    const hit = this.raycaster.intersectObjects(objectSet, true).find((candidate) => {
      const entry = this.findForObject(candidate.object, available);
      return entry && candidate.distance <= (entry.range ?? 3.2);
    });
    const next = hit ? this.findForObject(hit.object, available) : null;
    if (next !== this.active) {
      this.active?.onHover?.(false);
      if (next) {
        next.onHover?.(true);
        this.audio.hover();
      }
      this.active = next;
    }
    this.prompt(this.active ? `E  ${typeof this.active.label === 'function' ? this.active.label() : this.active.label}` : null);
  }

  interact(): boolean {
    if (!this.active) return false;
    this.audio.click();
    this.active.onInteract();
    return true;
  }

  clear(): void {
    this.active?.onHover?.(false);
    this.active = null;
    this.prompt(null);
  }

  private findForObject(object: THREE.Object3D, list: Interaction[]): Interaction | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      const id = current.userData.interactionId as string | undefined;
      if (id) return list.find((entry) => entry.id === id) ?? null;
      current = current.parent;
    }
    return null;
  }
}
