import { QUICK_TILE_IDS } from '../data/vocabulary';
import type { GridSize, MyDay, ScheduleItem, Settings } from '../types';
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
    grid: { rows: 4, cols: 6 },
    showSentenceBar: true,
    speechRate: 0.9,
    speechLang: config.defaultSpeechLang,
    textScale: 1,
    tileGap: 12,
    highContrast: false,
    reducedMotion: false,
    haptics: false,
    quickTileIds: [...QUICK_TILE_IDS],
    showSignButtons: true,
    signLoop: true,
    signSpeed: 1,
    showAslDrawings: true,
    colorMode: 'wordType',
    speechPitch: 1.1,
    speechVolume: 1,
    speakOnTap: true,
    speakFolders: false,
    interruptMode: 'interrupt',
    repeatGuardMs: 0,
    celebrationVisual: true,
    celebrationSound: false,
    voiceDefaults: 2,
  };
}

/** Fill in any settings added in newer versions without touching what the caregiver chose. */
export function mergeSettings(saved: Partial<Settings> | undefined): Settings {
  const base = defaultSettings();
  if (!saved) return base;
  const merged: Settings = { ...base, ...saved, grid: { ...base.grid, ...(saved.grid ?? {}) } };
  if ((saved.voiceDefaults ?? 1) < 2) {
    // New friendlier voice defaults — only where the grown-up never changed them.
    if (saved.speechPitch === undefined || saved.speechPitch === 1) merged.speechPitch = base.speechPitch;
    if (saved.speechRate === undefined || saved.speechRate === 1) merged.speechRate = base.speechRate;
    merged.voiceDefaults = 2;
  }
  return merged;
}

const item = (label: string, tileId?: string): ScheduleItem => ({ label, tileId, done: false });

export function defaultMyDay(): MyDay {
  return {
    firstThen: { first: item('Brush teeth', 'actions-brush'), then: item('Play cars', 'play-cars') },
    firstThenTemplates: [],
    reward: { item: item('Bubbles', 'play-bubbles'), tokens: 3, earned: 0 },
    rewardTemplates: [],
    routine: { steps: [item('Get shoes', 'core-get'), item('Put on shoes', 'core-on'), item('Go outside', 'play-outside')] },
    routineTemplates: [],
    routineLayout: 'steps',
  };
}

export function mergeMyDay(saved: Partial<MyDay> | undefined): MyDay {
  const base = defaultMyDay();
  if (!saved) return base;
  const merged = { ...base, ...saved };
  const tokens = Math.min(10, Math.max(1, Math.round(merged.reward.tokens)));
  merged.reward = { ...merged.reward, tokens, earned: Math.min(tokens, Math.max(0, merged.reward.earned)) };
  return merged;
}
