import { useMimzi } from '../state/MimziStore';
import { WordsPanel } from './WordsPanel';
import { CategoriesPanel } from './CategoriesPanel';
import { SettingsPanel } from './SettingsPanel';
import { BackupPanel } from './BackupPanel';
import { DeletedPanel } from './DeletedPanel';
import { MyDayPanel } from './MyDayPanel';
import { MyWordsPanel } from './MyWordsPanel';
import { GoogleSyncPanel } from './GoogleSyncPanel';
import { useEffect, useState } from 'react';

type Tab = 'words' | 'groups' | 'myday' | 'mywords' | 'settings' | 'google' | 'backup' | 'deleted';

const TABS: { id: Tab; label: string }[] = [
  { id: 'words', label: 'Words & pictures' },
  { id: 'groups', label: 'Groups' },
  { id: 'myday', label: 'My Day' },
  { id: 'mywords', label: 'My Words' },
  { id: 'settings', label: 'Board & speech' },
  { id: 'google', label: 'Google & sync' },
  { id: 'backup', label: 'Backup' },
  { id: 'deleted', label: 'Recently deleted' },
];

export function ParentMode({ onExit }: { onExit: () => void }) {
  const { settings, tiles, sync, syncNow } = useMimzi();
  const [tab, setTab] = useState<Tab>('words');
  // Quietly sync when Parent Mode opens and closes, if a recent Google sign-in is still valid.
  useEffect(() => {
    void syncNow(false);
    return () => {
      void syncNow(false);
    };
  }, [syncNow]);
  const syncLabel = !sync.account
    ? 'This device only — not signed in'
    : sync.phase === 'syncing'
      ? 'Syncing…'
      : sync.phase === 'error'
        ? 'Sync needs attention'
        : sync.lastSyncedAt
          ? `Synced ${new Date(sync.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          : 'Signed in';
  const deletedCount = tiles.filter((t) => t.deletedAt).length;

  return (
    <div className={`app parent-view${settings.highContrast ? ' high-contrast' : ''}`}>
      <header className="parent-header">
        <h1>
          <span aria-hidden="true">🔓</span> Parent Mode
        </h1>
        <button type="button" className="sync-status" data-testid="sync-status" onClick={() => setTab('google')}>
          <span aria-hidden="true">{sync.account ? (sync.phase === 'error' ? '⚠️' : '☁️') : '📱'}</span> {syncLabel}
        </button>
        <button type="button" className="btn btn-primary" onClick={onExit}>
          Done — back to Talk
        </button>
      </header>
      <nav className="parent-tabs" role="tablist" aria-label="Parent Mode sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`parent-tab${tab === t.id ? ' parent-tab-on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'deleted' && deletedCount > 0 ? ` (${deletedCount})` : ''}
          </button>
        ))}
      </nav>
      <main className="parent-main" role="tabpanel">
        {tab === 'words' && <WordsPanel />}
        {tab === 'groups' && <CategoriesPanel />}
        {tab === 'myday' && <MyDayPanel />}
        {tab === 'mywords' && <MyWordsPanel />}
        {tab === 'settings' && <SettingsPanel />}
        {tab === 'google' && <GoogleSyncPanel />}
        {tab === 'backup' && <BackupPanel />}
        {tab === 'deleted' && <DeletedPanel />}
      </main>
    </div>
  );
}
