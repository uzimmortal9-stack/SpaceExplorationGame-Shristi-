import * as THREE from "three";
import { Renderer } from "./core/renderer";
import { Input } from "./core/input";
import { audio } from "./core/audio";
import { initMaterials, mat, emissiveSurface } from "./world/materials";
import { CollisionWorld } from "./systems/collision";
import { InteractionSystem } from "./systems/interact";
import { PlayerController } from "./systems/player";
import { ShipInterior } from "./world/ship";
import { ShipExterior } from "./world/exterior";
import { SolarSystem, Target } from "./world/solar";
import { Jungle } from "./world/jungle";
import { FlightSystem } from "./systems/flight";
import { WarpSystem } from "./systems/warp";
import { LandingSystem } from "./systems/landing";
import { Hud } from "./ui/hud";
import { SaveSystem } from "./systems/save";
import { damp } from "./core/math";

type State = "loading" | "menu" | "explore" | "flight" | "warp" | "orbit" | "landing" | "planet" | "paused";

const SEAT_LOCAL = new THREE.Vector3(0, 1.5, -9.2);
const SHIP_START = new THREE.Vector3(40, 0, 0);

export class Game {
  private renderer: Renderer;
  private input: Input;
  private hud = new Hud();
  private collision = new CollisionWorld();
  private interact = new InteractionSystem();

  private shipGroup = new THREE.Group();
  private interior!: ShipInterior;
  private exterior!: ShipExterior;
  private solar!: SolarSystem;
  private jungle!: Jungle;

  private player!: PlayerController;
  private flight!: FlightSystem;
  private warp = new WarpSystem();
  private landing!: LandingSystem;

  private state: State = "loading";
  private paused = false;
  private elapsed = 0;
  private target: Target | null = null;
  private throttleArmed = false;
  private coverOpen = false;
  private rampLowered = false;
  private gearDeployed = false;
  private controlsShown = false;
  private signalFound = false;
  private sat = false;
  private qaTurbo = false;
  private planetActive = false;

  private starfield: THREE.Points;
  private dome: THREE.Mesh;
  private virtualShip = SHIP_START.clone();
  private menuAngle = 0;

  constructor() {
    initMaterials();
    this.renderer = new Renderer();
    this.input = new Input(this.renderer.renderer.domElement);
    this.starfield = this.renderer.createStarfield();
    this.dome = this.renderer.createSpaceDome();
    this.hud.onStart = () => this.startMission();
    this.hud.onResume = () => this.togglePause();
    this.buildWorld();
    this.wireSignals();
    this.buildPlayer();
    this.landing = new LandingSystem(this.shipGroup, this.renderer.scene, this.jungle.root, this.planetObject());
    this.startGameLoop();
    this.showMainMenu();
    this.installDebug();
  }

  /**
   * QA / debug facade — lets a headless test (or a curious player) jump
   * directly to any scene. Exposed on window.__voyager.
   */
  private installDebug(): void {
    const self = this;
    const qa = {
      scene: (name: string) => self.qaScene(name),
      getState: () => self.state,
      setTurbo: (v: boolean) => (self.qaTurbo = v),
    };
    (window as any).__voyager = qa;
  }

