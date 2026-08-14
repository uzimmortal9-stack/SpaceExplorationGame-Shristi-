import './style.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const uiRoot = document.querySelector<HTMLElement>('#ui-root');

if (!canvas || !uiRoot) throw new Error('Required game DOM elements are missing.');

const game = new Game(canvas, uiRoot);
game.boot();

// Useful for browser-based smoke testing without exposing debug controls in the UI.
Object.defineProperty(window, '__AEON_DRIFT__', { value: game, enumerable: false });
