import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayString, defaultGrowPlan, dueDateFor, moveItem, nextWeekday, processDue, reschedule, scheduleWords, setStatus } from '../../src/lib/grow.ts';
import { chooseVoice, spokenFor } from '../../src/lib/speech.ts';
import { displayColor } from '../../src/lib/colors.ts';
import { searchSymbols, type SymbolEntry } from '../../src/parent/SymbolSearch.tsx';
import { readFileSync } from 'node:fs';

/* ---------- Grow My Words ---------- */

test('weekly: two words every Monday', () => {
  const plan = { ...defaultGrowPlan(), cadence: 'weekly' as const, perPeriod: 2, weekday: 1 };
  // 2026-11-18 is a Wednesday → first Monday is 2026-11-23
  const p = scheduleWords(plan, ['a', 'b', 'c', 'd', 'e'], '2026-11-18');
  assert.deepEqual(p.items.map((i) => i.dueDate), ['2026-11-23', '2026-11-23', '2026-11-30', '2026-11-30', '2026-12-07']);
  assert.ok(p.items.every((i) => i.status === 'planned'));
});

test('daily: one word a day, continuing after words already planned', () => {
  const plan = { ...defaultGrowPlan(), cadence: 'daily' as const, perPeriod: 1 };
  let p = scheduleWords(plan, ['open', 'again'], '2026-11-23');
  p = scheduleWords(p, ['look', 'open'], '2026-12-25'); // "open" is already planned → not added twice
  assert.deepEqual(p.items.map((i) => [i.tileId, i.dueDate]), [['open', '2026-11-23'], ['again', '2026-11-24'], ['look', '2026-11-25']]);
});

test('due words wait for approval by default; automatic only when switched on', () => {
  const base = scheduleWords({ ...defaultGrowPlan(), cadence: 'daily', perPeriod: 1 }, ['a', 'b'], '2026-11-20');
  const r1 = processDue(base, '2026-11-20');
  assert.deepEqual(r1.show, []);
  assert.deepEqual(r1.newlyPending, ['a']);
  assert.equal(r1.plan.items[1].status, 'planned');
  const r2 = processDue({ ...base, autoAdd: true }, '2026-11-30');
  assert.deepEqual(r2.show, ['a', 'b'], 'overdue words are applied the next time Mimzi opens');
  assert.ok(r2.plan.items.every((i) => i.status === 'added' && i.addedOn === '2026-11-30'));
});

test('pause stops processing; resume re-plans from today; skip/cancel/approve', () => {
  const base = scheduleWords({ ...defaultGrowPlan(), cadence: 'daily', perPeriod: 1, paused: true }, ['a', 'b'], '2026-11-01');
  assert.deepEqual(processDue(base, '2026-11-20').newlyPending, []);
  const resumed = reschedule({ ...base, paused: false }, '2026-11-20');
  assert.deepEqual(resumed.items.map((i) => i.dueDate), ['2026-11-20', '2026-11-21']);
  const ids = resumed.items.map((i) => i.id);
  assert.equal(setStatus(resumed, [ids[0]], 'skipped', '2026-11-20').items[0].status, 'skipped');
  const ok = setStatus(resumed, [ids[1]], 'added', '2026-11-20').items[1];
  assert.equal(ok.status, 'added');
  assert.equal(ok.addedOn, '2026-11-20');
  const moved = moveItem(resumed, ids[1], -1, '2026-11-20');
  assert.deepEqual(moved.items.map((i) => i.tileId), ['b', 'a']);
});

test('date helpers', () => {
  assert.equal(nextWeekday('2026-11-18', 1), '2026-11-23');
  assert.equal(nextWeekday('2026-11-23', 1), '2026-11-23');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dueDateFor({ cadence: 'weekly', perPeriod: 3, weekday: 5 }, '2026-11-18', 3), '2026-11-27');
  assert.match(dayString(), /^\d{4}-\d{2}-\d{2}$/);
});

/* ---------- speech ---------- */

const v = (voiceURI: string, lang: string, localService: boolean) => ({ voiceURI, name: voiceURI, lang, localService, default: false }) as SpeechSynthesisVoice;

test('voice choice: chosen voice when available; offline falls back to an on-device voice; missing is reported', () => {
  const voices = [v('cloud-en', 'en-US', false), v('local-en', 'en-US', true), v('local-es', 'es-US', true)];
  assert.equal(chooseVoice(voices, 'cloud-en', 'en-US', true).voice?.voiceURI, 'cloud-en');
  const off = chooseVoice(voices, 'cloud-en', 'en-US', false);
  assert.equal(off.voice?.voiceURI, 'local-en');
  assert.equal(off.reason, 'offline');
  const missing = chooseVoice(voices, 'gone', 'en-US', true);
  assert.equal(missing.voice?.voiceURI, 'local-en');
  assert.equal(missing.reason, 'missing');
  assert.equal(chooseVoice(voices, undefined, 'es-US', true).voice?.voiceURI, 'local-es');
});

test('pronunciation overrides only what is spoken', () => {
  assert.equal(spokenFor({ label: 'Ria', speak: 'Ria', pronunciation: 'Ree-ah' }), 'Ree-ah');
  assert.equal(spokenFor({ label: 'all done', speak: 'All done!' }), 'All done!');
  assert.equal(spokenFor({ label: 'Trampoline', speak: '' }), 'Trampoline');
});

/* ---------- colours & symbols ---------- */

test('colour coding by word type, or each tile’s own colour', () => {
  assert.equal(displayColor({ color: 'sage', wordType: 'verb' }, { colorMode: 'wordType' }), 'green');
  assert.equal(displayColor({ color: 'sage', wordType: 'verb' }, { colorMode: 'custom' }), 'sage');
  assert.equal(displayColor({ color: 'sage' }, { colorMode: 'wordType' }), 'sage');
});

test('symbol search finds exact words first', () => {
  const index = JSON.parse(readFileSync('public/symbols/mulberry-index.json', 'utf8')) as SymbolEntry[];
  assert.ok(index.length > 3000);
  assert.equal(searchSymbols(index, 'drink')[0].n, 'drink');
  assert.equal(searchSymbols(index, 'trampoline')[0].n, 'trampoline');
  assert.deepEqual(searchSymbols(index, ''), []);
});
