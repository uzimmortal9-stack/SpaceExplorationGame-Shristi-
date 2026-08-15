/**
 * Ship layout — the single source of truth for the deck plan.
 *
 * The Aurora Drift is a long-duration survey ship laid out on one deck along a
 * central spine corridor, with the bridge forward (-Z) and the cargo ramp aft
 * (+Z). Every room is an axis-aligned rectangle on a 1 m grid, which keeps
 * collision exact and doorways guaranteed walkable.
 *
 *            -Z  (bow / bridge)
 *             │
 *   port  ────┼────  starboard
 *      (-X)   │   (+X)
 *             │
 *            +Z  (stern / cargo ramp)
 */

export interface RoomDef {
  id: string;
  name: string;
  /** Signage subtitle. */
  subtitle: string;
  /** Rectangle in metres: x0 < x1, z0 < z1. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Interior lighting mood. */
  mood: 'command' | 'utility' | 'crew' | 'medical' | 'engineering' | 'science' | 'cargo' | 'service';
  /** Base ceiling height. */
  ceiling?: number;
}

export interface DoorwayDef {
  id: string;
  /** Rooms it joins (for signage / nav). */
  from: string;
  to: string;
  /** Centre of the opening. */
  x: number;
  z: number;
  /** Opening runs along this axis. */
  axis: 'x' | 'z';
  width?: number;
  interlock?: string;
  locked?: boolean;
}

export const DECK_HEIGHT = 3.0;
export const CORRIDOR_HALF = 2.0;
/** Spine corridor runs along Z at x in [-2, 2]. */
export const SPINE_Z0 = -16;
export const SPINE_Z1 = 30;

export const ROOMS: RoomDef[] = [
  // ---- forward: command ---------------------------------------------------
  { id: 'bridge', name: 'BRIDGE', subtitle: 'Flight Command', x0: -9, z0: -30, x1: 9, z1: -16, mood: 'command', ceiling: 3.2 },
  { id: 'defense', name: 'DEFENCE', subtitle: 'Security & Turret Control', x0: -15, z0: -16, x1: -3, z1: -8, mood: 'utility' },
  { id: 'comms', name: 'COMMS', subtitle: 'Briefing & Long Range', x0: 3, z0: -16, x1: 15, z1: -8, mood: 'command' },

  // ---- midship: crew ------------------------------------------------------
  { id: 'cabin_a', name: 'CABIN 01', subtitle: 'Cmdr. R. Okonkwo', x0: -15, z0: -6, x1: -3, z1: 1, mood: 'crew' },
  { id: 'cabin_b', name: 'CABIN 02', subtitle: 'Sci. Off. L. Meier', x0: -15, z0: 3, x1: -3, z1: 10, mood: 'crew' },
  { id: 'washroom_a', name: 'WASHROOM A', subtitle: 'Hygiene Module', x0: -15, z0: 12, x1: -9, z1: 18, mood: 'service' },
  { id: 'washroom_b', name: 'WASHROOM B', subtitle: 'Hygiene Module', x0: -9, z0: 12, x1: -3, z1: 18, mood: 'service' },

  { id: 'lounge', name: 'LOUNGE', subtitle: 'Crew Recreation', x0: 3, z0: -6, x1: 15, z1: 2, mood: 'crew' },
  { id: 'galley', name: 'GALLEY', subtitle: 'Dining & Food Prep', x0: 3, z0: 4, x1: 15, z1: 12, mood: 'crew' },
  { id: 'medical', name: 'MEDICAL', subtitle: 'Infirmary & Cryo', x0: 3, z0: 14, x1: 15, z1: 22, mood: 'medical' },

  // ---- aft: technical -----------------------------------------------------
  { id: 'science', name: 'SCIENCE LAB', subtitle: 'Analysis & Samples', x0: -15, z0: 20, x1: -3, z1: 28, mood: 'science' },
  { id: 'storage', name: 'STORAGE', subtitle: 'Supplies & Tools', x0: -15, z0: 30, x1: -3, z1: 38, mood: 'utility' },
  { id: 'fuel', name: 'FUEL PROCESSING', subtitle: 'Hydrogen Handling', x0: 3, z0: 24, x1: 15, z1: 32, mood: 'engineering' },
  { id: 'lifesupport', name: 'LIFE SUPPORT', subtitle: 'Atmosphere & Water', x0: 3, z0: 34, x1: 15, z1: 41, mood: 'engineering' },
  { id: 'power', name: 'POWER DIST.', subtitle: 'Grid & Batteries', x0: -15, z0: 40, x1: -3, z1: 47, mood: 'engineering' },
  { id: 'reactor', name: 'REACTOR', subtitle: 'Primary Core — Hazard', x0: 3, z0: 43, x1: 15, z1: 51, mood: 'engineering', ceiling: 4.2 },
  { id: 'warp', name: 'WARP DRIVE', subtitle: 'FTL Core & Lever', x0: -9, z0: 49, x1: 9, z1: 62, mood: 'engineering', ceiling: 4.6 },
  { id: 'engineering', name: 'ENGINEERING', subtitle: 'Workshop & Maintenance', x0: -15, z0: 49, x1: -9, z1: 58, mood: 'engineering' },
  { id: 'cargo', name: 'CARGO BAY', subtitle: 'Airlock & Boarding Ramp', x0: -10, z0: 64, x1: 10, z1: 78, mood: 'cargo', ceiling: 4.2 },
];

