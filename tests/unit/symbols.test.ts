import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arasaacUrl, effectiveStyle, libraryAllowed, librariesInUse, licenseAllowed, licenseFlags, remoteSymbolUrls, shownSymbol } from '../../src/lib/symbols.ts';
import { bestArasaac, findStarterPictures, needsArasaac, searchArasaac, starterQueries } from '../../src/lib/arasaac.ts';
import { openSymbolResults } from '../../src/parent/SymbolSearch.tsx';
import { buildSeedTiles } from '../../src/data/vocabulary.ts';
import { picksToForget, upgradeSymbolFields } from '../../src/state/migrations.ts';
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

test('default pictures resolve to bundled files even with old automatic choices', () => {
  const want = seed.find((t) => t.id === 'core-want')!;
  const previous = { ...want, autoArasaac: { id: 2340, name: 'more' } };
  const shown = shownSymbol(want, {}, false);
  assert.equal(shown.url, '/symbols/arasaac/5441.webp');
  assert.equal(shownSymbol(previous, {}, false).url, shown.url);
  assert.equal(shown.info?.author, 'Sergio Palao');
  assert.equal(shownSymbol(want, { symbolStyle: 'mulberry' }, false).info?.library, 'mulberry');
  assert.equal(shownSymbol(want, {}, true).info?.library, 'mulberry');
});

test('a grown-up’s choice wins over the default style; disallowed licences fall back', () => {
  const chosen: Tile = { ...more, autoArasaac: { id: 2340, name: 'more' }, symbolAuto: false, symbol: 'os:sclera:9', symbolInfo: { library: 'opensymbols', repo: 'sclera', id: '9', name: 'more', url: 'https://img.example/more.png', author: 'Sclera', license: 'CC BY-NC 2.0' } };
  assert.equal(shownSymbol(chosen, {}, false).url, 'https://img.example/more.png');
  assert.equal(shownSymbol(chosen, {}, true).symbol, more.fallbackSymbol, 'NC symbol hidden in commercial use');
  const mul: Tile = { ...more, symbolAuto: false, symbol: 'mul:cup' };
  assert.match(shownSymbol(mul, {}, false).url ?? '', /mulberry\/cup\.svg$/);
});

