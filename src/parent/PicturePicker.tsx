import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { config } from '../config';
import { SYMBOL_KEYS } from '../data/symbols';
import { searchArasaac } from '../lib/arasaac';
import { bundledInfo, libraryAllowed, LIBRARIES, licenseFlags, type LibraryId } from '../lib/symbols';
import { addRecentPicture, getRecentPictures, onRecentPictures, type RecentPicture } from '../lib/recentPictures';
import { everydayPictures } from '../lib/pictureSets';
import { useDialogFocus } from '../lib/useDialogFocus';
import { newId } from '../lib/id';
import { useMimzi } from '../state/MimziStore';
import { allScheduleItems } from '../lib/myday';
import { TileFace } from '../components/TileFace';
import { Icon } from '../components/Icon';
import { PhotoCropper } from './PhotoCropper';
import { GooglePhotosButton } from './GooglePhotosButton';
import { loadSymbolIndex, openSymbolResults, searchSymbols, type PickResult, type SymbolEntry } from './SymbolSearch';
import type { MediaRecord, SymbolInfo } from '../types';

/** What the grown-up chose. */
export type PickedPicture = { kind: 'symbol'; symbol: string; info: SymbolInfo } | { kind: 'photo'; photoId: string; media?: MediaRecord };

interface Candidate {
  symbol: string;
  name: string;
  info: SymbolInfo;
  /** Other libraries' versions of the same picture idea (grouped duplicates). */
  others?: Candidate[];
}

const LIB_ORDER: LibraryId[] = ['arasaac', 'mimzi', 'mulberry', 'opensymbols'];
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '');

/** Merge results from every library; the same idea from several libraries becomes one choice. */
export function groupResults(query: string, lists: Candidate[][]): Candidate[] {
  const q = norm(query);
  const rank = (c: Candidate) => {
    const n = norm(c.name);
    return n === q ? 0 : n.startsWith(q) ? 1 : n.split(' ').includes(q) ? 2 : 3;
  };
  const groups = new Map<string, Candidate[]>();
  for (const list of lists) {
    for (const c of list) {
      const k = norm(c.name) || c.symbol;
      const g = groups.get(k) ?? [];
      if (!g.some((x) => x.symbol === c.symbol)) g.push(c);
      groups.set(k, g);
    }
  }
  const out: Candidate[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => LIB_ORDER.indexOf(a.info.library) - LIB_ORDER.indexOf(b.info.library));
    out.push({ ...g[0], others: g.slice(1) });
  }
  return out.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length).slice(0, 48);
}

function sourceName(info: SymbolInfo): string {
  return info.library === 'opensymbols' ? `OpenSymbols (${info.repo ?? ''})` : LIBRARIES[info.library].name;
}

function Credit({ info }: { info: SymbolInfo }) {
  const f = licenseFlags(info.license);
  return (
    <p className="picker-credit muted small" data-testid="picture-credit">
      {sourceName(info)}
      {info.author ? ` · ${info.author}` : ''} · {info.license}
      {f.nonCommercial ? ' (non-commercial)' : ''}
    </p>
  );
}

/**
 * One picture picker for every AAC tile and My Day card. Recent and Saved pictures come
 * first, then one "Search pictures" box that searches every library this copy of Mimzi can
 * use, with duplicates grouped. Library filters are optional. Tap a picture to preview it,
 * then "Use picture". Choosing a picture never changes the word, speech, recording or spot.
 */
