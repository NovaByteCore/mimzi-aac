import { useMemo, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { orderedTiles, pageCount, slotMap } from '../lib/grid';
import { lastBoardGrid } from '../lib/autoGrid';
import { swapCandidates } from '../lib/manageWords';
import { ESSENTIAL_TILE_IDS, HOME_PAGE } from '../data/vocabulary';
import { TileFace } from '../components/TileFace';
import { ConfirmDialog } from './ConfirmDialog';
import { displayColor } from '../lib/colors';
import type { Tile } from '../types';
import { Icon } from '../components/Icon';

/**
 * Manage words — the grown-up chooses which words the child sees: show, hide, or swap one
 * word for another in a chosen slot. Hidden words keep their picture, voice, recording and
 * sign, so they can come back unchanged. Nothing else on the page moves, and Quick Words
 * (Help, Stop, No, More, All done) stay in their own bar.
 */
export function WordsOnBoardPanel() {
  const { tiles, categories, settings, mediaUrls, setTilesHidden, swapWord } = useMimzi();
  const pages = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const [pageId, setPageId] = useState(HOME_PAGE);
  const [selected, setSelected] = useState<number | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<{ text: string; undo?: () => void } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; run: () => void } | null>(null);

  // Preview with the same rows × columns the child's board uses right now.
  const grid = settings.layoutMode === 'fixed' ? settings.grid : lastBoardGrid(settings.grid);
  const pageTiles = orderedTiles(tiles, pageId);
  const visible = pageTiles.filter((t) => !t.hidden);
  const perPage = grid.rows * grid.cols;
  const map = slotMap(pageTiles);
  const nPages = Math.max(pageCount(pageTiles, grid, true, true), selected != null ? Math.floor(selected / perPage) + 1 : 1);
  const pageName = pages.find((p) => p.id === pageId)?.name ?? '';
  const selTile = selected != null ? map.get(selected) : undefined;
  const { hiddenHere, otherPages } = useMemo(() => swapCandidates(tiles, pageId), [tiles, pageId]);
  const match = (t: Tile) => !filter.trim() || t.label.toLowerCase().includes(filter.trim().toLowerCase());

  const choosePage = (id: string) => {
    setPageId(id);
    setSelected(null);
    setSwapOpen(false);
    setStatus(null);
  };

  const setHidden = (t: Tile, hidden: boolean) => {
    const run = () => {
      void setTilesHidden([t.id], hidden);
      setStatus({ text: hidden ? `“${t.label}” is hidden. Its picture and recording are kept.` : `“${t.label}” is back in its spot.`, undo: () => void setTilesHidden([t.id], !hidden) });
    };
    if (hidden && ESSENTIAL_TILE_IDS.includes(t.id)) {
      setConfirm({
        title: `Hide “${t.label}”?`,
        message: `“${t.label}” is important for asking for help or saying no. It stays in Quick Words, but it won’t be on this page. Hide it anyway?`,
        run,
      });
    } else run();
  };

  const swapIn = async (incoming: Tile) => {
    if (selected == null) return;
    const before = selTile;
    const r = await swapWord(pageId, selected, incoming.id);
    setSwapOpen(false);
    setFilter('');
    if (!r) return;
    setStatus({
      text: before
        ? `“${r.placed.label}” is now in “${before.label}”’s spot. “${before.label}” is hidden and kept for later.`
        : `“${r.placed.label}” added to this spot.`,
      undo: before && incoming.categoryId === pageId ? () => void swapWord(pageId, selected, before.id) : undefined,
    });
  };

  return (
    <section className="panel manage-words">
      <h2>Manage words</h2>
      <p className="muted">
        Choose which words your child sees. Tap a spot, then show, hide or swap that word. A swapped-in word goes exactly where you tapped; nothing else moves.
        Hidden words keep their picture, voice and recording, so you can bring them back later. Quick Words stay in their own bar.
      </p>

      <div className="chip-row" role="tablist" aria-label="Pages">
        {pages.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={c.id === pageId} className={`chip-btn${c.id === pageId ? ' chip-btn-on' : ''}`} onClick={() => choosePage(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="wob-summary" data-testid="wob-count" aria-live="polite">
        <strong>{visible.length}</strong> word{visible.length === 1 ? '' : 's'} visible on “{pageName}”
        {pageTiles.length > visible.length && <span className="muted"> · {pageTiles.length - visible.length} hidden</span>}
      </div>

      {Array.from({ length: nPages }, (_, page) => (
        <div key={page} className="wob-page">
          {nPages > 1 && <h3>Page {page + 1}</h3>}
          <div className="wob-grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: perPage }, (_, i) => {
              const slot = page * perPage + i;
              const t = map.get(slot);
              const isSel = selected === slot;
              if (!t)
                return (
                  <button
                    key={`e${slot}`}
                    type="button"
                    className={`tile-empty wob-empty${isSel ? ' wob-selected' : ''}`}
                    aria-pressed={isSel}
                    aria-label={`Empty spot ${slot + 1}`}
                    data-slot={slot}
                    onClick={() => {
                      setSelected(slot);
                      setSwapOpen(true);
                    }}
                  />
                );
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tile tile-${displayColor(t, settings)} wob-tile${t.hidden ? ' wob-hidden' : ''}${isSel ? ' wob-selected' : ''}`}
                  aria-pressed={isSel}
                  aria-label={`${t.label}: ${t.hidden ? 'hidden' : 'shown'}`}
                  data-wob={t.id}
                  data-slot={slot}
                  onClick={() => {
                    setSelected(isSel ? null : slot);
                    setSwapOpen(false);
                  }}
                >
                  <span className="tile-media">
                    <TileFace tile={t} photoUrl={t.photoId ? mediaUrls[t.photoId] : undefined} label={t.label} />
                  </span>
                  <span className="tile-label">
                    {t.hidden ? '(hidden) ' : ''}
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selected != null && (
        <div className="wob-actions" role="region" aria-label="Selected word" data-testid="wob-actions">
          <p>
            <strong>{selTile ? `“${selTile.label}”` : 'Empty spot'}</strong> — spot {selected + 1}
            {selTile?.hidden ? ' (hidden)' : ''}
          </p>
          <div className="row">
            {selTile && (
              <button type="button" className="btn" onClick={() => setHidden(selTile, !selTile.hidden)} data-testid="wob-toggle">
                <Icon name={selTile.hidden ? 'eye' : 'eye-off'} /> {selTile.hidden ? 'Show' : 'Hide'}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setSwapOpen((o) => !o)} aria-expanded={swapOpen} data-testid="wob-swap">
              <Icon name="swap" /> {selTile ? 'Swap for another word…' : 'Put a word here…'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
              Done
            </button>
          </div>
          {swapOpen && (
            <div className="wob-swap" data-testid="wob-swap-list">
              <label className="field">
                <span>Find a word</span>
                <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type to filter" />
              </label>
              {hiddenHere.filter(match).length > 0 && (
                <>
                  <h4>Hidden on this page</h4>
                  <div className="wob-cands">
                    {hiddenHere.filter(match).map((t) => (
                      <Candidate key={t.id} t={t} onPick={() => void swapIn(t)} url={t.photoId ? mediaUrls[t.photoId] : undefined} />
                    ))}
                  </div>
                </>
              )}
              <h4>From other pages</h4>
              <div className="wob-cands">
                {otherPages
                  .filter(match)
                  .slice(0, 60)
                  .map((t) => (
                    <Candidate key={t.id} t={t} onPick={() => void swapIn(t)} url={t.photoId ? mediaUrls[t.photoId] : undefined} note={pages.find((p) => p.id === t.categoryId)?.name} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {status && (
        <p className="wob-status" role="status" data-testid="wob-status">
          {status.text}{' '}
          {status.undo && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                status.undo?.();
                setStatus(null);
              }}
            >
              Undo
            </button>
          )}
        </p>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Hide"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </section>
  );
}

function Candidate({ t, onPick, url, note }: { t: Tile; onPick: () => void; url?: string; note?: string }) {
  return (
    <button type="button" className="wob-cand" onClick={onPick} data-cand={t.id} aria-label={`Use “${t.label}”${note ? ` (from ${note})` : ''}`}>
      <span className="wob-cand-pic">
        <TileFace tile={t} photoUrl={url} label={t.label} />
      </span>
      <span className="wob-cand-label">{t.label}</span>
      {note && <span className="wob-cand-note">{note}</span>}
    </button>
  );
}
