/*
 * Grow My Words — introduce new words gradually (pure logic, unit-tested).
 *
 * Words are placed on the board ahead of time but hidden, so when one is introduced
 * it appears in its own slot and nothing else moves. Due words wait for a grown-up's
 * approval unless automatic additions were explicitly switched on. Nothing here runs in
 * the background: schedules are applied the next time Mimzi opens.
 * This is an organiser, not an assessment — Mimzi never judges mastery.
 */
import type { GrowItem, GrowPlan, Tile, VocabEvent } from '../types';

export function defaultGrowPlan(): GrowPlan {
  return { cadence: 'weekly', perPeriod: 2, weekday: 1, autoAdd: false, paused: false, remind: true, items: [] };
}

export function mergeGrowPlan(saved: Partial<GrowPlan> | undefined): GrowPlan {
  const base = defaultGrowPlan();
  if (!saved) return base;
  return { ...base, ...saved, perPeriod: Math.min(10, Math.max(1, Math.round(saved.perPeriod ?? base.perPeriod))), items: saved.items ?? [] };
}

/** yyyy-mm-dd in the device's local time. */
export function dayString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return dayString(d);
}

/** First date on/after `from` that falls on `weekday` (0 = Sunday). */
export function nextWeekday(from: string, weekday: number): string {
  const d = parseDay(from);
  const diff = (weekday - d.getDay() + 7) % 7;
  return addDays(from, diff);
}

/** Due date of the n-th word (0-based) starting from `start`. */
export function dueDateFor(plan: Pick<GrowPlan, 'cadence' | 'perPeriod' | 'weekday'>, start: string, n: number): string {
  const period = Math.floor(n / Math.max(1, plan.perPeriod));
  if (plan.cadence === 'daily') return addDays(start, period);
  return addDays(nextWeekday(start, plan.weekday), period * 7);
}

