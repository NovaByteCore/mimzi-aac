import { useMemo, useState } from 'react';
import { useMimzi } from '../../state/MimziStore';
import type { MediaRecord, MyDay, MyDayTool, RewardTemplate, RoutineLayout, ScheduleItem, TileColor } from '../../types';
import {
  addStep,
  blankItem,
  currentStepIndex,
  deleteTemplate,
  duplicateTemplate,
  MAX_STEPS,
  MAX_TOKENS,
  MIN_STEPS,
  MIN_TOKENS,
  moveStep,
  nowNextLater,
  removeStep,
  renameTemplate,
  resetItems,
  ROUTINE_LAYOUTS,
  setTokenCount,
  TOKEN_STYLES,
  uniqueName,
  type Named,
} from '../../lib/myday';
import { newId } from '../../lib/id';
import { ScheduleCard } from '../../components/ScheduleCard';
import { RewardBoardDisplay, routineTabLabel } from '../../components/MyDayView';
import { Icon, TokenShape } from '../../components/Icon';
import { ConfirmDialog } from '../ConfirmDialog';
import { CardEditor } from './CardEditor';

const fresh = (i: ScheduleItem): ScheduleItem => ({ ...i, done: false });
const TOKEN_COLORS = ['#d9a400', '#2f8f4e', '#2f6fb3', '#c0397a', '#7b52c4', '#d2552f'];
const BOARD_COLORS: (TileColor | undefined)[] = [undefined, 'cream', 'blue', 'green', 'purple', 'pink'];

interface Props {
  initial: MyDayTool;
  onClose: () => void;
}

/**
 * The one visual-schedule editor (First / Then, I'm Working For, routines): the same card
 * fields, picture chooser, templates, live preview, Save and Cancel everywhere.
 * Opened from Parent Mode, or from My Day after the Parent Mode PIN.
 */
