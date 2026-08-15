/**
 * Ship — assembles the interior: structure, lighting, doors, every room's
 * props and interactions, and the per-frame tick that drives them.
 */

import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';

import type { AssetLoader } from '../../assets/assetLoader';
import type { AudioEngine } from '../../core/audio';
import type { QualityProfile } from '../../core/renderer';
import type { GameState } from '../../core/state';
import { CollisionWorld } from '../../systems/collision';
import { DoorSystem } from '../../systems/doors';
import type { InteractionSystem } from '../../systems/interaction';
import type { MaterialLibrary } from '../materials';
import { buildInteriorLighting, type InteriorLights } from './lighting';
import { DECK_HEIGHT, DOORWAYS, PILOT_SEAT } from './layout';
import { PropPlacer } from './props';
import {
  addSignage,
  furnishBridge,
  furnishCabin,
  furnishStorage,
  type RoomCtx,
  type RoomRuntime,
} from './rooms';
import {
  furnishComms,
  furnishDefense,
  furnishGalley,
  furnishLounge,
  furnishMedical,
  furnishScience,
  furnishWashroom,
} from './rooms2';
import {
  furnishCargo,
  furnishCorridors,
  furnishEngineering,
  furnishFuel,
  furnishLifeSupport,
  furnishPower,
  furnishReactor,
  furnishWarp,
  type CargoRefs,
} from './rooms3';
import { buildStructure } from './structure';

export interface ShipDeps {
  assets: AssetLoader;
  mats: MaterialLibrary;
  audio: AudioEngine;
  state: GameState;
  interact: InteractionSystem;
  profile: QualityProfile;
}

export class Ship {
  readonly group = new Group();
  readonly collision = new CollisionWorld();
  readonly doors: DoorSystem;
  readonly lights: InteriorLights;
  readonly runtime: RoomRuntime;
  readonly cargo: CargoRefs;

  private elapsed = 0;

