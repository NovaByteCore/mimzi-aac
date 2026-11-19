import { useEffect, useState } from 'react';
import { SymbolSvg } from '../data/symbols';
import { everydayFallback } from '../lib/pictureSets';
import { shownSymbol, type Shown } from '../lib/symbols';
import { useOptionalMimzi } from '../state/MimziStore';
import type { SymbolInfo, Tile } from '../types';

type TilePicture = Pick<Tile, 'symbol' | 'symbolAuto' | 'autoArasaac' | 'symbolInfo' | 'fallbackSymbol'>;

interface Props {
  /** A raw symbol reference (used when there's no tile, e.g. picker previews and page icons). */
  symbol?: string;
  symbolInfo?: SymbolInfo;
  /** The word's tile: its picture follows the default symbol style and licence rules. */
  tile?: TilePicture;
  photoUrl?: string;
  label: string;
}

/** A bundled picture (Mulberry / Mimzi original). With none, the word's first letter — never emoji. */
function Bundled({ symbol, label }: { symbol?: string; label: string }) {
  if (symbol?.startsWith('svg:')) return <SymbolSvg name={symbol.slice(4)} />;
  if (symbol?.startsWith('mul:')) {
    const shown = shownSymbol({ symbol }, {});
    return <img className="tile-symbol" src={shown.url} alt="" draggable={false} loading="lazy" />;
  }
  return (
    <span className="tile-initial" aria-hidden="true">
      {label.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** A downloaded library symbol; falls back to the bundled picture if it can't load (e.g. offline before it was saved). */
function Remote({ shown, label }: { shown: Shown; label: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [shown.url]);
  if (failed || !shown.url) return <Bundled symbol={shown.fallback} label={label} />;
  return (
    <img
      className="tile-symbol"
      src={shown.url}
      alt=""
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
      data-library={shown.info?.library}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The picture part of a tile: caregiver photo > AAC symbol (ARASAAC by default; Mulberry or
 * Mimzi originals when ARASAAC isn't available; or one a grown-up chose from OpenSymbols)
 * > the word's first letter. Emoji are never used as vocabulary pictures.
 * Changing the picture never changes the word, its speech, its recording or its place.
 */
export function TileFace({ symbol, symbolInfo, tile, photoUrl, label }: Props) {
  const store = useOptionalMimzi();
  const settings = store?.settings ?? {};
  if (photoUrl) return <img className="tile-photo" src={photoUrl} alt="" draggable={false} />;
  // Everyday schedule pictures carry a bundled backup, so they show even before ARASAAC is saved offline.
  const shown = shownSymbol(tile ?? { symbol, symbolInfo, fallbackSymbol: everydayFallback(symbol) }, settings);
  if (shown.url) return <Remote shown={shown} label={label} />;
  return <Bundled symbol={shown.symbol} label={label} />;
}
