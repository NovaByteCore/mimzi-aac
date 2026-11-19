import { useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { Icon } from '../components/Icon';

const MAX_QUICK = 6;

/**
 * Quick words: always on screen on every child page, set independently of the vocabulary
 * pages (an SLP can manage them here). Hiding a word on its page never removes it from here.
 */
export function QuickWordsPanel() {
  const { settings, updateSettings, tiles, categories } = useMimzi();
  const [addQuick, setAddQuick] = useState('');
  const liveTiles = tiles.filter((t) => !t.deletedAt);
  const tileById = new Map(liveTiles.map((t) => [t.id, t]));
  const quick = settings.quickTileIds.filter((id) => tileById.has(id));
  const moveQuick = (i: number, dir: -1 | 1) => {
    const next = [...quick];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    void updateSettings({ quickTileIds: next });
  };
  const hiddenOnPage = quick.filter((id) => tileById.get(id)?.hidden);
  return (
    <section className="panel settings">
      <h2>Quick words</h2>
      <p className="muted small">Always on screen on every child page. Keep the most important ones here (up to {MAX_QUICK}).</p>
      <ol className="quick-list" data-testid="quick-list">
        {quick.map((id, i) => (
          <li key={id} className="cat-row">
            <strong>{tileById.get(id)?.label}</strong>
            <span className="spacer" />
            <button type="button" className="icon-btn small" onClick={() => moveQuick(i, -1)} disabled={i === 0} aria-label={`Move ${tileById.get(id)?.label} up`}>
              <Icon name="up" />
            </button>
            <button type="button" className="icon-btn small" onClick={() => moveQuick(i, 1)} disabled={i === quick.length - 1} aria-label={`Move ${tileById.get(id)?.label} down`}>
              <Icon name="down" />
            </button>
            <button
              type="button"
              className="btn btn-quiet small"
              disabled={quick.length <= 1}
              onClick={() => updateSettings({ quickTileIds: quick.filter((q) => q !== id) })}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      {quick.length < MAX_QUICK && (
        <div className="add-row">
          <label className="field inline">
            <span>Add a quick word</span>
            <select value={addQuick} onChange={(e) => setAddQuick(e.target.value)} data-testid="quick-add-select">
              <option value="">Choose…</option>
              {[...categories]
                .sort((a, b) => a.order - b.order)
                .map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {liveTiles
                      .filter((t) => t.categoryId === c.id && !quick.includes(t.id))
                      .sort((a, b) => a.order - b.order)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            disabled={!addQuick}
            onClick={() => {
              void updateSettings({ quickTileIds: [...quick, addQuick] });
              setAddQuick('');
            }}
          >
            Add
          </button>
        </div>
      )}
      {hiddenOnPage.length > 0 && (
        <p className="muted small" data-testid="quick-hidden-note">
          {hiddenOnPage.map((id) => tileById.get(id)?.label).join(', ')} {hiddenOnPage.length === 1 ? 'is' : 'are'} hidden on {hiddenOnPage.length === 1 ? 'its' : 'their'} page but
          still here as quick words, so your child can always say {hiddenOnPage.length === 1 ? 'it' : 'them'}.
        </p>
      )}
    </section>
  );
}
