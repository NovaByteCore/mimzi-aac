import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useMimzi } from '../state/MimziStore';
import type { MediaRecord, ScheduleItem, Tile } from '../types';
import { itemPicture } from '../lib/myday';
import { TileFace } from '../components/TileFace';
import { PhotoCropper } from './PhotoCropper';
import { newId } from '../lib/id';
import { GooglePhotosButton } from './GooglePhotosButton';

interface Props {
  title: string;
  item: ScheduleItem;
  onChange: (item: ScheduleItem, newMedia?: MediaRecord[]) => void;
  testId?: string;
}

/** Edit one schedule picture: words, what Mimzi says, and a picture (from a word tile or a new photo). */
export function ItemEditor({ title, item, onChange, testId }: Props) {
  const { tiles, mediaUrls } = useMimzi();
  const tileMap = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const [picking, setPicking] = useState(false);
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pic = itemPicture(item, tileMap, mediaUrls);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f && f.type.startsWith('image/')) setCropFile(f);
  };

  return (
    <div className="item-editor" data-testid={testId}>
      <h4>{title}</h4>
      <div className="item-editor-row">
        <span className="mini-tile big tile-white">
          <TileFace symbol={pic.symbol} tile={pic.tile} asl={pic.asl} photoUrl={pic.photoUrl} label={item.label || '?'} />
        </span>
        <div className="item-editor-fields">
          <label className="field inline">
            <span>Words</span>
            <input value={item.label} maxLength={40} onChange={(e) => onChange({ ...item, label: e.target.value })} aria-label={`${title} words`} />
          </label>
          <label className="field inline">
            <span>Mimzi says (optional)</span>
            <input value={item.speak ?? ''} maxLength={120} placeholder="Same as the words" onChange={(e) => onChange({ ...item, speak: e.target.value || undefined })} />
          </label>
          <div className="row">
            <button type="button" className="btn small" onClick={() => setPicking(true)}>
              Use a word’s picture
            </button>
            <button type="button" className="btn small" onClick={() => fileInput.current?.click()}>
              📷 Photo
            </button>
            <GooglePhotosButton className="small" onPicked={(blob) => setCropFile(blob)} />
            {(item.photoId || item.tileId) && (
              <button type="button" className="btn btn-quiet small" onClick={() => onChange({ ...item, photoId: undefined, tileId: undefined })}>
                No picture
              </button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} data-testid={testId ? `${testId}-photo` : undefined} />
        </div>
      </div>

      {cropFile && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Position photo">
            <PhotoCropper
              file={cropFile}
              onCancel={() => setCropFile(null)}
              onDone={(blob) => {
                const id = newId('photo');
                onChange({ ...item, photoId: id, tileId: undefined }, [{ id, kind: 'photo', mime: blob.type || 'image/jpeg', blob, createdAt: Date.now() }]);
                setCropFile(null);
              }}
            />
          </div>
        </div>
      )}

      {picking && (
        <TilePicker
          onCancel={() => setPicking(false)}
          onPick={(t) => {
            onChange({ ...item, tileId: t.id, photoId: undefined, label: item.label || t.label });
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

export function TilePicker({ onPick, onCancel }: { onPick: (t: Tile) => void; onCancel: () => void }) {
  const { tiles, categories, mediaUrls } = useMimzi();
  const [q, setQ] = useState('');
  const catOrder = new Map(categories.map((c) => [c.id, c.order]));
  const list = tiles
    .filter((t) => !t.deletedAt && t.label.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (catOrder.get(a.categoryId) ?? 99) - (catOrder.get(b.categoryId) ?? 99) || a.order - b.order);
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal editor-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title">
        <h2 id="picker-title">Choose a word’s picture</h2>
        <label className="field">
          <span>Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. shoes" autoFocus />
        </label>
        <div className="picker-grid">
          {list.map((t) => (
            <button key={t.id} type="button" className={`tile tile-${t.color} picker-tile${t.photoId ? ' tile-has-photo' : ''}`} onClick={() => onPick(t)} aria-label={`Pick ${t.label}`}>
              <span className="tile-media">
                <TileFace tile={t} asl={t.aslSign} photoUrl={t.photoId ? mediaUrls[t.photoId] : undefined} label={t.label} />
              </span>
              <span className="tile-label">{t.label}</span>
            </button>
          ))}
          {list.length === 0 && <p className="muted">No words match.</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
