/*
 * Board positions. A word's `order` is its fixed slot on its page (slot 0 = top-left of
 * page 1). Hidden and empty slots stay empty, so words never slide around — this keeps
 * motor planning consistent. Only a caregiver moves words.
 */
import type { GridSize, Tile } from '../types';

/** Words on a page in slot order. Deleted words are excluded; hidden ones keep their slot. */
export function orderedTiles(tiles: Tile[], categoryId: string): Tile[] {
  return tiles
    .filter((t) => t.categoryId === categoryId && !t.deletedAt)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const size = (grid: GridSize) => Math.max(1, grid.rows * grid.cols);

/** Resolve slots (if two words claim one slot, the later one takes the next free slot). */
export function slotMap(tiles: Tile[]): Map<number, Tile> {
  const map = new Map<number, Tile>();
  for (const t of [...tiles].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    let slot = Math.max(0, Math.floor(t.order));
    while (map.has(slot)) slot++;
    map.set(slot, t);
  }
  return map;
}

export function pageCount(tiles: Tile[] | number, grid: GridSize, slotted = true): number {
  if (typeof tiles === 'number') return Math.max(1, Math.ceil(tiles / size(grid)));
  if (!slotted) return Math.max(1, Math.ceil(tiles.length / size(grid)));
  const map = slotMap(tiles);
  const max = map.size ? Math.max(...map.keys()) : 0;
  return Math.max(1, Math.floor(max / size(grid)) + 1);
}

/**
 * Cells for one page — always exactly rows × cols entries. `null` = empty or hidden.
 * `slotted=false` packs words in order (used for Favorites, which collects from many pages).
 */
export function pageCells(tiles: Tile[], grid: GridSize, page: number, slotted = true): (Tile | null)[] {
  const n = size(grid);
  const start = page * n;
  const cells: (Tile | null)[] = [];
  if (!slotted) {
    for (let i = 0; i < n; i++) {
      const t = tiles[start + i];
      cells.push(t && !t.hidden ? t : null);
    }
    return cells;
  }
  const map = slotMap(tiles);
  for (let i = 0; i < n; i++) {
    const t = map.get(start + i);
    cells.push(t && !t.hidden ? t : null);
  }
  return cells;
}

/** Move a word one slot earlier/later on its page (swapping with whatever is there). Returns changed tiles. */
export function moveTile(tiles: Tile[], tileId: string, direction: -1 | 1): Tile[] {
  const tile = tiles.find((t) => t.id === tileId);
  if (!tile) return [];
  const page = orderedTiles(tiles, tile.categoryId);
  const map = slotMap(page);
  let from = -1;
  for (const [slot, t] of map) if (t.id === tileId) from = slot;
  const to = from + direction;
  if (from < 0 || to < 0) return [];
  const other = map.get(to);
  const changed: Tile[] = [{ ...tile, order: to }];
  if (other) changed.push({ ...other, order: from });
  return changed;
}

/** First empty slot on a page (new words fill gaps; existing words never move). */
export function nextOrder(tiles: Tile[], categoryId: string): number {
  const used = new Set(slotMap(orderedTiles(tiles, categoryId)).keys());
  let i = 0;
  while (used.has(i)) i++;
  return i;
}
