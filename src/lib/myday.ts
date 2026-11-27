/*
 * Visual schedule logic (pure functions, unit-tested).
 * Rules from the brief: earned tokens are never taken away (only a deliberate reset clears
 * a board), and nothing here gates communication, food, comfort, care or breaks.
 */
import type { FirstThenTemplate, MyDay, RewardBoard, RewardTemplate, RoutineLayout, RoutineTemplate, ScheduleItem, Tile, TokenStyle } from '../types';
import { shownSymbol } from './symbols';

export const MIN_TOKENS = 1;
export const MAX_TOKENS = 10;

export function spokenText(item: ScheduleItem): string {
  return (item.speak?.trim() || item.label.trim()).trim();
}

/** "First brush teeth, then play cars." */
export function firstThenSentence(first: ScheduleItem, then: ScheduleItem): string {
  const a = spokenText(first);
  const b = spokenText(then);
  if (a && b) return `First ${a}, then ${b}`;
  return a || b;
}

export function addToken<R extends RewardBoard>(reward: R): R {
  return { ...reward, earned: Math.min(reward.tokens, reward.earned + 1) };
}

export function rewardComplete(reward: Pick<RewardBoard, 'earned' | 'tokens'>): boolean {
  return reward.earned >= reward.tokens;
}

export function setTokenCount<R extends RewardBoard>(reward: R, tokens: number): R {
  const t = Math.min(MAX_TOKENS, Math.max(MIN_TOKENS, Math.round(tokens)));
  // Changing the size never removes tokens already earned unless the board gets smaller than them.
  return { ...reward, tokens: t, earned: Math.min(t, reward.earned) };
}

/** Index of the first step not yet done, or -1 when every step is done. */
export function currentStepIndex(steps: ScheduleItem[]): number {
  return steps.findIndex((s) => !s.done);
}

/** Now / Next / Later view of the same routine. */
export function nowNextLater(steps: ScheduleItem[]): { now?: ScheduleItem; next?: ScheduleItem; later?: ScheduleItem; nowIndex: number } {
  const i = currentStepIndex(steps);
  if (i === -1) return { nowIndex: -1 };
  return { now: steps[i], next: steps[i + 1], later: steps[i + 2], nowIndex: i };
}

export function markDone<T extends ScheduleItem>(item: T, done = true): T {
  return { ...item, done };
}

export function resetItems(items: ScheduleItem[]): ScheduleItem[] {
  return items.map((i) => ({ ...i, done: false }));
}

