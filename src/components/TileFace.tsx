import { SymbolSvg } from '../data/symbols';
import { AslSignSvg, ASL_SIGNS } from '../data/aslSigns';
import { mulberryUrl } from '../lib/colors';

interface Props {
  symbol?: string;
  photoUrl?: string;
  /** ASL sign drawing key — only drawn on the tile itself when `forceAsl` (e.g. picker previews). */
  asl?: string;
  label: string;
  /** Force the ASL drawing even when the setting is off (e.g. in the editor picker). */
  forceAsl?: boolean;
}

/**
 * The picture part of a tile: caregiver photo > AAC symbol (Mulberry or Mimzi original) >
 * custom text/emoji the caregiver typed > first letter. ASL drawings live under "See sign".
 */
export function TileFace({ symbol, photoUrl, asl, label, forceAsl }: Props) {
  if (photoUrl) return <img className="tile-photo" src={photoUrl} alt="" draggable={false} />;
  if (forceAsl && asl && ASL_SIGNS[asl]) return <AslSignSvg name={asl} />;
  if (symbol?.startsWith('mul:')) return <img className="tile-symbol" src={mulberryUrl(symbol.slice(4))} alt="" draggable={false} loading="lazy" />;
  if (symbol?.startsWith('svg:')) return <SymbolSvg name={symbol.slice(4)} />;
  if (symbol) return <span className="tile-emoji" aria-hidden="true">{symbol}</span>;
  return (
    <span className="tile-initial" aria-hidden="true">
      {label.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
