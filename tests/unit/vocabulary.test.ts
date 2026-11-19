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
  for (const id of ['core', 'needs', 'food', 'feelings', 'family', 'play', 'social', 'actions', 'body', 'safety', 'describe', 'phrases', 'questions', 'places']) {
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
  for (const p of ['More please', 'Help me', 'I want that', 'Open it', 'Go outside', 'More bubbles', 'My turn', 'All done', 'No thank you', "I don't want it", 'It hurts', 'Where is Mama?', 'Read book', 'Play cars', 'Look at that']) {
    assert.ok(has('phrases', p), `phrases missing ${p}`);
  }
});

test('no two words share a slot on a page (stable positions)', () => {
  const seen = new Set<string>();
  for (const t of tiles) {
    const key = `${t.categoryId}:${t.order}`;
    assert.ok(!seen.has(key), `slot clash ${key}`);
    seen.add(key);
  }
});

test('every word uses a real AAC symbol (Mulberry file or Mimzi original) — no emoji', async () => {
  const { existsSync } = await import('node:fs');
  for (const t of [...tiles, ...categories]) {
    assert.match(t.symbol ?? '', /^(mul|svg):/, `${'label' in t ? t.label : t.name} has no AAC symbol`);
    if (t.symbol!.startsWith('mul:')) assert.ok(existsSync(`public/symbols/mulberry/${t.symbol!.slice(4)}.svg`), `missing ${t.symbol}`);
    if (t.symbol!.startsWith('svg:')) assert.ok(SYMBOL_KEYS.includes(t.symbol!.slice(4)), `missing ${t.symbol}`);
  }
});

test('Home has folders to every page, and folder buttons point at real pages', () => {
  const pageIds = new Set(categories.map((c) => c.id));
  const folders = tiles.filter((t) => t.linkTo);
  for (const f of folders) assert.ok(pageIds.has(f.linkTo!), `folder ${f.id} → ${f.linkTo}`);
  for (const c of categories.filter((c) => c.id !== 'core')) assert.ok(folders.some((f) => f.categoryId === 'core' && f.linkTo === c.id), `no Home folder for ${c.id}`);
});

test('every word has a word type for colour coding', () => {
  for (const t of tiles) assert.ok(t.wordType, `${t.id} has no word type`);
});

test('Food & Drinks: every food starts hidden — the caregiver chooses which appear', () => {
  const foods = tiles.filter((t) => t.categoryId === 'food' && t.wordType === 'noun');
  assert.ok(foods.length >= 10);
  assert.ok(foods.every((t) => t.hidden), 'no food is shown until a grown-up picks it');
});

test('ASL drawings: every mapped word exists and points at a real drawing with a reference', async () => {
  const { ASL_BY_LABEL } = await import('../../src/data/vocabulary.ts');
  const { ASL_SIGNS } = await import('../../src/data/aslSigns.tsx');
  for (const sign of Object.values(ASL_BY_LABEL)) assert.ok(ASL_SIGNS[sign], `no drawing ${sign}`);
  for (const t of tiles) if (t.aslSign) assert.ok(ASL_SIGNS[t.aslSign], `${t.id} → ${t.aslSign}`);
  for (const [k, s] of Object.entries(ASL_SIGNS)) {
    assert.match(s.source, /^https:\/\//, `${k} needs a reference`);
    assert.ok(s.how.length > 20, `${k} needs a description`);
  }
  assert.equal(tiles.find((t) => t.id === 'core-want')?.aslSign, 'want');
  assert.equal(tiles.find((t) => t.id === 'core-more')?.aslSign, 'more');
});