export function moveStep(steps: ScheduleItem[], index: number, dir: -1 | 1): ScheduleItem[] {
  const j = index + dir;
  if (j < 0 || j >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/**
 * Picture for a schedule item: its own photo > an AAC symbol picked for it > the linked word's
 * photo or picture. With none of these the card shows the words in large type.
 */
export function itemPicture(
  item: ScheduleItem,
  tiles: Map<string, Tile>,
  mediaUrls: Record<string, string>,
): { photoUrl?: string; symbol?: string; symbolInfo?: ScheduleItem['symbolInfo']; tile?: Tile } {
  if (item.photoId && mediaUrls[item.photoId]) return { photoUrl: mediaUrls[item.photoId] };
  if (item.symbol) return { symbol: item.symbol, symbolInfo: item.symbolInfo };
  const tile = item.tileId ? tiles.get(item.tileId) : undefined;
  if (tile) return { photoUrl: tile.photoId ? mediaUrls[tile.photoId] : undefined, symbol: tile.symbol, tile };
  return {};
}

/* ---------------- routines ---------------- */

export const MIN_STEPS = 1;
export const MAX_STEPS = 5;

export const blankItem = (label = ''): ScheduleItem => ({ label, done: false });

export function addStep(steps: ScheduleItem[], item: ScheduleItem = blankItem()): ScheduleItem[] {
  return steps.length >= MAX_STEPS ? steps : [...steps, item];
}

export function removeStep(steps: ScheduleItem[], index: number): ScheduleItem[] {
  return steps.length <= MIN_STEPS ? steps : steps.filter((_, i) => i !== index);
}

/** Keep a saved routine within 1–5 steps (older data could hold more). */
export function clampSteps(steps: ScheduleItem[]): ScheduleItem[] {
  const s = steps.slice(0, MAX_STEPS);
  return s.length ? s : [blankItem('Step 1')];
}

export const ROUTINE_LAYOUTS: { id: RoutineLayout; label: string }[] = [
  { id: 'steps', label: 'Numbered steps' },
  { id: 'nowNextLater', label: 'Now / Next / Later' },
  { id: 'oneAtATime', label: 'One step at a time' },
];

/* ---------------- rewards ---------------- */

export const TOKEN_STYLES: { id: TokenStyle; label: string }[] = [
  { id: 'star', label: 'Stars' },
  { id: 'check', label: 'Checkmarks' },
  { id: 'circle', label: 'Circles' },
  { id: 'heart', label: 'Hearts' },
  { id: 'dot', label: 'Progress dots' },
];

export function completeMessage(reward: Pick<RewardBoard, 'completeMessage' | 'item'>): string {
  return reward.completeMessage?.trim() || `You did it! Time for ${spokenText(reward.item)}.`;
}

/* ---------------- templates ---------------- */

export interface Named {
  id: string;
  name: string;
}

/** A unique name: "Bedtime", "Bedtime (2)", … */
export function uniqueName<T extends Named>(list: T[], wanted: string, ignoreId?: string): string {
  const base = wanted.trim() || 'Untitled';
  const taken = new Set(list.filter((t) => t.id !== ignoreId).map((t) => t.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`.toLowerCase())) return `${base} (${n})`;
}

export function renameTemplate<T extends Named>(list: T[], id: string, name: string): T[] {
  return list.map((t) => (t.id === id ? { ...t, name: uniqueName(list, name, id) } : t));
}

export function deleteTemplate<T extends Named>(list: T[], id: string): T[] {
  return list.filter((t) => t.id !== id);
}

export function duplicateTemplate<T extends Named>(list: T[], id: string, newId: string): T[] {
  const t = list.find((x) => x.id === id);
  if (!t) return list;
  const copy = { ...(JSON.parse(JSON.stringify(t)) as T), id: newId, name: uniqueName(list, `${t.name} copy`) };
  const i = list.findIndex((x) => x.id === id);
  return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
}

/** Every schedule item in use or saved (for offline symbol download and media bookkeeping). */
export function allScheduleItems(day: MyDay): ScheduleItem[] {
  return [
    day.firstThen.first,
    day.firstThen.then,
    day.reward.item,
    ...day.routine.steps,
    ...day.firstThenTemplates.flatMap((t) => [t.first, t.then]),
    ...day.rewardTemplates.map((t) => t.item),
    ...day.routineTemplates.flatMap((t) => t.steps),
  ];
}

/** Remote symbol images used by schedules (saved for offline use by the service worker). */
export function scheduleSymbolUrls(day: MyDay): string[] {
  const urls = new Set<string>();
  for (const i of allScheduleItems(day)) {
    if (!i.symbol) continue;
    const s = shownSymbol({ symbol: i.symbol, symbolInfo: i.symbolInfo }, {});
    if (s.url && !s.url.startsWith('data:')) urls.add(s.url);
  }
  return [...urls];
}

/** A card shown fresh (not done). */
export const freshItem = (i: ScheduleItem): ScheduleItem => ({ ...i, done: false });

/** Put a saved First / Then board on screen (starts fresh). */
export function applyFirstThenTemplate(day: MyDay, t: FirstThenTemplate): MyDay {
  return { ...day, firstThen: { first: freshItem(t.first), then: freshItem(t.then), name: t.name } };
}

/** Put a saved reward board on screen. Switching boards starts it fresh: earned tokens go to 0. */
export function applyRewardTemplate(day: MyDay, t: RewardTemplate): MyDay {
  const { id: _id, name, ...board } = t;
  return { ...day, reward: { ...board, item: freshItem(t.item), earned: 0, name } };
}

/** Put a saved routine on screen, with its own layout and "show upcoming steps" setting. */
export function applyRoutineTemplate(day: MyDay, t: RoutineTemplate): MyDay {
  return {
    ...day,
    routine: { steps: t.steps.map(freshItem), name: t.name },
    routineLayout: t.layout ?? day.routineLayout,
    showUpcoming: t.showUpcoming ?? day.showUpcoming,
  };
}
