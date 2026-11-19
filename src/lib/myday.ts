/*
 * Visual schedule logic (pure functions, unit-tested).
 * Rules from the brief: earned tokens are never taken away (only a deliberate reset clears
 * a board), and nothing here gates communication, food, comfort, care or breaks.
 */
import type { MyDay, ScheduleItem, Tile } from '../types';

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

export function addToken(reward: MyDay['reward']): MyDay['reward'] {
  return { ...reward, earned: Math.min(reward.tokens, reward.earned + 1) };
}

export function rewardComplete(reward: MyDay['reward']): boolean {
  return reward.earned >= reward.tokens;
}

export function setTokenCount(reward: MyDay['reward'], tokens: number): MyDay['reward'] {
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

/** Picture for a schedule item: its own photo, else the linked word tile's photo or symbol. */
export function itemPicture(
  item: ScheduleItem,
  tiles: Map<string, Tile>,
  mediaUrls: Record<string, string>,
): { photoUrl?: string; symbol?: string; asl?: string; tile?: Tile } {
  if (item.photoId && mediaUrls[item.photoId]) return { photoUrl: mediaUrls[item.photoId] };
  const tile = item.tileId ? tiles.get(item.tileId) : undefined;
  if (tile) return { photoUrl: tile.photoId ? mediaUrls[tile.photoId] : undefined, symbol: tile.symbol, tile, ...(tile.aslSign ? { asl: tile.aslSign } : {}) };
  return {};
}
