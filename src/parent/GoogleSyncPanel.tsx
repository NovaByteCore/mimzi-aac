import { useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { googleConfigured } from '../lib/google/auth';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from '../components/Icon';

export function GoogleSyncPanel() {
  const { sync, googleSignIn, googleSignOut, syncNow } = useMimzi();
  const [confirmOut, setConfirmOut] = useState(false);
  const busy = sync.phase === 'syncing';

  return (
    <section className="panel">
      <h2>Google account & sync</h2>

      {!googleConfigured() ? (
        <div className="notice" data-testid="google-not-configured">
          <p>
            <strong>Google sign-in isn’t set up for this copy of Mimzi yet.</strong> A grown-up needs to create a free Google sign-in key once
            and add it to the website settings — the steps are in <code>docs/GOOGLE_SETUP.md</code>. Until then, use Backup to move Mimzi
            between devices.
          </p>
        </div>
      ) : !sync.account ? (
        <>
          <p>
            Sign in with Google to keep Mimzi the same on every device. Your words, photos, voice recordings, sign videos, My Day and My Words
            are saved in a <strong>hidden Mimzi folder in your own Google Drive</strong> that only Mimzi can open. Nothing is shared or made
            public.
          </p>
          <p className="muted">
            On a new iPad or phone: install Mimzi, open Parent Mode, and sign in with the same Google account — everything comes back. Mimzi
            still works with no internet; it syncs when you’re online.
          </p>
          <button type="button" className="btn btn-primary big-btn" onClick={() => googleSignIn()} disabled={busy}>
            <Icon name="lock" /> Sign in with Google
          </button>
        </>
      ) : (
        <>
          <p data-testid="google-account">
            Signed in as <strong>{sync.account.name || sync.account.email}</strong>
            {sync.account.name && <span className="muted"> ({sync.account.email})</span>}
          </p>
          <p className="muted" data-testid="sync-last">
            {sync.lastSyncedAt ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString()}.` : 'Not synced yet.'}
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary big-btn" onClick={() => syncNow(true)} disabled={busy}>
              {busy ? 'Syncing…' : <><Icon name="reset" /> Sync now</>}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setConfirmOut(true)} disabled={busy}>
              Sign out
            </button>
          </div>
          <p className="muted small">
            Mimzi syncs automatically when you open or close Parent Mode (if you’ve signed in within the last hour). Token stars and checkmarks
            your child earns are saved on this device and sync the next time you sync.
          </p>
        </>
      )}

      {sync.message && (
        <p className={sync.phase === 'error' ? 'form-error' : 'muted'} role="status" data-testid="sync-message">
          {sync.message}
        </p>
      )}

      {confirmOut && (
        <ConfirmDialog
          title="Sign out of Google?"
          message="Everything stays on this device and in your Google Drive. This device just stops syncing until you sign in again."
          confirmLabel="Sign out"
          onCancel={() => setConfirmOut(false)}
          onConfirm={async () => {
            setConfirmOut(false);
            await googleSignOut();
          }}
        />
      )}
    </section>
  );
}
