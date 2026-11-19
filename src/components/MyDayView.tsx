import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useMimzi } from '../state/MimziStore';
import type { MyDayTool, RewardBoard, ScheduleItem, SpeechState, Tile } from '../types';
import { ScheduleCard } from './ScheduleCard';
import { HoldButton } from './HoldButton';
import {
  addToken,
  completeMessage,
  currentStepIndex,
  firstThenSentence,
  itemPicture,
  markDone,
  nowNextLater,
  resetItems,
  rewardComplete,
  spokenText,
} from '../lib/myday';
import { Icon, TokenShape } from './Icon';
import { TileFace } from './TileFace';

interface Props {
  say: (text: string) => void;
  /** What Mimzi is saying / just said, shown right here on My Day. */
  speech?: SpeechState | null;
  onRetry?: () => void;
  /** Grown-ups only: opens the schedule editor (after the Parent Mode PIN). */
  onEdit?: (tool: MyDayTool) => void;
}

const HOLD = 800;
const NUMBER_WORDS = ['', 'one', 'two', 'three', 'four', 'five'];

/** How the routine is being shown (inside the My Steps panel and the editor preview). */
export function routineTabLabel(layout: string, steps: number): string {
  if (layout === 'nowNextLater') return 'Now / Next / Later';
  if (layout === 'oneAtATime') return 'One step at a time';
  return steps === 1 ? 'Numbered: one step' : `Numbered: ${NUMBER_WORDS[steps] ?? steps} steps`;
}

/**
 * My Day — visual supports. Big pictures, few words, nothing else on screen. Tapping a picture
 * speaks it. Marking things done and adding tokens are grown-up actions (press and hold);
 * changing the schedule itself needs the Parent Mode PIN.
 */
