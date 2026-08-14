import * as THREE from 'three';
import { createPanelTexture, screenMaterial, updatePanelTexture } from '../core/CanvasTexture';
import { normalizedBox } from './geometryAlignment';
import { metal } from './materials';

export class WorldPanel extends THREE.Group {
  readonly screen: THREE.Mesh;
  readonly texture: THREE.CanvasTexture;
  readonly frame: THREE.Mesh;

  constructor(title: string, lines: string[], width = 2.6, height = 1.3, color = 0x152731) {
    super();
    this.texture = createPanelTexture(title, lines);
    this.frame = new THREE.Mesh(normalizedBox(width + 0.18, height + 0.18, 0.1, 'center'), metal(color, 0.38, 0.78));
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), screenMaterial(this.texture));
    this.screen.position.z = 0.056;
    this.add(this.frame, this.screen);
  }

  setContent(title: string, lines: string[]): void {
    updatePanelTexture(this.texture, title, lines);
  }

  setHover(active: boolean): void {
    const material = this.frame.material as THREE.MeshStandardMaterial;
    material.emissive.setHex(active ? 0x00f0ff : 0x000000);
    material.emissiveIntensity = active ? 0.35 : 0;
  }
}
