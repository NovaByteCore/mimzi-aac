import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentenceReducer, sentenceText, MAX_SENTENCE_ITEMS, type SentenceItem } from '../../src/lib/sentence.ts';
import { moveTile, nextOrder, orderedTiles, pageCells, pageCount } from '../../src/lib/grid.ts';
import { clampCrop, drawRect, minZoom } from '../../src/lib/image.ts';
import { mergeSettings, GRID_PRESETS } from '../../src/lib/defaults.ts';
import type { Tile } from '../../src/types.ts';

const tile = (id: string, order: number, extra: Partial<Tile> = {}): Tile => ({
  id,
  label: id,
  speak: id,
  categoryId: 'c',
  order,
  color: 'cream',
  favorite: false,
  hidden: false,
  builtIn: false,
  ...extra,
});

test('sentence: words are kept exactly in the order tapped', () => {
  let s: SentenceItem[] = [];
  for (const w of ['I', 'want', 'more', 'bubbles']) s = sentenceReducer(s, { type: 'add', item: { tileId: w, label: w, speak: w } });
  assert.equal(sentenceText(s), 'I want more bubbles');
  s = sentenceReducer(s, { type: 'backspace' });
  assert.equal(sentenceText(s), 'I want more');
  s = sentenceReducer(s, { type: 'clear' });
  assert.equal(s.length, 0);
});

test('sentence: the same word can be added twice and keys stay unique', () => {
  let s: SentenceItem[] = [];
  s = sentenceReducer(s, { type: 'add', item: { tileId: 'more', label: 'more', speak: 'more' } });
  s = sentenceReducer(s, { type: 'add', item: { tileId: 'more', label: 'more', speak: 'more' } });
  assert.equal(sentenceText(s), 'more more');
  assert.notEqual(s[0].key, s[1].key);
});

test('sentence: length is capped', () => {
  let s: SentenceItem[] = [];
  for (let i = 0; i < MAX_SENTENCE_ITEMS + 5; i++) s = sentenceReducer(s, { type: 'add', item: { tileId: 'x', label: 'x', speak: 'x' } });
  assert.equal(s.length, MAX_SENTENCE_ITEMS);
});

test('grid: pages always have rows × cols cells and hidden tiles keep their slot', () => {
  const tiles = [tile('a', 0), tile('b', 1, { hidden: true }), tile('c', 2), tile('d', 3), tile('e', 4)];
  const grid = { rows: 2, cols: 2 };
  assert.equal(pageCount(tiles.length, grid), 2);
  assert.deepEqual(pageCells(tiles, grid, 0).map((t) => t?.id ?? null), ['a', null, 'c', 'd']);
  assert.deepEqual(pageCells(tiles, grid, 1).map((t) => t?.id ?? null), ['e', null, null, null]);
});

test('grid: empty slots stay empty — words never slide into gaps', () => {
  const tiles = [tile('a', 0), tile('far', 5)];
  const grid = { rows: 2, cols: 2 };
  assert.equal(pageCount(tiles, grid), 2);
  assert.deepEqual(pageCells(tiles, grid, 0).map((t) => t?.id ?? null), ['a', null, null, null]);
  assert.deepEqual(pageCells(tiles, grid, 1).map((t) => t?.id ?? null), [null, 'far', null, null]);
  assert.equal(nextOrder(tiles, 'c'), 1, 'a new word fills the first gap');
});

test('grid: moving into an empty slot moves only that word', () => {
  const tiles = [tile('a', 0), tile('b', 2)];
  const changed = moveTile(tiles, 'b', -1);
  assert.deepEqual(changed.map((t) => [t.id, t.order]), [['b', 1]]);
});

test('grid: deleted tiles are excluded, order is respected', () => {
  const tiles = [tile('b', 1), tile('a', 0), tile('x', 2, { deletedAt: 1 }), tile('z', 0, { categoryId: 'other' })];
  assert.deepEqual(orderedTiles(tiles, 'c').map((t) => t.id), ['a', 'b']);
  assert.equal(nextOrder(tiles, 'c'), 2);
  assert.equal(nextOrder(tiles, 'empty'), 0);
});

test('grid: moving a tile only swaps it with its neighbour', () => {
  const tiles = [tile('a', 0), tile('b', 1), tile('c', 2)];
  const changed = moveTile(tiles, 'c', -1);
  const order = new Map(tiles.map((t) => [t.id, t.order]));
  for (const t of changed) order.set(t.id, t.order);
  assert.deepEqual([...order].sort((x, y) => x[1] - y[1]).map(([id]) => id), ['a', 'c', 'b']);
  assert.deepEqual(moveTile(tiles, 'a', -1), [], 'cannot move past the start');
});

test('crop: default fills the square, min zoom shows the whole photo, drag is clamped', () => {
  const r = drawRect(400, 200, 100, { zoom: 1, offsetX: 0, offsetY: 0 });
  assert.deepEqual(r, { x: -50, y: 0, w: 200, h: 100 });
  assert.equal(minZoom(400, 200), 0.5);
  const clamped = clampCrop(400, 200, 100, { zoom: 1, offsetX: 999, offsetY: 999 });
  assert.deepEqual(clamped, { zoom: 1, offsetX: 50, offsetY: 0 });
  assert.equal(clampCrop(400, 200, 100, { zoom: 0.1, offsetX: 0, offsetY: 0 }).zoom, 0.5);
});

test('settings: saved choices survive, new defaults are filled in', () => {
  const s = mergeSettings({ speechRate: 1.2, grid: { rows: 2, cols: 2 } });
  assert.equal(s.speechRate, 1.2);
  assert.deepEqual(s.grid, { rows: 2, cols: 2 });
  assert.equal(s.showSentenceBar, true);
  assert.equal(s.quickTileIds.length, 5);
  assert.ok(GRID_PRESETS.some((p) => p.grid.rows === 2 && p.grid.cols === 2));
  assert.ok(GRID_PRESETS.some((p) => p.grid.rows === 4 && p.grid.cols === 4));
});