export function MyDayView({ say, onEdit, speech, onRetry }: Props) {
  const { myDay, updateMyDay, tiles, mediaUrls, settings } = useMimzi();
  const [tool, setTool] = useState<MyDayTool>('firstThen');
  // A quick tap on a grown-up control (they need a press-and-hold so a child can't trigger
  // them by accident) explains both ways to do it, so nothing depends on a sustained hold.
  const [hint, setHint] = useState('');
  const showHint = () =>
    setHint(onEdit ? 'Grown-ups: press and hold that button, or tap “Edit schedule”, enter your PIN, then “More options” → Progress.' : 'Grown-ups: press and hold that button.');
  const tileMap = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const steps = myDay.routine.steps;
  const tabs: { id: MyDayTool; label: string; icon: string }[] = [
    { id: 'firstThen', label: 'First / Then', icon: 'arrowRight' },
    { id: 'reward', label: 'I’m working for', icon: 'star' },
    { id: 'routine', label: 'My Steps', icon: 'steps' },
  ];
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Arrow keys move between tabs (one tab stop for the whole group).
  const onTabKey = (e: { key: string; preventDefault: () => void }, i: number) => {
    const n = tabs.length;
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTool(tabs[to].id);
    setHint('');
    tabRefs.current[tabs[to].id]?.focus();
  };

  const sayItem = (item: ScheduleItem, prefix = '') => {
    const t = spokenText(item);
    if (t) say(prefix ? `${prefix} ${t}` : t);
  };

  const card = (item: ScheduleItem, heading: string | undefined, current: boolean, prefix = '', className?: string) => (
    <ScheduleCard item={item} heading={heading} tiles={tileMap} mediaUrls={mediaUrls} onTap={() => sayItem(item, prefix)} current={current} className={className} />
  );

  return (
    <section className="myday" aria-label="My Day">
      <div className="myday-top">
        <div className="myday-tabs" role="tablist" aria-label="My Day tools">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              id={`myday-tab-${t.id}`}
              aria-controls={`myday-panel-${t.id}`}
              tabIndex={tool === t.id ? 0 : -1}
              onKeyDown={(e) => onTabKey(e, i)}
              type="button"
              role="tab"
              aria-selected={tool === t.id}
              className={`myday-tab${tool === t.id ? ' myday-tab-on' : ''}`}
              onClick={() => {
                setTool(t.id);
                setHint('');
              }}
            >
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </div>
        {onEdit && (
          <button type="button" className="btn edit-schedule" onClick={() => onEdit(tool)} data-testid="edit-schedule" aria-label="Edit schedule (grown-ups)">
            <Icon name="lock" /> <span className="edit-schedule-text">Edit schedule</span>
          </button>
        )}
      </div>

      {speech && (
        <div className={`myday-saying${speech.status === 'failed' || speech.status === 'unsupported' ? ' myday-saying-fail' : ''}`} role={speech.status === 'failed' || speech.status === 'unsupported' ? 'alert' : 'status'} data-testid="myday-saying">
          {speech.status === 'speaking' && <>Saying: “{speech.utterance.text}”</>}
          {speech.status === 'done' && <>Said: “{speech.utterance.text}”</>}
          {speech.status === 'failed' && (
            <>
              Mimzi couldn’t say “{speech.utterance.text}”.{' '}
              <button type="button" className="btn small" onClick={onRetry}>
                Try again
              </button>
            </>
          )}
          {speech.status === 'unsupported' && <>This device can’t speak right now: “{speech.utterance.text}”</>}
        </div>
      )}

      <div className="myday-panel" role="tabpanel" id={`myday-panel-${tool}`} aria-labelledby={`myday-tab-${tool}`}>
      {tool === 'routine' && (
        <p className="myday-panel-note" data-testid="routine-note">
          {myDay.routine.name ? `${myDay.routine.name} · ` : ''}
          {routineTabLabel(myDay.routineLayout, steps.length)} · {steps.length} {steps.length === 1 ? 'step' : 'steps'}
        </p>
      )}
      {tool === 'firstThen' && (
        <div className="myday-body">
          <div className="first-then">
            {card(myDay.firstThen.first, 'FIRST', !myDay.firstThen.first.done, 'First')}
            <span className="ft-arrow" aria-hidden="true">
              <Icon name="arrowRight" size={44} />
            </span>
            {card(myDay.firstThen.then, 'THEN', myDay.firstThen.first.done && !myDay.firstThen.then.done, 'Then')}
          </div>
          <div className="grownup-row">
            <button type="button" className="btn big-btn" onClick={() => say(firstThenSentence(myDay.firstThen.first, myDay.firstThen.then))}>
              <Icon name="speak" /> Say it
            </button>
            {!myDay.firstThen.first.done ? (
              <HoldButton onTap={showHint} holdMs={HOLD} className="btn big-btn grownup" label="Hold to mark FIRST done" onHold={() => void updateMyDay({ ...myDay, firstThen: { ...myDay.firstThen, first: markDone(myDay.firstThen.first) } })}>
                <Icon name="check" /> First done
              </HoldButton>
            ) : !myDay.firstThen.then.done ? (
              <HoldButton onTap={showHint} holdMs={HOLD} className="btn big-btn grownup" label="Hold to mark THEN done" onHold={() => void updateMyDay({ ...myDay, firstThen: { ...myDay.firstThen, then: markDone(myDay.firstThen.then) } })}>
                <Icon name="check" /> Then done
              </HoldButton>
            ) : null}
            <HoldButton onTap={showHint}
              holdMs={HOLD}
              className="btn big-btn grownup"
              label="Hold to start First / Then again"
              onHold={() => {
                const [first, then] = resetItems([myDay.firstThen.first, myDay.firstThen.then]);
                void updateMyDay({ ...myDay, firstThen: { ...myDay.firstThen, first, then } });
              }}
            >
              <Icon name="reset" /> Start again
            </HoldButton>
          </div>
        </div>
      )}

      {tool === 'reward' && <RewardBoardView say={say} showHint={showHint} />}

      {tool === 'routine' && (
        <div className="myday-body">
          {myDay.routineLayout === 'steps' && (
            <ol className={`steps steps-${steps.length}`}>
              {steps.map((s, i) => (
                <li key={i} className="step">
                  {card(s, `${i + 1}`, i === currentStepIndex(steps))}
                </li>
              ))}
            </ol>
          )}
          {myDay.routineLayout === 'nowNextLater' && <NowNextLaterView />}
          {myDay.routineLayout === 'oneAtATime' && <OneAtATimeView />}
          <div className="grownup-row">
            <button type="button" className="btn big-btn" onClick={() => say(steps.map(spokenText).filter(Boolean).join(', then '))}>
              <Icon name="speak" /> Say the steps
            </button>
            {currentStepIndex(steps) >= 0 && (
              <HoldButton onTap={showHint}
                holdMs={HOLD}
                className="btn big-btn grownup"
                label="Hold to mark this step done"
                onHold={() => {
                  const i = currentStepIndex(steps);
                  if (i < 0) return;
                  void updateMyDay({ ...myDay, routine: { ...myDay.routine, steps: steps.map((s, j) => (j === i ? markDone(s) : s)) } });
                }}
              >
                <Icon name="check" /> Step done
              </HoldButton>
            )}
            <HoldButton onTap={showHint}
              holdMs={HOLD}
              className="btn big-btn grownup"
              label="Hold to start the steps again"
              onHold={() => void updateMyDay({ ...myDay, routine: { ...myDay.routine, steps: resetItems(steps) } })}
            >
              <Icon name="reset" /> Start again
            </HoldButton>
          </div>
          {currentStepIndex(steps) === -1 && settings.celebrationVisual && (
            <p className="all-done-note" role="status">
              All done!
            </p>
          )}
        </div>
      )}
      </div>
      <p className="grownup-live" role="status" data-testid="grownup-hint">
        {hint}
      </p>
    </section>
  );

  function NowNextLaterView() {
    const v = nowNextLater(steps);
    if (v.nowIndex === -1) return <p className="board-empty">All done! A grown-up can start again.</p>;
    const slots: [string, ScheduleItem | undefined][] = [
      ['NOW', v.now],
      ['NEXT', v.next],
      ['LATER', v.later],
    ];
    return (
      <div className="nnl">
        {slots.map(([heading, item]) =>
          item ? (
            <ScheduleCard key={heading} item={item} heading={heading} tiles={tileMap} mediaUrls={mediaUrls} onTap={() => sayItem(item)} current={heading === 'NOW'} className={`nnl-${heading.toLowerCase()}`} />
          ) : (
            <div key={heading} className={`sched-card sched-empty nnl-${heading.toLowerCase()}`}>
              <span className="sched-heading">{heading}</span>
              <span className="sched-label">—</span>
            </div>
          ),
        )}
      </div>
    );
  }

  function OneAtATimeView() {
    const i = currentStepIndex(steps);
    if (i === -1) return <p className="board-empty">All done! A grown-up can start again.</p>;
    const upcoming = myDay.showUpcoming !== false ? steps.slice(i + 1) : [];
    return (
      <div className="one-step" data-testid="one-step">
        <div className="one-step-main">{card(steps[i], `STEP ${i + 1} OF ${steps.length}`, true)}</div>
        {upcoming.length > 0 && (
          <div className="one-step-next" aria-label="Coming up">
            {upcoming.map((s, j) => (
              <ScheduleCard key={j} item={s} tiles={tileMap} mediaUrls={mediaUrls} className="sched-mini" />
            ))}
          </div>
        )}
      </div>
    );
  }
}

