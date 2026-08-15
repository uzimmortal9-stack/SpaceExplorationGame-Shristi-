import * as THREE from "three";
import { mat, tinted, emissiveSurface } from "./materials";
import { CollisionWorld } from "../systems/collision";
import { InteractionSystem } from "../systems/interact";
import { Door } from "../systems/doors";
import { audio } from "../core/audio";
import { box, roundedBox, cyl, cone, sphere, group, plane, glowStrip } from "./geo";
import * as Props from "./props";

/**
 * ShipInterior — modular, navigable starship interior with automatic sliding
 * doors, obstruction safety, collision and a full set of rooms.
 *
 * Coordinate convention: floor y=0, ceiling y=2.8, nose at -Z, tail at +Z.
 */

export interface ShipSignals {
  onPilotSeat(): void;
  onStand(): void;
  onThrottle(): void;
  onWarpLever(): void;
  onSitSeat(label: string): void;
}

const H = 2.8;
const WT = 0.15; // wall thickness
const CX = 1.5; // corridor half interior width
const RX = 1.9; // room half interior width
const RH = 1.6; // room half depth (z)
const DH = 0.55; // door half width
const SLOT_Z = [-3.0, 0.6, 4.2, 7.8, 11.4, 15.0, 18.6];

interface RoomDef {
  slot: number;
  side: 1 | -1;
  id: string;
  name: string;
  build: (r: RoomCtx) => void;
}

interface RoomCtx {
  room: THREE.Group;
  x: number; // room center x
  z: number; // room center z
  side: number;
  ax: number; // interior x sign-extent
  collision: CollisionWorld;
  interact: InteractionSystem;
  signals: ShipSignals;
  add: (o: THREE.Object3D) => void;
  register: (obj: THREE.Object3D, label: string, onInteract: () => void, range?: number) => void;
}

export class ShipInterior {
  readonly root = new THREE.Group();
  readonly doors: Door[] = [];
  readonly rooms = new Map<string, THREE.Group>();
  private collision: CollisionWorld;
  private interact: InteractionSystem;
  private signals: ShipSignals;
  private lights: THREE.PointLight[] = [];

  constructor(collision: CollisionWorld, interact: InteractionSystem, signals: ShipSignals) {
    this.collision = collision;
    this.interact = interact;
    this.signals = signals;
    this.build();
  }

  /** Build the full interior including walls, doors, rooms and props. */
  private build(): void {
    this.buildShell();
    this.buildBridge();
    this.buildCorridor();
    this.buildRooms();
    this.buildTail();
  }

  private addWallX(x: number, z0: number, z1: number, y0: number, y1: number, thickness = WT): void {
    // Wall parallel to Z at plane x, from z0..z1
    const mesh = box(thickness, y1 - y0, z1 - z0, mat("wall"));
    mesh.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
    this.root.add(mesh);
    this.collision.addBox(x - thickness / 2, y0, z0, x + thickness / 2, y1, z1);
  }
  private addWallZ(z: number, x0: number, x1: number, y0: number, y1: number, thickness = WT): void {
    const mesh = box(x1 - x0, y1 - y0, thickness, mat("wall"));
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    this.root.add(mesh);
    this.collision.addBox(x0, y0, z - thickness / 2, x1, y1, z + thickness / 2);
  }
  private addFloor(x0: number, x1: number, z0: number, z1: number): void {
    const mesh = plane(x1 - x0, z1 - z0, mat("floor"));
    mesh.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }
  private addCeil(x0: number, x1: number, z0: number, z1: number): void {
    const mesh = plane(x1 - x0, z1 - z0, mat("floorDark"));
    mesh.position.set((x0 + x1) / 2, H, (z0 + z1) / 2);
    mesh.rotation.x = Math.PI / 2;
    this.root.add(mesh);
  }

  private addDoor(z: number, xCenter: number, alongX = true): Door {
    // A doorway on a wall at plane (either x plane for corridor->room, or z plane for bridge/corridor/tail)
    const door = new Door(this.collision, { width: 1.1, height: 2.1, thickness: 0.08 });
    door.group.position.set(xCenter, 0, z);
    if (alongX) {
      // door between corridor (x = ±CX*?) and room; block is thin in X
      door.setBlock("x", xCenter - 0.06, 0, z - 0.55, xCenter + 0.06, 2.1, z + 0.55);
    } else {
      // door on a Z-facing wall (rear hub / cargo); block is thin in Z
      door.setBlock("z", xCenter - 0.55, 0, z - 0.06, xCenter + 0.55, 2.1, z + 0.06);
    }
    this.root.add(door.group);
    this.doors.push(door);
    return door;
  }

