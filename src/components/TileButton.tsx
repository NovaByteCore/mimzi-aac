import { useEffect, useState } from 'react';
import type { Tile } from '../types';
import { TileFace } from './TileFace';
import { useOptionalMimzi } from '../state/MimziStore';
import { displayColor } from '../lib/colors';

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
  const store = useOptionalMimzi();
  const color = displayColor(tile, store?.settings);
  const isFolder = Boolean(tile.linkTo);
  const showSign = Boolean(onSign && (tile.signId || (tile.aslSign && (store?.settings.showAslDrawings ?? true))));
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 450);
    return () => clearTimeout(t);
  }, [active]);

  const button = (
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
        <TileFace tile={tile} asl={tile.aslSign} photoUrl={photoUrl} label={tile.label} />
      </span>
      <span className="tile-label">
        {isFolder && <span className="folder-tab" aria-hidden="true" />}
        {tile.label}
      </span>
    </button>
  );

  if (!showSign || !onSign) return button;
  return (
    <div className="tile-wrap">
      {button}
      <button type="button" className="sign-btn" onClick={() => onSign(tile)} aria-label={`See sign for ${tile.label}`}>
        <span className="sign-dot" aria-hidden="true">
          🤟
        </span>
      </button>
    </div>
  );
}
