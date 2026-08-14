import * as THREE from 'three';
import type { RoomDefinition } from '../types';
import type { InteractionSystem } from './InteractionSystem';
import type { CollisionSystem } from './CollisionSystem';
import type { AudioEngine } from '../core/AudioEngine';
import type { AmbientSystem } from '../systems/AmbientSystem';
import type { DoorSystem } from '../systems/DoorSystem';
import type { Animator } from '../core/Animator';
import { PropFactory } from './PropFactory';
import { RoomBuilder } from './RoomBuilder';
import { normalizedBox, normalizedCylinder } from './geometryAlignment';
import { COLORS, emissive, glass, matte, metal, shared } from './materials';
import { WorldPanel } from './WorldPanel';
import { damp } from '../core/Tween';

export interface ShipInteriorCallbacks {
  toast(message: string): void;
  onSitPilot(): void;
  onCycleTarget(): void;
  onThrottleUnlocked(): void;
  onWarpCover(open: boolean): void;
  onWarpLever(): void;
  onEntryRequested(): void;
  onRampRequested(): void;
  onSuitChanged(active: boolean): void;
  canWarp(): boolean;
  canEnterAtmosphere(): boolean;
  canOpenRamp(): boolean;
}

export interface FlightTelemetry {
  speed: number;
  throttle: number;
  fuel: number;
  hull: number;
  target: string;
  distance: number;
  locked: boolean;
  warp: string;
  gear: boolean;
  altitude: number;
}

export class ShipInterior {
  readonly root = new THREE.Group();
  readonly pilotView = new THREE.Object3D();
  readonly props: PropFactory;
  readonly roomDefinitions: RoomDefinition[];
  readonly roomCenters = new Map<string, THREE.Vector3>();
  rampOpen = false;
  throttleUnlocked = false;
  warpCoverOpen = false;
  private interaction: InteractionSystem;
  private collision: CollisionSystem;
  private callbacks: ShipInteriorCallbacks;
  private ambient: AmbientSystem;
  private animator: Animator;
  private statusPanel!: WorldPanel;
  private navPanel!: WorldPanel;
  private throttleLid!: THREE.Mesh;
  private throttleButton!: THREE.Mesh;
  private warpCover!: THREE.Mesh;
  private warpLever!: THREE.Group;
  private rampHinge!: THREE.Group;
  private outerHatchLeft!: THREE.Mesh;
  private outerHatchRight!: THREE.Mesh;
  private rampProgress = 0;
  private airlockProgress = 0;
  private telemetry: FlightTelemetry = {
    speed: 0, throttle: 0, fuel: 100, hull: 100, target: 'NO TARGET', distance: 0,
    locked: false, warp: 'STANDBY', gear: false, altitude: 0,
  };
  private displayTelemetry = { speed: 0, throttle: 0, fuel: 100, altitude: 0 };
  private displayTimer = 0;

  constructor(
    interaction: InteractionSystem,
    collision: CollisionSystem,
    audio: AudioEngine,
    ambient: AmbientSystem,
    doors: DoorSystem,
    animator: Animator,
    callbacks: ShipInteriorCallbacks,
  ) {
    this.root.name = 'CSV Astraea Interior';
    this.interaction = interaction;
    this.collision = collision;
    this.callbacks = callbacks;
    this.ambient = ambient;
    this.animator = animator;
    this.props = new PropFactory(interaction, ambient, animator, {
      toast: callbacks.toast,
      suitChanged: callbacks.onSuitChanged,
    });

    this.roomDefinitions = this.createRoomDefinitions();
    const builder = new RoomBuilder(this.props, doors);
    for (const definition of this.roomDefinitions) {
      const room = builder.build(definition);
      this.root.add(room);
      this.roomCenters.set(definition.id, new THREE.Vector3(definition.x, 0, definition.z));
      this.decorateRoom(definition, room);
    }
    this.buildCorridor();
    this.buildCockpit(doors);
    this.buildCargoBay(doors);
    this.buildUtilityDetails();
    this.root.updateMatrixWorld(true);
    this.registerStaticColliders();
  }

  private createRoomDefinitions(): RoomDefinition[] {
    const rows: Array<[number, [string, string, RoomDefinition['category'], number], [string, string, RoomDefinition['category'], number]]> = [
      [-40, ['defense', 'DEFENSE / SECURITY', 'command', COLORS.red], ['meeting', 'COMMS / BRIEFING', 'command', COLORS.cyan]],
      [-28, ['medical', 'MEDICAL BAY', 'science', 0x82eaff], ['science', 'SCIENCE LAB', 'science', 0x62ffae]],
      [-16, ['cabin-a', 'CREW CABIN A', 'crew', COLORS.warm], ['cabin-b', 'CREW CABIN B', 'crew', COLORS.warm]],
      [-4, ['wash-a', 'WASHROOM A', 'crew', 0x9bdfff], ['wash-b', 'WASHROOM B', 'crew', 0x9bdfff]],
      [8, ['lounge', 'CREW LOUNGE', 'crew', COLORS.warm], ['dining', 'GALLEY / DINING', 'crew', COLORS.warm]],
      [20, ['storage', 'SUPPLY STORAGE', 'utility', COLORS.amber], ['fuel', 'H₂ FUEL PROCESSING', 'engineering', COLORS.orange]],
      [32, ['life-support', 'LIFE SUPPORT', 'utility', COLORS.cyan], ['power', 'POWER DISTRIBUTION', 'engineering', COLORS.amber]],
      [44, ['reactor', 'REACTOR CORE', 'engineering', COLORS.red], ['maintenance', 'ENGINEERING WORKSHOP', 'engineering', COLORS.orange]],
      [56, ['warp', 'WARP DRIVE', 'engineering', COLORS.cyan], ['utility', 'COOLANT / RELAY', 'utility', 0x7da6ff]],
    ];
    return rows.flatMap(([z, left, right]) => [
      { id: left[0], label: left[1], category: left[2], color: left[3], x: -9.25, z, width: 12, depth: 10.5, side: 'left' as const },
      { id: right[0], label: right[1], category: right[2], color: right[3], x: 9.25, z, width: 12, depth: 10.5, side: 'right' as const },
    ]);
  }

