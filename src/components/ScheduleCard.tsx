import type { ScheduleItem, Tile } from '../types';
import { itemPicture } from '../lib/myday';
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

export function ScheduleCard({ item, heading, tiles, mediaUrls, onTap, current, className }: Props) {
  const pic = itemPicture(item, tiles, mediaUrls);
  const content = (
    <>
      {heading && <span className="sched-heading">{heading}</span>}
      <span className="sched-media">
        <TileFace symbol={pic.symbol} asl={pic.asl} photoUrl={pic.photoUrl} label={item.label || '?'} />
        {item.done && (
          <span className="sched-check" aria-hidden="true">
            ✓
          </span>
        )}
      </span>
      <span className="sched-label">
        {item.label || '—'}
        {item.done && <span className="sr-only"> (done)</span>}
      </span>
    </>
  );
  const cls = `sched-card${item.done ? ' sched-done' : ''}${current ? ' sched-current' : ''}${pic.photoUrl ? ' tile-has-photo' : ''} ${className ?? ''}`;
  return onTap ? (
    <button type="button" className={cls} onClick={onTap} aria-current={current ? 'step' : undefined}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
}