export function ScheduleEditor({ initial, onClose }: Props) {
  const { myDay, updateMyDay, tiles, mediaUrls, settings } = useMimzi();
  const tileMap = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const [tool, setTool] = useState<MyDayTool>(initial);
  const [draft, setDraft] = useState<MyDay>(myDay);
  const [pending, setPending] = useState<MediaRecord[]>([]);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; label: string; run: () => void } | null>(null);
  const [status, setStatus] = useState('');
  const [newName, setNewName] = useState('');

  // Pictures picked in this session must show in the preview before they're saved.
  const previewUrls = useMemo(() => {
    const extra: Record<string, string> = {};
    for (const m of pending) extra[m.id] = URL.createObjectURL(m.blob);
    return { ...mediaUrls, ...extra };
  }, [mediaUrls, pending]);

  const edit = (next: MyDay, media: MediaRecord[] = []) => {
    setDraft(next);
    if (media.length) setPending((p) => [...p, ...media]);
    setDirty(true);
    setStatus('');
  };

  const save = async () => {
    await updateMyDay(draft, pending);
    setPending([]);
    setDirty(false);
    onClose();
  };

  const cancel = () => {
    if (!dirty) return onClose();
    setConfirm({ title: 'Discard your changes?', message: 'Your edits to the schedule haven’t been saved.', label: 'Discard', run: onClose });
  };

  const ft = draft.firstThen;
  const reward = draft.reward;
  const steps = draft.routine.steps;

  /* ---------- templates (one pattern for all three) ---------- */
  type Kind = 'firstThenTemplates' | 'rewardTemplates' | 'routineTemplates';
  const kind: Kind = tool === 'firstThen' ? 'firstThenTemplates' : tool === 'reward' ? 'rewardTemplates' : 'routineTemplates';
  const templates = draft[kind] as Named[];
  const saveAsTemplate = () => {
    const name = uniqueName(templates, newName || (tool === 'firstThen' ? `${ft.first.label} then ${ft.then.label}` : tool === 'reward' ? `Working for ${reward.item.label}` : draft.routine.name || 'My routine'));
    const id = newId(tool === 'firstThen' ? 'ft' : tool === 'reward' ? 'rw' : 'rt');
    if (tool === 'firstThen') edit({ ...draft, firstThen: { ...ft, name }, firstThenTemplates: [...draft.firstThenTemplates, { id, name, first: fresh(ft.first), then: fresh(ft.then) }] });
    else if (tool === 'reward') {
      const { earned: _e, name: _n, ...board } = reward;
      edit({ ...draft, reward: { ...reward, name }, rewardTemplates: [...draft.rewardTemplates, { ...board, item: fresh(reward.item), id, name } as RewardTemplate] });
    } else edit({ ...draft, routine: { ...draft.routine, name }, routineTemplates: [...draft.routineTemplates, { id, name, steps: steps.map(fresh), layout: draft.routineLayout }] });
    setNewName('');
    setStatus(`Saved “${name}” as a template.`);
  };
  const applyTemplate = (id: string) => {
    if (tool === 'firstThen') {
      const t = draft.firstThenTemplates.find((x) => x.id === id);
      if (t) edit({ ...draft, firstThen: { first: fresh(t.first), then: fresh(t.then), name: t.name } });
    } else if (tool === 'reward') {
      const t = draft.rewardTemplates.find((x) => x.id === id);
      if (t) {
        const { id: _i, name, ...board } = t;
        edit({ ...draft, reward: { ...board, item: fresh(t.item), earned: 0, name } });
      }
    } else {
      const t = draft.routineTemplates.find((x) => x.id === id);
      if (t) edit({ ...draft, routine: { steps: t.steps.map(fresh), name: t.name }, routineLayout: t.layout ?? draft.routineLayout });
    }
    const name = templates.find((x) => x.id === id)?.name;
    setStatus(`Using “${name}”. Save to show it on My Day.`);
  };
  const setTemplates = (list: Named[]) => edit({ ...draft, [kind]: list } as MyDay);

  /* ---------- live preview ---------- */
  const preview = (
    <div className={`schedule-preview myday${settings.highContrast ? ' high-contrast' : ''}`} aria-label="Preview — how your child will see it" data-testid="schedule-preview">
      {tool === 'firstThen' && (
        <div className="first-then">
          <ScheduleCard item={ft.first} heading="FIRST" tiles={tileMap} mediaUrls={previewUrls} current={!ft.first.done} />
          <span className="ft-arrow" aria-hidden="true">
            <Icon name="arrowRight" size={36} />
          </span>
          <ScheduleCard item={ft.then} heading="THEN" tiles={tileMap} mediaUrls={previewUrls} current={ft.first.done && !ft.then.done} />
        </div>
      )}
      {tool === 'reward' && <RewardBoardDisplay reward={reward} tileMap={tileMap} mediaUrls={previewUrls} reducedMotion defaultCelebrate={settings.celebrationVisual} />}
      {tool === 'routine' && <RoutinePreview layout={draft.routineLayout} steps={steps} showUpcoming={draft.showUpcoming !== false} tileMap={tileMap} mediaUrls={previewUrls} />}
    </div>
  );

  return (
    <div className="modal-backdrop schedule-editor-backdrop" role="presentation">
      <div className="schedule-editor" role="dialog" aria-modal="true" aria-labelledby="se-title" data-testid="schedule-editor">
        <header className="se-header">
          <h2 id="se-title">Edit schedule</h2>
          <div className="seg" role="tablist" aria-label="Schedule">
            {(
              [
                ['firstThen', 'First / Then'],
                ['reward', 'I’m Working For'],
                ['routine', 'Routine'],
              ] as [MyDayTool, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tool === id} className={`seg-btn${tool === id ? ' seg-on' : ''}`} onClick={() => setTool(id)}>
                {label}
              </button>
            ))}
          </div>
          <span className="spacer" />
          {dirty && <span className="muted small">Unsaved changes</span>}
          <button type="button" className="btn btn-quiet" onClick={cancel} data-testid="cancel-schedule">
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!dirty} data-testid="save-schedule">
            Save
          </button>
        </header>
        {status && (
          <p role="status" className="se-status">
            {status}
          </p>
        )}

        <div className="se-body">
          <div className="se-form">
            {tool === 'firstThen' && (
              <>
                <CardEditor title="FIRST" testId="ft-first" item={ft.first} onChange={(first, m) => edit({ ...draft, firstThen: { ...ft, first } }, m)} />
                <CardEditor title="THEN" testId="ft-then" item={ft.then} onChange={(then, m) => edit({ ...draft, firstThen: { ...ft, then } }, m)} />
                <div className="row">
                  <button type="button" className="btn" onClick={() => edit({ ...draft, firstThen: { ...ft, first: { ...ft.first, done: true } } })} disabled={ft.first.done}>
                    <Icon name="check" /> Mark FIRST done
                  </button>
                  <button type="button" className="btn" onClick={() => edit({ ...draft, firstThen: { ...ft, then: { ...ft.then, done: true } } })} disabled={ft.then.done}>
                    <Icon name="check" /> Mark THEN done
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => { const [first, then] = resetItems([ft.first, ft.then]); edit({ ...draft, firstThen: { ...ft, first, then } }); }}>
                    <Icon name="reset" /> Reset
                  </button>
                </div>
              </>
            )}

            {tool === 'reward' && (
              <>
                <CardEditor title="Reward" testId="reward-item" item={reward.item} onChange={(item, m) => edit({ ...draft, reward: { ...reward, item } }, m)} />
                <label className="field">
                  <span>What your child is working on (optional)</span>
                  <input value={reward.goal ?? ''} maxLength={80} placeholder="e.g. Sit for the story" onChange={(e) => edit({ ...draft, reward: { ...reward, goal: e.target.value || undefined } })} aria-label="Goal" />
                </label>
                <label className="field">
                  <span>Tokens to earn: {reward.tokens}</span>
                  <input type="range" min={MIN_TOKENS} max={MAX_TOKENS} step={1} value={reward.tokens} onChange={(e) => edit({ ...draft, reward: setTokenCount(reward, Number(e.target.value)) })} data-testid="token-count" />
                </label>
                <fieldset className="field">
                  <legend>Token style</legend>
                  <div className="row token-styles">
                    {TOKEN_STYLES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`btn token-style${(reward.tokenStyle ?? 'star') === t.id ? ' btn-on' : ''}`}
                        aria-pressed={(reward.tokenStyle ?? 'star') === t.id}
                        onClick={() => edit({ ...draft, reward: { ...reward, tokenStyle: t.id } })}
                        data-testid={`token-style-${t.id}`}
                      >
                        <span className="token-sample">
                          <TokenShape style={t.id} filled color={reward.tokenColor} />
                        </span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="field">
                  <legend>Token colour</legend>
                  <div className="swatches small-swatches">
                    {TOKEN_COLORS.map((c) => (
                      <button key={c} type="button" className={`swatch${(reward.tokenColor ?? TOKEN_COLORS[0]) === c ? ' swatch-on' : ''}`} style={{ background: c }} aria-label={`Token colour ${c}`} aria-pressed={(reward.tokenColor ?? TOKEN_COLORS[0]) === c} onClick={() => edit({ ...draft, reward: { ...reward, tokenColor: c } })} />
                    ))}
                  </div>
                </fieldset>
                <fieldset className="field">
                  <legend>Board colour</legend>
                  <div className="swatches small-swatches">
                    {BOARD_COLORS.map((c) => (
                      <button key={c ?? 'plain'} type="button" className={`swatch ${c ? `tile-${c}` : 'tile-white'}${reward.boardColor === c ? ' swatch-on' : ''}`} aria-label={`Board ${c ?? 'plain'}`} aria-pressed={reward.boardColor === c} onClick={() => edit({ ...draft, reward: { ...reward, boardColor: c } })} />
                    ))}
                  </div>
                </fieldset>
                <label className="field">
                  <span>Message when the board is full</span>
                  <input value={reward.completeMessage ?? ''} maxLength={100} placeholder={`You did it! Time for ${reward.item.label}.`} onChange={(e) => edit({ ...draft, reward: { ...reward, completeMessage: e.target.value || undefined } })} aria-label="Completion message" />
                </label>
                <label className="check">
                  <input type="checkbox" checked={reward.celebrate ?? settings.celebrationVisual} onChange={(e) => edit({ ...draft, reward: { ...reward, celebrate: e.target.checked } })} /> Show a gentle celebration
                </label>
                <label className="check">
                  <input type="checkbox" checked={reward.sound ?? settings.celebrationSound} onChange={(e) => edit({ ...draft, reward: { ...reward, sound: e.target.checked } })} /> Say the message out loud
                </label>
                <div className="row">
                  <button type="button" className="btn btn-quiet" onClick={() => edit({ ...draft, reward: { ...reward, earned: 0 } })} disabled={reward.earned === 0}>
                    <Icon name="reset" /> Reset progress ({reward.earned} earned)
                  </button>
                </div>
                <p className="muted small">Rewards are for extra fun only — never for communication, breaks, food, comfort or care. Tokens are never taken away as a punishment.</p>
              </>
            )}

            {tool === 'routine' && (
              <>
                <label className="field">
                  <span>Routine name</span>
                  <input value={draft.routine.name ?? ''} maxLength={40} placeholder="e.g. Morning Routine" onChange={(e) => edit({ ...draft, routine: { ...draft.routine, name: e.target.value || undefined } })} aria-label="Routine name" />
                </label>
                <fieldset className="field">
                  <legend>Show it as</legend>
                  <div className="row">
                    {ROUTINE_LAYOUTS.map((l) => (
                      <label key={l.id} className="check">
                        <input type="radio" name="routine-layout" checked={draft.routineLayout === l.id} onChange={() => edit({ ...draft, routineLayout: l.id })} data-testid={`layout-${l.id}`} /> {l.label}
                      </label>
                    ))}
                  </div>
                  {draft.routineLayout === 'oneAtATime' && (
                    <label className="check">
                      <input type="checkbox" checked={draft.showUpcoming !== false} onChange={(e) => edit({ ...draft, showUpcoming: e.target.checked })} /> Show small pictures of the next steps
                    </label>
                  )}
                </fieldset>
                {steps.map((s, i) => (
                  <CardEditor
                    key={i}
                    title={`Step ${i + 1}`}
                    testId={`step-${i + 1}`}
                    item={s}
                    onChange={(item, m) => edit({ ...draft, routine: { ...draft.routine, steps: steps.map((x, j) => (j === i ? item : x)) } }, m)}
                    extra={
                      <span className="row step-tools">
                        <button type="button" className="btn small icon-btn" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => edit({ ...draft, routine: { ...draft.routine, steps: moveStep(steps, i, -1) } })}>
                          <Icon name="up" />
                        </button>
                        <button type="button" className="btn small icon-btn" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => edit({ ...draft, routine: { ...draft.routine, steps: moveStep(steps, i, 1) } })}>
                          <Icon name="down" />
                        </button>
                        <button type="button" className="btn small icon-btn" aria-label={`Remove step ${i + 1}`} disabled={steps.length <= MIN_STEPS} onClick={() => edit({ ...draft, routine: { ...draft.routine, steps: removeStep(steps, i) } })}>
                          <Icon name="trash" />
                        </button>
                      </span>
                    }
                  />
                ))}
                <div className="row">
                  <button type="button" className="btn" onClick={() => edit({ ...draft, routine: { ...draft.routine, steps: addStep(steps, blankItem(`Step ${steps.length + 1}`)) } })} disabled={steps.length >= MAX_STEPS} data-testid="add-step">
                    <Icon name="plus" /> Add step ({steps.length} of {MAX_STEPS})
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => edit({ ...draft, routine: { ...draft.routine, steps: resetItems(steps) } })}>
                    <Icon name="reset" /> Reset the routine
                  </button>
                </div>
              </>
            )}

            {/* ---------- saved templates (same for all three) ---------- */}
            <section className="se-templates" aria-label="Saved templates">
              <h3>Saved {tool === 'firstThen' ? 'First / Then boards' : tool === 'reward' ? 'reward boards' : 'routines'}</h3>
              <ul className="template-list">
                {templates.map((t) => (
                  <li key={t.id} data-template={t.name}>
                    <input className="template-name" value={t.name} maxLength={40} aria-label={`Name of ${t.name}`} onChange={(e) => setTemplates(templates.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))} onBlur={(e) => setTemplates(renameTemplate(templates, t.id, e.target.value))} />
                    <button type="button" className="btn small btn-primary" onClick={() => applyTemplate(t.id)}>
                      Use
                    </button>
                    <button type="button" className="btn small icon-btn" aria-label={`Duplicate ${t.name}`} onClick={() => setTemplates(duplicateTemplate(templates, t.id, newId('tpl')))}>
                      <Icon name="copy" />
                    </button>
                    <button
                      type="button"
                      className="btn small icon-btn"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => setConfirm({ title: `Delete “${t.name}”?`, message: 'The saved template is removed when you save.', label: 'Delete', run: () => setTemplates(deleteTemplate(templates, t.id)) })}
                    >
                      <Icon name="trash" />
                    </button>
                  </li>
                ))}
                {templates.length === 0 && <li className="muted">Nothing saved yet.</li>}
              </ul>
              <div className="row">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Template name, e.g. Bedtime" maxLength={40} aria-label="New template name" data-testid="template-name" />
                <button type="button" className="btn" onClick={saveAsTemplate} data-testid="save-template">
                  Save as template
                </button>
              </div>
            </section>
          </div>

          <aside className="se-preview">
            <h3>Preview</h3>
            {preview}
          </aside>
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.label}
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function RoutinePreview({ layout, steps, showUpcoming, tileMap, mediaUrls }: { layout: RoutineLayout; steps: ScheduleItem[]; showUpcoming: boolean; tileMap: Map<string, import('../../types').Tile>; mediaUrls: Record<string, string> }) {
  const cur = currentStepIndex(steps);
  if (layout === 'nowNextLater') {
    const v = nowNextLater(steps);
    return (
      <div className="nnl">
        {(['NOW', 'NEXT', 'LATER'] as const).map((h) => {
          const item = h === 'NOW' ? v.now : h === 'NEXT' ? v.next : v.later;
          return item ? <ScheduleCard key={h} item={item} heading={h} tiles={tileMap} mediaUrls={mediaUrls} current={h === 'NOW'} className={`nnl-${h.toLowerCase()}`} /> : <div key={h} className={`sched-card sched-empty nnl-${h.toLowerCase()}`}><span className="sched-heading">{h}</span><span className="sched-label">—</span></div>;
        })}
      </div>
    );
  }
  if (layout === 'oneAtATime') {
    if (cur === -1) return <p className="board-empty">All done!</p>;
    return (
      <div className="one-step">
        <div className="one-step-main">
          <ScheduleCard item={steps[cur]} heading={`STEP ${cur + 1} OF ${steps.length}`} tiles={tileMap} mediaUrls={mediaUrls} current />
        </div>
        {showUpcoming && steps.length > cur + 1 && (
          <div className="one-step-next">
            {steps.slice(cur + 1).map((s, j) => (
              <ScheduleCard key={j} item={s} tiles={tileMap} mediaUrls={mediaUrls} className="sched-mini" />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <>
      <p className="muted small">{routineTabLabel(layout, steps.length)}</p>
      <ol className={`steps steps-${steps.length}`}>
        {steps.map((s, i) => (
          <li key={i} className="step">
            <ScheduleCard item={s} heading={`${i + 1}`} tiles={tileMap} mediaUrls={mediaUrls} current={i === cur} />
          </li>
        ))}
      </ol>
    </>
  );
}
