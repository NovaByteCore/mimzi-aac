import { useEffect, useRef, useState } from 'react';
import { pickRecordingMime } from '../lib/media';

interface Props {
  /** URL of the current recording, if any. */
  url?: string;
  onRecorded: (blob: Blob) => void;
  onRemove: () => void;
  maxSeconds?: number;
  label?: string;
}

type State = 'idle' | 'starting' | 'recording';

/** Record a caregiver's voice with the device microphone. Stays on the device. */
export function AudioRecorder({ url, onRecorded, onRemove, maxSeconds = 10, label = 'Record your voice' }: Props) {
  const [state, setState] = useState<State>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const cleanup = () => {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
  };
  useEffect(() => () => cleanup(), []);

  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

  const start = async () => {
    setError('');
    if (!supported) {
      setError('This browser can’t record audio. Try Safari on iPad or Chrome on Android, from the HTTPS address.');
      return;
    }
    setState('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecordingMime((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        cleanup();
        setState('idle');
        if (blob.size > 0) onRecorded(blob);
        else setError('Nothing was recorded. Check the microphone and try again.');
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      setState('recording');
      const startedAt = Date.now();
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(s);
        if (s >= maxSeconds) stop();
      }, 250);
    } catch (e) {
      cleanup();
      setState('idle');
      const name = e instanceof DOMException ? e.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Microphone permission was declined. Allow the microphone for this site in the browser settings.'
          : 'The microphone could not start.',
      );
    }
  };

  const stop = () => {
    clearInterval(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  return (
    <div className="recorder">
      <div className="row">
        {state === 'recording' ? (
          <button type="button" className="btn btn-danger" onClick={stop}>
            ⏹ Stop ({seconds}s)
          </button>
        ) : (
          <button type="button" className="btn" onClick={start} disabled={state === 'starting'}>
            🎙️ {url ? 'Record again' : label}
          </button>
        )}
        {url && state === 'idle' && (
          <>
            <audio src={url} controls preload="none" className="recorder-audio" />
            <button type="button" className="btn btn-quiet" onClick={onRemove}>
              Remove recording
            </button>
          </>
        )}
      </div>
      {state === 'recording' && <p className="muted small" role="status">Recording… speak clearly, close to the device.</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
