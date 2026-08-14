import type { GameSettings, GameSnapshot } from '../types';

const SAVE_KEY = 'aeon-drift-save-v1';
const SETTINGS_KEY = 'aeon-drift-settings-v1';
const CONTROLS_KEY = 'aeon-drift-controls-seen';

export const defaultSettings: GameSettings = {
  quality: 'high',
  sensitivity: 0.72,
  volume: 0.72,
  motion: 0.65,
  fullscreen: false,
};

export class SaveSystem {
  save(snapshot: GameSnapshot): void {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
  }

  load(): GameSnapshot | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GameSnapshot;
      return parsed.version === 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
  }

  saveSettings(settings: GameSettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  loadSettings(): GameSettings {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<GameSettings>;
      return { ...defaultSettings, ...parsed };
    } catch {
      return { ...defaultSettings };
    }
  }

  controlsSeen(): boolean {
    return localStorage.getItem(CONTROLS_KEY) === 'true';
  }

  markControlsSeen(): void {
    localStorage.setItem(CONTROLS_KEY, 'true');
  }
}
