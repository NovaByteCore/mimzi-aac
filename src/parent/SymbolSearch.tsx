import { useEffect, useMemo, useRef, useState } from 'react';
import { config } from '../config';
import { SYMBOL_KEYS } from '../data/symbols';
import { searchArasaac } from '../lib/arasaac';
import { bundledInfo, libraryAllowed, licenseAllowed, licenseFlags, LIBRARIES, mulberryUrl, type LibraryId } from '../lib/symbols';
import { TileFace } from '../components/TileFace';
import type { SymbolInfo } from '../types';

export interface SymbolEntry {
  n: string; // file name
  l: string; // label
  c: string; // category
  t: string; // tags
}

let indexPromise: Promise<SymbolEntry[]> | null = null;

/** The Mulberry Symbols index (loaded once, cached by the service worker for offline use). */
export function loadSymbolIndex(): Promise<SymbolEntry[]> {
  if (!indexPromise) {
    const base = ((import.meta.env ?? {}) as { BASE_URL?: string }).BASE_URL ?? '/';
    indexPromise = fetch(`${base}symbols/mulberry-index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<SymbolEntry[]>;
      })
      .catch((e) => {
        indexPromise = null;
        throw e;
      });
  }
  return indexPromise;
}

export function searchSymbols(index: SymbolEntry[], query: string, limit = 60): SymbolEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: [number, SymbolEntry][] = [];
  for (const e of index) {
    const label = e.l.toLowerCase();
    let score = -1;
    if (label === q) score = 0;
    else if (label.startsWith(q)) score = 1;
    else if (label.split(/\s+/).includes(q)) score = 2;
    else if (label.includes(q)) score = 3;
    else if (e.t.toLowerCase().split(/\s+/).includes(q)) score = 4;
    else if (e.c.toLowerCase().includes(q)) score = 5;
    if (score >= 0) scored.push([score * 1000 + label.length, e]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, e]) => e);
}

/** One search result from any library. */
export interface PickResult {
  symbol: string;
  name: string;
  info: SymbolInfo;
  /** Stable id for tests / selection (Mulberry file name, or the symbol reference). */
  key: string;
}

interface OpenSymbolRow {
  id: string;
  repo: string;
  name: string;
  url: string;
  author: string;
  authorUrl?: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
}

/** Turn OpenSymbols rows into picker results, dropping anything this deployment may not use. */
export function openSymbolResults(rows: OpenSymbolRow[], commercialUse = config.commercialUse): PickResult[] {
  return rows
    .map((r) => {
      const info: SymbolInfo = {
        library: 'opensymbols',
        repo: r.repo,
        id: r.id,
        name: r.name,
        url: r.url,
        author: r.author,
        authorUrl: r.authorUrl,
        license: r.license,
        licenseUrl: r.licenseUrl,
        sourceUrl: r.sourceUrl,
      };
      return { symbol: `os:${r.repo}:${r.id}`, name: r.name, info, key: `os:${r.repo}:${r.id}` };
    })
    .filter((r) => licenseAllowed(r.info, commercialUse));
}

type Source = 'all' | LibraryId;
type OsState = 'idle' | 'loading' | 'ready' | 'not-configured' | 'error';

interface Props {
  /** Search shown before the grown-up types anything (e.g. the word's label). */
  suggest?: string;
  initialQuery?: string;
  selected?: string;
  onPick: (symbol: string, info: SymbolInfo) => void;
}

const SOURCES: { id: Source; label: string }[] = [
  { id: 'all', label: 'All libraries' },
  { id: 'arasaac', label: 'ARASAAC' },
  { id: 'mulberry', label: 'Mulberry' },
  { id: 'mimzi', label: 'Mimzi originals' },
  { id: 'opensymbols', label: 'More (OpenSymbols)' },
];

function LicenseBadge({ info }: { info: SymbolInfo }) {
  const f = licenseFlags(info.license);
  return (
    <span className="symbol-license" title={`${info.license}${info.author ? ` · ${info.author}` : ''}`}>
      {info.library === 'opensymbols' ? info.repo : LIBRARIES[info.library].name}
      {f.nonCommercial && <span className="nc-badge"> · non-commercial</span>}
    </span>
  );
}

/**
 * AAC symbol picker across libraries: ARASAAC (default style, searched online and saved
 * for offline once chosen), Mulberry (bundled), Mimzi originals (bundled) and other
 * open-licensed libraries through OpenSymbols. Every result shows its library and licence;
 * licences this deployment can't use are never offered.
 */
export function SymbolSearch({ suggest = '', initialQuery = '', selected, onPick }: Props) {
  const [index, setIndex] = useState<SymbolEntry[] | null>(null);
  const [indexError, setIndexError] = useState('');
  const [typed, setTyped] = useState<string | null>(initialQuery || null);
  const q = (typed ?? suggest).trim();
  const [source, setSource] = useState<Source>('all');
  const [aras, setAras] = useState<{ q: string; results: PickResult[]; error?: string } | null>(null);
  const [os, setOs] = useState<{ q: string; state: OsState; results: PickResult[] }>({ q: '', state: 'idle', results: [] });
  const arasaacOn = libraryAllowed('arasaac');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadSymbolIndex().then(
      (i) => alive && setIndex(i),
      () => alive && setIndexError('The Mulberry library couldn’t load. Connect to the internet once so Mimzi can save it.'),
    );
    return () => {
      alive = false;
    };
  }, []);

  // Online libraries: search after a short pause in typing.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!q) return;
    timer.current = setTimeout(() => {
      if (arasaacOn && (source === 'all' || source === 'arasaac') && aras?.q !== q) {
        searchArasaac(q).then(
          (rs) => setAras({ q, results: rs.map((r) => ({ symbol: r.symbol, name: r.name, info: r.info, key: r.symbol })) }),
          () => setAras({ q, results: [], error: navigator.onLine === false ? 'offline' : 'error' }),
        );
      }
      if ((source === 'all' || source === 'opensymbols') && os.q !== q && os.state !== 'not-configured') {
        setOs((s) => ({ ...s, state: 'loading' }));
        fetch(`${config.openSymbolsUrl}?q=${encodeURIComponent(q)}&locale=en`, { credentials: 'same-origin' })
          .then(async (res) => {
            if (res.status === 503 || res.status === 404) return setOs({ q, state: 'not-configured', results: [] });
            if (!res.ok) throw new Error(String(res.status));
            setOs({ q, state: 'ready', results: openSymbolResults((await res.json()) as OpenSymbolRow[]) });
          })
          .catch(() => setOs({ q, state: 'error', results: [] }));
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q, source]); // eslint-disable-line react-hooks/exhaustive-deps

  const mulberry = useMemo<PickResult[]>(
    () =>
      index
        ? searchSymbols(index, q, 40).map((e) => ({ symbol: `mul:${e.n}`, name: e.l, info: { ...bundledInfo(`mul:${e.n}`)!, name: e.l }, key: e.n }))
        : [],
    [index, q],
  );
  const mimzi = useMemo<PickResult[]>(() => {
    const ql = q.toLowerCase();
    return SYMBOL_KEYS.filter((k) => !ql || k.replace(/-/g, ' ').includes(ql) || ql.includes(k.replace(/-/g, ' '))).map((k) => ({
      symbol: `svg:${k}`,
      name: k.replace(/-/g, ' '),
      info: bundledInfo(`svg:${k}`)!,
      key: `svg:${k}`,
    }));
  }, [q]);
  const arasaac = aras && aras.q === q ? aras.results : [];
  const opensymbols = os.q === q ? os.results : [];

  const groups: { id: LibraryId; results: PickResult[] }[] = [
    { id: 'arasaac', results: arasaacOn ? arasaac : [] },
    { id: 'mulberry', results: mulberry },
    { id: 'mimzi', results: q ? mimzi : source === 'mimzi' ? mimzi : [] },
    { id: 'opensymbols', results: opensymbols },
  ];
  const visible = groups.filter((g) => source === 'all' || g.id === source);

  return (
    <div className="symbol-search">
      <label className="field inline">
        <span>Search AAC symbols by word or idea</span>
        <input value={typed ?? suggest} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. cup, swing, happy" data-testid="symbol-search" />
      </label>
      <div className="symbol-sources" role="group" aria-label="Symbol library">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip${source === s.id ? ' chip-on' : ''}`}
            aria-pressed={source === s.id}
            onClick={() => setSource(s.id)}
            data-testid={`symbol-lib-${s.id}`}
            disabled={s.id === 'arasaac' && !arasaacOn}
          >
            {s.label}
          </button>
        ))}
      </div>
      {!arasaacOn && (
        <p className="muted small">ARASAAC is switched off because this copy of Mimzi is set up for commercial use (ARASAAC is non-commercial only).</p>
      )}
      {indexError && (source === 'all' || source === 'mulberry') && <p className="form-error">{indexError}</p>}
      {(source === 'all' || source === 'arasaac') && aras?.q === q && aras.error && (
        <p className="muted small" data-testid="arasaac-offline">
          {aras.error === 'offline' ? 'ARASAAC search needs the internet. Pictures you already chose still work offline.' : 'ARASAAC didn’t answer. Try again in a moment.'}
        </p>
      )}
      {(source === 'all' || source === 'opensymbols') && os.state === 'not-configured' && (
        <p className="muted small" data-testid="opensymbols-off">
          More libraries (OpenSymbols) aren’t set up on this site yet. They need a free OpenSymbols key added to the hosting settings — see docs/SYMBOLS.md.
        </p>
      )}
      {(q || source === 'mimzi') &&
        visible.map((g) =>
          g.results.length ? (
            <div key={g.id} className="symbol-group" data-testid={`symbol-group-${g.id}`}>
              <h4>{g.id === 'opensymbols' ? 'More libraries (OpenSymbols)' : LIBRARIES[g.id].name}</h4>
              <div className="symbol-results" role="list">
                {g.results.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    role="listitem"
                    className={`symbol-choice${selected === r.symbol ? ' symbol-on' : ''}`}
                    onClick={() => onPick(r.symbol, r.info)}
                    title={`${r.name} — ${r.info.license}`}
                    aria-label={`Symbol ${r.name} (${g.id === 'opensymbols' ? r.info.repo : LIBRARIES[g.id].name})`}
                    data-symbol={r.key}
                  >
                    {r.symbol.startsWith('mul:') ? <img src={mulberryUrl(r.key)} alt="" loading="lazy" /> : <TileFace symbol={r.symbol} symbolInfo={r.info} label={r.name} />}
                    <span className="symbol-name">{r.name}</span>
                    <LicenseBadge info={r.info} />
                  </button>
                ))}
              </div>
            </div>
          ) : null,
        )}
      {q && visible.every((g) => !g.results.length) && (!aras || aras.q === q) && (
        <p className="muted small">No symbols match “{q}” yet. Try a simpler word, another library, or use a photo.</p>
      )}
      <p className="muted small">
        Each picture keeps its source and licence. ARASAAC: Sergio Palao, CC BY-NC-SA (non-commercial). Mulberry: Steve Lee, CC BY-SA. Full credits are in
        Symbol Library.
      </p>
    </div>
  );
}
