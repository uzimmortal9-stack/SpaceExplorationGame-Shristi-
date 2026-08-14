import * as THREE from 'three';
import { COLORS } from '../world/materials';

export class CollimatedHUD {
  readonly root = new THREE.Group();
  private targetMarker: THREE.Sprite;
  private velocityMarker: THREE.Sprite;
  private boresight: THREE.Sprite;
  private targetLine: THREE.Line;

  constructor(scene: THREE.Scene) {
    this.root.name = 'Collimated Flight Projection';
    this.targetMarker = this.sprite(this.symbolTexture('diamond', '#00f0ff'), 8);
    this.velocityMarker = this.sprite(this.symbolTexture('velocity', '#ffb000'), 5.5);
    this.boresight = this.sprite(this.symbolTexture('cross', '#00f0ff'), 3.8);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.targetLine = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.26, depthTest: false, depthWrite: false }));
    this.root.add(this.targetMarker, this.velocityMarker, this.boresight, this.targetLine);
    this.root.visible = false;
    this.root.renderOrder = 50;
    scene.add(this.root);
  }

  private sprite(texture: THREE.Texture, scale: number): THREE.Sprite {
    const material = new THREE.SpriteMaterial({ map: texture, color: 0xffffff, transparent: true, opacity: 0.86, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scale, scale, 1);
    sprite.renderOrder = 51;
    return sprite;
  }

  private symbolTexture(type: 'diamond' | 'velocity' | 'cross', color: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.translate(64, 64);
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.shadowColor = color;
    context.shadowBlur = 7;
    context.beginPath();
    if (type === 'diamond') {
      context.moveTo(0, -45); context.lineTo(45, 0); context.lineTo(0, 45); context.lineTo(-45, 0); context.closePath();
      context.moveTo(-58, 0); context.lineTo(-35, 0); context.moveTo(58, 0); context.lineTo(35, 0);
    } else if (type === 'velocity') {
      context.arc(0, 0, 17, 0, Math.PI * 2); context.moveTo(-17, 0); context.lineTo(-43, 0); context.lineTo(-52, 8);
      context.moveTo(17, 0); context.lineTo(43, 0); context.lineTo(52, 8); context.moveTo(0, 17); context.lineTo(0, 32);
    } else {
      context.moveTo(-26, 0); context.lineTo(-7, 0); context.moveTo(26, 0); context.lineTo(7, 0); context.moveTo(0, -9); context.lineTo(0, 9);
    }
    context.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  update(camera: THREE.Camera, targetDirection: THREE.Vector3, velocityDirection: THREE.Vector3, visible: boolean): void {
    this.root.visible = visible;
    if (!visible) return;
    camera.updateMatrixWorld(true);
    const cameraPosition = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const targetDir = targetDirection.clone().normalize();
    const velocityDir = velocityDirection.lengthSq() > 0.001 ? velocityDirection.clone().normalize() : forward;
    const targetAhead = targetDir.dot(forward) > 0.08;
    this.targetMarker.visible = targetAhead;
    this.targetLine.visible = targetAhead;
    this.targetMarker.position.copy(cameraPosition).addScaledVector(targetDir, 185);
    this.velocityMarker.position.copy(cameraPosition).addScaledVector(velocityDir, 180);
    this.boresight.position.copy(cameraPosition).addScaledVector(forward, 175);

    const positions = this.targetLine.geometry.attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, this.boresight.position.x, this.boresight.position.y, this.boresight.position.z);
    positions.setXYZ(1, this.targetMarker.position.x, this.targetMarker.position.y, this.targetMarker.position.z);
    positions.needsUpdate = true;
  }

  setWarp(active: boolean): void {
    const targetMaterial = this.targetMarker.material as THREE.SpriteMaterial;
    targetMaterial.color.setHex(active ? COLORS.amber : 0xffffff);
    targetMaterial.opacity = active ? 1 : 0.86;
  }
}
