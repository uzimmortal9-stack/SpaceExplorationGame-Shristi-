/** Keyboard / mouse input with a press-edge event queue. */

export type MouseButton = "left" | "right" | "middle";

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private mouseDown = new Set<string>();
  private mousePressed = new Set<string>();
  private _lockActive = false;

  yaw = 0;
  pitch = 0;
  private havePointer = false;

  onLockChange: (() => void) | null = null;

  constructor(private element: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "tab"].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      this.released.add(k);
    });
    window.addEventListener("blur", () => this.keys.clear());

    element.addEventListener("mousedown", (e) => {
      const b = this.mouseName(e.button);
      if (!this.mouseDown.has(b)) this.mousePressed.add(b);
      this.mouseDown.add(b);
    });
    window.addEventListener("mouseup", (e) => {
      const b = this.mouseName(e.button);
      this.mouseDown.delete(b);
    });

    document.addEventListener("pointerlockchange", () => {
      this._lockActive = document.pointerLockElement === this.element;
      if (this._lockActive && !this.havePointer) {
        this.havePointer = true;
        this.yaw = 0;
        this.pitch = 0;
      }
      if (this.onLockChange) this.onLockChange();
    });
    document.addEventListener("mousemove", (e) => {
      if (!this._lockActive) return;
      const sens = 0.0022;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
    });
  }

  private mouseName(button: number): string {
    return button === 0 ? "left" : button === 2 ? "right" : "middle";
  }

  requestLock(): void {
    const p = (this.element as any).requestPointerLock?.() as Promise<void> | undefined;
    if (p && typeof p.catch === "function") p.catch(() => undefined);
  }
  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  get lockActive(): boolean {
    return this._lockActive;
  }

  /** Poll a held key. */
  down(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }
  /** Pressed this frame (edge). */
  justPressed(key: string): boolean {
    return this.pressed.has(key.toLowerCase());
  }
  justReleased(key: string): boolean {
    return this.released.has(key.toLowerCase());
  }
  mouseDownButton(button: MouseButton): boolean {
    return this.mouseDown.has(button);
  }
  mouseJustPressed(button: MouseButton): boolean {
    return this.mousePressed.has(button);
  }

  /** Consume pitch/yaw accumulated this frame and reset accumulation. */
  consumeLook(): { yaw: number; pitch: number } {
    const y = this.yaw;
    const p = this.pitch;
    this.yaw = 0;
    this.pitch = 0;
    return { yaw: y, pitch: p };
  }

  /** Call at end of each frame to clear edge events. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.clear();
  }

  clearAll(): void {
    this.keys.clear();
    this.pressed.clear();
    this.released.clear();
    this.mouseDown.clear();
    this.mousePressed.clear();
  }
}
