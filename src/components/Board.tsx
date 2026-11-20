import { useLayoutEffect, useRef, useState } from 'react';
import type { GridSize, Tile } from '../types';
import { pageCells, pageCount } from '../lib/grid';
import { autoGrid, pageForAnchor, rememberBoardGrid } from '../lib/autoGrid';
import { Icon } from './Icon';
import { TileButton } from './TileButton';

interface Props {
  tiles: Tile[];
  /** Fixed grid (Parent Mode "fixed size"), or the starting guess for auto layout. */
  grid: GridSize;
  /** Auto layout: fit rows × columns to the space (default). */
  auto?: { textScale: number; maxGap: number; wordCount?: number };
  /**
   * The first slot that was on screen. Pages are worked out from it, so when the tablet
   * rotates and the grid changes, the child stays on the page with the same words.
   */
  anchor: number;
  onAnchor: (slot: number) => void;
  onTap: (tile: Tile) => void;
  mediaUrls: Record<string, string>;
  label: string;
  emptyMessage?: string;
  /** false = pack words in order (Favorites); true = fixed slots (normal pages). */
  slotted?: boolean;
  /** Reports the grid in use (auto layout). */
  onGrid?: (grid: GridSize) => void;
}

const same = (a: GridSize, b: GridSize) => a.rows === b.rows && a.cols === b.cols;

export function Board({ tiles, grid: fixedGrid, auto, anchor, onAnchor, onTap, mediaUrls, label, emptyMessage, slotted = true, onGrid }: Props) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<{ grid: GridSize; gap: number } | null>(null);
  const grid = auto && fit ? fit.grid : fixedGrid;

  // Auto layout: measure the space the grid has and choose rows × columns that keep the
  // pictures large. Runs again when the tablet rotates or the window changes size.
  useLayoutEffect(() => {
    if (!auto) return;
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return;
      const next = autoGrid({ width: r.width, height: r.height, textScale: auto.textScale, maxGap: auto.maxGap, wordCount: auto.wordCount });
      setFit((cur) => (cur && same(cur.grid, next.grid) && cur.gap === next.gap ? cur : { grid: next.grid, gap: next.gap }));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, [auto?.textScale, auto?.maxGap, auto?.wordCount, Boolean(auto)]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    onGrid?.(grid);
    if (auto) rememberBoardGrid(grid);
  }, [grid.rows, grid.cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const per = Math.max(1, grid.rows * grid.cols);
  const pages = pageCount(tiles, grid, slotted);
  const current = Math.min(pageForAnchor(anchor, grid), pages - 1);
  const cells = pageCells(tiles, grid, current, slotted);
  const visibleCount = tiles.filter((t) => !t.hidden).length;
  const goTo = (p: number) => onAnchor(Math.max(0, Math.min(p, pages - 1)) * per);

  return (
    <section className="board" aria-label={label} data-layout={auto ? 'auto' : 'fixed'}>
      {visibleCount === 0 && emptyMessage ? (
        <p className="board-empty">{emptyMessage}</p>
      ) : (
        <div className="board-fit" ref={areaRef}>
          <div
            className="board-grid"
            style={{
              gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
              ...(auto && fit ? { gap: `${fit.gap}px` } : {}),
            }}
            data-rows={grid.rows}
            data-cols={grid.cols}
            data-page={current}
          >
            {cells.map((tile, i) =>
              tile ? (
                <TileButton key={tile.id} tile={tile} photoUrl={tile.photoId ? mediaUrls[tile.photoId] : undefined} onTap={onTap} />
              ) : (
                <div key={`empty-${i}`} aria-hidden="true" />
              ),
            )}
          </div>
        </div>
      )}
      {/* The pager's space is always kept (hidden on one-page boards), so hiding or swapping a
          word never changes the board's size — and auto layout never re-flows the other words. */}
      {pages <= 1 && auto && (
        <div className="pager pager-idle" aria-hidden="true">
          <span className="pager-btn" />
          <span className="pager-dots" />
          <span className="pager-btn" />
        </div>
      )}
      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button type="button" className="pager-btn" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label="Previous page">
            <Icon name="prev" size={30} />
          </button>
          <span className="pager-dots" aria-live="polite">
            {pages <= 6 ? (
              Array.from({ length: pages }, (_, i) => <span key={i} className={`dot${i === current ? ' dot-on' : ''}`} />)
            ) : (
              <span className="pager-count" aria-hidden="true">
                {current + 1} / {pages}
              </span>
            )}
            <span className="sr-only">
              Page {current + 1} of {pages}
            </span>
          </span>
          <button type="button" className="pager-btn" onClick={() => goTo(current + 1)} disabled={current >= pages - 1} aria-label="Next page">
            <Icon name="next" size={30} />
          </button>
        </nav>
      )}
    </section>
  );
}
