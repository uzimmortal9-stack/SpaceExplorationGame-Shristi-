/**
 * HUD — the non-diegetic layer, kept deliberately sparse.
 *
 * While exploring on foot, the screen carries nothing except a small reticle
 * and a contextual prompt. Flight avionics only appear when seated. Objectives
 * fade in briefly when they change. Everything else lives on world-space
 * screens inside the ship.
 */

import { CONTROL_HELP } from '../core/input';
import { clamp, formatDistance } from '../core/math';
import type { GamePhase, GameState, Objective, ShipSystems, TargetInfo } from '../core/state';

export interface HudCallbacks {
  onResume(): void;
  onOpenSettings(): void;
  onOpenControls(): void;
  onOpenCredits(): void;
  onQuit(): void;
  onSelectTarget(id: string): void;
  onQualityChange(q: 'low' | 'medium' | 'high'): void;
  onVolumeChange(bus: 'master' | 'ambient' | 'sfx', v: number): void;
  onSensitivityChange(v: number): void;
  onInvertY(v: boolean): void;
}

export interface NavOption {
  id: string;
  name: string;
  kind: string;
  distance: number;
  description: string;
  color: number;
  landable: boolean;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

export class Hud {
  readonly root = el('div', 'ui-root');

  private readonly reticle = el('div', 'reticle');
  private readonly prompt = el('div', 'prompt');
  private readonly promptLabel = el('span', 'label');
  private readonly promptDetail = el('span', 'detail');
  private readonly avionics = el('div', 'avionics');
  private readonly objectivesBox = el('div', 'objectives panel');
  private readonly objectivesList = el('ul');
  private readonly toasts = el('div', 'toasts');
  private readonly subtitleEl = el('div', 'subtitle');
  private readonly bars = el('div', 'bars');
  private readonly fade = el('div', 'fade');
  private readonly warnBanner = el('div', 'warn-banner', 'ATMOSPHERIC ENTRY');
  private readonly fpsEl = el('div', 'fps');
  private readonly speedEl = el('div', 'speed-readout panel');
  private readonly speedValue = el('div', 'v', '0');
  private readonly targetCard = el('div', 'target-card panel');
  private readonly hintBadge = el('div', 'hint-badge panel');

  private readonly gauges = new Map<string, { wrap: HTMLElement; bar: HTMLElement; value: HTMLElement }>();
  private readonly overlays = new Map<string, HTMLElement>();

  private subtitleTimer = 0;
  private displayedSpeed = 0;
  private navOptions: NavOption[] = [];
  private activeTargetId: string | null = null;

  constructor(
    private readonly state: GameState,
    private readonly cb: HudCallbacks,
  ) {
    this.build();
    this.wireState();
  }

  private build(): void {
    // ---- reticle + prompt --------------------------------------------------
    this.root.append(this.reticle);
    const key = el('span', 'key', 'E');
    this.prompt.append(key, this.promptLabel, this.promptDetail);
    this.root.append(this.prompt);

    // ---- objectives ---------------------------------------------------------
    this.objectivesBox.append(el('h5', undefined, 'Objectives'), this.objectivesList);
    this.root.append(this.objectivesBox);

    // ---- toasts + subtitle --------------------------------------------------
    this.root.append(this.toasts, this.subtitleEl);

    // ---- cinematic + fade ---------------------------------------------------
    this.root.append(this.bars, this.fade, el('div', 'vignette'));

    // ---- avionics -----------------------------------------------------------
    const left = el('div', 'mfd left panel');
    left.append(el('h5', undefined, 'Flight'));
    left.append(this.gauge('throttle', 'Throttle'));
    left.append(this.gauge('speed', 'Velocity'));
    left.append(this.gauge('gear', 'Gear'));
    const right = el('div', 'mfd right panel');
    right.append(el('h5', undefined, 'Systems'));
    right.append(this.gauge('hull', 'Hull'));
    right.append(this.gauge('fuel', 'Fuel'));
    right.append(this.gauge('warp', 'Warp'));

    this.speedEl.append(this.speedValue, el('div', 'u', 'm · s⁻¹'));
    this.targetCard.append(el('div', 'name', 'NO TARGET'), el('div', 'meta', 'Press M to select a destination'));

    this.avionics.append(left, right, this.speedEl, this.targetCard, this.warnBanner);
    this.root.append(this.avionics);

    this.root.append(this.fpsEl, this.hintBadge);

    this.buildOverlays();
  }

