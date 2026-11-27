import { useMimzi } from '../state/MimziStore';
import { WordsPanel } from './WordsPanel';
import { BoardPreview } from './BoardPreview';
import { CategoriesPanel } from './CategoriesPanel';
import { SettingsPanel } from './SettingsPanel';
import { QuickWordsPanel } from './QuickWordsPanel';
import { BackupPanel } from './BackupPanel';
import { DeletedPanel } from './DeletedPanel';
import { VisualSchedulesPanel } from './schedule/VisualSchedulesPanel';
import { Icon } from '../components/Icon';
import { MyWordsPanel } from './MyWordsPanel';
import { GoogleSyncPanel } from './GoogleSyncPanel';
import { WordsOnBoardPanel } from './WordsOnBoardPanel';
import { GrowPanel } from './GrowPanel';
import { VoicePanel } from './VoicePanel';
import { PhotoLibraryPanel, SymbolLibraryPanel } from './LibraryPanels';
import { pendingItems } from '../lib/grow';
import { useEffect, useState } from 'react';

export type Tab =
  | 'words'
  | 'wob'
  | 'grow'
  | 'groups'
  | 'quick'
  | 'symbols'
  | 'photos'
  | 'voice'
  | 'myday'
  | 'mywords'
  | 'settings'
  | 'google'
  | 'backup'
  | 'deleted';

const SECTIONS: { title: string; tabs: { id: Tab; label: string }[] }[] = [
  {
    title: 'Talk board',
    tabs: [
      { id: 'words', label: 'Edit AAC board' },
      { id: 'wob', label: 'Manage words' },
      { id: 'grow', label: 'Grow My Words' },
      { id: 'groups', label: 'Pages' },
      { id: 'quick', label: 'Quick words' },
    ],
  },
  { title: 'Visual schedules', tabs: [{ id: 'myday', label: 'Visual schedules' }] },
  {
    title: 'Pictures & voice',
    tabs: [
      { id: 'voice', label: 'Mimzi Voice' },
      { id: 'symbols', label: 'Symbol Library' },
      { id: 'photos', label: 'Photo Library' },
    ],
  },
  { title: 'Progress', tabs: [{ id: 'mywords', label: 'My Words' }] },
  {
    title: 'Settings & data',
    tabs: [
      { id: 'settings', label: 'Board & accessibility' },
      { id: 'google', label: 'Google & sync' },
      { id: 'backup', label: 'Backup' },
      { id: 'deleted', label: 'Recently deleted' },
    ],
  },
];

/** Where Parent Mode opens: a tab, and for Words, the page to show (e.g. "Edit" on My People). */
export interface ParentStart {
  tab: Tab;
  categoryId?: string;
}

export function ParentMode({ onExit, start }: { onExit: () => void; start?: ParentStart }) {
  const { settings, tiles, sync, syncNow, grow } = useMimzi();
  const waiting = grow.remind ? pendingItems(grow).length : 0;
  const [tab, setTab] = useState<Tab>(start?.tab ?? 'words');
  const [previewPage, setPreviewPage] = useState<string | undefined>(start?.categoryId);
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
          <Icon name="unlock" size={26} /> Parent Mode
        </h1>
        <button type="button" className="sync-status" data-testid="sync-status" onClick={() => setTab('google')}>
          <Icon name={sync.account ? (sync.phase === 'error' ? 'warn' : 'cloud') : 'device'} /> {syncLabel}
        </button>
        <button type="button" className="btn btn-primary" onClick={onExit}>
          Done — back to Talk
        </button>
      </header>
      <nav className="parent-tabs" role="tablist" aria-label="Parent Mode sections">
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="parent-tab-group" role="presentation">
            <span className="parent-tab-group-title" aria-hidden="true">
              {sec.title}
            </span>
            {sec.tabs.map((t) => (
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
          </div>
        ))}
      </nav>
      {waiting > 0 && tab !== 'grow' && (
        <button type="button" className="grow-banner" onClick={() => setTab('grow')} data-testid="grow-banner">
          <Icon name="sprout" /> {waiting} new word{waiting === 1 ? ' is' : 's are'} ready for your OK — open Grow My Words
        </button>
      )}
      <main className="parent-main" role="tabpanel">
        {(tab === 'words' || tab === 'wob' || tab === 'groups' || tab === 'quick' || tab === 'settings') && (
          <BoardPreview page={tab === 'words' && previewPage && !previewPage.startsWith('__') ? previewPage : undefined} />
        )}
        {tab === 'words' && <WordsPanel initialCategoryId={start?.categoryId} onCategory={setPreviewPage} />}
        {tab === 'wob' && <WordsOnBoardPanel />}
        {tab === 'grow' && <GrowPanel />}
        {tab === 'groups' && <CategoriesPanel />}
        {tab === 'quick' && <QuickWordsPanel />}
        {tab === 'voice' && <VoicePanel />}
        {tab === 'symbols' && <SymbolLibraryPanel />}
        {tab === 'photos' && <PhotoLibraryPanel />}
        {tab === 'myday' && <VisualSchedulesPanel />}
        {tab === 'mywords' && <MyWordsPanel />}
        {tab === 'settings' && <SettingsPanel />}
        {tab === 'google' && <GoogleSyncPanel />}
        {tab === 'backup' && <BackupPanel />}
        {tab === 'deleted' && <DeletedPanel />}
      </main>
    </div>
  );
}
