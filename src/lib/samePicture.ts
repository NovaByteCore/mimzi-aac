import type { Tile } from '../types';

/*
 * The same word can sit on more than one page (e.g. "milk" on Needs and on Food). A grown-up who
 * changes its picture expects that word to look the same everywhere — on its pages, in Quick Words
 * and in Favorites — so a picture change is copied to every other copy of the word.
 * Only the picture moves: label, speech, recording, page and position of each copy stay as they are.
 */

const PICTURE_FIELDS = ['symbol', 'symbolInfo', 'symbolAuto', 'autoArasaac', 'fallbackSymbol', 'photoId'] as const;

const wordKey = (t: Tile) => t.label.trim().toLocaleLowerCase();

function samePicture(a: Tile, b: Tile): boolean {
  return PICTURE_FIELDS.every((f) => JSON.stringify(a[f] ?? null) === JSON.stringify(b[f] ?? null));
}

/** Other live copies of the same word (folders never count). */
export function copiesOfWord(tile: Tile, tiles: Tile[]): Tile[] {
  if (tile.linkTo || !tile.label.trim()) return [];
  const key = wordKey(tile);
  return tiles.filter((t) => t.id !== tile.id && !t.deletedAt && !t.linkTo && wordKey(t) === key);
}

/**
 * The copies that need updating after `next` was saved over `prev`: empty when the picture didn't
 * change. Each returned tile is the copy with `next`'s picture.
 */
export function pictureCopies(prev: Tile | undefined, next: Tile, tiles: Tile[], now = Date.now()): Tile[] {
  if (prev && samePicture(prev, next)) return [];
  return copiesOfWord(next, tiles)
    .filter((t) => !samePicture(t, next))
    .map((t) => {
      const copy: Tile = { ...t, updatedAt: now };
      for (const f of PICTURE_FIELDS) (copy as unknown as Record<string, unknown>)[f] = next[f];
      return copy;
    });
}