export const ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));

/** Corridor rectangles (spine + branches), used for floor/ceiling/collision. */
export const CORRIDORS: Array<{ x0: number; z0: number; x1: number; z1: number }> = [
  { x0: -CORRIDOR_HALF, z0: -16, x1: CORRIDOR_HALF, z1: 64 }, // main spine
  { x0: -15, z0: -8, x1: -CORRIDOR_HALF, z1: -6 },            // to defence
  { x0: CORRIDOR_HALF, z0: -8, x1: 15, z1: -6 },              // to comms
  { x0: -15, z0: 1, x1: -CORRIDOR_HALF, z1: 3 },              // cabins link
  { x0: -15, z0: 10, x1: -CORRIDOR_HALF, z1: 12 },            // to washrooms
  { x0: -15, z0: 18, x1: -CORRIDOR_HALF, z1: 20 },            // to science
  { x0: -15, z0: 38, x1: -CORRIDOR_HALF, z1: 40 },            // to power
  { x0: CORRIDOR_HALF, z0: 22, x1: 15, z1: 24 },              // to fuel
  { x0: CORRIDOR_HALF, z0: 32, x1: 15, z1: 34 },              // to life support
  { x0: CORRIDOR_HALF, z0: 41, x1: 15, z1: 43 },              // to reactor
  { x0: -15, z0: 47, x1: -CORRIDOR_HALF, z1: 49 },            // to engineering
  { x0: -CORRIDOR_HALF, z0: 62, x1: CORRIDOR_HALF, z1: 64 },  // warp -> cargo
];

