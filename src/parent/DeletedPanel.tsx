import { useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { TileFace } from '../components/TileFace';
import { ConfirmDialog } from './ConfirmDialog';
import type { Tile } from '../types';

export function DeletedPanel() {
  const { tiles, categories, mediaUrls, restoreTile, purgeTile } = useMimzi();
  const deleted = tiles.filter((t) => t.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  const [toPurge, setToPurge] = useState<Tile | null>(null);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Core';

  return (
    <section className="panel">
      <h2>Recently deleted</h2>
      {deleted.length === 0 ? (
        <p className="muted">Nothing here. Deleted words wait here until you restore them or delete them for good.</p>
      ) : (
        <ul className="deleted-list">
          {deleted.map((t) => (
            <li key={t.id} className="deleted-row" data-deleted-tile={t.id}>
              <span className={`mini-tile tile-${t.color}`}>
                <TileFace symbol={t.symbol} photoUrl={t.photoId ? mediaUrls[t.photoId] : undefined} label={t.label} />
              </span>
              <span>
                <strong>{t.label}</strong>
                <span className="muted small"> · {catName(t.categoryId)}</span>
              </span>
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => restoreTile(t.id)}>
                Restore
              </button>
              <button type="button" className="btn btn-danger-quiet" onClick={() => setToPurge(t)}>
                Delete forever
              </button>
            </li>
          ))}
        </ul>
      )}
      {toPurge && (
        <ConfirmDialog
          title={`Delete “${toPurge.label}” forever?`}
          message="Its photo and recording will be removed from this device. This can’t be undone (unless you have a backup)."
          confirmLabel="Delete forever"
          danger
          onCancel={() => setToPurge(null)}
          onConfirm={async () => {
            await purgeTile(toPurge.id);
            setToPurge(null);
          }}
        />
      )}
    </section>
  );
}
