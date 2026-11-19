import { useEffect, useRef, useState } from 'react';
import type { SentenceItem } from '../lib/sentence';
import type { Tile } from '../types';
import { Icon } from './Icon';
import { TileFace } from './TileFace';

interface Props {
  items: SentenceItem[];
  tilesById: Map<string, Tile>;
  mediaUrls: Record<string, string>;
  onSpeak: () => void;
  onBackspace: () => void;
  onClear: () => void;
}

export function SentenceBar({ items, tilesById, mediaUrls, onSpeak, onBackspace, onClear }: Props) {
  const text = items.map((i) => i.label).join(' ');
  // Short announcements for screen readers when the message changes ("Added more").
  const [announce, setAnnounce] = useState('');
  const prev = useRef<SentenceItem[]>(items);
  useEffect(() => {
    const before = prev.current;
    prev.current = items;
    if (items.length > before.length) setAnnounce(`Added ${items[items.length - 1].label}`);
    else if (items.length === 0 && before.length > 0) setAnnounce('Message cleared');
    else if (items.length < before.length) setAnnounce(`Removed ${before[before.length - 1].label}`);
  }, [items]);

  return (
    <div className="sentence-bar" role="region" aria-label="Message">
      {/* The message as readable text (screen readers); the picture strip below is the same thing visually. */}
      <p className="sr-only" id="message-text" data-testid="message-text">
        {items.length ? `Message: ${text}` : 'Message is empty'}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="message-live">
        {announce}
      </p>
      {/* Tapping the pictures says the message too (familiar for children); for assistive
          technology the single "Speak message" button below is the action. */}
      <div className={`sentence-words${items.length ? '' : ' sentence-empty'}`} onClick={() => items.length && onSpeak()} aria-hidden="true">
        {items.length === 0 ? (
          <span className="sentence-placeholder">Tap pictures to talk</span>
        ) : (
          items.map((item) => {
            const t = tilesById.get(item.tileId);
            return (
              <span className="chip" key={item.key} data-testid="sentence-chip">
                <span className="chip-media">
                  <TileFace symbol={t?.symbol} tile={t} asl={t?.aslSign} photoUrl={t?.photoId ? mediaUrls[t.photoId] : undefined} label={item.label} />
                </span>
                <span className="chip-label">{item.label}</span>
              </span>
            );
          })
        )}
      </div>
      <div className="sentence-actions">
        <button type="button" className="icon-btn speak-btn" onClick={onSpeak} disabled={!items.length} aria-label="Speak message" aria-describedby="message-text">
          <Icon name="speak" size={30} />
        </button>
        <button type="button" className="icon-btn" onClick={onBackspace} disabled={!items.length} aria-label="Remove last word">
          <Icon name="backspace" size={28} />
        </button>
        <button type="button" className="icon-btn" onClick={onClear} disabled={!items.length} aria-label="Clear message">
          <Icon name="close" size={26} />
        </button>
      </div>
    </div>
  );
}

export function SpokenBar({ text, onReplay }: { text: string; onReplay: () => void }) {
  return (
    <div className="sentence-bar spoken-bar" role="region" aria-label="Last word">
      <div className="spoken-text" aria-live="polite">
        {text || <span className="sentence-placeholder">Tap a picture to talk</span>}
      </div>
      <div className="sentence-actions">
        <button type="button" className="icon-btn speak-btn" onClick={onReplay} disabled={!text} aria-label="Say it again">
          <Icon name="reset" size={26} />
        </button>
      </div>
    </div>
  );
}
