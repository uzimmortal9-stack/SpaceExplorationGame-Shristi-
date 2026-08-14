import type * as THREE from 'three';

export type GameMode =
  | 'MENU'
  | 'EXPLORING'
  | 'PILOTING'
  | 'WARP_CHARGE'
  | 'WARP_TUNNEL'
  | 'ORBIT'
  | 'ENTRY'
  | 'LANDED'
  | 'PAUSED';

export type Quality = 'low' | 'medium' | 'high';

export interface GameSettings {
  quality: Quality;
  sensitivity: number;
  volume: number;
  motion: number;
  fullscreen: boolean;
}

export interface GameSnapshot {
  version: 1;
  mode: GameMode;
  playerPosition: [number, number, number];
  playerYaw: number;
  playerPitch: number;
  shipPosition?: [number, number, number];
  shipOrientation?: [number, number, number, number];
  shipPhase?: 'space' | 'warp' | 'orbit' | 'landed';
  selectedTarget: number;
  throttleUnlocked: boolean;
  warpCoverOpen: boolean;
  landed: boolean;
  rampOpen: boolean;
  suitActive: boolean;
  windowStates: Record<string, boolean>;
  toggles: Record<string, boolean>;
  savedAt: number;
}

export interface Interaction {
  id: string;
  object: THREE.Object3D;
  label: string | (() => string);
  range?: number;
  enabled?: () => boolean;
  onHover?: (active: boolean) => void;
  onInteract: () => void;
}

export interface DynamicSystem {
  update(delta: number, elapsed: number): void;
}

export interface RoomDefinition {
  id: string;
  label: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  side: 'left' | 'right' | 'center';
  color: number;
  category: 'crew' | 'science' | 'engineering' | 'utility' | 'command';
}

export interface CelestialTarget {
  name: string;
  subtitle: string;
  color: number;
  radius: number;
  distance: number;
  position: THREE.Vector3;
  fuelCost: number;
  isDestination?: boolean;
}
