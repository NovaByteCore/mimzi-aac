import { useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import type { MediaRecord, MyDay, ScheduleItem } from '../types';
import { ItemEditor } from './ItemEditor';
import { ConfirmDialog } from './ConfirmDialog';
import { MAX_TOKENS, MIN_TOKENS, moveStep, resetItems, setTokenCount } from '../lib/myday';
import { newId } from '../lib/id';

const fresh = (i: ScheduleItem): ScheduleItem => ({ ...i, done: false });

export function MyDayPanel() {
  const { myDay, updateMyDay } = useMimzi();
  const [draft, setDraft] = useState<MyDay>(myDay);
  const [pending, setPending] = useState<MediaRecord[]>([]);
  const [dirty, setDirty] = useState(false);
  const [names, setNames] = useState({ ft: '', reward: '', routine: '' });
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; run: () => void } | null>(null);

  const edit = (next: MyDay, media: MediaRecord[] = []) => {
    setDraft(next);
    if (media.length) setPending((p) => [...p, ...media]);
    setDirty(true);
    setStatus('');
  };

  const commit = async (next: MyDay, message: string) => {
    await updateMyDay(next, pending);
    setDraft(next);
    setPending([]);
    setDirty(false);
    setStatus(message);
  };

  const ft = draft.firstThen;
  const steps = draft.routine.steps;

  return (
    <section className="panel myday-panel">
      <div className="panel-head sticky-save">
        <h2>My Day</h2>
        <span className="spacer" />
        {dirty && <span className="muted small">Unsaved changes</span>}
        <button type="button" className="btn btn-primary" disabled={!dirty} onClick={() => commit(draft, 'Saved.')}>
          Save My Day
        </button>
      </div>
      {status && <p role="status">{status}</p>}
      <p className="muted">
        Set up the pictures here; your child sees them under <strong>My Day</strong>. On those screens, grown-ups press and hold to mark things done or
        add tokens. Never use My Day to hold back food, comfort, care, breaks or communication.
      </p>

      {/* ---------- First / Then ---------- */}
      <h3>First / Then</h3>
      <div className="two-col">
        <ItemEditor title="FIRST" testId="ft-first" item={ft.first} onChange={(first, m) => edit({ ...draft, firstThen: { ...ft, first } }, m)} />
        <ItemEditor title="THEN" testId="ft-then" item={ft.then} onChange={(then, m) => edit({ ...draft, firstThen: { ...ft, then } }, m)} />
      </div>
      <TemplateRow
        name={names.ft}
        onName={(v) => setNames({ ...names, ft: v })}
        templates={draft.firstThenTemplates}
        onSave={() =>
          commit(
            { ...draft, firstThenTemplates: [...draft.firstThenTemplates, { id: newId('ft'), name: names.ft.trim(), first: fresh(ft.first), then: fresh(ft.then) }] },
            `Saved “${names.ft.trim()}”.`,
          ).then(() => setNames({ ...names, ft: '' }))
        }
        onLoad={(id) => {
          const t = draft.firstThenTemplates.find((x) => x.id === id);
          if (t) void commit({ ...draft, firstThen: { first: fresh(t.first), then: fresh(t.then) } }, `Using “${t.name}”.`);
        }}
        onDelete={(id) => {
          const t = draft.firstThenTemplates.find((x) => x.id === id);
          setConfirm({ title: `Delete saved “${t?.name}”?`, run: () => void commit({ ...draft, firstThenTemplates: draft.firstThenTemplates.filter((x) => x.id !== id) }, 'Deleted.') });
        }}
      />

      {/* ---------- I'm working for ---------- */}
      <h3>I’m Working For</h3>
      <ItemEditor title="Reward or activity" testId="reward-item" item={draft.reward.item} onChange={(item, m) => edit({ ...draft, reward: { ...draft.reward, item } }, m)} />
      <label className="field">
        <span>Tokens to earn: {draft.reward.tokens}</span>
        <input
          type="range"
          min={MIN_TOKENS}
          max={MAX_TOKENS}
          step={1}
          value={draft.reward.tokens}
          onChange={(e) => edit({ ...draft, reward: setTokenCount(draft.reward, Number(e.target.value)) })}
          data-testid="token-count"
        />
      </label>
      <TemplateRow
        name={names.reward}
        onName={(v) => setNames({ ...names, reward: v })}
        templates={draft.rewardTemplates}
        onSave={() =>
          commit(
            { ...draft, rewardTemplates: [...draft.rewardTemplates, { id: newId('rw'), name: names.reward.trim(), item: fresh(draft.reward.item), tokens: draft.reward.tokens }] },
            `Saved “${names.reward.trim()}”.`,
          ).then(() => setNames({ ...names, reward: '' }))
        }
        onLoad={(id) => {
          const t = draft.rewardTemplates.find((x) => x.id === id);
          if (t) void commit({ ...draft, reward: { item: fresh(t.item), tokens: t.tokens, earned: 0 } }, `Using “${t.name}”.`);
        }}
        onDelete={(id) => {
          const t = draft.rewardTemplates.find((x) => x.id === id);
          setConfirm({ title: `Delete saved “${t?.name}”?`, run: () => void commit({ ...draft, rewardTemplates: draft.rewardTemplates.filter((x) => x.id !== id) }, 'Deleted.') });
        }}
      />

      {/* ---------- Routine ---------- */}
      <h3>My Three Steps · Now / Next / Later</h3>
      <fieldset className="field">
        <legend>Show the routine as</legend>
        <div className="row">
          <label className="check">
            <input type="radio" name="routine-layout" checked={draft.routineLayout === 'steps'} onChange={() => edit({ ...draft, routineLayout: 'steps' })} /> My Three Steps (1 · 2 · 3)
          </label>
          <label className="check">
            <input type="radio" name="routine-layout" checked={draft.routineLayout === 'nowNextLater'} onChange={() => edit({ ...draft, routineLayout: 'nowNextLater' })} /> Now / Next / Later
          </label>
        </div>
      </fieldset>
      {steps.map((s, i) => (
        <div key={i} className="step-edit">
          <ItemEditor
            title={`Step ${i + 1}`}
            testId={`step-${i + 1}`}
            item={s}
            onChange={(item, m) => edit({ ...draft, routine: { steps: steps.map((x, j) => (j === i ? item : x)) } }, m)}
          />
          <div className="move-col">
            <button type="button" className="icon-btn small" disabled={i === 0} onClick={() => edit({ ...draft, routine: { steps: moveStep(steps, i, -1) } })} aria-label={`Move step ${i + 1} up`}>
              ▲
            </button>
            <button type="button" className="icon-btn small" disabled={i === steps.length - 1} onClick={() => edit({ ...draft, routine: { steps: moveStep(steps, i, 1) } })} aria-label={`Move step ${i + 1} down`}>
              ▼
            </button>
          </div>
        </div>
      ))}
      <TemplateRow
        name={names.routine}
        onName={(v) => setNames({ ...names, routine: v })}
        templates={draft.routineTemplates}
        onSave={() =>
          commit(
            { ...draft, routineTemplates: [...draft.routineTemplates, { id: newId('rt'), name: names.routine.trim(), steps: resetItems(steps) }] },
            `Saved “${names.routine.trim()}”.`,
          ).then(() => setNames({ ...names, routine: '' }))
        }
        onLoad={(id) => {
          const t = draft.routineTemplates.find((x) => x.id === id);
          if (t) void commit({ ...draft, routine: { steps: resetItems(t.steps) } }, `Using “${t.name}”.`);
        }}
        onDelete={(id) => {
          const t = draft.routineTemplates.find((x) => x.id === id);
          setConfirm({ title: `Delete saved “${t?.name}”?`, run: () => void commit({ ...draft, routineTemplates: draft.routineTemplates.filter((x) => x.id !== id) }, 'Deleted.') });
        }}
      />

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message="This only removes the saved copy. What’s on screen now stays."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </section>
  );
}

function TemplateRow({
  name,
  onName,
  templates,
  onSave,
  onLoad,
  onDelete,
}: {
  name: string;
  onName: (v: string) => void;
  templates: { id: string; name: string }[];
  onSave: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="template-row">
      <div className="add-row">
        <label className="field inline">
          <span>Save these pictures as</span>
          <input value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Bedtime" maxLength={30} />
        </label>
        <button type="button" className="btn" disabled={!name.trim()} onClick={onSave}>
          Save for later
        </button>
      </div>
      {templates.length > 0 && (
        <ul className="template-list">
          {templates.map((t) => (
            <li key={t.id}>
              <button type="button" className="chip-btn" onClick={() => onLoad(t.id)}>
                Use “{t.name}”
              </button>
              <button type="button" className="icon-btn small" onClick={() => onDelete(t.id)} aria-label={`Delete saved ${t.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
