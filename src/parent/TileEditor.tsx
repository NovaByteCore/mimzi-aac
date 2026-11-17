import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Category, MediaRecord, Tile } from '../types';
import { TILE_COLORS } from '../types';
import { useMimzi } from '../state/MimziStore';
import { SYMBOL_KEYS } from '../data/symbols';
import { TileFace } from '../components/TileFace';
import { PhotoCropper } from './PhotoCropper';
import { ConfirmDialog } from './ConfirmDialog';
import { newId } from '../lib/id';
import { nextOrder } from '../lib/grid';
import { speakText } from '../lib/speech';

interface Props {
  tile?: Tile;
  defaultCategoryId: string;
  categories: Category[];
  onClose: () => void;
}

export function TileEditor({ tile, defaultCategoryId, categories, onClose }: Props) {
  const { tiles, mediaUrls, saveTile, softDeleteTile, settings } = useMimzi();
  const isNew = !tile;
  const [label, setLabel] = useState(tile?.label ?? '');
  const [speak, setSpeak] = useState(tile?.speak ?? '');
  const [speakEdited, setSpeakEdited] = useState(Boolean(tile && tile.speak !== tile.label));
  const [categoryId, setCategoryId] = useState(tile?.categoryId ?? defaultCategoryId);
  const [color, setColor] = useState<Tile['color']>(tile?.color ?? categories.find((c) => c.id === defaultCategoryId)?.color ?? 'cream');
  const [symbol, setSymbol] = useState(tile?.symbol ?? '');
  const [photoId, setPhotoId] = useState(tile?.photoId);
  const [pendingPhoto, setPendingPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const [favorite, setFavorite] = useState(tile?.favorite ?? false);
  const [hidden, setHidden] = useState(tile?.hidden ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
  }, [pendingPhoto]);

  const photoUrl = pendingPhoto?.url ?? (photoId ? mediaUrls[photoId] : undefined);
  const spoken = speakEdited ? speak : label;

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Please choose a photo.');
      return;
    }
    setError('');
    setCropFile(f);
  };

  const save = async () => {
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      setError('Give this picture a word or name.');
      return;
    }
    setSaving(true);
    try {
      const media: MediaRecord[] = [];
      let nextPhotoId = photoId;
      if (pendingPhoto) {
        nextPhotoId = newId('photo');
        media.push({ id: nextPhotoId, kind: 'photo', mime: pendingPhoto.blob.type || 'image/jpeg', blob: pendingPhoto.blob, createdAt: Date.now() });
      }
      const movedCategory = tile && tile.categoryId !== categoryId;
      const next: Tile = {
        id: tile?.id ?? newId('tile'),
        label: cleanLabel,
        speak: (spoken || cleanLabel).trim(),
        categoryId,
        order: tile && !movedCategory ? tile.order : nextOrder(tiles, categoryId),
        symbol: symbol.trim() || undefined,
        photoId: nextPhotoId,
        audioId: tile?.audioId,
        signId: tile?.signId,
        color,
        favorite,
        hidden,
        builtIn: tile?.builtIn ?? false,
      };
      await saveTile(next, media);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? `Couldn’t save: ${e.message}` : 'Couldn’t save this tile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <h2 id="editor-title">{isNew ? 'Add a picture' : `Edit “${tile.label}”`}</h2>

        {cropFile ? (
          <PhotoCropper
            file={cropFile}
            onCancel={() => setCropFile(null)}
            onDone={(blob) => {
              if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
              setPendingPhoto({ blob, url: URL.createObjectURL(blob) });
              setCropFile(null);
            }}
          />
        ) : (
          <div className="editor-body">
            <div className="editor-preview">
              <div className={`tile tile-${color} tile-preview${photoUrl ? ' tile-has-photo' : ''}`} aria-hidden="true">
                <span className="tile-media">
                  <TileFace symbol={symbol || undefined} photoUrl={photoUrl} label={label || '?'} />
                </span>
                <span className="tile-label">{label || 'Word'}</span>
              </div>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => void speakText(spoken || label, { rate: settings.speechRate, lang: settings.speechLang, voiceURI: settings.voiceURI })}
                disabled={!label.trim()}
              >
                🔊 Hear it
              </button>
            </div>

            <div className="editor-fields">
              <label className="field">
                <span>Word on the tile</span>
                <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="e.g. Puppy" autoFocus={isNew} />
              </label>
              <label className="field">
                <span>Mimzi says</span>
                <input
                  value={spoken}
                  onChange={(e) => {
                    setSpeak(e.target.value);
                    setSpeakEdited(true);
                  }}
                  maxLength={120}
                  placeholder="Same as the word"
                />
              </label>
              <label className="field">
                <span>Group</span>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="field">
                <legend>Photo</legend>
                <div className="row">
                  <button type="button" className="btn" onClick={() => cameraInput.current?.click()}>
                    📷 Take photo
                  </button>
                  <button type="button" className="btn" onClick={() => libraryInput.current?.click()}>
                    🖼️ Choose photo
                  </button>
                  {photoUrl && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => {
                        setPendingPhoto(null);
                        setPhotoId(undefined);
                      }}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
                <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} data-testid="camera-input" />
                <input ref={libraryInput} type="file" accept="image/*" hidden onChange={onFile} data-testid="photo-input" />
              </fieldset>

              <fieldset className="field">
                <legend>Symbol (used when there’s no photo)</legend>
                <div className="symbol-picker">
                  {SYMBOL_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`symbol-choice${symbol === `svg:${k}` ? ' symbol-on' : ''}`}
                      onClick={() => setSymbol(`svg:${k}`)}
                      aria-label={`Symbol ${k.replace('-', ' ')}`}
                      aria-pressed={symbol === `svg:${k}`}
                    >
                      <TileFace symbol={`svg:${k}`} label={k} />
                    </button>
                  ))}
                </div>
                <label className="field inline">
                  <span>Or type an emoji</span>
                  <input
                    value={symbol.startsWith('svg:') ? '' : symbol}
                    onChange={(e) => setSymbol(e.target.value.slice(0, 8))}
                    placeholder="🐶"
                    className="emoji-input"
                  />
                </label>
              </fieldset>

              <fieldset className="field">
                <legend>Colour</legend>
                <div className="swatches">
                  {TILE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`swatch tile-${c}${c === color ? ' swatch-on' : ''}`}
                      onClick={() => setColor(c)}
                      aria-label={c}
                      aria-pressed={c === color}
                    />
                  ))}
                </div>
              </fieldset>

              <label className="check">
                <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> Show in Favorites
              </label>
              <label className="check">
                <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hide for now (keeps its spot)
              </label>
            </div>
          </div>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {!cropFile && (
          <div className="modal-actions">
            {!isNew && (
              <button type="button" className="btn btn-danger-quiet" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {confirmDelete && tile && (
          <ConfirmDialog
            title={`Delete “${tile.label}”?`}
            message="It moves to Recently deleted in Parent Mode, where you can restore it."
            confirmLabel="Delete"
            danger
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              await softDeleteTile(tile.id);
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}