  private decorateRoom(definition: RoomDefinition, room: THREE.Group): void {
    const add = (object: THREE.Object3D, x: number, z: number, rotation = 0): void => {
      object.position.x += x;
      object.position.z += z;
      object.rotation.y += rotation;
      room.add(object);
    };

    switch (definition.id) {
      case 'cabin-a':
      case 'cabin-b': {
        const index = definition.id === 'cabin-a' ? 0 : 1;
        add(this.props.bed(definition.id), -2.8, -1.7, Math.PI / 2);
        add(this.props.workstation(definition.id), 2.35, -1.5, index ? -0.16 : 0.12);
        add(this.props.chair(), 2.35, -0.35, Math.PI);
        const window = this.props.smartWindow(definition.id);
        window.position.set(index ? 0.8 : -0.8, 1.45, -5.14);
        room.add(window);
        add(this.props.locker(definition.id, true), 4.6, 2.5, Math.PI);
        add(this.props.decorativePlant(), 1.4, 3.6);
        const details = this.props.personalDetails(index);
        details.position.set(-3.8, 0.12, 3.7);
        room.add(details);
        const wallScreen = this.props.panel('CREW STATUS', ['SHIFT: OFF DUTY', 'MESSAGES: 03'], 1.5, 0.72);
        wallScreen.position.set(2.9, 1.9, 5.14);
        wallScreen.rotation.y = Math.PI;
        room.add(wallScreen);
        break;
      }
      case 'wash-a':
      case 'wash-b':
        add(this.props.hygieneUnit('toilet'), -3.4, -2.2);
        add(this.props.hygieneUnit('sink'), 0.4, -3.5);
        add(this.props.hygieneUnit('shower'), 3.6, -2.3);
        add(this.props.hygieneUnit('pod'), -2.6, 2.6);
        add(this.props.locker(`${definition.id}:hygiene`), 3.9, 2.6, Math.PI);
        break;
      case 'meeting': {
        add(this.props.hologramTable('MISSION BRIEFING'), 0, 0);
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * Math.PI * 2;
          add(this.props.chair(0x314657), Math.cos(angle) * 2.35, Math.sin(angle) * 2.35, -angle + Math.PI / 2);
        }
        const comms = this.props.panel('LONG-RANGE COMMS', ['VERDANT SIGNAL 2.741 GHz', 'PACKET LOSS 0.2%', 'QUANTUM RELAY: LINKED'], 2.25, 1.18);
        comms.position.set(0, 1.55, -5.14);
        room.add(comms);
        this.interaction.register({
          id: 'meeting:briefing', object: comms.screen, label: 'PLAY MISSION BRIEFING',
          onHover: (active) => comms.setHover(active),
          onInteract: () => this.callbacks.toast('MISSION: TRACE THE VERDANT SIGNAL TO NEMORA IV'),
        });
        break;
      }
      case 'lounge':
        for (const [x, z, r] of [[-2.7, -2.3, 0], [-1.4, -2.3, 0], [2.4, 1.8, Math.PI]] as const) add(this.props.chair(0x48606d), x, z, r);
        add(this.props.table(1.35, 0.8, 0.52), -2.0, -0.8);
        add(this.props.beverageStation(), 3.9, -2.8, -Math.PI / 2);
        add(this.props.decorativePlant(), 3.7, 3.3);
        const media = this.props.panel('CREW MEDIA', ['ORBITAL ARCHIVE // PAUSED', 'MISSION TIME 041:22:09'], 2.3, 1.1);
        media.position.set(-0.8, 1.65, -5.14);
        room.add(media);
        break;
      case 'dining': {
        add(this.props.table(3.9, 1.3, 0.82), 0, 0);
        for (let i = 0; i < 6; i += 1) {
          const side = i < 3 ? -1 : 1;
          add(this.props.chair(0x3c5059), -1.25 + (i % 3) * 1.25, side * 1.28, side < 0 ? 0 : Math.PI);
        }
        add(this.props.beverageStation(), 4.15, -3.25, -Math.PI / 2);
        for (let i = 0; i < 3; i += 1) {
          const cabinet = this.props.locker(`galley:${i}`);
          cabinet.scale.set(0.75, 0.75, 0.75);
          add(cabinet, -3.8 + i * 1.15, 4.5, Math.PI);
        }
        const galley = this.props.panel('GALLEY', ['REHYDRATOR READY', 'STERILIZER: NOMINAL'], 1.7, 0.8);
        galley.position.set(3.8, 1.65, -5.14);
        room.add(galley);
        break;
      }
      case 'storage':
        add(this.props.freezer(), -3.9, -4.75, 0);
        add(this.props.toolRack(), 2.8, -5.12, 0);
        for (const [x, z, r] of [[-3.5, 2.1, 0], [-1.9, 2.4, 0.3], [2.4, 2.6, -0.2], [3.7, 1.6, 0.12]] as const) add(this.props.crate('SUPPLY'), x, z, r);
        add(this.props.locker('crew-storage'), 4.8, -1.1, -Math.PI / 2);
        break;
      case 'fuel': {
        for (let i = 0; i < 3; i += 1) add(this.props.fuelTank(i), -3.1 + i * 2.5, 1.2);
        const observation = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.55), glass(0x96dfff, 0.15));
        observation.position.set(0, 1.45, -0.9);
        room.add(observation);
        add(this.props.pipeRun(4.2), -0.4, -3.7);
        const extractor = this.props.panel('H₂ EXTRACTOR', ['SOURCE: LOCAL RESERVOIR', 'FLOW 00.0 kg/s', 'PURITY 99.42%'], 2.05, 1.15);
        extractor.position.set(3.7, 1.5, -5.14);
        room.add(extractor);
        this.interaction.register({
          id: 'fuel:extractor', object: extractor.screen, label: 'START HYDROGEN EXTRACTION',
          onHover: (a) => extractor.setHover(a),
          onInteract: () => {
            extractor.setContent('H₂ PROCESSING', ['SOURCE: BUFFER RESERVOIR', 'FLOW 12.4 kg/s', 'PURITY 99.91%']);
            this.callbacks.toast('HYDROGEN EXTRACTION // PROCESSING');
          },
        });
        break;
      }
      case 'medical':
        add(this.props.medicalBed(), -1.8, -1.5);
        add(this.props.medicalBed(), -1.8, 1.5);
        add(this.props.locker('medication'), 4.6, -3.2, -Math.PI / 2);
        add(this.props.hygieneUnit('pod'), 3.6, 2.8);
        const medTerminal = this.props.panel('CREW HEALTH', ['ALL CREW: GREEN', 'AUTODOC: READY', 'CRYO POD: STANDBY'], 1.9, 1.0);
        medTerminal.position.set(0, 1.6, -5.14);
        room.add(medTerminal);
        break;
      case 'science':
        add(this.props.labBench(), -0.6, 0.2);
        add(this.props.table(2.1, 0.72), -3.7, -3.0);
        add(this.props.decorativePlant(true), 3.8, 2.8);
        add(this.props.crate('ARTIFACT', 0x35334f), 3.6, -2.8);
        break;
      case 'defense': {
        add(this.props.weaponLocker(), -4.2, -2.7);
        add(this.props.weaponLocker(), -4.2, 2.4);
        const security = this.props.panel('TACTICAL GRID', ['THREATS: NONE', 'TURRETS: SAFE', 'CAMERAS: 18 ONLINE'], 2.7, 1.4);
        security.position.set(0.8, 1.5, -5.14);
        room.add(security);
        add(this.props.chair(0x4c3941), 0.8, -3.4, Math.PI);
        add(this.props.table(2.7, 0.75), 2.8, 1.3, Math.PI / 2);
        this.interaction.register({
          id: 'security:console', object: security.screen, label: 'CYCLE EXTERIOR TURRET CAMERA',
          onHover: (a) => security.setHover(a),
          onInteract: () => this.callbacks.toast('SIDE / REAR TURRETS // MANUAL SAFE MODE'),
        });
        break;
      }
      case 'life-support':
        add(this.props.lifeSupportUnit(), -3.6, -4.72);
        add(this.props.lifeSupportUnit(), 0, -4.72);
        add(this.props.lifeSupportUnit(), 3.6, -4.72);
        for (let i = 0; i < 4; i += 1) add(this.props.pipeRun(3.2), -3.5 + i * 2.2, 3.5, i % 2 ? 0 : Math.PI / 2);
        break;
      case 'power': {
        add(this.props.batteryBank(), -3.7, -4.7);
        add(this.props.batteryBank(), 0, -4.7);
        add(this.props.batteryBank(), 3.7, -4.7);
        const grid = this.props.panel('POWER GRID', ['ENGINES 32%  LIFE 18%', 'WARP 24%  SCIENCE 08%', 'RESERVE 18%'], 2.4, 1.25);
        grid.position.set(0, 1.5, 5.14);
        grid.rotation.y = Math.PI;
        room.add(grid);
        this.interaction.register({
          id: 'power:grid', object: grid.screen, label: 'ROUTE POWER TO WARP CORE',
          onHover: (a) => grid.setHover(a),
          onInteract: () => {
            grid.setContent('POWER GRID', ['ENGINES 18%  LIFE 18%', 'WARP 42%  SCIENCE 04%', 'RESERVE 18%']);
            this.callbacks.toast('POWER ROUTED // WARP CAPACITORS PRIORITIZED');
          },
        });
        break;
      }
      case 'reactor': {
        add(this.props.reactorCore('reactor'), 0, 0);
        const status = this.props.panel('FUSION REACTOR', ['OUTPUT 8.4 TW', 'CORE TEMP 84 MK', 'CONTAINMENT 99.98%'], 2.25, 1.1);
        status.position.set(3.7, 1.5, -5.14);
        room.add(status);
        for (let i = 0; i < 3; i += 1) add(this.props.pipeRun(3.5), -3.5 + i * 3.5, 3.6, i % 2 ? Math.PI / 2 : 0);
        break;
      }
      case 'maintenance':
        add(this.props.reactorCore('engine'), -2.4, 0);
        add(this.props.toolRack(), 3.6, -5.12);
        add(this.props.table(2.8, 0.82), 2.7, 1.2, Math.PI / 2);
        add(this.props.crate('SPARE PARTS'), 3.4, 3.6);
        add(this.props.crate('COOLANT', 0x435a67), 1.9, 3.5);
        break;
      case 'warp':
        add(this.props.reactorCore('warp'), -1.3, 0);
        this.buildWarpRoomControls(room);
        break;
      case 'utility':
        add(this.props.lifeSupportUnit(), -3.7, -4.72);
        add(this.props.batteryBank(), 0, -4.7);
        add(this.props.toolRack(), 3.8, -5.12);
        for (let i = 0; i < 5; i += 1) add(this.props.pipeRun(3.2), -4.1 + i * 2.0, 2.7 + (i % 2) * 1.0, i % 2 ? Math.PI / 2 : 0);
        break;
    }
  }

  private buildCorridor(): void {
    const floor = new THREE.Mesh(normalizedBox(6.45, 0.15, 111, 'floor'), shared.floor);
    floor.position.set(0, -0.15, 5.5);
    const inset = new THREE.Mesh(normalizedBox(4.9, 0.02, 109, 'floor'), shared.floorInset);
    inset.position.set(0, 0.001, 5.5);
    const ceiling = new THREE.Mesh(normalizedBox(6.45, 0.15, 111, 'ceiling'), shared.ceiling);
    ceiling.position.set(0, 3.25, 5.5);
    this.root.add(floor, inset, ceiling);

    for (let z = -47; z <= 59; z += 6) {
      const rib = new THREE.Group();
      for (const x of [-3.1, 3.1]) {
        const post = new THREE.Mesh(normalizedBox(0.18, 3.25, 0.3, 'floor'), metal(0x5a6c75, 0.36, 0.86));
        post.position.x = x;
        rib.add(post);
      }
      const beam = new THREE.Mesh(normalizedBox(6.35, 0.18, 0.3, 'center'), metal(0x5a6c75, 0.36, 0.86));
      beam.position.y = 3.15;
      rib.add(beam);
      const strip = new THREE.Mesh(normalizedBox(1.8, 0.035, 0.12, 'ceiling'), z % 12 === 1 ? shared.amber : shared.cyan);
      strip.position.y = 3.11;
      rib.add(strip);
      rib.position.z = z;
      this.root.add(rib);
    }

    // Seal the 1.5 m gaps between room modules while keeping every doorway clear.
    for (const z of [-46, -34, -22, -10, 2, 14, 26, 38, 50, 62]) {
      for (const x of [-3.24, 3.24]) {
        const segment = new THREE.Mesh(normalizedBox(0.2, 3.25, 1.5, 'floor'), shared.hull);
        segment.position.set(x, 0, z);
        this.root.add(segment);
        this.props.solid(segment);
      }
    }

    // Directional floor lines and utility conduits.
    for (const x of [-2.32, 2.32]) {
      const line = new THREE.Mesh(normalizedBox(0.045, 0.024, 108, 'floor'), x < 0 ? shared.cyan : shared.amber);
      line.position.set(x, 0.012, 5.5);
      this.root.add(line);
      const conduit = new THREE.Mesh(normalizedCylinder(0.045, 0.045, 108, 8, 'center'), metal(x < 0 ? 0x5f8f9d : 0x9b7642, 0.34, 0.82));
      conduit.rotation.x = Math.PI / 2;
      conduit.position.set(x < 0 ? -3.08 : 3.08, 2.55, 5.5);
      this.root.add(conduit);
    }
  }

  private buildCockpit(doors: DoorSystem): void {
    const group = new THREE.Group();
    group.name = 'Bridge';
    const centerZ = -58;
    const floor = new THREE.Mesh(normalizedBox(22, 0.16, 14, 'floor'), shared.floor);
    floor.position.set(0, -0.16, centerZ);
    const ceiling = new THREE.Mesh(normalizedBox(20, 0.15, 12.5, 'ceiling'), shared.ceiling);
    ceiling.position.set(0, 3.4, centerZ + 0.3);
    group.add(floor, ceiling);

    const rearLeft = new THREE.Mesh(normalizedBox(9.5, 3.4, 0.22, 'floor'), shared.hull);
    rearLeft.position.set(-6.25, 0, -50.9);
    const rearRight = rearLeft.clone();
    rearRight.position.x = 6.25;
    group.add(rearLeft, rearRight);
    this.props.solid(rearLeft);
    this.props.solid(rearRight);
    const cockpitDoor = doors.create('bridge', new THREE.Vector3(0, 0, -50.88), 'x', 3, 2.75);
    group.add(cockpitDoor);

    // Angled side hull, front frame, and a panoramic transparent viewport.
    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(normalizedBox(0.24, 3.4, 13.7, 'floor'), metal(0x1e2d35, 0.4, 0.88));
      sideWall.position.set(side * 10.75, 0, centerZ);
      sideWall.rotation.y = side * -0.1;
      group.add(sideWall);
      this.props.solid(sideWall);
      for (let i = 0; i < 3; i += 1) {
        const sideWindow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.6), glass(0x8acfff, 0.12));
        sideWindow.position.set(side * 10.58, 1.7, -61.8 + i * 3.25);
        sideWindow.rotation.y = side * -Math.PI / 2;
        group.add(sideWindow);
      }
    }
    const viewport = new THREE.Mesh(new THREE.PlaneGeometry(17.5, 3.0), glass(0xa6dcff, 0.09));
    viewport.position.set(0, 1.78, -64.9);
    group.add(viewport);
    for (const x of [-9, -4.5, 0, 4.5, 9]) {
      const mullion = new THREE.Mesh(normalizedBox(0.16, 3.4, 0.3, 'floor'), metal(0x2f414a, 0.3, 0.92));
      mullion.position.set(x, 0, -64.75);
      if (x) mullion.rotation.z = x * -0.012;
      group.add(mullion);
    }

    // Curved dashboard approximation: layered physical avionics modules.
    const dash = new THREE.Mesh(normalizedBox(14.8, 0.82, 1.45, 'floor'), metal(0x17242c, 0.32, 0.9));
    dash.position.set(0, 0.72, -61.4);
    dash.rotation.x = -0.08;
    group.add(dash);
    this.props.solid(dash);

    const pilotSeatA = this.pilotSeat(-1.65, -57.25);
    const pilotSeatB = this.pilotSeat(1.65, -57.25);
    group.add(pilotSeatA, pilotSeatB);
    for (const [index, seat] of [pilotSeatA, pilotSeatB].entries()) {
      this.interaction.register({
        id: `pilot-seat:${index}`,
        object: seat,
        label: 'SIT IN PILOT SEAT',
        range: 3.1,
        onHover: (active) => seat.scale.setScalar(active ? 1.015 : 1),
        onInteract: this.callbacks.onSitPilot,
      });
    }

    const hologram = this.props.hologramTable('ASTRA NAV');
    hologram.scale.setScalar(0.62);
    hologram.position.set(0, 0, -57.7);
    group.add(hologram);

    this.statusPanel = new WorldPanel('FLIGHT COMPUTER', ['VEL 0000 m/s  THR 000%', 'HULL 100%  FUEL 100%', 'TARGET: NO TARGET', 'WARP: STANDBY'], 3.25, 1.36);
    this.statusPanel.position.set(-4.55, 1.48, -60.62);
    this.statusPanel.rotation.x = -0.18;
    group.add(this.statusPanel);

    this.navPanel = new WorldPanel('ASTRA NAV', ['TARGET: NO TARGET', 'DISTANCE: —', 'LOCK: STANDBY'], 2.8, 1.18);
    this.navPanel.position.set(0, 1.46, -60.69);
    this.navPanel.rotation.x = -0.18;
    group.add(this.navPanel);
    this.interaction.register({
      id: 'cockpit:nav-selector', object: this.navPanel.screen, label: 'CYCLE CELESTIAL TARGET', range: 4,
      onHover: (active) => this.navPanel.setHover(active), onInteract: this.callbacks.onCycleTarget,
    });

    this.buildThrottleControl(group);
    this.buildCockpitWarpControl(group);

    const holoReadout = new WorldPanel('ORBITAL SOLUTION', ['PITCH 000°  YAW 000°', 'DAMPENERS: ON', 'ENTRY VECTOR: STANDBY'], 2.5, 1.08);
    holoReadout.position.set(4.8, 1.48, -60.62);
    holoReadout.rotation.x = -0.18;
    group.add(holoReadout);
    this.interaction.register({
      id: 'cockpit:entry-control', object: holoReadout.screen,
      label: () => (this.callbacks.canEnterAtmosphere() ? 'INITIATE ATMOSPHERIC ENTRY' : 'ENTRY VECTOR UNAVAILABLE'), range: 4,
      enabled: () => this.callbacks.canEnterAtmosphere(),
      onHover: (active) => holoReadout.setHover(active),
      onInteract: this.callbacks.onEntryRequested,
    });

    this.pilotView.position.set(-1.65, 1.62, -56.65);
    this.pilotView.rotation.set(0, 0, 0);
    group.add(this.pilotView);

    for (const x of [-7.5, -5, 5, 7.5]) {
      const console = this.props.panel(x < 0 ? 'SENSOR ARRAY' : 'SHIP SYSTEMS', x < 0 ? ['LIDAR NOMINAL', 'SPECTRAL PASSIVE'] : ['SHIELDS 100%', 'THERMAL GREEN'], 1.55, 0.82);
      console.position.set(x, 1.15, -61.0 + Math.abs(x) * 0.08);
      console.rotation.x = -0.32;
      console.rotation.y = x * -0.025;
      group.add(console);
    }
    this.root.add(group);
  }

  private pilotSeat(x: number, z: number): THREE.Group {
    const seat = new THREE.Group();
    const shell = this.props.box(1.05, 0.36, 1.25, metal(0x263842, 0.4, 0.86));
    shell.position.y = 0.48;
    const cushion = this.props.box(0.82, 0.2, 1.0, matte(0x314954, 0.66));
    cushion.position.y = 0.82;
    const back = this.props.box(0.88, 1.35, 0.22, matte(0x314954, 0.6));
    back.position.set(0, 0.7, 0.48);
    const headrest = this.props.box(0.62, 0.38, 0.28, matte(0x243943, 0.55));
    headrest.position.set(0, 1.72, 0.5);
    const armL = this.props.box(0.14, 0.26, 0.78, metal(0x344a55));
    armL.position.set(-0.52, 0.72, -0.04);
    const armR = armL.clone();
    armR.position.x = 0.52;
    seat.add(shell, cushion, back, headrest, armL, armR);
    seat.position.set(x, 0, z);
    this.props.solid(shell);
    return seat;
  }

  private buildThrottleControl(group: THREE.Group): void {
    const pedestal = this.props.box(1.45, 0.42, 1.1, metal(0x1a2830, 0.34, 0.9));
    pedestal.position.set(-2.75, 0.76, -59.85);
    group.add(pedestal);
    const buttonMaterial = emissive(COLORS.amber, 1.2);
    this.throttleButton = this.props.box(0.42, 0.09, 0.42, buttonMaterial);
    this.throttleButton.position.set(-2.75, 1.19, -59.84);
    group.add(this.throttleButton);
    const lidMaterial = glass(0xff8b48, 0.34);
    lidMaterial.color.setHex(0xb7421f);
    this.throttleLid = this.props.box(0.75, 0.12, 0.72, lidMaterial);
    this.throttleLid.position.set(-2.75, 1.3, -59.82);
    group.add(this.throttleLid);
    this.interaction.register({
      id: 'cockpit:throttle-lid', object: this.throttleLid, label: () => (this.throttleUnlocked ? 'CLOSE THROTTLE SAFETY LID' : 'OPEN THROTTLE SAFETY LID'), range: 3.8,
      onHover: (active) => this.throttleLid.scale.setScalar(active ? 1.025 : 1),
      onInteract: () => {
        this.throttleUnlocked = !this.throttleUnlocked;
        if (this.throttleUnlocked) this.callbacks.toast('THROTTLE INTERLOCK EXPOSED // PRESS TO ARM');
      },
    });
    this.interaction.register({
      id: 'cockpit:throttle-button', object: this.throttleButton, label: 'ARM PRIMARY THRUST', range: 3.8,
      enabled: () => this.throttleUnlocked,
      onHover: (active) => (buttonMaterial.emissiveIntensity = active ? 3.2 : 1.2),
      onInteract: () => {
        this.callbacks.onThrottleUnlocked();
        this.callbacks.toast('PRIMARY THRUST ARMED // FLIGHT CONTROL ONLINE');
      },
    });
  }

  private buildCockpitWarpControl(group: THREE.Group): void {
    const pedestal = this.props.box(1.45, 0.48, 1.1, metal(0x1a2830, 0.34, 0.9));
    pedestal.position.set(2.78, 0.72, -59.85);
    group.add(pedestal);
    const coverMaterial = glass(0xff304c, 0.36);
    coverMaterial.color.setHex(0xb3182e);
    this.warpCover = this.props.box(0.78, 0.14, 0.8, coverMaterial);
    this.warpCover.position.set(2.78, 1.21, -59.82);
    group.add(this.warpCover);
    this.warpLever = this.createWarpLever();
    this.warpLever.position.set(2.78, 1.2, -59.82);
    group.add(this.warpLever);
    this.interaction.register({
      id: 'cockpit:warp-cover', object: this.warpCover, label: () => (this.warpCoverOpen ? 'CLOSE WARP SAFETY COVER' : 'OPEN WARP SAFETY COVER'), range: 3.8,
      onHover: (active) => this.warpCover.scale.setScalar(active ? 1.025 : 1),
      onInteract: () => {
        this.warpCoverOpen = !this.warpCoverOpen;
        this.callbacks.onWarpCover(this.warpCoverOpen);
        if (this.warpCoverOpen) this.callbacks.toast(this.callbacks.canWarp() ? 'WARP INTERLOCK OPEN // LEVER ARMED' : 'INTERLOCK OPEN // TARGET LOCK REQUIRED');
      },
    });
    this.interaction.register({
      id: 'cockpit:warp-lever', object: this.warpLever, label: () => (this.callbacks.canWarp() ? 'PULL WARP LEVER' : 'WARP LEVER // TARGET REQUIRED'), range: 3.8,
      enabled: () => this.warpCoverOpen,
      onHover: (active) => this.warpLever.scale.setScalar(active ? 1.045 : 1),
      onInteract: () => {
        if (!this.callbacks.canWarp()) this.callbacks.toast('WARP INHIBITED // SELECT AND LOCK DESTINATION');
        else {
          this.pullLever(this.warpLever, 'cockpit:warp-lever');
          this.callbacks.onWarpLever();
        }
      },
    });
  }

  private pullLever(lever: THREE.Group, key: string): void {
    this.animator.tween(lever, key, { rotation: new THREE.Euler(-0.85, 0, 0, lever.rotation.order) }, 0.32, undefined, () => {
      this.animator.tween(lever, key, { rotation: new THREE.Euler(0, 0, 0, lever.rotation.order) }, 0.9);
    });
  }

  private createWarpLever(): THREE.Group {
    const group = new THREE.Group();
    const slot = this.props.box(0.5, 0.06, 0.7, metal(0x080d10, 0.5, 0.75));
    const stem = new THREE.Mesh(normalizedCylinder(0.035, 0.04, 0.42, 8, 'center'), metal(0xc1c9c8, 0.24, 0.92));
    stem.rotation.x = Math.PI / 2;
    stem.position.set(0, 0.27, 0.03);
    const grip = new THREE.Mesh(normalizedCylinder(0.1, 0.1, 0.34, 10, 'center'), emissive(COLORS.red, 1.2));
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0, 0.45, -0.16);
    group.add(slot, stem, grip);
    return group;
  }

  private buildWarpRoomControls(room: THREE.Group): void {
    const status = this.props.panel('WARP CORE', ['CHARGE 000%', 'STABILITY 99.8%', 'COORDINATES: UNSET'], 2.25, 1.12);
    status.position.set(3.55, 1.5, -5.14);
    room.add(status);
    const pedestal = this.props.box(1.2, 1.0, 0.9, metal(0x17252d, 0.34, 0.88));
    pedestal.position.set(3.35, 0, 1.8);
    const duplicateLever = this.createWarpLever();
    duplicateLever.position.set(3.35, 1.01, 1.8);
    const roomCoverMaterial = glass(0xff304c, 0.36);
    roomCoverMaterial.color.setHex(0xb3182e);
    const roomCover = this.props.box(0.82, 0.14, 0.84, roomCoverMaterial);
    roomCover.position.set(3.35, 1.12, 1.8);
    room.add(pedestal, duplicateLever, roomCover);
    this.interaction.register({
      id: 'warp-room:cover', object: roomCover,
      label: () => (this.warpCoverOpen ? 'CLOSE ENGINE-ROOM SAFETY COVER' : 'OPEN ENGINE-ROOM SAFETY COVER'),
      onHover: (active) => roomCover.scale.setScalar(active ? 1.025 : 1),
      onInteract: () => {
        this.warpCoverOpen = !this.warpCoverOpen;
        this.animator.tween(
          roomCover,
          'warp-room:cover',
          {
            rotation: new THREE.Euler(this.warpCoverOpen ? -1.25 : 0, 0, 0, roomCover.rotation.order),
            position: new THREE.Vector3(roomCover.position.x, roomCover.position.y, this.warpCoverOpen ? 1.5 : 1.8),
          },
          0.45,
        );
        this.callbacks.onWarpCover(this.warpCoverOpen);
        this.callbacks.toast(this.warpCoverOpen ? 'ENGINE-ROOM WARP INTERLOCK OPEN' : 'ENGINE-ROOM WARP INTERLOCK SAFE');
      },
    });
    this.interaction.register({
      id: 'warp-room:lever', object: duplicateLever, label: () => (this.callbacks.canWarp() ? 'PULL ENGINE-ROOM WARP LEVER' : 'TARGET LOCK REQUIRED'),
      enabled: () => this.warpCoverOpen,
      onHover: (active) => duplicateLever.scale.setScalar(active ? 1.05 : 1),
      onInteract: () => {
        if (this.callbacks.canWarp()) {
          this.pullLever(duplicateLever, 'warp-room:lever');
          this.callbacks.onWarpLever();
        } else this.callbacks.toast('WARP INHIBITED // COORDINATES UNSET');
      },
    });
  }

  private buildCargoBay(doors: DoorSystem): void {
    const group = new THREE.Group();
    group.name = 'Cargo Bay / Airlock';
    const centerZ = 69.5;
    const floor = new THREE.Mesh(normalizedBox(22, 0.18, 16, 'floor'), shared.floor);
    floor.position.set(0, -0.18, centerZ);
    const ceiling = new THREE.Mesh(normalizedBox(22, 0.18, 16, 'ceiling'), shared.ceiling);
    ceiling.position.set(0, 4.4, centerZ);
    const leftWall = new THREE.Mesh(normalizedBox(0.24, 4.4, 16, 'floor'), shared.hull);
    leftWall.position.set(-11, 0, centerZ);
    const rightWall = leftWall.clone();
    rightWall.position.x = 11;
    const rearLeft = new THREE.Mesh(normalizedBox(9.2, 4.4, 0.24, 'floor'), shared.hull);
    rearLeft.position.set(-6.4, 0, 77.5);
    const rearRight = rearLeft.clone();
    rearRight.position.x = 6.4;
    group.add(floor, ceiling, leftWall, rightWall, rearLeft, rearRight);
    for (const wall of [leftWall, rightWall, rearLeft, rearRight]) this.props.solid(wall);

    const entryDoor = doors.create('cargo-entry', new THREE.Vector3(0, 0, 61.55), 'x', 3.1, 2.9);
    group.add(entryDoor);
    for (const x of [-8.5, -5.8, 5.8, 8.5]) {
      const crate = this.props.crate(x < 0 ? 'MISSION CARGO' : 'FIELD EQUIPMENT');
      crate.position.set(x, 0, centerZ + (Math.abs(x) > 7 ? -1.5 : 2.2));
      crate.scale.setScalar(1.22);
      group.add(crate);
    }
    const suit = this.props.suitStation();
    suit.position.set(-9.7, 0, 65.8);
    suit.rotation.y = Math.PI / 2;
    group.add(suit);

    const airlockPanel = new WorldPanel('AIRLOCK / RAMP', ['INNER SEAL: CLOSED', 'PRESSURE 1.00 ATM', 'OUTER HATCH: LOCKED'], 1.85, 1.03);
    airlockPanel.position.set(7.8, 1.58, 77.32);
    airlockPanel.rotation.y = Math.PI;
    group.add(airlockPanel);
    this.interaction.register({
      id: 'cargo:ramp-control', object: airlockPanel.screen,
      label: () => (this.rampOpen ? 'RAISE BOARDING RAMP' : 'CYCLE AIRLOCK / LOWER RAMP'), range: 3.7,
      enabled: () => this.callbacks.canOpenRamp(),
      onHover: (active) => airlockPanel.setHover(active),
      onInteract: () => {
        this.callbacks.onRampRequested();
        this.rampOpen = !this.rampOpen;
        airlockPanel.setContent('AIRLOCK CYCLING', this.rampOpen
          ? ['INNER SEAL: CLOSED', 'PRESSURE 0.94 … 0.00 ATM', 'OUTER HATCH: OPENING']
          : ['INNER SEAL: CLOSED', 'PRESSURE 0.00 … 1.00 ATM', 'OUTER HATCH: CLOSING']);
      },
    });

    this.outerHatchLeft = this.props.box(2.1, 3.5, 0.22, metal(0x344952, 0.36, 0.88));
    this.outerHatchLeft.position.set(-1.05, 0, 77.35);
    this.outerHatchRight = this.outerHatchLeft.clone();
    this.outerHatchRight.position.x = 1.05;
    group.add(this.outerHatchLeft, this.outerHatchRight);

    this.rampHinge = new THREE.Group();
    this.rampHinge.position.set(0, 0, 77.4);
    this.rampHinge.rotation.x = -Math.PI / 2;
    const ramp = this.props.box(4.1, 0.2, 9.0, metal(0x354851, 0.62, 0.7));
    ramp.position.set(0, -0.1, 4.5);
    for (const x of [-1.65, 0, 1.65]) {
      const track = this.props.box(0.08, 0.035, 8.6, emissive(x === 0 ? COLORS.amber : COLORS.cyan, 1.15));
      track.position.set(x, 0.11, 4.5);
      ramp.add(track);
    }
    this.rampHinge.add(ramp);
    group.add(this.rampHinge);
    this.root.add(group);
  }

  private buildUtilityDetails(): void {
    // Repeating ceiling ducts, warning labels, floor hatches and docking-port detail.
    for (let z = -44; z < 61; z += 12) {
      const hatch = this.props.box(1.6, 0.025, 1.05, metal(0x35464f, 0.5, 0.76));
      hatch.position.set(0, 0.012, z + 4.2);
      this.root.add(hatch);
      for (const x of [-2.75, 2.75]) {
        const vent = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.85), metal(0x0a1115, 0.72, 0.5));
        vent.position.set(x, 2.05, z);
        vent.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.root.add(vent);
      }
    }
    const docking = this.props.panel('DOCKING PORT', ['CLAMPS: RETRACTED', 'GUIDANCE: STANDBY'], 1.5, 0.78);
    docking.position.set(3.08, 1.6, 37.5);
    docking.rotation.y = -Math.PI / 2;
    this.root.add(docking);
  }

  private registerStaticColliders(): void {
    this.root.updateMatrixWorld(true);
    const seen = new Set<string>();
    this.props.solids.forEach((object, index) => {
      object.updateWorldMatrix(true, false);
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return;
      const key = `${box.min.x.toFixed(2)}:${box.min.z.toFixed(2)}:${box.max.x.toFixed(2)}:${box.max.z.toFixed(2)}`;
      if (seen.has(key)) return;
      seen.add(key);
      this.collision.addBox(`ship:solid:${index}`, box.min, box.max, 'metal');
    });
  }

  setTelemetry(telemetry: Partial<FlightTelemetry>): void {
    Object.assign(this.telemetry, telemetry);
  }

  setTargetDisplay(name: string, distance: number, locked: boolean): void {
    this.telemetry.target = name;
    this.telemetry.distance = distance;
    this.telemetry.locked = locked;
    this.navPanel.setContent('ASTRA NAV', [
      `TARGET: ${name}`,
      `DISTANCE: ${distance > 0 ? distance.toFixed(0) + ' km' : '—'}`,
      `LOCK: ${locked ? 'CONFIRMED' : 'STANDBY'}`,
    ]);
  }

  setRamp(open: boolean): void {
    this.rampOpen = open;
  }

  update(delta: number): void {
    this.rampProgress = damp(this.rampProgress, this.rampOpen ? 1 : 0, 1.25, delta);
    this.airlockProgress = damp(this.airlockProgress, this.rampOpen ? 1 : 0, 1.8, delta);
    this.rampHinge.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2, 0.47, this.rampProgress);
    this.outerHatchLeft.position.x = -1.05 - this.airlockProgress * 1.75;
    this.outerHatchRight.position.x = 1.05 + this.airlockProgress * 1.75;

    this.throttleLid.rotation.x = damp(this.throttleLid.rotation.x, this.throttleUnlocked ? -1.15 : 0, 8, delta);
    this.throttleLid.position.z = -59.82 - Math.sin(Math.abs(this.throttleLid.rotation.x)) * 0.28;
    this.warpCover.rotation.x = damp(this.warpCover.rotation.x, this.warpCoverOpen ? -1.15 : 0, 8, delta);
    this.warpCover.position.z = -59.82 - Math.sin(Math.abs(this.warpCover.rotation.x)) * 0.3;

    this.displayTelemetry.speed = damp(this.displayTelemetry.speed, this.telemetry.speed, 7, delta);
    this.displayTelemetry.throttle = damp(this.displayTelemetry.throttle, this.telemetry.throttle, 7, delta);
    this.displayTelemetry.fuel = damp(this.displayTelemetry.fuel, this.telemetry.fuel, 4, delta);
    this.displayTelemetry.altitude = damp(this.displayTelemetry.altitude, this.telemetry.altitude, 5, delta);
    this.displayTimer += delta;
    if (this.displayTimer > 0.09) {
      this.displayTimer = 0;
      this.statusPanel.setContent('FLIGHT COMPUTER', [
        `VEL ${this.displayTelemetry.speed.toFixed(0).padStart(4, '0')} m/s  THR ${this.displayTelemetry.throttle.toFixed(0).padStart(3, '0')}%`,
        `HULL ${this.telemetry.hull.toFixed(0)}%  FUEL ${this.displayTelemetry.fuel.toFixed(0)}%`,
        `TARGET: ${this.telemetry.target}${this.telemetry.locked ? ' // LOCK' : ''}`,
        `WARP: ${this.telemetry.warp}  GEAR: ${this.telemetry.gear ? 'DOWN' : 'UP'}`,
      ]);
    }
  }
}