  private gauge(id: string, label: string): HTMLElement {
    const wrap = el('div', 'gauge');
    const head = el('div', 'gauge-head');
    const name = el('span', undefined, label);
    const value = el('b', undefined, '0%');
    head.append(name, value);
    const bar = el('div', 'gauge-bar');
    const fill = el('span');
    bar.append(fill);
    wrap.append(head, bar);
    this.gauges.set(id, { wrap, bar: fill, value });
    return wrap;
  }

  setGauge(id: string, ratio: number, text: string, tone: 'ok' | 'warn' | 'crit' = 'ok'): void {
    const g = this.gauges.get(id);
    if (!g) return;
    g.bar.style.width = `${clamp(ratio, 0, 1) * 100}%`;
    g.value.textContent = text;
    g.wrap.classList.toggle('warn', tone === 'warn');
    g.wrap.classList.toggle('crit', tone === 'crit');
  }

  // ------------------------------------------------------------------ overlays

  private buildOverlays(): void {
    // ---- settings ------------------------------------------------------------
    const settings = this.overlay('settings', 'Settings', (card) => {
      const mk = (
        label: string,
        min: number, max: number, step: number, value: number,
        onInput: (v: number) => void,
        fmt: (v: number) => string = (v) => `${Math.round(v * 100)}%`,
      ): void => {
        const row = el('div', 'row');
        const lab = el('label', undefined, label);
        const input = el('input');
        input.type = 'range';
        input.min = String(min); input.max = String(max);
        input.step = String(step); input.value = String(value);
        input.className = 'clickable';
        const val = el('span', 'value', fmt(value));
        input.addEventListener('input', () => {
          const v = Number(input.value);
          val.textContent = fmt(v);
          onInput(v);
        });
        row.append(lab, input, val);
        card.append(row);
      };

      const qRow = el('div', 'row');
      qRow.append(el('label', undefined, 'Graphics quality'));
      const qSel = el('select', 'clickable');
      for (const q of ['low', 'medium', 'high'] as const) {
        const o = el('option', undefined, q.toUpperCase());
        o.value = q;
        if (q === 'high') o.selected = true;
        qSel.append(o);
      }
      qSel.addEventListener('change', () => this.cb.onQualityChange(qSel.value as 'low' | 'medium' | 'high'));
      qRow.append(qSel);
      card.append(qRow);

      mk('Master volume', 0, 1, 0.01, 0.8, (v) => this.cb.onVolumeChange('master', v));
      mk('Ambience', 0, 1, 0.01, 0.7, (v) => this.cb.onVolumeChange('ambient', v));
      mk('Effects', 0, 1, 0.01, 0.85, (v) => this.cb.onVolumeChange('sfx', v));
      mk('Mouse sensitivity', 0.2, 3, 0.05, 1, (v) => this.cb.onSensitivityChange(v), (v) => v.toFixed(2));

      const invRow = el('div', 'row');
      invRow.append(el('label', undefined, 'Invert vertical look'));
      const inv = el('input');
      inv.type = 'checkbox';
      inv.className = 'clickable';
      inv.addEventListener('change', () => this.cb.onInvertY(inv.checked));
      invRow.append(inv);
      card.append(invRow);

      const fsRow = el('div', 'row');
      fsRow.append(el('label', undefined, 'Fullscreen'));
      const fsBtn = el('button', 'btn clickable', 'Toggle');
      fsBtn.addEventListener('click', () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      });
      fsRow.append(fsBtn);
      card.append(fsRow);

      const ctlBtn = el('button', 'btn clickable', 'View controls');
      ctlBtn.addEventListener('click', () => {
        this.hide('settings');
        this.cb.onOpenControls();
      });
      card.append(el('div', undefined, '<br>'), ctlBtn);
    });
    void settings;

