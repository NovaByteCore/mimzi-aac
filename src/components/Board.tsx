import type { GridSize, Tile } from '../types';
import { pageCells, pageCount } from '../lib/grid';
import { TileButton } from './TileButton';

interface Props {
  tiles: Tile[];
  grid: GridSize;
  page: number;
  onPage: (page: number) => void;
  onTap: (tile: Tile) => void;
  onSign?: (tile: Tile) => void;
  mediaUrls: Record<string, string>;
  label: string;
  emptyMessage?: string;
}

export function Board({ tiles, grid, page, onPage, onTap, onSign, mediaUrls, label, emptyMessage }: Props) {
  const pages = pageCount(tiles.length, grid);
  const current = Math.min(page, pages - 1);
  const cells = pageCells(tiles, grid, current);
  const visibleCount = tiles.filter((t) => !t.hidden).length;

  return (
    <section className="board" aria-label={label}>
      {visibleCount === 0 && emptyMessage ? (
        <p className="board-empty">{emptyMessage}</p>
      ) : (
        <div
          className="board-grid"
          style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))` }}
          data-rows={grid.rows}
          data-cols={grid.cols}
        >
          {cells.map((tile, i) =>
            tile ? (
              <TileButton key={tile.id} tile={tile} photoUrl={tile.photoId ? mediaUrls[tile.photoId] : undefined} onTap={onTap} onSign={onSign} />
            ) : (
              <div key={`empty-${i}`} className="tile-empty" aria-hidden="true" />
            ),
          )}
        </div>
      )}
      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button type="button" className="pager-btn" onClick={() => onPage(current - 1)} disabled={current === 0} aria-label="Previous page">
            ◀
          </button>
          <span className="pager-dots" aria-live="polite">
            {Array.from({ length: pages }, (_, i) => (
              <span key={i} className={`dot${i === current ? ' dot-on' : ''}`} />
            ))}
            <span className="sr-only">
              Page {current + 1} of {pages}
            </span>
          </span>
          <button type="button" className="pager-btn" onClick={() => onPage(current + 1)} disabled={current >= pages - 1} aria-label="Next page">
            ▶
          </button>
        </nav>
      )}
    </section>
  );
}
