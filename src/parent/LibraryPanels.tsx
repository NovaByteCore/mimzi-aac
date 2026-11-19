import { useMemo, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { SymbolSearch } from './SymbolSearch';
import { TileFace } from '../components/TileFace';
import { TileEditor } from './TileEditor';
import { AslSignSvg, ASL_KEYS, ASL_SIGNS } from '../data/aslSigns';
import type { SymbolInfo, Tile } from '../types';
import { effectiveStyle, libraryAllowed, librariesInUse, LIBRARIES } from '../lib/symbols';

function useEditor() {
  const { categories } = useMimzi();
  const [editing, setEditing] = useState<Tile | null>(null);
  const sorted = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const editor = editing ? <TileEditor tile={editing} defaultCategoryId={editing.categoryId} categories={sorted} onClose={() => setEditing(null)} /> : null;
  return { setEditing, editor };
}

/** Symbol Library — default picture style, every library, and full credits. */
export function SymbolLibraryPanel() {
  const { tiles, settings, updateSettings, setTileSymbol, symbols, findSymbols } = useMimzi();
  const [picked, setPicked] = useState<{ symbol: string; info: SymbolInfo } | null>(null);
  const [target, setTarget] = useState('');
  const [status, setStatus] = useState('');
  const words = tiles.filter((t) => !t.deletedAt).sort((a, b) => a.label.localeCompare(b.label));
  const style = effectiveStyle(settings);
  const arasaacOn = libraryAllowed('arasaac');
  const starters = tiles.filter((t) => t.symbolAuto && !t.deletedAt);
  const ready = starters.filter((t) => t.autoArasaac).length;
  const credits = librariesInUse(tiles, settings);
  return (
    <section className="panel">
      <h2>Symbol Library</h2>
      <p className="muted">
        Mimzi shows a real AAC symbol on every starter word. Choose the default style below, or give any single word a different symbol (or a photo).
        Changing a picture never moves the word, changes what it says, or removes its ASL sign.
      </p>

      <h3>Default picture style</h3>
      <div className="row" role="radiogroup" aria-label="Default picture style">
        <label className="check">
          <input
            type="radio"
            name="symbol-style"
            checked={style === 'arasaac'}
            disabled={!arasaacOn}
            onChange={() => updateSettings({ symbolStyle: 'arasaac' })}
            data-testid="style-arasaac"
          />
          ARASAAC (recommended) — clear, colourful pictograms used by AAC apps worldwide
        </label>
        <label className="check">
          <input type="radio" name="symbol-style" checked={style === 'mulberry'} onChange={() => updateSettings({ symbolStyle: 'mulberry' })} data-testid="style-mulberry" />
          Mulberry — simple line-and-colour symbols, built into Mimzi
        </label>
      </div>
      {!arasaacOn && <p className="muted small">ARASAAC is off because this copy of Mimzi is set up for commercial use; its licence is non-commercial only.</p>}
      {style === 'arasaac' && (
        <p className="muted small" data-testid="symbol-status">
          {symbols.phase === 'finding'
            ? `Finding ARASAAC pictures… ${ready} of ${starters.length} ready.`
            : symbols.phase === 'offline'
              ? `${ready} of ${starters.length} ARASAAC pictures ready. The rest download next time this device is online — until then they show the built-in picture.`
              : `${ready} of ${starters.length} starter words have their ARASAAC picture, saved for offline use.`}
          {symbols.missing.length > 0 && ` ARASAAC has no match for ${symbols.missing.length} (they keep the built-in picture).`}{' '}
          {symbols.phase !== 'finding' && ready < starters.length && (
            <button type="button" className="btn btn-quiet small" onClick={() => findSymbols()}>
              Try again
            </button>
          )}
        </p>
      )}

      <h3>Find a symbol</h3>
      <SymbolSearch selected={picked?.symbol} onPick={(symbol, info) => setPicked({ symbol, info })} />
      {picked && (
        <div className="add-row">
          <span className="mini-tile big tile-white">
            <TileFace symbol={picked.symbol} symbolInfo={picked.info} label="" />
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
              await setTileSymbol(t.id, picked);
              setStatus(`“${t.label}” now uses this symbol${t.photoId ? ' (its photo still shows first — remove the photo to see the symbol)' : ''}.`);
            }}
          >
            Use symbol
          </button>
        </div>
      )}
      {status && <p role="status">{status}</p>}

      <h3>Credits &amp; licences</h3>
      <ul className="credits" data-testid="symbol-credits">
        {credits.map(({ info, count }) => (
          <li key={`${info.library}:${info.repo ?? ''}:${info.author}:${info.license}`}>
            <strong>{info.library === 'opensymbols' ? `${info.repo} (via OpenSymbols)` : LIBRARIES[info.library].name}</strong> — {count} word{count === 1 ? '' : 's'}
            <br />
            <span className="muted small">
              {info.library === 'opensymbols' ? `${info.author ? `By ${info.author}. ` : ''}Licence: ${info.license}.` : LIBRARIES[info.library].credit}{' '}
              {(info.licenseUrl || (info.library !== 'opensymbols' && LIBRARIES[info.library].licenseUrl)) && (
                <a href={info.licenseUrl || (info.library !== 'opensymbols' ? LIBRARIES[info.library].licenseUrl : '')} target="_blank" rel="noreferrer">
                  Licence
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        ARASAAC pictograms are by Sergio Palao for ARASAAC (Government of Aragón, Spain), CC BY-NC-SA 4.0: free for personal, non-commercial use like this
        one. If Mimzi is ever used commercially, set VITE_COMMERCIAL_USE=true and ARASAAC and other non-commercial symbols switch off automatically.
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
        Signs appear only when someone taps the small “ASL” button in the corner of the word’s label. The main button always keeps its AAC picture, and signs never interrupt
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
