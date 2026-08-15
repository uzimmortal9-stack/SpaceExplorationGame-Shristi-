/**
 * Input — keyboard/mouse state with pointer-lock mouse-look.
 *
 * Actions are looked up by semantic name so the settings panel can display a
 * single source of truth for the controls screen.
 */

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'interact'
  | 'flashlight'
  | 'pause'
  | 'map'
  | 'cameraCycle'
  | 'throttleUp'
  | 'throttleDown'
  | 'rollLeft'
  | 'rollRight'
  | 'boost'
  | 'brake'
  | 'gear'
  | 'warp';

export const BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'KeyC'],
  interact: ['KeyE'],
  flashlight: ['KeyF'],
  pause: ['Escape'],
  map: ['KeyM'],
  cameraCycle: ['KeyV'],
  throttleUp: ['KeyW', 'ArrowUp'],
  throttleDown: ['KeyS', 'ArrowDown'],
  rollLeft: ['KeyQ'],
  rollRight: ['KeyE'],
  boost: ['ShiftLeft', 'ShiftRight'],
  brake: ['Space'],
  gear: ['KeyG'],
  warp: ['KeyJ'],
};

export const CONTROL_HELP: ReadonlyArray<{ group: string; rows: Array<[string, string]> }> = [
  {
    group: 'On Foot',
    rows: [
      ['W A S D', 'Move'],
      ['Mouse', 'Look'],
      ['Shift', 'Sprint'],
      ['Ctrl / C', 'Crouch'],
      ['Space', 'Jump'],
      ['E', 'Interact · Sit · Use'],
      ['F', 'Helmet lamp'],
    ],
  },
  {
    group: 'Piloting',
    rows: [
      ['W / S', 'Throttle up · down'],
      ['Mouse', 'Pitch · Yaw'],
      ['Q / E', 'Roll left · right'],
      ['Shift', 'Boost'],
      ['Space', 'Inertial brake'],
      ['V', 'Cockpit · Chase · Orbital'],
      ['G', 'Landing gear'],
      ['E', 'Leave the seat'],
    ],
  },
  {
    group: 'Interface',
    rows: [
      ['M', 'Nav / target selector'],
      ['Esc', 'Pause · Settings'],
      ['J', 'Engage warp (when armed)'],
    ],
  },
];

export class Input {
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private readonly releasedThisFrame = new Set<string>();

  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  pointerLocked = false;
  sensitivity = 1.0;
  invertY = false;
  enabled = true;

  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onWheel: (e: WheelEvent) => void;
  private readonly onLockChange: () => void;
  private readonly onBlur: () => void;

  constructor(private readonly target: HTMLElement) {
    this.onKeyDown = (e) => {
      if (e.repeat) return;
      // Never swallow devtools / reload shortcuts.
      if (e.metaKey || e.ctrlKey) {
        if (e.code !== 'ControlLeft' && e.code !== 'ControlRight') return;
      }
      this.down.add(e.code);
      this.pressedThisFrame.add(e.code);
      if (this.shouldPreventDefault(e.code)) e.preventDefault();
    };
    this.onKeyUp = (e) => {
      this.down.delete(e.code);
      this.releasedThisFrame.add(e.code);
    };
    this.onMouseMove = (e) => {
      if (!this.pointerLocked || !this.enabled) return;
      this.mouseDX += e.movementX * 0.0022 * this.sensitivity;
      this.mouseDY += e.movementY * 0.0022 * this.sensitivity * (this.invertY ? -1 : 1);
    };
    this.onWheel = (e) => {
      if (!this.enabled) return;
      this.wheelDelta += Math.sign(e.deltaY);
    };
    this.onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.target;
      if (!this.pointerLocked) this.down.clear();
    };
    this.onBlur = () => {
      this.down.clear();
    };

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this.onLockChange);
    window.addEventListener('blur', this.onBlur);
  }

  private shouldPreventDefault(code: string): boolean {
    return (
      code === 'Space' ||
      code.startsWith('Arrow') ||
      code === 'Tab' ||
      (this.pointerLocked && code.startsWith('Key'))
    );
  }

  requestPointerLock(): void {
    if (document.pointerLockElement !== this.target) {
      void this.target.requestPointerLock?.();
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.target) document.exitPointerLock();
  }

  isDown(action: Action): boolean {
    if (!this.enabled) return false;
    return BINDINGS[action].some((c) => this.down.has(c));
  }

  wasPressed(action: Action): boolean {
    if (!this.enabled) return false;
    return BINDINGS[action].some((c) => this.pressedThisFrame.has(c));
  }

  keyPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  keyDown(code: string): boolean {
    return this.enabled && this.down.has(code);
  }

  /** Axis helper: returns -1, 0 or +1. */
  axis(negative: Action, positive: Action): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  consumeWheel(): number {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  /** Call at the very end of each frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    window.removeEventListener('blur', this.onBlur);
  }
}
