/*
 * ARASAAC pictograms (https://arasaac.org) — the default AAC symbol style.
 *
 * Pictograms’ author: Sergio Palao. Origin: ARASAAC. License: CC BY-NC-SA 4.0.
 * Owner: Government of Aragón (Spain). Used here for personal, noncommercial AAC.
 *
 * The public API needs no key. Mimzi only searches it from the device (no tracking data is
 * sent — just the search word), downloads the chosen PNGs, and the service worker keeps
 * them for offline use.
 */
import { ARASAAC_API, arasaacInfo, arasaacUrl } from './symbols';
import type { SymbolInfo, Tile } from '../types';

export interface SymbolResult {
  /** Reference stored on the tile, e.g. "arasaac:2340". */
  symbol: string;
  url: string;
  name: string;
  info: SymbolInfo;
}

interface RawPictogram {
  _id?: unknown;
  keywords?: { keyword?: unknown }[];
  sex?: unknown;
  violence?: unknown;
}

type Fetch = typeof fetch;

function normalize(raw: unknown, query: string): SymbolResult[] {
  if (!Array.isArray(raw)) return [];
  const out: SymbolResult[] = [];
  for (const p of raw as RawPictogram[]) {
    const id = typeof p?._id === 'number' ? p._id : Number(p?._id);
    if (!Number.isInteger(id) || id <= 0) continue;
    // Toddler AAC: never offer pictograms ARASAAC flags as sexual or violent.
    if (p.sex === true || p.violence === true) continue;
    const kw = (p.keywords ?? []).map((k) => (typeof k?.keyword === 'string' ? k.keyword : '')).filter(Boolean);
    const name = kw.find((k) => k.toLowerCase() === query.toLowerCase()) ?? kw[0] ?? query;
    out.push({ symbol: `arasaac:${id}`, url: arasaacUrl(id), name, info: arasaacInfo(id, name) });
  }
  return out;
}

async function getJson(url: string, fetchImpl: Fetch): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`ARASAAC ${res.status}`);
  return res.json();
}

/** Search ARASAAC for a word or concept (all matches, best first). */
export async function searchArasaac(query: string, locale = 'en', fetchImpl: Fetch = fetch, limit = 40): Promise<SymbolResult[]> {
  const q = query.trim();
  if (!q) return [];
  const raw = await getJson(`${ARASAAC_API}/pictograms/${locale}/search/${encodeURIComponent(q)}`, fetchImpl);
  return normalize(raw, q).slice(0, limit);
}

/** ARASAAC's own "best match" for a word (exact keyword matches). */
export async function bestArasaac(query: string, locale = 'en', fetchImpl: Fetch = fetch): Promise<SymbolResult | undefined> {
  const q = query.trim();
  if (!q) return undefined;
  const raw = await getJson(`${ARASAAC_API}/pictograms/${locale}/bestsearch/${encodeURIComponent(q)}`, fetchImpl);
  return normalize(raw, q)[0];
}

/**
 * Search words for starter vocabulary where the label alone isn't the clearest ARASAAC
 * concept. Everything else searches its own label, then the concept of its bundled symbol.
 */
export const STARTER_QUERIES: Record<string, string[]> = {
  'core-all-done': ['finished', 'end'],
  'needs-all-done': ['finished', 'end'],
  'core-folder-food': ['food'],
  'core-folder-family': ['family'],
  'core-folder-play': ['toys', 'play'],
  'core-folder-feelings': ['emotions', 'feelings'],
  'core-folder-needs': ['toilet', 'needs'],
  'core-folder-questions': ['question'],
  'core-folder-actions': ['actions', 'run'],
  'core-folder-body': ['body'],
  'core-folder-places': ['places', 'house'],
  'core-folder-social': ['hello'],
  'core-folder-safety': ['safety', 'help'],
  'core-folder-describe': ['adjectives', 'big'],
  'core-folder-phrases': ['communication book', 'sentence'],
};

/** Ordered search terms to try for a starter word. */
export function starterQueries(tile: Pick<Tile, 'id' | 'label' | 'fallbackSymbol' | 'symbol'>): string[] {
  const out: string[] = [...(STARTER_QUERIES[tile.id] ?? [])];
  const label = tile.label.replace(/[!?.,]/g, '').trim();
  if (label) out.push(label.toLowerCase());
  const bundled = tile.fallbackSymbol ?? tile.symbol;
  if (bundled?.startsWith('mul:')) {
    const concept = bundled.slice(4).replace(/_,_to$/, '').replace(/_(female|male|lady|man)$/, '').replace(/_/g, ' ').toLowerCase();
    if (concept) out.push(concept);
  }
  return [...new Set(out)];
}

/** Starter words whose ARASAAC picture hasn't been found yet. */
export function needsArasaac(tiles: Tile[], missing: Record<string, string> = {}): Tile[] {
  return tiles.filter((t) => t.symbolAuto && !t.autoArasaac && !t.deletedAt && missing[t.id] !== t.label);
}

/**
 * Find an ARASAAC pictogram for each starter word (in the background, a few at a time).
 * Calls `onFound` per word so the board can update the picture in place — positions,
 * labels, speech and ASL never change. Words with no match keep their bundled picture.
 */
export async function findStarterPictures(
  tiles: Tile[],
  onFound: (tileId: string, found: { id: number; name: string }) => void | Promise<void>,
  opts: { fetchImpl?: Fetch; locale?: string; concurrency?: number; onMissing?: (tileId: string) => void; signal?: { cancelled: boolean } } = {},
): Promise<{ found: number; missing: number; failed: number }> {
  const queue = [...tiles];
  let found = 0;
  let missing = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length && !opts.signal?.cancelled) {
      const t = queue.shift()!;
      try {
        let hit: SymbolResult | undefined;
        for (const q of starterQueries(t)) {
          hit = await bestArasaac(q, opts.locale ?? 'en', opts.fetchImpl ?? fetch);
          if (hit) break;
        }
        if (hit) {
          found++;
          await onFound(t.id, { id: Number(hit.info.id), name: hit.name });
        } else {
          missing++;
          opts.onMissing?.(t.id);
        }
      } catch {
        failed++; // offline or ARASAAC unreachable — try again next time
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, worker));
  return { found, missing, failed };
}
