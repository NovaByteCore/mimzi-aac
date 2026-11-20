import type { MediaRecord, SymbolInfo } from '../../types';
import { PicturePicker } from '../PicturePicker';

export type PictureChoice =
  | { kind: 'symbol'; symbol: string; symbolInfo: SymbolInfo }
  | { kind: 'photo'; photoId: string; media?: MediaRecord }
  | { kind: 'tile'; tileId: string };

/**
 * Picture chooser for schedule cards — the same picker as the AAC board: Recent, Saved, one
 * "Search pictures" box across every library, and "Use a photo".
 */
export function PictureChooser({
  suggest,
  onPick,
  onCancel,
  extraUrls,
  inline,
}: {
  suggest: string;
  onPick: (c: PictureChoice) => void;
  onCancel: () => void;
  /** Includes photos picked earlier in this editing session (not saved yet). */
  extraUrls?: Record<string, string>;
  inline?: boolean;
}) {
  return (
    <PicturePicker
      title={suggest ? `Picture for “${suggest}”` : 'Choose a picture'}
      suggest={suggest}
      extraUrls={extraUrls}
      inline={inline}
      onCancel={onCancel}
      onUse={(p) => onPick(p.kind === 'photo' ? { kind: 'photo', photoId: p.photoId, media: p.media } : { kind: 'symbol', symbol: p.symbol, symbolInfo: p.info })}
    />
  );
}
