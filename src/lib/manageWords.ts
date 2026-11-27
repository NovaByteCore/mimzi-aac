/*
 * Manage words: the grown-up chooses which words the child sees. Rules that keep the board
 * predictable for motor planning:
 *  - Hiding keeps the word's slot, picture, speech, recording and sign; showing brings it back.
 *  - Swapping puts the new word in exactly the slot the grown-up selected. Only that slot
 *    (and the slot the new word came from) change — every other word stays where it was.
 *  - The word that was swapped out is hidden, not deleted, with everything it had.
 *  - Quick Words (Help, Stop, No, More, All done) are a separate bar and never move.
 */
import type { Tile } from '../types';
import { orderedTiles, slotMap } from './grid';

export interface SwapResult {
  /** Tiles to save (changed or new). */
  changed: Tile[];
  /** The word now in the selected slot. */
  placed: Tile;
  /** The word that was there before (now hidden), if any. */
  displaced?: Tile;
}

/** The word at a slot on a page (hidden words count — they keep their slot). */
export function tileAtSlot(tiles: Tile[], categoryId: string, slot: number): Tile | undefined {
  return slotMap(orderedTiles(tiles, categoryId)).get(slot);
}

/** Highest slot used on a page (−1 if empty). */
function lastSlot(tiles: Tile[], categoryId: string): number {
  const keys = [...slotMap(orderedTiles(tiles, categoryId)).keys()];
  return keys.length ? Math.max(...keys) : -1;
}

/**
 * Put `incomingId` into `slot` on `categoryId`.
 *  - A word from the same page trades places with the word in the slot (which is hidden).
 *  - A word from another page is copied here (same picture, speech, recording and sign;
 *    the original stays on its own page). The word in the slot is hidden and kept at the end
 *    of the page, so no other word moves.
 *  - An empty slot simply receives the word.
 */
export function swapWordInto(tiles: Tile[], categoryId: string, slot: number, incomingId: string, makeId: () => string, now = Date.now()): SwapResult | null {
  const incoming = tiles.find((t) => t.id === incomingId && !t.deletedAt);
  if (!incoming || incoming.linkTo) return null;
  const current = tileAtSlot(tiles, categoryId, slot);
  if (current?.id === incoming.id) {
    const placed = { ...incoming, hidden: false, updatedAt: now };
    return { changed: incoming.hidden ? [placed] : [], placed };
  }
  const changed: Tile[] = [];
  if (incoming.categoryId === categoryId) {
    const from = [...slotMap(orderedTiles(tiles, categoryId)).entries()].find(([, t]) => t.id === incoming.id)?.[0] ?? incoming.order;
    const placed: Tile = { ...incoming, order: slot, hidden: false, updatedAt: now };
    changed.push(placed);
    let displaced: Tile | undefined;
    if (current) {
      displaced = { ...current, order: from, hidden: true, updatedAt: now };
      changed.push(displaced);
    }
    return { changed, placed, displaced };
  }
  // From another page: a copy goes into the slot.
  const placed: Tile = {
    ...incoming,
    id: makeId(),
    categoryId,
    order: slot,
    hidden: false,
    favorite: false,
    builtIn: false,
    deletedAt: undefined,
    updatedAt: now,
  } as Tile;
  changed.push(placed);
  let displaced: Tile | undefined;
  if (current) {
    displaced = { ...current, order: Math.max(lastSlot(tiles, categoryId), slot) + 1, hidden: true, updatedAt: now };
    changed.push(displaced);
  }
  return { changed, placed, displaced };
}

/** Words a grown-up can swap in: hidden words on this page first, then words on other pages. */
export function swapCandidates(tiles: Tile[], categoryId: string): { hiddenHere: Tile[]; otherPages: Tile[] } {
  const live = tiles.filter((t) => !t.deletedAt && !t.linkTo);
  const hiddenHere = orderedTiles(live, categoryId).filter((t) => t.hidden);
  const labelsHere = new Set(live.filter((t) => t.categoryId === categoryId).map((t) => t.label.toLowerCase()));
  const seen = new Set<string>();
  const otherPages = live
    .filter((t) => t.categoryId !== categoryId && !labelsHere.has(t.label.toLowerCase()))
    .filter((t) => {
      const k = t.label.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  return { hiddenHere, otherPages };
}

/** Keep words already shown when possible; reveal or hide in board order. Folders are unaffected. */
export function wordCountChanges(pageTiles: Tile[], count: number): { ids: string[]; hidden: boolean } {
  const words = pageTiles.filter((tile) => !tile.linkTo && !tile.deletedAt);
  const shown = words.filter((tile) => !tile.hidden);
  if (count < shown.length) return { ids: shown.slice(count).map((tile) => tile.id), hidden: true };
  return { ids: words.filter((tile) => tile.hidden).slice(0, count - shown.length).map((tile) => tile.id), hidden: false };
}

/** Visible vocabulary first, then folder shortcuts, preserving order within each group. */
export function compactBoardWords(pageTiles: Tile[]): Tile[] {
  const shown = pageTiles.filter((tile) => !tile.hidden);
  return [...shown.filter((tile) => !tile.linkTo), ...shown.filter((tile) => tile.linkTo)];
}