let seq = 0;
const itemId = () => `grow-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * Add words to the end of the queue. If words are already planned, the new ones continue
 * the same rhythm after them; otherwise the schedule starts on `start`.
 */
export function scheduleWords(plan: GrowPlan, tileIds: string[], start: string): GrowPlan {
  const planned = plan.items.filter((i) => i.status === 'planned');
  const active = new Set(plan.items.filter((i) => i.status === 'planned' || i.status === 'pending' || i.status === 'added').map((i) => i.tileId));
  const fresh = tileIds.filter((id) => !active.has(id));
  const base = planned.length ? planned.map((i) => i.dueDate).sort()[0] : start;
  const items: GrowItem[] = fresh.map((tileId, k) => ({ id: itemId(), tileId, dueDate: dueDateFor(plan, base, planned.length + k), status: 'planned' }));
  return { ...plan, items: [...plan.items, ...items] };
}

/** Re-space every still-planned word from `from` (after changing cadence, resuming, or reordering). */
export function reschedule(plan: GrowPlan, from: string): GrowPlan {
  let n = 0;
  return {
    ...plan,
    items: plan.items.map((i) => (i.status === 'planned' ? { ...i, dueDate: dueDateFor(plan, from, n++) } : i)),
  };
}

/** Move a planned word earlier/later in the queue (dates are re-spaced). */
export function moveItem(plan: GrowPlan, id: string, dir: -1 | 1, today: string): GrowPlan {
  const planned = plan.items.filter((i) => i.status === 'planned');
  const idx = planned.findIndex((i) => i.id === id);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= planned.length) return plan;
  [planned[idx], planned[j]] = [planned[j], planned[idx]];
  const others = plan.items.filter((i) => i.status !== 'planned');
  const start = [...plan.items.filter((i) => i.status === 'planned').map((i) => i.dueDate), today].sort()[0];
  return reschedule({ ...plan, items: [...others, ...planned] }, start < today ? today : start);
}

export interface ProcessResult {
  plan: GrowPlan;
  /** Tile ids to make visible now (automatic mode only). */
  show: string[];
  /** Newly waiting for approval. */
  newlyPending: string[];
}

/** Apply everything due by `today` — safe to call every time Mimzi opens. */
export function processDue(plan: GrowPlan, today: string): ProcessResult {
  if (plan.paused) return { plan, show: [], newlyPending: [] };
  const show: string[] = [];
  const newlyPending: string[] = [];
  const items = plan.items.map((i): GrowItem => {
    if (i.status !== 'planned' || i.dueDate > today) return i;
    if (plan.autoAdd) {
      show.push(i.tileId);
      return { ...i, status: 'added', addedOn: today };
    }
    newlyPending.push(i.tileId);
    return { ...i, status: 'pending' };
  });
  return { plan: { ...plan, items }, show, newlyPending };
}

const CONNECTIONS: Record<string, string[]> = {
  again: ['go', 'play', 'bubbles', 'stop'],
  wait: ['go', 'stop', 'open'],
  look: ['play', 'go', 'open'],
  get: ['want', 'help', 'water'],
  give: ['want', 'help', 'play'],
  put: ['open', 'close', 'play'],
  up: ['go', 'help'], down: ['go', 'help'],
  in: ['put', 'open', 'close'], out: ['go', 'open'],
  on: ['put', 'open'], off: ['stop', 'close'],
  break: ['stop', 'all done', 'help'],
  like: ['i', 'want', 'play'], that: ['want', 'like', 'look'], this: ['want', 'like', 'look'],
  come: ['go', 'play'], mine: ['play', 'want'],
  'my turn': ['play', 'you'], 'your turn': ['play', 'you'],
  puzzle: ['play', 'help', 'open'], crayons: ['play', 'want', 'open'],
  teddy: ['play', 'want'], doll: ['play', 'want'],
};

export function suggestWeeklyWords(plan: GrowPlan, tiles: Tile[], today: string): GrowPlan {
  if (!plan.suggestWeekly || plan.paused) return plan;

  const monday = addDays(today, -((parseDay(today).getDay() + 6) % 7));
  if (plan.items.some((item) => item.id.startsWith(`suggest-${monday}-`))) return plan;

  const label = (tile: Tile) => tile.label.trim().toLowerCase();
  const available = tiles.filter((tile) => !tile.deletedAt && !tile.linkTo);
  const known = new Set(available.filter((tile) => !tile.hidden && tile.categoryId === 'core').map(label));
  const excluded = new Set(plan.items.filter((item) => !item.id.startsWith('suggest-') || item.status !== 'canceled').map((item) => item.tileId));
  const selected = new Set<string>();
  const options = available.filter((tile) => tile.hidden && (tile.categoryId === 'core' || tile.categoryId === 'play') && !known.has(label(tile)) && !excluded.has(tile.id))
    .map((tile) => ({ tile, score: (CONNECTIONS[label(tile)] ?? []).filter((word) => known.has(word)).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.tile.order - b.tile.order || a.tile.id.localeCompare(b.tile.id));
  const items: GrowItem[] = [];
  for (const { tile } of options) {
    const word = label(tile);
    if (selected.has(word)) continue;
    selected.add(word);
    items.push({ id: `suggest-${monday}-${tile.id}`, tileId: tile.id, dueDate: today, status: 'pending' });
    if (items.length === 2) break;
  }

  return items.length ? { ...plan, items: [...plan.items, ...items] } : plan;
}

export function setStatus(plan: GrowPlan, ids: string[], status: GrowItem['status'], today: string): GrowPlan {
  const set = new Set(ids);
  return {
    ...plan,
    items: plan.items.map((i) => (set.has(i.id) ? { ...i, status, ...(status === 'added' ? { addedOn: today } : {}) } : i)),
  };
}

export function pendingItems(plan: GrowPlan): GrowItem[] {
  return plan.items.filter((i) => i.status === 'pending');
}

export function vocabEvent(tile: Tile, type: VocabEvent['type'], source: VocabEvent['source'], date: string): VocabEvent {
  return {
    id: `ev-${Date.now().toString(36)}-${(seq++).toString(36)}`,
    tileId: tile.id,
    label: tile.label,
    categoryId: tile.categoryId,
    position: tile.order,
    date,
    type,
    source,
  };
}
