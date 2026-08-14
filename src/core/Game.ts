import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { GameMode, GameSettings, GameSnapshot } from '../types';
import { Input } from './Input';
import { AudioEngine } from './AudioEngine';
import { SaveSystem } from './SaveSystem';
import { CollisionSystem } from '../world/CollisionSystem';
import { InteractionSystem } from '../world/InteractionSystem';
import { AmbientSystem } from '../systems/AmbientSystem';
import { DoorSystem } from '../systems/DoorSystem';
import { PlayerController } from '../systems/PlayerController';
import { ShipInterior } from '../world/ShipInterior';
import { ShipExterior } from '../world/ShipExterior';
import { SpaceEnvironment } from '../world/SpaceEnvironment';
import { PlanetSurface } from '../world/PlanetSurface';
import { FlightSystem } from '../systems/FlightSystem';
import { WarpSystem, type WarpPhase } from '../systems/WarpSystem';
import { EntryLandingSystem, type EntryPhase } from '../systems/EntryLandingSystem';
import { UIManager, type UIActions } from '../ui/UIManager';
import { easeInOutCubic } from './Tween';

interface CameraTransition {
  kind: 'sit' | 'stand';
  elapsed: number;
  duration: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromQuaternion: THREE.Quaternion;
  toQuaternion: THREE.Quaternion;
}

