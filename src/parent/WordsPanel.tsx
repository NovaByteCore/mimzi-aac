import { useMemo, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { orderedTiles, slotMap } from '../lib/grid';
import { lastBoardGrid } from '../lib/autoGrid';
import { TileFace } from '../components/TileFace';
import { TileEditor } from './TileEditor';
import { PicturePicker } from './PicturePicker';
import { ArrangeWords } from './ArrangeWords';
import type { Tile } from '../types';
import { Icon } from '../components/Icon';

/**
 * Edit AAC board. Two separate controls per word:
 *  - tap the picture → the picture picker (only the picture changes);
 *  - "Edit" → the word, spoken text, recording, colour and more.
 * "Arrange words" opens a preview of the child's board to drag words to new spots.
 */
/** Extra views in the Words list: every favorite word, and the Quick Words bar (from any page). */
export const FAVORITES_VIEW = '__favorites';
export const QUICK_VIEW = '__quick';

export function WordsPanel({ initialCategoryId }: { initialCategoryId?: string } = {}) {
  const { tiles, categories, mediaUrls, settings, setTilePicture } = useMimzi();
  const sortedCats = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const [categoryId, setCategoryId] = useState(
    initialCategoryId && (initialCategoryId === FAVORITES_VIEW || initialCategoryId === QUICK_VIEW || categories.some((c) => c.id === initialCategoryId)) ? initialCategoryId : (sortedCats[0]?.id ?? 'core'),
  );
  const [editing, setEditing] = useState<Tile | 'new' | null>(null);
  const [picturing, setPicturing] = useState<Tile | null>(null);
  const [arranging, setArranging] = useState(false);
  const grid = settings.layoutMode === 'fixed' ? settings.grid : lastBoardGrid(settings.grid);
  const perPage = grid.rows * grid.cols;
  const special = categoryId === FAVORITES_VIEW || categoryId === QUICK_VIEW;
  const live = tiles.filter((t) => !t.deletedAt);
  const specialTiles: Tile[] =
    categoryId === FAVORITES_VIEW
      ? live.filter((t) => t.favorite && !t.linkTo).sort((a, b) => a.label.localeCompare(b.label))
      : settings.quickTileIds.map((id) => live.find((t) => t.id === id)).filter((t): t is Tile => Boolean(t));
  const list: [number, Tile][] = special
    ? specialTiles.map((t, i) => [i, t])
    : [...slotMap(orderedTiles(tiles, categoryId)).entries()].sort((a, b) => a[0] - b[0]);
  const pageName = (t: Tile) => categories.find((c) => c.id === t.categoryId)?.name;
  const lastPage = list.length ? Math.floor(list[list.length - 1][0] / perPage) : 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Words & pictures</h2>
        <div className="row">
          {!special && (
            <button type="button" className="btn" onClick={() => setArranging(true)} data-testid="arrange-words-btn">
              <Icon name="arrange" /> Arrange words
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            + Add picture
          </button>
        </div>
      </div>
      <p className="muted">Tap a picture to change it. Tap “Edit” to change the word, what Mimzi says, or the recording. Use “Arrange words” to move words.</p>
      <div className="chip-row" role="tablist" aria-label="Groups">
        {sortedCats.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === categoryId}
            className={`chip-btn${c.id === categoryId ? ' chip-btn-on' : ''}`}
            onClick={() => setCategoryId(c.id)}
          >
            {c.name}
            {c.hidden ? ' (hidden)' : ''}
          </button>
        ))}
        {[
          { id: FAVORITES_VIEW, name: '★ Favorites' },
          { id: QUICK_VIEW, name: 'On the quick bar' },
        ].map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={v.id === categoryId}
            className={`chip-btn${v.id === categoryId ? ' chip-btn-on' : ''}`}
            onClick={() => setCategoryId(v.id)}
            data-testid={`words-view-${v.id === FAVORITES_VIEW ? 'favorites' : 'quick'}`}
          >
            {v.name}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="muted">
          {categoryId === FAVORITES_VIEW ? 'No favorites yet. Use “Edit favorites” on the Favorites page, or Edit on a word.' : categoryId === QUICK_VIEW ? 'No quick words yet. Add them under Quick words.' : 'No words in this group yet.'}
        </p>
      ) : (
        <ol className="edit-grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 150px))` }}>
          {list.map(([slot, t], i) => (
            <li key={t.id} className={`edit-item${t.hidden ? ' edit-hidden' : ''}`} data-edit-tile={t.id}>
              {!special && lastPage > 0 && (i === 0 || Math.floor(list[i - 1][0] / perPage) !== Math.floor(slot / perPage)) && <span className="page-marker">Page {Math.floor(slot / perPage) + 1}</span>}
              <div className={`tile tile-${t.color} edit-tile${t.photoId ? ' tile-has-photo' : ''}`}>
                <button type="button" className="edit-picture" onClick={() => setPicturing(t)} aria-label={`Change picture for ${t.label}`} data-change-picture={t.id}>
                  <span className="tile-media">
                    <TileFace tile={t} photoUrl={t.photoId ? mediaUrls[t.photoId] : undefined} label={t.label} />
                  </span>
                  <span className="edit-picture-hint" aria-hidden="true">
                    <Icon name="image" size={16} />
                  </span>
                </button>
                <span className="tile-label">
                  {t.label}
                  {t.hidden ? ' (hidden)' : ''}
                  {t.favorite ? ' (favorite)' : ''}
                  {special && <small className="muted"> · {pageName(t)}</small>}
                </span>
              </div>
              <button type="button" className="btn small edit-word" onClick={() => setEditing(t)} aria-label={`Edit ${t.label}`}>
                <Icon name="edit" size={16} /> Edit
              </button>
            </li>
          ))}
        </ol>
      )}

      {picturing && (
        <PicturePicker
          title={`Picture for “${picturing.label}”`}
          suggest={picturing.label}
          onCancel={() => setPicturing(null)}
          onUse={(p) => {
            void setTilePicture(picturing.id, p);
            setPicturing(null);
          }}
        />
      )}
      {arranging && !special && <ArrangeWords categoryId={categoryId} onClose={() => setArranging(false)} />}
      {editing && (
        <TileEditor
          tile={editing === 'new' ? undefined : editing}
          defaultCategoryId={special ? (sortedCats[0]?.id ?? 'core') : categoryId}
          categories={sortedCats}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
