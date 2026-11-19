import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arasaacUrl, effectiveStyle, libraryAllowed, librariesInUse, licenseAllowed, licenseFlags, remoteSymbolUrls, shownSymbol } from '../../src/lib/symbols.ts';
import { bestArasaac, findStarterPictures, needsArasaac, searchArasaac, starterQueries } from '../../src/lib/arasaac.ts';
import { openSymbolResults } from '../../src/parent/SymbolSearch.tsx';
import { buildSeedTiles } from '../../src/data/vocabulary.ts';
import { upgradeSymbolFields } from '../../src/state/migrations.ts';
import { parseBackup, createBackup } from '../../src/lib/backup.ts';
import { defaultSettings, defaultMyDay } from '../../src/lib/defaults.ts';
import { handleSymbolSearch, normalizeOpenSymbols, resetOpenSymbolsToken } from '../../server/openSymbols.ts';
import { defaultGrowPlan } from '../../src/lib/grow.ts';
import type { Tile } from '../../src/types.ts';

/* ---------- licences ---------- */

test('licence flags and enforcement: unknown never, NC only for non-commercial use', () => {
  assert.deepEqual(licenseFlags('CC BY-NC-SA 4.0'), { known: true, nonCommercial: true, shareAlike: true });
  assert.deepEqual(licenseFlags('CC BY-SA 4.0'), { known: true, nonCommercial: false, shareAlike: true });
  assert.equal(licenseFlags('').known, false);
  assert.equal(licenseFlags('all rights reserved').known, false);
  assert.equal(licenseAllowed({ library: 'opensymbols', license: 'CC BY-NC-SA' }, false), true);
  assert.equal(licenseAllowed({ library: 'opensymbols', license: 'CC BY-NC-SA' }, true), false, 'NC blocked commercially');
  assert.equal(licenseAllowed({ library: 'opensymbols', license: 'CC BY-SA' }, true), true);
  assert.equal(licenseAllowed({ library: 'opensymbols', license: 'proprietary' }, false), false, 'unknown licence never used');
  assert.equal(libraryAllowed('arasaac', false), true);
  assert.equal(libraryAllowed('arasaac', true), false);
  assert.equal(libraryAllowed('mulberry', true), true);
  assert.equal(effectiveStyle({}, false), 'arasaac', 'ARASAAC is the default style');
  assert.equal(effectiveStyle({ symbolStyle: 'arasaac' }, true), 'mulberry', 'commercial use falls back to Mulberry');
});

/* ---------- display ---------- */

const seed = buildSeedTiles();
const more = seed.find((t) => t.id === 'core-more')!;

test('every starter word has a picture, chosen automatically, and none uses emoji', () => {
  for (const t of seed) {
    assert.ok(t.symbolAuto, `${t.id} is Mimzi-chosen`);
    assert.match(t.fallbackSymbol ?? '', /^(mul|svg):/, `${t.id} has a bundled picture`);
    const shown = shownSymbol(t, {}, false);
    assert.ok(shown.url || shown.symbol?.startsWith('svg:'), `${t.id} shows a symbol`);
  }
});

test('ARASAAC is shown once found; bundled picture until then; the style can switch back', () => {
  assert.equal(shownSymbol(more, {}, false).info?.library, 'mulberry', 'before download');
  const found = { ...more, autoArasaac: { id: 2340, name: 'more' } };
  const shown = shownSymbol(found, {}, false);
  assert.equal(shown.url, arasaacUrl(2340));
  assert.equal(shown.fallback, more.fallbackSymbol, 'falls back offline');
  assert.equal(shown.info?.author, 'Sergio Palao');
  assert.equal(shown.info?.license, 'CC BY-NC-SA 4.0');
  assert.equal(shownSymbol(found, { symbolStyle: 'mulberry' }, false).info?.library, 'mulberry');
  assert.equal(shownSymbol(found, {}, true).info?.library, 'mulberry', 'commercial use never shows ARASAAC');
});

test('a grown-up’s choice wins over the default style; disallowed licences fall back', () => {
  const chosen: Tile = { ...more, autoArasaac: { id: 2340, name: 'more' }, symbolAuto: false, symbol: 'os:sclera:9', symbolInfo: { library: 'opensymbols', repo: 'sclera', id: '9', name: 'more', url: 'https://img.example/more.png', author: 'Sclera', license: 'CC BY-NC 2.0' } };
  assert.equal(shownSymbol(chosen, {}, false).url, 'https://img.example/more.png');
  assert.equal(shownSymbol(chosen, {}, true).symbol, more.fallbackSymbol, 'NC symbol hidden in commercial use');
  const mul: Tile = { ...more, symbolAuto: false, symbol: 'mul:cup' };
  assert.match(shownSymbol(mul, {}, false).url ?? '', /mulberry\/cup\.svg$/);
});

