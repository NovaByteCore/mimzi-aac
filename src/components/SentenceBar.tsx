import type { SentenceItem } from '../lib/sentence';
import type { Tile } from '../types';
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
  return (
    <div className="sentence-bar" role="region" aria-label="Message">
      <button type="button" className="sentence-words" onClick={onSpeak} aria-label="Say my message" disabled={!items.length}>
        {items.length === 0 ? (
          <span className="sentence-placeholder">Tap pictures to talk</span>
        ) : (
          items.map((item) => {
            const t = tilesById.get(item.tileId);
            return (
              <span className="chip" key={item.key} data-testid="sentence-chip">
                <span className="chip-media">
                  <TileFace symbol={t?.symbol} asl={t?.aslSign} photoUrl={t?.photoId ? mediaUrls[t.photoId] : undefined} label={item.label} />
                </span>
                <span className="chip-label">{item.label}</span>
              </span>
            );
          })
        )}
      </button>
      <div className="sentence-actions">
        <button type="button" className="icon-btn speak-btn" onClick={onSpeak} disabled={!items.length} aria-label="Speak message">
          <span aria-hidden="true">🔊</span>
        </button>
        <button type="button" className="icon-btn" onClick={onBackspace} disabled={!items.length} aria-label="Remove last word">
          <span aria-hidden="true">⌫</span>
        </button>
        <button type="button" className="icon-btn" onClick={onClear} disabled={!items.length} aria-label="Clear message">
          <span aria-hidden="true">✕</span>
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
          <span aria-hidden="true">🔁</span>
        </button>
      </div>
    </div>
  );
}
