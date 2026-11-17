import { useMemo, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { orderedTiles } from '../lib/grid';
import { TileFace } from '../components/TileFace';
import { TileEditor } from './TileEditor';
import type { Tile } from '../types';

export function WordsPanel() {
  const { tiles, categories, mediaUrls, moveTile, settings } = useMimzi();
  const sortedCats = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const [categoryId, setCategoryId] = useState(sortedCats[0]?.id ?? 'core');
  const [editing, setEditing] = useState<Tile | 'new' | null>(null);
  const list = orderedTiles(tiles, categoryId);
  const perPage = settings.grid.rows * settings.grid.cols;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Words & pictures</h2>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          + Add picture
        </button>
      </div>
      <p className="muted">
        Tap a word to change its photo, words or colour. Arrows move a word one spot — words never move on their own.
      </p>
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
      </div>

      {list.length === 0 ? (
        <p className="muted">No words in this group yet.</p>
      ) : (
        <ol className="edit-grid" style={{ gridTemplateColumns: `repeat(${settings.grid.cols}, minmax(0, 150px))` }}>
          {list.map((t, i) => (
            <li key={t.id} className={`edit-item${t.hidden ? ' edit-hidden' : ''}`} data-edit-tile={t.id}>
              {i % perPage === 0 && list.length > perPage && <span className="page-marker">Page {i / perPage + 1}</span>}
              <button type="button" className={`tile tile-${t.color} edit-tile${t.photoId ? ' tile-has-photo' : ''}`} onClick={() => setEditing(t)} aria-label={`Edit ${t.label}`}>
                <span className="tile-media">
                  <TileFace symbol={t.symbol} photoUrl={t.photoId ? mediaUrls[t.photoId] : undefined} label={t.label} />
                </span>
                <span className="tile-label">
                  {t.label}
                  {t.hidden ? ' 🙈' : ''}
                  {t.favorite ? ' ⭐' : ''}
                </span>
              </button>
              <div className="move-row">
                <button type="button" className="icon-btn small" onClick={() => moveTile(t.id, -1)} disabled={i === 0} aria-label={`Move ${t.label} earlier`}>
                  ◀
                </button>
                <button type="button" className="icon-btn small" onClick={() => moveTile(t.id, 1)} disabled={i === list.length - 1} aria-label={`Move ${t.label} later`}>
                  ▶
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {editing && (
        <TileEditor
          tile={editing === 'new' ? undefined : editing}
          defaultCategoryId={categoryId}
          categories={sortedCats}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
