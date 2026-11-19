import { useEffect, useRef, useState } from 'react';
import { AslSignSvg, ASL_SIGNS } from '../data/aslSigns';

interface Props {
  label: string;
  /** Caregiver-provided GIF/video, if any. */
  url?: string;
  mime: string;
  /** Mimzi ASL drawing key, if this word has one. */
  aslSign?: string;
  loop: boolean;
  speed: number;
  onClose: () => void;
}

/**
 * "See sign" — opened only by a tap, never autoplays on the board, and never speaks
 * (so it can't interfere with the AAC voice). Shows the family's own sign video when
 * there is one, otherwise Mimzi's ASL drawing with a short description.
 */
export function SignPlayer({ label, url, mime, aslSign, loop, speed, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<'video' | 'drawing'>(url ? 'video' : 'drawing');
  const isGif = mime === 'image/gif';
  const drawing = aslSign ? ASL_SIGNS[aslSign] : undefined;

  useEffect(() => {
    const v = video.current;
    if (!v || mode !== 'video') return;
    v.playbackRate = speed;
    v.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, [speed, mode]);

  return (
    <div className="modal-backdrop sign-backdrop" role="presentation" onClick={onClose}>
      <div className="modal sign-modal" role="dialog" aria-modal="true" aria-label={`Sign for ${label}`} onClick={(e) => e.stopPropagation()}>
        <h2 className="sign-title">{label}</h2>
        {url && drawing && (
          <div className="row sign-switch">
            <button type="button" className={`chip-btn${mode === 'video' ? ' chip-btn-on' : ''}`} onClick={() => setMode('video')}>
              Video
            </button>
            <button type="button" className={`chip-btn${mode === 'drawing' ? ' chip-btn-on' : ''}`} onClick={() => setMode('drawing')}>
              Drawing
            </button>
          </div>
        )}
        {mode === 'video' && url ? (
          <div className="sign-media">
            {isGif ? (
              <img src={url} alt={`Sign for ${label}`} />
            ) : (
              <video
                ref={video}
                src={url}
                muted
                playsInline
                loop={loop}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                aria-label={`Sign for ${label}`}
              />
            )}
          </div>
        ) : drawing ? (
          <div className="sign-drawing" data-testid="sign-drawing">
            <AslSignSvg name={aslSign!} />
            <p>
              <strong>ASL {drawing.gloss}:</strong> {drawing.how}
            </p>
          </div>
        ) : (
          <p className="muted">No sign added for this word yet.</p>
        )}
        <div className="modal-actions sign-actions">
          {mode === 'video' && url && !isGif && (
            <>
              <button
                type="button"
                className="btn big-btn"
                onClick={() => {
                  const v = video.current;
                  if (!v) return;
                  if (playing) v.pause();
                  else {
                    if (v.ended) v.currentTime = 0;
                    void v.play();
                  }
                }}
              >
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <button
                type="button"
                className="btn big-btn"
                onClick={() => {
                  const v = video.current;
                  if (!v) return;
                  v.currentTime = 0;
                  void v.play();
                }}
              >
                🔁 Again
              </button>
            </>
          )}
          <button type="button" className="btn btn-primary big-btn" onClick={onClose}>
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
}