  private buildShell(): void {
    // Exterior side walls (full length)
    this.addWallX(-(CX + WT + RX * 2) - 0.05, -12, 27, 0, H);
    this.addWallX(CX + WT + RX * 2 + 0.05, -12, 27, 0, H);
    // Tail wall
    this.addWallZ(27, -(CX + WT + RX * 2), CX + WT + RX * 2, 0, H);
    // Nose area handled by bridge
  }

  private buildBridge(): void {
    const z0 = -12;
    const z1 = -8;
    const BX = 2.5;
    const bridge = new THREE.Group();
    bridge.name = "bridge";
    this.root.add(bridge);
    this.rooms.set("bridge", bridge);
    this.addFloor(-BX, BX, z0, z1);
    this.addCeil(-BX, BX, z0, z1);
    // nose wall (front viewport frame)
    this.addWallZ(z0, -BX, BX, 0, 0.9);
    this.addWallZ(z0, -BX, BX, 2.4, H);
    this.addWallZ(z0, -BX, -1.9, 0.9, 2.4);
    this.addWallZ(z0, 1.9, BX, 0.9, 2.4);
    // side walls
    this.addWallX(-BX, z0, z1, 0, H);
    this.addWallX(BX, z0, z1, 0, H);
    // back wall with wide open doorway to corridor (no door needed)
    this.addWallZ(z1, -BX, -1.5, 0, H);
    this.addWallZ(z1, 1.5, BX, 0, H);

    // front viewport glass
    const glass = box(3.6, 1.5, 0.04, mat("glass"));
    glass.position.set(0, 1.65, z0 + 0.03);
    bridge.add(glass);

    // Two pilot seats side by side, facing -Z
    const seatL = Props.pilotSeat(0x22e6ff);
    seatL.position.set(-0.7, 0, z1 - 0.5);
    bridge.add(seatL);
    const seatR = Props.pilotSeat(0x22e6ff);
    seatR.position.set(0.7, 0, z1 - 0.5);
    bridge.add(seatR);

    // Dashboard console spanning in front
    const dash = Props.console({ w: 3.4, h: 0.75, d: 0.6, screens: 5 });
    dash.position.set(0, 0, z0 + 1.0);
    bridge.add(dash);

    // Holo solar-system projection between the seats
    const holo = this.buildHologram();
    holo.position.set(0, 1.1, z1 - 1.3);
    bridge.add(holo);

    // Center pedestal: throttle under safety lid + warp lever under red cover
    const center = this.buildCenterPedestal();
    center.position.set(0, 0, z1 - 0.4);
    bridge.add(center);

    // side windows
    const winL = box(1.4, 0.6, 0.04, mat("glass"));
    winL.position.set(-BX - 0.03, 1.7, z1 - 2.0);
    winL.rotation.y = Math.PI / 2;
    bridge.add(winL);
    const winR = winL.clone();
    winR.position.x = BX + 0.03;
    bridge.add(winR);

    // Bridge lighting
    const pl = new THREE.PointLight(0xbfe6ff, 30, 14, 2);
    pl.position.set(0, 2.5, z1 - 2);
    bridge.add(pl);
    this.lights.push(pl);

    // Interact: sit in pilot seat (left seat is the pilot's)
    this.interact.add({
      object: seatL,
      label: "Sit in Pilot Seat",
      range: 2.4,
      onInteract: () => this.signals.onPilotSeat(),
    });
    this.pilotSeatLeft = seatL;
  }