  constructor(private readonly deps: ShipDeps) {
    this.group.name = 'ship';
    const { assets, mats, audio, state, interact, profile } = deps;

    this.doors = new DoorSystem(audio, this.collision);
    this.runtime = { group: new Group(), tickers: [], refs: {} };
    this.runtime.group.name = 'ship-fitout';

    // ---- shell ------------------------------------------------------------
    const structure = buildStructure(assets, mats, this.collision);
    this.group.add(structure.group);
    this.group.add(this.runtime.group);

    // ---- lighting ---------------------------------------------------------
    this.lights = buildInteriorLighting(profile);
    this.group.add(this.lights.group);

    // ---- doors ------------------------------------------------------------
    for (const d of DOORWAYS) {
      const frame = structure.doorFrames.get(d.id);
      if (!frame) continue;
      const width = frame.width;
      const leafW = width / 2;
      const along = new Vector3(d.axis === 'x' ? 1 : 0, 0, d.axis === 'z' ? 1 : 0);

      const makeLeaf = (sign: number): Mesh => {
        const leaf = new Mesh(
          new BoxGeometry(
            d.axis === 'x' ? leafW : 0.16,
            DECK_HEIGHT - 0.12,
            d.axis === 'z' ? leafW : 0.16,
          ),
          new MeshStandardMaterial({
            color: 0x39424d,
            roughness: 0.4,
            metalness: 0.78,
            emissive: 0x0a1a22,
            emissiveIntensity: 0.25,
          }),
        );
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        leaf.position.set(
          d.x + (d.axis === 'x' ? (sign * leafW) / 2 : 0),
          (DECK_HEIGHT - 0.12) / 2,
          d.z + (d.axis === 'z' ? (sign * leafW) / 2 : 0),
        );
        this.runtime.group.add(leaf);
        return leaf;
      };

      const left = makeLeaf(-1);
      const right = makeLeaf(1);

      const collider = this.collision.addBox(
        d.x, DECK_HEIGHT / 2, d.z,
        d.axis === 'x' ? width : 0.4,
        DECK_HEIGHT,
        d.axis === 'z' ? width : 0.4,
        `door:${d.id}`,
      );

      const clearance = new Box3(
        new Vector3(
          d.x - (d.axis === 'x' ? width / 2 : 1.0),
          0,
          d.z - (d.axis === 'z' ? width / 2 : 1.0),
        ),
        new Vector3(
          d.x + (d.axis === 'x' ? width / 2 : 1.0),
          DECK_HEIGHT,
          d.z + (d.axis === 'z' ? width / 2 : 1.0),
        ),
      );

      this.doors.add({
        id: d.id,
        leaves: [left, right],
        travel: [
          along.clone().multiplyScalar(-leafW * 0.98),
          along.clone().multiplyScalar(leafW * 0.98),
        ],
        center: new Vector3(d.x, 1.2, d.z),
        collider,
        clearance,
        triggerRadius: 3.6,
        openTime: 0.9,
        holdTime: 1.8,
        interlock: d.interlock,
        locked: d.locked,
      });

      // manual override button beside each door
      interact.register({
        id: `door_btn_${d.id}`,
        position: new Vector3(
          d.x + (d.axis === 'x' ? width / 2 + 0.5 : 0),
          1.35,
          d.z + (d.axis === 'z' ? width / 2 + 0.5 : 0),
        ),
        radius: 1.5,
        kind: 'button',
        label: 'Door override',
        onUse: () => {
          const door = this.doors.get(d.id);
          if (!door) return 'Door override';
          audio.uiClick();
          if (door.openAmount > 0.5) door.requestClose();
          else door.requestOpen();
          return 'Door override';
        },
      });
    }

    // ---- fit-out ----------------------------------------------------------
    const props = new PropPlacer(assets, this.collision);
    this.runtime.group.add(props.root);

    const ctx: RoomCtx = {
      assets, mats, props, collision: this.collision,
      interact, audio, state, runtime: this.runtime,
    };

    addSignage(ctx);
    furnishBridge(ctx);
    furnishCabin(ctx, 'cabin_a');
    furnishCabin(ctx, 'cabin_b');
    furnishWashroom(ctx, 'washroom_a');
    furnishWashroom(ctx, 'washroom_b');
    furnishLounge(ctx);
    furnishGalley(ctx);
    furnishMedical(ctx);
    furnishScience(ctx);
    furnishComms(ctx);
    furnishDefense(ctx);
    furnishStorage(ctx);
    furnishFuel(ctx);
    furnishLifeSupport(ctx);
    furnishPower(ctx);
    furnishReactor(ctx);
    furnishWarp(ctx);
    furnishEngineering(ctx);
    this.cargo = furnishCargo(ctx);
    furnishCorridors(ctx);

    // pilot seat interaction is owned by the flight system, but the anchor
    // lives here so the geometry and the prompt cannot drift apart.
    interact.register({
      id: 'pilot_seat',
      position: new Vector3(PILOT_SEAT.x, 0.9, PILOT_SEAT.z + 0.6),
      radius: 2.2,
      kind: 'sit',
      label: 'Take the pilot seat',
      onUse: () => {
        window.dispatchEvent(new CustomEvent('aurora:sit'));
        return 'Take the pilot seat';
      },
    });
  }

  /** Ambient interior audio beds, started once audio is unlocked. */
  startAmbience(): void {
    const { audio } = this.deps;
    audio.loop('ship_hum', 'hum');
    audio.setLoopGain('ship_hum', 0.5, 2.5);
    audio.loop('ship_air', 'air');
    audio.setLoopGain('ship_air', 0.16, 3);
  }

  update(dt: number, playerPos: Vector3, playerRadius: number, playerHeight: number): void {
    this.elapsed += dt;
    this.doors.update(dt, playerPos, playerRadius, playerHeight);
    this.lights.update(dt);
    for (const t of this.runtime.tickers) t(dt, this.elapsed);

    // proximity audio: the reactor hum swells as you approach it
    const { audio } = this.deps;
    if (audio.isRunning) {
      const dReactor = Math.hypot(playerPos.x - 9, playerPos.z - 47);
      const dWarp = Math.hypot(playerPos.x - 0, playerPos.z - 55);
      const near = Math.min(dReactor, dWarp);
      if (near < 18) {
        audio.loop('reactor', 'reactor');
        audio.setLoopGain('reactor', Math.max(0, 1 - near / 18) * 0.5, 0.6);
      } else {
        audio.setLoopGain('reactor', 0, 1.0);
      }
    }
  }

  dispose(): void {
    this.lights.dispose();
    this.doors.clear();
    this.collision.clear();
    this.group.clear();
  }
}
