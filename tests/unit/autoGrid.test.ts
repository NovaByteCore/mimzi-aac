import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoGrid } from '../../src/lib/autoGrid';

test('Board picture size: bigger gives fewer, larger tiles; smaller gives more', () => {
  const base = { width: 820, height: 420, textScale: 1, maxGap: 12 };
  const normal = autoGrid(base);
  const bigger = autoGrid({ ...base, tileScale: 1.5 });
  const smaller = autoGrid({ ...base, tileScale: 0.75 });
  const n = (g: { grid: { rows: number; cols: number } }) => g.grid.rows * g.grid.cols;
  assert.ok(n(bigger) < n(normal), `bigger ${n(bigger)} < normal ${n(normal)}`);
  assert.ok(Math.min(bigger.tile.w, bigger.tile.h) > Math.min(normal.tile.w, normal.tile.h));
  assert.ok(n(smaller) >= n(normal), `smaller ${n(smaller)} >= normal ${n(normal)}`);
});
