import type { GameSettings, Quality } from '../types';

export interface UIActions {
  uiHover(): void;
  uiClick(): void;
  startNew(): void;
  continueGame(): void;
  resume(): void;
  save(): void;
  openSettings(): void;
  closeSettings(): void;
  controlsClosed(firstRun: boolean): void;
  returnToMenu(): void;
  applySettings(settings: GameSettings): void;
  requestFullscreen(): void;
  debugCommand(command: string): void;
}

export class UIManager {
  private root: HTMLElement;
  private actions?: UIActions;
  private promptElement!: HTMLElement;
  private reticle!: HTMLElement;
  private toastElement!: HTMLElement;
  private toastTimer = 0;
  private cinematicElement!: HTMLElement;
  private cinematicTitle!: HTMLElement;
  private cinematicSub!: HTMLElement;
  private cinematicBar!: HTMLElement;
  private fadeElement!: HTMLElement;
  private debugElement!: HTMLElement;
  private fpsElement!: HTMLElement;
  private firstRunControls = false;
  private settings: GameSettings;

  constructor(root: HTMLElement, settings: GameSettings) {
    this.root = root;
    this.settings = { ...settings };
    this.render();
    this.bind();
  }

  setActions(actions: UIActions): void {
    this.actions = actions;
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="vignette" aria-hidden="true"></div>
      <div id="main-menu" class="screen active">
        <div class="menu-telemetry" aria-hidden="true">
          <span>CSV ASTRAEA</span><span>EXPLORATION COMMAND</span><span>ASTRA OS 7.4.1</span>
        </div>
        <section class="command-slate main-slate" aria-labelledby="game-title">
          <div class="slate-eyebrow"><i></i> DEEP RANGE MISSION // EX-07</div>
          <h1 id="game-title"><span>AEON</span> DRIFT</h1>
          <p class="subtitle">THE VERDANT SIGNAL</p>
          <div class="signal-line"><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b></div>
          <p class="mission-copy">A signal older than recorded civilization is repeating from the surface of Nemora IV. Bring the <em>ASTRAEA</em> down intact. Find its source.</p>
          <nav class="menu-actions" aria-label="Main menu">
            <button data-action="start" class="terminal-button primary"><span>01</span> BEGIN MISSION <i>NEW</i></button>
            <button data-action="continue" id="continue-button" class="terminal-button"><span>02</span> RESUME CHECKPOINT <i>LOCAL</i></button>
            <button data-panel="settings" class="terminal-button"><span>03</span> SYSTEM SETTINGS <i>CFG</i></button>
            <button data-panel="controls" class="terminal-button"><span>04</span> CONTROL SCHEMATIC <i>REF</i></button>
            <button data-panel="credits" class="terminal-button"><span>05</span> MISSION CREDITS <i>LOG</i></button>
            <button data-action="quit" class="terminal-button quiet"><span>06</span> QUIT <i>ESC</i></button>
          </nav>
          <div class="slate-footer"><span>SIGNAL LOCK <strong>99.82%</strong></span><span>2194.08.17 // 04:12</span></div>
        </section>
        <aside class="menu-orbit" aria-hidden="true"><div class="orbit-ring r1"></div><div class="orbit-ring r2"></div><div class="orbit-ring r3"></div><div class="orbit-core"></div><span>NEMORA IV</span></aside>
      </div>

      <div id="modal-backdrop" class="modal-backdrop hidden">
        <section id="settings-panel" class="command-slate modal hidden" aria-labelledby="settings-title">
          <div class="slate-eyebrow"><i></i> ASTRA OS // LOCAL CONFIG</div>
          <h2 id="settings-title">SYSTEM SETTINGS</h2>
          <div class="settings-grid">
            <label><span>RENDER QUALITY</span><select id="quality-setting"><option value="low">LOW / PERFORMANCE</option><option value="medium">MEDIUM / BALANCED</option><option value="high">HIGH / CINEMATIC</option></select></label>
            <label><span>LOOK SENSITIVITY <output id="sensitivity-value"></output></span><input id="sensitivity-setting" type="range" min="0.2" max="1.5" step="0.05" /></label>
            <label><span>MASTER VOLUME <output id="volume-value"></output></span><input id="volume-setting" type="range" min="0" max="1" step="0.02" /></label>
            <label><span>CAMERA MOTION <output id="motion-value"></output></span><input id="motion-setting" type="range" min="0" max="1" step="0.05" /></label>
          </div>
          <div class="modal-actions"><button data-action="fullscreen" class="terminal-button">TOGGLE FULLSCREEN</button><button data-panel="controls" class="terminal-button">VIEW CONTROLS</button><button data-action="apply-settings" class="terminal-button primary">APPLY / RETURN</button></div>
        </section>

        <section id="controls-panel" class="command-slate modal controls hidden" aria-labelledby="controls-title">
          <div class="slate-eyebrow"><i></i> CREW INDUCTION // DISPLAYED ONCE</div>
          <h2 id="controls-title">CONTROL SCHEMATIC</h2>
          <div class="control-columns">
            <div><h3>ON FOOT</h3><dl><dt>W A S D</dt><dd>MOVE</dd><dt>MOUSE</dt><dd>LOOK</dd><dt>E</dt><dd>INTERACT / SIT / STAND</dd><dt>SHIFT</dt><dd>SPRINT</dd><dt>SPACE</dt><dd>JUMP</dd><dt>C / CTRL</dt><dd>CROUCH</dd><dt>F</dt><dd>HELMET LIGHT</dd></dl></div>
            <div><h3>FLIGHT DECK</h3><dl><dt>W / S</dt><dd>THROTTLE / REVERSE</dd><dt>MOUSE</dt><dd>PITCH / YAW</dd><dt>Q / E</dt><dd>ROLL</dd><dt>SHIFT</dt><dd>BOOST</dd><dt>X</dt><dd>DAMPENERS</dd><dt>C</dt><dd>CAMERA MODE</dd><dt>G</dt><dd>LANDING GEAR</dd></dl></div>
            <div><h3>SHIP SYSTEMS</h3><dl><dt>E</dt><dd>USE GAZED CONTROL</dd><dt>ESC</dt><dd>PAUSE / SETTINGS</dd><dt>TAB</dt><dd>MISSION SLATE</dd><dt>BACKTICK</dt><dd>DEV DIAGNOSTICS</dd></dl><p>Flight begins only after opening the throttle safety lid and arming primary thrust. Warp requires a selected target, open red cover, and physical lever pull.</p></div>
          </div>
          <div class="modal-actions"><button data-action="close-controls" class="terminal-button primary">ACKNOWLEDGE</button></div>
        </section>

        <section id="credits-panel" class="command-slate modal credits hidden" aria-labelledby="credits-title">
          <div class="slate-eyebrow"><i></i> EX-07 // MANIFEST</div><h2 id="credits-title">MISSION CREDITS</h2>
          <div class="credits-copy"><h3>AEON DRIFT: THE VERDANT SIGNAL</h3><p>Original browser game created for the Space Exploration Game specification.</p><p><strong>ENGINE</strong><br>TypeScript · Three.js · WebGL · Web Audio API</p><p><strong>ASSET MANIFEST</strong><br>Every model, material, texture, star field, planet, sound, jungle plant, ruin, ship prop, particle and interface graphic is generated procedurally at runtime. No downloaded media assets are used.</p><p>Three.js is provided under the MIT License. Full attribution is available in <code>ASSET_CREDITS.md</code>.</p></div>
          <div class="modal-actions"><button data-action="close-modal" class="terminal-button primary">RETURN</button></div>
        </section>

        <section id="quit-panel" class="command-slate modal compact hidden"><div class="slate-eyebrow warning"><i></i> SESSION TERMINATED</div><h2>SAFE TO DISCONNECT</h2><p>Your browser does not allow this page to close its own tab. Progress remains in local checkpoint storage.</p><div class="modal-actions"><button data-action="close-modal" class="terminal-button primary">RETURN</button></div></section>
      </div>

      <section id="pause-menu" class="screen pause-screen hidden">
        <div class="command-slate pause-slate"><div class="slate-eyebrow"><i></i> SIMULATION SUSPENDED</div><h2>MISSION PAUSED</h2><div class="menu-actions"><button data-action="resume" class="terminal-button primary">RESUME</button><button data-action="save" class="terminal-button">SAVE CHECKPOINT</button><button data-panel="settings" class="terminal-button">SETTINGS / CONTROLS</button><button data-action="menu" class="terminal-button quiet">RETURN TO COMMAND</button></div></div>
      </section>

      <div id="interaction-prompt" class="interaction-prompt hidden"><i></i><span></span></div>
      <div id="optical-reticle" class="optical-reticle hidden"><i></i><b></b></div>
      <div id="toast" class="toast hidden"><small>ASTRA // EVENT</small><span></span></div>
      <div id="cinematic-status" class="cinematic-status hidden"><div><small>ASTRA FLIGHT COMPUTER</small><strong></strong><span></span><i><b></b></i></div></div>
      <div id="fade" class="fade-layer active"></div>
      <div id="debug-panel" class="debug-panel hidden"><header>DEVELOPMENT DIAGNOSTICS <span id="fps-counter">-- FPS</span></header><div class="debug-grid"><button data-debug="noclip">NOCLIP</button><button data-debug="collision">COLLISION</button><button data-debug="wireframe">WIREFRAME</button><button data-debug="warp">SKIP WARP</button><button data-debug="landing">SKIP LANDING</button><button data-debug="cockpit">GO COCKPIT</button><button data-debug="cargo">GO CARGO</button><button data-debug="surface">GO SURFACE</button></div></div>
    `;
    this.promptElement = this.root.querySelector('#interaction-prompt')!;
    this.reticle = this.root.querySelector('#optical-reticle')!;
    this.toastElement = this.root.querySelector('#toast')!;
    this.cinematicElement = this.root.querySelector('#cinematic-status')!;
    this.cinematicTitle = this.cinematicElement.querySelector('strong')!;
    this.cinematicSub = this.cinematicElement.querySelector('span')!;
    this.cinematicBar = this.cinematicElement.querySelector('b')!;
    this.fadeElement = this.root.querySelector('#fade')!;
    this.debugElement = this.root.querySelector('#debug-panel')!;
    this.fpsElement = this.root.querySelector('#fps-counter')!;
    this.populateSettings();
  }

  private bind(): void {
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      this.actions?.uiClick();
      const action = button.dataset.action;
      const panel = button.dataset.panel;
      const debug = button.dataset.debug;
      if (debug) this.actions?.debugCommand(debug);
      if (panel) this.showPanel(panel as 'settings' | 'controls' | 'credits');
      if (action === 'start') this.actions?.startNew();
      if (action === 'continue') this.actions?.continueGame();
      if (action === 'resume') this.actions?.resume();
      if (action === 'save') this.actions?.save();
      if (action === 'menu') this.actions?.returnToMenu();
      if (action === 'quit') this.showPanel('quit');
      if (action === 'close-modal') this.closeModal();
      if (action === 'close-controls') this.closeControls();
      if (action === 'apply-settings') this.applySettings();
      if (action === 'fullscreen') this.actions?.requestFullscreen();
    });
    let lastHover: HTMLButtonElement | null = null;
    this.root.addEventListener('pointerover', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (button && button !== lastHover) {
        lastHover = button;
        this.actions?.uiHover();
      }
    });
    this.root.addEventListener('pointerout', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (button === lastHover) lastHover = null;
    });
    for (const id of ['sensitivity-setting', 'volume-setting', 'motion-setting']) {
      this.root.querySelector(`#${id}`)?.addEventListener('input', () => this.updateOutputs());
    }
  }

  private populateSettings(): void {
    (this.root.querySelector('#quality-setting') as HTMLSelectElement).value = this.settings.quality;
    (this.root.querySelector('#sensitivity-setting') as HTMLInputElement).value = String(this.settings.sensitivity);
    (this.root.querySelector('#volume-setting') as HTMLInputElement).value = String(this.settings.volume);
    (this.root.querySelector('#motion-setting') as HTMLInputElement).value = String(this.settings.motion);
    this.updateOutputs();
  }

  private updateOutputs(): void {
    const sensitivity = Number((this.root.querySelector('#sensitivity-setting') as HTMLInputElement).value);
    const volume = Number((this.root.querySelector('#volume-setting') as HTMLInputElement).value);
    const motion = Number((this.root.querySelector('#motion-setting') as HTMLInputElement).value);
    (this.root.querySelector('#sensitivity-value') as HTMLOutputElement).value = sensitivity.toFixed(2);
    (this.root.querySelector('#volume-value') as HTMLOutputElement).value = `${Math.round(volume * 100)}%`;
    (this.root.querySelector('#motion-value') as HTMLOutputElement).value = `${Math.round(motion * 100)}%`;
  }

  private applySettings(): void {
    this.settings = {
      ...this.settings,
      quality: (this.root.querySelector('#quality-setting') as HTMLSelectElement).value as Quality,
      sensitivity: Number((this.root.querySelector('#sensitivity-setting') as HTMLInputElement).value),
      volume: Number((this.root.querySelector('#volume-setting') as HTMLInputElement).value),
      motion: Number((this.root.querySelector('#motion-setting') as HTMLInputElement).value),
    };
    this.actions?.applySettings({ ...this.settings });
    this.actions?.closeSettings();
  }

  showMain(hasSave: boolean): void {
    this.hideAllScreens();
    this.root.querySelector('#main-menu')?.classList.remove('hidden');
    this.root.querySelector('#main-menu')?.classList.add('active');
    (this.root.querySelector('#continue-button') as HTMLButtonElement).disabled = !hasSave;
    this.closeModal();
    this.setReticle(false);
  }

  hideMain(): void {
    this.root.querySelector('#main-menu')?.classList.add('hidden');
  }

  showPause(): void {
    this.root.querySelector('#pause-menu')?.classList.remove('hidden');
    this.setReticle(false);
  }

  hidePause(): void {
    this.root.querySelector('#pause-menu')?.classList.add('hidden');
  }

  showControls(firstRun = false): void {
    this.firstRunControls = firstRun;
    this.showPanel('controls');
  }

  private closeControls(): void {
    const firstRun = this.firstRunControls;
    this.firstRunControls = false;
    this.closeModal();
    this.actions?.controlsClosed(firstRun);
  }

  showPanel(panel: 'settings' | 'controls' | 'credits' | 'quit'): void {
    const backdrop = this.root.querySelector('#modal-backdrop')!;
    backdrop.classList.remove('hidden');
    for (const candidate of backdrop.querySelectorAll('section')) candidate.classList.add('hidden');
    this.root.querySelector(`#${panel}-panel`)?.classList.remove('hidden');
    this.setReticle(false);
  }

  closeModal(): void {
    this.root.querySelector('#modal-backdrop')?.classList.add('hidden');
  }

  showPrompt(text: string | null): void {
    const span = this.promptElement.querySelector('span')!;
    if (text) {
      span.textContent = text;
      this.promptElement.classList.remove('hidden');
      this.reticle.classList.add('active');
    } else {
      this.promptElement.classList.add('hidden');
      this.reticle.classList.remove('active');
    }
  }

  setReticle(visible: boolean): void {
    this.reticle.classList.toggle('hidden', !visible);
  }

  toast(message: string, duration = 3.2): void {
    this.toastElement.querySelector('span')!.textContent = message;
    this.toastElement.classList.remove('hidden');
    this.toastTimer = duration;
  }

  update(delta: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= delta;
      if (this.toastTimer <= 0) this.toastElement.classList.add('hidden');
    }
  }

  cinematic(title: string | null, subtitle = '', progress = 0): void {
    if (!title) {
      this.cinematicElement.classList.add('hidden');
      return;
    }
    this.cinematicTitle.textContent = title;
    this.cinematicSub.textContent = subtitle;
    this.cinematicBar.style.width = `${Math.round(progress * 100)}%`;
    this.cinematicElement.classList.remove('hidden');
  }

  fade(toBlack: boolean, immediate = false): void {
    if (immediate) this.fadeElement.style.transitionDuration = '0s';
    else this.fadeElement.style.transitionDuration = '';
    this.fadeElement.classList.toggle('active', toBlack);
  }

  toggleDebug(): boolean {
    this.debugElement.classList.toggle('hidden');
    return !this.debugElement.classList.contains('hidden');
  }

  setFPS(fps: number): void {
    this.fpsElement.textContent = `${Math.round(fps)} FPS`;
  }

  private hideAllScreens(): void {
    this.root.querySelector('#pause-menu')?.classList.add('hidden');
  }
}