export function PicturePicker({
  title,
  suggest = '',
  onUse,
  onCancel,
  extraUrls,
  inline = false,
  allowPhoto = true,
  showBack = true,
}: {
  title?: string;
  suggest?: string;
  onUse: (p: PickedPicture) => void;
  onCancel: () => void;
  /** Photo URLs from the current editing session (not saved yet). */
  extraUrls?: Record<string, string>;
  /** Render inside another dialog (quick My Day editor) instead of as its own dialog. */
  inline?: boolean;
  allowPhoto?: boolean;
  /** Inline only: show the "Back" button (off where the picker is part of a page). */
  showBack?: boolean;
}) {
  const { mediaUrls: storeUrls, mediaMime, myDay } = useMimzi();
  const mediaUrls = useMemo(() => ({ ...storeUrls, ...(extraUrls ?? {}) }), [storeUrls, extraUrls]);
  const [recent, setRecent] = useState<RecentPicture[]>([]);
  const [typed, setTyped] = useState('');
  const q = typed.trim();
  const [index, setIndex] = useState<SymbolEntry[] | null>(null);
  const [aras, setAras] = useState<{ q: string; results: Candidate[]; error?: 'offline' | 'error' } | null>(null);
  const [os, setOs] = useState<{ q: string; results: Candidate[] } | null>(null);
  const [libs, setLibs] = useState<Record<LibraryId, boolean>>({ arasaac: true, mulberry: true, mimzi: true, opensymbols: true });
  const [chosen, setChosen] = useState<(Candidate & { photoId?: string; media?: MediaRecord }) | null>(null);
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Only a stand-alone picker manages focus (inside the quick editor, that dialog does).
  useDialogFocus(inline ? { current: null } : dialogRef, inline ? undefined : onCancel);

  const arasaacOn = libraryAllowed('arasaac');
  const osOn = Boolean(config.openSymbolsUrl); // hidden where there's no server (Pages, APK)
  const available: LibraryId[] = LIB_ORDER.filter((l) => (l === 'arasaac' ? arasaacOn : l === 'opensymbols' ? osOn : true));

  useEffect(() => {
    let alive = true;
    void getRecentPictures().then((r) => alive && setRecent(r));
    const off = onRecentPictures(setRecent);
    loadSymbolIndex().then(
      (i) => alive && setIndex(i),
      () => undefined,
    );
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q) return;
    timer.current = setTimeout(() => {
      if (arasaacOn && aras?.q !== q)
        searchArasaac(q).then(
          (rs) => setAras({ q, results: rs.map((r) => ({ symbol: r.symbol, name: r.name, info: r.info })) }),
          () => setAras({ q, results: [], error: navigator.onLine === false ? 'offline' : 'error' }),
        );
      if (osOn && os?.q !== q)
        fetch(`${config.openSymbolsUrl}?q=${encodeURIComponent(q)}&locale=en`, { credentials: 'same-origin' })
          .then(async (res) => setOs({ q, results: res.ok ? openSymbolResults(await res.json()).map((r: PickResult) => ({ symbol: r.symbol, name: r.name, info: r.info })) : [] }))
          .catch(() => setOs({ q, results: [] }));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    if (!q) return [];
    const ql = q.toLowerCase();
    const mul: Candidate[] = index ? searchSymbols(index, q, 30).map((e) => ({ symbol: `mul:${e.n}`, name: e.l, info: { ...bundledInfo(`mul:${e.n}`)!, name: e.l } })) : [];
    const mimzi: Candidate[] = SYMBOL_KEYS.filter((k) => k.replace(/-/g, ' ').includes(ql) || ql.includes(k.replace(/-/g, ' '))).map((k) => ({
      symbol: `svg:${k}`,
      name: k.replace(/-/g, ' '),
      info: bundledInfo(`svg:${k}`)!,
    }));
    const everyday = everydayPictures()
      .filter((p) => p.label.toLowerCase().includes(ql))
      .map((p) => ({ symbol: p.symbol, name: p.label, info: p.info }));
    const lists: Candidate[][] = [
      libs.arasaac && arasaacOn ? [...(aras?.q === q ? aras.results : []), ...everyday] : [],
      libs.mimzi ? mimzi : [],
      libs.mulberry ? mul : [],
      libs.opensymbols && osOn && os?.q === q ? os.results : [],
    ];
    return groupResults(q, lists);
  }, [q, index, aras, os, libs, arasaacOn, osOn]);

  const saved = useMemo(() => {
    const photos = Object.keys(mediaUrls).filter((id) => (mediaMime[id] ?? 'image/').startsWith('image/'));
    const symbols = new Map<string, SymbolInfo>();
    for (const i of allScheduleItems(myDay)) if (i.symbol && i.symbolInfo) symbols.set(i.symbol, i.symbolInfo);
    for (const p of everydayPictures()) if (!symbols.has(p.symbol)) symbols.set(p.symbol, p.info);
    return { photos, symbols: [...symbols].map(([symbol, info]) => ({ symbol, info, name: info.name })) };
  }, [mediaUrls, mediaMime, myDay]);

  const use = () => {
    if (!chosen) return;
    if (chosen.photoId) onUse({ kind: 'photo', photoId: chosen.photoId, media: chosen.media });
    else {
      void addRecentPicture(chosen.symbol, chosen.info);
      onUse({ kind: 'symbol', symbol: chosen.symbol, info: chosen.info });
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f && f.type.startsWith('image/')) setCropFile(f);
  };

  const pick = (c: Candidate) => setChosen(c);
  // A newly taken photo is previewed from its blob (released when it changes).
  const previewUrl = useMemo(() => (chosen?.media ? URL.createObjectURL(chosen.media.blob) : undefined), [chosen?.media]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  const isOn = (symbol: string) => chosen?.symbol === symbol && !chosen.photoId;

  const choice = (c: Candidate, key: string) => (
    <button
      key={key}
      type="button"
      className={`picker-choice${isOn(c.symbol) ? ' picker-on' : ''}`}
      aria-pressed={isOn(c.symbol)}
      aria-label={`${c.name}${c.others?.length ? ` (${c.others.length + 1} styles)` : ''}`}
      onClick={() => pick(c)}
      data-symbol={c.symbol}
    >
      <span className="picker-pic">
        <TileFace symbol={c.symbol} symbolInfo={c.info} label={c.name} />
      </span>
      <span className="picker-name">{c.name}</span>
      {c.others && c.others.length > 0 && <span className="picker-more">+{c.others.length}</span>}
    </button>
  );

  const body: ReactNode = (
    <>
      {/* Preview, then "Use picture" */}
      <div className="picker-preview" data-testid="picture-preview" aria-live="polite">
        {chosen ? (
          <>
            <span className="picker-preview-pic">
              {chosen.photoId ? <img className="tile-photo" src={previewUrl ?? mediaUrls[chosen.photoId]} alt="" /> : <TileFace symbol={chosen.symbol} symbolInfo={chosen.info} label={chosen.name} />}
            </span>
            <div className="picker-preview-text">
              <strong>{chosen.name}</strong>
              {!chosen.photoId && <Credit info={chosen.info} />}
              {chosen.others && chosen.others.length > 0 && (
                <div className="picker-styles" role="group" aria-label="Other styles">
                  {[{ ...chosen, others: undefined }, ...chosen.others].map((o) => (
                    <button key={o.symbol} type="button" className={`picker-style${o.symbol === chosen.symbol ? ' picker-on' : ''}`} onClick={() => setChosen({ ...o, others: chosen.others && [chosen, ...chosen.others].filter((x) => x.symbol !== o.symbol).map((x) => ({ ...x, others: undefined })) })} aria-label={`${o.name} — ${sourceName(o.info)}`}>
                      <TileFace symbol={o.symbol} symbolInfo={o.info} label={o.name} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="muted">Tap a picture to see it here.</p>
        )}
        <button type="button" className="btn btn-primary picker-use" disabled={!chosen} onClick={use} data-testid="use-picture">
          <Icon name="check" /> Use picture
        </button>
      </div>

      {recent.length > 0 && (
        <section className="picker-section" aria-label="Recent pictures" data-testid="picker-recent">
          <h3>Recent</h3>
          <div className="picker-row">{recent.slice(0, 12).map((r) => choice({ symbol: r.symbol, name: r.info.name, info: r.info }, `r-${r.symbol}`))}</div>
        </section>
      )}

      <section className="picker-section" aria-label="Saved pictures" data-testid="picker-saved">
        <h3>Saved</h3>
        <div className="picker-row">
          {saved.photos.map((id) => (
            <button
              key={`p-${id}`}
              type="button"
              className={`picker-choice${chosen?.photoId === id ? ' picker-on' : ''}`}
              aria-pressed={chosen?.photoId === id}
              aria-label="Saved photo"
              onClick={() => setChosen({ symbol: `photo:${id}`, name: 'Photo', info: bundledInfo('svg:help')!, photoId: id })}
            >
              <span className="picker-pic">
                <img className="tile-photo" src={mediaUrls[id]} alt="" />
              </span>
              <span className="picker-name">Photo</span>
            </button>
          ))}
          {saved.symbols.map((s) => choice(s, `s-${s.symbol}`))}
        </div>
      </section>

      <section className="picker-section" aria-label="Search pictures">
        <label className="field picker-search">
          <span>
            <Icon name="search" /> Search pictures
          </span>
          <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={suggest ? `e.g. ${suggest}` : 'e.g. bubbles, park, bath'} data-testid="picture-search" />
        </label>
        <details className="picker-filter" data-testid="library-filter">
          <summary>
            <Icon name="filter" /> Filter by library
          </summary>
          <div className="row">
            {available.map((l) => (
              <label key={l} className="check">
                <input type="checkbox" checked={libs[l]} onChange={(e) => setLibs((s) => ({ ...s, [l]: e.target.checked }))} data-testid={`lib-${l}`} />
                {l === 'opensymbols' ? 'OpenSymbols' : LIBRARIES[l].name}
              </label>
            ))}
          </div>
        </details>
        {q && aras?.q === q && aras.error === 'offline' && (
          <p className="muted small" data-testid="arasaac-offline">
            Searching ARASAAC needs the internet. Recent, Saved and the pictures built into Mimzi still work offline.
          </p>
        )}
        {q && (
          <div className="picker-row picker-results" data-testid="picture-results">
            {results.map((c) => choice(c, `q-${c.symbol}`))}
            {results.length === 0 && <p className="muted">No pictures match “{q}” yet. Try a simpler word{allowPhoto ? ' or use a photo' : ''}.</p>}
          </div>
        )}
      </section>

      {allowPhoto && (
        <section className="picker-section picker-photo" aria-label="Use a photo">
          <button type="button" className="btn big-btn" onClick={() => setPhotoOpen((o) => !o)} aria-expanded={photoOpen} data-testid="use-photo">
            <Icon name="camera" /> Use a photo
          </button>
          {photoOpen && (
            <div className="photo-sources">
              <button type="button" className="btn" onClick={() => camera.current?.click()}>
                <Icon name="camera" /> Take a photo
              </button>
              <button type="button" className="btn" onClick={() => upload.current?.click()}>
                <Icon name="image" /> Choose a photo
              </button>
              <GooglePhotosButton onPicked={(blob) => setCropFile(blob)} />
              <p className="muted small">Photos stay on this device (and in your own Google Drive if sync is on).</p>
            </div>
          )}
          <input ref={upload} type="file" accept="image/*" hidden onChange={onFile} data-testid="picker-photo-input" />
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onFile} data-testid="picker-camera-input" />
        </section>
      )}

      {cropFile && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Position photo">
            <PhotoCropper
              file={cropFile}
              onCancel={() => setCropFile(null)}
              onDone={(blob) => {
                const id = newId('photo');
                setCropFile(null);
                setChosen({ symbol: `photo:${id}`, name: 'Your photo', info: bundledInfo('svg:help')!, photoId: id, media: { id, kind: 'photo', mime: blob.type || 'image/jpeg', blob, createdAt: Date.now() } });
              }}
            />
          </div>
        </div>
      )}
    </>
  );

  if (inline)
    return (
      <div className="picture-picker picture-picker-inline" data-testid="picture-picker">
        {title && <h3>{title}</h3>}
        {body}
        {showBack && (
          <div className="modal-actions">
            <button type="button" className="btn btn-quiet" onClick={onCancel}>
              Back
            </button>
          </div>
        )}
      </div>
    );

  return (
    <div className="modal-backdrop" role="presentation">
      <div ref={dialogRef} className="modal editor-modal picture-picker" role="dialog" aria-modal="true" aria-labelledby="pp-title" data-testid="picture-picker">
        <h2 id="pp-title">{title ?? 'Choose a picture'}</h2>
        {body}
        <div className="modal-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel} data-autofocus>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
