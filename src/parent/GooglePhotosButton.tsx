import { useRef, useState } from 'react';
import { googleConfigured, requestToken, SCOPES } from '../lib/google/auth';
import { pickFromGooglePhotos } from '../lib/google/photosPicker';
import { useMimzi } from '../state/MimziStore';

interface Props {
  onPicked: (blob: Blob) => void;
  className?: string;
}

/** "From Google Photos" — opens Google's own photo picker; Mimzi only receives the chosen photo. */
export function GooglePhotosButton({ onPicked, className }: Props) {
  const { sync } = useMimzi();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [link, setLink] = useState('');
  const abort = useRef<AbortController | null>(null);

  if (!googleConfigured()) return null;

  const start = async () => {
    setStatus('');
    setLink('');
    // Open the window during the tap so pop-up blockers allow it; it's pointed at Google once the session exists.
    const popup = window.open('', 'mimzi-google-photos', 'width=900,height=800');
    abort.current = new AbortController();
    setBusy(true);
    try {
      const token = await requestToken(SCOPES.photos, { loginHint: sync.account?.email });
      const [photo] = await pickFromGooglePhotos({
        token,
        popup,
        signal: abort.current.signal,
        onStatus: setStatus,
        onPickerUri: setLink,
      });
      setStatus('');
      setLink('');
      onPicked(photo.blob);
    } catch (e) {
      if (popup && !popup.closed) popup.close();
      setStatus(e instanceof Error ? e.message : 'Google Photos didn’t work. Try again.');
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  return (
    <span className="gphotos">
      {busy ? (
        <button type="button" className={`btn ${className ?? ''}`} onClick={() => abort.current?.abort()}>
          ✕ Stop waiting for Google Photos
        </button>
      ) : (
        <button type="button" className={`btn ${className ?? ''}`} onClick={start}>
          <span aria-hidden="true">☁️</span> From Google Photos
        </button>
      )}
      {link && (
        <a className="btn btn-primary" href={link} target="_blank" rel="noopener">
          Open Google Photos
        </a>
      )}
      {status && (
        <span className="muted small gphotos-status" role="status">
          {status}
        </span>
      )}
    </span>
  );
}
