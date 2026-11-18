import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addToken,
  currentStepIndex,
  firstThenSentence,
  itemPicture,
  markDone,
  moveStep,
  nowNextLater,
  resetItems,
  rewardComplete,
  setTokenCount,
} from '../../src/lib/myday.ts';
import { defaultMyDay, mergeMyDay } from '../../src/lib/defaults.ts';
import { observationsToCsv, observationsToText, sortObservations } from '../../src/lib/observations.ts';
import { mergeRecords, resolveConflict, syncStatusText, type SyncRecord } from '../../src/lib/sync.ts';
import { isSignFile, pickRecordingMime, referencedMediaIds } from '../../src/lib/media.ts';
import type { Observation, ScheduleItem, Tile } from '../../src/types.ts';

const item = (label: string, done = false): ScheduleItem => ({ label, done });

test('First / Then sentence uses the spoken text', () => {
  assert.equal(firstThenSentence(item('Brush teeth'), { ...item('Cars'), speak: 'play cars' }), 'First Brush teeth, then play cars');
  assert.equal(firstThenSentence(item(''), item('Park')), 'Park');
});

test('tokens: add only up to the goal, never removed by adding', () => {
  let r = { item: item('Bubbles'), tokens: 3, earned: 0 };
  r = addToken(addToken(addToken(addToken(r))));
  assert.equal(r.earned, 3);
  assert.equal(rewardComplete(r), true);
});

test('tokens: board size is clamped to 1–10 and keeps earned tokens where possible', () => {
  const r = { item: item('x'), tokens: 5, earned: 4 };
  assert.equal(setTokenCount(r, 99).tokens, 10);
  assert.equal(setTokenCount(r, 0).tokens, 1);
  assert.equal(setTokenCount(r, 8).earned, 4);
  assert.equal(mergeMyDay({ reward: { item: item('x'), tokens: 50, earned: 70 } }).reward.tokens, 10);
  assert.equal(defaultMyDay().reward.tokens, 3, 'three tokens by default');
});

test('routine: current step, Now/Next/Later and reset share the same data', () => {
  const steps = [item('Get shoes', true), item('Put on shoes'), item('Go outside')];
  assert.equal(currentStepIndex(steps), 1);
  const v = nowNextLater(steps);
  assert.equal(v.now?.label, 'Put on shoes');
  assert.equal(v.next?.label, 'Go outside');
  assert.equal(v.later, undefined);
  const all = steps.map((s) => markDone(s));
  assert.equal(currentStepIndex(all), -1);
  assert.equal(nowNextLater(all).nowIndex, -1);
  assert.equal(currentStepIndex(resetItems(all)), 0);
  assert.deepEqual(moveStep(steps, 2, -1).map((s) => s.label), ['Get shoes', 'Go outside', 'Put on shoes']);
});

test('schedule pictures: own photo beats linked word picture', () => {
  const tiles = new Map<string, Tile>([
    ['t', { id: 't', label: 'Cars', speak: 'cars', categoryId: 'play', order: 0, symbol: '🚗', color: 'sage', favorite: false, hidden: false, builtIn: true, photoId: 'p-tile' }],
  ]);
  const urls = { 'p-tile': 'blob:tile', 'p-own': 'blob:own' };
  assert.deepEqual(itemPicture({ ...item('x'), tileId: 't' }, tiles, urls), { photoUrl: 'blob:tile', symbol: '🚗' });
  assert.deepEqual(itemPicture({ ...item('x'), tileId: 't', photoId: 'p-own' }, tiles, urls), { photoUrl: 'blob:own' });
  assert.deepEqual(itemPicture(item('x'), tiles, urls), {});
});

const obs = (target: string, date: string, extra: Partial<Observation> = {}): Observation => ({
  id: `${target}-${date}`,
  target,
  pronunciation: '',
  method: 'Speech',
  date,
  notes: '',
  createdAt: Date.parse(date),
  ...extra,
});

