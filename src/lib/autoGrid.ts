/*
 * Auto layout: choose how many rows and columns fit the board area, so every picture stays
 * large and easy to tap on the tablet in portrait and landscape. Auto layout only changes how
 * the board fits the screen — which words show is the grown-up's choice (Manage words), and
 * a word's slot (its order) never changes, so words keep the same relative order. If the words
 * don't all fit with large tiles, the page continues on the next page.
 */
import type { GridSize } from '../types';

export interface AutoGridInput {
  /** Size of the area the grid may use (CSS px). */
  width: number;
  height: number;
  /** Parent Mode text size (0.8 – 1.6). Larger text → larger tiles. */
  textScale: number;
  /** Parent Mode "space between pictures" (px) — the most spacing auto layout will use. */
  maxGap: number;
  /** Prefer the smallest grid that fits this vocabulary count. */
  wordCount?: number;
}

export interface AutoGridResult {
  grid: GridSize;
  gap: number;
  /** Size of one tile (px), for tests and diagnostics. */
  tile: { w: number; h: number };
}

/** Smallest tile auto layout will use at normal text size (CSS pixels). */
export const MIN_TILE_PX = 112;
const MAX_COLS = 7;
const MAX_ROWS = 6;

export function minTileFor(textScale: number): number {
  return Math.round(MIN_TILE_PX * Math.min(1.35, Math.max(1, textScale)));
}

/** Spacing shrinks a little on small screens so the pictures get the room. */
export function gapFor(width: number, height: number, maxGap: number): number {
  return Math.max(4, Math.min(maxGap, Math.round(Math.min(width, height) * 0.02)));
}

export function autoGrid({ width, height, textScale, maxGap, wordCount }: AutoGridInput): AutoGridResult {
  const W = Math.max(0, width);
  const H = Math.max(0, height);
  const gap = gapFor(W, H, maxGap);
  // On very short screens (a phone on its side) two rows must still fit: the minimum follows
  // the screen, so the board doesn't collapse to four giant tiles and dozens of pages.
  const minTile = Math.min(minTileFor(textScale), Math.floor(Math.min(W, H) * 0.42));
  let best: (AutoGridResult & { score: number }) | null = null;
  let biggest: (AutoGridResult & { side: number }) | null = null;
  const target = wordCount && wordCount > 0 ? wordCount : undefined;
  const minRows = target && target <= 3 ? 1 : 2;
  for (let cols = minRows; cols <= MAX_COLS; cols++) {
    for (let rows = minRows; rows <= MAX_ROWS; rows++) {
      const w = (W - (cols - 1) * gap) / cols;
      const h = (H - (rows - 1) * gap) / rows;
      if (w <= 0 || h <= 0) continue;
      const side = Math.min(w, h);
      if (!biggest || side > biggest.side) biggest = { grid: { rows, cols }, gap, tile: { w, h }, side };
      const ratio = w / h;
      // Tiles must be big enough and roughly square (a picture above a label).
      if (rows * cols > 30 || side < minTile || ratio < (target === undefined ? 0.7 : 0.6) || ratio > 1.8) continue;
      // Most words per page, then the squarest tiles.
      const capacity = rows * cols;
      const rank = target !== undefined && capacity >= target ? 100 - (capacity - target) : capacity;
      const score = rank * 1000 - Math.abs(Math.log(ratio)) * 100;
      if (!best || score > best.score) best = { grid: { rows, cols }, gap, tile: { w, h }, score };
    }
  }
  if (best) return { grid: best.grid, gap: best.gap, tile: best.tile };
  // Very small area: the largest tiles possible (2 × 2 at least).
  if (biggest) return { grid: biggest.grid, gap: biggest.gap, tile: biggest.tile };
  return { grid: { rows: 2, cols: 2 }, gap, tile: { w: 0, h: 0 } };
}

/** The page that holds `anchor` (the first slot that was on screen) for this grid. */
export function pageForAnchor(anchor: number, grid: GridSize): number {
  const per = Math.max(1, grid.rows * grid.cols);
  return Math.floor(Math.max(0, anchor) / per);
}

/** The last grid the board used (so Parent Mode previews match the child's screen). */
const LAST_KEY = 'mimzi:lastBoardGrid';
export function rememberBoardGrid(grid: GridSize): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(grid));
  } catch {
    /* storage may be unavailable */
  }
}
export function lastBoardGrid(fallback: GridSize): GridSize {
  try {
    const g = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as GridSize | null;
    if (g && g.rows > 0 && g.cols > 0) return g;
  } catch {
    /* ignore */
  }
  return fallback;
}