export class Game {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly saves = new SaveSystem();
  readonly collision = new CollisionSystem();
  readonly ambient = new AmbientSystem();
  readonly ui: UIManager;
  readonly player: PlayerController;
  readonly interior: ShipInterior;
  readonly exterior: ShipExterior;
  readonly space: SpaceEnvironment;
  readonly surface: PlanetSurface;
  readonly flight: FlightSystem;
  readonly warp: WarpSystem;
  readonly entry: EntryLandingSystem;
  mode: GameMode = 'MENU';
  settings: GameSettings;
  seated = false;
  landed = false;
  suitActive = false;
  targetIndex = -1;
  targetLocked = false;
  private canvas: HTMLCanvasElement;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private menuCamera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 250000);
  private interaction: InteractionSystem;
  private doors: DoorSystem;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private previousMode: GameMode = 'EXPLORING';
  private cameraTransition: CameraTransition | null = null;
  private running = false;
  private debugOpen = false;
  private collisionEnabled = true;
  private fpsFrames = 0;
  private fpsElapsed = 0;
  private menuOrbit = 0;
  private entryReady = false;
  private suppressInteraction = false;
  private surfaceEntered = false;
  private poolDiscovered = false;
  private ruinsDiscovered = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.settings = this.saves.loadSettings();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.configureRenderer();
    this.input = new Input(canvas);
    this.ui = new UIManager(uiRoot, this.settings);
    this.interaction = new InteractionSystem(this.audio, (text) => this.ui.showPrompt(text));
    this.doors = new DoorSystem(this.collision, this.audio);
    this.player = new PlayerController(this.input, this.collision, this.audio, this.settings);
    this.scene.add(this.player.rig);

    this.scene.background = new THREE.Color(0x010307);
    this.scene.add(new THREE.AmbientLight(0x8bb6c5, 0.72));
    this.buildInteriorLighting();

    this.interior = new ShipInterior(this.interaction, this.collision, this.audio, this.ambient, this.doors, {
      toast: (message) => this.ui.toast(message),
      onSitPilot: () => this.sitInPilotSeat(),
      onCycleTarget: () => this.cycleTarget(),
      onThrottleUnlocked: () => this.flight.armThrust(),
      onWarpCover: (open) => { if (open) this.audio.confirm(); },
      onWarpLever: () => this.startWarp(),
      onEntryRequested: () => this.startEntry(),
      onRampRequested: () => this.requestRamp(),
      onSuitChanged: (active) => { this.suitActive = active; },
      canWarp: () => this.canWarp(),
      canEnterAtmosphere: () => this.canEnterAtmosphere(),
      canOpenRamp: () => this.landed,
    });
    this.exterior = new ShipExterior(this.ambient);
    this.scene.add(this.interior.root, this.exterior.root);
    this.space = new SpaceEnvironment(this.scene, this.settings.quality);
    this.surface = new PlanetSurface(this.scene, this.collision, this.ambient, this.settings.quality);
    this.flight = new FlightSystem(this.scene, this.player.camera, this.input, this.settings, this.space, this.interior, this.exterior, this.audio, (message) => this.ui.toast(message));
    this.warp = new WarpSystem(this.scene, this.audio, this.flight, this.settings);
    this.entry = new EntryLandingSystem(this.scene, this.flight, this.exterior, this.audio, this.settings);
    this.setupCinematicCallbacks();

    this.renderPass = new RenderPass(this.scene, this.menuCamera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), this.settings.quality === 'high' ? 0.62 : 0.38, 0.52, 0.82);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.ui.setActions(this.createUIActions());
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.canvas.addEventListener('click', () => {
      if (this.mode !== 'MENU' && this.mode !== 'PAUSED' && !this.input.pointerLocked) this.input.requestPointerLock();
    });
    this.onResize();
  }

  boot(): void {
    this.mode = 'MENU';
    this.space.setVisible(true);
    this.surface.setVisible(false);
    this.menuCamera.position.set(112, 48, 132);
    this.menuCamera.lookAt(0, 0.6, 6);
    this.ui.showMain(this.saves.hasSave());
    this.ui.fade(true, true);
    this.running = true;
    requestAnimationFrame(this.animate);
    requestAnimationFrame(() => {
      this.ui.fade(false);
    });
  }

  private configureRenderer(): void {
    const ratio = this.settings.quality === 'high' ? 1.65 : this.settings.quality === 'medium' ? 1.25 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, ratio));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = this.settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  private buildInteriorLighting(): void {
    for (let z = -56; z <= 68; z += 16) {
      const light = new THREE.PointLight(z > 35 ? 0xffb36d : z > -4 && z < 17 ? 0xffd6a3 : 0x8eeaff, 5.8, 23, 1.55);
      light.position.set(0, 2.75, z);
      this.scene.add(light);
    }
    for (const x of [-9.5, 9.5]) {
      for (let z = -40; z <= 56; z += 24) {
        const light = new THREE.PointLight(z > 17 ? 0xffa557 : 0x88dfff, 3.8, 15, 1.7);
        light.position.set(x, 2.65, z);
        this.scene.add(light);
      }
    }
  }

  private createUIActions(): UIActions {
    return {
      uiHover: () => this.audio.hover(),
      uiClick: () => this.audio.click(),
      startNew: () => void this.startNewGame(),
      continueGame: () => void this.continueGame(),
      resume: () => this.resume(),
      save: () => this.saveGame(),
      openSettings: () => this.pause(),
      closeSettings: () => {
        this.ui.closeModal();
        if (this.mode !== 'MENU' && this.mode !== 'PAUSED') this.input.requestPointerLock();
      },
      controlsClosed: (firstRun) => {
        if (firstRun) this.saves.markControlsSeen();
        if (this.mode !== 'MENU' && this.mode !== 'PAUSED') {
          this.player.enabled = !this.seated;
          this.ui.setReticle(true);
          this.input.requestPointerLock();
        }
      },
      returnToMenu: () => this.returnToMenu(),
      applySettings: (settings) => this.applySettings(settings),
      requestFullscreen: () => {
        if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
        else void document.exitFullscreen();
      },
      debugCommand: (command) => this.debugCommand(command),
    };
  }

  private async startNewGame(): Promise<void> {
    await this.audio.start();
    this.audio.setVolume(this.settings.volume);
    this.saves.clear();
    this.resetWorld();
    this.mode = 'EXPLORING';
    this.player.teleport(0, 0, 45.5, 0);
    this.player.enabled = false;
    this.ui.hideMain();
    this.ui.fade(true);
    window.setTimeout(() => {
      this.ui.fade(false);
      if (!this.saves.controlsSeen()) this.ui.showControls(true);
      else {
        this.player.enabled = true;
        this.ui.setReticle(true);
        this.input.requestPointerLock();
      }
      this.ui.toast('ASTRAEA ONLINE // REACH THE BRIDGE AND TRACE THE SIGNAL', 4.5);
    }, 720);
  }

  private async continueGame(): Promise<void> {
    const snapshot = this.saves.load();
    if (!snapshot) return;
    await this.audio.start();
    this.resetWorld();
    this.targetIndex = snapshot.selectedTarget;
    if (this.targetIndex >= 0) {
      this.flight.setTarget(this.targetIndex);
      this.targetLocked = true;
    }
    this.flight.thrustArmed = snapshot.throttleUnlocked;
    this.interior.throttleUnlocked = snapshot.throttleUnlocked;
    this.interior.warpCoverOpen = snapshot.warpCoverOpen;
    this.suitActive = snapshot.suitActive;
    this.landed = snapshot.landed || snapshot.shipPhase === 'landed';
    if (snapshot.shipPosition) this.flight.shipPosition.fromArray(snapshot.shipPosition);
    if (snapshot.shipOrientation) this.flight.shipOrientation.fromArray(snapshot.shipOrientation);
    if (snapshot.shipPhase === 'warp' && this.targetIndex >= 0) this.flight.arriveAtSelectedTarget();
    else this.space.setObserver(this.flight.shipPosition, this.flight.shipOrientation);
    if (snapshot.shipPhase === 'orbit' || snapshot.shipPhase === 'warp') {
      this.entryReady = Boolean(this.space.targets[this.targetIndex]?.isDestination);
      this.flight.setWarpStatus('ORBITAL HOLD');
    }
    this.interior.setRamp(snapshot.rampOpen);
    this.mode = this.landed ? 'LANDED' : 'EXPLORING';
    this.surface.setVisible(this.landed);
    this.space.setVisible(!this.landed);
    this.exterior.setGear(this.landed);
    this.player.setSurface(this.landed);
    this.player.teleport(...snapshot.playerPosition, snapshot.playerYaw);
    this.player.pitch = snapshot.playerPitch;
    this.player.enabled = true;
    this.ui.hideMain();
    this.ui.fade(true);
    window.setTimeout(() => {
      this.ui.fade(false);
      this.ui.setReticle(true);
      this.input.requestPointerLock();
      this.ui.toast(`CHECKPOINT RESTORED // ${new Date(snapshot.savedAt).toLocaleString()}`);
    }, 520);
  }

  private resetWorld(): void {
    this.flight?.reset();
    this.entry?.reset();
    this.landed = false;
    this.seated = false;
    this.suitActive = false;
    this.targetIndex = -1;
    this.targetLocked = false;
    this.entryReady = false;
    this.surfaceEntered = false;
    this.poolDiscovered = false;
    this.ruinsDiscovered = false;
    this.cameraTransition = null;
    this.player.rig.add(this.player.camera);
    this.player.camera.position.set(0, 1.68, 0);
    this.player.camera.rotation.set(0, 0, 0);
    this.player.setSurface(false);
    this.interior.setRamp(false);
    this.interior.throttleUnlocked = false;
    this.interior.warpCoverOpen = false;
    this.exterior.setGear(false);
    this.space.setVisible(true);
    this.surface.setVisible(false);
    this.audio.setEnvironment('ship');
  }

  private sitInPilotSeat(): void {
    if (this.seated || this.cameraTransition) return;
    this.seated = true;
    this.player.enabled = false;
    this.interaction.clear();
    this.scene.attach(this.player.camera);
    const targetPosition = this.interior.pilotView.getWorldPosition(new THREE.Vector3());
    const targetQuaternion = this.interior.pilotView.getWorldQuaternion(new THREE.Quaternion());
    this.cameraTransition = {
      kind: 'sit', elapsed: 0, duration: 1.15,
      fromPosition: this.player.camera.position.clone(), toPosition: targetPosition,
      fromQuaternion: this.player.camera.quaternion.clone(), toQuaternion: targetQuaternion,
    };
    this.mode = this.landed ? 'LANDED' : 'PILOTING';
    this.ui.toast('PILOT RESTRAINTS ENGAGED // PHYSICAL INTERLOCKS ACTIVE');
  }

  private standFromPilotSeat(): void {
    if (!this.seated || this.cameraTransition) return;
    this.flight.setActive(false);
    this.interaction.clear();
    this.cameraTransition = {
      kind: 'stand', elapsed: 0, duration: 0.9,
      fromPosition: this.player.camera.getWorldPosition(new THREE.Vector3()),
      toPosition: new THREE.Vector3(-1.65, 1.68, -54.7),
      fromQuaternion: this.player.camera.getWorldQuaternion(new THREE.Quaternion()),
      toQuaternion: new THREE.Quaternion(),
    };
  }

  private updateCameraTransition(delta: number): void {
    if (!this.cameraTransition) return;
    const transition = this.cameraTransition;
    transition.elapsed += delta;
    const progress = Math.min(1, transition.elapsed / transition.duration);
    const eased = easeInOutCubic(progress);
    this.player.camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
    this.player.camera.quaternion.slerpQuaternions(transition.fromQuaternion, transition.toQuaternion, eased);
    this.player.camera.fov = THREE.MathUtils.lerp(68, transition.kind === 'sit' ? 62 : 68, Math.sin(progress * Math.PI));
    this.player.camera.updateProjectionMatrix();
    if (progress < 1) return;

    if (transition.kind === 'sit') {
      this.flight.setActive(!this.landed);
      this.audio.setEnvironment(this.landed ? 'jungle' : 'space');
    } else {
      this.seated = false;
      this.player.teleport(-1.65, 0, -54.7, 0);
      this.player.rig.add(this.player.camera);
      this.player.camera.position.set(0, 1.68, 0);
      this.player.camera.quaternion.identity();
      this.player.enabled = true;
      this.mode = this.landed ? 'LANDED' : 'EXPLORING';
      this.audio.setEnvironment(this.landed ? 'jungle' : 'ship');
      this.ui.toast('PILOT RESTRAINTS RELEASED');
    }
    this.cameraTransition = null;
  }

  private cycleTarget(): void {
    if (this.warp.phase !== 'idle' || this.entry.phase !== 'idle') return;
    this.targetIndex = (this.targetIndex + 1) % this.space.targets.length;
    this.flight.setTarget(this.targetIndex);
    this.targetLocked = true;
    const target = this.space.targets[this.targetIndex];
    this.ui.toast(`NAV LOCK // ${target.name} // ${target.subtitle}`);
  }

  private canWarp(): boolean {
    const atEngineRoomControl = Math.hypot(this.player.position.x + 9.25, this.player.position.z - 56) < 7;
    if ((!this.seated && !atEngineRoomControl) || !this.targetLocked || this.warp.phase !== 'idle') return false;
    const target = this.space.targets[this.targetIndex];
    return Boolean(target && this.flight.fuel >= target.fuelCost && !this.landed && this.entry.phase === 'idle');
  }

  private startWarp(): void {
    if (!this.canWarp()) {
      this.audio.deny();
      this.ui.toast('WARP INHIBITED // TARGET, FUEL, OR FLIGHT STATE INVALID');
      return;
    }
    this.mode = 'WARP_CHARGE';
    this.suppressInteraction = true;
    this.flight.fuel = Math.max(0, this.flight.fuel - this.space.targets[this.targetIndex].fuelCost);
    this.warp.start();
  }

  private canEnterAtmosphere(): boolean {
    return this.seated && this.entryReady && Boolean(this.space.targets[this.targetIndex]?.isDestination) && this.entry.phase === 'idle';
  }

  private startEntry(): void {
    if (!this.canEnterAtmosphere()) {
      this.audio.deny();
      this.ui.toast('ENTRY VECTOR INVALID // NEMORA IV ORBIT REQUIRED');
      return;
    }
    this.mode = 'ENTRY';
    this.suppressInteraction = true;
    this.flight.cameraMode = 'chase';
    this.entry.start();
  }

  private requestRamp(): void {
    if (!this.landed) {
      this.audio.deny();
      this.ui.toast('OUTER HATCH INHIBITED // SHIP NOT LANDED');
      return;
    }
    this.audio.confirm();
    this.ui.toast(this.interior.rampOpen ? 'AIRLOCK REPRESSURIZING // RAMP RAISING' : 'AIRLOCK CYCLING // RAMP LOWERING', 4);
  }

  private setupCinematicCallbacks(): void {
    this.warp.onPhase = (phase: WarpPhase, progress: number) => {
      if (phase === 'charge') this.ui.cinematic('WARP CORE SPIN-UP', `ENERGY BUILDUP ${Math.floor(progress * 100)}% // STABILITY NOMINAL`, progress);
      if (phase === 'tunnel') this.ui.cinematic('SUPERLUMINAL TRANSIT', `VECTOR LOCKED // ${this.space.selectedTarget.name}`, progress);
      if (phase === 'exit') this.ui.cinematic('WARP EXIT', 'DECELERATING TO ORBITAL VELOCITY', progress);
    };
    this.warp.onComplete = () => {
      this.mode = 'ORBIT';
      this.entryReady = true;
      this.suppressInteraction = false;
      this.flight.cameraMode = 'cockpit';
      this.ui.cinematic(null);
      this.ui.toast(`ARRIVAL COMPLETE // STABLE ORBIT AT ${this.space.selectedTarget.name}`, 5);
      this.saveGame(false);
    };
    this.entry.onPhase = (phase: EntryPhase, progress: number) => {
      if (phase === 'plasma') this.ui.cinematic('ATMOSPHERIC INTERFACE', `HULL PLASMA // ALT ${Math.round(this.flight.altitude / 1000)} km`, progress);
      if (phase === 'clouds') this.ui.cinematic('CLOUD CANOPY', 'VISUAL RANGE LIMITED // AUTOPILOT HOLDING', progress);
      if (phase === 'gear-hold') this.ui.cinematic('LANDING GEAR REQUIRED', 'PRESS G TO DEPLOY // DESCENT PAUSED', this.flight.gearDeployed ? progress : 0);
      if (phase === 'landing') this.ui.cinematic('FINAL DESCENT', `THRUSTER VECTORING // ALT ${Math.round(this.flight.altitude)} m`, progress);
    };
    this.entry.onComplete = () => {
      this.ui.fade(true);
      this.landed = true;
      this.mode = 'LANDED';
      this.suppressInteraction = false;
      this.flight.setActive(false);
      this.space.setVisible(false);
      this.surface.setVisible(true);
      this.player.setSurface(true);
      this.audio.setEnvironment('jungle');
      this.ui.cinematic(null);
      window.setTimeout(() => this.ui.fade(false), 620);
      this.ui.toast('TOUCHDOWN // NEMORA IV // EXIT THROUGH AFT AIRLOCK', 5.5);
      this.saveGame(false);
    };
  }

  private pause(): void {
    if (this.mode === 'MENU' || this.mode === 'PAUSED') return;
    this.previousMode = this.mode;
    this.mode = 'PAUSED';
    this.player.enabled = false;
    this.input.releasePointerLock();
    this.ui.showPause();
    this.interaction.clear();
  }

  private resume(): void {
    if (this.mode !== 'PAUSED') return;
    this.mode = this.previousMode;
    this.player.enabled = !this.seated;
    this.ui.hidePause();
    this.ui.setReticle(true);
    this.input.requestPointerLock();
  }

  private returnToMenu(): void {
    this.saveGame(false);
    this.mode = 'MENU';
    this.seated = false;
    this.player.enabled = false;
    this.flight.setActive(false);
    this.input.releasePointerLock();
    this.surface.setVisible(false);
    this.space.setVisible(true);
    this.ui.hidePause();
    this.ui.showMain(this.saves.hasSave());
    this.audio.setEnvironment('space');
  }

  private saveGame(showToast = true): void {
    if (this.mode === 'MENU') return;
    const snapshot: GameSnapshot = {
      version: 1,
      mode: this.mode,
      playerPosition: this.player.position.toArray() as [number, number, number],
      playerYaw: this.player.yaw,
      playerPitch: this.player.pitch,
      shipPosition: this.flight.shipPosition.toArray() as [number, number, number],
      shipOrientation: this.flight.shipOrientation.toArray() as [number, number, number, number],
      shipPhase: this.landed ? 'landed' : this.warp.phase !== 'idle' ? 'warp' : this.entryReady ? 'orbit' : 'space',
      selectedTarget: this.targetIndex,
      throttleUnlocked: this.flight.thrustArmed,
      warpCoverOpen: this.interior.warpCoverOpen,
      landed: this.landed,
      rampOpen: this.interior.rampOpen,
      suitActive: this.suitActive,
      windowStates: Object.fromEntries(Object.entries(this.interior.props.toggles).filter(([key]) => key.startsWith('window:'))),
      toggles: { ...this.interior.props.toggles },
      savedAt: Date.now(),
    };
    this.saves.save(snapshot);
    if (showToast) this.ui.toast('CHECKPOINT WRITTEN // LOCAL STORAGE VERIFIED');
  }

  private applySettings(settings: GameSettings): void {
    const qualityChanged = settings.quality !== this.settings.quality;
    this.settings = { ...settings };
    this.saves.saveSettings(this.settings);
    this.audio.setVolume(settings.volume);
    this.player.setSettings(settings);
    this.flight.setSettings(settings);
    this.warp.setSettings(settings);
    this.entry.setSettings(settings);
    this.configureRenderer();
    this.bloom.strength = settings.quality === 'high' ? 0.62 : 0.38;
    if (qualityChanged) this.ui.toast('QUALITY PROFILE APPLIED // DENSITY UPDATES NEXT MISSION');
  }

  private debugCommand(command: string): void {
    if (command === 'noclip') {
      this.player.noclip = !this.player.noclip;
      this.ui.toast(`NOCLIP // ${this.player.noclip ? 'ON' : 'OFF'}`);
    } else if (command === 'collision') {
      this.collisionEnabled = !this.collisionEnabled;
      this.player.noclip = !this.collisionEnabled;
      this.ui.toast(`COLLISION // ${this.collisionEnabled ? 'ON' : 'OFF'}`);
    } else if (command === 'wireframe') {
      let enabled = false;
      this.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if ('wireframe' in material) {
            enabled = !(material as THREE.MeshStandardMaterial).wireframe;
            (material as THREE.MeshStandardMaterial).wireframe = enabled;
          }
        });
      });
      this.ui.toast(`WIREFRAME // ${enabled ? 'ON' : 'OFF'}`);
    } else if (command === 'cockpit') {
      this.debugTeleport(-1.5, 0, -54, 0);
    } else if (command === 'cargo') {
      this.debugTeleport(0, 0, 68, 0);
    } else if (command === 'surface') {
      this.forceLanded();
      this.debugTeleport(0, -4.2, 90, 0);
    } else if (command === 'warp') {
      this.flight.arriveAtSelectedTarget();
      this.entryReady = true;
      this.mode = 'ORBIT';
      this.ui.cinematic(null);
      this.ui.toast('DEBUG // WARP SEQUENCE SKIPPED');
    } else if (command === 'landing') {
      this.forceLanded();
      this.ui.toast('DEBUG // LANDING SEQUENCE SKIPPED');
    }
  }

  private debugTeleport(x: number, y: number, z: number, yaw: number): void {
    if (this.seated) this.standFromPilotSeat();
    this.player.teleport(x, y, z, yaw);
    this.mode = this.landed ? 'LANDED' : 'EXPLORING';
    this.player.enabled = true;
  }

  private forceLanded(): void {
    this.landed = true;
    this.seated = false;
    this.mode = 'LANDED';
    this.flight.setActive(false);
    this.exterior.setGear(true);
    this.space.setVisible(false);
    this.surface.setVisible(true);
    this.player.setSurface(true);
    this.interior.setRamp(true);
    this.audio.setEnvironment('jungle');
  }

  private onPointerLockChange = (): void => {
    if (document.pointerLockElement || !this.running || this.debugOpen) return;
    if (this.mode !== 'MENU' && this.mode !== 'PAUSED' && !this.cameraTransition) this.pause();
  };

  private onResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.player.setAspect(aspect);
    this.flight?.setAspect(aspect);
    this.menuCamera.aspect = aspect;
    this.menuCamera.updateProjectionMatrix();
  };

  private animate = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;
    this.update(delta);
    this.render();
    this.input.endFrame();
  };

  private update(delta: number): void {
    this.ui.update(delta);
    this.audio.update(delta);
    if (this.landed) this.audio.setSurfaceListener(this.player.position.x, this.player.position.z);
    this.ambient.update(delta, this.elapsed);
    this.interior.update(delta);
    this.exterior.update(delta);
    this.space.update(delta);
    this.surface.update(delta);
    this.entry.updateDust(delta);
    this.fpsFrames += 1;
    this.fpsElapsed += delta;
    if (this.fpsElapsed >= 0.5) {
      this.ui.setFPS(this.fpsFrames / this.fpsElapsed);
      this.fpsFrames = 0;
      this.fpsElapsed = 0;
    }

    if (this.mode === 'MENU') {
      this.menuOrbit += delta * 0.055;
      this.menuCamera.position.set(Math.cos(this.menuOrbit) * 132, 48 + Math.sin(this.menuOrbit * 0.7) * 8, 8 + Math.sin(this.menuOrbit) * 150);
      this.menuCamera.lookAt(0, 0.7, 7);
      this.space.setObserver(new THREE.Vector3(), new THREE.Quaternion());
      return;
    }
    if (this.mode === 'PAUSED') return;

    if (this.input.consume('Escape')) {
      this.pause();
      return;
    }
    if (this.input.consume('Backquote')) {
      this.debugOpen = this.ui.toggleDebug();
      if (this.debugOpen) this.input.releasePointerLock();
      else this.input.requestPointerLock();
    }
    if (this.input.consume('Tab')) this.ui.toast(this.landed ? 'MISSION // LOCATE THE RESONANT RUINS BEYOND THE GLOWING POOL' : 'MISSION // SELECT NEMORA IV AND INITIATE WARP');

    this.updateCameraTransition(delta);
    if (this.cameraTransition) return;

    if (!this.seated) {
      this.player.update(delta);
      if (this.landed) this.updateSurfaceMission();
      this.doors.update(delta, this.player.position);
      if (!this.suppressInteraction && this.input.pointerLocked) {
        this.interaction.update(this.player.camera);
        if (this.input.consume('KeyE')) this.interaction.interact();
      }
    } else {
      const flightInput = this.mode === 'PILOTING' || this.mode === 'ORBIT' || this.mode === 'ENTRY';
      const cinematicIdle = this.warp.phase === 'idle' && (this.entry.phase === 'idle' || this.entry.phase === 'complete');
      if (this.flight.active && cinematicIdle) this.flight.update(delta, flightInput);
      this.doors.update(delta, new THREE.Vector3(-1.65, 0, -56.5));
      if (!this.suppressInteraction && this.flight.cameraMode === 'cockpit' && this.input.pointerLocked) {
        this.interaction.update(this.player.camera);
        if (this.input.consume('KeyE')) {
          const used = this.interaction.interact();
          if (!used) this.standFromPilotSeat();
        }
      } else this.interaction.clear();
      if (this.input.consume('KeyE') && !this.suppressInteraction && this.flight.cameraMode !== 'cockpit') this.standFromPilotSeat();
    }

    if (this.warp.phase !== 'idle') {
      this.flight.update(delta, false);
      this.warp.update(delta);
    }
    if (this.entry.phase !== 'idle' && this.entry.phase !== 'complete') {
      this.flight.update(delta, this.entry.phase === 'gear-hold');
      this.entry.update(delta);
    }
  }

  private updateSurfaceMission(): void {
    const { x, z } = this.player.position;
    if (!this.surfaceEntered && z > 87) {
      this.surfaceEntered = true;
      this.ui.toast(this.suitActive
        ? 'NEMORA IV SURFACE // SUIT FILTERS ACTIVE // FOLLOW THE BIOLUMINESCENT PATH'
        : 'NEMORA IV SURFACE // BREATHABLE ATMOSPHERE // FOLLOW THE BIOLUMINESCENT PATH', 5);
      this.saveGame(false);
    }
    if (!this.poolDiscovered && Math.hypot(x - 22, z - 161) < 19) {
      this.poolDiscovered = true;
      this.ui.toast('LANDMARK LOGGED // RESONANT POOL AND CASCADE // SIGNAL STRENGTH RISING', 5);
    }
    if (!this.ruinsDiscovered && Math.hypot(x + 28, z - 137) < 13) {
      this.ruinsDiscovered = true;
      this.ui.toast('MISSION COMPLETE // VERDANT SIGNAL SOURCE CONFIRMED // ANCIENT RESONATOR ONLINE', 8);
      this.audio.confirm();
      this.saveGame(false);
    }
  }

  private render(): void {
    const camera = this.activeCamera;
    this.renderPass.camera = camera;
    this.composer.render();
  }

  private get activeCamera(): THREE.Camera {
    if (this.mode === 'MENU') return this.menuCamera;
    if (this.seated && this.flight.active) return this.flight.activeCamera;
    return this.player.camera;
  }
}