test('bundled symbol URLs and credits describe the pictures shown', () => {
  const tiles = [more, seed[0], seed.find((tile) => tile.id === 'core-want')!];
  const urls = remoteSymbolUrls(tiles, {});
  assert.ok(urls.includes('/symbols/arasaac/2617.webp'));
  assert.ok(urls.includes('/symbols/arasaac/5441.webp'));
  assert.equal(librariesInUse(tiles, {}).find((c) => c.info.library === 'arasaac')?.count, 2);
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
  const want = seed.find((t) => t.id === 'core-want')!;
  const look = seed.find((t) => t.id === 'core-look')!;
  const f = fakeFetch({ '/bestsearch/want': [{ _id: 5, keywords: [{ keyword: 'want' }] }], '/bestsearch/biscuits': [{ _id: 6, keywords: [{ keyword: 'biscuits' }] }] });
  const found: Record<string, number> = {};
  const missing: string[] = [];
  const r = await findStarterPictures([want, snack, allDone, look], (id, hit) => void (found[id] = hit.id), { fetchImpl: f, onMissing: (id) => missing.push(id) });
  assert.deepEqual(found, { 'core-want': 5, [snack.id]: 6, 'core-all-done': 28429 }, '"all done" is pinned to the open-hands picture');
  assert.deepEqual(missing, ['core-look']);
  assert.deepEqual(r, { found: 3, missing: 1, failed: 0 });
  assert.equal(needsArasaac([want, { ...snack, autoArasaac: { id: 6, name: 's' } }, look], { 'core-look': 'look' }).length, 1);
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

test('live-service review: bad automatic matches are skipped or pinned; more words get pictures', async () => {
  const f = fakeFetch({
    '/bestsearch/who': [{ _id: 9080, keywords: [{ keyword: 'WHO' }] }, { _id: 9853, keywords: [{ keyword: 'who' }] }],
    '/bestsearch/cracker': [{ _id: 16851, keywords: [{ keyword: 'firecracker' }] }, { _id: 37883, keywords: [{ keyword: 'cracker' }] }],
    '/bestsearch/mom': [{ _id: 2458, keywords: [{ keyword: 'mom' }] }],
    '/bestsearch/toilet': [{ _id: 2430, keywords: [{ keyword: 'toilet' }] }],
  });
  assert.equal((await bestArasaac('who', 'en', f))?.info.id, '9853', 'acronym WHO skipped');
  assert.equal((await bestArasaac('cracker', 'en', f))?.info.id, '37883', 'firework skipped');
  const byId = new Map(seed.map((t) => [t.id, t]));
  const found: Record<string, number> = {};
  await findStarterPictures(['food-crackers', 'questions-who', 'family-mama', 'needs-potty'].map((id) => byId.get(id)!), (id, hit) => void (found[id] = hit.id), { fetchImpl: f });
  assert.deepEqual(found, { 'food-crackers': 37883, 'questions-who': 9853, 'family-mama': 2458, 'needs-potty': 2430 });
  assert.equal(arasaacUrl(5508), 'https://api.arasaac.org/v1/pictograms/5508', 'CORS-enabled image address');
});

test('picture-by-picture review: wrong meanings are pinned to the right pictogram or keep the bundled one', async () => {
  const { STARTER_PICTOS, KEEP_BUNDLED } = await import('../../src/lib/arasaac.ts');
  const ids = new Set(seed.map((t) => t.id));
  for (const id of [...Object.keys(STARTER_PICTOS), ...KEEP_BUNDLED]) assert.ok(ids.has(id), `${id} is a starter word`);
  assert.equal(STARTER_PICTOS['core-stop'].id, 7195, 'stop is a hand, not a bus stop');
  assert.equal(STARTER_PICTOS['core-break'].id, 16643, 'break means a rest');
  const byId = new Map(seed.map((t) => [t.id, t]));
  assert.equal(needsArasaac([byId.get('food-cereal')!, byId.get('safety-safe')!, byId.get('core-want')!]).length, 1);
});

test('toddler review: one picture per word everywhere; More, All done and Needs use concrete pictures', async () => {
  const { pinnedPicto, keepBundled } = await import('../../src/lib/arasaac.ts');
  const byLabel = (l: string) => seed.filter((t) => t.label.toLowerCase() === l.toLowerCase() && !t.linkTo);
  // Every "All done" tile (Home, Quick Words, folders, phrases) gets the same open-hands picture,
  // with the same offline drawing.
  const allDone = byLabel('all done');
  assert.ok(allDone.length >= 5);
  for (const t of allDone) {
    assert.equal(pinnedPicto(t)?.id, 28429, t.id);
    assert.equal(t.symbol, 'svg:all-done-hands', `${t.id} offline picture`);
  }
  // "More" keeps the bubble drawing everywhere (no abstract ARASAAC squares).
  for (const t of byLabel('more')) {
    assert.ok(keepBundled(t), t.id);
    assert.equal(t.symbol, 'svg:more-bubbles', t.id);
    assert.deepEqual(needsArasaac([t]), []);
  }
  // No / No thank you / I don't want it look different from each other.
  const ids = ['no', 'no thank you', "I don't want it"].map((l) => pinnedPicto(byLabel(l)[0])?.id);
  assert.equal(new Set(ids).size, 3, `three different pictures: ${ids}`);
  // Hurt is a face in pain.
  for (const t of [...byLabel('hurt'), ...byLabel('it hurts')]) assert.equal(pinnedPicto(t)?.id, 30620, t.id);
  // The Needs folder isn't a toilet; potty keeps its own picture.
  const needsFolder = seed.find((t) => t.id === 'core-folder-needs')!;
  assert.equal(needsFolder.symbol, 'svg:needs');
  assert.ok(keepBundled(needsFolder));
  assert.notEqual(seed.find((t) => t.id === 'needs-potty')!.symbol, 'svg:needs');
});

test('toddler review upgrade: Mimzi-chosen old defaults change; a grown-up’s picture and every position stay', async () => {
  const { applyNewDefaults } = await import('../../src/state/migrations.ts');
  const { buildSeedCategories } = await import('../../src/data/vocabulary.ts');
  const oldMore = { ...seed.find((t) => t.id === 'core-more')!, symbol: 'mul:more', fallbackSymbol: 'mul:more', symbolAuto: true };
  const oldDone = { ...seed.find((t) => t.id === 'needs-all-done')!, symbol: 'mul:finish', fallbackSymbol: 'mul:finish', symbolAuto: true, autoArasaac: { id: 5358, name: 'finish' } };
  const chosenDone = { ...seed.find((t) => t.id === 'core-all-done')!, symbol: 'mul:finish', fallbackSymbol: 'mul:finish', symbolAuto: false }; // a grown-up picked it
  const photo = { ...seed.find((t) => t.id === 'food-all-done')!, symbol: 'mul:finish', fallbackSymbol: 'mul:finish', symbolAuto: false, photoId: 'p1' };
  const cats = buildSeedCategories().map((c) => (c.id === 'needs' ? { ...c, symbol: 'mul:toilet' } : c));
  const r = applyNewDefaults([oldMore, oldDone, chosenDone, photo], cats);
  const by = new Map(r.tiles.map((t) => [t.id, t]));
  assert.equal(by.get('core-more')!.symbol, 'svg:more-bubbles');
  assert.equal(by.get('needs-all-done')!.fallbackSymbol, 'svg:all-done-hands');
  assert.equal(by.get('core-all-done')!.symbol, 'mul:finish', 'caregiver choice untouched');
  assert.equal(by.get('food-all-done')!.photoId, 'p1');
  for (const t of r.tiles) {
    const before = [oldMore, oldDone, chosenDone, photo].find((x) => x.id === t.id)!;
    assert.equal(t.categoryId, before.categoryId);
    assert.equal(t.order, before.order);
    assert.equal(t.label, before.label);
  }
  assert.equal(r.categories.find((c) => c.id === 'needs')!.symbol, 'svg:needs');
  // ASL removed: a word whose only visual was a sign gets an AAC picture; photos and recordings stay.
  const signOnly = { ...seed.find((t) => t.id === 'core-want')!, symbol: undefined, fallbackSymbol: undefined, symbolAuto: false, aslSign: 'want', audioId: 'a1' } as Tile;
  const customSign = { ...seed.find((t) => t.id === 'core-go')!, id: 'tile-custom', label: 'swing', symbol: undefined, fallbackSymbol: undefined, symbolAuto: false, aslSign: 'go' } as Tile;
  const withPhoto = { ...seed.find((t) => t.id === 'core-go')!, symbol: undefined, fallbackSymbol: undefined, photoId: 'p2', aslSign: 'go' } as Tile;
  const r2 = applyNewDefaults([signOnly, customSign, withPhoto], []);
  const w = r2.tiles[0];
  assert.equal(w.symbol, seed.find((t) => t.id === 'core-want')!.symbol, 'starter picture restored');
  assert.equal(w.audioId, 'a1', 'recording kept');
  assert.ok(r2.tiles[1].symbolAuto && needsArasaac([r2.tiles[1]]).length === 1, 'a custom word gets a picture looked up by its label');
  assert.equal(r2.tiles[2].photoId, 'p2', 'a photo stays the picture');
  assert.equal(r2.changedTiles.length, 2);
  // The old automatic arrow picture for "all done" is forgotten so the open hands load.
  assert.equal(picksToForget([by.get('needs-all-done')!]).length, 1);
});

test('a picture a grown-up chose is never replaced automatically', async () => {
  const byId = new Map(seed.map((t) => [t.id, t]));
  const stop = byId.get('core-stop')!;
  const chosen: Tile = { ...stop, symbolAuto: false, symbol: 'mul:stop', autoArasaac: { id: 2499, name: 'stop' } };
  const auto: Tile = { ...stop, id: 'core-stop', autoArasaac: { id: 2499, name: 'stop' } };
  assert.deepEqual(picksToForget([chosen]), [], 'review fixes skip caregiver choices');
  assert.equal(picksToForget([auto]).length, 1, 'automatic wrong pick is fixed');
  assert.deepEqual(needsArasaac([chosen]), [], 'the finder never looks up caregiver-chosen words');
  assert.equal(shownSymbol(chosen, {}, false).info?.library, 'mulberry', 'default style never overrides a choice');
  assert.equal(shownSymbol({ ...chosen, symbol: 'arasaac:42' }, { symbolStyle: 'mulberry' }, false).url, arasaacUrl(42));
  // A photo always shows instead of any symbol (handled by TileFace); upgrades keep caregiver choices.
  const { tiles } = upgradeSymbolFields([{ ...stop, symbolAuto: undefined, symbol: 'mul:hand' } as Tile]);
  assert.equal(tiles[0].symbolAuto, false);
  assert.equal(tiles[0].symbol, 'mul:hand');
});
