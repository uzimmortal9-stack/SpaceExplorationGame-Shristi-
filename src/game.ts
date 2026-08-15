/**
 * Game — the orchestrator.
 *
 * Owns the two scenes (ship interior + space, and the planet surface), the
 * phase machine that walks the player through the full loop, and the frame
 * update order. Systems stay independent; this file is the only place that
 * knows how they compose.
 *
 * Loop: interior → pilot seat → flight → target → warp → entry → landing →
 *       ramp → alien jungle → signal → resolution.
 */

import {
  Color,
  Fog,
  Group,
  Object3D,
  Quaternion,
  Scene,
  Vector3,
} from 'three';

import { AssetLoader } from './assets/assetLoader';
import { AudioEngine } from './core/audio';
import { Input } from './core/input';
import { clamp, lerp } from './core/math';
import { Renderer, type QualityLevel } from './core/renderer';
import { GameState } from './core/state';
import { CollisionWorld } from './systems/collision';
import { DescentSystem } from './systems/descent';
import { FlightSystem } from './systems/flight';
import { InteractionSystem } from './systems/interaction';
import { Player } from './systems/player';
import { WarpSystem } from './systems/warp';
import { Hud, type NavOption } from './ui/hud';
import { createMaterials, type MaterialLibrary } from './world/materials';
import { Planet, PAD, SIGNAL, TERRAIN_SIZE } from './world/planet';
import { Ship } from './world/ship/ship';
import { PILOT_SEAT, SPAWN, ROOM_TELEPORTS } from './world/ship/layout';
import { ShipExterior } from './world/shipExterior';
import { SolarSystem } from './world/space';

const LIBS: Array<[string, string, string]> = [
  ['three.js r180', 'MIT', 'WebGL2 renderer, glTF loading, post-processing'],
  ['Vite 7', 'MIT', 'Dev server and production bundler'],
  ['TypeScript 5.9', 'Apache-2.0', 'Typed source'],
];

export class Game {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly audio = new AudioEngine();
  private readonly state = new GameState();
  private readonly interact = new InteractionSystem();

  private assets!: AssetLoader;
  private mats!: MaterialLibrary;
  private hud!: Hud;

  /** Scene A: the ship (interior + exterior) and the solar system. */
  private readonly shipScene = new Scene();
  /** Scene B: the planet surface. */
  private readonly planetScene = new Scene();

  private ship!: Ship;
  private exterior!: ShipExterior;
  private system!: SolarSystem;
  private planet!: Planet;
  private flight!: FlightSystem;
  private warp!: WarpSystem;
  private descent!: DescentSystem;
  private player!: Player;

  /** Collision world currently in use (ship or planet). */
  private activeCollision!: CollisionWorld;
  private surfaceCollision = new CollisionWorld();

  /** The ship's transform in the planet scene once landed. */
  private readonly landedOrigin = new Vector3(PAD.x, 0, PAD.z - 40);

  private raf = 0;
  private running = false;
  private paused = false;
  private controlsSeen = false;
  private lastTime = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fps = 60;
  private onSurface = false;
  private restFade = 0;

  constructor(private readonly mount: HTMLElement) {
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    mount.append(canvas);

    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);

