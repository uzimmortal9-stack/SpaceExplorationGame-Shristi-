/** Simple localStorage save of key game state. */

export interface SaveData {
  started: boolean;
  controlsSeen: boolean;
  state: string;
  player: { x: number; y: number; z: number; yaw: number };
  shipPosition: { x: number; y: number; z: number };
  targetId: string | null;
  warpSeen: boolean;
}

const KEY = "aurora_voyager_save_v1";

export const SaveSystem = {
  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SaveData;
    } catch {
      return null;
    }
  },
  save(data: SaveData): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  },
};
