import { QUICK_TILE_IDS } from '../data/vocabulary';
import type { GridSize, Settings } from '../types';
import { config } from '../config';

export const GRID_PRESETS: { label: string; grid: GridSize }[] = [
  { label: '2 × 2 (4 big tiles)', grid: { rows: 2, cols: 2 } },
  { label: '2 × 3 (6 tiles)', grid: { rows: 2, cols: 3 } },
  { label: '3 × 3 (9 tiles)', grid: { rows: 3, cols: 3 } },
  { label: '3 × 4 (12 tiles)', grid: { rows: 3, cols: 4 } },
  { label: '4 × 4 (16 tiles)', grid: { rows: 4, cols: 4 } },
  { label: '4 × 5 (20 tiles)', grid: { rows: 4, cols: 5 } },
  { label: '5 × 6 (30 tiles)', grid: { rows: 5, cols: 6 } },
];

export function defaultSettings(): Settings {
  return {
    grid: { rows: 3, cols: 3 },
    showSentenceBar: true,
    speechRate: 0.9,
    speechLang: config.defaultSpeechLang,
    textScale: 1,
    tileGap: 12,
    highContrast: false,
    reducedMotion: false,
    haptics: false,
    quickTileIds: [...QUICK_TILE_IDS],
  };
}

/** Fill in any settings added in newer versions without touching what the caregiver chose. */
export function mergeSettings(saved: Partial<Settings> | undefined): Settings {
  const base = defaultSettings();
  if (!saved) return base;
  return { ...base, ...saved, grid: { ...base.grid, ...(saved.grid ?? {}) } };
}
