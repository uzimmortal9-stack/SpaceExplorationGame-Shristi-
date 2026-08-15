/**
 * Hud — DOM-based sci-fi interface. Menus, settings, controls (shown once),
 * cockpit flight telemetry, interaction prompts and cinematic overlays.
 */
import { audio } from "../core/audio";

export interface FlightData {
  speed: number;
  throttle: number;
  target: string;
  targetDist: number;
  warpReady: boolean;
  fuel: number;
  hull: number;
  mode: string;
  altitude: number;
  orbit: boolean;
  gear: boolean;
  warpPhase: string;
}

function el(tag: string, className: string, text = ""): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.textContent = text;
  return e;
}

export class Hud {
  private root: HTMLElement;
  private interaction = el("div", "hud-interaction", "");
  private crosshair = el("div", "hud-crosshair", "");
  private flightPanel = el("div", "hud-flight");
  private msg = el("div", "hud-msg", "");
  private obj = el("div", "hud-obj", "");
  private cloudOverlay = el("div", "hud-cloud");
  private shakeOverlay = el("div", "hud-shake");
  private vignette = el("div", "hud-vignette");
  private loading = el("div", "hud-loading");
  private menu: HTMLElement;
  private pause: HTMLElement;
  private settings: HTMLElement;
  private controls: HTMLElement;
  private endScreen: HTMLElement;
  private msgTimer = 0;

  private hudElems: { speed: HTMLElement; throttle: HTMLElement; target: HTMLElement; dist: HTMLElement; fuel: HTMLElement; hull: HTMLElement; mode: HTMLElement; alt: HTMLElement; warp: HTMLElement; gear: HTMLElement } = null as never;

  constructor() {
    this.root = document.getElementById("app")!;
    this.root.appendChild(this.crosshair);
    this.root.appendChild(this.interaction);
    this.root.appendChild(this.flightPanel);
    this.root.appendChild(this.msg);
    this.root.appendChild(this.obj);
    this.root.appendChild(this.cloudOverlay);
    this.root.appendChild(this.vignette);
    this.root.appendChild(this.shakeOverlay);
    this.root.appendChild(this.loading);

    this.menu = this.buildMenu();
    this.pause = this.buildPause();
    this.settings = this.buildSettings();
    this.controls = this.buildControls();
    this.endScreen = this.buildEndScreen();
    this.buildFlightPanel();
    this.setInteraction("");
    this.hideFlight();
  }

  // ---------- Menus ----------
  private buildMenu(): HTMLElement {
    const menu = el("div", "menu");
    const title = el("h1", "menu-title", "AURORA VOYAGER");
    const sub = el("div", "menu-sub", "SPACE EXPLORATION OPERATION");
    const btns = el("div", "menu-btns");
    const start = el("button", "menu-btn", "START MISSION");
    start.addEventListener("click", () => {
      audio.init();
      audio.click();
      this.hideMainMenu();
      this.onStart();
    });
    const settings = el("button", "menu-btn", "SETTINGS");
    settings.addEventListener("click", () => {
      audio.click();
      this.openSettings();
    });
    const controls = el("button", "menu-btn", "CONTROLS");
    controls.addEventListener("click", () => {
      audio.click();
      this.openControls();
    });
    const credits = el("button", "menu-btn", "CREDITS");
    credits.addEventListener("click", () => {
      audio.click();
      this.openCredits();
    });
    btns.append(start, settings, controls, credits);
    menu.append(title, sub, btns);
    this.root.appendChild(menu);
    return menu;
  }

  onStart: () => void = () => undefined;

  private buildPause(): HTMLElement {
    const p = el("div", "menu");
    const t = el("h2", "menu-sub", "PAUSED");
    const btns = el("div", "menu-btns");
    const resume = el("button", "menu-btn", "RESUME");
    resume.addEventListener("click", () => this.onResume());
    const settings = el("button", "menu-btn", "SETTINGS");
    settings.addEventListener("click", () => this.openSettings());
    const controls = el("button", "menu-btn", "CONTROLS");
    controls.addEventListener("click", () => this.openControls());
    btns.append(resume, settings, controls);
    p.append(t, btns);
    this.root.appendChild(p);
    return p;
  }
  onResume: () => void = () => undefined;

