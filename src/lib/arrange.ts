/*
 * Arrange words: a grown-up moves words on a page in a preview of the child's board.
 *  - Dropping a word on an occupied spot swaps the two words.
 *  - Dropping it on an empty spot moves only that word.
 * Nothing else moves. Changes stay a draft until "Save" (Undo steps back, Cancel discards).
 */
import type { Tile } from '../types';
import { orderedTiles, slotMap } from './grid';

/** Draft positions: tile id → slot. */
export type Draft = ReadonlyMap<string, number>;

export function draftFor(tiles: Tile[], categoryId: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const [slot, t] of slotMap(orderedTiles(tiles, categoryId))) m.set(t.id, slot);
  return m;
}

export function tileAt(draft: Draft, slot: number): string | undefined {
  for (const [id, s] of draft) if (s === slot) return id;
  return undefined;
}

/** Move the word at `from` to `to` (swap if `to` is taken). Returns a new draft. */
export function moveInDraft(draft: Draft, from: number, to: number): Map<string, number> {
  const next = new Map(draft);
  if (from === to || to < 0) return next;
  const a = tileAt(draft, from);
  if (!a) return next;
  const b = tileAt(draft, to);
  next.set(a, to);
  if (b) next.set(b, from);
  return next;
}

/** Tiles whose slot differs from the saved board (what "Save" writes). */
export function draftChanges(tiles: Tile[], categoryId: string, draft: Draft): { id: string; order: number }[] {
  const saved = draftFor(tiles, categoryId);
  return [...draft].filter(([id, slot]) => saved.get(id) !== slot).map(([id, order]) => ({ id, order }));
}
