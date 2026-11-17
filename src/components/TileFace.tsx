import { SymbolSvg } from '../data/symbols';

interface Props {
  symbol?: string;
  photoUrl?: string;
  label: string;
}

/** The picture part of a tile: caregiver photo > Mimzi symbol > emoji > first letter. */
export function TileFace({ symbol, photoUrl, label }: Props) {
  if (photoUrl) return <img className="tile-photo" src={photoUrl} alt="" draggable={false} />;
  if (symbol?.startsWith('svg:')) return <SymbolSvg name={symbol.slice(4)} />;
  if (symbol) return <span className="tile-emoji" aria-hidden="true">{symbol}</span>;
  return (
    <span className="tile-initial" aria-hidden="true">
      {label.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