  private buildHologram(): THREE.Group {
    const g = new THREE.Group();
    // central star
    const star = sphere(0.08, emissiveSurface(0xffb000, 2.0), 20);
    g.add(star);
    // orbit rings + planets
    for (let i = 0; i < 5; i++) {
      const r = 0.22 + i * 0.14;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.01, r + 0.01, 48),
        emissiveSurface(0x22e6ff, 1.0),
      );
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      const p = sphere(0.03 + i * 0.008, emissiveSurface([0x39ff88, 0x88d8ff, 0xffb000, 0xff7a7a, 0xc07aff][i], 1.6), 12);
      p.userData.orbit = r;
      p.userData.phase = i * 1.3;
      g.add(p);
    }
    // base emitter
    const base = cyl(0.16, 0.2, 0.08, emissiveSurface(0x22e6ff, 1.2), 16);
    base.position.y = -0.18;
    g.add(base);
    g.userData.holo = true;
    this.holo = g;
    return g;
  }

  private buildCenterPedestal(): THREE.Group {
    const g = new THREE.Group();
    const base = roundedBox(0.7, 0.5, 0.6, 0.04, mat("console"));
    base.position.y = 0.25;
    g.add(base);
    // throttle under safety lid
    const lidHinge = box(0.4, 0.03, 0.24, mat("hullDark"));
    lidHinge.position.set(0, 0.55, 0.05);
    g.add(lidHinge);
    const throttle = cyl(0.04, 0.05, 0.28, mat("steel"), 10);
    throttle.position.set(0, 0.72, -0.06);
    g.add(throttle);
    const throttleKnob = sphere(0.07, emissiveSurface(0x39ff88, 1.6), 12);
    throttleKnob.position.set(0, 0.86, -0.06);
    g.add(throttleKnob);
    // warp lever with red cover
    const warpBase = roundedBox(0.3, 0.2, 0.24, 0.02, mat("console"));
    warpBase.position.set(0, 0.55, 0.18);
    g.add(warpBase);
    const redCover = roundedBox(0.36, 0.1, 0.28, 0.02, tinted("console", 0xcc2222));
    redCover.position.set(0, 0.68, 0.18);
    g.add(redCover);
    const warpLever = cyl(0.025, 0.03, 0.3, mat("steel"), 10);
    warpLever.position.set(0, 0.72, 0.18);
    g.add(warpLever);
    const warpKnob = sphere(0.05, emissiveSurface(0x7a3aff, 2.0), 12);
    warpKnob.position.set(0, 0.88, 0.18);
    g.add(warpKnob);

    g.userData.centerPedestal = true;
    this.throttleKnob = throttleKnob;
    this.warpKnob = warpKnob;
    this.redCover = redCover;

    this.interact.add({
      object: throttleKnob,
      label: "Acceleration Throttle",
      range: 2.0,
      onInteract: () => this.signals.onThrottle(),
    });
    this.interact.add({
      object: warpKnob,
      label: "Warp Lever",
      range: 2.0,
      onInteract: () => this.signals.onWarpLever(),
    });
    return g;
  }

  pilotSeatLeft: THREE.Group | null = null;
  throttleKnob: THREE.Mesh | null = null;
  warpKnob: THREE.Mesh | null = null;
  redCover: THREE.Mesh | null = null;
  holo: THREE.Group | null = null;

  /** Animate the warp lever red safety cover. */
  setWarpCover(open: boolean): void {
    if (this.redCover) {
      this.redCover.rotation.x = open ? -1.3 : -0.1;
    }
  }

  private buildCorridor(): void {
    const z0 = -8;
    const z1 = 22;
    // floor + ceiling
    this.addFloor(-CX - WT, CX + WT, z0, z1);
    this.addCeil(-CX - WT, CX + WT, z0, z1);
    // Trim strips along corridor
    for (const x of [-CX + 0.08, CX - 0.08]) {
      const strip = glowStrip(0.05, z1 - z0, emissiveSurface(0x22e6ff, 1.1));
      strip.position.set(x, 0.12, (z0 + z1) / 2);
      this.root.add(strip);
      const topStrip = glowStrip(0.05, z1 - z0, emissiveSurface(0x223a7a, 1.0));
      topStrip.position.set(x, H - 0.1, (z0 + z1) / 2);
      this.root.add(topStrip);
    }
    // Corridor partition walls are built with door gaps in buildRooms (since rooms align to slots).
    // Build partition walls for the corridor sides with door gaps.
    const wallX = CX + WT / 2;
    for (const side of [1, -1]) {
      const sx = side * wallX;
      let zCursor = z0;
      for (const zc of SLOT_Z) {
        const gap0 = zc - DH;
        const gap1 = zc + DH;
        if (gap0 > zCursor) this.addWallX(sx, zCursor, gap0, 0, H);
        zCursor = Math.max(zCursor, gap1);
      }
      if (zCursor < z1) this.addWallX(sx, zCursor, z1, 0, H);
    }
  }

  private buildRooms(): void {
    const rooms: RoomDef[] = [
      { slot: 0, side: 1, id: "cabinA", name: "Crew Cabin A", build: (r) => this.buildCabin(r) },
      { slot: 0, side: -1, id: "cabinB", name: "Crew Cabin B", build: (r) => this.buildCabin(r) },
      { slot: 1, side: 1, id: "washA", name: "Washroom A", build: (r) => this.buildWashroom(r) },
      { slot: 1, side: -1, id: "washB", name: "Washroom B", build: (r) => this.buildWashroom(r) },
      { slot: 2, side: 1, id: "storage", name: "Storage", build: (r) => this.buildStorage(r) },
      { slot: 2, side: -1, id: "fuel", name: "Fuel Processing", build: (r) => this.buildFuel(r) },
      { slot: 3, side: 1, id: "comms", name: "Communications", build: (r) => this.buildComms(r) },
      { slot: 3, side: -1, id: "lounge", name: "Lounge", build: (r) => this.buildLounge(r) },
      { slot: 4, side: 1, id: "galley", name: "Galley & Dining", build: (r) => this.buildGalley(r) },
      { slot: 4, side: -1, id: "medical", name: "Medical Bay", build: (r) => this.buildMedical(r) },
      { slot: 5, side: 1, id: "lab", name: "Science Lab", build: (r) => this.buildLab(r) },
      { slot: 5, side: -1, id: "reactor", name: "Reactor", build: (r) => this.buildReactor(r) },
      { slot: 6, side: 1, id: "defense", name: "Defense & Security", build: (r) => this.buildDefense(r) },
      { slot: 6, side: -1, id: "power", name: "Power Distribution", build: (r) => this.buildPower(r) },
    ];
    for (const def of rooms) {
      const zc = SLOT_Z[def.slot];
      const xc = def.side * (CX + WT + RX);
      const z0 = zc - RH;
      const z1 = zc + RH;
      const room = new THREE.Group();
      room.name = def.id;
      this.root.add(room);
      this.rooms.set(def.id, room);
      // floor spanning the room interior
      const xLo = def.side * (CX + WT) > 0 ? CX + WT : -(CX + WT);
      const xHi = def.side > 0 ? CX + WT + RX * 2 : -(CX + WT + RX * 2);
      this.addFloor(Math.min(xLo, xHi), Math.max(xLo, xHi), z0, z1);
      this.addCeil(Math.min(xLo, xHi), Math.max(xLo, xHi), z0, z1);
      // side walls (z boundaries) between exterior wall and corridor partition
      this.addWallZ(z0, Math.min(xLo, xHi) - 0.01, Math.max(xLo, xHi) + 0.01, 0, H);
      this.addWallZ(z1, Math.min(xLo, xHi) - 0.01, Math.max(xLo, xHi) + 0.01, 0, H);
      // door on the corridor partition wall
      const door = this.addDoor(zc, def.side * (CX + WT / 2), true);
      // room lighting
      this.addRoomLight(xc, zc);
      // room signage
      this.addSign(def.name, xc - def.side * (CX - 0.3), zc);

      const ctx: RoomCtx = {
        room,
        x: xc,
        z: zc,
        side: def.side,
        ax: RX,
        collision: this.collision,
        interact: this.interact,
        signals: this.signals,
        add: (o) => room.add(o),
        register: (obj, label, onInteract, range = 2.2) => {
          this.interact.add({ object: obj, label, range, onInteract });
        },
      };
      def.build(ctx);
      void door;
    }
  }

  private addRoomLight(x: number, z: number): void {
    const light = new THREE.PointLight(0xcfe4ff, 20, 12, 2);
    light.position.set(x, H - 0.3, z);
    this.root.add(light);
    this.lights.push(light);
  }

  private addSign(text: string, x: number, z: number): void {
    const panel = box(0.9, 0.18, 0.02, emissiveSurface(0x1a3a5a, 0.7));
    panel.position.set(x, 2.15, z);
    panel.userData.signText = text;
    this.root.add(panel);
  }

  // ---- Room builders ----
  private buildCabin(r: RoomCtx): void {
    // bed with smart window on the outboard wall
    const bed = Props.bed(true);
    bed.position.set(0, 0, -0.6);
    r.add(bed);
    // workstation with laptop
    const ws = Props.workstation(true);
    ws.position.set(-0.6, 0, 0.4);
    ws.rotation.y = 0.4;
    r.add(ws);
    const ws2 = Props.workstation(false);
    ws2.position.set(0.6, 0, 0.5);
    ws2.rotation.y = -0.3;
    r.add(ws2);
    // locker with suit
    const locker = Props.locker();
    locker.position.set(1.2, 0, -0.7);
    r.add(locker);
    const suit = Props.suitStation();
    suit.position.set(-1.2, 0, -0.8);
    suit.rotation.y = r.side > 0 ? Math.PI : 0;
    r.add(suit);
    // shelf + plant + lamp
    const shelf = Props.shelf(3);
    shelf.position.set(0.9, 0, 0.6);
    r.add(shelf);
    const plant = Props.plant();
    plant.position.set(-1.1, 0, 0.6);
    r.add(plant);
    const lamp = Props.lamp();
    lamp.position.set(-0.35, 0, 0.75);
    r.add(lamp);
    // wall screen
    const screen = Props.wallScreen(0.5, 0.35, 0x88d8ff);
    screen.position.set(0, 1.9, 1.55);
    r.add(screen);
    // photo
    const photo = box(0.24, 0.18, 0.02, tinted("fabric", 0xcfc2a8));
    photo.position.set(-0.9, 2.1, 1.55);
    r.add(photo);
  }

  private buildWashroom(r: RoomCtx): void {
    const toilet = Props.toilet();
    toilet.position.set(0.5, 0, -0.7);
    r.add(toilet);
    const sink = Props.sink();
    sink.position.set(-0.5, 0, -0.5);
    r.add(sink);
    const shower = Props.showerPod();
    shower.position.set(0, 0, 0.7);
    r.add(shower);
    const shelf = Props.shelf(2);
    shelf.position.set(1.0, 0, 0.4);
    shelf.scale.set(0.8, 0.8, 0.8);
    r.add(shelf);
    r.register(shower, "Use Shower", () => {
      audio.flush();
    });
    r.register(sink, "Use Sink", () => {
      audio.waterfall();
    });
    r.register(toilet, "Flush", () => audio.flush());
  }

  private buildStorage(r: RoomCtx): void {
    const crate1 = Props.crate(0.9, 0x5a4a3a);
    crate1.position.set(-0.8, 0, -0.6);
    r.add(crate1);
    const crate2 = Props.crate(0.7, 0x4a5a4a);
    crate2.position.set(0.6, 0, -0.7);
    r.add(crate2);
    const shelf = Props.shelf(5);
    shelf.position.set(0, 0, -0.2);
    r.add(shelf);
    const shelf2 = Props.shelf(4);
    shelf2.position.set(0.9, 0, 0.6);
    shelf2.scale.set(0.9, 0.9, 0.9);
    r.add(shelf2);
    // freezer with glass
    const freezer = this.buildFreezer();
    freezer.position.set(-1.0, 0, 0.6);
    r.add(freezer);
    const pallet = Props.pallet();
    pallet.position.set(-0.2, 0, 0.6);
    r.add(pallet);
    r.register(crate1, "Open Crate", () => audio.click());
    r.register(freezer, "Open Freezer", () => audio.doorSlide(true));
  }

  private buildFreezer(): THREE.Group {
    const body = roundedBox(1.2, 1.6, 0.7, 0.03, mat("hullLight"));
    body.position.y = 0.8;
    const g = group(body);
    for (let i = 0; i < 4; i++) {
      const pack = roundedBox(0.22, 0.1, 0.28, 0.02, tinted("fabric", [0x4a5a6a, 0x6a5a4a, 0x5a6a4a, 0x6a4a5a][i]));
      pack.position.set(-0.35 + (i % 2) * 0.45, 0.4 + Math.floor(i / 2) * 0.6, 0);
      g.add(pack);
    }
    // glass front
    const glass = box(1.1, 1.5, 0.02, mat("glass"));
    glass.position.set(0, 0.85, 0.36);
    g.add(glass);
    g.userData.kind = "freezer";
    return g;
  }

  private buildFuel(r: RoomCtx): void {
    const tank1 = Props.fuelTank();
    tank1.position.set(-0.7, 0, -0.5);
    r.add(tank1);
    const tank2 = Props.fuelTank();
    tank2.position.set(0.6, 0, -0.6);
    r.add(tank2);
    const screen = Props.wallScreen(0.7, 0.4, 0xffb000);
    screen.position.set(0, 1.9, 1.55);
    r.add(screen);
    // pipe + valves
    const conduit = Props.conduit(3.2, 1.6);
    conduit.position.set(0, 0, 1.5);
    r.add(conduit);
    const valve = torus(0.12, 0.03, mat("gold"), 16);
    valve.position.set(1.2, 1.6, 1.55);
    valve.rotation.x = Math.PI / 2;
    r.add(valve);
    r.register(valve, "Turn Valve", () => audio.clunk());
    r.register(tank1, "Fuel Pressure", () => audio.beep());
  }

  private buildComms(r: RoomCtx): void {
    const table = Props.holoTable();
    table.position.set(0, 0, -0.3);
    r.add(table);
    const chairs: THREE.Group[] = [];
    for (const [cx, cz] of [
      [-0.9, 0.6],
      [0.9, 0.6],
      [0, 0.9],
    ] as const) {
      const chair = Props.seat(0x2a3a5a);
      chair.position.set(cx, 0, cz);
      chair.rotation.y = Math.PI;
      r.add(chair);
      chairs.push(chair);
    }
    const screen = Props.wallScreen(1.2, 0.7, 0x22e6ff);
    screen.position.set(0, 1.8, 1.55);
    r.add(screen);
    // long-range console
    const con = Props.console({ w: 1.4, h: 0.8, screens: 4 });
    con.position.set(0, 0, 0.8);
    r.add(con);
    r.register(con, "Comms Console", () => {
      audio.scan();
    });
  }

  private buildLounge(r: RoomCtx): void {
    const couch1 = Props.couch();
    couch1.position.set(-0.6, 0, -0.4);
    couch1.rotation.y = Math.PI / 2;
    r.add(couch1);
    const couch2 = Props.couch();
    couch2.position.set(0.6, 0, -0.4);
    couch2.rotation.y = Math.PI / 2;
    r.add(couch2);
    const coffee = Props.coffeeStation();
    coffee.position.set(-0.8, 0, 0.7);
    r.add(coffee);
    const plant = Props.plant();
    plant.position.set(0.9, 0, 0.6);
    r.add(plant);
    const screen = Props.wallScreen(0.9, 0.5, 0x88d8ff);
    screen.position.set(0, 1.9, 1.55);
    r.add(screen);
    const shelf = Props.shelf(3);
    shelf.position.set(1.0, 0, -0.6);
    r.add(shelf);
    // floating ornament (zero-g)
    const orb = sphere(0.08, tinted("fabric", 0x88ccee), 16);
    orb.position.set(0, 1.4, 0);
    r.add(orb);
    r.register(coffee, "Brew Coffee", () => audio.coffee());
  }

  private buildGalley(r: RoomCtx): void {
    const table = Props.diningTable();
    table.position.set(0, 0, -0.4);
    r.add(table);
    const foodDisp = Props.coffeeStation();
    foodDisp.position.set(1.0, 0, 0.8);
    r.add(foodDisp);
    const counter = roundedBox(1.2, 0.9, 0.6, 0.04, mat("hullLight"));
    counter.position.set(-1.0, 0.45, 0.6);
    r.add(counter);
    const screen = Props.wallScreen(0.6, 0.4, 0xffb000);
    screen.position.set(0, 1.9, 1.55);
    r.add(screen);
    r.register(foodDisp, "Dispense Food", () => audio.coffee());
  }

  private buildMedical(r: RoomCtx): void {
    const bed1 = Props.medBed();
    bed1.position.set(-0.6, 0, -0.5);
    r.add(bed1);
    const bed2 = Props.medBed();
    bed2.position.set(0.7, 0, -0.5);
    r.add(bed2);
    const lamp = Props.surgicalLamp();
    lamp.position.set(0.1, 2.6, -0.5);
    r.add(lamp);
    const screen = Props.wallScreen(0.8, 0.5, 0x39ff88);
    screen.position.set(0, 2.0, 1.55);
    r.add(screen);
    const cabinet = Props.locker();
    cabinet.position.set(1.2, 0, 0.7);
    r.add(cabinet);
    const monitor = Props.wallScreen(0.5, 0.4, 0x39ff88);
    monitor.position.set(-1.0, 1.8, -1.55);
    r.add(monitor);
    r.register(screen, "Medical Scan", () => {
      audio.scan();
    });
  }

  private buildLab(r: RoomCtx): void {
    const bench = Props.labBench();
    bench.position.set(0, 0, -0.3);
    r.add(bench);
    const bench2 = Props.labBench();
    bench2.position.set(0.4, 0, 0.6);
    bench2.rotation.y = Math.PI / 2;
    r.add(bench2);
    const screen = Props.wallScreen(1.0, 0.6, 0x39ff88);
    screen.position.set(0, 1.9, 1.55);
    r.add(screen);
    // sample containment
    const container = roundedBox(0.6, 0.7, 0.5, 0.02, mat("glass"));
    container.position.set(-1.0, 0.4, 0.5);
    r.add(container);
    const sample = cone(0.12, 0.3, emissiveSurface(0x39ff88, 1.2), 16);
    sample.position.set(-1.0, 0.6, 0.5);
    r.add(sample);
    r.register(bench, "Scan Sample", () => audio.scan());
  }

  private buildReactor(r: RoomCtx): void {
    const core = Props.core(0x39e6ff, 0x223a5a);
    core.position.set(0, 0, 0);
    r.add(core);
    const screen = Props.wallScreen(0.7, 0.5, 0xffb000);
    screen.position.set(-1.2, 1.9, -1.55);
    r.add(screen);
    const conduit = Props.conduit(3.4, 2.2);
    conduit.position.set(0, 0, 1.55);
    r.add(conduit);
    // containment rings
    for (let i = 0; i < 3; i++) {
      const ring = torus(1.2, 0.04, mat("gold"), 32);
      ring.position.set(0, 0.3 + i * 0.05, 0);
      ring.rotation.x = Math.PI / 2;
      r.add(ring);
    }
    // hazard marking
    const hazard = box(1.4, 0.4, 0.02, emissiveSurface(0xff2244, 0.8));
    hazard.position.set(0, 0.25, 1.55);
    r.add(hazard);
    r.register(core, "Reactor Controls", () => audio.reactorPulse());
  }

  private buildDefense(r: RoomCtx): void {
    const rack = Props.weaponRack();
    rack.position.set(-0.9, 0, -0.6);
    r.add(rack);
    const rack2 = Props.weaponRack();
    rack2.position.set(0.9, 0, -0.6);
    r.add(rack2);
    const console = Props.console({ w: 1.5, h: 0.9, screens: 4 });
    console.position.set(0, 0, 0.8);
    r.add(console);
    const screen = Props.wallScreen(1.0, 0.6, 0xff2244);
    screen.position.set(0, 1.9, 1.55);
    r.add(screen);
    // red alert light
    const alert = sphere(0.08, emissiveSurface(0xff2244, 2.0), 16);
    alert.position.set(1.2, 2.4, 0);
    alert.userData.alertLight = true;
    r.add(alert);
    r.register(console, "Security Console", () => audio.warn());
  }

  private buildPower(r: RoomCtx): void {
    for (const [x, z] of [
      [-1.0, -0.6],
      [-1.0, 0.6],
      [0.2, -0.6],
      [0.2, 0.6],
    ] as const) {
      const bank = roundedBox(0.6, 1.7, 0.7, 0.03, mat("hullLight"));
      bank.position.set(x, 0.85, z);
      r.add(bank);
      const led = glowStrip(0.4, 0.04, emissiveSurface(0x39ff88, 1.5));
      led.position.set(x, 1.6, z + 0.36);
      r.add(led);
    }
    const screen = Props.wallScreen(0.9, 0.5, 0x22e6ff);
    screen.position.set(0, 1.9, 1.55);
    r.add(screen);
    const console = Props.console({ w: 1.2, h: 0.7, screens: 5 });
    console.position.set(1.0, 0, 0.4);
    r.add(console);
    r.register(console, "Power Reroute", () => audio.click());
  }

  // ---- Tail: warp/engineering + cargo bay ----
  private buildTail(): void {
    // Rear hub: engineering/warp room center x=0, z=24
    const z0 = 22;
    const z1 = 26.5;
    this.addFloor(-(CX + WT), CX + WT, z0, z1);
    this.addCeil(-(CX + WT), CX + WT, z0, z1);
    this.addWallZ(z0, -(CX + WT), CX + WT, 0, H);
    this.addWallZ(z1, -(CX + WT), CX + WT, 0, H);
    this.addWallX(-(CX + WT), z0, z1, 0, H);
    this.addWallX(CX + WT, z0, z1, 0, H);
    // door from corridor
    this.addDoor(22.2, 0, false);

    const eng = new THREE.Group();
    this.root.add(eng);
    this.rooms.set("engineering", eng);
    const warpCore = Props.core(0x7a3aff, 0x2a1a4a);
    warpCore.position.set(0, 0, 1.2);
    eng.add(warpCore);
    const screen = Props.wallScreen(0.8, 0.5, 0xffb000);
    screen.position.set(-1.2, 2.0, 26.4);
    eng.add(screen);
    const screen2 = Props.wallScreen(0.8, 0.5, 0x7a3aff);
    screen2.position.set(1.2, 2.0, 26.4);
    eng.add(screen2);
    // warp control pedestal with red cover + lever
    const pedestal = this.buildWarpPedestal();
    pedestal.position.set(0, 0, 0);
    eng.add(pedestal);

    // Cargo bay at tail
    const cz0 = 27.0;
    const cz1 = 34.0;
    this.addFloor(-(CX + WT + 0.8), CX + WT + 0.8, cz0, cz1);
    this.addCeil(-(CX + WT + 0.8), CX + WT + 0.8, cz0, cz1);
    this.addWallZ(cz0, -(CX + WT + 0.8), CX + WT + 0.8, 0, H);
    this.addWallX(-(CX + WT + 0.8), cz0, cz1, 0, H);
    this.addWallX(CX + WT + 0.8, cz0, cz1, 0, H);
    this.addDoor(26.8, 0, false);
    const cargo = new THREE.Group();
    this.root.add(cargo);
    this.rooms.set("cargo", cargo);
    const p1 = Props.pallet();
    p1.position.set(-1.2, 0, 29.5);
    cargo.add(p1);
    const p2 = Props.pallet();
    p2.position.set(1.0, 0, 30.5);
    cargo.add(p2);
    const p3 = Props.crate(1.0, 0x4a5a4a);
    p3.position.set(0, 0, 29.0);
    cargo.add(p3);
    // suit station near ramp
    const suit = Props.suitStation();
    suit.position.set(1.3, 0, 32.5);
    cargo.add(suit);
    // ramp (visual; animated by landing system)
    const ramp = this.buildRamp();
    ramp.position.set(0, 0, 33.4);
    cargo.add(ramp);
    this.ramp = ramp;
  }

  private buildRamp(): THREE.Group {
    const g = new THREE.Group();
    const floor = plane(3.0, 2.2, mat("floor"));
    floor.position.set(0, 0.03, 1.1);
    g.add(floor);
    const railL = box(0.06, 0.5, 2.2, mat("hullDark"));
    railL.position.set(-1.45, 0.3, 1.1);
    const railR = railL.clone();
    railR.position.x = 1.45;
    g.add(railL, railR);
    g.userData.ramp = true;
    return g;
  }

  private buildWarpPedestal(): THREE.Group {
    const g = new THREE.Group();
    const base = roundedBox(1.2, 1.0, 0.7, 0.04, mat("console"));
    base.position.y = 0.5;
    g.add(base);
    // red safety cover
    const cover = roundedBox(0.5, 0.18, 0.4, 0.02, tinted("console", 0xaa2222));
    cover.position.set(0, 1.0, 0);
    cover.rotation.x = -0.1;
    g.add(cover);
    // warp lever
    const lever = cyl(0.03, 0.04, 0.6, mat("steel"), 10);
    lever.position.set(0, 1.0, 0);
    g.add(lever);
    const knob = sphere(0.06, emissiveSurface(0x7a3aff, 2.0), 12);
    knob.position.set(0, 1.32, 0);
    g.add(knob);
    g.userData.kind = "warpPedestal";
    g.userData.cover = cover;
    g.userData.lever = lever;
    this.warpPedestal = g;
    return g;
  }

  warpPedestal: THREE.Group | null = null;
  ramp: THREE.Group | null = null;

  /** Update dynamic elements: auto-open doors near the player, close logic. */
  update(dt: number, playerX: number, playerZ: number, playerR: number, shipOffsetX = 0, shipOffsetZ = 0): void {
    for (const d of this.doors) {
      // auto-open when the player is close to the doorway
      const dx = d.group.position.x + shipOffsetX;
      const dz = d.group.position.z + shipOffsetZ;
      const dist = Math.hypot(playerX - dx, playerZ - dz);
      if (dist < 1.7) d.open();
      d.update(dt, playerX, playerZ, playerR);
    }
  }
}

// local helper re-export to avoid unused import warnings
const torus = (r: number, t: number, m: THREE.Material, seg = 20) => {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, t, 12, seg), m);
  return mesh;
};
