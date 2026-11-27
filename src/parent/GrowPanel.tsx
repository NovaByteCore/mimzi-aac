import { useMemo, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { addDays, dayString, moveItem, parseDay, pendingItems, reschedule, scheduleWords } from '../lib/grow';
import type { GrowItem, GrowPlan } from '../types';
import { scheduleWeeklyWordReminder } from '../lib/wordReminder';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from '../components/Icon';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STATUS_LABEL: Record<GrowItem['status'], string> = {
  planned: 'Upcoming',
  pending: 'Waiting for you',
  added: 'Added',
  skipped: 'Skipped',
  canceled: 'Canceled',
};

/** Grow My Words — schedule new words daily or weekly, approve them, see the calendar and history. */
export function GrowPanel() {
  const { grow, history, tiles, categories, updateGrow, resolveGrow } = useMimzi();
  const today = dayString();
  const [picked, setPicked] = useState<string[]>([]);
  const [start, setStart] = useState(today);
  const [filter, setFilter] = useState('');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [reminderStatus, setReminderStatus] = useState('');
  const [settingReminder, setSettingReminder] = useState(false);
  const tileById = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';
  const label = (id: string) => tileById.get(id)?.label ?? '(deleted word)';

  const save = (plan: GrowPlan) => void updateGrow(plan);
  const planned = grow.items.filter((i) => i.status === 'planned').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pending = pendingItems(grow);
  const scheduledIds = new Set(grow.items.filter((i) => i.status === 'planned' || i.status === 'pending').map((i) => i.tileId));
  const candidates = tiles
    .filter((t) => t.hidden && !t.deletedAt && !t.linkTo && !scheduledIds.has(t.id))
    .filter((t) => t.label.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => catName(a.categoryId).localeCompare(catName(b.categoryId)) || a.order - b.order);

  const setCadence = (patch: Partial<GrowPlan>) => {
    const next = { ...grow, ...patch };
    const first = planned[0]?.dueDate ?? today;
    save(reschedule(next, first < today ? today : first));
  };

  return (
    <section className="panel grow-panel">
      <h2>Grow My Words</h2>
      <p className="muted">
        Add new words a few at a time. Choose the words now; each one waits, hidden in its own spot, until its day. By default you approve each
        word before it appears. This is just an organiser — Mimzi never judges what your child has “learned”.
      </p>

      {pending.length > 0 && (
        <div className="notice" data-testid="grow-pending">
          <h3>Ready for your OK ({pending.length})</h3>
          <ul className="grow-list">
            {pending.map((i) => (
              <li key={i.id}>
                <strong>{label(i.tileId)}</strong> <span className="muted small">· {catName(tileById.get(i.tileId)?.categoryId ?? '')} · due {i.dueDate}</span>
                <span className="spacer" />
                <button type="button" className="btn btn-primary small" onClick={() => resolveGrow([i.id], 'approve')}>
                  Add to board
                </button>
                <button type="button" className="btn btn-quiet small" onClick={() => resolveGrow([i.id], 'skip')}>
                  Skip
                </button>
              </li>
            ))}
          </ul>
          {pending.length > 1 && (
            <button type="button" className="btn btn-primary" onClick={() => resolveGrow(pending.map((i) => i.id), 'approve')}>
              Add all {pending.length}
            </button>
          )}
        </div>
      )}

      <h3>Schedule</h3>
      <div className="form-grid">
        <label className="field inline">
          <span>How often</span>
          <select value={grow.cadence} onChange={(e) => setCadence({ cadence: e.target.value as GrowPlan['cadence'] })} data-testid="grow-cadence">
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
          </select>
        </label>
        <label className="field inline">
          <span>New words each {grow.cadence === 'daily' ? 'day' : 'week'}</span>
          <input type="number" min={1} max={10} value={grow.perPeriod} onChange={(e) => setCadence({ perPeriod: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} data-testid="grow-per" />
        </label>
        {grow.cadence === 'weekly' && (
          <label className="field inline">
            <span>On</span>
            <select value={grow.weekday} onChange={(e) => setCadence({ weekday: Number(e.target.value) })} data-testid="grow-weekday">
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="check">
        <input type="checkbox" checked={grow.autoAdd} onChange={(e) => (e.target.checked ? setConfirmAuto(true) : save({ ...grow, autoAdd: false }))} />
        Add words automatically on their day (otherwise they wait for your OK)
      </label>
      <label className="check">
        <input type="checkbox" checked={grow.remind} onChange={(e) => save({ ...grow, remind: e.target.checked })} />
        Remind me in Parent Mode when words are ready
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={grow.paused}
          onChange={(e) => (e.target.checked ? save({ ...grow, paused: true }) : save(reschedule({ ...grow, paused: false }, today)))}
          data-testid="grow-pause"
        />
        Pause the schedule {grow.paused && <span className="muted small">(resuming re-plans upcoming words from today)</span>}
      </label>
      <label className="field inline">
        <input type="checkbox" checked={Boolean(grow.suggestWeekly)} onChange={(event) => {
          const suggestWeekly = event.target.checked;
          save({ ...grow, suggestWeekly });
          if (!suggestWeekly) void scheduleWeeklyWordReminder(false).catch(() => setReminderStatus('Could not cancel the tablet reminder.'));
        }} />
        Suggest up to two words each week
      </label>
      <p className="muted small">Mimzi looks at the words on the Home board and suggests words they can go with. You approve each suggestion before it appears.</p>
      {grow.suggestWeekly && (
        <button type="button" className="btn" disabled={settingReminder} onClick={async () => {
          setSettingReminder(true);
          try {
            setReminderStatus(await scheduleWeeklyWordReminder(true)
              ? 'Tablet reminder set for Mondays at 9:00 a.m.'
              : 'Tablet notifications are unavailable here or turned off. Mimzi shows a reminder inside the app.');
          } catch {
            setReminderStatus('Could not set the tablet reminder. Try again.');
          } finally {
            setSettingReminder(false);
          }
        }}>Enable weekly tablet reminder</button>
      )}
      {reminderStatus && <p role="status">{reminderStatus}</p>}

      <h3>Choose words to add</h3>
      <div className="add-row">
        <label className="field inline">
          <span>Find a hidden word</span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search" />
        </label>
        <label className="field inline">
          <span>Start on</span>
          <input type="date" value={start} min={today} onChange={(e) => setStart(e.target.value || today)} data-testid="grow-start" />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!picked.length}
          onClick={() => {
            save(scheduleWords(grow, picked, start));
            setPicked([]);
          }}
          data-testid="grow-schedule"
        >
          Schedule {picked.length || ''} word{picked.length === 1 ? '' : 's'}
        </button>
      </div>
      {candidates.length === 0 ? (
        <p className="muted">No hidden words to schedule. Hide words in “Manage words” or add new words first.</p>
      ) : (
        <div className="grow-candidates">
          {candidates.slice(0, 120).map((t) => (
            <label key={t.id} className="check grow-candidate">
              <input type="checkbox" checked={picked.includes(t.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))} data-grow-pick={t.id} />
              {t.label} <span className="muted small">· {catName(t.categoryId)}</span>
            </label>
          ))}
        </div>
      )}

      <h3>Coming up ({planned.length})</h3>
      {planned.length === 0 ? (
        <p className="muted">Nothing scheduled.</p>
      ) : (
        <ol className="grow-list" data-testid="grow-planned">
          {planned.map((i, idx) => (
            <li key={i.id} data-grow-item={i.tileId}>
              <span className="grow-date">{fmt(i.dueDate)}</span>
              <strong>{label(i.tileId)}</strong>
              <span className="spacer" />
              <button type="button" className="icon-btn small" disabled={idx === 0} onClick={() => save(moveItem(grow, i.id, -1, today))} aria-label={`Move ${label(i.tileId)} earlier`}>
                <Icon name="up" />
              </button>
              <button type="button" className="icon-btn small" disabled={idx === planned.length - 1} onClick={() => save(moveItem(grow, i.id, 1, today))} aria-label={`Move ${label(i.tileId)} later`}>
                <Icon name="down" />
              </button>
              <button type="button" className="btn small" onClick={() => resolveGrow([i.id], 'approve')}>
                Add now
              </button>
              <button type="button" className="btn btn-quiet small" onClick={() => resolveGrow([i.id], 'skip')}>
                Skip
              </button>
              <button type="button" className="btn btn-danger-quiet small" onClick={() => resolveGrow([i.id], 'cancel')}>
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}

      <h3>Calendar</h3>
      <Calendar month={month} setMonth={setMonth} items={grow.items} label={label} />

      <h3>Vocabulary history</h3>
      {history.length === 0 ? (
        <p className="muted">Nothing recorded yet. Showing, hiding and adding words is recorded here.</p>
      ) : (
        <table className="obs-table" data-testid="vocab-history">
          <thead>
            <tr>
              <th>Date</th>
              <th>Word</th>
              <th>Page</th>
              <th>Spot</th>
              <th>What happened</th>
              <th>How</th>
            </tr>
          </thead>
          <tbody>
            {[...history]
              .reverse()
              .slice(0, 200)
              .map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td>{e.label}</td>
                  <td>{catName(e.categoryId)}</td>
                  <td>{e.position + 1}</td>
                  <td>{e.type}</td>
                  <td>{e.source}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {confirmAuto && (
        <ConfirmDialog
          title="Add words automatically?"
          message="Scheduled words will appear on the board on their day without waiting for you. You can turn this off any time."
          confirmLabel="Turn on"
          onCancel={() => setConfirmAuto(false)}
          onConfirm={() => {
            save({ ...grow, autoAdd: true });
            setConfirmAuto(false);
          }}
        />
      )}
    </section>
  );
}

function fmt(day: string) {
  return parseDay(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function Calendar({ month, setMonth, items, label }: { month: string; setMonth: (m: string) => void; items: GrowItem[]; label: (id: string) => string }) {
  const first = parseDay(`${month}-01`);
  const startPad = first.getDay();
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const shift = (n: number) => {
    const d = new Date(first.getFullYear(), first.getMonth() + n, 1);
    setMonth(dayString(d).slice(0, 7));
  };
  const byDay = new Map<string, GrowItem[]>();
  for (const i of items) {
    const day = i.status === 'added' && i.addedOn ? i.addedOn : i.dueDate;
    byDay.set(day, [...(byDay.get(day) ?? []), i]);
  }
  const today = dayString();
  return (
    <div className="grow-cal" data-testid="grow-calendar">
      <div className="row">
        <button type="button" className="btn small" onClick={() => shift(-1)} aria-label="Previous month">
          <Icon name="prev" />
        </button>
        <strong>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" className="btn small" onClick={() => shift(1)} aria-label="Next month">
          <Icon name="next" />
        </button>
      </div>
      <div className="cal-grid">
        {DAYS.map((d) => (
          <div key={d} className="cal-head">
            {d.slice(0, 3)}
          </div>
        ))}
        {Array.from({ length: startPad }, (_, i) => (
          <div key={`p${i}`} className="cal-cell cal-pad" />
        ))}
        {Array.from({ length: daysIn }, (_, i) => {
          const day = addDays(`${month}-01`, i);
          const list = byDay.get(day) ?? [];
          return (
            <div key={day} className={`cal-cell${day === today ? ' cal-today' : ''}`} data-day={day}>
              <span className="cal-num">{i + 1}</span>
              {list.map((it) => (
                <span key={it.id} className={`cal-item cal-${it.status}`} title={STATUS_LABEL[it.status]}>
                  {label(it.tileId)}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted small">
        <span className="cal-item cal-planned">Upcoming</span> <span className="cal-item cal-pending">Waiting for you</span> <span className="cal-item cal-added">Added</span>{' '}
        <span className="cal-item cal-skipped">Skipped</span> <span className="cal-item cal-canceled">Canceled</span>
      </p>
    </div>
  );
}
