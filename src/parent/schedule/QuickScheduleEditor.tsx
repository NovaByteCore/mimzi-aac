import { useEffect, useMemo, useRef, useState } from 'react';
import { useMimzi } from '../../state/MimziStore';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { addStep, applyRewardTemplate, applyRoutineTemplate, blankItem, MAX_STEPS, ROUTINE_LAYOUTS } from '../../lib/myday';
import { everydayPictures } from '../../lib/pictureSets';
import { addRecentPicture, getRecentPictures, onRecentPictures, type RecentPicture } from '../../lib/recentPictures';
import { ScheduleCard } from '../../components/ScheduleCard';
import { TileFace } from '../../components/TileFace';
import { Icon } from '../../components/Icon';
import { PicturePicker, type PickedPicture } from '../PicturePicker';
import { ConfirmDialog } from '../ConfirmDialog';
import type { MediaRecord, MyDay, MyDayTool, ScheduleItem, SymbolInfo } from '../../types';

interface Choice {
  label: string;
  symbol: string;
  info: SymbolInfo;
}

const TITLES: Record<MyDayTool, string> = { firstThen: 'First / Then', reward: 'I’m Working For', routine: 'My Steps' };

/**
 * Quick editor: opened from "Edit schedule" on My Day for the board on screen.
 * Recent and everyday pictures come first, with short labels, so a familiar activity takes a
 * tap — no typing. "Search pictures" finds anything else without leaving. Photos, custom
 * speech, colours, layouts, adding/removing steps and templates are under "More options".
 * Cancel goes straight back to the same My Day tab; the child's message is untouched.
 */
