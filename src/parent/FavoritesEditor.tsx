import { useRef, useState } from 'react';
import { useDialogFocus } from '../lib/useDialogFocus';
import { useMimzi } from '../state/MimziStore';

export function FavoritesEditor({ onClose }: { onClose: () => void }) {
  const { tiles, categories, saveTile } = useMimzi();
  const dialog = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useDialogFocus(dialog, onClose);

  const search = query.trim().toLowerCase();
  const words = tiles
    .filter((tile) => !tile.deletedAt && !tile.linkTo && (tile.favorite || !tile.hidden))
    .filter((tile) => tile.label.toLowerCase().includes(search))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="modal-backdrop" role="presentation">
      <div ref={dialog} className="modal editor-modal" role="dialog" aria-modal="true" aria-labelledby="favorites-title">
        <h2 id="favorites-title">Edit favorites</h2>
        <label className="field">
          Search words
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} data-autofocus />
        </label>
        {error && <p role="alert">{error}</p>}
        {words.length === 0 && <p>No matching words.</p>}
        <fieldset disabled={saving}>
          <legend>Words on the Favorites board</legend>
          {words.map((tile) => (
            <label className="field inline" key={tile.id}>
              <input type="checkbox" checked={tile.favorite} onChange={async (event) => {
                const favorite = event.target.checked;
                setSaving(true);
                setError('');
                try {
                  await saveTile({ ...tile, favorite });
                } catch {
                  setError('Could not save this favorite. Try again.');
                } finally {
                  setSaving(false);
                }
              }} />
              {tile.label} <small>{categories.find((page) => page.id === tile.categoryId)?.name}</small>
            </label>
          ))}
        </fieldset>
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
