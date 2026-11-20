import { useMemo, useState } from 'react';
import { PicturePicker } from './PicturePicker';
import { useMimzi } from '../state/MimziStore';
import { TileFace } from '../components/TileFace';
import { ConfirmDialog } from './ConfirmDialog';
import { newId } from '../lib/id';
import type { Category } from '../types';
import { Icon } from '../components/Icon';

export function CategoriesPanel() {
  const { categories, tiles, saveCategory, saveCategories, deleteCategory } = useMimzi();
  const sorted = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sorted.length) return;
    const list = sorted.map((c, i) => ({ ...c, order: i }));
    [list[idx], list[target]] = [list[target], list[idx]];
    await saveCategories(list.map((c, i) => ({ ...c, order: i })));
  };

  const add = async () => {
    const clean = name.trim();
    if (!clean) {
      setError('Give the group a name.');
      return;
    }
    setError('');
    await saveCategory({
      id: newId('cat'),
      name: clean,
      symbol: emoji || 'mul:star',
      color: 'cream',
      order: sorted.length,
      hidden: false,
      builtIn: false,
    });
    setName('');
    setEmoji('');
  };

  return (
    <section className="panel">
      <h2>Groups</h2>
      <p className="muted">Groups are the buttons along the side of the Talk board. Hiding a group keeps its words safe.</p>
      <ul className="cat-list">
        {sorted.map((c, i) => {
          const count = tiles.filter((t) => t.categoryId === c.id && !t.deletedAt).length;
          return (
            <li key={c.id} className={`cat-row tile-${c.color}${c.hidden ? ' cat-hidden' : ''}`}>
              <span className="cat-icon">
                <TileFace symbol={c.symbol} label={c.name} />
              </span>
              <input
                className="cat-name"
                aria-label={`Name of group ${c.name}`}
                defaultValue={c.name}
                maxLength={24}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== c.name) void saveCategory({ ...c, name: v });
                  else e.target.value = c.name;
                }}
              />
              <span className="muted small">{count} words</span>
              <span className="spacer" />
              <button type="button" className="icon-btn small" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${c.name} up`}>
                <Icon name="up" />
              </button>
              <button type="button" className="icon-btn small" onClick={() => move(i, 1)} disabled={i === sorted.length - 1} aria-label={`Move ${c.name} down`}>
                <Icon name="down" />
              </button>
              <button type="button" className="btn btn-quiet small" onClick={() => saveCategory({ ...c, hidden: !c.hidden })}>
                {c.hidden ? 'Show' : 'Hide'}
              </button>
              {!c.builtIn && (
                <button
                  type="button"
                  className="btn btn-danger-quiet small"
                  onClick={() => (count ? setError(`“${c.name}” still has words. Move or delete them first, or hide the group.`) : setToDelete(c))}
                >
                  Delete
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="add-row">
        <label className="field inline">
          <span>New group</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bath time" maxLength={24} />
        </label>
        <button type="button" className="btn btn-primary" onClick={add}>
          Add group
        </button>
      </div>
      <details className="field">
        <summary>Page picture (optional — a star if you skip this)</summary>
        <PicturePicker inline showBack={false} allowPhoto={false} suggest={name} onCancel={() => undefined} onUse={(p) => p.kind === 'symbol' && setEmoji(p.symbol)} />
      </details>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete group “${toDelete.name}”?`}
          message="This group is empty. Deleting it can’t be undone."
          confirmLabel="Delete group"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            try {
              await deleteCategory(toDelete.id);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
            setToDelete(null);
          }}
        />
      )}
    </section>
  );
}
