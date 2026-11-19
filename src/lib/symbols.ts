/*
 * AAC symbol libraries: what each picture is, where it came from, and whether its licence
 * allows this deployment to show it.
 *
 * Symbol references stored on a tile (`tile.symbol`):
 *   arasaac:<id>          ARASAAC pictogram (downloaded from static.arasaac.org, cached offline)
 *   mul:<file>            Mulberry Symbols (bundled in /symbols/mulberry)
 *   svg:<key>             original Mimzi drawing (bundled in the code)
 *   os:<repo>:<id>        a symbol found through OpenSymbols (image URL in tile.symbolInfo)
 * Anything else (older text/emoji pictures) is not drawn: the bundled symbol or the word's
 * first letter is shown instead. Emoji are never used as vocabulary pictures.
 */
import defaultPictures from '../../public/symbols/defaultPictures.json';
import { config } from '../config';
import { mulberryUrl } from './colors';

export { mulberryUrl };
import type { Settings, SymbolInfo, Tile } from '../types';

export type LibraryId = SymbolInfo['library'];

export interface LibraryInfo {
  id: LibraryId;
  name: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  credit: string;
}

export const LIBRARIES: Record<Exclude<LibraryId, 'opensymbols'>, LibraryInfo> = {
  arasaac: {
    id: 'arasaac',
    name: 'ARASAAC',
    author: 'Sergio Palao',
    license: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    sourceUrl: 'https://arasaac.org',
    credit:
      'Pictograms’ author: Sergio Palao. Origin: ARASAAC (https://arasaac.org). License: CC (BY-NC-SA). Owner: Government of Aragón (Spain).',
  },
  mulberry: {
    id: 'mulberry',
    name: 'Mulberry Symbols',
    author: 'Steve Lee',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://mulberrysymbols.org',
    credit: 'Mulberry Symbols © Steve Lee, CC BY-SA 4.0 (mulberrysymbols.org).',
  },
  mimzi: {
    id: 'mimzi',
    name: 'Mimzi originals',
    author: 'Mimzi project',
    license: 'Original artwork, part of Mimzi',
    licenseUrl: '',
    sourceUrl: '',
    credit: 'Original Mimzi drawings for core words other libraries lack.',
  },
};

/* ---------------- licences ---------------- */

const KNOWN_LICENSE = /\b(CC|creative commons|CC0|public domain|MIT|apache|GPL)\b/i;

/** Read the flags we enforce from a licence string such as "CC BY-NC-SA 3.0". */
export function licenseFlags(license: string | undefined): { known: boolean; nonCommercial: boolean; shareAlike: boolean } {
  const l = (license ?? '').trim();
  return {
    known: !!l && KNOWN_LICENSE.test(l),
    nonCommercial: /\bNC\b|non-?commercial/i.test(l),
    shareAlike: /\bSA\b|share-?alike/i.test(l),
  };
}

/**
 * Is this deployment allowed to show a symbol with this licence?
 * Unknown or missing licences are never used. Noncommercial (NC) licences are only used
 * when Mimzi is deployed for personal, noncommercial use (the default; set
 * VITE_COMMERCIAL_USE=true for any commercial deployment and NC symbols switch off).
 */
export function licenseAllowed(info: Pick<SymbolInfo, 'license' | 'library'> | undefined, commercialUse = config.commercialUse): boolean {
  if (!info) return true;
  if (info.library === 'mimzi') return true;
  const f = licenseFlags(info.license);
  if (!f.known) return false;
  return !(f.nonCommercial && commercialUse);
}

export function libraryAllowed(id: LibraryId, commercialUse = config.commercialUse): boolean {
  if (id === 'opensymbols') return true; // checked per symbol
  if (id === 'mimzi') return true;
  return licenseAllowed({ library: id, license: LIBRARIES[id].license }, commercialUse);
}

/* ---------------- ARASAAC ---------------- */

export const ARASAAC_API = 'https://api.arasaac.org/v1';
export const ARASAAC_STATIC = 'https://static.arasaac.org/pictograms';

/**
 * Image address for an ARASAAC pictogram. The API's image endpoint sends CORS headers
 * (static.arasaac.org doesn't), so the service worker can save a normal — not opaque —
 * copy for offline use, which keeps storage use small. Verified against the live service.
 */
const bundledIds = new Set(defaultPictures.ids);
const offlineMulberry = new Set(defaultPictures.mulberry);

export function isOfflineMulberry(symbol: string): boolean {
  return symbol.startsWith('mul:') && offlineMulberry.has(symbol.slice(4));
}
const starterPictures: Readonly<Record<string, Tile['autoArasaac']>> = defaultPictures.tiles;
const base = ((import.meta.env ?? {}) as { BASE_URL?: string }).BASE_URL ?? '/';

export function bundledArasaacUrl(id: number | string): string | undefined {
  return bundledIds.has(Number(id)) ? `${base}symbols/arasaac/${id}.webp` : undefined;
}

export function arasaacUrl(id: number | string): string {
  return `${ARASAAC_API}/pictograms/${id}`;
}

export function arasaacInfo(id: number | string, name: string): SymbolInfo {
  const lib = LIBRARIES.arasaac;
  return {
    library: 'arasaac',
    id: String(id),
    name,
    url: arasaacUrl(id),
    author: lib.author,
    license: lib.license,
    licenseUrl: lib.licenseUrl,
    sourceUrl: `https://arasaac.org/pictograms/en/${id}`,
  };
}

/* ---------------- which picture a tile shows ---------------- */

