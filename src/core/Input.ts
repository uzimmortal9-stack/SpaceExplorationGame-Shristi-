export class Input {
  readonly keys = new Set<string>();
  readonly pressed = new Set<string>();
  readonly released = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseDown = false;
  pointerLocked = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onPointerLock);
    window.addEventListener('blur', this.reset);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.keys.has(event.code)) this.pressed.add(event.code);
    this.keys.add(event.code);
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    this.released.add(event.code);
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.mouseDX += event.movementX;
    this.mouseDY += event.movementY;
  };

  private onMouseDown = (): void => {
    this.mouseDown = true;
  };

  private onMouseUp = (): void => {
    this.mouseDown = false;
  };

  private onPointerLock = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  };

  requestPointerLock(): void {
    if (document.pointerLockElement !== this.canvas) void this.canvas.requestPointerLock();
  }

  releasePointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  consume(code: string): boolean {
    const exists = this.pressed.has(code);
    this.pressed.delete(code);
    return exists;
  }

  endFrame(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pressed.clear();
    this.released.clear();
  }

  reset = (): void => {
    this.keys.clear();
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onPointerLock);
    window.removeEventListener('blur', this.reset);
  }
}