test('remote symbol URLs are listed for offline download; credits count each library', () => {
  const tiles = [{ ...more, autoArasaac: { id: 1, name: 'more' } }, { ...seed[0], autoArasaac: { id: 2, name: 'I' } }, seed[2]];
  const urls = remoteSymbolUrls(tiles, {});
  assert.ok(urls.includes(arasaacUrl(1)) && urls.includes(arasaacUrl(2)));
  const credits = librariesInUse(tiles, {});
  assert.equal(credits.find((c) => c.info.library === 'arasaac')?.count, 2);
});

/* ---------- ARASAAC client ---------- */

const fakeFetch = (routes: Record<string, unknown>) =>
  (async (url: string | URL) => {
    const u = String(url);
    const hit = Object.entries(routes).find(([k]) => u.endsWith(k));
    if (!hit) return new Response('[]', { status: 404 });
    return new Response(JSON.stringify(hit[1]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

test('ARASAAC search: normalises results, skips sexual/violent pictograms', async () => {
  const f = fakeFetch({
    '/pictograms/en/search/cup': [
      { _id: 11, keywords: [{ keyword: 'mug' }, { keyword: 'cup' }] },
      { _id: 12, keywords: [{ keyword: 'cup' }], violence: true },
      { _id: 'bad' },
    ],
    '/pictograms/en/bestsearch/cup': [{ _id: 11, keywords: [{ keyword: 'cup' }] }],
  });
  const rs = await searchArasaac('cup', 'en', f);
  assert.deepEqual(rs.map((r) => r.symbol), ['arasaac:11']);
  assert.equal(rs[0].name, 'cup');
  assert.equal(rs[0].info.license, 'CC BY-NC-SA 4.0');
  assert.equal((await bestArasaac('cup', 'en', f))?.info.id, '11');
  assert.equal(await bestArasaac('zzz', 'en', f), undefined, '404 = no match');
});

test('starter words: search terms, then the bundled concept; misses keep the built-in picture', async () => {
  const allDone = seed.find((t) => t.id === 'core-all-done')!;
  assert.equal(starterQueries(allDone)[0], 'finished');
  const snack = seed.find((t) => t.label === 'snack')!;
  assert.deepEqual(starterQueries(snack), ['snack', 'biscuits']);
  const f = fakeFetch({ '/bestsearch/more': [{ _id: 5, keywords: [{ keyword: 'more' }] }], '/bestsearch/biscuits': [{ _id: 6, keywords: [{ keyword: 'biscuits' }] }] });
  const found: Record<string, number> = {};
  const missing: string[] = [];
  const r = await findStarterPictures([more, snack, allDone], (id, hit) => void (found[id] = hit.id), { fetchImpl: f, onMissing: (id) => missing.push(id) });
  assert.deepEqual(found, { 'core-more': 5, [snack.id]: 6 });
  assert.deepEqual(missing, ['core-all-done']);
  assert.deepEqual(r, { found: 2, missing: 1, failed: 0 });
  assert.equal(needsArasaac([more, { ...snack, autoArasaac: { id: 6, name: 's' } }, allDone], { 'core-all-done': 'all done' }).length, 1);
});

test('offline: lookups fail quietly and are retried later', async () => {
  const offline = (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;
  const r = await findStarterPictures([more], () => undefined, { fetchImpl: offline });
  assert.deepEqual(r, { found: 0, missing: 0, failed: 1 });
});

/* ---------- upgrades, backups ---------- */

test('existing devices: untouched starter pictures become automatic; chosen ones stay; nothing moves', () => {
  const old = seed.map((t) => {
    const { symbolAuto: _a, fallbackSymbol: _f, ...rest } = t;
    return rest as Tile;
  });
  const custom = { ...old.find((t) => t.id === 'core-want')!, symbol: 'mul:wish' };
  const tiles = old.map((t) => (t.id === 'core-want' ? custom : t));
  const { tiles: up } = upgradeSymbolFields(tiles);
  const want = up.find((t) => t.id === 'core-want')!;
  assert.equal(want.symbolAuto, false);
  assert.equal(want.symbol, 'mul:wish');
  assert.equal(up.find((t) => t.id === 'core-more')!.symbolAuto, true);
  assert.deepEqual(up.map((t) => [t.id, t.categoryId, t.order, t.label, t.speak, t.aslSign]), tiles.map((t) => [t.id, t.categoryId, t.order, t.label, t.speak, t.aslSign]));
});

test('backups keep each symbol’s source, author and licence', async () => {
  const tiles: Tile[] = [
    { ...more, autoArasaac: { id: 5, name: 'more' } },
    { ...seed[0], symbolAuto: false, symbol: 'os:sclera:9', symbolInfo: { library: 'opensymbols', repo: 'sclera', id: '9', name: 'I', url: 'https://img.example/i.png', author: 'Sclera', license: 'CC BY-NC 2.0' } },
  ];
  const file = await createBackup({ tiles, categories: [], settings: defaultSettings(), media: [], myDay: defaultMyDay(), observations: [], grow: defaultGrowPlan(), history: [] });
  const back = parseBackup(JSON.parse(JSON.stringify({ ...file, media: [] })));
  assert.deepEqual(back.tiles[0].autoArasaac, { id: 5, name: 'more' });
  assert.equal(back.tiles[0].symbolAuto, true);
  assert.equal(back.tiles[1].symbolInfo?.license, 'CC BY-NC 2.0');
  assert.equal(back.tiles[1].symbolInfo?.author, 'Sclera');
  assert.equal(back.tiles[1].symbolInfo?.url, 'https://img.example/i.png');
});

/* ---------- OpenSymbols ---------- */

const osRows = [
  { id: 1, repo_key: 'sclera', name: 'cup', image_url: 'https://cdn.example/cup.png', author: 'Sclera', license: 'CC BY-NC 2.0', license_url: 'https://creativecommons.org/licenses/by-nc/2.0/' },
  { id: 2, repo_key: 'tawasol', name: 'cup', image_url: 'https://cdn.example/cup2.png', author: 'Mada', license: 'CC BY-SA 4.0' },
  { id: 3, repo_key: 'x', name: 'cup', image_url: 'http://insecure/cup.png', license: 'CC BY' },
  { id: 4, repo_key: 'y', name: 'cup', image_url: 'https://cdn.example/4.png', license: '' },
  { id: 5, repo_key: 'z', name: 'cup', image_url: 'https://cdn.example/5.png', license: 'CC BY', unsafe_result: true },
];

test('OpenSymbols: only licensed, https, safe results; NC filtered for commercial use', () => {
  const rows = normalizeOpenSymbols(osRows);
  assert.deepEqual(rows.map((r) => r.repo), ['sclera', 'tawasol']);
  assert.deepEqual(openSymbolResults(rows, false).map((r) => r.info.repo), ['sclera', 'tawasol']);
  assert.deepEqual(openSymbolResults(rows, true).map((r) => r.info.repo), ['tawasol']);
  assert.equal(openSymbolResults(rows, false)[0].symbol, 'os:sclera:1');
});

test('OpenSymbols function: secret stays server-side; token reused, refreshed on 401', async () => {
  resetOpenSymbolsToken();
  const notSet = await handleSymbolSearch(new Request('https://m.app/api/symbols?q=cup'), undefined);
  assert.equal(notSet.status, 503);
  const calls: string[] = [];
  let first = true;
  const f = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/token')) return new Response(JSON.stringify({ access_token: `tok${calls.length}` }), { status: 200 });
    if (first) {
      first = false;
      return new Response(JSON.stringify({ token_expired: true }), { status: 401 });
    }
    return new Response(JSON.stringify(osRows), { status: 200 });
  }) as typeof fetch;
  const res = await handleSymbolSearch(new Request('https://m.app/api/symbols?q=cup&locale=en'), 'shh', f);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { repo: string }[];
  assert.deepEqual(body.map((r) => r.repo), ['sclera', 'tawasol']);
  assert.equal(calls.filter((c) => c.includes('/token')).length, 2, 'new token after 401');
  assert.ok(!JSON.stringify(body).includes('shh'), 'secret never returned');
  assert.equal((await handleSymbolSearch(new Request('https://m.app/api/symbols?q='), 'shh', f)).status, 400);
  const other = new Request('https://m.app/api/symbols?q=cup', { headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' } });
  assert.equal((await handleSymbolSearch(other, 'shh', f)).status, 403, 'other websites cannot spend the key');
  assert.equal((await handleSymbolSearch(new Request('https://m.app/api/symbols?q=cup&locale=en-US'), 'shh', f)).status, 400);
});