/** Metadata for a bundled symbol reference. */
export function bundledInfo(symbol: string): SymbolInfo | undefined {
  if (symbol.startsWith('mul:')) {
    const lib = LIBRARIES.mulberry;
    const name = symbol.slice(4);
    return { library: 'mulberry', id: name, name: name.replace(/_,_to$/, '').replace(/_/g, ' '), url: mulberryUrl(name), author: lib.author, license: lib.license, licenseUrl: lib.licenseUrl, sourceUrl: lib.sourceUrl };
  }
  if (symbol.startsWith('svg:')) {
    const lib = LIBRARIES.mimzi;
    return { library: 'mimzi', id: symbol.slice(4), name: symbol.slice(4), author: lib.author, license: lib.license };
  }
  return undefined;
}

export type SymbolStyle = NonNullable<Settings['symbolStyle']>;

/** The default picture style for this deployment: ARASAAC unless its licence isn't allowed. */
export function effectiveStyle(settings: Pick<Settings, 'symbolStyle'>, commercialUse = config.commercialUse): SymbolStyle {
  const style = settings.symbolStyle ?? 'arasaac';
  if (style === 'arasaac' && !libraryAllowed('arasaac', commercialUse)) return 'mulberry';
  return style;
}

export interface Shown {
  /** Image URL for library symbols. */
  url?: string;
  /** Bundled reference to draw if the image can't load (offline before download, licence…). */
  fallback?: string;
  /** Raw reference (svg:/text) when there's no URL. */
  symbol?: string;
  info?: SymbolInfo;
}

/**
 * The picture a tile shows (photos are handled separately and always win):
 *  - Mimzi-chosen starter pictures follow the default style (ARASAAC, or the bundled set),
 *  - a picture a grown-up chose stays exactly as chosen,
 *  - anything whose licence this deployment can't use falls back to the bundled picture.
 */
export function shownSymbol(
  tile: Pick<Tile, 'symbol' | 'symbolAuto' | 'autoArasaac' | 'symbolInfo' | 'fallbackSymbol'> & Partial<Pick<Tile, 'id'>>,
  settings: Pick<Settings, 'symbolStyle'>,
  commercialUse = config.commercialUse,
): Shown {
  const bundled = tile.fallbackSymbol ?? (tile.symbol && /^(mul|svg):/.test(tile.symbol) ? tile.symbol : undefined);
  if (tile.symbolAuto && effectiveStyle(settings, commercialUse) === 'arasaac') {
    const pictogram = tile.id ? starterPictures[tile.id] : tile.autoArasaac;
    const url = pictogram && bundledArasaacUrl(pictogram.id);
    if (pictogram && url) return { url, fallback: bundled, info: arasaacInfo(pictogram.id, pictogram.name) };
  }
  const s = tile.symbol;
  if (!s) return {};
  if (s.startsWith('arasaac:')) {
    const info = tile.symbolInfo ?? arasaacInfo(s.slice(8), '');
    return licenseAllowed(info, commercialUse) ? { url: localSymbolData(info.localImage) ?? bundledArasaacUrl(s.slice(8)) ?? arasaacUrl(s.slice(8)), fallback: bundled, info } : { symbol: bundled, info: bundled ? bundledInfo(bundled) : undefined };
  }
  if (s.startsWith('os:')) {
    const info = tile.symbolInfo;
    return info?.url && licenseAllowed(info, commercialUse) ? { url: localSymbolData(info.localImage) ?? info.url, fallback: bundled, info } : { symbol: bundled, info: bundled ? bundledInfo(bundled) : undefined };
  }
  if (s.startsWith('mul:')) return { url: localSymbolData(tile.symbolInfo?.localImage) ?? mulberryUrl(s.slice(4)), info: tile.symbolInfo ?? bundledInfo(s) };
  if (s.startsWith('svg:')) return { symbol: s, info: bundledInfo(s) };
  // Older text/emoji pictures are no longer drawn: use the bundled symbol, else the first letter.
  if (bundled?.startsWith('mul:')) return { url: mulberryUrl(bundled.slice(4)), info: bundledInfo(bundled) };
  return { symbol: bundled, info: bundled ? bundledInfo(bundled) : undefined };
}

/** Every remote image URL the board uses, so the service worker can save them for offline. */
export function remoteSymbolUrls(tiles: Tile[], settings: Pick<Settings, 'symbolStyle'>): string[] {
  const urls = new Set<string>();
  for (const t of tiles) {
    if (t.deletedAt) continue;
    const s = shownSymbol(t, settings);
    if (s.url && !s.url.startsWith('data:')) urls.add(s.url);
  }
  return [...urls];
}

/** Libraries in use on the board, with how many words use each (for the credits). */
export function librariesInUse(tiles: Tile[], settings: Pick<Settings, 'symbolStyle'>): { info: SymbolInfo; count: number }[] {
  const map = new Map<string, { info: SymbolInfo; count: number }>();
  for (const t of tiles) {
    if (t.deletedAt) continue;
    const info = shownSymbol(t, settings).info;
    if (!info) continue;
    const key = info.library === 'opensymbols' ? `os:${info.repo}:${info.author}:${info.license}` : info.library;
    const cur = map.get(key);
    if (cur) cur.count++;
    else map.set(key, { info, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// Validate embedded copies from backups as well as newly downloaded images.
export function localSymbolData(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 1_400_000 &&
    /^data:image\/(?:png|jpeg|webp|gif|svg\+xml|avif);base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value : undefined;
}
