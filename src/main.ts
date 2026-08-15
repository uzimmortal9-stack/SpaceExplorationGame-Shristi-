/**
 * Entry point — boot screen, main menu, then hand over to the Game.
 */

import './style.css';
import { Game } from './game';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

// ---------------------------------------------------------------- boot screen

const boot = document.createElement('div');
boot.className = 'boot';
boot.innerHTML = `
  <div class="boot-inner">
    <h1 class="boot-logo">AURORA DRIFT</h1>
    <div class="boot-tag">Deep Space Survey · Ilex Expedition</div>
    <div class="bar"><span id="boot-bar"></span></div>
    <div class="boot-status" id="boot-status">Initialising renderer…</div>
  </div>
`;
app.append(boot);

const bar = boot.querySelector('#boot-bar') as HTMLElement;
const status = boot.querySelector('#boot-status') as HTMLElement;

const setProgress = (v: number, label: string): void => {
  bar.style.width = `${Math.round(v * 100)}%`;
  status.textContent = label;
};

// ------------------------------------------------------------------ main menu

const menu = document.createElement('div');
menu.className = 'menu hidden';
menu.innerHTML = `
  <div class="menu-card panel">
    <h1>AURORA DRIFT</h1>
    <div class="lede">
      Survey vessel · mission day 412<br>
      A repeating signal from Ilex Prime. You are the closest hull.
    </div>
    <div class="menu-actions">
      <button class="btn primary clickable" id="m-start">Begin Expedition<small>Wake aboard the Aurora Drift</small></button>
      <button class="btn clickable" id="m-controls">Controls<small>Movement, piloting, interface</small></button>
      <button class="btn clickable" id="m-settings">Settings<small>Graphics, audio, sensitivity</small></button>
      <button class="btn clickable" id="m-credits">Credits<small>Assets, authors, licences</small></button>
    </div>
  </div>
`;
app.append(menu);

// ------------------------------------------------------------------- run it

async function main(): Promise<void> {
  const game = new Game(app!);

  try {
    await game.boot(setProgress);
  } catch (err) {
    console.error(err);
    status.textContent = `Failed to start: ${(err as Error).message}`;
    status.style.color = 'var(--red)';
    return;
  }

  // expose a small debug surface for development; not referenced by the UI
  (window as unknown as { aurora: unknown }).aurora = game.debug;

  boot.classList.add('hidden');
  window.setTimeout(() => boot.remove(), 800);
  menu.classList.remove('hidden');

  const hide = (): void => {
    menu.classList.add('hidden');
  };

  menu.querySelector('#m-start')?.addEventListener('click', () => {
    hide();
    void game.start();
  });
  menu.querySelector('#m-controls')?.addEventListener('click', () => {
    hide();
    void game.start().then(() => {
      // start() already shows the controls panel on first run
    });
  });
  menu.querySelector('#m-settings')?.addEventListener('click', () => {
    hide();
    void game.start();
  });
  menu.querySelector('#m-credits')?.addEventListener('click', () => {
    hide();
    void game.start();
  });
}

void main();
