import { QUICK_TILE_IDS } from '../data/vocabulary';
import type { FirstThenTemplate, GridSize, MyDay, RewardTemplate, RoutineTemplate, ScheduleItem, Settings } from '../types';
import { clampSteps } from './myday';
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
  merged.compactWordPages = Array.isArray(saved.compactWordPages) ? saved.compactWordPages.filter((id) => typeof id === 'string') : undefined;
  if ((saved.voiceDefaults ?? 1) < 2) {
    // New friendlier voice defaults — only where the grown-up never changed them.
    if (saved.speechPitch === undefined || saved.speechPitch === 1) merged.speechPitch = base.speechPitch;
    if (saved.speechRate === undefined || saved.speechRate === 1) merged.speechRate = base.speechRate;
    merged.voiceDefaults = 2;
  }
  return merged;
}

const item = (label: string, tileId?: string): ScheduleItem => ({ label, tileId, done: false });
const sym = (label: string, symbol: string): ScheduleItem => ({ label, symbol, done: false });

/* Example saved schedules. Pictures use the board's own words where they exist (so they follow
   the board's ARASAAC pictures) and bundled Mulberry symbols otherwise. */
const EXAMPLE_FIRST_THEN: FirstThenTemplate[] = [
  { id: 'ex-ft-shoes', name: 'Shoes, then outside', first: item('Put on shoes', 'core-on'), then: item('Go outside', 'play-outside') },
];
const EXAMPLE_REWARDS: RewardTemplate[] = [
  { id: 'ex-rw-bubbles', name: 'Working for bubbles', item: item('Bubbles', 'play-bubbles'), tokens: 3, tokenStyle: 'star' },
  { id: 'ex-rw-outside', name: 'Working for outdoor play', item: item('Outside', 'play-outside'), tokens: 3, tokenStyle: 'circle' },
  { id: 'ex-rw-toy', name: 'Working for a favorite toy', item: item('Cars', 'play-cars'), tokens: 3, tokenStyle: 'check' },
  { id: 'ex-rw-music', name: 'Working for music', item: item('Music', 'play-music'), tokens: 3, tokenStyle: 'heart' },
];
const EXAMPLE_ROUTINES: RoutineTemplate[] = [
  { id: 'ex-rt-morning', name: 'Morning Routine', steps: [sym('Get dressed', 'mul:get_dressed_,_to'), item('Brush teeth', 'actions-brush'), item('Eat breakfast', 'core-eat')] },
  { id: 'ex-rt-leaving', name: 'Leaving Home', steps: [item('Put on shoes', 'core-on'), sym('Get jacket', 'mul:jacket'), item('Go outside', 'play-outside')] },
  { id: 'ex-rt-bedtime', name: 'Bedtime', steps: [item('Bath', 'places-bath'), sym('Pajamas', 'mul:pyjamas'), item('Read book', 'play-books')] },
];

export function defaultMyDay(): MyDay {
  return {
    firstThen: { first: item('Brush teeth', 'actions-brush'), then: item('Play cars', 'play-cars') },
    firstThenTemplates: structuredClone(EXAMPLE_FIRST_THEN),
    reward: { item: item('Bubbles', 'play-bubbles'), tokens: 3, earned: 0, tokenStyle: 'star' },
    rewardTemplates: structuredClone(EXAMPLE_REWARDS),
    routine: { steps: [item('Get shoes', 'core-get'), item('Put on shoes', 'core-on'), item('Go outside', 'play-outside')] },
    routineTemplates: structuredClone(EXAMPLE_ROUTINES),
    routineLayout: 'steps',
    showUpcoming: true,
    version: 2,
  };
}

/**
 * Load saved schedules (any version). Older data keeps everything the caregiver made; v1 → v2
 * adds the example templates (without duplicating names already used) and the new reward options.
 */
export function mergeMyDay(saved: Partial<MyDay> | undefined): MyDay {
  const base = defaultMyDay();
  if (!saved) return base;
  const merged: MyDay = { ...base, ...saved };
  const tokens = Math.min(10, Math.max(1, Math.round(Number(merged.reward?.tokens) || 3)));
  merged.reward = { ...base.reward, ...merged.reward, tokens, earned: Math.min(tokens, Math.max(0, Number(merged.reward?.earned) || 0)) };
  merged.reward.tokenStyle ??= 'star';
  merged.routine = { ...merged.routine, steps: clampSteps(merged.routine?.steps ?? base.routine.steps) };
  merged.routineTemplates = (merged.routineTemplates ?? []).map((t) => ({ ...t, steps: clampSteps(t.steps ?? []) }));
  merged.firstThenTemplates ??= [];
  merged.rewardTemplates ??= [];
  if (!['steps', 'nowNextLater', 'oneAtATime'].includes(merged.routineLayout)) merged.routineLayout = 'steps';
  if ((saved.version ?? 1) < 2) {
    const add = <T extends { id: string; name: string }>(have: T[], examples: T[]) => {
      const names = new Set(have.map((t) => t.name.toLowerCase()));
      const ids = new Set(have.map((t) => t.id));
      return [...have, ...structuredClone(examples).filter((e) => !names.has(e.name.toLowerCase()) && !ids.has(e.id))];
    };
    merged.firstThenTemplates = add(merged.firstThenTemplates, EXAMPLE_FIRST_THEN);
    merged.rewardTemplates = add(merged.rewardTemplates, EXAMPLE_REWARDS);
    merged.routineTemplates = add(merged.routineTemplates, EXAMPLE_ROUTINES);
    merged.showUpcoming ??= true;
    merged.version = 2;
  }
  return merged;
}
