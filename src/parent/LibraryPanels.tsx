import { useMemo, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { SymbolSearch } from './SymbolSearch';
import { TileFace } from '../components/TileFace';
import { TileEditor } from './TileEditor';
import { AslSignSvg, ASL_KEYS, ASL_SIGNS } from '../data/aslSigns';
import type { Tile } from '../types';

function useEditor() {
  const { categories } = useMimzi();
  const [editing, setEditing] = useState<Tile | null>(null);
  const sorted = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const editor = editing ? <TileEditor tile={editing} defaultCategoryId={editing.categoryId} categories={sorted} onClose={() => setEditing(null)} /> : null;
  return { setEditing, editor };
}

/** Symbol Library — search all Mulberry symbols and put one on a word. */
export function SymbolLibraryPanel() {
  const { tiles, saveTile } = useMimzi();
  const [symbol, setSymbol] = useState('');
  const [target, setTarget] = useState('');
  const [status, setStatus] = useState('');
  const words = tiles.filter((t) => !t.deletedAt).sort((a, b) => a.label.localeCompare(b.label));
  return (
    <section className="panel">
      <h2>Symbol Library</h2>
      <p className="muted">
        About 3,400 AAC symbols from the Mulberry Symbols set, saved with Mimzi for offline use. Search, pick one, then choose which word gets it.
        Choosing a symbol never moves the word or changes what it says.
      </p>
      <SymbolSearch selected={symbol} onPick={setSymbol} />
      {symbol && (
        <div className="add-row">
          <span className="mini-tile big tile-white">
            <TileFace symbol={symbol} label="" />
          </span>
          <label className="field inline">
            <span>Put this symbol on</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="library-target">
              <option value="">Choose a word…</option>
              {words.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!target}
            onClick={async () => {
              const t = tiles.find((x) => x.id === target);
              if (!t) return;
              await saveTile({ ...t, symbol });
              setStatus(`“${t.label}” now uses this symbol${t.photoId ? ' (its photo still shows first — remove the photo to see the symbol)' : ''}.`);
            }}
          >
            Use symbol
          </button>
        </div>
      )}
      {status && <p role="status">{status}</p>}
      <h3>Credits</h3>
      <p className="muted small">
        Mulberry Symbols © 2018–2026 Steve Lee, licensed CC BY-SA 4.0 — mulberrysymbols.org. Some core-word symbols (stop, yes, no, me, you, please,
        thank you, and others) are original Mimzi drawings because Mulberry doesn’t include them.
      </p>
    </section>
  );
}

/** Photo Library — every photo saved in Mimzi and the word it belongs to. */
export function PhotoLibraryPanel() {
  const { tiles, mediaUrls } = useMimzi();
  const { setEditing, editor } = useEditor();
  const withPhotos = tiles.filter((t) => t.photoId && mediaUrls[t.photoId] && !t.deletedAt);
  return (
    <section className="panel">
      <h2>Photo Library</h2>
      <p className="muted">Real photos on your child’s words. Photos stay on this device (and in your Google Drive if sync is on). Tap one to change or remove it.</p>
      {withPhotos.length === 0 ? (
        <p className="muted">No photos yet. Edit any word and use “Take photo”, “Choose photo” or “From Google Photos”.</p>
      ) : (
        <div className="picker-grid">
          {withPhotos.map((t) => (
            <button key={t.id} type="button" className="tile tile-white picker-tile tile-has-photo" onClick={() => setEditing(t)} aria-label={`Edit photo for ${t.label}`}>
              <span className="tile-media">
                <TileFace photoUrl={mediaUrls[t.photoId!]} label={t.label} />
              </span>
              <span className="tile-label">{t.label}</span>
            </button>
          ))}
        </div>
      )}
      {editor}
    </section>
  );
}

/** ASL Library — the ASL drawings and the family's own sign videos. */
export function AslLibraryPanel() {
  const { tiles, settings, updateSettings } = useMimzi();
  const { setEditing, editor } = useEditor();
  const withVideo = tiles.filter((t) => t.signId && !t.deletedAt);
  return (
    <section className="panel">
      <h2>ASL Library</h2>
      <p className="muted">
        Signs appear only when someone taps the small 🤟 “See sign” button. The main button always keeps its AAC picture, and signs never interrupt
        the voice. The drawings were checked against the linked ASL references; a video of a real signer (yours, or one you have permission to
        use) is the best way to learn a sign — add one to any word.
      </p>
      <label className="check">
        <input type="checkbox" checked={settings.showSignButtons} onChange={(e) => updateSettings({ showSignButtons: e.target.checked })} />
        Show “See sign” buttons on the board
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.showAslDrawings} onChange={(e) => updateSettings({ showAslDrawings: e.target.checked })} />
        Offer Mimzi’s ASL drawings for words without a video
      </label>
      <h3>Your sign videos ({withVideo.length})</h3>
      {withVideo.length === 0 ? (
        <p className="muted">None yet. Edit a word → “Add sign video”.</p>
      ) : (
        <ul className="grow-list">
          {withVideo.map((t) => (
            <li key={t.id}>
              <strong>{t.label}</strong>
              <span className="spacer" />
              <button type="button" className="btn small" onClick={() => setEditing(t)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>ASL drawings ({ASL_KEYS.length})</h3>
      <div className="asl-library">
        {ASL_KEYS.map((k) => {
          const s = ASL_SIGNS[k];
          const used = tiles.filter((t) => t.aslSign === k && !t.deletedAt).map((t) => t.label);
          return (
            <div key={k} className="asl-card">
              <AslSignSvg name={k} />
              <div>
                <strong>{s.gloss}</strong>
                <p className="small">{s.how}</p>
                <p className="muted small">
                  On: {used.length ? [...new Set(used)].join(', ') : '—'} ·{' '}
                  <a href={s.source} target="_blank" rel="noopener noreferrer">
                    Reference
                  </a>
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {editor}
    </section>
  );
}
