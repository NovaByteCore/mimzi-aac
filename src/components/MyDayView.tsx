import { useMemo, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import type { MyDayTool, ScheduleItem } from '../types';
import { ScheduleCard } from './ScheduleCard';
import { HoldButton } from './HoldButton';
import {
  addToken,
  currentStepIndex,
  firstThenSentence,
  itemPicture,
  markDone,
  nowNextLater,
  resetItems,
  rewardComplete,
  spokenText,
} from '../lib/myday';
import { TileFace } from './TileFace';

interface Props {
  say: (text: string) => void;
}

const HOLD = 800;

/**
 * My Day — visual supports. Tapping a picture speaks it. Marking things done and adding
 * tokens are grown-up actions, so they need a short press-and-hold.
 */
export function MyDayView({ say }: Props) {
  const { myDay, updateMyDay, tiles, mediaUrls, settings } = useMimzi();
  const [tool, setTool] = useState<MyDayTool>('firstThen');
  const tileMap = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const tabs: { id: MyDayTool; label: string; icon: string }[] = [
    { id: 'firstThen', label: 'First / Then', icon: '➡️' },
    { id: 'reward', label: 'I’m working for', icon: '⭐' },
    { id: 'routine', label: myDay.routineLayout === 'steps' ? 'My three steps' : 'Now / Next / Later', icon: '🔢' },
  ];

  const sayItem = (item: ScheduleItem, prefix = '') => {
    const t = spokenText(item);
    if (t) say(prefix ? `${prefix} ${t}` : t);
  };

  return (
    <section className="myday" aria-label="My Day">
      <div className="myday-tabs" role="tablist" aria-label="My Day tools">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tool === t.id}
            className={`myday-tab${tool === t.id ? ' myday-tab-on' : ''}`}
            onClick={() => setTool(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {tool === 'firstThen' && (
        <div className="myday-body">
          <div className="first-then">
            <ScheduleCard
              item={myDay.firstThen.first}
              heading="FIRST"
              tiles={tileMap}
              mediaUrls={mediaUrls}
              onTap={() => sayItem(myDay.firstThen.first, 'First')}
              current={!myDay.firstThen.first.done}
            />
            <span className="ft-arrow" aria-hidden="true">
              ➜
            </span>
            <ScheduleCard
              item={myDay.firstThen.then}
              heading="THEN"
              tiles={tileMap}
              mediaUrls={mediaUrls}
              onTap={() => sayItem(myDay.firstThen.then, 'Then')}
              current={myDay.firstThen.first.done && !myDay.firstThen.then.done}
            />
          </div>
          <div className="grownup-row">
            <button type="button" className="btn big-btn" onClick={() => say(firstThenSentence(myDay.firstThen.first, myDay.firstThen.then))}>
              🔊 Say it
            </button>
            {!myDay.firstThen.first.done ? (
              <HoldButton holdMs={HOLD} className="btn big-btn grownup" label="Hold to mark FIRST done" onHold={() => void updateMyDay({ ...myDay, firstThen: { ...myDay.firstThen, first: markDone(myDay.firstThen.first) } })}>
                ✓ First done
              </HoldButton>
            ) : !myDay.firstThen.then.done ? (
              <HoldButton holdMs={HOLD} className="btn big-btn grownup" label="Hold to mark THEN done" onHold={() => void updateMyDay({ ...myDay, firstThen: { ...myDay.firstThen, then: markDone(myDay.firstThen.then) } })}>
                ✓ Then done
              </HoldButton>
            ) : null}
            <HoldButton
              holdMs={HOLD}
              className="btn big-btn grownup"
              label="Hold to start First / Then again"
              onHold={() => {
                const [first, then] = resetItems([myDay.firstThen.first, myDay.firstThen.then]);
                void updateMyDay({ ...myDay, firstThen: { first, then } });
              }}
            >
              ↺ Start again
            </HoldButton>
          </div>
        </div>
      )}

      {tool === 'reward' && <RewardBoard say={say} />}

      {tool === 'routine' && (
        <div className="myday-body">
          {myDay.routineLayout === 'steps' ? (
            <ol className="steps">
              {myDay.routine.steps.map((s, i) => (
                <li key={i} className="step">
                  <ScheduleCard
                    item={s}
                    heading={`${i + 1}`}
                    tiles={tileMap}
                    mediaUrls={mediaUrls}
                    onTap={() => sayItem(s)}
                    current={i === currentStepIndex(myDay.routine.steps)}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <NowNextLaterView steps={myDay.routine.steps} onSay={sayItem} />
          )}
          <div className="grownup-row">
            <button
              type="button"
              className="btn big-btn"
              onClick={() =>
                say(
                  myDay.routine.steps
                    .map(spokenText)
                    .filter(Boolean)
                    .join(', then '),
                )
              }
            >
              🔊 Say the steps
            </button>
            {currentStepIndex(myDay.routine.steps) >= 0 && (
              <HoldButton
                holdMs={HOLD}
                className="btn big-btn grownup"
                label="Hold to mark this step done"
                onHold={() => {
                  const i = currentStepIndex(myDay.routine.steps);
                  if (i < 0) return;
                  const steps = myDay.routine.steps.map((s, j) => (j === i ? markDone(s) : s));
                  void updateMyDay({ ...myDay, routine: { steps } });
                }}
              >
                ✓ Step done
              </HoldButton>
            )}
            <HoldButton
              holdMs={HOLD}
              className="btn big-btn grownup"
              label="Hold to start the steps again"
              onHold={() => void updateMyDay({ ...myDay, routine: { steps: resetItems(myDay.routine.steps) } })}
            >
              ↺ Start again
            </HoldButton>
          </div>
          {currentStepIndex(myDay.routine.steps) === -1 && settings.celebrationVisual && (
            <p className="all-done-note" role="status">
              All done! 🎉
            </p>
          )}
        </div>
      )}
    </section>
  );

  function NowNextLaterView({ steps, onSay }: { steps: ScheduleItem[]; onSay: (i: ScheduleItem) => void }) {
    const v = nowNextLater(steps);
    if (v.nowIndex === -1) {
      return <p className="board-empty">All done! A grown-up can start again.</p>;
    }
    const slots: [string, ScheduleItem | undefined][] = [
      ['NOW', v.now],
      ['NEXT', v.next],
      ['LATER', v.later],
    ];
    return (
      <div className="nnl">
        {slots.map(([heading, item]) =>
          item ? (
            <ScheduleCard key={heading} item={item} heading={heading} tiles={tileMap} mediaUrls={mediaUrls} onTap={() => onSay(item)} current={heading === 'NOW'} className={`nnl-${heading.toLowerCase()}`} />
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
}

function RewardBoard({ say }: { say: (t: string) => void }) {
  const { myDay, updateMyDay, tiles, mediaUrls, settings } = useMimzi();
  const tileMap = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const { reward } = myDay;
  const complete = rewardComplete(reward);
  const pic = itemPicture(reward.item, tileMap, mediaUrls);

  return (
    <div className="myday-body reward">
      <button type="button" className="reward-goal" onClick={() => say(`I'm working for ${spokenText(reward.item)}`)}>
        <span className="sched-heading">I’M WORKING FOR</span>
        <span className="sched-media">
          <TileFace symbol={pic.symbol} tile={pic.tile} asl={pic.asl} photoUrl={pic.photoUrl} label={reward.item.label} />
        </span>
        <span className="sched-label">{reward.item.label}</span>
      </button>
      <div className="tokens" role="img" aria-label={`${reward.earned} of ${reward.tokens} tokens`} data-testid="tokens">
        {Array.from({ length: reward.tokens }, (_, i) => (
          <span key={i} className={`token${i < reward.earned ? ' token-on' : ''}`} data-earned={i < reward.earned}>
            {i < reward.earned ? '⭐' : ''}
          </span>
        ))}
      </div>
      {complete && settings.celebrationVisual && (
        <p className={`celebrate${settings.reducedMotion ? '' : ' celebrate-anim'}`} role="status">
          🎉 You did it! Time for {reward.item.label}.
        </p>
      )}
      <div className="grownup-row">
        {!complete && (
          <HoldButton
            holdMs={HOLD}
            className="btn big-btn grownup"
            label="Hold to add a token"
            onHold={() => {
              const next = addToken(reward);
              void updateMyDay({ ...myDay, reward: next });
              if (rewardComplete(next) && settings.celebrationSound) say('You did it!');
            }}
          >
            ⭐ Add token
          </HoldButton>
        )}
        <HoldButton
          holdMs={HOLD}
          className="btn big-btn grownup"
          label="Hold to start a new board"
          onHold={() => void updateMyDay({ ...myDay, reward: { ...reward, earned: 0 } })}
        >
          ↺ New board
        </HoldButton>
      </div>
      <p className="muted small grownup-hint">Grown-ups: press and hold to add a token. Tokens are never taken away.</p>
    </div>
  );
}
