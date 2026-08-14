import * as THREE from 'three';
import type { InteractionSystem } from './InteractionSystem';
import type { AmbientSystem } from '../systems/AmbientSystem';
import type { Animator } from '../core/Animator';
import { normalizedBox, normalizedCylinder } from './geometryAlignment';
import { COLORS, emissive, glass, matte, metal, shared } from './materials';
import { WorldPanel } from './WorldPanel';

export interface PropFactoryCallbacks {
  toast: (message: string) => void;
  suitChanged: (active: boolean) => void;
}

export class PropFactory {
  readonly solids: THREE.Object3D[] = [];
  readonly toggles: Record<string, boolean> = {};
  private interaction: InteractionSystem;
  private ambient: AmbientSystem;
  private animator: Animator;
  private callbacks: PropFactoryCallbacks;
  private sequence = 0;

  constructor(interaction: InteractionSystem, ambient: AmbientSystem, animator: Animator, callbacks: PropFactoryCallbacks) {
    this.interaction = interaction;
    this.ambient = ambient;
    this.animator = animator;
    this.callbacks = callbacks;
  }

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}:${this.sequence}`;
  }

  box(width: number, height: number, depth: number, material: THREE.Material = shared.panel): THREE.Mesh {
    return new THREE.Mesh(normalizedBox(width, height, depth, 'floor'), material);
  }

  solid(object: THREE.Object3D): THREE.Object3D {
    this.solids.push(object);
    return object;
  }

  createButton(label: string, onInteract: () => void, color = COLORS.cyan, enabled?: () => boolean): THREE.Group {
    const group = new THREE.Group();
    const base = this.box(0.28, 0.08, 0.25, metal(0x17242b, 0.42, 0.82));
    const capMaterial = emissive(color, 1.35);
    const cap = this.box(0.18, 0.055, 0.15, capMaterial);
    cap.position.set(0, 0.08, 0);
    group.add(base, cap);
    const id = this.id('button');
    this.interaction.register({
      id,
      object: cap,
      label,
      range: 3,
      enabled,
      onHover: (active) => {
        capMaterial.emissiveIntensity = active ? 3 : 1.35;
        cap.position.y = active ? 0.078 : 0.08;
      },
      onInteract: () => {
        cap.position.y = 0.06;
        window.setTimeout(() => (cap.position.y = 0.08), 120);
        onInteract();
      },
    });
    return group;
  }

  panel(title: string, lines: string[], width = 2.2, height = 1.1): WorldPanel {
    return new WorldPanel(title, lines, width, height);
  }

  chair(color = 0x263945): THREE.Group {
    const group = new THREE.Group();
    const seat = this.box(0.65, 0.16, 0.72, matte(color, 0.58));
    seat.position.y = 0.52;
    const back = this.box(0.65, 0.82, 0.14, matte(color, 0.58));
    back.position.set(0, 0.6, 0.3);
    const stem = new THREE.Mesh(normalizedCylinder(0.08, 0.14, 0.52, 10), metal(0x596a73));
    const foot = new THREE.Mesh(normalizedCylinder(0.33, 0.33, 0.06, 12), metal(0x2a363d));
    group.add(seat, back, stem, foot);
    return group;
  }

  table(width = 2.4, depth = 1.1, height = 0.82): THREE.Group {
    const group = new THREE.Group();
    const top = this.box(width, 0.11, depth, metal(0x344650, 0.48, 0.72));
    top.position.y = height - 0.11;
    const leg = new THREE.Mesh(normalizedCylinder(0.13, 0.2, height - 0.1, 10), metal(0x1b282f));
    const base = new THREE.Mesh(normalizedCylinder(0.43, 0.43, 0.06, 12), metal(0x17242a));
    group.add(top, leg, base);
    this.solid(top);
    return group;
  }

  bed(idSuffix: string): THREE.Group {
    const group = new THREE.Group();
    const frame = this.box(2.05, 0.34, 1.15, metal(0x26353e, 0.52, 0.78));
    const mattress = this.box(1.92, 0.18, 1.02, matte(0xadc4ca, 0.94));
    mattress.position.set(0, 0.34, 0);
    const pillow = this.box(0.56, 0.13, 0.72, matte(0xdce7e5, 1));
    pillow.position.set(0.62, 0.52, 0);
    const blanket = this.box(0.86, 0.07, 1.03, matte(0x30586a, 0.9));
    blanket.position.set(-0.46, 0.52, 0);
    group.add(frame, mattress, pillow, blanket);
    this.solid(frame);
    this.interaction.register({
      id: `bed:${idSuffix}`,
      object: mattress,
      label: 'REST / ADVANCE SHIP TIME',
      range: 3.2,
      onHover: (active) => ((mattress.material as THREE.MeshStandardMaterial).emissive.setHex(active ? 0x123344 : 0x000000)),
      onInteract: () => this.callbacks.toast('CHRONOMETER ADVANCED // REST CYCLE COMPLETE'),
    });
    return group;
  }

  workstation(cabinId: string): THREE.Group {
    const group = new THREE.Group();
    const desk = this.box(1.8, 0.12, 0.76, metal(0x364852, 0.5, 0.72));
    desk.position.y = 0.76;
    const legs = [
      [-0.76, 0, -0.27], [0.76, 0, -0.27], [-0.76, 0, 0.27], [0.76, 0, 0.27],
    ].map(([x, y, z]) => {
      const leg = this.box(0.08, 0.76, 0.08, shared.hullDark);
      leg.position.set(x, y, z);
      return leg;
    });
    const laptopBase = this.box(0.72, 0.035, 0.46, metal(0x10161b, 0.35, 0.88));
    laptopBase.position.set(-0.22, 0.89, 0);
    const laptop = new WorldPanel('Personal Log', ['ASTRA DATE 2194.08.17', 'VERDANT SIGNAL: REPEATING', 'Origin remains unresolved'], 0.68, 0.42);
    laptop.position.set(-0.22, 1.15, 0.22);
    laptop.rotation.x = -0.13;
    const mouse = this.box(0.14, 0.035, 0.2, matte(0x1c262c));
    mouse.position.set(0.42, 0.89, 0);
    const notebook = this.box(0.36, 0.025, 0.5, matte(0x6d573f));
    notebook.position.set(0.66, 0.885, -0.04);
    notebook.rotation.y = 0.14;
    const stylus = new THREE.Mesh(normalizedCylinder(0.012, 0.012, 0.34, 8, 'center'), metal(0xe6ba62));
    stylus.rotation.z = Math.PI / 2;
    stylus.position.set(0.64, 0.93, -0.22);
    const lampStem = new THREE.Mesh(normalizedCylinder(0.025, 0.04, 0.42, 8), metal(0x202c31));
    lampStem.position.set(-0.73, 0.88, -0.2);
    const lampMaterial = emissive(COLORS.warm, 1.8);
    const lamp = new THREE.Mesh(normalizedCylinder(0.13, 0.07, 0.14, 12, 'center'), lampMaterial);
    lamp.rotation.z = Math.PI / 2;
    lamp.position.set(-0.62, 1.25, -0.2);
    group.add(desk, ...legs, laptopBase, laptop, mouse, notebook, stylus, lampStem, lamp);
    this.solid(desk);
    let on = true;
    this.interaction.register({
      id: `lamp:${cabinId}`,
      object: lamp,
      label: () => (on ? 'DIM DESK LAMP' : 'ACTIVATE DESK LAMP'),
      onHover: (active) => (lampMaterial.emissiveIntensity = active ? 3 : on ? 1.8 : 0),
      onInteract: () => {
        on = !on;
        lampMaterial.emissiveIntensity = on ? 1.8 : 0;
        this.toggles[`lamp:${cabinId}`] = on;
      },
    });
    this.interaction.register({
      id: `laptop:${cabinId}`,
      object: laptop.screen,
      label: 'READ PERSONAL LOG',
      onHover: (active) => laptop.setHover(active),
      onInteract: () => this.callbacks.toast('LOG 14 // “THE SIGNAL SOUNDS ALMOST BIOLOGICAL.”'),
    });
    return group;
  }

  smartWindow(idSuffix: string, width = 2.6, height = 1.45): THREE.Group {
    const group = new THREE.Group();
    const frame = this.box(width + 0.22, height + 0.22, 0.13, metal(0x1b2931, 0.35, 0.9));
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 512; starCanvas.height = 256;
    const starContext = starCanvas.getContext('2d')!;
    const skyGradient = starContext.createLinearGradient(0, 0, 0, 256);
    skyGradient.addColorStop(0, '#02040b'); skyGradient.addColorStop(1, '#0c1530');
    starContext.fillStyle = skyGradient; starContext.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 190; i += 1) {
      const brightness = 130 + Math.floor(Math.random() * 125);
      starContext.fillStyle = `rgb(${brightness},${Math.min(255, brightness + 18)},255)`;
      const size = Math.random() > 0.9 ? 2 : 1;
      starContext.fillRect(Math.random() * 512, Math.random() * 256, size, size);
    }
    const starTexture = new THREE.CanvasTexture(starCanvas);
    starTexture.colorSpace = THREE.SRGBColorSpace;
    const spaceView = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: starTexture, toneMapped: false }));
    spaceView.position.z = 0.064;
    const windowMaterial = glass(0x80caff, 0.18);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), windowMaterial);
    pane.position.z = 0.071;
    const button = this.createButton('TOGGLE PDLC SMART FILM', () => {
      opaque = !opaque;
      windowMaterial.opacity = opaque ? 0.94 : 0.18;
      windowMaterial.color.setHex(opaque ? 0x020406 : 0x80caff);
      windowMaterial.transmission = opaque ? 0 : 0.55;
      this.toggles[`window:${idSuffix}`] = opaque;
      this.callbacks.toast(opaque ? 'PDLC FILM // PRIVACY MODE' : 'PDLC FILM // TRANSPARENT');
    }, COLORS.amber);
    button.position.set(width * 0.43, -height * 0.45, 0.16);
    button.rotation.x = Math.PI / 2;
    let opaque = false;
    group.add(frame, spaceView, pane, button);
    return group;
  }

  locker(idSuffix: string, withSuit = false): THREE.Group {
    const group = new THREE.Group();
    const cabinet = this.box(1.05, 2.2, 0.62, metal(0x2b3a42, 0.46, 0.8));
    const doorMaterial = metal(0x394d56, 0.48, 0.76);
    const door = this.box(0.94, 2.04, 0.08, doorMaterial);
    door.position.set(0, 0.08, 0.35);
    const handle = this.box(0.05, 0.34, 0.05, emissive(COLORS.cyan, 1.2));
    handle.position.set(0.34, 0.92, 0.08);
    door.add(handle);
    const inner = withSuit ? this.evaSuit() : this.foldedClothes();
    inner.position.set(0, 0.12, 0.08);
    inner.visible = false;
    group.add(cabinet, inner, door);
    this.solid(cabinet);
    let open = false;
    this.interaction.register({
      id: `locker:${idSuffix}`,
      object: door,
      label: () => (open ? 'CLOSE LOCKER' : 'OPEN LOCKER'),
      onHover: (active) => doorMaterial.emissive.setHex(active ? COLORS.cyan : 0x000000),
      onInteract: () => {
        open = !open;
        inner.visible = open;
        this.animator.tween(
          door,
          `locker:${idSuffix}`,
          {
            rotation: new THREE.Euler(0, open ? -2.0 : 0, 0, door.rotation.order),
            position: new THREE.Vector3(open ? -0.42 : 0, door.position.y, door.position.z),
          },
          0.6,
          undefined,
          () => { if (!open) inner.visible = false; },
        );
        this.toggles[`locker:${idSuffix}`] = open;
      },
    });
    return group;
  }

  private foldedClothes(): THREE.Group {
    const group = new THREE.Group();
    [0x5f7182, 0x7f463f, 0x314f61].forEach((color, index) => {
      const cloth = this.box(0.65, 0.14, 0.42, matte(color, 0.96));
      cloth.position.set(0, 0.18 + index * 0.15, 0);
      group.add(cloth);
    });
    return group;
  }

  evaSuit(): THREE.Group {
    const group = new THREE.Group();
    const torso = this.box(0.62, 0.92, 0.34, matte(0xd8e0dc, 0.7));
    torso.position.y = 0.82;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 12), glass(0x82cfff, 0.35));
    helmet.position.y = 1.88;
    const pack = this.box(0.48, 0.72, 0.22, metal(0x6f8188, 0.55, 0.6));
    pack.position.set(0, 0.98, -0.28);
    const limbMaterial = matte(0xbcc7c4, 0.76);
    for (const x of [-0.42, 0.42]) {
      const arm = new THREE.Mesh(normalizedCylinder(0.1, 0.12, 0.82, 10), limbMaterial);
      arm.position.set(x, 0.78, 0);
      const leg = new THREE.Mesh(normalizedCylinder(0.13, 0.16, 0.82, 10), limbMaterial);
      leg.position.set(x * 0.47, 0, 0);
      group.add(arm, leg);
    }
    const status = this.box(0.28, 0.2, 0.03, emissive(COLORS.green, 1.6));
    status.position.set(0, 1.22, 0.19);
    group.add(torso, helmet, pack, status);
    return group;
  }

  suitStation(): THREE.Group {
    const group = new THREE.Group();
    const alcove = this.box(1.8, 2.5, 0.42, metal(0x1c2a32, 0.42, 0.86));
    const suit = this.evaSuit();
    suit.position.set(-0.38, 0.1, 0.26);
    const panel = new WorldPanel('EVA-01', ['O₂ 100%  //  4.2 BAR', 'POWER 100%  //  THERMAL OK', 'ATMOS FILTER: STANDBY'], 0.82, 0.96);
    panel.position.set(0.46, 1.28, 0.28);
    panel.scale.setScalar(0.72);
    group.add(alcove, suit, panel);
    let suited = false;
    this.interaction.register({
      id: 'suit:station',
      object: suit,
      label: () => (suited ? 'RELEASE EVA SUIT' : 'EQUIP EVA SUIT'),
      range: 3.5,
      onHover: (active) => (suit.scale.setScalar(active ? 1.015 : 1)),
      onInteract: () => {
        suited = !suited;
        this.callbacks.suitChanged(suited);
        panel.setContent('EVA-01', suited
          ? ['O₂ 100%  //  4.2 BAR', 'POWER 100%  //  THERMAL OK', 'ATMOS FILTER: ACTIVE']
          : ['O₂ 100%  //  4.2 BAR', 'POWER 100%  //  THERMAL OK', 'ATMOS FILTER: STANDBY']);
        this.callbacks.toast(suited ? 'EVA SUIT SEALED // ALL SYSTEMS NOMINAL' : 'EVA SUIT RETURNED');
      },
    });
    return group;
  }

  crate(label = 'SUPPLY', color = 0x405461): THREE.Group {
    const group = new THREE.Group();
    const body = this.box(1.15, 0.72, 0.82, metal(color, 0.58, 0.72));
    const lidMaterial = metal(0x627783, 0.45, 0.8);
    const lid = this.box(1.18, 0.13, 0.85, lidMaterial);
    lid.position.y = 0.72;
    const bands = [-0.42, 0.42].map((x) => {
      const band = this.box(0.08, 0.86, 0.87, metal(0x151e23, 0.52, 0.82));
      band.position.x = x;
      return band;
    });
    group.add(body, lid, ...bands);
    this.solid(body);
    let open = false;
    const id = this.id('crate');
    this.interaction.register({
      id,
      object: lid,
      label: () => `${open ? 'CLOSE' : 'OPEN'} ${label} CRATE`,
      onHover: (active) => lidMaterial.emissive.setHex(active ? COLORS.amber : 0x000000),
      onInteract: () => {
        open = !open;
        this.animator.tween(
          lid,
          id,
          {
            rotation: new THREE.Euler(open ? -1.25 : 0, 0, 0, lid.rotation.order),
            position: new THREE.Vector3(lid.position.x, lid.position.y, open ? -0.3 : 0),
          },
          0.55,
        );
      },
    });
    return group;
  }

  freezer(): THREE.Group {
    const group = new THREE.Group();
    const cabinet = this.box(2.8, 2.45, 0.75, metal(0x30444d, 0.4, 0.82));
    const cold = this.box(2.55, 2.18, 0.64, emissive(0x8bdfff, 0.24));
    cold.position.set(0, 0.12, 0.08);
    const rationColors = [0xff735c, 0xe7cf73, 0x5ec28f, 0x7da7dd];
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const ration = this.box(0.32, 0.2, 0.32, matte(rationColors[(row + column) % rationColors.length], 0.72));
        ration.position.set(-0.9 + column * 0.45, 0.38 + row * 0.56, 0.48);
        group.add(ration);
      }
      const shelf = this.box(2.45, 0.04, 0.56, metal(0x718b95, 0.28, 0.7));
      shelf.position.set(0, 0.28 + row * 0.56, 0.35);
      group.add(shelf);
    }
    const paneMaterial = glass(0x9cefff, 0.28);
    const upper = this.box(2.5, 1.04, 0.05, paneMaterial);
    const lower = this.box(2.5, 1.04, 0.05, paneMaterial.clone());
    upper.position.set(0, 1.24, 0.76);
    lower.position.set(0, 0.16, 0.76);
    group.add(cabinet, cold, upper, lower);
    this.solid(cabinet);
    let open = false;
    this.interaction.register({
      id: 'freezer:glass',
      object: upper,
      label: () => (open ? 'SEAL FREEZER' : 'OPEN SPLIT FREEZER GLASS'),
      onHover: (active) => ((upper.material as THREE.MeshPhysicalMaterial).emissive?.setHex(active ? 0x114455 : 0x000000)),
      onInteract: () => {
        open = !open;
        this.animator.tween(upper, 'freezer:upper', { position: new THREE.Vector3(upper.position.x, open ? 2.14 : 1.24, upper.position.z) }, 0.7);
        this.animator.tween(lower, 'freezer:lower', { position: new THREE.Vector3(lower.position.x, open ? -0.76 : 0.16, lower.position.z) }, 0.7);
        this.callbacks.toast(open ? 'CRYO SHELF ACCESS GRANTED' : 'CRYO SHELF SEALED');
      },
    });
    return group;
  }

  toolRack(): THREE.Group {
    const group = new THREE.Group();
    const board = this.box(2.3, 1.55, 0.12, metal(0x26343b, 0.6, 0.65));
    const colors = [COLORS.amber, 0x91a2a9, COLORS.orange, COLORS.cyan];
    for (let i = 0; i < 8; i += 1) {
      const shaft = new THREE.Mesh(normalizedCylinder(0.035, 0.045, 0.48 + (i % 3) * 0.1, 8), metal(colors[i % colors.length], 0.5, 0.65));
      shaft.position.set(-0.9 + (i % 4) * 0.58, 0.22 + Math.floor(i / 4) * 0.72, 0.12);
      if (i % 2) shaft.rotation.z = 0.18;
      group.add(shaft);
    }
    const scanner = this.box(0.28, 0.5, 0.12, emissive(COLORS.cyan, 0.7));
    scanner.position.set(0.8, 0.8, 0.12);
    group.add(board, scanner);
    return group;
  }

  fuelTank(index: number): THREE.Group {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(normalizedCylinder(0.62, 0.72, 2.7, 20), glass(0x75dfff, 0.22));
    const liquidMaterial = emissive(index % 2 ? 0x00d9ff : 0x30a8ff, 1.3);
    liquidMaterial.transparent = true;
    liquidMaterial.opacity = 0.7;
    const liquid = new THREE.Mesh(normalizedCylinder(0.52, 0.56, 2.05, 18), liquidMaterial);
    const cap = new THREE.Mesh(normalizedCylinder(0.3, 0.68, 0.24, 16), metal(0x384952));
    cap.position.y = 2.7;
    group.add(shell, liquid, cap);
    this.ambient.pulse(liquidMaterial, 1.2, 0.45, 1.15 + index * 0.1);
    this.solid(shell);
    return group;
  }

  pipeRun(length = 3.2, color = 0xaebcc1): THREE.Group {
    const group = new THREE.Group();
    const pipe = new THREE.Mesh(normalizedCylinder(0.09, 0.09, length, 10, 'center'), metal(color, 0.34, 0.82));
    pipe.rotation.z = Math.PI / 2;
    const valveMaterial = metal(COLORS.orange, 0.42, 0.72);
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 18), valveMaterial);
    valve.rotation.y = Math.PI / 2;
    valve.position.y = 0.08;
    group.add(pipe, valve);
    let open = false;
    const valveKey = this.id('valve');
    this.interaction.register({
      id: valveKey,
      object: valve,
      label: () => (open ? 'CLOSE HYDROGEN VALVE' : 'OPEN HYDROGEN VALVE'),
      onHover: (active) => valve.scale.setScalar(active ? 1.08 : 1),
      onInteract: () => {
        open = !open;
        const target = new THREE.Euler(valve.rotation.x, valve.rotation.y, valve.rotation.z + (open ? Math.PI * 0.55 : -Math.PI * 0.55), valve.rotation.order);
        this.animator.tween(valve, valveKey, { rotation: target }, 0.55);
        this.callbacks.toast(`H₂ MANIFOLD // ${open ? 'FLOW ENABLED' : 'FLOW ISOLATED'}`);
      },
    });
    return group;
  }

  hygieneUnit(kind: 'toilet' | 'sink' | 'shower' | 'pod'): THREE.Group {
    const group = new THREE.Group();
    if (kind === 'toilet') {
      const body = new THREE.Mesh(normalizedCylinder(0.34, 0.42, 0.48, 16), matte(0xd7e1df, 0.6));
      const seat = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.08, 10, 20), matte(0xecf5f2, 0.5));
      seat.rotation.x = Math.PI / 2;
      seat.position.y = 0.49;
      group.add(body, seat);
      this.interaction.register({ id: this.id('toilet'), object: seat, label: 'VACUUM FLUSH', onInteract: () => this.callbacks.toast('WASTE RECOVERY CYCLE COMPLETE') });
    } else if (kind === 'sink') {
      const basin = this.box(1.0, 0.24, 0.55, matte(0xd9e2df, 0.48));
      basin.position.y = 0.8;
      const faucet = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 12, Math.PI), metal(0x8aa1a9, 0.22, 0.9));
      faucet.rotation.z = Math.PI / 2;
      faucet.position.set(0.25, 1.15, -0.08);
      const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.72), metal(0x9bc3ca, 0.08, 1));
      mirror.position.set(0, 1.65, 0.27);
      group.add(basin, faucet, mirror);
      this.interaction.register({ id: this.id('faucet'), object: faucet, label: 'ACTIVATE RECYCLED WATER', onInteract: () => this.callbacks.toast('H₂O FLOW // PURITY 99.997%') });
    } else if (kind === 'shower') {
      const base = new THREE.Mesh(normalizedCylinder(0.66, 0.66, 0.1, 24), metal(0x41545c, 0.35, 0.84));
      const curtain = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.3, 24, 1, true, 0, Math.PI * 1.55), glass(0xbceaff, 0.12));
      curtain.position.y = 1.15;
      group.add(base, curtain);
      this.interaction.register({ id: this.id('shower'), object: curtain, label: 'START SONIC SHOWER', onInteract: () => this.callbacks.toast('SONIC CLEANING FIELD // ACTIVE 10 SEC') });
    } else {
      const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.3, 8, 16), glass(0xaadfff, 0.18));
      shell.position.y = 1.05;
      group.add(shell);
      this.solid(shell);
    }
    return group;
  }

  beverageStation(): THREE.Group {
    const group = new THREE.Group();
    const machine = this.box(1.25, 1.55, 0.68, metal(0x283a43, 0.38, 0.78));
    const panel = new WorldPanel('NUTRI-CYCLE', ['TEA  //  COFFEE  //  WATER', 'CUP SENSOR: READY'], 0.82, 0.42);
    panel.position.set(0, 0.98, 0.37);
    const nozzle = new THREE.Mesh(normalizedCylinder(0.045, 0.07, 0.32, 10), metal(0x889ca3));
    nozzle.position.set(0, 0.64, 0.42);
    const cup = new THREE.Mesh(normalizedCylinder(0.12, 0.09, 0.26, 14), matte(0xc7d6d5));
    cup.position.set(0, 0.22, 0.48);
    cup.visible = false;
    group.add(machine, panel, nozzle, cup);
    this.solid(machine);
    this.interaction.register({
      id: 'beverage:brew', object: panel.screen, label: 'DISPENSE COFFEE',
      onHover: (active) => panel.setHover(active),
      onInteract: () => {
        cup.visible = true;
        panel.setContent('BREWING', ['DARK ROAST // 86°C', 'CYCLE COMPLETE']);
        this.callbacks.toast('COFFEE DISPENSED // MAGNETIC CUP SECURED');
      },
    });
    return group;
  }

  medicalBed(): THREE.Group {
    const group = new THREE.Group();
    const bed = this.box(2.2, 0.58, 0.82, metal(0xe1eceb, 0.45, 0.4));
    const pad = this.box(2.05, 0.13, 0.7, matte(0x8fb7bf, 0.7));
    pad.position.y = 0.58;
    const scannerMaterial = emissive(COLORS.cyan, 1.2);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.08, 10, 24, Math.PI), scannerMaterial);
    arch.rotation.x = Math.PI / 2;
    arch.position.set(0.2, 1.1, 0);
    const monitor = new WorldPanel('MEDSCAN', ['VITALS: NOMINAL', 'BIOLOAD: 0.02', 'RADIATION: SAFE'], 0.82, 0.7);
    monitor.position.set(-0.55, 1.25, -0.48);
    monitor.rotation.y = Math.PI * 0.1;
    group.add(bed, pad, arch, monitor);
    this.solid(bed);
    this.interaction.register({
      id: this.id('medscan'), object: arch, label: 'RUN DIAGNOSTIC SCAN',
      onHover: (active) => (scannerMaterial.emissiveIntensity = active ? 2.8 : 1.2),
      onInteract: () => {
        const nextX = arch.position.x > 0 ? -0.62 : 0.62;
        this.animator.tween(arch, `medscan:${this.id('arch')}`, { position: new THREE.Vector3(nextX, arch.position.y, arch.position.z) }, 1.1);
        this.callbacks.toast('MEDSCAN // HEALTH 100% // NO CONTAMINANTS');
      },
    });
    return group;
  }

  labBench(): THREE.Group {
    const group = new THREE.Group();
    const bench = this.table(2.8, 0.88, 0.86);
    const scanner = new THREE.Mesh(normalizedCylinder(0.42, 0.48, 0.72, 18), glass(0x62ffd4, 0.24));
    scanner.position.set(0, 0.86, 0);
    const specimenMaterial = emissive(0x74ff9d, 1.55);
    const specimen = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 1), specimenMaterial);
    specimen.position.set(0, 1.22, 0);
    for (let i = 0; i < 6; i += 1) {
      const vial = new THREE.Mesh(normalizedCylinder(0.035, 0.035, 0.24, 8), glass([0xff62bc, 0x62d5ff, 0x8fff62][i % 3], 0.35));
      vial.position.set(-0.98 + i * 0.22, 0.88, 0.14);
      group.add(vial);
    }
    const panel = new WorldPanel('XENO ANALYSIS', ['SAMPLE: UNCATALOGUED', 'SCAN READY', 'ISOTOPE LOCK: —'], 1.25, 0.82);
    panel.position.set(0.72, 1.56, -0.32);
    panel.rotation.x = -0.14;
    group.add(bench, scanner, specimen, panel);
    this.ambient.float(specimen, 0.06, 1.4);
    this.ambient.spin(specimen, new THREE.Vector3(0.4, 1, 0.2), 0.5);
    this.interaction.register({
      id: 'lab:scanner', object: scanner, label: 'ANALYZE XENO SAMPLE',
      onHover: (active) => scanner.scale.setScalar(active ? 1.02 : 1),
      onInteract: () => {
        panel.setContent('ANALYSIS COMPLETE', ['BIO-SILICATE LATTICE', 'AGE: 2.4 MILLION YEARS', 'SIGNAL RESONANCE: 99.8%']);
        this.callbacks.toast('SAMPLE CORRELATES WITH VERDANT SIGNAL');
      },
    });
    return group;
  }

  weaponLocker(): THREE.Group {
    const group = this.locker('armory', false);
    for (let i = 0; i < 3; i += 1) {
      const rifle = new THREE.Group();
      const barrel = this.box(0.08, 0.08, 1.05, metal(0x202b30, 0.3, 0.9));
      const stock = this.box(0.22, 0.3, 0.45, matte(0x35434a));
      stock.position.set(0, -0.11, 0.54);
      const cell = this.box(0.1, 0.22, 0.18, emissive(COLORS.amber, 1.2));
      cell.position.set(0, -0.18, 0.12);
      rifle.add(barrel, stock, cell);
      rifle.position.set(-0.28 + i * 0.28, 0.65, 0.48);
      rifle.rotation.x = -0.05;
      group.add(rifle);
    }
    return group;
  }

  hologramTable(title = 'ASTRA NAV'): THREE.Group {
    const group = new THREE.Group();
    const base = new THREE.Mesh(normalizedCylinder(1.15, 1.35, 0.82, 20), metal(0x17252d, 0.4, 0.86));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.08, 10, 32), emissive(COLORS.cyan, 1.4));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.84;
    const holoMaterial = emissive(COLORS.cyan, 1.6);
    holoMaterial.transparent = true;
    holoMaterial.opacity = 0.58;
    const holo = new THREE.Group();
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), emissive(COLORS.amber, 2.8));
    holo.add(star);
    [0.36, 0.57, 0.82].forEach((radius, index) => {
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.008, 4, 40), holoMaterial);
      orbit.rotation.x = Math.PI / 2 + index * 0.14;
      const planet = new THREE.Mesh(new THREE.SphereGeometry(0.04 + index * 0.015, 10, 8), emissive([0x62c8ff, 0xa96dff, 0x66ffae][index], 2));
      planet.position.set(radius, 0, 0);
      orbit.add(planet);
      holo.add(orbit);
      this.ambient.spin(orbit, new THREE.Vector3(0, 1, 0), 0.2 + index * 0.08);
    });
    holo.position.y = 1.45;
    group.add(base, rim, holo);
    this.ambient.spin(holo, new THREE.Vector3(0, 1, 0), 0.12);
    return group;
  }

  reactorCore(kind: 'reactor' | 'warp' | 'engine'): THREE.Group {
    const group = new THREE.Group();
    const coreColor = kind === 'reactor' ? 0x6b8cff : kind === 'warp' ? COLORS.cyan : COLORS.orange;
    const coreMaterial = emissive(coreColor, 3);
    coreMaterial.transparent = true;
    coreMaterial.opacity = 0.78;
    const core = new THREE.Mesh(normalizedCylinder(0.48, 0.48, 3.4, 20, 'center'), coreMaterial);
    core.position.y = 1.8;
    group.add(core);
    for (let i = 0; i < 4; i += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9 + i * 0.05, 0.08, 8, 28), metal(0x5d7180, 0.28, 0.94));
      ring.position.y = 0.55 + i * 0.82;
      ring.rotation.x = Math.PI / 2;
      ring.rotation.y = i * 0.4;
      group.add(ring);
      this.ambient.spin(ring, new THREE.Vector3(i % 2 ? 1 : 0, 1, i % 2 ? 0 : 1).normalize(), (i % 2 ? -1 : 1) * (0.35 + i * 0.09));
    }
    const base = new THREE.Mesh(normalizedCylinder(1.05, 1.25, 0.42, 18), metal(0x263740, 0.36, 0.88));
    const top = base.clone();
    top.position.y = 3.4;
    group.add(base, top);
    this.ambient.pulse(coreMaterial, 2.5, 1.25, kind === 'warp' ? 2.3 : 1.4);
    this.solid(base);
    return group;
  }

  lifeSupportUnit(): THREE.Group {
    const group = new THREE.Group();
    const body = this.box(2.15, 2.3, 0.72, metal(0x324750, 0.48, 0.72));
    const fans: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i += 1) {
      const fan = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.07, 8, 24), metal(0x71868e, 0.32, 0.8));
      fan.position.set(-0.52 + i * 1.04, 0.72, 0.4);
      const blades = new THREE.Group();
      for (let b = 0; b < 5; b += 1) {
        const blade = this.box(0.08, 0.29, 0.025, metal(0x91a6ab, 0.28, 0.76));
        blade.position.y = 0.15;
        blade.rotation.z = (b / 5) * Math.PI * 2;
        blades.add(blade);
      }
      blades.position.copy(fan.position);
      fans.push(fan);
      group.add(fan, blades);
      this.ambient.spin(blades, new THREE.Vector3(0, 0, 1), 3.4 + i);
    }
    const panel = new WorldPanel('LIFE SUPPORT', ['O₂ 21.4%  //  CO₂ 0.03%', 'HUMIDITY 42%', 'SCRUBBERS NOMINAL'], 1.62, 0.62);
    panel.position.set(0, 1.77, 0.4);
    group.add(body, panel);
    this.solid(body);
    this.interaction.register({ id: this.id('life-support'), object: panel.screen, label: 'RUN LIFE SUPPORT DIAGNOSTIC', onHover: (a) => panel.setHover(a), onInteract: () => this.callbacks.toast('LIFE SUPPORT // ALL LOOPS NOMINAL') });
    return group;
  }

  batteryBank(): THREE.Group {
    const group = new THREE.Group();
    const rack = this.box(2.3, 2.3, 0.62, metal(0x263840, 0.48, 0.82));
    group.add(rack);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const cell = this.box(0.3, 0.36, 0.12, emissive(row % 3 === 0 ? COLORS.amber : COLORS.cyan, 0.9));
        cell.position.set(-0.8 + column * 0.4, 0.25 + row * 0.5, 0.37);
        group.add(cell);
      }
    }
    this.solid(rack);
    return group;
  }

  decorativePlant(alien = false): THREE.Group {
    const group = new THREE.Group();
    const pot = new THREE.Mesh(normalizedCylinder(0.22, 0.3, 0.4, 12), matte(0x5a4b3c));
    group.add(pot);
    const leafMaterial = alien ? emissive(0x68ffb1, 0.55) : matte(0x4b8c62, 0.8);
    for (let i = 0; i < 8; i += 1) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 5), leafMaterial);
      const angle = (i / 8) * Math.PI * 2;
      leaf.scale.set(0.6, 2.5, 0.35);
      leaf.position.set(Math.cos(angle) * 0.18, 0.53 + (i % 3) * 0.12, Math.sin(angle) * 0.18);
      leaf.rotation.z = Math.cos(angle) * 0.4;
      group.add(leaf);
    }
    return group;
  }

  personalDetails(index = 0): THREE.Group {
    const group = new THREE.Group();
    const frame = this.box(0.68, 0.52, 0.06, metal(0x584c3d, 0.58, 0.52));
    const photoMat = new THREE.MeshBasicMaterial({ color: index ? 0xe6a87c : 0x7cb7e6 });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.42), photoMat);
    photo.position.set(0, 0.27, 0.035);
    frame.add(photo);
    const bag = this.box(0.68, 0.55, 0.38, matte(index ? 0x6d443c : 0x3f566d, 0.9));
    bag.position.set(0.8, 0, 0);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 12, Math.PI), matte(0x25292a));
    handle.position.set(0.8, 0.55, 0);
    group.add(frame, bag, handle);
    return group;
  }
}
