import { useRef } from 'react';
import type { Category } from '../types';
import { useDialogFocus } from '../lib/useDialogFocus';
import { TileFace } from './TileFace';
import { Icon } from './Icon';

/** Compact screens: the word-group list, opened from the "Groups" button in the page toolbar. */
export function GroupsSheet({ categories, current, onPick, onClose }: { categories: Category[]; current: string; onPick: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div ref={ref} className="modal groups-sheet" role="dialog" aria-modal="true" aria-labelledby="groups-title" onClick={(e) => e.stopPropagation()} data-testid="groups-sheet">
        <div className="groups-head">
          <h2 id="groups-title">Word groups</h2>
          <button type="button" className="btn btn-quiet icon-btn" onClick={onClose} aria-label="Close word groups" data-autofocus>
            <Icon name="close" />
          </button>
        </div>
        <div className="groups-grid">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`category-btn tile-${c.color}${c.id === current ? ' category-on' : ''}`}
              aria-pressed={c.id === current}
              onClick={() => onPick(c.id)}
            >
              <span className="category-icon">
                <TileFace symbol={c.symbol} label={c.name} />
              </span>
              <span className="category-name">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