  private qaScene(name: string): void {
    this.hud.hideMainMenu();
    this.hud.hidePause();
    this.hud.hideEndScreen();
    this.hud.hideLoading();
    this.hud.hideFlight();
    switch (name) {
      case "menu":
        this.showMainMenu();
        break;
      case "interior": {
        this.state = "explore";
        this.sat = false;
        this.ensureCameraChild(false);
        this.player.teleport(0, 0, 0, Math.PI);
        this.renderer.camera.position.copy(this.player.eyePos);
        this.renderer.camera.rotation.set(0, 0, 0);
        this.renderer.camera.rotateY(Math.PI);
        this.renderer.camera.rotateX(-0.1);
        this.starfield.visible = true;
        break;
      }
      case "bridge": {
        this.state = "explore";
        this.sat = false;
        this.ensureCameraChild(false);
        this.player.teleport(-1.5, 0, -9.5, Math.PI);
        this.renderer.camera.position.copy(this.player.eyePos);
        this.renderer.camera.rotation.set(0, 0, 0);
        this.renderer.camera.rotateY(Math.PI);
        this.renderer.camera.rotateX(-0.05);
        this.starfield.visible = true;
        break;
      }
      case "flight": {
        this.state = "flight";
        this.sat = true;
        this.flight = this.flight ?? new FlightSystem(this.shipGroup);
        this.flight.sitIn(this.renderer.camera);
        this.flight.mode = "cockpit";
        this.shipGroup.quaternion.identity();
        this.shipGroup.position.set(0, 0, 0);
        this.virtualShip.copy(SHIP_START);
        this.updateSolarOffset();
        this.hud.showFlight();
        this.starfield.visible = true;
        break;
      }
      case "chase": {
        this.qaScene("flight");
        this.flight.mode = "chase";
        break;
      }
      case "orbital": {
        this.qaScene("flight");
        this.flight.mode = "orbital";
        break;
      }
      case "warp": {
        this.state = "warp";
        this.ensureCameraChild(true);
        this.renderer.camera.position.set(0, 1.5, -9.2);
        this.renderer.camera.quaternion.identity();
        this.warp.start(this.solar.jungle.position, () => {
          this.virtualShip.copy(this.solar.jungle.position).add(new THREE.Vector3(0, 0, 160));
          this.updateSolarOffset();
          this.state = "orbit";
        });
        this.starfield.visible = true;
        break;
      }
      case "landing": {
        this.beginLanding();
        break;
      }
      case "planet": {
        this.activatePlanet();
        this.player.teleport(8, 2, 4, Math.PI);
        break;
      }
      case "pool": {
        this.activatePlanet();
        const p = this.jungle.poolPos;
        this.player.teleport(p.x - 6, 3, p.z - 4, Math.PI * 0.9);
        break;
      }
    }
  }

  private planetObject(): THREE.Object3D {
    return this.solar.jungleMesh ?? new THREE.Object3D();
  }

  private buildWorld(): void {
    const scene = this.renderer.scene;
    // ship group: interior + exterior
    scene.add(this.shipGroup);
    this.interior = new ShipInterior(this.collision, this.interact, {
      onPilotSeat: () => this.sitInPilot(),
      onStand: () => this.standUp(),
      onThrottle: () => this.pressThrottle(),
      onWarpLever: () => this.pullWarpLever(),
      onSitSeat: () => undefined,
    });
    this.shipGroup.add(this.interior.root);
    this.exterior = new ShipExterior();
    this.exterior.setRamp(this.interior.ramp);
    this.exterior.setGearDeployed(false);
    this.exterior.setVisible(false);
    this.shipGroup.add(this.exterior.root);

    // solar system
    this.solar = new SolarSystem();
    scene.add(this.solar.root);
    scene.add(this.solar.sunLight);
    // enable the sun as the primary key light for space / hull / planet
    this.solar.sunLight.position.set(400, 220, 180);
    this.solar.sunLight.target.position.set(0, 0, 0);
    this.solar.sunLight.intensity = 2.6;
    scene.add(this.solar.sunLight.target);
    // soft fill so interiors and shadows aren't pitch black
    const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x1a2430, 0.85);
    scene.add(hemi);
    const hemi2 = new THREE.HemisphereLight(0xffffff, 0x000000, 0.35);
    scene.add(hemi2);

    // jungle (hidden until landing)
    this.jungle = new Jungle(this.collision);
    this.jungle.root.visible = false;
    scene.add(this.jungle.root);

