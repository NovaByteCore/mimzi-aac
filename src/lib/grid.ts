import type { GridSize, Tile } from '../types';

/** Tiles in a category, in the caregiver's order. Deleted tiles are excluded; hidden ones keep their slot. */
export function orderedTiles(tiles: Tile[], categoryId: string): Tile[] {
  return tiles
    .filter((t) => t.categoryId === categoryId && !t.deletedAt)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function pageCount(total: number, grid: GridSize): number {
  const size = Math.max(1, grid.rows * grid.cols);
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Cells for one page. Always returns exactly rows × cols entries so every word keeps the
 * same spot on screen; `null` is an empty cell and hidden tiles also become empty cells.
 */
export function pageCells(tiles: Tile[], grid: GridSize, page: number): (Tile | null)[] {
  const size = Math.max(1, grid.rows * grid.cols);
  const start = page * size;
  const cells: (Tile | null)[] = [];
  for (let i = 0; i < size; i++) {
    const t = tiles[start + i];
    cells.push(t && !t.hidden ? t : null);
  }
  return cells;
}

/** Swap a tile with its neighbour in the same category. Returns the tiles whose order changed. */
export function moveTile(tiles: Tile[], tileId: string, direction: -1 | 1): Tile[] {
  const tile = tiles.find((t) => t.id === tileId);
  if (!tile) return [];
  const list = orderedTiles(tiles, tile.categoryId).map((t, i) => ({ ...t, order: i }));
  const idx = list.findIndex((t) => t.id === tileId);
  const target = idx + direction;
  if (target < 0 || target >= list.length) return [];
  [list[idx], list[target]] = [list[target], list[idx]];
  const changed: Tile[] = [];
  list.forEach((t, i) => {
    const original = tiles.find((o) => o.id === t.id);
    if (!original || original.order !== i) changed.push({ ...t, order: i });
  });
  return changed;
}

export function nextOrder(tiles: Tile[], categoryId: string): number {
  const inCat = tiles.filter((t) => t.categoryId === categoryId && !t.deletedAt);
  return inCat.length ? Math.max(...inCat.map((t) => t.order)) + 1 : 0;
}
