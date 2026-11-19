import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMyDay, mergeMyDay } from '../../src/lib/defaults.ts';
import {
  addStep,
  addToken,
  clampSteps,
  completeMessage,
  deleteTemplate,
  duplicateTemplate,
  itemPicture,
  MAX_STEPS,
  removeStep,
  renameTemplate,
  scheduleSymbolUrls,
  setTokenCount,
  uniqueName,
} from '../../src/lib/myday.ts';
import { referencedMediaIds } from '../../src/lib/media.ts';
import type { MyDay, ScheduleItem } from '../../src/types.ts';

const it = (label: string, extra: Partial<ScheduleItem> = {}): ScheduleItem => ({ label, done: false, ...extra });

test('saved schedules from older versions load unchanged, gaining examples and new options', () => {
  // A v1 My Day exactly as earlier versions stored it (no version, no new fields).
  const v1 = {
    firstThen: { first: it('Bath', { photoId: 'p1' }), then: it('Story', { tileId: 'play-books' }) },
    firstThenTemplates: [{ id: 'ft-mine', name: 'Bedtime', first: it('Bath'), then: it('Story') }],
    reward: { item: it('Park'), tokens: 4, earned: 2 },
    rewardTemplates: [],
    routine: { steps: [it('a'), it('b', { done: true }), it('c'), it('d'), it('e'), it('f')] },
    routineTemplates: [{ id: 'rt-mine', name: 'Bedtime', steps: [it('x')] }],
    routineLayout: 'nowNextLater',
  } as unknown as Partial<MyDay>;
  const m = mergeMyDay(v1);
  assert.equal(m.version, 2);
  assert.deepEqual(m.firstThen, v1.firstThen, 'current First / Then untouched');
  assert.equal(m.reward.tokens, 4);
  assert.equal(m.reward.earned, 2, 'earned tokens kept');
  assert.equal(m.reward.tokenStyle, 'star');
  assert.equal(m.routine.steps.length, MAX_STEPS, 'routine trimmed to 5 steps');
  assert.equal(m.routine.steps[1].done, true, 'progress kept');
  assert.equal(m.routineLayout, 'nowNextLater');
  assert.ok(m.firstThenTemplates.some((t) => t.id === 'ft-mine'), 'caregiver templates kept');
  assert.equal(m.routineTemplates.filter((t) => t.name === 'Bedtime').length, 1, 'example not added over a caregiver template with the same name');
  assert.ok(m.routineTemplates.some((t) => t.name === 'Morning Routine'));
  assert.ok(m.rewardTemplates.some((t) => t.name === 'Working for music'));
  // Loading again doesn't add examples twice.
  const again = mergeMyDay(m);
  assert.equal(again.routineTemplates.length, m.routineTemplates.length);
});

test('defaults: First / Then, a 3-token reward, a 3-step routine and example templates', () => {
  const d = defaultMyDay();
  assert.equal(d.reward.tokens, 3);
  assert.equal(d.routine.steps.length, 3);
  assert.deepEqual(d.routineTemplates.map((t) => t.name), ['Morning Routine', 'Leaving Home', 'Bedtime']);
  assert.deepEqual(d.rewardTemplates.map((t) => t.name), ['Working for bubbles', 'Working for outdoor play', 'Working for a favorite toy', 'Working for music']);
});

test('routine steps stay between 1 and 5', () => {
  let steps = [it('a')];
  assert.equal(removeStep(steps, 0).length, 1);
  for (let i = 0; i < 10; i++) steps = addStep(steps);
  assert.equal(steps.length, 5);
  assert.equal(clampSteps([]).length, 1);
});

test('tokens: 1–10, only added, never removed below what was earned unless the board shrinks', () => {
  const r = { item: it('Bubbles'), tokens: 3, earned: 0 };
  assert.equal(setTokenCount(r, 0).tokens, 1);
  assert.equal(setTokenCount(r, 99).tokens, 10);
  const full = addToken(addToken(addToken(addToken(r))));
  assert.equal(full.earned, 3);
  assert.equal(setTokenCount(full, 5).earned, 3);
  assert.equal(completeMessage(full), 'You did it! Time for Bubbles.');
  assert.equal(completeMessage({ ...full, completeMessage: 'Yay!' }), 'Yay!');
});

test('templates: unique names, rename, duplicate, delete', () => {
  let list = [{ id: 'a', name: 'Bedtime' }];
  assert.equal(uniqueName(list, 'bedtime'), 'bedtime (2)');
  list = duplicateTemplate(list, 'a', 'b');
  assert.deepEqual(list.map((t) => t.name), ['Bedtime', 'Bedtime copy']);
  list = renameTemplate(list, 'b', 'Bedtime');
  assert.equal(list[1].name, 'Bedtime (2)');
  assert.deepEqual(deleteTemplate(list, 'a').map((t) => t.id), ['b']);
});

test('schedule pictures: photo > chosen symbol > board word; symbols saved for offline; photos never deleted while used', () => {
  const tile = { id: 't', label: 'cup', categoryId: 'c', order: 0, color: 'white', hidden: false, favorite: false, builtIn: false, symbol: 'mul:cup' } as never;
  const tiles = new Map([['t', tile]]);
  assert.equal(itemPicture(it('x', { photoId: 'p', symbol: 'arasaac:5' }), tiles, { p: 'blob:p' }).photoUrl, 'blob:p');
  assert.equal(itemPicture(it('x', { symbol: 'arasaac:5', tileId: 't' }), tiles, {}).symbol, 'arasaac:5');
  assert.equal(itemPicture(it('x', { tileId: 't' }), tiles, {}).symbol, 'mul:cup');
  assert.deepEqual(itemPicture(it('x'), tiles, {}), {});
  const day = defaultMyDay();
  day.routineTemplates[0].steps[0] = it('Shoes', { symbol: 'arasaac:77' });
  day.rewardTemplates[0].item = it('Swing', { photoId: 'photo-in-template' });
  assert.ok(scheduleSymbolUrls(day).includes('https://api.arasaac.org/v1/pictograms/77'));
  assert.ok(referencedMediaIds({ tiles: [], myDay: day, observations: [] }).has('photo-in-template'));
});
