import { useEffect, useState } from 'react';
import type { Tile } from '../types';
import { TileFace } from './TileFace';

interface Props {
  tile: Tile;
  photoUrl?: string;
  onTap: (tile: Tile) => void;
  /** When given and the tile has a sign video, a separate "See sign" button is shown. */
  onSign?: (tile: Tile) => void;
  compact?: boolean;
}

export function TileButton({ tile, photoUrl, onTap, onSign, compact }: Props) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 450);
    return () => clearTimeout(t);
  }, [active]);

  const button = (
    <button
      type="button"
      className={`tile tile-${tile.color}${active ? ' tile-active' : ''}${compact ? ' tile-compact' : ''}${photoUrl ? ' tile-has-photo' : ''}`}
      data-tile-id={tile.id}
      aria-label={tile.label}
      onClick={() => {
        setActive(true);
        onTap(tile);
      }}
    >
      <span className="tile-media">
        <TileFace symbol={tile.symbol} photoUrl={photoUrl} label={tile.label} />
      </span>
      <span className="tile-label">{tile.label}</span>
    </button>
  );

  if (!onSign || !tile.signId) return button;
  return (
    <div className="tile-wrap">
      {button}
      <button type="button" className="sign-btn" onClick={() => onSign(tile)} aria-label={`See sign for ${tile.label}`}>
        <span aria-hidden="true">🤟</span>
      </button>
    </div>
  );
}
