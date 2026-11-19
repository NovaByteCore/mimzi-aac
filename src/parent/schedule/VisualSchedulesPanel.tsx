import { useMemo, useState, type ReactNode } from 'react';
import { useMimzi } from '../../state/MimziStore';
import type { MyDayTool, ScheduleItem } from '../../types';
import { ScheduleCard } from '../../components/ScheduleCard';
import { Icon } from '../../components/Icon';
import { allScheduleItems, ROUTINE_LAYOUTS } from '../../lib/myday';
import { TileFace } from '../../components/TileFace';
import { ScheduleEditor } from './ScheduleEditor';

const fresh = (i: ScheduleItem): ScheduleItem => ({ ...i, done: false });

/**
 * Parent Mode → Visual schedules: one place for First / Then, the reward board and routines,
 * their saved templates, the pictures they use, and schedule settings. Every change happens
 * in the same full-screen editor with a live preview.
 */
export function VisualSchedulesPanel() {
  const { myDay, updateMyDay, tiles, mediaUrls, settings, updateSettings } = useMimzi();
  const tileMap = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const [editing, setEditing] = useState<MyDayTool | null>(null);
  const [status, setStatus] = useState('');
  const items = allScheduleItems(myDay);
  const photos = [...new Set(items.map((i) => i.photoId).filter((x): x is string => !!x && !!mediaUrls[x]))];
  const symbols = [...new Map(items.filter((i) => i.symbol).map((i) => [i.symbol!, i])).values()];

  const quickUse = async (tool: MyDayTool, id: string) => {
    if (tool === 'firstThen') {
      const t = myDay.firstThenTemplates.find((x) => x.id === id);
      if (t) await updateMyDay({ ...myDay, firstThen: { first: fresh(t.first), then: fresh(t.then), name: t.name } });
      setStatus(`My Day now shows “${t?.name}”.`);
    } else if (tool === 'reward') {
      const t = myDay.rewardTemplates.find((x) => x.id === id);
      if (t) {
        const { id: _i, name, ...board } = t;
        await updateMyDay({ ...myDay, reward: { ...board, item: fresh(t.item), earned: 0, name } });
        setStatus(`My Day now shows “${name}”.`);
      }
    } else {
      const t = myDay.routineTemplates.find((x) => x.id === id);
      if (t) await updateMyDay({ ...myDay, routine: { steps: t.steps.map(fresh), name: t.name }, routineLayout: t.layout ?? myDay.routineLayout, showUpcoming: t.showUpcoming ?? myDay.showUpcoming });
      setStatus(`My Day now shows “${t?.name}”.`);
    }
  };

  const section = (tool: MyDayTool, title: string, button: string, body: ReactNode, templates: { id: string; name: string }[], active?: string) => (
    <section className="vs-section" data-testid={`vs-${tool}`}>
      <div className="vs-head">
        <h3>{title}</h3>
        <span className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setEditing(tool)}>
          <Icon name="edit" /> {button}
        </button>
      </div>
      <div className="vs-preview">{body}</div>
      {templates.length > 0 && <BoardSwitcher title={title} active={active} templates={templates} onUse={(id) => void quickUse(tool, id)} />}
    </section>
  );

  return (
    <section className="panel visual-schedules">
      <h2>Visual schedules</h2>
      <p className="muted">
        What your child sees under <strong>My Day</strong>. Tap a button to open the editor, with a live preview. On My Day, “Edit schedule” opens the same
        editor after your PIN. Schedules are for support, never for holding back communication, food, comfort, care or breaks.
      </p>
      {status && <p role="status">{status}</p>}

      <div className="vs-grid">
        {section(
          'firstThen',
          'First / Then',
          'Edit First / Then',
          <div className="first-then mini">
            <ScheduleCard item={myDay.firstThen.first} heading="FIRST" tiles={tileMap} mediaUrls={mediaUrls} />
            <ScheduleCard item={myDay.firstThen.then} heading="THEN" tiles={tileMap} mediaUrls={mediaUrls} />
          </div>,
          myDay.firstThenTemplates,
          myDay.firstThen.name,
        )}
        {section(
          'reward',
          'I’m Working For',
          'Edit reward',
          <div className="vs-reward">
            <ScheduleCard item={myDay.reward.item} heading="WORKING FOR" tiles={tileMap} mediaUrls={mediaUrls} />
            <p className="muted small">
              {myDay.reward.earned} of {myDay.reward.tokens} tokens · {myDay.reward.tokenStyle ?? 'star'}
            </p>
          </div>,
          myDay.rewardTemplates,
          myDay.reward.name,
        )}
        {section(
          'routine',
          `Routine${myDay.routine.name ? ` — ${myDay.routine.name}` : ''}`,
          'Open routine builder',
          <ol className="steps mini">
            {myDay.routine.steps.map((s, i) => (
              <li key={i} className="step">
                <ScheduleCard item={s} heading={`${i + 1}`} tiles={tileMap} mediaUrls={mediaUrls} />
              </li>
            ))}
          </ol>,
          myDay.routineTemplates,
          myDay.routine.name,
        )}
      </div>

      <h3>Picture library</h3>
      <p className="muted small">Photos and AAC symbols used in your schedules. Choose “Already used” in the picture chooser to reuse one — it isn’t copied.</p>
      <div className="picker-grid" data-testid="schedule-pictures">
        {photos.map((id) => (
          <span key={id} className="mini-tile big tile-white tile-has-photo">
            <img className="tile-photo" src={mediaUrls[id]} alt="Schedule photo" />
          </span>
        ))}
        {symbols.map((i) => (
          <span key={i.symbol} className="mini-tile big tile-white" title={`${i.symbolInfo?.name ?? ''} — ${i.symbolInfo?.license ?? ''}`}>
            <TileFace symbol={i.symbol} symbolInfo={i.symbolInfo} label={i.label} />
          </span>
        ))}
        {photos.length + symbols.length === 0 && <p className="muted">No schedule photos or symbols yet.</p>}
      </div>

      <h3>Schedule settings</h3>
      <label className="field inline">
        <span>Show routines as</span>
        <select value={myDay.routineLayout} onChange={(e) => void updateMyDay({ ...myDay, routineLayout: e.target.value as typeof myDay.routineLayout })} aria-label="Routine display">
          {ROUTINE_LAYOUTS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={myDay.showUpcoming !== false} onChange={(e) => void updateMyDay({ ...myDay, showUpcoming: e.target.checked })} /> One step at a time: show the next steps small
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.celebrationVisual} onChange={(e) => void updateSettings({ celebrationVisual: e.target.checked })} /> Gentle celebration when something is finished
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.celebrationSound} onChange={(e) => void updateSettings({ celebrationSound: e.target.checked })} /> Say the celebration out loud
      </label>

      {editing && <ScheduleEditor initial={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** Pick a saved board, then press "Use board" — nothing switches on selection alone. */
function BoardSwitcher({ title, active, templates, onUse }: { title: string; active?: string; templates: { id: string; name: string }[]; onUse: (id: string) => void }) {
  const [chosen, setChosen] = useState('');
  return (
    <div className="vs-quick">
      <p className="muted small" data-testid="active-board">
        On screen now: <strong>{active || 'your own (not saved as a template)'}</strong>
      </p>
      <div className="row">
        <label className="field inline">
          <span>Saved boards</span>
          <select value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label={`Choose saved ${title}`}>
            <option value="">Choose…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!chosen}
          onClick={() => {
            onUse(chosen);
            setChosen('');
          }}
          aria-describedby={`fresh-${title.replace(/\W+/g, '-')}`}
        >
          Use board
        </button>
      </div>
      <p className="muted small" id={`fresh-${title.replace(/\W+/g, '-')}`}>
        Switching starts it fresh: done marks and tokens reset. Editing the board on screen keeps its progress.
      </p>
    </div>
  );
}
