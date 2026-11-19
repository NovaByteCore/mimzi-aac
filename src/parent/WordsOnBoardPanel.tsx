import { useMemo, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { orderedTiles, pageCount, slotMap } from '../lib/grid';
import { ESSENTIAL_TILE_IDS, HOME_PAGE } from '../data/vocabulary';
import { TileFace } from '../components/TileFace';
import { ConfirmDialog } from './ConfirmDialog';
import { displayColor } from '../lib/colors';
import type { Tile } from '../types';

const PRESETS: (number | 'all')[] = [4, 6, 8, 12, 16, 20, 24, 30, 40, 'all'];

/**
 * Words on My Board — choose exactly which words a page shows. Hidden words keep their
 * slot, picture, voice, photo and sign, so nothing else moves and they come back unchanged.
 */
export function WordsOnBoardPanel() {
  const { tiles, categories, settings, mediaUrls, setTilesHidden } = useMimzi();
  const pages = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const [pageId, setPageId] = useState(HOME_PAGE);
  const [target, setTarget] = useState<number | 'all' | null>(null);
  const [custom, setCustom] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; message: string; run: () => void } | null>(null);

  const pageTiles = orderedTiles(tiles, pageId);
  const visible = pageTiles.filter((t) => !t.hidden);
  const perPage = settings.grid.rows * settings.grid.cols;
  const nPages = pageCount(pageTiles, settings.grid);
  const map = slotMap(pageTiles);

  const toggle = (t: Tile) => {
    if (!t.hidden && ESSENTIAL_TILE_IDS.includes(t.id)) {
      setConfirm({
        title: `Hide “${t.label}”?`,
        message: `“${t.label}” is important for asking for help or saying no. It will still be in the quick bar if it’s there, but it won’t be on this page. Hide it anyway?`,
        run: () => void setTilesHidden([t.id], true),
      });
      return;
    }
    void setTilesHidden([t.id], !t.hidden);
  };

  const keepFirst = (n: number) => {
    // Deterministic: keeps the first n words by board position (top-left first). Never random.
    const ordered = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
    const keep = new Set(ordered.slice(0, n).map((t) => t.id));
    const hideIds = ordered.filter((t) => !keep.has(t.id) && !t.hidden).map((t) => t.id);
    const showIds = ordered.filter((t) => keep.has(t.id) && t.hidden).map((t) => t.id);
    const essential = hideIds.filter((id) => ESSENTIAL_TILE_IDS.includes(id));
    const run = async () => {
      if (hideIds.length) await setTilesHidden(hideIds, true);
      if (showIds.length) await setTilesHidden(showIds, false);
    };
    if (essential.length) {
      setConfirm({
        title: 'Hide important words?',
        message: `This would hide ${essential.map((id) => `“${tiles.find((t) => t.id === id)?.label}”`).join(', ')}. You can tap them afterwards to bring them back.`,
        run: () => void run(),
      });
    } else void run();
  };

  const targetN = target === 'all' ? pageTiles.length : target;

  return (
    <section className="panel">
      <h2>Words on My Board</h2>
      <p className="muted">
        Choose exactly which words your child sees. Tap a word to hide or show it. Hidden words keep their spot, picture, voice, photo and sign —
        nothing else moves, so your child’s motor memory stays the same.
      </p>

      <div className="chip-row" role="tablist" aria-label="Pages">
        {pages.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={c.id === pageId} className={`chip-btn${c.id === pageId ? ' chip-btn-on' : ''}`} onClick={() => setPageId(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="wob-summary" data-testid="wob-count">
        Showing <strong>{visible.length}</strong> of {pageTiles.length} buttons on “{pages.find((p) => p.id === pageId)?.name}”
        {targetN != null && (
          <>
            {' '}
            · goal <strong>{targetN}</strong>
            {visible.length > targetN && <span className="form-error"> — tap {visible.length - targetN} more to hide</span>}
            {visible.length < targetN && <span className="muted"> — tap {targetN - visible.length} more to show</span>}
            {visible.length === targetN && <span> ✓</span>}
          </>
        )}
      </div>

      <div className="row">
        <span className="muted small">How many words?</span>
        {PRESETS.map((p) => (
          <button key={String(p)} type="button" className={`chip-btn${target === p ? ' chip-btn-on' : ''}`} onClick={() => setTarget(p)}>
            {p === 'all' ? 'All' : p}
          </button>
        ))}
        <label className="field inline compact">
          <span className="sr-only">Custom number</span>
          <input type="number" min={1} max={200} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom" style={{ width: '6em' }} />
        </label>
        <button type="button" className="btn small" disabled={!Number(custom)} onClick={() => setTarget(Math.max(1, Math.round(Number(custom))))}>
          Set
        </button>
      </div>
      {target != null && (
        <div className="row">
          {target === 'all' ? (
            <button type="button" className="btn" onClick={() => void setTilesHidden(pageTiles.filter((t) => t.hidden).map((t) => t.id), false)}>
              Show every word on this page
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => keepFirst(target)}>
              Show the first {target} by position (top-left first)
            </button>
          )}
          <span className="muted small">…or tap words below to choose them yourself.</span>
        </div>
      )}

      {Array.from({ length: nPages }, (_, page) => (
        <div key={page} className="wob-page">
          {nPages > 1 && <h3>Page {page + 1}</h3>}
          <div className="wob-grid" style={{ gridTemplateColumns: `repeat(${settings.grid.cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: perPage }, (_, i) => {
              const t = map.get(page * perPage + i);
              if (!t) return <div key={i} className="tile-empty wob-empty" />;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tile tile-${displayColor(t, settings)} wob-tile${t.hidden ? ' wob-hidden' : ''}`}
                  aria-pressed={!t.hidden}
                  aria-label={`${t.label}: ${t.hidden ? 'hidden' : 'shown'}`}
                  data-wob={t.id}
                  onClick={() => toggle(t)}
                >
                  <span className="tile-media">
                    <TileFace symbol={t.symbol} photoUrl={t.photoId ? mediaUrls[t.photoId] : undefined} label={t.label} />
                  </span>
                  <span className="tile-label">
                    {t.hidden ? '🙈 ' : ''}
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

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
