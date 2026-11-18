import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  url: string;
  mime: string;
  loop: boolean;
  speed: number;
  onClose: () => void;
}

/** Shows one caregiver-provided sign demonstration. Only ever opened by a tap — never autoplays on the board. */
export function SignPlayer({ label, url, mime, loop, speed, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const isGif = mime === 'image/gif';

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.playbackRate = speed;
    v.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, [speed]);

  return (
    <div className="modal-backdrop sign-backdrop" role="presentation" onClick={onClose}>
      <div className="modal sign-modal" role="dialog" aria-modal="true" aria-label={`Sign for ${label}`} onClick={(e) => e.stopPropagation()}>
        <h2 className="sign-title">{label}</h2>
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
        <div className="modal-actions sign-actions">
          {!isGif && (
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
          )}
          {!isGif && (
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
          )}
          <button type="button" className="btn btn-primary big-btn" onClick={onClose}>
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
}
