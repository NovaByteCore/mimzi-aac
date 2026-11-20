import { useEffect, useState } from 'react';
import type { Tile } from '../types';
import { TileFace } from './TileFace';
import { useOptionalMimzi } from '../state/MimziStore';
import { displayColor } from '../lib/colors';

interface Props {
  tile: Tile;
  photoUrl?: string;
  onTap: (tile: Tile) => void;
  compact?: boolean;
}

export function TileButton({ tile, photoUrl, onTap, compact }: Props) {
  const [active, setActive] = useState(false);
  const store = useOptionalMimzi();
  const color = displayColor(tile, store?.settings);
  const isFolder = Boolean(tile.linkTo);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 450);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <button
      type="button"
      className={`tile tile-${color}${active ? ' tile-active' : ''}${compact ? ' tile-compact' : ''}${photoUrl ? ' tile-has-photo' : ''}${isFolder ? ' tile-folder' : ''}`}
      data-tile-id={tile.id}
      data-word-type={tile.wordType}
      aria-label={isFolder ? `${tile.label} (folder)` : tile.label}
      onClick={() => {
        setActive(true);
        onTap(tile);
      }}
    >
      <span className="tile-media">
        <TileFace tile={tile} photoUrl={photoUrl} label={tile.label} />
      </span>
      <span className="tile-label">
        {tile.label}
      </span>
    </button>
  );
}
