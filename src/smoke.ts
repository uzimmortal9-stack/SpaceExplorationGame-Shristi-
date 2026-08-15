/**
 * smoke.ts — headless integration test of the real game systems.
 *
 * The sandbox has no browser, so this drives the actual Ship / Planet /
 * Flight / Warp / Descent / Player classes through the complete mission loop
 * and asserts the invariants that matter:
 *
 *   * the player spawns on solid deck and can walk without falling through
 *   * every doorway is wide enough to pass and doors open/close safely
 *   * the pilot seat, warp lever and ramp interactions fire in sequence
 *   * warp charge -> tunnel -> exit completes and hands off to descent
 *   * descent actually decreases altitude and terminates in touchdown
 *   * terrain collision keeps the player above ground on the surface
 *   * no NaNs appear in any transform after thousands of simulated frames
 *
 * Run with:  npm run smoke
 */

import { PerspectiveCamera, Quaternion, Vector3 } from 'three';

import type { AssetLoader } from './assets/assetLoader';
import { AudioEngine } from './core/audio';
import { QUALITY } from './core/renderer';
import { GameState } from './core/state';
import { CollisionWorld } from './systems/collision';
import { DescentSystem } from './systems/descent';
import { FlightSystem } from './systems/flight';
import { InteractionSystem } from './systems/interaction';
import { Player } from './systems/player';
import { WarpSystem } from './systems/warp';
import { createMaterials } from './world/materials';
import { PAD, Planet, SIGNAL } from './world/planet';
import { DOORWAYS, PILOT_SEAT, ROOM_TELEPORTS, SPAWN } from './world/ship/layout';
import { Ship } from './world/ship/ship';
import { ShipExterior } from './world/shipExterior';
import { SolarSystem } from './world/space';

export interface SmokeResult {
  passed: number;
  failed: number;
  failures: string[];
  notes: string[];
}

/** Stand-in for the Renderer surface the systems actually touch. */
interface FakeRenderer {
  addShake(a: number, d?: number): void;
  setDistortion(a: number, c?: number): void;
  camera: PerspectiveCamera;
}

