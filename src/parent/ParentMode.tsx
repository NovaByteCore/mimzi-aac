import { useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { WordsPanel } from './WordsPanel';
import { CategoriesPanel } from './CategoriesPanel';
import { SettingsPanel } from './SettingsPanel';
import { BackupPanel } from './BackupPanel';
import { DeletedPanel } from './DeletedPanel';
import { MyDayPanel } from './MyDayPanel';
import { MyWordsPanel } from './MyWordsPanel';
import { currentSyncState, syncStatusText } from '../lib/sync';

type Tab = 'words' | 'groups' | 'myday' | 'mywords' | 'settings' | 'backup' | 'deleted';

const TABS: { id: Tab; label: string }[] = [
  { id: 'words', label: 'Words & pictures' },
  { id: 'groups', label: 'Groups' },
  { id: 'myday', label: 'My Day' },
  { id: 'mywords', label: 'My Words' },
  { id: 'settings', label: 'Board & speech' },
  { id: 'backup', label: 'Backup' },
  { id: 'deleted', label: 'Recently deleted' },
];

export function ParentMode({ onExit }: { onExit: () => void }) {
  const { settings, tiles } = useMimzi();
  const [tab, setTab] = useState<Tab>('words');
  const deletedCount = tiles.filter((t) => t.deletedAt).length;

  return (
    <div className={`app parent-view${settings.highContrast ? ' high-contrast' : ''}`}>
      <header className="parent-header">
        <h1>
          <span aria-hidden="true">🔓</span> Parent Mode
        </h1>
        <span className="sync-status" data-testid="sync-status" title="Cross-device sync">
          <span aria-hidden="true">📱</span> {syncStatusText(currentSyncState())}
        </span>
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
        {tab === 'backup' && <BackupPanel />}
        {tab === 'deleted' && <DeletedPanel />}
      </main>
    </div>
  );
}