export function QuickScheduleEditor({ tool, initialCard, onClose, onMore }: { tool: MyDayTool; initialCard?: 'first' | 'then' | number; onClose: () => void; onMore?: () => void }) {
  const { myDay, updateMyDay, tiles, mediaUrls } = useMimzi();
  const tileMap = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<MyDay>(myDay);
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const [target, setTarget] = useState<'first' | 'then' | 'reward' | number | null>(initialCard ?? (tool === 'reward' ? 'reward' : tool === 'firstThen' ? 'first' : 0));
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [recent, setRecent] = useState<RecentPicture[]>([]);
  const dirty = draft !== myDay;
  useDialogFocus(dialogRef, onClose);

  useEffect(() => {
    void getRecentPictures().then(setRecent);
    return onRecentPictures(setRecent);
  }, []);

  // Recent first, then everyday pictures — each once.
  const choices = useMemo<Choice[]>(() => {
    const seen = new Set<string>();
    const out: Choice[] = [];
    const add = (c: Choice) => {
      if (seen.has(c.symbol)) return;
      seen.add(c.symbol);
      out.push(c);
    };
    for (const r of recent) add({ label: r.info.name, symbol: r.symbol, info: r.info });
    for (const p of everydayPictures()) add({ label: p.label, symbol: p.symbol, info: p.info });
    return out;
  }, [recent]);
  const matchingChoices = choices.filter((choice) => choice.label.toLowerCase().includes(query.trim().toLowerCase()));

  const itemFrom = (c: Choice, keep?: ScheduleItem): ScheduleItem => ({ label: c.label, speak: undefined, symbol: c.symbol, symbolInfo: c.info, color: keep?.color, done: false });

  /** Put a picture (and its label) on the selected card in the draft. */
  const setCard = (item: ScheduleItem) => {
    if (target === 'first') setDraft((d) => ({ ...d, firstThen: { ...d.firstThen, first: item, name: undefined } }));
    else if (target === 'then') setDraft((d) => ({ ...d, firstThen: { ...d.firstThen, then: item, name: undefined } }));
    else if (target === 'reward') setDraft((d) => ({ ...d, reward: { ...d.reward, item, name: undefined } })); // earned tokens stay
    else if (typeof target === 'number')
      setDraft((d) => ({ ...d, routine: { ...d.routine, name: undefined, steps: d.routine.steps.map((s, i) => (i === target ? { ...item, done: s.done } : s)) } }));
  };
  const currentItem = (): ScheduleItem | undefined =>
    target === 'first' ? draft.firstThen.first : target === 'then' ? draft.firstThen.then : target === 'reward' ? draft.reward.item : typeof target === 'number' ? draft.routine.steps[target] : undefined;

  const pickChoice = (c: Choice) => {
    void addRecentPicture(c.symbol, c.info);
    setCard(itemFrom(c, currentItem()));
  };
  const pickSearched = (p: PickedPicture) => {
    const keep = currentItem();
    if (p.kind === 'photo') {
      setCard({ label: keep?.label || 'Photo', speak: keep?.speak, photoId: p.photoId, color: keep?.color, done: false });
      if (p.media) setMedia((m) => [...m, p.media!]);
    } else setCard(itemFrom({ label: p.info.name, symbol: p.symbol, info: p.info }, keep));
    setSearching(false);
  };

  const show = async (next: MyDay = draft) => {
    await updateMyDay(next, media);
    onClose();
  };

  const card = (item: ScheduleItem, heading: string, key: 'first' | 'then' | 'reward' | number, big = true) => (
    <button
      key={String(key)}
      type="button"
      className={`quick-card${target === key ? ' quick-card-on' : ''}${big ? ' quick-card-big' : ''}`}
      aria-pressed={target === key}
      aria-label={`${heading}: ${item.label || 'no picture'} — tap to change`}
      onClick={() => {
        setTarget(key);
        setSearching(false);
        setQuery('');
      }}
      data-quick-card={String(key)}
    >
      <ScheduleCard item={item} heading={heading} tiles={tileMap} mediaUrls={mediaUrls} />
    </button>
  );

  const chooser = target != null && (
    <section className="quick-choices" aria-label="Pictures">
      <h3>
        {target === 'first' ? 'Pick the FIRST picture' : target === 'then' ? 'Pick the THEN picture' : target === 'reward' ? 'Pick the reward' : `Pick a picture for step ${Number(target) + 1}`}
      </h3>
      {searching ? (
        <PicturePicker inline suggest={currentItem()?.label ?? ''} onCancel={() => setSearching(false)} onUse={pickSearched} />
      ) : (
        <>
          <label className="field">
            Search activity cards
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="quick-grid" data-testid="quick-choices">
            {matchingChoices.map((c) => (
              <button key={c.symbol} type="button" className={`quick-choice${currentItem()?.symbol === c.symbol ? ' picker-on' : ''}`} onClick={() => pickChoice(c)} aria-label={c.label} data-quick-choice={c.label}>
                <span className="picker-pic">
                  <TileFace symbol={c.symbol} symbolInfo={c.info} label={c.label} />
                </span>
                <span className="picker-name">{c.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => setSearching(true)} data-testid="quick-search">
            <Icon name="search" /> Search pictures or use a photo
          </button>
        </>
      )}
    </section>
  );

  const pendingSwitch = switchTo ? draft.rewardTemplates.find((t) => t.id === switchTo) : undefined;

  return (
    <div className="modal-backdrop" role="presentation">
      <div ref={dialogRef} className="modal editor-modal quick-editor" role="dialog" aria-modal="true" aria-labelledby="qe-title" data-testid="quick-editor">
        <div className="quick-head">
          <h2 id="qe-title">Change {TITLES[tool]}</h2>
          <button type="button" className="btn btn-quiet" onClick={onClose} data-testid="quick-cancel" data-autofocus>
            <Icon name="close" /> Cancel
          </button>
        </div>

        {tool === 'firstThen' && (
          <>
            <p className="muted">{target == null ? 'Tap the card you want to change.' : 'Tap a picture, then “Show on board”. The other card and its progress stay the same.'}</p>
            <div className="quick-cards quick-ft">
              {card(draft.firstThen.first, 'First', 'first')}
              {card(draft.firstThen.then, 'Then', 'then')}
            </div>
            {chooser}
          </>
        )}

        {tool === 'reward' && (
          <>
            <div className="quick-cards">
              {card(draft.reward.item, 'I’m working for', 'reward')}
              <p className="quick-tokens" data-testid="quick-tokens">
                {draft.reward.earned} of {draft.reward.tokens} tokens earned{dirty && draft.reward.earned === myDay.reward.earned ? ' — they stay when you change the reward' : ''}
              </p>
            </div>
            {chooser}
            {draft.rewardTemplates.length > 0 && (
              <section className="quick-saved" aria-label="Saved reward boards">
                <h3>Or switch to a saved board</h3>
                <div className="quick-grid">
                  {draft.rewardTemplates.map((t) => (
                    <button key={t.id} type="button" className={`quick-choice${switchTo === t.id ? ' picker-on' : ''}`} onClick={() => setSwitchTo(t.id)} aria-pressed={switchTo === t.id} data-quick-board={t.name}>
                      <ScheduleCard item={t.item} tiles={tileMap} mediaUrls={mediaUrls} />
                      <span className="picker-name">{t.name}</span>
                    </button>
                  ))}
                </div>
                {pendingSwitch && (
                  <div className="quick-confirm" role="alert" data-testid="switch-note">
                    <p>
                      Switch to <strong>“{pendingSwitch.name}”</strong>?{' '}
                      {myDay.reward.earned > 0
                        ? `The ${myDay.reward.earned} token${myDay.reward.earned === 1 ? '' : 's'} earned now will be cleared — the new board starts at 0 of ${pendingSwitch.tokens}.`
                        : `It starts at 0 of ${pendingSwitch.tokens} tokens.`}
                    </p>
                    <div className="row">
                      <button type="button" className="btn btn-primary" onClick={() => void show(applyRewardTemplate(myDay, pendingSwitch))} data-testid="confirm-switch">
                        Switch board
                      </button>
                      <button type="button" className="btn btn-quiet" onClick={() => setSwitchTo(null)}>
                        Keep the current board
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
            <button type="button" className="btn" onClick={() => setConfirmReset(true)} disabled={myDay.reward.earned === 0} data-testid="quick-reset-tokens">
              <Icon name="reset" /> Reset tokens
            </button>
          </>
        )}

        {tool === 'routine' && (
          <>
            {draft.routineTemplates.length > 0 && (
              <section className="quick-saved" aria-label="Saved routines">
                <h3>Saved routines</h3>
                <div className="quick-grid">
                  {draft.routineTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`quick-choice quick-routine${draft.routine.name === t.name ? ' picker-on' : ''}`}
                      onClick={() => {
                        setDraft(applyRoutineTemplate(draft, t));
                        setTarget(null);
                      }}
                      aria-pressed={draft.routine.name === t.name}
                      data-quick-routine={t.name}
                    >
                      <span className="quick-routine-pics" aria-hidden="true">
                        {t.steps.slice(0, 3).map((s, i) => (
                          <ScheduleCard key={i} item={s} tiles={tileMap} mediaUrls={mediaUrls} />
                        ))}
                      </span>
                      <span className="picker-name">
                        {t.name} · {t.steps.length} steps
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <h3>
              On the board{draft.routine.name ? `: ${draft.routine.name}` : ''} · {ROUTINE_LAYOUTS.find((l) => l.id === draft.routineLayout)?.label}
            </h3>
            <p className="muted small">Tap a step to change it. Use More options to remove or reorder steps.</p>
            <div className="quick-cards quick-steps">{draft.routine.steps.map((s, i) => card(s, `Step ${i + 1}`, i, false))}</div>
            <button type="button" className="btn" disabled={draft.routine.steps.length >= MAX_STEPS} onClick={() => {
              const index = draft.routine.steps.length;
              setDraft((d) => ({ ...d, routine: { ...d.routine, name: undefined, steps: addStep(d.routine.steps, blankItem(`Step ${index + 1}`)) } }));
              setTarget(index);
              setSearching(false);
              setQuery('');
            }}><Icon name="plus" /> Add step</button>
            {chooser}
          </>
        )}

        <div className="modal-actions quick-actions">
          {onMore && <button type="button" className="btn" onClick={onMore} data-testid="quick-more">More options</button>}
          <span className="spacer" />
          <button type="button" className="btn btn-primary big-btn" disabled={!dirty} onClick={() => void show()} data-testid="show-on-board">
            <Icon name="check" /> Show on board
          </button>
        </div>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Reset tokens?"
          message={`This clears the ${myDay.reward.earned} earned token${myDay.reward.earned === 1 ? '' : 's'} on “${myDay.reward.item.label}”. The reward stays the same.`}
          confirmLabel="Reset tokens"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            const next = { ...myDay, reward: { ...myDay.reward, earned: 0 } };
            setDraft((d) => ({ ...d, reward: { ...d.reward, earned: 0 } }));
            void updateMyDay(next);
          }}
        />
      )}
    </div>
  );
}

