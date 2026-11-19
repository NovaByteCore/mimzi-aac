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
import { speakTile } from '../lib/speech';
import { AudioRecorder } from './AudioRecorder';
import { GooglePhotosButton } from './GooglePhotosButton';
import { isSignFile, MAX_SIGN_BYTES, SIGN_ACCEPT } from '../lib/media';

interface Props {
  tile?: Tile;
  defaultCategoryId: string;
  categories: Category[];
  onClose: () => void;
}

export function TileEditor({ tile, defaultCategoryId, categories, onClose }: Props) {
  const { tiles, mediaUrls, mediaMime, saveTile, softDeleteTile, settings } = useMimzi();
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
  const [audioId, setAudioId] = useState(tile?.audioId);
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const [signId, setSignId] = useState(tile?.signId);
  const [pendingSign, setPendingSign] = useState<{ blob: Blob; url: string; mime: string } | null>(null);
  const [privateNote, setPrivateNote] = useState(tile?.privateNote ?? '');
  const signInput = useRef<HTMLInputElement>(null);
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

  useEffect(() => () => {
    if (pendingAudio) URL.revokeObjectURL(pendingAudio.url);
  }, [pendingAudio]);
  useEffect(() => () => {
    if (pendingSign) URL.revokeObjectURL(pendingSign.url);
  }, [pendingSign]);

  const photoUrl = pendingPhoto?.url ?? (photoId ? mediaUrls[photoId] : undefined);
  const audioUrl = pendingAudio?.url ?? (audioId ? mediaUrls[audioId] : undefined);
  const signUrl = pendingSign?.url ?? (signId ? mediaUrls[signId] : undefined);
  const signMime = pendingSign?.mime ?? (signId ? mediaMime[signId] : undefined);

  const onSignFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!isSignFile(f.type)) {
      setError('Sign demonstrations must be a GIF, MP4, MOV or WebM file.');
      return;
    }
    if (f.size > MAX_SIGN_BYTES) {
      setError('That video is over 30 MB. Trim it to a few seconds and try again.');
      return;
    }
    setError('');
    setPendingSign({ blob: f, url: URL.createObjectURL(f), mime: f.type });
  };
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
      let nextAudioId = audioId;
      if (pendingAudio) {
        nextAudioId = newId('audio');
        media.push({ id: nextAudioId, kind: 'audio', mime: pendingAudio.blob.type || 'audio/webm', blob: pendingAudio.blob, createdAt: Date.now() });
      }
      let nextSignId = signId;
      if (pendingSign) {
        nextSignId = newId('sign');
        media.push({ id: nextSignId, kind: 'sign', mime: pendingSign.mime, blob: pendingSign.blob, createdAt: Date.now() });
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
        audioId: nextAudioId,
        signId: nextSignId,
        privateNote: privateNote.trim() || undefined,
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
                onClick={() =>
                  void speakTile(spoken || label, audioUrl, { rate: settings.speechRate, lang: settings.speechLang, voiceURI: settings.voiceURI })
                }
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
                  <GooglePhotosButton onPicked={(blob) => setCropFile(blob)} />
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
                <legend>Voice</legend>
                <p className="muted small">A recording plays instead of the device voice, and works offline.</p>
                <AudioRecorder
                  url={audioUrl}
                  onRecorded={(blob) => setPendingAudio({ blob, url: URL.createObjectURL(blob) })}
                  onRemove={() => {
                    setPendingAudio(null);
                    setAudioId(undefined);
                  }}
                />
              </fieldset>

              <fieldset className="field">
                <legend>Sign (ASL) demonstration</legend>
                <p className="muted small">
                  Add a short GIF or video of the sign — one you recorded, or from a resource you have permission to use. Mimzi doesn’t include
                  sign videos and never guesses signs. It plays only when “See sign” is tapped.
                </p>
                <div className="row">
                  <button type="button" className="btn" onClick={() => signInput.current?.click()}>
                    🤟 {signUrl ? 'Replace sign' : 'Add sign video'}
                  </button>
                  {signUrl && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => {
                        setPendingSign(null);
                        setSignId(undefined);
                      }}
                    >
                      Remove sign
                    </button>
                  )}
                </div>
                {signUrl &&
                  (signMime === 'image/gif' ? (
                    <img className="sign-preview" src={signUrl} alt="Sign preview" />
                  ) : (
                    <video className="sign-preview" src={signUrl} muted playsInline controls preload="metadata" data-testid="sign-preview" />
                  ))}
                <input ref={signInput} type="file" accept={SIGN_ACCEPT} hidden onChange={onSignFile} data-testid="sign-input" />
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

              <label className="field">
                <span>Private note (only shown in Parent Mode)</span>
                <textarea
                  value={privateNote}
                  onChange={(e) => setPrivateNote(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder={categoryId === 'food' ? 'e.g. only at grandma’s house' : ''}
                />
              </label>
              {categoryId === 'food' && (
                <p className="muted small">You choose every food that appears. Mimzi never suggests foods and can’t tell whether a food is safe for your child.</p>
              )}

              <label className="check">
                <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> Show in Favorites
              </label>
              <label className="check">
                <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hide for now (e.g. not available today — keeps its spot)
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