    this.updateSolarOffset();
  }

  private buildPlayer(): void {
    this.player = new PlayerController(this.collision, this.input);
    this.player.teleport(0, 0, -4, 0);
  }

  private wireSignals(): void {
    // nothing extra
  }

  private updateSolarOffset(): void {
    this.solar.root.position.copy(this.virtualShip.clone().negate());
  }

  private showMainMenu(): void {
    this.state = "menu";
    this.hud.showMainMenu();
    void this.renderer.setEnvironment("space");
    this.renderer.setBackgroundColor(0x000000);
    this.starfield.visible = true;
  }

  private async startMission(): Promise<void> {
    this.hud.hideMainMenu();
    this.hud.showLoading("INITIALIZING SHIP SYSTEMS...");
    await this.renderer.setEnvironment("space");
    this.hud.hideLoading();
    this.state = "explore";
    this.renderer.setBackgroundColor(0x000000);
    this.starfield.visible = true;
    this.input.requestLock();
    this.showObjective();
    if (!this.controlsShown) {
      this.controlsShown = true;
      this.hud.openControls();
      SaveSystem.save({ started: true, controlsSeen: true, state: "explore", player: { x: 0, y: 0, z: -4, yaw: 0 }, shipPosition: { x: 0, y: 0, z: 0 }, targetId: null, warpSeen: false });
    }
  }

  private showObjective(): void {
    if (this.state === "explore") this.hud.setObjective("Explore the Aurora Voyager. Reach the bridge and sit in the pilot seat.");
    else if (this.state === "flight" || this.state === "orbit")
      this.hud.setObjective("Select a target [T], open the red cover and pull the warp lever to jump to Lumis Prime.");
    else if (this.state === "planet") this.hud.setObjective("Follow the signal to the bioluminescent pool and ancient ruins.");
  }

  private sitInPilot(): void {
    if (this.state !== "explore" && this.state !== "planet") return;
    this.sat = true;
    this.state = "flight";
    this.flight = this.flight ?? new FlightSystem(this.shipGroup);
    this.flight.sitIn(this.renderer.camera);
    this.shipGroup.quaternion.identity();
    this.shipGroup.position.set(0, 0, 0);
    this.virtualShip.copy(SHIP_START);
    this.updateSolarOffset();
    this.flight.mode = "cockpit";
    this.hud.showFlight();
    this.showObjective();
    this.input.requestLock();
    this.renderer.camera.fov = 70;
    this.renderer.camera.updateProjectionMatrix();
    audio.click();
  }

  private standUp(): void {
    if (this.state !== "flight" && this.state !== "orbit") return;
    this.sat = false;
    this.state = this.landing.phase === "landed" ? "planet" : "explore";
    this.flight.stand(this.renderer.camera);
    // place player near pilot seat (ship is at origin in explore)
    const p = SEAT_LOCAL.clone().add(this.shipGroup.position);
    this.player.teleport(p.x, 0, p.z, Math.PI);
    this.hud.hideFlight();
    if (this.state === "planet") {
      this.activatePlanet();
    }
    this.input.requestLock();
  }

  private ensureCameraChild(child: boolean): void {
    const scene = this.renderer.scene;
    const cam = this.renderer.camera;
    const inShip = this.shipGroup.children.includes(cam);
    const inScene = scene.children.includes(cam);
    if (child && !inShip) {
      if (inScene) scene.remove(cam);
      this.shipGroup.add(cam);
    } else if (!child && !inScene) {
      if (inShip) this.shipGroup.remove(cam);
      scene.add(cam);
    }
  }

  private pressThrottle(): void {
    if (!this.sat) {
      this.hud.showMessage("Requires pilot seat.");
      return;
    }
    if (!this.throttleArmed) {
      this.throttleArmed = true;
      audio.switchHit();
      this.hud.showMessage("Safety lid opened — throttle armed. Hold W to accelerate.");
    } else {
      this.throttleArmed = false;
      audio.switchHit();
      this.hud.showMessage("Throttle disengaged.");
    }
  }

  private pullWarpLever(): void {
    if (!this.sat) {
      this.hud.showMessage("Requires pilot seat.");
      return;
    }
    if (this.state === "warp") return;
    if (!this.target) {
      this.target = this.solar.jungle;
      this.hud.showMessage("Target set to Lumis Prime. Pull lever again to warp.");
      return;
    }
    if (!this.coverOpen) {
      this.coverOpen = true;
      this.interior.setWarpCover(true);
      audio.clunk();
      this.hud.showMessage("Red cover opened — pull the lever to jump.");
      return;
    }
    // engage warp
    this.coverOpen = false;
    this.interior.setWarpCover(false);
    this.startWarp();
  }

  private startWarp(): void {
    this.state = "warp";
    audio.clunk();
    this.hud.showMessage("WARP DRIVE SPIN-UP");
    const target = this.target ?? this.solar.jungle;
    this.warp.start(target.position, () => {
      // place ship in orbit ahead of the target planet (ship forward = -Z)
      this.virtualShip.copy(target.position).add(new THREE.Vector3(0, 0, 160));
      this.updateSolarOffset();
      this.state = "orbit";
      this.showObjective();
      this.hud.showMessage("Arrived at " + target.name + ". Descend to enter the atmosphere.");
    });
  }

  private activatePlanet(): void {
    if (this.planetActive) {
      this.state = "planet";
      return;
    }
    this.planetActive = true;
    this.landing.stop();
    // set environment to jungle
    void this.renderer.setEnvironment("jungle");
    this.renderer.setBackgroundColor(0x69b8d8);
    this.starfield.visible = false;
    this.dome.visible = false;
    this.exterior.setVisible(true);
    this.exterior.setGearDeployed(true);
    this.gearDeployed = true;
    this.lowerRamp();
    this.player.setTerrain({
      heightAt: (x: number, z: number) => this.jungle.heightAt(x, z),
    });
    this.player.setMaterial("grass");
    this.state = "planet";
    this.showObjective();
    // signal source interactable
    const sig = this.signalBeacon();
    sig.position.set(this.jungle.poolPos.x, 1.2, this.jungle.poolPos.z);
    this.renderer.scene.add(sig);
    this.interact.add({
      object: sig,
      label: "Inspect Signal Source",
      range: 3.0,
      onInteract: () => {
        if (this.signalFound) return;
        this.signalFound = true;
        this.hud.showEndScreen();
        audio.warpExit();
      },
    });
  }

  private signalBeacon(): THREE.Group {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1, 12), mat("rock"));
    base.position.y = 0.5;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), emissiveSurface(0xffaa33, 2.5));
    tip.position.y = 1.3;
    g.add(base, tip);
    g.userData.signal = true;
    return g;
  }

  private lowerRamp(): void {
    if (this.rampLowered) return;
    this.rampLowered = true;
    if (this.interior.ramp) {
      const r = this.interior.ramp;
      r.rotation.x = -0.42;
      r.position.y = -0.1;
    }
    audio.gearDeploy();
    this.hud.showMessage("Rear ramp lowered. Step out to explore Lumis Prime.");
  }

  private togglePause(): void {
    if (this.state === "paused") {
      this.state = this.prevState;
      this.paused = false;
      this.hud.hidePause();
      this.input.requestLock();
    } else {
      if (this.state === "menu") return;
      this.prevState = this.state;
      this.state = "paused";
      this.paused = true;
      this.hud.showPause();
      this.input.exitLock();
    }
  }
  private prevState: State = "explore";

  private startGameLoop(): void {
    this.renderer.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    const rawDt = this.elapsed === 0 ? 0 : (performance.now() - this.lastT) / 1000;
    this.lastT = performance.now();
    const dt = Math.min(this.qaTurbo ? 1.0 : 0.05, rawDt);
    this.elapsed += rawDt;

    if (this.state === "menu") {
      this.menuAngle += dt * 0.1;
      this.renderer.camera.position.set(Math.sin(this.menuAngle) * 30, 4, Math.cos(this.menuAngle) * 30);
      this.renderer.camera.lookAt(0, 0, 0);
      this.renderer.update(dt);
      this.renderer.render();
      this.input.endFrame();
      return;
    }

    if (this.paused) {
      this.renderer.render();
      this.input.endFrame();
      return;
    }

    // Esc pause
    if (this.input.justPressed("escape")) {
      this.togglePause();
      this.input.endFrame();
      return;
    }

    // resume controls focus
    if (this.hud.settingsVisible || this.hud.controlsVisible) {
      this.renderer.update(dt);
      this.renderer.render();
      this.hud.tick(dt);
      this.input.endFrame();
      return;
    }

    // HUD back button closes controls -> reacquire
    if (this.input.justPressed("e") || this.input.justPressed(" ")) {
      // ignore
    }

    this.updateState(dt);
    this.renderer.update(dt);
    this.renderer.render();
    this.hud.tick(dt);
    this.input.endFrame();
  }

  private lastT = 0;

  private updateState(dt: number): void {
    switch (this.state) {
      case "explore":
        this.updateExplore(dt);
        break;
      case "flight":
      case "orbit":
        this.updateFlight(dt);
        break;
      case "warp":
        this.updateWarp(dt);
        break;
      case "landing":
        this.updateLanding(dt);
        break;
      case "planet":
        this.updatePlanet(dt);
        break;
    }
  }

  private updateExplore(dt: number): void {
    const look = this.input.consumeLook();
    const res = this.player.update(dt, look.yaw, look.pitch);
    if (res.step) audio.footstep("metal");
    // keep camera
    const eye = this.player.eyePos;
    this.renderer.camera.position.copy(eye);
    this.renderer.camera.rotation.set(0, 0, 0);
    this.renderer.camera.rotateY(this.player.yaw);
    this.renderer.camera.rotateX(this.player.pitch);

    this.interior.update(dt, this.player.pos.x, this.player.pos.z, this.player.radius);

    // interaction
    const it = this.interact.find(this.renderer.camera);
    this.hud.setInteraction(it ? it.label : "");
    if (it && (this.input.justPressed("e") || this.input.mouseJustPressed("left"))) {
      it.onInteract();
      audio.click();
    }
    if (this.input.justPressed("f")) {
      const near = this.interact.find(this.renderer.camera);
      if (near && near.label.includes("Pilot Seat")) this.sitInPilot();
    }
  }

  private updateFlight(dt: number): void {
    this.flight = this.flight ?? new FlightSystem(this.shipGroup);
    this.flight.update(dt, this.input, this.renderer.camera);

    // target cycling
    if (this.input.justPressed("t")) {
      this.cycleTarget();
    }
    // camera mode cycling
    if (this.input.justPressed("c")) {
      this.flight.mode = this.flight.mode === "cockpit" ? "chase" : this.flight.mode === "chase" ? "orbital" : "cockpit";
      audio.click();
    }
    // stand up
    if (this.input.justPressed("f")) {
      this.standUp();
      this.input.endFrame();
      return;
    }
    // force landing (debug/assist)
    if (this.input.justPressed("b")) {
      this.beginLanding();
      return;
    }

    // advance virtual ship position (fly through space)
    const fwd = this.flight.forwardWorld;
    this.virtualShip.addScaledVector(fwd, this.flight.speed * dt * 2);
    this.updateSolarOffset();

    // check proximity to target planet for orbit -> landing
    const target = this.target ?? this.solar.jungle;
    const dist = this.virtualShip.distanceTo(target.position);
    const orbiting = dist < 200;
    if (this.state === "orbit") {
      if (dist < 130) this.beginLanding();
    } else if (dist < 220 && target === this.solar.jungle) {
      this.state = "orbit";
      this.showObjective();
      this.hud.showMessage("In orbit around " + target.name + ". Descend to enter atmosphere [or B to auto-land].");
    }

    // camera
    if (this.flight.mode === "cockpit") {
      this.ensureCameraChild(true);
      this.renderer.camera.position.set(0, 1.5, -9.2);
      this.renderer.camera.quaternion.identity();
      this.exterior.setVisible(false);
    } else {
      // chase / orbital: camera outside, hull visible
      this.ensureCameraChild(false);
      this.exterior.setVisible(true);
      this.renderer.camera.rotation.set(0, 0, 0);
      if (this.flight.mode === "chase") {
        const back = this.flight.forwardWorld.clone().multiplyScalar(24);
        const up = new THREE.Vector3(0, 6, 0);
        this.renderer.camera.position.copy(this.shipGroup.position).add(back).add(up);
        this.renderer.camera.lookAt(this.shipGroup.position);
      } else {
        const a = this.elapsed * 0.3;
        this.renderer.camera.position.set(Math.cos(a) * 30, 10, Math.sin(a) * 30);
        this.renderer.camera.lookAt(this.shipGroup.position);
      }
    }

    // HUD
    this.hud.showFlight();
    this.hud.updateFlight({
      speed: this.flight.speed,
      throttle: this.flight.throttle,
      target: target.name,
      targetDist: dist,
      warpReady: true,
      fuel: this.flight.fuel,
      hull: this.flight.hull,
      mode: this.flight.mode.toUpperCase(),
      altitude: 0,
      orbit: orbiting,
      gear: this.gearDeployed,
      warpPhase: "CHG",
    });

    // interaction (warp lever / throttle) while seated
    const it = this.interact.find(this.renderer.camera);
    this.hud.setInteraction(it ? it.label : "");
    if (it && (this.input.justPressed("e") || this.input.mouseJustPressed("left"))) it.onInteract();
  }

  private cycleTarget(): void {
    const list = this.solar.targets.filter((t) => t.type === "planet");
    if (list.length === 0) return;
    const idx = list.indexOf(this.target ?? this.solar.jungle);
    this.target = list[(idx + 1) % list.length];
    audio.targetLock();
    this.hud.showMessage("Target: " + this.target.name);
  }

  private beginLanding(): void {
    if (this.state === "landing") return;
    this.state = "landing";
    this.hud.setCloud(0);
    this.shipGroup.position.set(0, 170, 0);
    this.shipGroup.quaternion.identity();
    this.virtualShip.copy(this.solar.jungle.position);
    this.updateSolarOffset();
    this.exterior.setVisible(true);
    void this.renderer.setEnvironment("jungle");
    this.renderer.setBackgroundColor(0x9fd0e8);
    this.starfield.visible = false;
    this.dome.visible = false;
    this.landing.start(new THREE.Vector3(0, 0, 0), () => {
      this.activatePlanet();
    });
  }

  private updateWarp(dt: number): void {
    this.warp.update(dt);
    this.ensureCameraChild(true);
    this.renderer.camera.position.set(0, 1.5, -9.2);
    this.renderer.camera.quaternion.identity();
    this.exterior.setVisible(false);
    // apply camera effects
    this.renderer.camera.fov = damp(this.renderer.camera.fov, this.warp.fov, 4, dt);
    this.renderer.camera.updateProjectionMatrix();
    this.hud.setShake(this.warp.shake * 60);
    this.hud.setCloud(this.warp.tint * 0.25);
    this.hud.updateFlight({
      speed: 9999,
      throttle: 1,
      target: (this.target ?? this.solar.jungle).name,
      targetDist: -1,
      warpReady: false,
      fuel: this.flight?.fuel ?? 100,
      hull: this.flight?.hull ?? 100,
      mode: "WARP",
      altitude: 0,
      orbit: false,
      gear: false,
      warpPhase: this.warp.phase.toUpperCase(),
    });
    if (this.warp.phase === "done") {
      this.hud.setCloud(0);
      this.hud.setShake(0);
    }
  }

  private updateLanding(dt: number): void {
    this.landing.update(dt);
    this.ensureCameraChild(true);
    // camera stays cockpit (camera is child of shipGroup during flight)
    this.renderer.camera.position.set(0, 1.5, -9.2);
    this.renderer.camera.quaternion.identity();
    this.renderer.camera.fov = damp(this.renderer.camera.fov, 78, 2, dt);
    this.renderer.camera.updateProjectionMatrix();
    this.hud.setShake(this.landing.shake * 60 + this.landing.heat * 20);
    this.hud.setCloud(this.landing.cloud + this.landing.heat * 0.4);
    if (this.landing.phase === "landed") {
      this.hud.setCloud(0);
      this.hud.setShake(0);
    }
  }

  private updatePlanet(dt: number): void {
    this.ensureCameraChild(false);
    this.interior.update(dt, this.player.pos.x, this.player.pos.z, this.player.radius);
    const look = this.input.consumeLook();
    const res = this.player.update(dt, look.yaw, look.pitch, 1);
    if (res.step) audio.footstep("grass");
    const eye = this.player.eyePos;
    this.renderer.camera.position.copy(eye);
    this.renderer.camera.rotation.set(0, 0, 0);
    this.renderer.camera.rotateY(this.player.yaw);
    this.renderer.camera.rotateX(this.player.pitch);

    // ambient jungle calls occasionally
    if (Math.random() < dt * 0.1) audio.jungleCall();
    if (Math.random() < dt * 0.3) audio.spore();

    // interact (signal source)
    const it = this.interact.find(this.renderer.camera);
    this.hud.setInteraction(it ? it.label : "");
    if (it && (this.input.justPressed("e") || this.input.mouseJustPressed("left"))) {
      it.onInteract();
      audio.click();
    }
  }
}


