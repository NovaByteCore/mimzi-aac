import { useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { createPinRecord, isValidPin, verifyPin } from '../lib/pin';

interface Props {
  onUnlock: () => void;
  onCancel: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function ParentGate({ onUnlock, onCancel }: Props) {
  const { settings, updateSettings } = useMimzi();
  const creating = !settings.pin;
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const title = creating
    ? step === 'enter'
      ? 'Create a Parent PIN'
      : 'Type the PIN again'
    : 'Parent PIN';

  const press = (k: string) => {
    setMessage('');
    if (k === '⌫') setPin((p) => p.slice(0, -1));
    else if (k && pin.length < 8) setPin((p) => p + k);
  };

  const submit = async () => {
    if (!isValidPin(pin)) {
      setMessage('Use 4 to 8 numbers.');
      return;
    }
    setBusy(true);
    try {
      if (creating && step === 'enter') {
        setFirst(pin);
        setPin('');
        setStep('confirm');
      } else if (creating) {
        if (pin !== first) {
          setMessage('Those PINs didn’t match. Start again.');
          setPin('');
          setFirst('');
          setStep('enter');
        } else {
          await updateSettings({ pin: await createPinRecord(pin) });
          onUnlock();
        }
      } else if (settings.pin && (await verifyPin(pin, settings.pin))) {
        onUnlock();
      } else {
        setMessage('That PIN isn’t right.');
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal pin-modal" role="dialog" aria-modal="true" aria-labelledby="pin-title">
        <h2 id="pin-title">{title}</h2>
        {creating && step === 'enter' && (
          <p className="muted">This keeps editing screens away from little fingers. Use 4 to 8 numbers.</p>
        )}
        <div className="pin-dots" aria-label={`${pin.length} digits entered`} data-testid="pin-dots">
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span key={i} className={`pin-dot${i < pin.length ? ' pin-dot-on' : ''}`} />
          ))}
        </div>
        <p className="pin-message" role="alert">
          {message}
        </p>
        <div className="pin-pad">
          {KEYS.map((k, i) =>
            k ? (
              <button key={i} type="button" className="pin-key" onClick={() => press(k)} aria-label={k === '⌫' ? 'Delete digit' : k} disabled={busy}>
                {k}
              </button>
            ) : (
              <span key={i} />
            ),
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || pin.length < 4}>
            {creating && step === 'enter' ? 'Next' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}