    // ---- controls ------------------------------------------------------------
    this.overlay('controls', 'Controls', (card) => {
      const grid = el('div', 'controls-grid');
      for (const group of CONTROL_HELP) {
        const col = el('div', 'controls-col');
        col.append(el('h4', undefined, group.group));
        for (const [k, v] of group.rows) {
          const row = el('div', 'key-row');
          row.append(el('span', undefined, v), el('b', undefined, k));
          col.append(row);
        }
        grid.append(col);
      }
      card.append(grid);
      card.append(
        el(
          'p',
          'panel-sub',
          '<br>Control hints are shown once. Reopen this panel any time from Settings.',
        ),
      );
    });

    // ---- credits -------------------------------------------------------------
    this.overlay('credits', 'Credits & Asset Licences', (card) => {
      card.append(el('div', 'panel-sub', 'Loading asset manifest…'));
      card.dataset.dynamic = 'credits';
    });

    // ---- pause ---------------------------------------------------------------
    this.overlay('pause', 'Paused', (card) => {
      const actions = el('div', 'menu-actions');
      const mkBtn = (label: string, sub: string, fn: () => void): void => {
        const b = el('button', 'btn clickable', `${label}<small>${sub}</small>`);
        b.addEventListener('click', fn);
        actions.append(b);
      };
      mkBtn('Resume', 'Return to the ship', () => this.cb.onResume());
      mkBtn('Settings', 'Graphics, audio, sensitivity', () => { this.hide('pause'); this.cb.onOpenSettings(); });
      mkBtn('Controls', 'Full keybinding reference', () => { this.hide('pause'); this.cb.onOpenControls(); });
      mkBtn('Credits', 'Assets, authors, licences', () => { this.hide('pause'); this.cb.onOpenCredits(); });
      mkBtn('Quit to menu', 'Abandon the current run', () => this.cb.onQuit());
      card.append(actions);
    });

    // ---- nav / target selector -------------------------------------------------
    this.overlay('nav', 'Navigation — Target Selector', (card) => {
      card.classList.add('navmap');
      card.append(el('div', 'panel-sub', 'Select a destination, then arm the warp drive from the bridge.'));
      const list = el('div', 'nav-list');
      list.dataset.role = 'navlist';
      card.append(list);
    });
  }

