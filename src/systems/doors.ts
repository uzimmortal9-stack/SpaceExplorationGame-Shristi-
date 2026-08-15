import * as THREE from "three";
import { CollisionWorld } from "./collision";
import { audio } from "../core/audio";
import { damp } from "../core/math";

export type DoorState = "closed" | "opening" | "open" | "closing";

/**
 * Sliding door: two panels slide apart horizontally. The doorway volume is a
 * collision box that is only solid while the door is closed. Obstruction safety
 * prevents the door closing while the player is in the threshold.
 */
export class Door {
  state: DoorState = "closed";
  private progress = 0; // 0 closed .. 1 open
  private target = 0;
  private autoCloseTimer = 0;
  readonly group = new THREE.Group();
  private panels: { mesh: THREE.Object3D; dir: THREE.Vector3 }[] = [];
  private block: { box: ReturnType<CollisionWorld["addBox"]>; axis: "x" | "z"; savedMax: number } | null = null;
  soundPlaying = false;

  constructor(
    private collision: CollisionWorld,
    opts: {
      width: number;
      height: number;
      thickness: number;
      frameColor?: THREE.Color;
      onFinished?: (open: boolean) => void;
    },
  ) {
    const w = opts.width;
    const h = opts.height;
    const t = opts.thickness;
    // frame
    const frameMat = new THREE.MeshStandardMaterial({ color: opts.frameColor ?? 0x6b7683, metalness: 0.6, roughness: 0.4 });
    const jambW = 0.12;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + jambW * 2, jambW, t), frameMat);
    top.position.y = h - jambW / 2;
    const left = new THREE.Mesh(new THREE.BoxGeometry(jambW, h, t), frameMat);
    left.position.x = -w / 2 - jambW / 2;
    left.position.y = h / 2;
    const right = left.clone();
    right.position.x = w / 2 + jambW / 2;
    this.group.add(top, left, right);

    // sliding panels
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xaeb8c2, metalness: 0.8, roughness: 0.35 });
    const panelGeo = new THREE.BoxGeometry(w / 2 - 0.03, h - 0.06, t * 0.9);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(panelGeo, panelMat);
      p.position.set(side * (w / 4), h / 2, 0);
      p.userData.baseX = p.position.x;
      this.group.add(p);
      this.panels.push({ mesh: p, dir: new THREE.Vector3(side * (w / 2), 0, 0) });
    }
    // Blocking box (register after group has its transform set by caller)
    this.group.userData.isDoor = true;
  }

  /** Register the closed-door collision box. Call after positioning the group. */
  setBlock(axis: "x" | "z", minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    const box = this.collision.addBox(minX, minY, minZ, maxX, maxY, maxZ);
    this.block = { box, axis, savedMax: axis === "x" ? maxX : maxZ };
  }

  open(): void {
    if (this.state === "open" || this.target === 1) return;
    this.target = 1;
    this.state = "opening";
    if (!this.soundPlaying) {
      this.soundPlaying = true;
      audio.doorSlide(true);
    }
    if (this.block) {
      const b = this.block.box;
      if (this.block.axis === "x") b.max.x = b.min.x;
      else b.max.z = b.min.z;
    }
    this.autoCloseTimer = 2.6;
  }

  close(): void {
    if (this.state === "closed") return;
    this.target = 0;
    this.state = "closing";
    if (!this.soundPlaying) {
      this.soundPlaying = true;
      audio.doorSlide(false);
    }
  }

  /** Call each frame. Returns true while transitioning. */
  update(dt: number, playerX: number, playerZ: number, playerR: number): boolean {
    this.progress = damp(this.progress, this.target, 6, dt);
    // panels slide apart based on progress
    for (const p of this.panels) {
      p.mesh.position.x = p.mesh.userData.baseX + p.dir.x * this.progress;
    }

    if (this.target === 1 && this.progress > 0.97) {
      if (this.state === "opening") this.soundPlaying = false;
      this.state = "open";
      // auto close after timer unless obstructed
      this.autoCloseTimer -= dt;
      if (this.autoCloseTimer <= 0) {
        const threshold = this.block;
        if (threshold) {
          const obstructed = this.collision.obstructed(playerX, 0, playerZ, playerR, 1.8);
          if (!obstructed) this.close();
          else {
            audio.doorBump();
            this.autoCloseTimer = 1.2;
          }
        } else {
          this.close();
        }
      }
    } else if (this.target === 0 && this.progress < 0.03) {
      if (this.state === "closing") this.soundPlaying = false;
      this.state = "closed";
      if (this.block) {
        if (this.block.axis === "x") this.block.box.max.x = this.block.savedMax;
        else this.block.box.max.z = this.block.savedMax;
      }
    }
    return this.state === "opening" || this.state === "closing";
  }

  isOpen(): boolean {
    return this.progress > 0.6;
  }
}
