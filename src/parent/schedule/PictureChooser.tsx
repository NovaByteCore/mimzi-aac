import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { useMimzi } from '../../state/MimziStore';
import type { MediaRecord, SymbolInfo } from '../../types';
import { SymbolSearch } from '../SymbolSearch';
import { PhotoCropper } from '../PhotoCropper';
import { GooglePhotosButton } from '../GooglePhotosButton';
import { TileFace } from '../../components/TileFace';
import { Icon } from '../../components/Icon';
import { allScheduleItems } from '../../lib/myday';
import { newId } from '../../lib/id';

export type PictureChoice =
  | { kind: 'symbol'; symbol: string; symbolInfo: SymbolInfo }
  | { kind: 'photo'; photoId: string; media?: MediaRecord }
  | { kind: 'tile'; tileId: string };

type Source = 'symbols' | 'photo' | 'words' | 'library';

/**
 * One picture chooser for every schedule card: AAC symbols (ARASAAC, Mulberry, Mimzi,
 * OpenSymbols), a photo (upload, tablet camera, Google Photos), a picture already on the
 * board, or one already used in another schedule (reused — never copied).
 */
export function PictureChooser({
  suggest,
  onPick,
  onCancel,
  extraUrls,
}: {
  suggest: string;
  onPick: (c: PictureChoice) => void;
  onCancel: () => void;
  /** Includes photos picked earlier in this editing session (not saved yet). */
  extraUrls?: Record<string, string>;
}) {
  const { tiles, mediaUrls: storeUrls, mediaMime, myDay } = useMimzi();
  const mediaUrls = extraUrls ?? storeUrls;
  const [source, setSource] = useState<Source>('symbols');
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const [q, setQ] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onCancel);
  const camera = useRef<HTMLInputElement>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f && f.type.startsWith('image/')) setCropFile(f);
  };

  const words = tiles.filter((t) => !t.deletedAt && t.label.toLowerCase().includes((q || suggest).trim().toLowerCase())).slice(0, 60);
  const library = useMemo(() => {
    const photos = Object.keys(mediaUrls).filter((id) => (mediaMime[id] ?? 'image/').startsWith('image/'));
    const symbols = new Map<string, SymbolInfo | undefined>();
    for (const i of allScheduleItems(myDay)) if (i.symbol) symbols.set(i.symbol, i.symbolInfo);
    return { photos, symbols: [...symbols] };
  }, [mediaUrls, mediaMime, myDay]);

  const tabs: { id: Source; label: string; icon: string }[] = [
    { id: 'symbols', label: 'AAC symbols', icon: 'image' },
    { id: 'photo', label: 'Photo', icon: 'camera' },
    { id: 'words', label: 'From the board', icon: 'talk' },
    { id: 'library', label: 'Already used', icon: 'copy' },
  ];

  return (
    <div className="modal-backdrop" role="presentation">
      <div ref={dialogRef} className="modal editor-modal picture-chooser" role="dialog" aria-modal="true" aria-labelledby="pc-title" data-testid="picture-chooser">
        <h2 id="pc-title">Choose a picture</h2>
        <div className="seg" role="tablist" aria-label="Picture source">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={source === t.id} className={`seg-btn${source === t.id ? ' seg-on' : ''}`} onClick={() => setSource(t.id)}>
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </div>

        {source === 'symbols' && <SymbolSearch suggest={suggest} onPick={(symbol, symbolInfo) => onPick({ kind: 'symbol', symbol, symbolInfo })} />}

        {source === 'photo' && (
          <div className="photo-sources">
            <button type="button" className="btn big-btn" onClick={() => camera.current?.click()}>
              <Icon name="camera" /> Take a photo
            </button>
            <button type="button" className="btn big-btn" onClick={() => upload.current?.click()}>
              <Icon name="image" /> Choose a photo
            </button>
            <GooglePhotosButton onPicked={(blob) => setCropFile(blob)} />
            <input ref={upload} type="file" accept="image/*" hidden onChange={onFile} data-testid="schedule-photo-input" />
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onFile} data-testid="schedule-camera-input" />
            <p className="muted small">Photos stay on this device (and in your own Google Drive if sync is on). They are never put in the app’s code.</p>
          </div>
        )}

        {source === 'words' && (
          <>
            <label className="field inline">
              <span>Search the board</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={suggest || 'e.g. shoes'} />
            </label>
            <div className="picker-grid">
              {words.map((t) => (
                <button key={t.id} type="button" className={`tile tile-${t.color} picker-tile`} onClick={() => onPick({ kind: 'tile', tileId: t.id })} aria-label={`Pick ${t.label}`}>
                  <span className="tile-media">
                    <TileFace tile={t} photoUrl={t.photoId ? mediaUrls[t.photoId] : undefined} label={t.label} />
                  </span>
                  <span className="tile-label">{t.label}</span>
                </button>
              ))}
              {words.length === 0 && <p className="muted">No board words match. Try AAC symbols instead.</p>}
            </div>
          </>
        )}

        {source === 'library' && (
          <div className="picker-grid" data-testid="picture-library">
            {library.photos.map((id) => (
              <button key={id} type="button" className="tile tile-white picker-tile tile-has-photo" onClick={() => onPick({ kind: 'photo', photoId: id })} aria-label="Reuse this photo">
                <span className="tile-media">
                  <img className="tile-photo" src={mediaUrls[id]} alt="" />
                </span>
              </button>
            ))}
            {library.symbols.map(([symbol, info]) => (
              <button key={symbol} type="button" className="tile tile-white picker-tile" onClick={() => info && onPick({ kind: 'symbol', symbol, symbolInfo: info })} aria-label={`Reuse symbol ${info?.name ?? ''}`}>
                <span className="tile-media">
                  <TileFace symbol={symbol} symbolInfo={info} label={info?.name ?? '?'} />
                </span>
                <span className="tile-label">{info?.name}</span>
              </button>
            ))}
            {library.photos.length + library.symbols.length === 0 && <p className="muted">Pictures you use in schedules and on the board appear here, ready to reuse.</p>}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      {cropFile && (
        <CropDialog onCancel={() => setCropFile(null)}>
          <PhotoCropper
              file={cropFile}
              onCancel={() => setCropFile(null)}
              onDone={(blob) => {
                const id = newId('photo');
                setCropFile(null);
                onPick({ kind: 'photo', photoId: id, media: { id, kind: 'photo', mime: blob.type || 'image/jpeg', blob, createdAt: Date.now() } });
              }}
            />
        </CropDialog>
      )}
    </div>
  );
}

function CropDialog({ onCancel, children }: { onCancel: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onCancel);
  return (
    <div className="modal-backdrop" role="presentation">
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label="Position photo">
        {children}
      </div>
    </div>
  );
}
