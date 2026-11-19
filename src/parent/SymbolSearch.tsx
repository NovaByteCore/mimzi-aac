import { useEffect, useMemo, useState } from 'react';
import { mulberryUrl } from '../lib/colors';

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

interface Props {
  initialQuery?: string;
  selected?: string;
  onPick: (symbol: string) => void;
}

/** Searchable AAC symbol picker (Mulberry Symbols). */
export function SymbolSearch({ initialQuery = '', selected, onPick }: Props) {
  const [index, setIndex] = useState<SymbolEntry[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState(initialQuery);

  useEffect(() => {
    let alive = true;
    loadSymbolIndex().then(
      (i) => alive && setIndex(i),
      () => alive && setError('The symbol library couldn’t load. Connect to the internet once so Mimzi can save it.'),
    );
    return () => {
      alive = false;
    };
  }, []);

  const results = useMemo(() => (index ? searchSymbols(index, q) : []), [index, q]);

  return (
    <div className="symbol-search">
      <label className="field inline">
        <span>Search AAC symbols</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. cup, swing, happy" data-testid="symbol-search" />
      </label>
      {error && <p className="form-error">{error}</p>}
      {!index && !error && <p className="muted small">Loading symbols…</p>}
      {index && q.trim() && results.length === 0 && <p className="muted small">No symbols match “{q}”. Try a simpler word, or use a photo.</p>}
      <div className="symbol-results" role="list">
        {results.map((e) => (
          <button
            key={e.n}
            type="button"
            role="listitem"
            className={`symbol-choice${selected === `mul:${e.n}` ? ' symbol-on' : ''}`}
            onClick={() => onPick(`mul:${e.n}`)}
            title={e.l}
            aria-label={`Symbol ${e.l}`}
            data-symbol={e.n}
          >
            <img src={mulberryUrl(e.n)} alt="" loading="lazy" />
            <span className="symbol-name">{e.l}</span>
          </button>
        ))}
      </div>
      <p className="muted small">Symbols: Mulberry Symbols © Steve Lee, CC BY-SA 4.0 (mulberrysymbols.org).</p>
    </div>
  );
}
