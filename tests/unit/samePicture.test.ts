import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pictureCopies } from '../../src/lib/samePicture';
import type { Tile } from '../../src/types';

const tile = (id: string, label: string, extra: Partial<Tile> = {}): Tile =>
  ({ id, label, speak: label, categoryId: 'x', order: 0, symbol: 'mul:milk', symbolAuto: true, updatedAt: 0, ...extra }) as Tile;

test('changing a picture updates every other copy of the same word, and only the picture', () => {
  const needs = tile('needs-milk', 'milk', { categoryId: 'needs', order: 3 });
  const food = tile('food-milk', 'Milk', { categoryId: 'food', order: 7, audioId: 'rec1', hidden: true });
  const water = tile('needs-water', 'water');
  const next = { ...needs, symbol: 'arasaac:2445', symbolAuto: false };
  const copies = pictureCopies(needs, next, [needs, food, water], 5);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].id, 'food-milk');
  assert.equal(copies[0].symbol, 'arasaac:2445');
  assert.equal(copies[0].symbolAuto, false);
  assert.equal(copies[0].categoryId, 'food');
  assert.equal(copies[0].order, 7);
  assert.equal(copies[0].audioId, 'rec1');
  assert.equal(copies[0].hidden, true);
});

test('a photo is shared too; unrelated edits and folders and deleted copies are left alone', () => {
  const a = tile('a', 'milk');
  const b = tile('b', 'milk');
  assert.deepEqual(pictureCopies(a, { ...a, favorite: true }, [a, b]), []);
  assert.equal(pictureCopies(a, { ...a, photoId: 'p1' }, [a, b])[0].photoId, 'p1');
  const folder = tile('f', 'milk', { linkTo: 'food' });
  const gone = tile('g', 'milk', { deletedAt: 1 });
  assert.deepEqual(pictureCopies(a, { ...a, photoId: 'p1' }, [a, folder, gone]), []);
});

test('re-choosing the same picture (no previous tile) still lines up copies that drifted apart', () => {
  const a = tile('a', 'milk', { symbol: 'arasaac:1' });
  const b = tile('b', 'milk', { symbol: 'mul:milk' });
  assert.equal(pictureCopies(undefined, a, [a, b])[0].symbol, 'arasaac:1');
});