export const DOORWAYS: DoorwayDef[] = [
  { id: 'd_bridge', from: 'bridge', to: 'spine', x: 0, z: -16, axis: 'x', width: 3.2 },
  { id: 'd_defense', from: 'defense', to: 'spine', x: -3, z: -7, axis: 'z', width: 2.4 },
  { id: 'd_comms', from: 'comms', to: 'spine', x: 3, z: -7, axis: 'z', width: 2.4 },
  { id: 'd_cabin_a', from: 'cabin_a', to: 'spine', x: -3, z: -2.5, axis: 'z', width: 2.2 },
  { id: 'd_cabin_b', from: 'cabin_b', to: 'spine', x: -3, z: 6.5, axis: 'z', width: 2.2 },
  { id: 'd_wash_a', from: 'washroom_a', to: 'spine', x: -12, z: 12, axis: 'x', width: 1.8 },
  { id: 'd_wash_b', from: 'washroom_b', to: 'spine', x: -6, z: 12, axis: 'x', width: 1.8 },
  { id: 'd_lounge', from: 'lounge', to: 'spine', x: 3, z: -2, axis: 'z', width: 2.4 },
  { id: 'd_galley', from: 'galley', to: 'spine', x: 3, z: 8, axis: 'z', width: 2.4 },
  { id: 'd_medical', from: 'medical', to: 'spine', x: 3, z: 18, axis: 'z', width: 2.4 },
  { id: 'd_science', from: 'science', to: 'spine', x: -3, z: 24, axis: 'z', width: 2.4 },
  { id: 'd_storage', from: 'storage', to: 'spine', x: -3, z: 34, axis: 'z', width: 2.4 },
  { id: 'd_fuel', from: 'fuel', to: 'spine', x: 3, z: 28, axis: 'z', width: 2.4 },
  { id: 'd_lifesupport', from: 'lifesupport', to: 'spine', x: 3, z: 37.5, axis: 'z', width: 2.4 },
  { id: 'd_power', from: 'power', to: 'spine', x: -3, z: 43.5, axis: 'z', width: 2.4 },
  { id: 'd_reactor', from: 'reactor', to: 'spine', x: 3, z: 47, axis: 'z', width: 2.4 },
  { id: 'd_engineering', from: 'engineering', to: 'spine', x: -9, z: 53.5, axis: 'x', width: 2.2 },
  { id: 'd_warp', from: 'warp', to: 'spine', x: 0, z: 49, axis: 'x', width: 3.0 },
  { id: 'd_cargo', from: 'cargo', to: 'spine', x: 0, z: 64, axis: 'x', width: 3.2 },
];

/** Where the player spawns at game start (crew cabin 01, by the bed). */
export const SPAWN = { x: -8, y: 0, z: -2, yaw: Math.PI * 0.5 };

/** Pilot seat anchors on the bridge. */
export const PILOT_SEAT = { x: -1.5, y: 0, z: -24.5 };
export const COPILOT_SEAT = { x: 1.5, y: 0, z: -24.5 };

/** Cargo ramp hinge line; the ramp rotates down to the surface from here. */
export const RAMP_HINGE = { x: 0, y: 0, z: 78 };
export const RAMP_LENGTH = 9.0;
export const RAMP_WIDTH = 5.0;

export function roomAt(x: number, z: number): RoomDef | null {
  for (const r of ROOMS) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  }
  return null;
}

export function inCorridor(x: number, z: number): boolean {
  return CORRIDORS.some((c) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1);
}

/** All walkable rectangles (rooms + corridors) — used for floor generation. */
export function walkableRects(): Array<{ x0: number; z0: number; x1: number; z1: number; ceiling: number }> {
  const out = ROOMS.map((r) => ({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, ceiling: r.ceiling ?? DECK_HEIGHT }));
  for (const c of CORRIDORS) out.push({ ...c, ceiling: DECK_HEIGHT });
  return out;
}

export const ROOM_TELEPORTS: Array<{ id: string; label: string; x: number; z: number; yaw: number }> = [
  { id: 'bridge', label: 'Bridge', x: 0, z: -22, yaw: Math.PI },
  { id: 'cabin_a', label: 'Crew Cabin 01', x: -8, z: -2, yaw: Math.PI / 2 },
  { id: 'lounge', label: 'Lounge', x: 9, z: -2, yaw: -Math.PI / 2 },
  { id: 'galley', label: 'Galley', x: 9, z: 8, yaw: -Math.PI / 2 },
  { id: 'medical', label: 'Medical Bay', x: 9, z: 18, yaw: -Math.PI / 2 },
  { id: 'science', label: 'Science Lab', x: -9, z: 24, yaw: Math.PI / 2 },
  { id: 'storage', label: 'Storage', x: -9, z: 34, yaw: Math.PI / 2 },
  { id: 'fuel', label: 'Fuel Processing', x: 9, z: 28, yaw: -Math.PI / 2 },
  { id: 'reactor', label: 'Reactor', x: 9, z: 47, yaw: -Math.PI / 2 },
  { id: 'warp', label: 'Warp Drive', x: 0, z: 55, yaw: 0 },
  { id: 'cargo', label: 'Cargo Bay', x: 0, z: 70, yaw: 0 },
];
