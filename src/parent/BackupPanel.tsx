import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useMimzi } from '../state/MimziStore';
import { backupFileName, BackupError, parseBackup } from '../lib/backup';
import { storageEstimate, requestPersistentStorage } from '../lib/db';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from '../components/Icon';
import { GoogleSyncPanel } from './GoogleSyncPanel';

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function BackupPanel() {
  const { exportBackup, restoreBackup, settings } = useMimzi();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [estimate, setEstimate] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void storageEstimate().then(setEstimate);
  }, [status]);

  const doExport = async () => {
    setBusy(true);
    setError('');
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus(`Backup made: ${backup.tiles.length} words, ${backup.media.length} photos/recordings.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The backup could not be made.');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    try {
      const parsed = parseBackup(JSON.parse(await f.text()), settings.pin);
      setPending(parsed);
    } catch (err) {
      setError(err instanceof BackupError ? err.message : 'That file could not be read as a Mimzi backup.');
    }
  };

  return (
    <>
    <GoogleSyncPanel />
    <section className="panel">
      <h2>Backup file (optional)</h2>
      <p className="muted">
        Only needed without Google: saves everything as one file you keep yourself (for example on a computer), and puts a saved file back.
        With Google sign-in above, you don’t need this.
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={doExport} disabled={busy}>
          <Icon name="download" /> Make a backup file
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Icon name="upload" /> Restore from backup
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onFile} data-testid="restore-input" />
      </div>
      {status && <p role="status">{status}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <h3>Storage on this device</h3>
      {estimate ? (
        <p className="muted">
          Using about {formatBytes(estimate.usage)} of the space this browser allows ({formatBytes(estimate.quota)}).{' '}
          {estimate.persisted
            ? 'This browser has agreed to keep Mimzi’s data unless you remove it.'
            : 'This browser has not promised to keep Mimzi’s data, so regular backups matter.'}
        </p>
      ) : (
        <p className="muted">This browser doesn’t report storage use.</p>
      )}
      {estimate && !estimate.persisted && (
        <button type="button" className="btn btn-quiet" onClick={async () => setStatus((await requestPersistentStorage()) ? 'Storage protection turned on.' : 'This browser didn’t allow storage protection. Installing Mimzi to the Home Screen can help.')}>
          Ask the browser to protect Mimzi’s data
        </button>
      )}
      <p className="muted small">Backups contain your photos and recordings. They are never sent anywhere by Mimzi. The Parent PIN is not included.</p>

      {pending && (
        <ConfirmDialog
          title="Replace everything with this backup?"
          message={`This backup has ${pending.tiles.length} words and ${pending.media.length} photos/recordings. Everything currently on this device will be replaced.`}
          confirmLabel="Restore backup"
          danger
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const data = pending;
            setPending(null);
            setBusy(true);
            try {
              await restoreBackup(data);
              setStatus('Backup restored.');
            } catch (e) {
              setError(e instanceof Error ? `Restore failed: ${e.message}` : 'Restore failed.');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </section>
    </>
  );
}
