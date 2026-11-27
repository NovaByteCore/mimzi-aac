import type { ScheduleItem, Tile } from '../types';
import { itemPicture } from '../lib/myday';
import { Icon } from './Icon';
import { TileFace } from './TileFace';

interface Props {
  item: ScheduleItem;
  heading?: string;
  tiles: Map<string, Tile>;
  mediaUrls: Record<string, string>;
  onTap?: () => void;
  current?: boolean;
  className?: string;
}

/**
 * One visual-schedule card: large picture (photo, AAC symbol or the word's picture) and words.
 * With no picture (or one that can't load) the words stay large and readable.
 */
export function ScheduleCard({ item, heading, tiles, mediaUrls, onTap, current, className }: Props) {
  const pic = itemPicture(item, tiles, mediaUrls);
  const hasPicture = Boolean(pic.photoUrl || pic.symbol || pic.tile);
  const content = (
    <>
      {heading && <span className="sched-heading">{heading}</span>}
      {hasPicture ? (
        <span className="sched-media">
          <TileFace symbol={pic.symbol} symbolInfo={pic.symbolInfo} tile={pic.tile} photoUrl={pic.photoUrl} label={item.label || '?'} />
          {item.done && (
            <span className="sched-check" aria-hidden="true">
              <Icon name="check" size={34} />
            </span>
          )}
        </span>
      ) : (
        <span className="sched-media sched-text-only" aria-hidden="true">
          <span>{item.label || '—'}</span>
          {item.done && (
            <span className="sched-check">
              <Icon name="check" size={34} />
            </span>
          )}
        </span>
      )}
      <span className="sched-label">
        {item.label || '—'}
        {item.done && <span className="sr-only"> (done)</span>}
      </span>
    </>
  );
  const cls = `sched-card${item.color ? ` tile-${item.color} sched-colored` : ''}${item.done ? ' sched-done' : ''}${current ? ' sched-current' : ''}${pic.photoUrl ? ' tile-has-photo' : ''} ${className ?? ''}`;
  return onTap ? (
    <button type="button" className={cls} onClick={onTap} aria-current={current ? 'step' : undefined}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
}