  private overlay(id: string, title: string, build: (card: HTMLElement) => void): HTMLElement {
    const wrap = el('div', 'overlay hidden');
    const card = el('div', 'overlay-card panel');
    card.append(el('h3', 'panel-title', title));
    build(card);
    const close = el('button', 'btn clickable', id === 'controls' ? 'Got It · Return to Ship' : 'Close');
    close.addEventListener('click', () => {
      this.hide(id);
      this.cb.onResume();
    });
    card.append(el('div', undefined, '<br>'), close);
    wrap.append(card);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) {
        this.hide(id);
        this.cb.onResume();
      }
    });
    this.root.append(wrap);
    this.overlays.set(id, wrap);
    return wrap;
  }

  show(id: string): void {
    this.overlays.get(id)?.classList.remove('hidden');
  }

  hide(id: string): void {
    this.overlays.get(id)?.classList.add('hidden');
  }

  isOpen(id?: string): boolean {
    if (id) return !this.overlays.get(id)?.classList.contains('hidden');
    for (const o of this.overlays.values()) if (!o.classList.contains('hidden')) return true;
    return false;
  }

  hideAll(): void {
    for (const id of this.overlays.keys()) this.hide(id);
  }

  // ---------------------------------------------------------------- nav list

  setNavOptions(options: NavOption[]): void {
    this.navOptions = options;
    this.renderNav();
  }

  private renderNav(): void {
    const card = this.overlays.get('nav')?.querySelector('[data-role="navlist"]') as HTMLElement | null;
    if (!card) return;
    card.innerHTML = '';
    for (const opt of this.navOptions) {
      const item = el('div', 'nav-item clickable');
      if (opt.id === this.activeTargetId) item.classList.add('active');
      item.append(el('div', 'n', opt.name));
      item.append(
        el(
          'div',
          'd',
          `${opt.kind.toUpperCase()} · ${formatDistance(opt.distance)}${opt.landable ? ' · LANDABLE' : ''}`,
        ),
      );
      item.append(el('div', 'd', opt.description));
      const sw = el('div', 'swatch');
      sw.style.background = `#${opt.color.toString(16).padStart(6, '0')}`;
      item.append(sw);
      item.addEventListener('click', () => {
        this.activeTargetId = opt.id;
        this.cb.onSelectTarget(opt.id);
        this.renderNav();
      });
      card.append(item);
    }
  }

  setCredits(
    rows: Array<{ pack: string; author: string; license: string; count: number; source: string }>,
    missing: string[],
    libs: Array<[string, string, string]>,
  ): void {
    const card = this.overlays.get('credits')?.querySelector('.overlay-card') as HTMLElement | null;
    if (!card) return;
    // rebuild content but keep the title and the close button
    const title = card.querySelector('.panel-title');
    const close = card.querySelector('button');
    card.innerHTML = '';
    if (title) card.append(title);

    card.append(el('div', 'panel-sub', 'All 3D models, textures and HDRIs are CC0 or public domain.'));

    const t1 = el('table', 'credit-table');
    t1.innerHTML =
      '<tr><th>Asset pack</th><th>Author</th><th>Licence</th><th>Models</th></tr>' +
      rows
        .map(
          (r) =>
            `<tr><td>${r.pack}</td><td>${r.author}</td><td>${r.license}</td><td>${r.count}</td></tr>`,
        )
        .join('');
    card.append(t1);

    card.append(el('div', 'panel-sub', '<br>Engines & libraries'));
    const t2 = el('table', 'credit-table');
    t2.innerHTML =
      '<tr><th>Library</th><th>Licence</th><th>Role</th></tr>' +
      libs.map(([n, l, r]) => `<tr><td>${n}</td><td>${l}</td><td>${r}</td></tr>`).join('');
    card.append(t2);

    if (missing.length) {
      card.append(
        el(
          'div',
          'panel-sub',
          `<br><span style="color:var(--orange)">${missing.length} asset(s) unavailable — see ASSET_DOWNLOAD_MANIFEST.md. Placeholders are in use for: ${missing
            .slice(0, 12)
            .join(', ')}${missing.length > 12 ? '…' : ''}</span>`,
        ),
      );
    }
    if (close) card.append(el('div', undefined, '<br>'), close);
  }

  // ------------------------------------------------------------------ updates

  private wireState(): void {
    const s = this.state;
    s.events.on('objective', (list) => this.renderObjectives(list));
    s.events.on('toast', ({ text, tone }) => this.toast(text, tone));
    s.events.on('subtitle', ({ text, duration }) => this.showSubtitle(text, duration ?? 4.5));
    s.events.on('target', (t) => this.renderTarget(t));
    s.events.on('systems', (sys) => this.renderSystems(sys));
    s.events.on('cinematic', (on) => this.setCinematic(on));
    s.events.on('phase', (p) => this.onPhase(p));
  }

  private onPhase(phase: GamePhase): void {
    const flying = phase === 'flight' || phase === 'warpCharge' || phase === 'warpTunnel';
    this.avionics.classList.toggle('on', flying);
    this.warnBanner.classList.toggle('on', phase === 'entry');
    if (phase === 'entry') this.warnBanner.textContent = 'ATMOSPHERIC ENTRY';
  }

  private renderObjectives(list: Objective[]): void {
    this.objectivesList.innerHTML = '';
    for (const o of list) {
      const li = el('li', o.done ? 'done' : undefined, o.text);
      this.objectivesList.append(li);
    }
    this.objectivesBox.classList.toggle('on', list.length > 0);
  }

  private renderTarget(t: TargetInfo | null): void {
    this.activeTargetId = t?.id ?? null;
    const name = this.targetCard.querySelector('.name') as HTMLElement;
    const meta = this.targetCard.querySelector('.meta') as HTMLElement;
    if (!t) {
      name.textContent = 'NO TARGET';
      meta.textContent = 'Press M to select a destination';
      return;
    }
    name.textContent = t.name.toUpperCase();
    meta.textContent = `${t.kind.toUpperCase()} · ${formatDistance(t.distance)} · ${t.canWarp ? 'WARP READY' : 'OUT OF RANGE'}`;
    this.renderNav();
  }

  private renderSystems(sys: ShipSystems): void {
    this.setGauge('hull', sys.hull, `${Math.round(sys.hull * 100)}%`, sys.hull < 0.3 ? 'crit' : sys.hull < 0.6 ? 'warn' : 'ok');
    this.setGauge('fuel', sys.fuel, `${Math.round(sys.fuel * 100)}%`, sys.fuel < 0.15 ? 'crit' : sys.fuel < 0.3 ? 'warn' : 'ok');
    this.setGauge('warp', sys.warpCharge, `${Math.round(sys.warpCharge * 100)}%`, 'ok');
    this.setGauge('gear', sys.landingGear, sys.landingGear > 0.9 ? 'DOWN' : sys.landingGear < 0.1 ? 'UP' : 'MOVING', sys.landingGear > 0.9 ? 'ok' : 'warn');
  }

  setFlight(throttle: number, speed: number): void {
    this.setGauge('throttle', throttle, `${Math.round(throttle * 100)}%`);
    this.setGauge('speed', clamp(speed / 1700, 0, 1), `${Math.round(speed)}`);
    this.displayedSpeed += (speed - this.displayedSpeed) * 0.18;
    this.speedValue.textContent = Math.round(this.displayedSpeed).toString();
  }

  setPrompt(label: string | null, detail?: string): void {
    if (!label) {
      this.prompt.classList.remove('on');
      this.reticle.classList.remove('hot');
      return;
    }
    this.promptLabel.textContent = label;
    this.promptDetail.textContent = detail ?? '';
    this.prompt.classList.add('on');
    this.reticle.classList.add('hot');
  }

  setReticle(visible: boolean): void {
    this.reticle.classList.toggle('on', visible);
  }

  setHint(text: string | null): void {
    if (!text) {
      this.hintBadge.classList.remove('on');
      return;
    }
    this.hintBadge.textContent = text;
    this.hintBadge.classList.add('on');
  }

  toast(text: string, tone: 'info' | 'warn' | 'good' = 'info'): void {
    const t = el('div', `toast panel ${tone}`, text);
    this.toasts.append(t);
    window.setTimeout(() => t.classList.add('out'), 4200);
    window.setTimeout(() => t.remove(), 4800);
  }

  showSubtitle(text: string, duration: number): void {
    this.subtitleEl.textContent = text;
    this.subtitleEl.classList.add('on');
    this.subtitleTimer = duration;
  }

  setCinematic(on: boolean): void {
    this.bars.classList.toggle('on', on);
    this.avionics.style.opacity = on ? '0' : '';
    this.objectivesBox.style.opacity = on ? '0' : '';
  }

  fadeTo(opacity: number, white = false): void {
    this.fade.classList.toggle('white', white);
    this.fade.classList.toggle('on', opacity > 0.5);
  }

  setFps(fps: number, tris: number): void {
    this.fpsEl.textContent = `${fps.toFixed(0)} FPS · ${(tris / 1000).toFixed(0)}k tris`;
  }

  update(dt: number): void {
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.subtitleEl.classList.remove('on');
    }
  }
}
