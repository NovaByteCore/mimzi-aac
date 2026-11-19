import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Category, MediaRecord, SymbolInfo, Tile } from '../types';
import { TILE_COLORS } from '../types';
import { useMimzi } from '../state/MimziStore';
import { SymbolSearch } from './SymbolSearch';
import { WORD_TYPE_LABEL, type WordType } from '../types';
import { displayColor } from '../lib/colors';
import { ASL_KEYS, ASL_SIGNS } from '../data/aslSigns';
import { TileFace } from '../components/TileFace';
import { PhotoCropper } from './PhotoCropper';
import { ConfirmDialog } from './ConfirmDialog';
import { newId } from '../lib/id';
import { nextOrder } from '../lib/grid';
import { speakTile } from '../lib/speech';
import { AudioRecorder } from './AudioRecorder';
import { GooglePhotosButton } from './GooglePhotosButton';
import { isSignFile, MAX_SIGN_BYTES, SIGN_ACCEPT } from '../lib/media';
import { Icon } from '../components/Icon';

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
  const [symbolInfo, setSymbolInfo] = useState<SymbolInfo | undefined>(tile?.symbolInfo);
  const [symbolAuto, setSymbolAuto] = useState(tile?.symbolAuto ?? false);
  const pickSymbol = (sym: string, info?: SymbolInfo) => {
    setSymbol(sym);
    setSymbolInfo(info);
    setSymbolAuto(false);
  };
  const picture = { symbol: symbol || undefined, symbolInfo, symbolAuto, autoArasaac: tile?.autoArasaac, fallbackSymbol: tile?.fallbackSymbol };
  const [aslSign, setAslSign] = useState(tile?.aslSign);
  const [pronunciation, setPronunciation] = useState(tile?.pronunciation ?? '');
  const [lang, setLang] = useState(tile?.lang ?? '');
  const [wordType, setWordType] = useState<WordType | ''>(tile?.wordType ?? (isNewTypeGuess(defaultCategoryId)));
  const [linkTo, setLinkTo] = useState(tile?.linkTo ?? '');
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
        ...(tile ?? {}),
        id: tile?.id ?? newId('tile'),
        label: cleanLabel,
        speak: (spoken || cleanLabel).trim(),
        categoryId,
        order: tile && !movedCategory ? tile.order : nextOrder(tiles, categoryId),
        symbol: symbol.trim() || undefined,
        symbolInfo: symbol.trim() && /^(arasaac|os|mul|svg):/.test(symbol) ? symbolInfo : undefined,
        symbolAuto: symbolAuto || undefined,
        aslSign,
        pronunciation: pronunciation.trim() || undefined,
        lang: lang.trim() || undefined,
        wordType: wordType || undefined,
        linkTo: linkTo || undefined,
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
              <div className={`tile tile-${displayColor({ color, wordType: wordType || undefined }, settings)} tile-preview${photoUrl ? ' tile-has-photo' : ''}`} aria-hidden="true">
                <span className="tile-media">
                  <TileFace tile={picture} asl={aslSign} photoUrl={photoUrl} label={label || '?'} />
                </span>
                <span className="tile-label">{label || 'Word'}</span>
              </div>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() =>
                  void speakTile(pronunciation.trim() || spoken || label, audioUrl, {
                    rate: settings.speechRate,
                    lang: lang.trim() || settings.speechLang,
                    voiceURI: settings.voiceURI,
                    voiceName: settings.voiceName,
                    sharedVoiceName: settings.sharedVoiceName,
                    pitch: settings.speechPitch,
                    volume: settings.speechVolume,
                  })
                }
                disabled={!label.trim()}
              >
                <Icon name="speak" /> Hear it
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
                <span>Pronunciation (optional — only changes how the voice says it)</span>
                <input value={pronunciation} onChange={(e) => setPronunciation(e.target.value)} maxLength={120} placeholder="e.g. Ree-ah for Ria" data-testid="pronunciation" />
              </label>
              <div className="form-grid">
                <label className="field inline">
                  <span>Word type (colour)</span>
                  <select value={wordType} onChange={(e) => setWordType(e.target.value as WordType | '')} data-testid="word-type">
                    <option value="">None (use tile colour)</option>
                    {(Object.keys(WORD_TYPE_LABEL) as WordType[]).map((k) => (
                      <option key={k} value={k}>
                        {WORD_TYPE_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field inline">
                  <span>Voice language (optional)</span>
                  <input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="e.g. es-US" maxLength={12} />
                </label>
              </div>
              <label className="field">
                <span>Page</span>
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
                    <Icon name="camera" /> Take photo
                  </button>
                  <button type="button" className="btn" onClick={() => libraryInput.current?.click()}>
                    <Icon name="image" /> Choose photo
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
                <legend>ASL sign drawing</legend>
                <div className="symbol-picker asl-picker">
                  <button type="button" className={`symbol-choice${!aslSign ? ' symbol-on' : ''}`} onClick={() => setAslSign(undefined)} aria-pressed={!aslSign}>
                    None
                  </button>
                  {ASL_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`symbol-choice${aslSign === k ? ' symbol-on' : ''}`}
                      onClick={() => setAslSign(k)}
                      aria-label={`ASL drawing ${ASL_SIGNS[k].gloss}`}
                      aria-pressed={aslSign === k}
                    >
                      <TileFace asl={k} forceAsl label={k} />
                    </button>
                  ))}
                </div>
                {aslSign && ASL_SIGNS[aslSign] && (
                  <p className="muted small" data-testid="asl-how">
                    <strong>{ASL_SIGNS[aslSign].gloss}:</strong> {ASL_SIGNS[aslSign].how}{' '}
                    <a href={ASL_SIGNS[aslSign].source} target="_blank" rel="noopener noreferrer">
                      Reference
                    </a>
                  </p>
                )}
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
                    {signUrl ? 'Replace sign video' : 'Add sign video'}
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

              <label className="field">
                <span>Button opens a page (folder)</span>
                <select value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
                  <option value="">No — this button speaks</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      Opens “{c.name}”
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="field">
                <legend>AAC picture (a real photo, if added, is shown instead)</legend>
                {tile?.fallbackSymbol && (
                  <div className="row">
                    <span className="muted small" data-testid="symbol-mode">
                      {symbolAuto ? 'Mimzi chooses this picture (default style).' : 'You chose this picture.'}
                    </span>
                    {!symbolAuto && (
                      <button
                        type="button"
                        className="btn btn-quiet small"
                        data-testid="symbol-auto"
                        onClick={() => {
                          setSymbol(tile.fallbackSymbol ?? '');
                          setSymbolInfo(undefined);
                          setSymbolAuto(true);
                        }}
                      >
                        Use Mimzi’s default picture
                      </button>
                    )}
                  </div>
                )}
                <SymbolSearch suggest={label} selected={symbolAuto ? undefined : symbol} onPick={pickSymbol} />
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

function isNewTypeGuess(categoryId: string): WordType | '' {
  const guess: Record<string, WordType> = { food: 'noun', play: 'noun', body: 'noun', places: 'noun', actions: 'verb', feelings: 'describe', describe: 'describe', family: 'pronoun', questions: 'question', social: 'social', phrases: 'social' };
  return guess[categoryId] ?? '';
}