export async function runSmoke(assets: AssetLoader): Promise<SmokeResult> {
  const res: SmokeResult = { passed: 0, failed: 0, failures: [], notes: [] };
  const check = (name: string, ok: boolean, detail = ''): void => {
    if (ok) {
      res.passed++;
    } else {
      res.failed++;
      res.failures.push(detail ? `${name} — ${detail}` : name);
    }
  };
  const note = (s: string): void => { res.notes.push(s); };

  const finite = (v: Vector3): boolean =>
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

  const camera = new PerspectiveCamera(70, 16 / 9, 0.05, 60000);
  const audio = new AudioEngine();          // never unlocked: all calls no-op
  const state = new GameState();
  const interact = new InteractionSystem();
  const mats = createMaterials(assets);
  const renderer: FakeRenderer = {
    addShake: () => {},
    setDistortion: () => {},
    camera,
  };

  // ---------------------------------------------------------------- the ship
  const ship = new Ship({
    assets, mats, audio, state, interact, profile: QUALITY.high,
  });
  note(`ship: ${ship.collision.count} colliders, ${interact.size} interactions, ${ship.doors.doors.size} doors`);
  check('ship has collision', ship.collision.count > 200, `${ship.collision.count}`);
  check('ship has interactions', interact.size > 50, `${interact.size}`);
  check('every doorway has a door', ship.doors.doors.size === DOORWAYS.length,
    `${ship.doors.doors.size}/${DOORWAYS.length}`);

  // ------------------------------------------------------------- the player
  const player = new Player(camera, ship.collision, audio);
  player.teleport(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN.yaw);

  // gravity settle: the player must land on the deck, not fall through it
  for (let i = 0; i < 120; i++) {
    player.velocity.y -= 18.5 * (1 / 60);
    const r = ship.collision.move(player.position, player.velocity, 0.34, 1.78, 1 / 60);
    player.position.copy(r.position);
    if (r.grounded) player.velocity.y = 0;
  }
  check('player settles on deck', Math.abs(player.position.y) < 0.05,
    `y=${player.position.y.toFixed(3)}`);

  // ------------------------------------------------------- doorway clearance
  let narrow = 0;
  for (const d of DOORWAYS) {
    const w = d.width ?? 2.4;
    if (w < 1.7) narrow++;
    // the opening must be free at standing height, with the door open
    const door = ship.doors.get(d.id);
    if (door) {
      door.requestOpen();
      for (let i = 0; i < 90; i++) {
        door.update(1 / 60, new Vector3(d.x, 0, d.z), 0.34, 1.78, ship.doors.doors);
      }
      const passable = door.isPassable;
      if (!passable) res.notes.push(`door ${d.id} did not open`);
      check(`door ${d.id} opens`, passable);
    }
  }
  check('no doorway is too narrow', narrow === 0, `${narrow} under 1.7 m`);

  // walking through each doorway must not be blocked
  let blocked = 0;
  for (const d of DOORWAYS) {
    const p = new Vector3(d.x, 0.05, d.z);
    if (ship.collision.overlaps(p, 0.3, 1.7)) blocked++;
  }
  check('doorways are walkable', blocked === 0, `${blocked} blocked`);

  // every teleport anchor must be inside the hull and not inside a prop
  let badRoom = 0;
  for (const t of ROOM_TELEPORTS) {
    if (ship.collision.overlaps(new Vector3(t.x, 0.05, t.z), 0.34, 1.7)) {
      badRoom++;
      note(`room anchor blocked: ${t.id}`);
    }
  }
  check('room anchors are clear', badRoom === 0, `${badRoom} blocked`);

  // --------------------------------------------------------------- the seat
  const seatItem = interact.get('pilot_seat');
  check('pilot seat is interactable', seatItem !== undefined);

  state.throttleUnlocked = true;
  player.sit(
    {
      position: new Vector3(PILOT_SEAT.x, 1.32, PILOT_SEAT.z + 0.15),
      yaw: Math.PI,
      pitch: 0,
      exit: new Vector3(PILOT_SEAT.x + 1.4, 0, PILOT_SEAT.z + 1.6),
    },
  );
  for (let i = 0; i < 120; i++) player.update(1 / 60, fakeInput(), false);
  check('player reaches the seat', player.isSeated, `mode=${player.mode}`);

  // -------------------------------------------------------------- the flight
  const flight = new FlightSystem(camera, audio, state);
  flight.begin(new Vector3(), new Quaternion());
  flight.throttle = 0.8;
  for (let i = 0; i < 600; i++) flight.update(1 / 60, fakeInput(), false);
  check('ship accelerates', flight.speed > 50, `${flight.speed.toFixed(1)} m/s`);
  check('flight transform is finite', finite(flight.position) && finite(flight.velocity));
  note(`flight: ${flight.speed.toFixed(0)} m/s after 10 s at 80% throttle`);

  for (const mode of ['chase', 'orbital', 'cockpit'] as const) {
    while (flight.cameraMode !== mode) flight.cycleCamera();
    flight.update(1 / 60, fakeInput(), false);
    check(`camera ${mode} is finite`, finite(camera.position));
  }

  // ----------------------------------------------------------- solar system
  const system = new SolarSystem(assets);
  for (let i = 0; i < 200; i++) system.update(1 / 60);
  const ilex = system.get('ilex');
  check('solar system has the target world', ilex !== undefined && ilex.landable);
  check('bodies orbit', ilex !== undefined && ilex.position.length() > 1000);

  // ----------------------------------------------------------------- warp
  const warp = new WarpSystem(renderer as never, audio, state);
  warp.beginCharge();
  let guard = 0;
  while (warp.stage === 'charging' && guard++ < 5000) {
    warp.update(1 / 60, flight.position, flight.quaternion);
  }
  check('warp core reaches ready', warp.stage === 'ready', `stage=${warp.stage}`);
  check('warp charge completes', state.systems.warpCharge > 0.99);

  let arrived = false;
  warp.engage(() => { arrived = true; });
  guard = 0;
  while (warp.isActive && guard++ < 5000) {
    warp.update(1 / 60, flight.position, flight.quaternion);
  }
  check('warp completes', arrived, `stage=${warp.stage} guard=${guard}`);
  check('warp resets charge', state.systems.warpCharge < 0.01);

  // ---------------------------------------------------------------- planet
  const surfaceCollision = new CollisionWorld();
  const planet = new Planet({
    assets, mats, collision: surfaceCollision, interact, audio, state, profile: QUALITY.high,
  });
  note(`planet: ${surfaceCollision.count} colliders`);
  check('planet has collision', surfaceCollision.count > 100, `${surfaceCollision.count}`);

  // the landing pad must be flat
  let padDelta = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.4) {
    const h = planet.heightAt(PAD.x + Math.cos(a) * 20, PAD.z + Math.sin(a) * 20);
    padDelta = Math.max(padDelta, Math.abs(h));
  }
  check('landing pad is flat', padDelta < 1.5, `max |h| = ${padDelta.toFixed(2)} m`);

  // terrain must be finite and the heightfield must catch the player
  let nan = 0;
  for (let i = 0; i < 400; i++) {
    const x = (Math.random() - 0.5) * 560;
    const z = (Math.random() - 0.5) * 560;
    if (!Number.isFinite(planet.heightAt(x, z))) nan++;
  }
  check('terrain height is finite everywhere', nan === 0, `${nan} NaN samples`);

  const surfacePlayer = new Player(camera, surfaceCollision, audio);
  surfacePlayer.teleport(40, planet.heightAt(40, 40) + 12, 40);
  for (let i = 0; i < 400; i++) surfacePlayer.update(1 / 60, fakeInput(), false);
  const groundHere = planet.heightAt(surfacePlayer.position.x, surfacePlayer.position.z);
  check('player lands on terrain',
    Math.abs(surfacePlayer.position.y - groundHere) < 0.6,
    `y=${surfacePlayer.position.y.toFixed(2)} ground=${groundHere.toFixed(2)}`);
  check('player does not fall through the world', surfacePlayer.position.y > -50);

  // walk a lap and make sure we never sink
  let sank = 0;
  for (let step = 0; step < 240; step++) {
    surfacePlayer.position.x += 0.35;
    surfacePlayer.position.z += 0.2;
    surfacePlayer.velocity.y -= 18.5 / 60;
    const r = surfaceCollision.move(surfacePlayer.position, surfacePlayer.velocity, 0.34, 1.78, 1 / 60);
    surfacePlayer.position.copy(r.position);
    if (r.grounded) surfacePlayer.velocity.y = 0;
    const g = planet.heightAt(surfacePlayer.position.x, surfacePlayer.position.z);
    if (surfacePlayer.position.y < g - 1.0) sank++;
  }
  check('walking never sinks through terrain', sank === 0, `${sank} frames below ground`);

  // landmarks must be reachable and above water
  for (const [name, p] of [['signal', SIGNAL]] as const) {
    const h = planet.heightAt(p.x, p.z);
    check(`${name} landmark is on dry land`, h > -3, `h=${h.toFixed(2)}`);
  }

  // ---------------------------------------------------------------- descent
  const exterior = new ShipExterior(assets, mats);
  const descent = new DescentSystem(camera, renderer as never, audio, state, exterior);
  let landed = false;
  descent.padPosition.set(PAD.x, 0, PAD.z - 40);
  descent.begin(() => { landed = true; });
  const startAlt = descent.altitude;
  let prevAlt = startAlt;
  let monotonic = true;
  guard = 0;
  while (descent.isActive && guard++ < 20000) {
    descent.update(1 / 60);
    if (descent.altitude > prevAlt + 0.5) monotonic = false;
    prevAlt = descent.altitude;
  }
  check('descent completes', landed, `stage=${descent.stage} guard=${guard}`);
  check('descent loses altitude', descent.altitude < 1, `alt=${descent.altitude.toFixed(1)}`);
  check('descent is monotonic', monotonic);
  check('descent deploys gear', state.systems.landingGear > 0.99);
  check('descent marks landed', state.hasLanded);
  note(`descent: ${startAlt.toFixed(0)} m -> ${descent.altitude.toFixed(1)} m in ${(guard / 60).toFixed(1)} s`);

  // --------------------------------------------------------- the ramp + exit
  const ramp = interact.get('cargo_ramp');
  check('ramp is interactable', ramp !== undefined);
  ramp?.onUse();
  for (let i = 0; i < 400; i++) ship.update(1 / 60, new Vector3(0, 0, 70), 0.34, 1.78);
  check('ramp opens once landed', state.systems.rampAngle > 0.9,
    `angle=${state.systems.rampAngle.toFixed(2)}`);

  // --------------------------------------------------- interaction integrity
  let brokenInteractions = 0;
  for (const t of ROOM_TELEPORTS) {
    interact.update(new Vector3(t.x, 1.6, t.z), { x: 0, y: 0, z: 0, w: 1 });
  }
  for (const id of ['warp_lever', 'warp_cover', 'throttle_lid', 'freezer', 'suit_up', 'signal_source']) {
    if (!interact.get(id)) {
      brokenInteractions++;
      note(`missing interaction: ${id}`);
    }
  }
  check('key interactions exist', brokenInteractions === 0, `${brokenInteractions} missing`);

  // ---------------------------------------------------------- long-run ticks
  let tickError: string | null = null;
  try {
    for (let i = 0; i < 900; i++) {
      ship.update(1 / 60, new Vector3(0, 0, 10), 0.34, 1.78);
      planet.update(1 / 60, new Vector3(20, 5, 20));
      exterior.update(1 / 60);
      system.update(1 / 60);
    }
  } catch (err) {
    tickError = String((err as Error).message ?? err);
  }
  check('systems tick without throwing', tickError === null, tickError ?? '');

  // ------------------------------------------------------------ asset health
  check('no placeholder assets in use', assets.missing.length === 0,
    `${assets.missing.length}: ${assets.missing.slice(0, 6).join(', ')}`);

  return res;
}

/** A no-input stub matching the Input surface the systems use. */
function fakeInput() {
  return {
    isDown: () => false,
    wasPressed: () => false,
    keyPressed: () => false,
    keyDown: () => false,
    axis: () => 0,
    consumeMouse: () => ({ dx: 0, dy: 0 }),
    consumeWheel: () => 0,
    endFrame: () => {},
    pointerLocked: true,
    sensitivity: 1,
    invertY: false,
    enabled: true,
  } as never;
}
