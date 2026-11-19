import { useMemo, useState, type ReactNode } from 'react';
import { useMimzi } from '../../state/MimziStore';
import { TILE_COLORS, type MediaRecord, type ScheduleItem } from '../../types';
import { itemPicture } from '../../lib/myday';
import { TileFace } from '../../components/TileFace';
import { Icon } from '../../components/Icon';
import { PictureChooser } from './PictureChooser';

const CARD_COLORS = TILE_COLORS.filter((c) => ['white', 'cream', 'yellow', 'green', 'blue', 'purple', 'pink', 'orange'].includes(c));

/** One card of a schedule: words, what Mimzi says, picture and colour — the same everywhere. */
export function CardEditor({
  title,
  item,
  onChange,
  testId,
  extra,
}: {
  title: string;
  item: ScheduleItem;
  onChange: (item: ScheduleItem, newMedia?: MediaRecord[]) => void;
  testId?: string;
  extra?: ReactNode;
}) {
  const { tiles, mediaUrls } = useMimzi();
  const tileMap = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const [choosing, setChoosing] = useState(false);
  const pic = itemPicture(item, tileMap, mediaUrls);
  const hasPicture = Boolean(item.photoId || item.symbol || item.tileId);

  return (
    <div className="card-editor" data-testid={testId}>
      <div className="card-editor-head">
        <h4>{title}</h4>
        {extra}
      </div>
      <div className="item-editor-row">
        <button type="button" className={`mini-tile big tile-${item.color ?? 'white'} card-picture`} onClick={() => setChoosing(true)} aria-label={`Change ${title} picture`}>
          {hasPicture ? <TileFace symbol={pic.symbol} symbolInfo={pic.symbolInfo} tile={pic.tile} photoUrl={pic.photoUrl} label={item.label || '?'} /> : <span className="card-no-pic">Add picture</span>}
        </button>
        <div className="item-editor-fields">
          <label className="field inline">
            <span>Words</span>
            <input value={item.label} maxLength={40} onChange={(e) => onChange({ ...item, label: e.target.value })} aria-label={`${title} words`} />
          </label>
          <label className="field inline">
            <span>Mimzi says</span>
            <input
              value={item.speak ?? ''}
              maxLength={120}
              placeholder={item.label || 'Same as the words'}
              onChange={(e) => onChange({ ...item, speak: e.target.value || undefined })}
              aria-label={`${title} spoken words`}
            />
          </label>
          <div className="row">
            <button type="button" className="btn small" onClick={() => setChoosing(true)}>
              <Icon name="image" /> {hasPicture ? 'Change picture' : 'Choose picture'}
            </button>
            {hasPicture && (
              <button type="button" className="btn btn-quiet small" onClick={() => onChange({ ...item, photoId: undefined, tileId: undefined, symbol: undefined, symbolInfo: undefined })}>
                No picture
              </button>
            )}
          </div>
          <div className="swatches small-swatches" role="group" aria-label={`${title} card colour`}>
            {CARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch tile-${c}${(item.color ?? 'white') === c ? ' swatch-on' : ''}`}
                aria-label={`${c} card`}
                aria-pressed={(item.color ?? 'white') === c}
                onClick={() => onChange({ ...item, color: c === 'white' ? undefined : c })}
              />
            ))}
          </div>
        </div>
      </div>
      {choosing && (
        <PictureChooser
          suggest={item.label}
          onCancel={() => setChoosing(false)}
          onPick={(c) => {
            setChoosing(false);
            const cleared = { ...item, photoId: undefined, tileId: undefined, symbol: undefined, symbolInfo: undefined };
            if (c.kind === 'symbol') onChange({ ...cleared, symbol: c.symbol, symbolInfo: c.symbolInfo });
            else if (c.kind === 'tile') {
              const t = tileMap.get(c.tileId);
              onChange({ ...cleared, tileId: c.tileId, label: item.label || t?.label || '' });
            } else onChange({ ...cleared, photoId: c.photoId }, c.media ? [c.media] : []);
          }}
        />
      )}
    </div>
  );
}
