import { useMimzi } from '../state/MimziStore';
import { WordsPanel } from './WordsPanel';
import { CategoriesPanel } from './CategoriesPanel';
import { SettingsPanel } from './SettingsPanel';
import { BackupPanel } from './BackupPanel';
import { DeletedPanel } from './DeletedPanel';
import { MyDayPanel } from './MyDayPanel';
import { MyWordsPanel } from './MyWordsPanel';
import { GoogleSyncPanel } from './GoogleSyncPanel';
import { WordsOnBoardPanel } from './WordsOnBoardPanel';
import { GrowPanel } from './GrowPanel';
import { VoicePanel } from './VoicePanel';
import { AslLibraryPanel, PhotoLibraryPanel, SymbolLibraryPanel } from './LibraryPanels';
import { pendingItems } from '../lib/grow';
import { useEffect, useState } from 'react';

type Tab =
  | 'words'
  | 'wob'
  | 'grow'
  | 'groups'
  | 'symbols'
  | 'photos'
  | 'voice'
  | 'asl'
  | 'myday'
  | 'mywords'
  | 'settings'
  | 'google'
  | 'backup'
  | 'deleted';

const TABS: { id: Tab; label: string }[] = [
  { id: 'words', label: 'Edit AAC board' },
  { id: 'wob', label: 'Words on My Board' },
  { id: 'grow', label: 'Grow My Words' },
  { id: 'groups', label: 'Pages' },
  { id: 'voice', label: 'Mimzi Voice' },
  { id: 'symbols', label: 'Symbol Library' },
  { id: 'photos', label: 'Photo Library' },
  { id: 'asl', label: 'ASL Library' },
  { id: 'myday', label: 'Visual schedules' },
  { id: 'mywords', label: 'My Words' },
  { id: 'settings', label: 'Board & accessibility' },
  { id: 'google', label: 'Google & sync' },
  { id: 'backup', label: 'Backup' },
  { id: 'deleted', label: 'Recently deleted' },
];

export function ParentMode({ onExit }: { onExit: () => void }) {
  const { settings, tiles, sync, syncNow, grow } = useMimzi();
  const waiting = grow.remind ? pendingItems(grow).length : 0;
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
      {waiting > 0 && tab !== 'grow' && (
        <button type="button" className="grow-banner" onClick={() => setTab('grow')} data-testid="grow-banner">
          🌱 {waiting} new word{waiting === 1 ? ' is' : 's are'} ready for your OK — open Grow My Words
        </button>
      )}
      <main className="parent-main" role="tabpanel">
        {tab === 'words' && <WordsPanel />}
        {tab === 'wob' && <WordsOnBoardPanel />}
        {tab === 'grow' && <GrowPanel />}
        {tab === 'groups' && <CategoriesPanel />}
        {tab === 'voice' && <VoicePanel />}
        {tab === 'symbols' && <SymbolLibraryPanel />}
        {tab === 'photos' && <PhotoLibraryPanel />}
        {tab === 'asl' && <AslLibraryPanel />}
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