test('My Words: CSV export is quoted, safe for spreadsheets and newest first', () => {
  const csv = observationsToCsv([
    obs('more', '2026-10-01', { pronunciation: 'mo', method: 'Word approximation' }),
    obs('help', '2026-11-02', { notes: 'said "help" at lunch, then signed' }),
    obs('=cmd', '2026-09-01'),
  ]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.match(lines[1], /^"2026-11-02","help"/);
  assert.match(lines[1], /said ""help"" at lunch/);
  assert.match(lines[3], /"'=cmd"/, 'formula injection neutralised');
  assert.doesNotMatch(csv, /score|level|%/i);
});

test('My Words: therapist summary groups by word, oldest first, with no scoring', () => {
  const text = observationsToText([obs('more', '2026-11-01', { pronunciation: 'more' }), obs('More', '2026-10-01', { pronunciation: 'mo' })]);
  const idxOld = text.indexOf('2026-10-01');
  const idxNew = text.indexOf('2026-11-01');
  assert.ok(idxOld > 0 && idxOld < idxNew);
  assert.match(text, /not an assessment/);
  assert.equal(sortObservations([obs('a', '2026-01-01'), obs('b', '2026-02-01')])[0].target, 'b');
});

test('sync design: last writer wins per record, ties broken by device id, tombstones kept', () => {
  const a: SyncRecord = { store: 'tiles', id: 't1', updatedAt: 10, deviceId: 'ipad', value: 'A' };
  const b: SyncRecord = { store: 'tiles', id: 't1', updatedAt: 20, deviceId: 'galaxy', value: 'B' };
  assert.equal(resolveConflict(a, b).value, 'B');
  assert.equal(resolveConflict(b, a).value, 'B');
  const tie: SyncRecord = { ...a, deviceId: 'zzz', value: 'Z' };
  assert.equal(resolveConflict(a, tie).value, resolveConflict(tie, a).value, 'every device reaches the same answer');
  const del: SyncRecord = { ...b, updatedAt: 30, deleted: true };
  assert.equal(mergeRecords([a], [del])[0].deleted, true);
  assert.match(syncStatusText({ kind: 'off' }), /This device only/);
});

test('media: references from tiles, schedules and notes are all kept', () => {
  const day = defaultMyDay();
  day.reward.item.photoId = 'p-reward';
  day.routineTemplates = [{ id: 'r', name: 'Bed', steps: [{ label: 'x', done: false, photoId: 'p-template' }] }];
  const ids = referencedMediaIds({
    tiles: [{ id: 't', label: 'x', speak: 'x', categoryId: 'c', order: 0, color: 'cream', favorite: false, hidden: false, builtIn: false, audioId: 'a1', signId: 's1' }],
    myDay: day,
    observations: [obs('more', '2026-01-01', { audioId: 'a2' })],
  });
  assert.deepEqual([...ids].sort(), ['a1', 'a2', 'p-reward', 'p-template', 's1']);
});

test('media: sign files and recording formats', () => {
  assert.equal(isSignFile('image/gif'), true);
  assert.equal(isSignFile('video/mp4'), true);
  assert.equal(isSignFile('image/png'), false);
  assert.equal(pickRecordingMime((t) => t === 'audio/webm'), 'audio/webm');
  assert.equal(pickRecordingMime((t) => t === 'audio/mp4'), 'audio/mp4');
  assert.equal(pickRecordingMime(() => false), undefined);
});

test('text colour on every tile colour meets WCAG AA contrast (4.5:1)', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const slate = '#28384A';
  for (const bg of ['#DCECF8', '#FFF9ED', '#DDEEDC', '#E9E4F7', '#F8E1D2', '#FFF1C9', '#F9E0E6', '#FFFFFF']) {
    assert.ok(ratio(slate, bg) >= 4.5, `${bg}: ${ratio(slate, bg).toFixed(2)}`);
  }
});