  private buildSettings(): HTMLElement {
    const s = el("div", "menu");
    const t = el("h2", "menu-sub", "SETTINGS");
    const rows = el("div", "settings");
    rows.appendChild(this.makeSlider("Mouse Sensitivity", 0.5, 0.1, 2, (v) => (this.sens = v)));
    rows.appendChild(this.makeSlider("Master Volume", 0.8, 0, 1, (v) => audio.setVolume(v)));
    rows.appendChild(this.makeSlider("Graphics Quality", 1, 0.5, 1.5, (v) => this.graphics = v));
    const full = el("div", "setting-row");
    const fl = el("span", "setting-label", "Fullscreen");
    const fb = el("button", "menu-btn small", "Toggle");
    fb.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      else document.documentElement.requestFullscreen().catch(() => undefined);
    });
    full.append(fl, fb);
    rows.appendChild(full);
    const back = el("button", "menu-btn", "BACK");
    back.addEventListener("click", () => {
      audio.click();
      this.closeSettings();
    });
    s.append(t, rows, back);
    this.root.appendChild(s);
    return s;
  }
  sens = 0.5;
  graphics = 1;
  private makeSlider(label: string, value: number, min: number, max: number, cb: (v: number) => void): HTMLElement {
    const row = el("div", "setting-row");
    const l = el("span", "setting-label", label);
    const range = document.createElement("input");
    range.type = "range";
    range.min = String(min);
    range.max = String(max);
    range.step = "0.05";
    range.value = String(value);
    const val = el("span", "setting-value", range.value);
    range.addEventListener("input", () => {
      val.textContent = range.value;
      cb(parseFloat(range.value));
    });
    row.append(l, range, val);
    return row;
  }

  private buildControls(): HTMLElement {
    const c = el("div", "menu");
    const t = el("h2", "menu-sub", "CONTROLS");
    const list = el("div", "controls-list");
    const rows: [string, string][] = [
      ["WASD", "Move"],
      ["Mouse", "Look"],
      ["Space", "Jump"],
      ["Shift", "Sprint"],
      ["Ctrl", "Crouch"],
      ["E / Click", "Interact"],
      ["F", "Sit / Stand"],
      ["Esc", "Pause"],
      ["—— Flight ——", ""],
      ["W / S", "Throttle / Reverse"],
      ["I / K / J / L", "Pitch / Yaw"],
      ["Q / E", "Roll"],
      ["C", "Camera mode"],
      ["Shift", "Boost"],
      ["T", "Cycle target"],
      ["—— Surface ——", ""],
      ["WASD", "Walk"],
      ["Space", "Jump"],
      ["Shift", "Sprint"],
    ];
    for (const [k, v] of rows) {
      const r = el("div", "control-row");
      const kk = el("span", "control-key", k);
      const vv = el("span", "control-val", v);
      r.append(kk, vv);
      list.appendChild(r);
    }
    const back = el("button", "menu-btn", "BACK");
    back.addEventListener("click", () => {
      audio.click();
      this.closeControls();
    });
    c.append(t, list, back);
    this.root.appendChild(c);
    return c;
  }

  private buildEndScreen(): HTMLElement {
    const e = el("div", "menu");
    const t = el("h1", "menu-title", "SIGNAL FOUND");
    const body = el("p", "menu-sub long", "The source of the signal is an ancient relay buried beneath the ruins, still humming with light from the bioluminescent pool. Your exploration of Lumis Prime is complete. The galaxy is open to you.");
    const back = el("button", "menu-btn", "EXPLORE CONTINUES");
    back.addEventListener("click", () => {
      audio.click();
      this.hideEndScreen();
    });
    e.append(t, body, back);
    this.root.appendChild(e);
    return e;
  }

  private buildFlightPanel(): void {
    this.flightPanel.innerHTML = "";
    const l = el("div", "flight-left");
    const r = el("div", "flight-right");
    const mk = (label: string): [HTMLElement, HTMLElement] => {
      const row = el("div", "hud-row");
      const k = el("span", "hud-k", label);
      const v = el("span", "hud-v", "—");
      row.append(k, v);
      return [row, v];
    };
    const speed = mk("SPD");
    const throttle = mk("THR");
    const target = mk("TGT");
    const dist = mk("DST");
    const fuel = mk("FUEL");
    const hull = mk("HULL");
    const mode = mk("CAM");
    const alt = mk("ALT");
    const warp = mk("WARP");
    const gear = mk("GEAR");
    l.append(...speed, ...throttle, ...fuel, ...hull);
    r.append(...mode, ...alt, ...warp, ...gear, ...target, ...dist);
    this.flightPanel.append(l, r);
    this.hudElems = {
      speed: speed[1],
      throttle: throttle[1],
      target: target[1],
      dist: dist[1],
      fuel: fuel[1],
      hull: hull[1],
      mode: mode[1],
      alt: alt[1],
      warp: warp[1],
      gear: gear[1],
    };
  }

  // ---------- Show / hide ----------
  showLoading(text: string): void {
    this.loading.textContent = text;
    this.loading.style.display = "flex";
  }
  hideLoading(): void {
    this.loading.style.display = "none";
  }
  showMainMenu(): void {
    this.menu.style.display = "flex";
  }
  hideMainMenu(): void {
    this.menu.style.display = "none";
  }
  showPause(): void {
    this.pause.style.display = "flex";
  }
  hidePause(): void {
    this.pause.style.display = "none";
  }
  private openSettings(): void {
    this.settings.style.display = "flex";
  }
  private closeSettings(): void {
    this.settings.style.display = "none";
  }
  openControls(): void {
    this.controls.style.display = "flex";
  }
  private closeControls(): void {
    this.controls.style.display = "none";
  }
  private openCredits(): void {
    this.showMessage("Credits: see ASSET_CREDITS.md in the repo.", 6);
  }
  showEndScreen(): void {
    this.endScreen.style.display = "flex";
  }
  hideEndScreen(): void {
    this.endScreen.style.display = "none";
  }
  get settingsVisible(): boolean {
    return this.settings.style.display === "flex";
  }
  get controlsVisible(): boolean {
    return this.controls.style.display === "flex";
  }

  setInteraction(label: string): void {
    if (label) {
      this.interaction.textContent = "[E] " + label;
      this.interaction.style.display = "block";
    } else {
      this.interaction.style.display = "none";
    }
  }

  showFlight(): void {
    this.flightPanel.style.display = "flex";
    this.crosshair.style.display = "block";
  }
  hideFlight(): void {
    this.flightPanel.style.display = "none";
    this.crosshair.style.display = "none";
  }

  updateFlight(d: FlightData): void {
    if (!this.hudElems) return;
    this.hudElems.speed.textContent = d.speed.toFixed(0);
    this.hudElems.throttle.textContent = (d.throttle * 100).toFixed(0) + "%";
    this.hudElems.fuel.textContent = d.fuel.toFixed(0);
    this.hudElems.hull.textContent = d.hull.toFixed(0) + "%";
    this.hudElems.mode.textContent = d.mode;
    this.hudElems.alt.textContent = d.altitude.toFixed(0);
    this.hudElems.warp.textContent = d.warpPhase || (d.warpReady ? "READY" : "CHG");
    this.hudElems.gear.textContent = d.gear ? "DN" : "UP";
    this.hudElems.target.textContent = d.target;
    this.hudElems.dist.textContent = d.targetDist >= 0 ? d.targetDist.toFixed(0) + "m" : "—";
  }

  showMessage(text: string, duration = 3.5): void {
    this.msg.textContent = text;
    this.msg.style.display = "block";
    this.msgTimer = duration;
  }
  setObjective(text: string): void {
    this.obj.textContent = text;
    this.obj.style.display = "block";
  }
  clearObjective(): void {
    this.obj.style.display = "none";
  }
  setCloud(opacity: number): void {
    this.cloudOverlay.style.opacity = String(clampNum(opacity, 0, 1));
    this.cloudOverlay.style.display = opacity > 0.01 ? "block" : "none";
  }
  setShake(intensity: number): void {
    if (intensity > 0.003) {
      this.shakeOverlay.style.display = "block";
      this.shakeOverlay.style.transform = `translate(${Math.sin(performance.now() * 0.05) * intensity * 40}px, ${Math.cos(performance.now() * 0.06) * intensity * 40}px)`;
    } else {
      this.shakeOverlay.style.display = "none";
    }
  }

  tick(dt: number): void {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.style.display = "none";
    }
  }
}

function clampNum(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