function RewardBoardView({ say, showHint }: { say: (t: string) => void; showHint: () => void }) {
  const { myDay, updateMyDay, tiles, mediaUrls, settings } = useMimzi();
  const tileMap = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const { reward } = myDay;
  return (
    <RewardBoardDisplay
      reward={reward}
      tileMap={tileMap}
      mediaUrls={mediaUrls}
      reducedMotion={settings.reducedMotion}
      defaultCelebrate={settings.celebrationVisual}
      onSayGoal={() => say(`I'm working for ${spokenText(reward.item)}`)}
    >
      <div className="grownup-row">
        {!rewardComplete(reward) && (
          <HoldButton onTap={showHint}
            holdMs={HOLD}
            className="btn big-btn grownup"
            label="Hold to add a token"
            onHold={() => {
              const next = addToken(reward);
              void updateMyDay({ ...myDay, reward: next });
              if (rewardComplete(next) && (next.sound ?? settings.celebrationSound)) say(completeMessage(next));
            }}
          >
            <Icon name="plus" /> Add token
          </HoldButton>
        )}
        <HoldButton onTap={showHint}
          holdMs={HOLD}
          className="btn big-btn grownup"
          label="Hold to reset tokens"
          onHold={() => void updateMyDay({ ...myDay, reward: { ...reward, earned: 0 } })}
        >
          <Icon name="reset" /> Reset tokens
        </HoldButton>
      </div>
      <p className="muted small grownup-hint">Grown-ups: press and hold to add a token, or use Edit schedule → Progress. Tokens are never taken away as punishment.</p>
    </RewardBoardDisplay>
  );
}

/** The reward board itself — shared by My Day and the editor's live preview. */
export function RewardBoardDisplay({
  reward,
  tileMap,
  mediaUrls,
  reducedMotion,
  defaultCelebrate,
  onSayGoal,
  children,
}: {
  reward: RewardBoard;
  tileMap: Map<string, Tile>;
  mediaUrls: Record<string, string>;
  reducedMotion?: boolean;
  defaultCelebrate?: boolean;
  onSayGoal?: () => void;
  children?: ReactNode;
}) {
  const complete = rewardComplete(reward);
  const pic = itemPicture(reward.item, tileMap, mediaUrls);
  const style = reward.tokenStyle ?? 'star';
  const celebrate = reward.celebrate ?? defaultCelebrate ?? true;
  return (
    <div className={`myday-body reward${reward.boardColor ? ` tile-${reward.boardColor} reward-colored` : ''}`}>
      <button type="button" className="reward-goal" onClick={onSayGoal} tabIndex={onSayGoal ? 0 : -1}>
        <span className="sched-heading">I’M WORKING FOR</span>
        <span className="sched-media">
          <TileFace symbol={pic.symbol} symbolInfo={pic.symbolInfo} tile={pic.tile} photoUrl={pic.photoUrl} label={reward.item.label} />
        </span>
        <span className="sched-label">{reward.item.label}</span>
      </button>
      {reward.goal && <p className="reward-goal-text">{reward.goal}</p>}
      <div className={`tokens tokens-${style}`} role="img" aria-label={`${reward.earned} of ${reward.tokens} tokens`} data-testid="tokens" data-style={style}>
        {Array.from({ length: reward.tokens }, (_, i) => (
          <span key={i} className={`token${i < reward.earned ? ' token-on' : ''}`} data-earned={i < reward.earned} style={reward.tokenColor ? { borderColor: reward.tokenColor } : undefined}>
            <TokenShape style={style} filled={i < reward.earned} color={reward.tokenColor} />
          </span>
        ))}
      </div>
      {complete && celebrate && (
        <p className={`celebrate${reducedMotion ? '' : ' celebrate-anim'}`} role="status">
          {completeMessage(reward)}
        </p>
      )}
      {children}
    </div>
  );
}
