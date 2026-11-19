import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoGrid, pageForAnchor, minTileFor } from '../../src/lib/autoGrid.ts';
import { swapWordInto, swapCandidates } from '../../src/lib/manageWords.ts';
import { draftChanges, draftFor, moveInDraft, tileAt } from '../../src/lib/arrange.ts';
import { pageCount, slotMap, orderedTiles } from '../../src/lib/grid.ts';
import { buildSeedTiles } from '../../src/data/vocabulary.ts';
import type { Tile } from '../../src/types.ts';

const seed = buildSeedTiles();

/* ---------- Auto layout ---------- */

test('auto layout: onn tablet landscape and portrait get large, roughly square tiles', () => {
  for (const [w, h] of [
    [740, 430], // board area, onn landscape (960 × 600 screen)
    [520, 690], // board area, onn portrait (600 × 960 screen)
    [1020, 600], // iPad
  ]) {
    const r = autoGrid({ width: w, height: h, textScale: 1, maxGap: 12 });
    assert.ok(Math.min(r.tile.w, r.tile.h) >= 88, `${w}×${h}: ${r.grid.rows}×${r.grid.cols} tile ${Math.round(r.tile.w)}×${Math.round(r.tile.h)}`);
    assert.ok(r.tile.w / r.tile.h <= 1.8 && r.tile.w / r.tile.h >= 0.7);
    assert.ok(r.grid.rows * r.grid.cols >= 8, 'still plenty of words per page');
  }
});

test('auto layout: larger text → larger tiles (fewer per page); short phone screens keep two rows', () => {
  const normal = autoGrid({ width: 740, height: 430, textScale: 1, maxGap: 12 });
  const big = autoGrid({ width: 740, height: 430, textScale: 1.6, maxGap: 12 });
  assert.ok(big.grid.rows * big.grid.cols < normal.grid.rows * normal.grid.cols);
  assert.ok(Math.min(big.tile.w, big.tile.h) >= minTileFor(1.6));
  const phone = autoGrid({ width: 660, height: 230, textScale: 1.6, maxGap: 12 });
  assert.equal(phone.grid.rows, 2);
  assert.ok(phone.grid.cols >= 4, `phone landscape ${phone.grid.rows}×${phone.grid.cols}`);
});

test('rotation keeps the same words on screen: the page comes from the first slot that was showing', () => {
  // Landscape 4 × 7 = 28 per page, on page 2 (slots 28–55). Portrait 6 × 4 = 24 per page.
  const anchor = 1 * 28;
  assert.equal(pageForAnchor(anchor, { rows: 6, cols: 4 }), 1); // slots 24–47: still shows slot 28
  assert.equal(pageForAnchor(anchor, { rows: 4, cols: 7 }), 1);
  assert.equal(pageForAnchor(0, { rows: 2, cols: 2 }), 0);
});

test('a trailing page with only hidden words is not shown to the child', () => {
  const tiles: Tile[] = [
    { ...seed[0], categoryId: 'x', order: 0, hidden: false },
    { ...seed[1], categoryId: 'x', order: 30, hidden: true },
  ];
  assert.equal(pageCount(tiles, { rows: 4, cols: 6 }), 1);
  assert.equal(pageCount(tiles, { rows: 4, cols: 6 }, true, true), 2, 'Parent Mode still sees it');
});

/* ---------- Manage words ---------- */

const play = () => seed.filter((t) => t.categoryId === 'play');

test('swap: a hidden word from the same page goes exactly into the selected slot; only those two slots change', () => {
  const tiles = seed.map((t) => ({ ...t }));
  const page = orderedTiles(tiles, 'play');
  const before = new Map([...slotMap(page)].map(([s, t]) => [t.id, s]));
  const blocks = page.find((t) => t.id === 'play-blocks')!;
  const tramp = page.find((t) => t.id === 'play-trampoline')!;
  assert.ok(tramp.hidden);
  const slot = before.get(blocks.id)!;
  const r = swapWordInto(tiles, 'play', slot, tramp.id, () => 'new')!;
  assert.equal(r.placed.id, tramp.id);
  assert.equal(r.placed.order, slot);
  assert.equal(r.placed.hidden, false);
  assert.equal(r.displaced!.id, blocks.id);
  assert.equal(r.displaced!.hidden, true, 'swapped-out word is hidden, not deleted');
  assert.equal(r.displaced!.order, before.get(tramp.id), 'it takes the other word’s old (hidden) slot');
  assert.equal(r.changed.length, 2, 'nothing else changes');
});

test('swap: a word from another page is copied in (picture, speech, recording kept); the old word is hidden at the end', () => {
  const tiles = seed.map((t) => (t.id === 'needs-milk' ? { ...t, audioId: 'rec-1', photoId: 'ph-1' } : { ...t }));
  const page = orderedTiles(tiles, 'play');
  const target = page.find((t) => !t.hidden)!;
  const slot = [...slotMap(page)].find(([, t]) => t.id === target.id)![0];
  const r = swapWordInto(tiles, 'play', slot, 'needs-milk', () => 'tile-copy')!;
  assert.equal(r.placed.id, 'tile-copy');
  assert.equal(r.placed.categoryId, 'play');
  assert.equal(r.placed.order, slot);
  assert.equal(r.placed.audioId, 'rec-1');
  assert.equal(r.placed.photoId, 'ph-1');
  assert.equal(r.placed.label, 'milk');
  const maxBefore = Math.max(...slotMap(page).keys());
  assert.equal(r.displaced!.order, maxBefore + 1);
  assert.equal(r.displaced!.hidden, true);
  assert.equal(tiles.find((t) => t.id === 'needs-milk')!.categoryId, 'needs', 'the original stays on its page');
});

test('swap candidates: hidden words here first; other pages without duplicates or folders', () => {
  const { hiddenHere, otherPages } = swapCandidates(seed, 'play');
  assert.ok(hiddenHere.every((t) => t.hidden && t.categoryId === 'play'));
  assert.ok(otherPages.every((t) => t.categoryId !== 'play' && !t.linkTo));
  const labels = otherPages.map((t) => t.label.toLowerCase());
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(!labels.includes('more'), 'words already on this page are not offered again');
  assert.ok(play().some((t) => t.label === 'more'));
});

/* ---------- Arrange words ---------- */

test('arrange: dropping on a word swaps the two; dropping on an empty spot moves only that word; changes are listed for Save', () => {
  const tiles = seed.map((t) => ({ ...t }));
  const d0 = draftFor(tiles, 'core');
  const want = d0.get('core-want')!;
  const i = d0.get('core-i')!;
  const d1 = moveInDraft(d0, want, i);
  assert.equal(d1.get('core-want'), i);
  assert.equal(d1.get('core-i'), want);
  assert.equal(draftChanges(tiles, 'core', d1).length, 2);
  const empty = Math.max(...d0.values()) + 3;
  assert.equal(tileAt(d0, empty), undefined);
  const d2 = moveInDraft(d0, want, empty);
  assert.equal(d2.get('core-want'), empty);
  assert.equal(tileAt(d2, want), undefined, 'old spot is empty; nobody slid into it');
  assert.deepEqual(draftChanges(tiles, 'core', d2), [{ id: 'core-want', order: empty }]);
  assert.deepEqual(draftChanges(tiles, 'core', d0), [], 'no changes → nothing to save');
});
