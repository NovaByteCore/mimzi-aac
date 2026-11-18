import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedCategories, buildSeedTiles, QUICK_TILE_IDS } from '../../src/data/vocabulary.ts';
import { SYMBOL_KEYS } from '../../src/data/symbols.tsx';

const tiles = buildSeedTiles();
const categories = buildSeedCategories();

test('starter vocabulary has at least 100 words', () => {
  assert.ok(tiles.length >= 100, `only ${tiles.length} tiles`);
});

test('every tile id is unique and stable', () => {
  const ids = tiles.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(buildSeedTiles().map((t) => t.id), ids, 'ids must be the same on every build');
});

test('every tile belongs to an existing category and has text to speak', () => {
  const catIds = new Set(categories.map((c) => c.id));
  for (const t of tiles) {
    assert.ok(catIds.has(t.categoryId), `${t.id} has unknown category`);
    assert.ok(t.label.trim().length > 0, `${t.id} has no label`);
    assert.ok(t.speak.trim().length > 0, `${t.id} has nothing to say`);
  }
});

test('built-in symbol references all exist', () => {
  const keys = new Set(SYMBOL_KEYS);
  for (const t of [...tiles, ...categories]) {
    if (t.symbol?.startsWith('svg:')) assert.ok(keys.has(t.symbol.slice(4)), `missing symbol ${t.symbol}`);
  }
});

test('quick bar words exist: help, stop, no, more, all done', () => {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const labels = QUICK_TILE_IDS.map((id) => byId.get(id)?.label);
  assert.deepEqual(labels, ['help', 'stop', 'no', 'more', 'all done']);
});

test('all requested categories are present', () => {
  const names = categories.map((c) => c.id);
  for (const id of ['core', 'needs', 'food', 'feelings', 'family', 'play', 'social', 'actions', 'body', 'safety', 'describe', 'phrases']) {
    assert.ok(names.includes(id), `missing category ${id}`);
  }
});

test('core, safety and early phrases from the brief are included', () => {
  const has = (cat: string, label: string) => tiles.some((t) => t.categoryId === cat && t.label === label);
  for (const w of ['more', 'want', 'go', 'stop', 'help', 'open', 'all done', 'yes', 'no', 'mine', 'me', 'you', 'this', 'that']) {
    assert.ok(has('core', w), `core missing ${w}`);
  }
  for (const w of ['hurt', 'hot', 'cold', 'too loud', 'too bright', 'break', 'safe', 'not safe']) {
    assert.ok(has('safety', w), `safety missing ${w}`);
  }
  for (const p of ['More please', 'Help me', 'I want that', 'Open it', 'Go outside', 'More bubbles', 'My turn', 'All done', 'No thank you', "I don't want it", 'It hurts', 'Where Mama?', 'Read book', 'Play cars']) {
    assert.ok(has('phrases', p), `phrases missing ${p}`);
  }
});

test('orders inside each category are 0..n-1 with no gaps', () => {
  const byCat = new Map<string, number[]>();
  for (const t of tiles) byCat.set(t.categoryId, [...(byCat.get(t.categoryId) ?? []), t.order]);
  for (const [cat, orders] of byCat) {
    assert.deepEqual([...orders].sort((a, b) => a - b), orders.map((_, i) => i), `bad order in ${cat}`);
  }
});

test('Food & Drink starts empty — the caregiver chooses every food', () => {
  assert.ok(categories.some((c) => c.id === 'food'));
  assert.equal(tiles.filter((t) => t.categoryId === 'food').length, 0);
});
