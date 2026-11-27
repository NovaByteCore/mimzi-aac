import { useMemo, useRef, useState } from 'react';

/** The parts of a pointer event Arrange words uses (structural, works with React's type). */
type ReactPointerEvent<T> = { button: number; clientX: number; clientY: number; pointerId: number; currentTarget: T };
import { useMimzi } from '../state/MimziStore';
import { useDialogFocus } from '../lib/useDialogFocus';
import { lastBoardGrid } from '../lib/autoGrid';
import { draftChanges, draftFor, moveInDraft, tileAt, type Draft } from '../lib/arrange';
import { TileFace } from '../components/TileFace';
import { Icon } from '../components/Icon';
import { displayColor } from '../lib/colors';
import { ConfirmDialog } from './ConfirmDialog';
import type { Tile } from '../types';

/**
 * Arrange words: a preview of the child's actual board (same rows × columns). Press and drag a
 * word to a new spot — or tap a word, then tap where it should go. Dropping on a word swaps the
 * two; dropping on an empty spot moves only that word. The destination is highlighted before
 * you let go. Nothing changes on the child's board until "Save".
 */
export function ArrangeWords({ categoryId, onClose }: { categoryId: string; onClose: () => void }) {
  const { tiles, categories, settings, mediaUrls, saveTileOrders } = useMimzi();
  const [pageId, setPageId] = useState(categoryId);
  const [draft, setDraft] = useState<Draft>(() => draftFor(tiles, categoryId));
  const [history, setHistory] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: string; from: number; x: number; y: number; active: boolean } | null>(null);
  const [status, setStatus] = useState('Drag a word to a new spot, or tap a word and then tap where it should go.');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const suppressClick = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const changes = useMemo(() => draftChanges(tiles, pageId, draft), [tiles, pageId, draft]);
  const cancel = () => (changes.length ? setConfirmCancel(true) : onClose());
  useDialogFocus(dialogRef, cancel);

  const grid = settings.layoutMode === 'fixed' ? settings.grid : lastBoardGrid(settings.grid);
  const per = grid.rows * grid.cols;
  const byId = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const maxSlot = Math.max(-1, ...draft.values());
  const nPages = Math.max(1, Math.floor(maxSlot / per) + 1);
  const pageName = categories.find((c) => c.id === pageId)?.name ?? '';
  const sortedCats = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);

  const label = (slot: number) => {
    const id = tileAt(draft, slot);
    return id ? `“${byId.get(id)?.label}”` : 'an empty spot';
  };

  const move = (from: number, to: number) => {
    if (from === to) return;
    const a = tileAt(draft, from);
    if (!a) return;
    const b = tileAt(draft, to);
    setHistory((h) => [...h, draft]);
    setDraft(moveInDraft(draft, from, to));
    setStatus(b ? `Swapped “${byId.get(a)?.label}” and “${byId.get(b)?.label}”.` : `Moved “${byId.get(a)?.label}” to spot ${to + 1}.`);
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setDraft(prev);
    setHistory((h) => h.slice(0, -1));
    setSelected(null);
    setStatus('Undone.');
  };

  const switchPage = (id: string) => {
    if (changes.length) {
      setStatus('Save or cancel the changes on this page first.');
      return;
    }
    setPageId(id);
    setDraft(draftFor(tiles, id));
    setHistory([]);
    setSelected(null);
  };

  const slotFromPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-arrange-slot]');
    return el ? Number(el.getAttribute('data-arrange-slot')) : null;
  };

  const onDown = (e: ReactPointerEvent<HTMLButtonElement>, id: string, slot: number) => {
    if (e.button !== 0) return;
    setDrag({ id, from: slot, x: e.clientX, y: e.clientY, active: false });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const far = Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8;
    if (!drag.active && !far) return;
    if (!drag.active) setDrag({ ...drag, active: true });
    setHover(slotFromPoint(e.clientX, e.clientY));
  };
  const onUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag?.active) {
      const to = slotFromPoint(e.clientX, e.clientY);
      if (to != null) move(drag.from, to);
      // Ignore the click the browser may send right after a drag (but never a later real tap).
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 60);
      setSelected(null);
    }
    setDrag(null);
    setHover(null);
  };

  const onCellClick = (slot: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (selected == null) {
      if (tileAt(draft, slot)) {
        setSelected(slot);
        setStatus(`${label(slot)} selected — now tap where it should go.`);
      }
      return;
    }
    if (selected === slot) {
      setSelected(null);
      setStatus('Nothing selected.');
      return;
    }
    move(selected, slot);
    setSelected(null);
  };

  const save = async () => {
    await saveTileOrders(changes);
    onClose();
  };


  return (
    <div className="modal-backdrop" role="presentation">
      <div ref={dialogRef} className="modal editor-modal arrange-words" role="dialog" aria-modal="true" aria-labelledby="aw-title" data-testid="arrange-words">
        <div className="arrange-head">
          <h2 id="aw-title">
            <Icon name="arrange" /> Arrange words — {pageName}
          </h2>
          <div className="row">
            <button type="button" className="btn" onClick={undo} disabled={!history.length} data-testid="arrange-undo">
              <Icon name="undo" /> Undo
            </button>
            <button type="button" className="btn btn-quiet" onClick={cancel} data-testid="arrange-cancel">
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!changes.length} data-testid="arrange-save">
              <Icon name="check" /> Save
            </button>
          </div>
        </div>
        <div className="chip-row" role="tablist" aria-label="Pages">
          {sortedCats.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === pageId} className={`chip-btn${c.id === pageId ? ' chip-btn-on' : ''}`} onClick={() => switchPage(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <p className="arrange-status" role="status" aria-live="polite" data-testid="arrange-status">
          {status}
          {changes.length > 0 && <span className="muted"> · {changes.length} word{changes.length === 1 ? '' : 's'} moved (not saved yet)</span>}
        </p>
        <p className="muted small">This is your child’s board as it looks on this tablet. Quick Words stay in their own bar and don’t move.</p>
        {Array.from({ length: nPages }, (_, page) => (
          <div key={page} className="arrange-page">
            {nPages > 1 && <h3>Page {page + 1}</h3>}
            <div className="board-grid arrange-grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(84px, auto))` }}>
              {Array.from({ length: per }, (_, i) => {
                const slot = page * per + i;
                const id = tileAt(draft, slot);
                const t: Tile | undefined = id ? byId.get(id) : undefined;
                const target = hover === slot && drag?.active && drag.from !== slot;
                const cls = `${target ? ' arrange-target' : ''}${selected === slot ? ' arrange-selected' : ''}${selected != null && selected !== slot ? ' arrange-can-drop' : ''}`;
                if (!t)
                  return (
                    <button key={`e${slot}`} type="button" className={`tile-empty arrange-empty${cls}`} data-arrange-slot={slot} aria-label={`Empty spot ${slot + 1}`} onClick={() => onCellClick(slot)} />
                  );
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`tile tile-${displayColor(t, settings)} arrange-tile${t.hidden ? ' wob-hidden' : ''}${cls}${drag?.active && drag.id === t.id ? ' arrange-dragging' : ''}`}
                    data-arrange-slot={slot}
                    data-arrange-tile={t.id}
                    aria-label={`${t.label}, spot ${slot + 1}${t.hidden ? ', hidden' : ''}${selected === slot ? ', selected' : ''}`}
                    aria-pressed={selected === slot}
                    onPointerDown={(e) => onDown(e, t.id, slot)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={() => {
                      setDrag(null);
                      setHover(null);
                    }}
                    onClick={() => onCellClick(slot)}
                  >
                    <span className="tile-media">
                      <TileFace tile={t} photoUrl={t.photoId ? mediaUrls[t.photoId] : undefined} label={t.label} />
                    </span>
                    <span className="tile-label">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {confirmCancel && (
        <ConfirmDialog
          title="Discard these moves?"
          message="The board will stay exactly as it was before you opened Arrange words."
          confirmLabel="Discard"
          danger
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => {
            setConfirmCancel(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}