    window.addEventListener('resize', () => this.renderer.resize());
  }

  // ------------------------------------------------------------------- boot

  async boot(onProgress: (v: number, label: string) => void): Promise<void> {
    this.assets = new AssetLoader(this.renderer);

    onProgress(0.02, 'Reading asset manifest');
    await this.assets.loadManifest();

    onProgress(0.06, 'Loading models');
    await this.assets.loadAll((done, total, label) => {
      onProgress(0.06 + (done / Math.max(total, 1)) * 0.7, `Loading ${label}`);
    });

    onProgress(0.78, 'Building materials');
    this.mats = createMaterials(this.assets);

    onProgress(0.8, 'Loading environment lighting');
    await this.setupEnvironments();

    onProgress(0.86, 'Assembling the Aurora Drift');
    this.buildShipScene();

    onProgress(0.94, 'Generating Ilex Prime');
    this.buildPlanetScene();

    onProgress(0.97, 'Wiring interface');
    this.buildHud();
    this.wireEvents();

    this.renderer.setScene(this.shipScene);
    this.activeCollision = this.ship.collision;
    onProgress(1, 'Ready');
  }

  private async setupEnvironments(): Promise<void> {
    const interiorUrl = this.assets.environmentUrl('interior_1k');
    const spaceUrl = this.assets.environmentUrl('space_night_1k');
    const planetUrl = this.assets.environmentUrl('planet_sky_1k');

    // The ship scene uses an interior-ish HDRI so metal has something to
    // reflect; the deep-space HDRI is far too dark to carry the interiors.
    const interiorEnv = interiorUrl ? await this.renderer.loadEnvironment(interiorUrl) : null;
    if (interiorEnv) {
      this.shipScene.environment = interiorEnv;
      this.shipScene.environmentIntensity = 0.42;
    }
    if (spaceUrl) {
      const spaceEnv = await this.renderer.loadEnvironment(spaceUrl);
      if (spaceEnv) this.shipScene.userData.spaceEnv = spaceEnv;
    }
    this.shipScene.background = new Color(0x03050a);

    const planetEnv = planetUrl ? await this.renderer.loadEnvironment(planetUrl) : null;
    if (planetEnv) {
      this.planetScene.environment = planetEnv;
      this.planetScene.environmentIntensity = 0.85;
    }
  }

  private buildShipScene(): void {
    this.system = new SolarSystem(this.assets);
    this.shipScene.add(this.system.group);

    this.ship = new Ship({
      assets: this.assets,
      mats: this.mats,
      audio: this.audio,
      state: this.state,
      interact: this.interact,
      profile: this.renderer.qualityProfile,
    });
    this.shipScene.add(this.ship.group);

    this.exterior = new ShipExterior(this.assets, this.mats);
    this.exterior.setVisible(false);
    this.shipScene.add(this.exterior.group);

    this.player = new Player(this.renderer.camera, this.ship.collision, this.audio);
    this.shipScene.add(this.player.lamp, this.player.lamp.target);
    this.player.teleport(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN.yaw);

    this.flight = new FlightSystem(this.renderer.camera, this.audio, this.state);
    this.warp = new WarpSystem(this.renderer, this.audio, this.state);
    this.shipScene.add(this.warp.group);

    this.descent = new DescentSystem(
      this.renderer.camera, this.renderer, this.audio, this.state, this.exterior,
    );
  }

  private buildPlanetScene(): void {
    this.planet = new Planet({
      assets: this.assets,
      mats: this.mats,
      collision: this.surfaceCollision,
      interact: this.interact,
      audio: this.audio,
      state: this.state,
      profile: this.renderer.qualityProfile,
    });
    this.planetScene.add(this.planet.group);
    this.planetScene.fog = this.planet.fog;
    this.planetScene.background = new Color(0x7fc6d8);
  }

  private buildHud(): void {
    this.hud = new Hud(this.state, {
      onResume: () => this.resume(),
      onOpenSettings: () => this.hud.show('settings'),
      onOpenControls: () => this.hud.show('controls'),
      onOpenCredits: () => this.hud.show('credits'),
      onQuit: () => window.location.reload(),
      onSelectTarget: (id) => this.selectTarget(id),
      onQualityChange: (q) => this.setQuality(q),
      onVolumeChange: (bus, v) => this.audio.setVolume(bus, v),
      onSensitivityChange: (v) => { this.input.sensitivity = v; },
      onInvertY: (v) => { this.input.invertY = v; },
    });
    this.mount.append(this.hud.root);
    this.hud.setCredits(this.assets.creditRows(), this.assets.missing, LIBS);
    this.refreshNav();
  }

  private wireEvents(): void {
    window.addEventListener('aurora:sit', () => this.sitInPilotSeat());
    window.addEventListener('aurora:opennav', () => this.openNav());
    window.addEventListener('aurora:warp', () => this.engageWarp());
    window.addEventListener('aurora:signal', () => this.onSignalFound());
    window.addEventListener('aurora:rest', () => { this.restFade = 1.6; });
    window.addEventListener('aurora:alert', (e) => {
      this.ship.lights.setAlert(Boolean((e as CustomEvent).detail));
    });

    document.addEventListener('pointerlockchange', () => {
      if (!this.input.pointerLocked && this.running && !this.hud.isOpen() && !this.state.cinematic) {
        this.pause();
      }
    });
  }

  // ------------------------------------------------------------------- start

  async start(): Promise<void> {
    await this.audio.unlock();
    this.ship.startAmbience();

    this.state.setPhase('interior');
    this.state.setObjectives([
      { id: 'briefing', text: 'Review the mission briefing in Comms', done: false },
      { id: 'throttle', text: 'Arm the main drive on the bridge', done: false },
      { id: 'sit', text: 'Take the pilot seat', done: false },
    ]);
    this.state.pushSystems();

    if (!this.controlsSeen) {
      this.controlsSeen = true;
      this.hud.show('controls');
    } else {
      this.input.requestPointerLock();
    }

    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  resume(): void {
    this.paused = false;
    this.hud.hideAll();
    this.input.enabled = true;
    this.input.requestPointerLock();
  }

  pause(): void {
    if (this.state.cinematic) return;
    this.paused = true;
    this.input.exitPointerLock();
    this.hud.show('pause');
  }

  private setQuality(q: QualityLevel): void {
    this.renderer.applyQuality(q);
    this.audio.uiClick();
  }

  // ---------------------------------------------------------------- gameplay

  private sitInPilotSeat(): void {
    if (this.player.mode !== 'walking') return;
    if (!this.state.throttleUnlocked) {
      this.audio.uiDenied();
      this.state.toast('Open the throttle safety lid and arm the drive first', 'warn');
      return;
    }

    const seatWorld = new Vector3(PILOT_SEAT.x, 1.32, PILOT_SEAT.z + 0.15);
    this.player.sit(
      {
        position: seatWorld,
        yaw: Math.PI,
        pitch: 0,
        exit: new Vector3(PILOT_SEAT.x + 1.4, 0, PILOT_SEAT.z + 1.6),
      },
      () => {
        this.state.completeObjective('sit');
        if (this.onSurface) {
          // sitting down on the ground does not re-launch the ship
          this.state.toast('Systems idle. The Aurora Drift is grounded.', 'info');
          return;
        }
        this.state.setPhase('flight');
        this.flight.begin(new Vector3(0, 0, 0), new Quaternion());
        this.exterior.setVisible(true);
        this.state.toast('Flight control transferred', 'good');
        this.state.subtitle('Throttle on W. Nose follows the mouse. Press M to pick a destination.', 7);
        this.state.addObjective({ id: 'target', text: 'Lock a destination with the nav hologram [M]', done: false });
      },
    );
  }

  private standFromSeat(): void {
    if (!this.player.isSeated) return;
    this.player.stand(() => {
      if (!this.onSurface) {
        this.state.setPhase('interior');
        this.flight.end();
        this.exterior.setVisible(false);
      }
    });
  }

  private openNav(): void {
    this.refreshNav();
    this.hud.show('nav');
    this.input.exitPointerLock();
    this.audio.uiClick();
  }

  private refreshNav(): void {
    const origin = this.flight.active ? this.flight.position : new Vector3();
    const options: NavOption[] = this.system.bodies
      .filter((b) => b.kind !== 'star')
      .map((b) => ({
        id: b.id,
        name: b.name,
        kind: b.kind,
        distance: origin.distanceTo(b.position),
        description: b.description,
        color: b.color,
        landable: b.landable,
      }))
      .sort((a, b) => a.distance - b.distance);
    this.hud.setNavOptions(options);
  }

  private selectTarget(id: string): void {
    const body = this.system.get(id);
    if (!body) return;
    const origin = this.flight.active ? this.flight.position : new Vector3();
    this.state.setTarget({
      id: body.id,
      name: body.name,
      kind: body.kind,
      distance: origin.distanceTo(body.position),
      canWarp: true,
    });
    this.audio.targetLock();
    this.state.completeObjective('target');

    if (body.landable) {
      this.state.toast(`Destination locked: ${body.name}`, 'good');
      this.state.addObjective({ id: 'arm_warp', text: 'Arm the warp drive from the bridge console', done: false });
    } else {
      this.state.toast(`${body.name} locked — no landing site`, 'warn');
      this.state.subtitle('No surface access there. The signal comes from Ilex Prime.', 5);
    }

    // arming the drive starts the physical spin-up in the warp room
    if (this.warp.stage === 'idle') this.warp.beginCharge();
  }

  private engageWarp(): void {
    if (!this.state.target) {
      this.audio.uiDenied();
      return;
    }
    const started = this.warp.engage(() => this.onWarpArrive());
    if (!started) {
      this.state.toast('Warp core still charging', 'warn');
      return;
    }
    this.state.setPhase('warpTunnel');
    this.state.setCinematic(true);
    this.ship.lights.setPulse(1);

    // If the player pulled the lever while standing in the engine room, ride
    // the jump from there; the camera stays first person and shakes hard.
    this.state.subtitle('Field geometry stable. Engaging.', 4);
  }

  private onWarpArrive(): void {
    this.ship.lights.setPulse(0);
    const target = this.state.target ? this.system.get(this.state.target.id) : null;
    this.state.toast(`Arrived: ${target?.name ?? 'destination'}`, 'good');
    this.state.completeObjective('pull_lever');

    if (!target?.landable) {
      this.state.setCinematic(false);
      this.state.setPhase(this.player.isSeated ? 'flight' : 'interior');
      this.state.subtitle('Arrival complete. No landing site here.', 5);
      return;
    }

    // Place the ship on an approach vector and begin the descent cinematic.
    this.state.setPhase('entry');
    this.beginDescent();
  }

  private beginDescent(): void {
    // Move to the planet scene for the whole entry so the terrain is genuinely
    // beneath the ship as it falls.
    this.renderer.setScene(this.planetScene);
    this.planetScene.add(this.exterior.group);
    this.planetScene.add(this.descent.group);
    this.exterior.setVisible(true);
    this.exterior.group.position.set(PAD.x, 26000, PAD.z);
    this.descent.padPosition.copy(this.landedOrigin);

    this.state.setCinematic(true);
    this.descent.begin(() => this.onLanded());
  }

  private onLanded(): void {
    this.state.setPhase('landed');
    this.state.hasLanded = true;
    this.onSurface = true;

    // Move the ship interior into the planet scene, positioned at the pad, so
    // the player can walk out of it onto the surface with no loading screen.
    this.planetScene.add(this.ship.group);
    this.ship.group.position.copy(this.landedOrigin);
    this.ship.group.rotation.y = 0;
    this.planetScene.add(this.player.lamp, this.player.lamp.target);

    this.exterior.group.position.copy(this.landedOrigin);
    this.exterior.group.rotation.set(0, 0, 0);

    // The ship's local collision world must be offset into planet coordinates.
    this.activeCollision = this.ship.collision;
    this.state.setCinematic(false);

    // Stand the player up in the pilot seat's exit position, in world space.
    this.player.mode = 'walking';
    this.player.teleport(
      this.landedOrigin.x + PILOT_SEAT.x + 1.4,
      this.landedOrigin.y,
      this.landedOrigin.z + PILOT_SEAT.z + 1.8,
      0,
    );
    this.flight.end();

    this.state.toast('Touchdown confirmed', 'good');
    this.state.addObjective({ id: 'ramp', text: 'Lower the boarding ramp in the Cargo Bay', done: false });
    this.state.addObjective({ id: 'signal', text: 'Find the source of the signal', done: false });
    this.state.subtitle('Engines cooling. Atmosphere is breathable. The ramp is at the stern.', 7);

    this.audio.setLoopGain('ship_hum', 0.28, 3);
    this.audio.loop('wind', 'wind', 'ambient');
  }

  private onSignalFound(): void {
    this.state.setPhase('surface');
    window.setTimeout(() => {
      this.state.subtitle(
        'You have your answer. Somewhere behind you the Aurora Drift is still humming, waiting to carry it home.',
        10,
      );
      this.state.toast('MISSION COMPLETE — return to the ship when ready', 'good');
      this.state.addObjective({ id: 'return', text: 'Return to the Aurora Drift', done: false });
    }, 9000);
  }

  // -------------------------------------------------------------------- loop

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);

    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(dt, 0.05);

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.hud.setFps(this.fps, this.renderer.info.render.triangles);
    }

    this.update(dt);
    this.renderer.render();
    this.input.endFrame();
  };

  private update(dt: number): void {
    const overlayOpen = this.hud.isOpen();
    const cinematic = this.state.cinematic;
    const canAct = !this.paused && !overlayOpen && !cinematic;

    // ---- global keys --------------------------------------------------------
    if (this.input.keyPressed('Escape')) {
      if (overlayOpen) this.resume();
      else if (!cinematic) this.pause();
    }
    if (canAct && this.input.keyPressed('KeyM') && !this.onSurface) this.openNav();

    // ---- systems ------------------------------------------------------------
    this.system.update(dt);
    this.hud.update(dt);

    if (this.restFade > 0) {
      this.restFade -= dt;
      this.hud.fadeTo(this.restFade > 0.2 ? 1 : 0);
      if (this.restFade <= 0) this.hud.fadeTo(0);
    }

    // ---- descent cinematic owns the camera ----------------------------------
    if (this.descent.isActive) {
      this.descent.update(dt);
      this.planet.update(dt, this.renderer.camera.position);
      this.applyShake(dt);
      return;
    }

    // ---- flight -------------------------------------------------------------
    if (this.state.phase === 'flight' || this.warp.isActive) {
      if (this.flight.active) {
        this.flight.update(dt, this.input, canAct && !this.warp.isActive);
        this.exterior.group.position.copy(this.flight.position);
        this.exterior.group.quaternion.copy(this.flight.quaternion);
        this.exterior.setThrust(this.flight.throttle * (this.flight.boosting ? 1 : 0.75));
        this.exterior.setVisible(this.flight.cameraMode !== 'cockpit');
        this.exterior.update(dt);
        this.ship.group.position.copy(this.flight.position);
        this.ship.group.quaternion.copy(this.flight.quaternion);
        this.system.aimSunAt(this.flight.position);
        this.hud.setFlight(this.flight.throttle, this.flight.speed);
        this.renderer.addShake(this.flight.engineShake, 6);

        if (canAct && this.input.wasPressed('interact') && !this.warp.isActive) {
          this.standFromSeat();
        }
        if (canAct && this.input.wasPressed('gear')) {
          const next = this.state.systems.landingGear > 0.5 ? 0 : 1;
          this.state.systems.landingGear = next;
          this.exterior.setGear(next);
          this.audio.noiseBurst({ duration: 1.4, gain: 0.24, filter: 700, filterEnd: 220, q: 1.5 });
          this.state.pushSystems();
        }
        if (canAct && this.input.wasPressed('warp') && this.state.warpArmed && this.warp.stage === 'ready') {
          this.engageWarp();
        }

        // live distance to target
        if (this.state.target) {
          const b = this.system.get(this.state.target.id);
          if (b) {
            this.state.target.distance = this.flight.position.distanceTo(b.position);
            this.state.events.emit('target', this.state.target);
          }
        }
      }
    }

    // ---- on foot ------------------------------------------------------------
    const walking = this.player.mode !== 'seated';
    if (walking) {
      this.player.update(dt, this.input, canAct);
    } else {
      // seated but not flying (e.g. landed): keep the camera stable
      this.player.update(dt, this.input, canAct);
    }

    // ---- interaction --------------------------------------------------------
    if (walking || this.state.phase === 'landed') {
      const eye = this.renderer.camera.position;
      this.interact.update(eye, this.renderer.camera.quaternion);
      const c = this.interact.current;
      this.hud.setReticle(!cinematic && !overlayOpen);
      this.hud.setPrompt(c ? c.label : null, c?.detail);
      if (canAct && this.input.wasPressed('interact')) {
        if (!this.interact.activate() && this.player.isSeated) this.standFromSeat();
      }
    } else {
      this.hud.setPrompt(null);
      this.hud.setReticle(false);
    }

    // ---- world ticks --------------------------------------------------------
    const playerPos = this.player.position;
    if (this.onSurface) {
      // ship interior collision is expressed in local space; feed the player's
      // position back into ship-local coordinates for door triggers
      const local = playerPos.clone().sub(this.ship.group.position);
      this.ship.update(dt, local, 0.34, this.player.height);
      this.planet.update(dt, this.renderer.camera.position);
      this.exterior.update(dt);
      this.exterior.setRampDoor(this.state.systems.rampAngle);
      this.updateSurfaceCollision();
      this.checkRampExit();
    } else {
      this.ship.update(dt, playerPos, 0.34, this.player.height);
    }

    this.warp.update(dt, this.flight.position, this.flight.quaternion);
    this.applyShake(dt);
    this.state.pushSystems();
  }

  /**
   * On the surface the player can be inside the ship (ship-local colliders,
   * offset into world space) or outside on the terrain. Swap the active
   * collision world based on where they are.
   */
  private updateSurfaceCollision(): void {
    const p = this.player.position;
    const local = p.clone().sub(this.ship.group.position);
    const insideHull =
      local.x > -17 && local.x < 17 && local.z > -32 && local.z < 82 && p.y < 6;

    if (insideHull && this.activeCollision !== this.ship.collision) {
      this.activeCollision = this.ship.collision;
      this.rebindPlayerCollision(this.ship.collision, this.ship.group.position);
    } else if (!insideHull && this.activeCollision !== this.surfaceCollision) {
      this.activeCollision = this.surfaceCollision;
      this.rebindPlayerCollision(this.surfaceCollision, new Vector3());
    }
  }

  private collisionOffset = new Vector3();

  private rebindPlayerCollision(world: CollisionWorld, offset: Vector3): void {
    this.collisionOffset.copy(offset);
    // The Player holds a direct reference; swap it via a small proxy so the
    // controller keeps working in world space either way.
    (this.player as unknown as { collision: CollisionWorld }).collision =
      offset.lengthSq() < 1e-6 ? world : this.makeOffsetWorld(world, offset);
  }

  private makeOffsetWorld(world: CollisionWorld, offset: Vector3): CollisionWorld {
    // Wrap the ship's local collision world so world-space queries work while
    // the hull sits at an arbitrary position on the planet.
    const proxy = Object.create(world) as CollisionWorld;
    const o = offset.clone();
    proxy.move = (position, velocity, radius, height, dt, step) => {
      const localPos = position.clone().sub(o);
      const res = world.move(localPos, velocity, radius, height, dt, step);
      res.position.add(o);
      return res;
    };
    proxy.overlaps = (position, radius, height, skip) =>
      world.overlaps(position.clone().sub(o), radius, height, skip);
    proxy.surfaceAt = (x, z) => world.surfaceAt(x - o.x, z - o.z);
    return proxy;
  }

  /** Walking down the open ramp hands the player to the terrain. */
  private checkRampExit(): void {
    if (this.state.systems.rampAngle < 0.85) return;
    const local = this.player.position.clone().sub(this.ship.group.position);
    if (local.z > 84 && this.state.phase !== 'surface') {
      this.state.setPhase('surface');
      this.state.toast('Ilex Prime — surface pressure nominal', 'good');
      this.state.subtitle('Warm, wet air. Everything here is the wrong shade of green.', 6);
    }
  }

  private applyShake(dt: number): void {
    const s = this.renderer.sampleShake(dt);
    if (s.x === 0 && s.y === 0) return;
    const cam = this.renderer.camera;
    cam.position.x += s.x;
    cam.position.y += s.y;
    cam.rotateZ(s.roll * 0.35);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ debug

  /** Exposed for the developer console; disabled in the shipping UI. */
  get debug() {
    return {
      teleport: (roomId: string) => {
        const t = ROOM_TELEPORTS.find((r) => r.id === roomId);
        if (!t) return `unknown room: ${ROOM_TELEPORTS.map((x) => x.id).join(', ')}`;
        const base = this.onSurface ? this.ship.group.position : new Vector3();
        this.player.teleport(base.x + t.x, base.y, base.z + t.z, t.yaw);
        return `→ ${t.label}`;
      },
      rooms: () => ROOM_TELEPORTS.map((r) => r.id),
      land: () => this.beginDescent(),
      skipWarp: () => this.onWarpArrive(),
      state: () => this.state,
      surfaceTeleport: (x: number, z: number) => {
        this.player.teleport(x, this.planet.heightAt(x, z) + 1, z);
      },
      goSignal: () => {
        this.player.teleport(SIGNAL.x + 6, this.planet.heightAt(SIGNAL.x + 6, SIGNAL.z + 6) + 1, SIGNAL.z + 6);
      },
      fps: () => this.fps,
      assets: () => this.assets.stats,
    };
  }

  get scenes(): { ship: Scene; planet: Scene } {
    return { ship: this.shipScene, planet: this.planetScene };
  }
}

void Fog;
void Group;
void Object3D;
void clamp;
void lerp;
void TERRAIN_SIZE;
