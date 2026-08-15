/** Global game state shared by systems and the HUD. */

import { Emitter } from './events';

export type GamePhase =
  | 'boot'
  | 'menu'
  | 'interior'      // walking the ship, docked/in space
  | 'flight'        // seated, flying
  | 'warpCharge'
  | 'warpTunnel'
  | 'entry'         // atmospheric entry
  | 'landing'
  | 'landed'        // on the surface, still inside
  | 'surface';      // walking the planet

export interface ShipSystems {
  hull: number;        // 0..1
  shields: number;     // 0..1
  fuel: number;        // 0..1
  power: number;       // 0..1
  oxygen: number;      // 0..1
  warpCharge: number;  // 0..1
  reactorOutput: number;
  landingGear: number; // 0 = up, 1 = down
  rampAngle: number;   // 0 = closed, 1 = fully lowered
}

export interface TargetInfo {
  id: string;
  name: string;
  kind: 'planet' | 'moon' | 'station' | 'star';
  distance: number;
  canWarp: boolean;
}

export interface Objective {
  id: string;
  text: string;
  done: boolean;
}

export interface GameEvents extends Record<string, unknown> {
  phase: GamePhase;
  objective: Objective[];
  toast: { text: string; tone?: 'info' | 'warn' | 'good' };
  subtitle: { text: string; duration?: number };
  target: TargetInfo | null;
  warpReady: boolean;
  systems: ShipSystems;
  interact: { label: string; detail?: string } | null;
  cinematic: boolean;
}

export class GameState {
  readonly events = new Emitter<GameEvents>();

  phase: GamePhase = 'boot';
  cinematic = false;

  systems: ShipSystems = {
    hull: 1,
    shields: 1,
    fuel: 0.82,
    power: 0.94,
    oxygen: 0.98,
    warpCharge: 0,
    reactorOutput: 0.72,
    landingGear: 0,
    rampAngle: 0,
  };

  target: TargetInfo | null = null;
  warpArmed = false;
  warpLeverPulled = false;
  throttleUnlocked = false;
  hasLanded = false;
  suitOn = false;
  signalFound = false;

  objectives: Objective[] = [];

  setPhase(phase: GamePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.events.emit('phase', phase);
  }

  setCinematic(on: boolean): void {
    this.cinematic = on;
    this.events.emit('cinematic', on);
  }

  toast(text: string, tone: 'info' | 'warn' | 'good' = 'info'): void {
    this.events.emit('toast', { text, tone });
  }

  subtitle(text: string, duration = 4.5): void {
    this.events.emit('subtitle', { text, duration });
  }

  setObjectives(list: Objective[]): void {
    this.objectives = list;
    this.events.emit('objective', list);
  }

  completeObjective(id: string): void {
    const o = this.objectives.find((x) => x.id === id);
    if (!o || o.done) return;
    o.done = true;
    this.events.emit('objective', this.objectives);
  }

  addObjective(o: Objective): void {
    if (this.objectives.some((x) => x.id === o.id)) return;
    this.objectives.push(o);
    this.events.emit('objective', this.objectives);
  }

  setTarget(t: TargetInfo | null): void {
    this.target = t;
    this.events.emit('target', t);
  }

  pushSystems(): void {
    this.events.emit('systems', this.systems);
  }

  serialize(): string {
    return JSON.stringify({
      v: 1,
      phase: this.phase,
      systems: this.systems,
      target: this.target?.id ?? null,
      warpArmed: this.warpArmed,
      throttleUnlocked: this.throttleUnlocked,
      hasLanded: this.hasLanded,
      suitOn: this.suitOn,
      signalFound: this.signalFound,
      objectives: this.objectives,
    });
  }
}
