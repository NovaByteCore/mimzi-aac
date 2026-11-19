/*
 * End-to-end tests against a production build in real Chromium.
 *   npm run build && npm run preview          # terminal 1
 *   BASE_URL=http://localhost:4173 npm run test:e2e
 *
 * Text-to-speech is replaced with a recorder so tests can check exactly what Mimzi said.
 * These do NOT replace testing on a physical iPad and Samsung phone (see docs/TESTING.md).
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const PHOTO = fileURLToPath(new URL('../fixtures/test-ball.png', import.meta.url));
const SIGN = fileURLToPath(new URL('../fixtures/test-sign.webm', import.meta.url));
const SHOTS = fileURLToPath(new URL('../../test-results/', import.meta.url));
const IPAD = { width: 1180, height: 820 };
const GALAXY = { width: 412, height: 915 };
const PIN = '1357';

let browser: Browser;

before(async () => {
  // Fake microphone so voice recording can be tested without hardware.
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  await mkdir(SHOTS, { recursive: true });
});
after(async () => {
  await browser?.close();
});

// Plain string so the test runner's transpiler can't inject helpers into browser code.
const DEFAULT_VOICES = [
  { name: 'Test Voice A', voiceURI: 'voice-a', lang: 'en-US', localService: true, default: true },
  { name: 'Test Voice B', voiceURI: 'voice-b', lang: 'en-US', localService: false, default: false },
];
const speechStubTemplate = `
  window.__name = (f) => f; // helpers compiled for page.evaluate may reference __name
  window.__spoken = [];
  window.__voices = [];
  window.__rates = [];
  window.__pitches = [];
  window.__langs = [];
  window.__played = [];
  // Recordings: play() succeeds, or fails when __audioMode is 'fail'.
  const RealAudio = window.Audio;
  window.Audio = function (src) { const a = new RealAudio(); a.play = () => { if (window.__audioMode === 'fail') return Promise.reject(new DOMException('no', 'NotSupportedError')); window.__played.push(src); setTimeout(() => a.onended && a.onended(new Event('ended')), 5); return Promise.resolve(); }; return a; };
  const fakeVoices = __FAKE_VOICES__;
  const synth = {
    speaking: false, paused: false, pending: false,
    getVoices: () => fakeVoices,
    speak(u) {
      window.__spoken.push(u.text); window.__voices.push(u.voice ? u.voice.voiceURI : null); window.__rates.push(u.rate); window.__pitches.push(u.pitch); window.__langs.push(u.lang);
      const mode = window.__speechMode || 'ok';
      window.__speakAt = (window.__speakAt || []).concat(Date.now());
      if (mode === 'silent') return; // engine accepts the request but never starts
      // Chrome on Android: a word spoken right after cancel() is silently dropped.
      if (mode === 'android-chrome' && Date.now() - (window.__lastCancel || 0) < 200) { window.__dropped = (window.__dropped || 0) + 1; return; }
      // The chosen voice can't be used (e.g. not installed); the engine's own voice works.
      if (mode === 'voice-fail' && u.voice) return setTimeout(() => u.onerror && u.onerror({ error: 'synthesis-failed' }), 5);
      // Cold engine: the first word takes several seconds to start.
      if (mode === 'slowstart') { window.__speechMode = 'ok'; synth.pending = true; return setTimeout(() => { synth.pending = false; window.__said = (window.__said || []).concat(u.text); u.onstart && u.onstart(new Event('start')); u.onend && u.onend(new Event('end')); }, 6000); }
      if (mode !== 'error' && mode !== 'interrupt') setTimeout(() => { window.__said = (window.__said || []).concat(u.text); }, 4);
      if (mode === 'error') return setTimeout(() => u.onerror && u.onerror({ error: 'synthesis-failed' }), 5);
      if (mode === 'interrupt') return setTimeout(() => u.onerror && u.onerror({ error: 'interrupted' }), 5);
      setTimeout(() => { u.onstart && u.onstart(new Event('start')); u.onend && u.onend(new Event('end')); }, 5);
    },
    cancel() { window.__cancels = (window.__cancels || 0) + 1; window.__lastCancel = Date.now(); }, resume() {}, addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  // The real utterance only accepts real SpeechSynthesisVoice objects; the fake voices need a plain one.
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; this.lang = ''; } };
`;
const stubWith = (voices: object[]) => speechStubTemplate.replace('__FAKE_VOICES__', JSON.stringify(voices));
const defaultStub = speechStubTemplate.replace('__FAKE_VOICES__', JSON.stringify(DEFAULT_VOICES));



/* ARASAAC and OpenSymbols are simulated so tests never depend on outside services.
   bestsearch: every word has a pictogram except those in ARASAAC_NONE; images are a test PNG. */
const ARASAAC_NONE = new Set(['zzz']);
const pictoId = (w: string) => 1000 + [...w].reduce((a, c) => a + c.charCodeAt(0), 0);
let osMode: 'off' | 'on' = 'off';
async function mockSymbolServices(ctx: BrowserContext) {
  const png = await readFile(PHOTO);
  await ctx.route('https://api.arasaac.org/**', async (route) => {
    const u = new URL(route.request().url());
    if (/^\/v1\/pictograms\/\d+$/.test(u.pathname))
      return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/png' }, body: png });
    const m = u.pathname.match(/\/pictograms\/en\/(bestsearch|search)\/(.+)$/);
    const word = m ? decodeURIComponent(m[2]).toLowerCase() : '';
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (!m || ARASAAC_NONE.has(word)) return route.fulfill({ status: 404, headers: cors, body: '[]' });
    const one = (w: string, n = 0) => ({ _id: pictoId(w) + n, keywords: [{ keyword: n ? `${w} ${n}` : w }], sex: false, violence: false });
    const body = m[1] === 'bestsearch' ? [one(word)] : [one(word), one(word, 1), one(word, 2)];
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(body) });
  });
  await ctx.route('https://static.arasaac.org/**', (route) =>
    route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/png' }, body: png }),
  );
  await ctx.route('**/api/symbols?**', (route) =>
    osMode === 'off'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"not-configured"}' })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: '7', repo: 'sclera', name: 'swing', url: 'https://cdn.opensymbols.test/swing.png', author: 'Sclera', license: 'CC BY-NC 2.0' },
            { id: '8', repo: 'tawasol', name: 'swing', url: 'https://cdn.opensymbols.test/swing2.png', author: 'Mada', license: 'CC BY-SA 4.0' },
          ]),
        }),
  );
  await ctx.route('https://cdn.opensymbols.test/**', (route) =>
    route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/png' }, body: png }),
  );
}

async function openApp(viewport = IPAD, voices: object[] = DEFAULT_VOICES): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, hasTouch: true, acceptDownloads: true, permissions: ['microphone'] });
  await ctx.addInitScript({ content: stubWith(voices) });
  await mockSymbolServices(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto(BASE);
  await page.waitForSelector('.board-grid .tile');
  return { ctx, page };
}

/** Go to a folder from Home (the board remembers the last page, like a real AAC app). */
async function openFolder(page: Page, page_id: string) {
  const home = page.locator('.page-toolbar').getByRole('button', { name: 'Home' });
  if (await home.isEnabled()) await home.click();
  const folder = page.locator(`.board-grid [data-tile-id="core-folder-${page_id}"]`);
  // Small grids (phones) put some folders on Home page 2 or 3.
  for (let i = 0; i < 3 && (await folder.count()) === 0; i++) await page.getByRole('button', { name: 'Next page' }).click();
  await folder.click();
}

/** Page forward until a tile appears (new words take the first free slot, which may be on a later page). */
async function findTile(page: Page, selector: string) {
  const loc = page.locator(`.board-grid ${selector}`);
  for (let i = 0; i < 10 && (await loc.count()) === 0; i++) await page.getByRole('button', { name: 'Next page' }).click();
  return loc;
}

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
const voicesUsed = (page: Page) => page.evaluate(() => (window as unknown as { __voices: (string | null)[] }).__voices);
const pitchesUsed = (page: Page) => page.evaluate(() => (window as unknown as { __pitches: number[] }).__pitches);
const langsUsed = (page: Page) => page.evaluate(() => (window as unknown as { __langs: string[] }).__langs);
const playedAudio = (page: Page) => page.evaluate(() => (window as unknown as { __played: string[] }).__played);
const speechMode = (page: Page, mode: string) => page.evaluate((m) => ((window as unknown as { __speechMode: string }).__speechMode = m), mode);
const ratesUsed = (page: Page) => page.evaluate(() => (window as unknown as { __rates: number[] }).__rates);

async function hold(page: Page, selector: string | ReturnType<Page['locator']>, ms: number) {
  const loc = typeof selector === 'string' ? page.locator(selector) : selector;
  const box = (await loc.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

const holdParentButton = (page: Page) => hold(page, '.nav-parent', 1800);
const holdGrownup = (page: Page, name: RegExp | string) => hold(page, page.getByRole('button', { name }), 1100);

async function typePin(page: Page, pin: string) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
}

async function enterParentMode(page: Page, firstTime = true) {
  await holdParentButton(page);
  await page.getByRole('dialog').waitFor();
  if (firstTime) {
    await typePin(page, PIN);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByRole('heading', { name: /Parent Mode/ }).waitFor();
}

async function addPhotoTile(page: Page, label: string, group: string) {
  await page.getByRole('tab', { name: group, exact: true }).click();
  await page.getByRole('button', { name: '+ Add picture' }).click();
  await page.getByLabel('Word on the tile').fill(label);
  await page.getByTestId('photo-input').setInputFiles(PHOTO);
  await page.getByTestId('crop-viewport').waitFor();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await page.locator('.tile-preview img.tile-photo').waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator(`.edit-item:has(.edit-word[aria-label="Edit ${label}"]) img.tile-photo`).waitFor();
}

test('opens straight to the Talk board — no login, quick words always there', async () => {
  const { ctx, page } = await openApp();
  assert.equal(await page.getByRole('dialog').count(), 0);
  const quick = await page.locator('.quick-bar .tile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(quick, ['help', 'stop', 'no', 'more', 'all done']);
  // Auto layout: as many words as fit with large tiles (≥ 88 px).
  const g = await page.locator('.board-grid').evaluate((el) => ({ rows: Number(el.getAttribute('data-rows')), cols: Number(el.getAttribute('data-cols')), n: el.children.length, min: Math.min(...[...el.querySelectorAll('.tile')].map((t) => Math.min(t.getBoundingClientRect().width, t.getBoundingClientRect().height))) }));
  assert.equal(g.n, g.rows * g.cols, 'a full grid');
  assert.ok(g.min >= 88, `tiles are large (${Math.round(g.min)} px)`);
  assert.equal(await page.getByTestId('page-title').textContent(), 'Home');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'My People' }).click();
  assert.equal(await page.locator('.quick-bar .tile').count(), 5, 'quick words stay on other child screens');
  await ctx.close();
});

test('one tap speaks the word immediately', async () => {
  const { ctx, page } = await openApp();
  await page.locator('.board-grid [data-tile-id="core-more"]').click();
  assert.deepEqual(await spoken(page), ['more']);
  await page.locator('.quick-bar [data-tile-id="core-help"]').click();
  assert.deepEqual(await spoken(page), ['more', 'help']);
  await ctx.close();
});

test('sentence builder keeps words across groups and speaks the whole message unchanged', async () => {
  const { ctx, page } = await openApp();
  await page.locator('.board-grid [data-tile-id="core-i"]').click();
  await page.locator('.board-grid [data-tile-id="core-want"]').click();
  await page.locator('.quick-bar [data-tile-id="core-more"]').click();
  await page.locator('.board-grid [data-tile-id="core-folder-play"]').click();
  await page.getByTestId('page-title').getByText('Toys & Play').waitFor();
  await page.locator('.board-grid [data-tile-id="play-bubbles"]').click();
  assert.equal(await page.getByTestId('sentence-chip').count(), 4);
  await page.getByRole('button', { name: 'Speak message' }).click();
  assert.equal((await spoken(page)).at(-1), 'I want more bubbles');
  await page.getByRole('button', { name: 'Remove last word' }).click();
  assert.equal(await page.getByTestId('sentence-chip').count(), 3);
  await page.getByRole('button', { name: 'Clear message' }).click();
  assert.equal(await page.getByTestId('sentence-chip').count(), 0);
  await ctx.close();
});

test('Parent Mode always needs the PIN — a tap, keyboard, or hold opens the PIN screen, never Parent Mode itself', async () => {
  const { ctx, page } = await openApp();
  await page.locator('.nav-parent').click(); // quick tap → PIN screen only
  await page.getByRole('dialog').getByText('Create a Parent PIN').waitFor();
  assert.equal(await page.getByRole('heading', { name: /Parent Mode/ }).count(), 0, 'not Parent Mode without the PIN');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  // Focus comes back right after the dialog closes (allow a moment for React to finish).
  const back = await page.waitForFunction(() => document.activeElement?.classList.contains('nav-parent'), null, { timeout: 2000 }).then(() => true, () => false);
  assert.ok(back, 'focus returns to the Grown-ups button');
  await page.keyboard.press('Enter'); // keyboard activation
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1, 'exactly one PIN screen');
  await page.keyboard.press('Escape');
  await enterParentMode(page, true); // the press-and-hold shortcut still works (no double activation)
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await holdParentButton(page);
  await typePin(page, '0000');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByText('That PIN isn’t right.').waitFor();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByRole('heading', { name: /Parent Mode/ }).waitFor();
  await ctx.close();
});

test('caregiver adds a photo tile; it speaks and survives a reload (IndexedDB)', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Toys & Play', exact: true }).click();
  await page.getByRole('button', { name: '+ Add picture' }).click();
  assert.equal(await page.getByTestId('camera-input').getAttribute('capture'), 'environment', 'camera button opens the camera');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await addPhotoTile(page, 'Red ball', 'Toys & Play');
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await page.locator('.board-grid [data-tile-id="core-folder-play"]').click();
  const tile = await findTile(page, '.tile[aria-label="Red ball"]');
  await tile.click();
  assert.equal((await spoken(page)).at(-1), 'Red ball');

  await page.reload();
  await page.locator('.board-grid [data-tile-id="core-folder-play"]').click();
  await findTile(page, '.tile[aria-label="Red ball"]');
  const width = await page
    .locator('.board-grid .tile[aria-label="Red ball"] img')
    .evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : new Promise((r) => (img.onload = () => r(img.naturalWidth)))));
  assert.equal(width, 640, 'cropped photo stored at 640 px');
  await ctx.close();
});

test('edit, reorder, delete and restore keep words where the caregiver puts them', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  // Rename
  await page.locator('.edit-word[aria-label="Edit look"]').click();
  await page.getByLabel('Word on the tile').fill('peek');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-word[aria-label="Edit peek"]').waitFor();
  // Reorder with Arrange words: tap "want", then tap "I" — they swap.
  await page.getByTestId('arrange-words-btn').click();
  const aw = page.getByTestId('arrange-words');
  await aw.locator('[data-arrange-tile="core-want"]').click();
  await aw.locator('[data-arrange-tile="core-i"]').click();
  await aw.getByTestId('arrange-save').click();
  await aw.waitFor({ state: 'detached' });
  const firstTwo = await page.locator('.edit-word').evaluateAll((els) => els.slice(0, 2).map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(firstTwo, ['Edit want', 'Edit I']);
  // Delete with confirmation, then restore
  await page.locator('.edit-word[aria-label="Edit peek"]').click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.edit-word[aria-label="Edit peek"]').waitFor({ state: 'detached' });
  await page.getByRole('tab', { name: /Recently deleted/ }).click();
  await page.locator('[data-deleted-tile="core-look"]').getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('tab', { name: 'Edit AAC board' }).click();
  await page.locator('.edit-word[aria-label="Edit peek"]').waitFor();
  // Child board reflects the new order
  await page.getByRole('button', { name: /back to Talk/ }).click();
  const board = await page.locator('.board-grid .tile').evaluateAll((els) => els.slice(0, 2).map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(board, ['want', 'I']);
  await ctx.close();
});

test('grid size can be changed (2 × 2 big tiles) and pages appear', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Board & accessibility' }).click();
  await page.getByText(/Fixed size — the same rows/).click();
  await page.getByTestId('grid-select').waitFor();
  await page.getByTestId('grid-select').selectOption('2x2');
  await page.getByRole('button', { name: /back to Talk/ }).click();
  assert.equal(await page.locator('.board-grid > *').count(), 4);
  await page.getByRole('button', { name: 'Next page' }).click();
  assert.equal(await page.locator('.board-grid .tile').first().getAttribute('aria-label'), 'stop');
  await ctx.close();
});

test('backup export includes photos and restores onto a fresh device', async () => {
  const first = await openApp();
  await enterParentMode(first.page);
  await addPhotoTile(first.page, 'Grandma Jo', 'People');
  await first.page.getByRole('tab', { name: 'Backup' }).click();
  const [download] = await Promise.all([
    first.page.waitForEvent('download'),
    first.page.getByRole('button', { name: /Make a backup file/ }).click(),
  ]);
  assert.match(download.suggestedFilename(), /^mimzi-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = SHOTS + 'backup-under-test.json';
  await download.saveAs(file);
  const json = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(json.format, 'mimzi-backup');
  assert.equal(json.media.length, 1);
  assert.equal(json.settings.pin, undefined, 'PIN is never exported');
  assert.equal(json.version, 3);
  assert.ok(json.myDay?.reward, 'My Day is included');
  assert.ok(Array.isArray(json.observations), 'My Words is included');
  await first.ctx.close();

  const second = await openApp();
  await enterParentMode(second.page);
  await second.page.getByRole('tab', { name: 'Backup' }).click();
  await second.page.getByTestId('restore-input').setInputFiles(file);
  await second.page.getByRole('alertdialog').getByRole('button', { name: 'Restore backup' }).click();
  await second.page.getByText('Backup restored.').waitFor();
  await second.page.getByRole('button', { name: /back to Talk/ }).click();
  await second.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'My People' }).click();
  await second.page.locator('.board-grid .tile[aria-label="Grandma Jo"] img').waitFor();
  await second.ctx.close();
});

test('works offline after the first visit (service worker + IndexedDB)', async () => {
  const { ctx, page } = await openApp();
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15000 });
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.board-grid .tile');
  await page.locator('.board-grid [data-tile-id="core-go"]').click();
  assert.equal((await spoken(page)).at(-1), 'go');
  await ctx.setOffline(false);
  await ctx.close();
});

for (const [name, viewport] of [
  ['ipad-landscape', IPAD],
  ['galaxy-portrait', GALAXY],
] as const) {
  test(`layout fits without sideways scrolling: ${name}`, async () => {
    const { ctx, page } = await openApp(viewport);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'My Day' }).click();
    await page.getByRole('tab', { name: /working for/ }).click();
    const dayOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(dayOverflow <= 0, `My Day scrolls sideways by ${dayOverflow}px`);
    await page.screenshot({ path: `${SHOTS}${name}-myday.png` });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Talk' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `page scrolls sideways by ${overflow}px`);
    for (const sel of ['.board-grid', '.quick-bar', '.main-nav', '.top-bar']) {
      const box = (await page.locator(sel).boundingBox())!;
      assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1, `${sel} is off screen`);
    }
    const tile = (await page.locator('.board-grid .tile').first().boundingBox())!;
    assert.ok(tile.width >= 60 && tile.height >= 60, `tiles too small: ${tile.width}×${tile.height}`);
    await page.screenshot({ path: `${SHOTS}${name}.png` });
    await ctx.close();
  });
}

/* ---------------- Phase 2 ---------------- */

test('caregiver voice recording plays instead of the device voice', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.locator('.edit-word[aria-label="Edit go"]').click();
  await page.getByRole('button', { name: /Record your voice/ }).click();
  await page.getByRole('button', { name: /Stop/ }).waitFor();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Stop/ }).click();
  await page.locator('.recorder audio').waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-word[aria-label="Edit go"]').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  const kinds = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('mimzi');
        open.onsuccess = () => {
          const r = open.result.transaction('media').objectStore('media').getAll();
          r.onsuccess = () => resolve(r.result.map((m: { kind: string }) => m.kind));
        };
      }),
  );
  assert.deepEqual(kinds, ['audio']);
  await page.locator('.board-grid [data-tile-id="core-go"]').click();
  await page.waitForTimeout(700);
  assert.ok(!(await spoken(page)).includes('go'), 'recording was used, not text-to-speech');
  await ctx.close();
});

test('ASL is removed: no ASL badges or “See sign” buttons, and no sign options in Parent Mode or the tile editor', async () => {
  const { ctx, page } = await openApp();
  assert.equal(await page.getByRole('button', { name: /See sign/ }).count(), 0, 'no See sign buttons on the board');
  assert.equal(await page.locator('.sign-btn, .sign-tag').count(), 0, 'no ASL badges');
  assert.equal(await page.locator('.quick-bar').getByText('ASL').count(), 0);
  await enterParentMode(page);
  assert.equal(await page.getByRole('tab', { name: /ASL/ }).count(), 0, 'no ASL Library');
  await page.locator('.edit-word[aria-label="Edit more"]').click();
  assert.equal(await page.getByText(/ASL|sign video|Sign \(ASL\)/).count(), 0, 'no sign options in the tile editor');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('tab', { name: 'Board & accessibility' }).click();
  assert.equal(await page.getByText(/See sign|sign video/i).count(), 0, 'no sign settings');
  await ctx.close();
});

test('quick words can be changed by a caregiver', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Quick words' }).click();
  await page.getByTestId('quick-add-select').selectOption('core-yes');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByTestId('quick-list').getByText('yes').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  const quick = await page.locator('.quick-bar .tile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(quick, ['help', 'stop', 'no', 'more', 'all done', 'yes']);
  // Hiding "help" on its page keeps it as a quick word (the child's quick way to ask for help).
  await enterParentMode(page, false);
  await page.getByRole('tab', { name: 'Manage words' }).click();
  await page.locator('[data-wob="core-help"]').click();
  await page.getByTestId('wob-toggle').click(); // Manage words: select, then Show / Hide
  const warn = page.getByRole('alertdialog');
  if (await warn.count()) await warn.getByRole('button', { name: 'Hide' }).click();
  await page.getByRole('tab', { name: 'Quick words' }).click();
  await page.getByTestId('quick-hidden-note').getByText(/help/).waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  assert.equal(await page.locator('.board-grid [data-tile-id="core-help"]').count(), 0, 'hidden on its page');
  assert.equal(await page.locator('.quick-bar [data-tile-id="core-help"]').count(), 1, 'still a quick word');
  await page.locator('.quick-bar [data-tile-id="core-help"]').click();
  assert.equal((await spoken(page)).at(-1), 'help');
  await ctx.close();
});

/* ---------------- Phase 3: My Day ---------------- */

async function openMyDay(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'My Day' }).click();
  await page.getByRole('tab', { name: /First \/ Then/ }).waitFor();
}

test('First / Then: tap speaks, grown-up hold marks done, start again resets', async () => {
  const { ctx, page } = await openApp();
  await openMyDay(page);
  await page.locator('.first-then .sched-card').first().click();
  assert.equal((await spoken(page)).at(-1), 'First Brush teeth');
  await page.getByRole('button', { name: 'Say it' }).click();
  assert.equal((await spoken(page)).at(-1), 'First Brush teeth, then Play cars');
  await page.getByRole('button', { name: /mark FIRST done/ }).click(); // quick tap does nothing
  assert.equal(await page.locator('.sched-done').count(), 0);
  await holdGrownup(page, /mark FIRST done/);
  await page.locator('.sched-done').first().waitFor();
  await holdGrownup(page, /mark THEN done/);
  await page.waitForFunction(() => document.querySelectorAll('.sched-done').length === 2);
  await holdGrownup(page, /start First \/ Then again/);
  await page.waitForFunction(() => document.querySelectorAll('.sched-done').length === 0);
  await ctx.close();
});

test('I’m Working For: 3 tokens by default, hold to add, gentle celebration, no way to remove a token', async () => {
  const { ctx, page } = await openApp();
  await openMyDay(page);
  await page.getByRole('tab', { name: /working for/ }).click();
  assert.equal(await page.locator('.token').count(), 3);
  await page.getByRole('button', { name: 'Hold to add a token' }).click();
  assert.equal(await page.locator('.token-on').count(), 0, 'a quick tap does not add a token');
  for (let i = 1; i <= 3; i++) {
    await holdGrownup(page, 'Hold to add a token');
    await page.waitForFunction((n) => document.querySelectorAll('.token-on').length === n, i);
  }
  await page.getByText(/You did it!/).waitFor();
  assert.equal(await page.getByRole('button', { name: /(remove|take away).*token/i }).count(), 0);
  await page.reload();
  await openMyDay(page);
  await page.getByRole('tab', { name: /working for/ }).click();
  assert.equal(await page.locator('.token-on').count(), 3, 'earned tokens are saved');
  await holdGrownup(page, 'Hold to reset tokens');
  await page.waitForFunction(() => document.querySelectorAll('.token-on').length === 0);
  await ctx.close();
});

/* ---------------- Visual schedules: one editor for everything ---------------- */

async function openScheduleEditor(page: Page, button: RegExp | string, firstTime = true) {
  await enterParentMode(page, firstTime);
  await page.getByRole('tab', { name: 'Visual schedules' }).click();
  await page.getByRole('button', { name: button }).click();
  await page.getByTestId('schedule-editor').waitFor();
}
const editor = (page: Page) => page.getByTestId('schedule-editor');
const preview = (page: Page) => page.getByTestId('schedule-preview');
/** In the picture picker: search, tap a result, then "Use picture". */
async function usePictureFromSearch(page: Page, query: string, symbol: string) {
  const picker = page.getByTestId('picture-picker').last();
  await picker.getByTestId('picture-search').fill(query);
  await picker.getByTestId('picture-results').locator(`[data-symbol="${symbol}"]`).first().click();
  await picker.getByTestId('use-picture').click();
}
async function usePhotoFromPicker(page: Page) {
  const picker = page.getByTestId('picture-picker').last();
  await picker.getByTestId('use-photo').click();
  await picker.getByTestId('picker-photo-input').setInputFiles(PHOTO);
  await page.getByTestId('crop-viewport').waitFor();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await picker.getByTestId('use-picture').click();
}
async function pickArasaac(page: Page, card: string, query: string, n = 0) {
  await editor(page).getByTestId(card).getByRole('button', { name: /Choose picture|Change picture/ }).first().click();
  await usePictureFromSearch(page, query, `arasaac:${pictoId(query) + n}`);
  await page.getByTestId('picture-picker').waitFor({ state: 'detached' });
}
async function pickPhoto(page: Page, card: string) {
  await editor(page).getByTestId(card).getByRole('button', { name: /Choose picture|Change picture/ }).first().click();
  await usePhotoFromPicker(page);
  await page.getByTestId('picture-picker').waitFor({ state: 'detached' });
}
async function saveSchedule(page: Page) {
  await editor(page).getByTestId('save-schedule').click();
  await editor(page).waitFor({ state: 'detached' });
}

test('First / Then: edit FIRST and THEN (words, speech, ARASAAC symbol, photo, colour) with live preview; survives reload', async () => {
  const { ctx, page } = await openApp();
  const before = await slots(page);
  await openScheduleEditor(page, 'Edit First / Then');
  await editor(page).getByLabel('FIRST words').fill('Put on shoes');
  await editor(page).getByLabel('FIRST spoken words').fill('Shoes on, please');
  await pickArasaac(page, 'ft-first', 'shoes');
  await editor(page).getByTestId('ft-first').getByRole('button', { name: 'green card' }).click();
  await editor(page).getByLabel('THEN words').fill('Go outside');
  await pickPhoto(page, 'ft-then');
  // Live preview shows exactly what the child will see.
  await preview(page).getByText('Put on shoes').waitFor();
  await preview(page).locator(`img.tile-symbol[src="https://api.arasaac.org/v1/pictograms/${pictoId('shoes')}"]`).waitFor();
  await preview(page).locator('.sched-card.tile-green').waitFor();
  await preview(page).locator('img.tile-photo').waitFor();
  await saveSchedule(page);
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openMyDay(page);
  await page.locator('.first-then .sched-card').first().click();
  assert.equal((await spoken(page)).at(-1), 'First Shoes on, please');
  await page.getByRole('button', { name: 'Say it' }).click();
  assert.equal((await spoken(page)).at(-1), 'First Shoes on, please, then Go outside');
  await page.reload();
  await openMyDay(page);
  await page.locator('.first-then').getByText('Go outside').waitFor();
  await page.locator('.first-then img.tile-photo').waitFor();
  await page.locator(`.first-then img.tile-symbol[src="https://api.arasaac.org/v1/pictograms/${pictoId('shoes')}"]`).waitFor();
  // The AAC board itself is untouched.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Talk' }).click();
  assert.deepEqual(await slots(page), before, 'no vocabulary moved');
  await page.locator('.board-grid [data-tile-id="core-more"]').click();
  assert.equal((await spoken(page)).at(-1), 'more');
  await ctx.close();
});

test('First / Then templates: save, rename, switch, delete — and quick switch from Parent Mode', async () => {
  const { ctx, page } = await openApp();
  await openScheduleEditor(page, 'Edit First / Then');
  await editor(page).getByLabel('FIRST words').fill('Bath');
  await editor(page).getByLabel('THEN words').fill('Story');
  await editor(page).getByTestId('template-name').fill('Bath time');
  await editor(page).getByTestId('save-template').click();
  await editor(page).locator('[data-template="Bath time"]').waitFor();
  await editor(page).getByLabel('Name of Bath time').fill('Evening');
  await editor(page).getByLabel('Name of Evening').blur();
  await editor(page).locator('[data-template="Evening"]').waitFor();
  await editor(page).getByLabel('FIRST words').fill('Something else');
  await editor(page).locator('[data-template="Evening"]').getByRole('button', { name: 'Use' }).click();
  assert.equal(await editor(page).getByLabel('FIRST words').inputValue(), 'Bath');
  await editor(page).getByRole('button', { name: 'Delete Shoes, then outside' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  assert.equal(await editor(page).locator('[data-template="Shoes, then outside"]').count(), 0);
  await saveSchedule(page);
  // Quick switch without opening the editor.
  await page.getByLabel('Choose saved First / Then').selectOption({ label: 'Evening' });
  assert.match((await page.getByTestId('vs-firstThen').getByTestId('active-board').textContent()) ?? '', /Bath time|Evening|not saved/, 'selecting alone does not switch');
  await page.getByTestId('vs-firstThen').getByRole('button', { name: 'Use board' }).click();
  await page.getByText('My Day now shows “Evening”.').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openMyDay(page);
  await page.locator('.first-then').getByText('Story').waitFor();
  await ctx.close();
});

test('I’m Working For: reward name, photo and symbol, goal, 1–10 tokens, token styles, message; templates; progress kept', async () => {
  const { ctx, page } = await openApp();
  await openScheduleEditor(page, 'Edit reward');
  await editor(page).getByLabel('Reward words').fill('Swing');
  await pickArasaac(page, 'reward-item', 'swing');
  await editor(page).getByLabel('Goal').fill('Sit for the story');
  const slider = editor(page).getByTestId('token-count');
  await slider.fill('1');
  assert.equal(await preview(page).locator('.token').count(), 1);
  await slider.fill('10');
  assert.equal(await preview(page).locator('.token').count(), 10);
  await slider.fill('5');
  for (const style of ['check', 'circle', 'dot', 'star', 'heart']) {
    await editor(page).getByTestId(`token-style-${style}`).click();
    await preview(page).locator(`[data-testid="tokens"][data-style="${style}"]`).waitFor();
  }
  await editor(page).getByLabel('Completion message').fill('Great sitting! Swing time!');
  await editor(page).getByTestId('template-name').fill('Working for swing');
  await editor(page).getByTestId('save-template').click();
  await editor(page).locator('[data-template="Working for swing"]').waitFor();
  await saveSchedule(page);
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openMyDay(page);
  await page.getByRole('tab', { name: /working for/ }).click();
  assert.equal(await page.locator('.token').count(), 5);
  await page.locator('[data-testid="tokens"][data-style="heart"]').waitFor();
  await page.getByText('Sit for the story').waitFor();
  for (let i = 1; i <= 5; i++) {
    await holdGrownup(page, 'Hold to add a token');
    await page.waitForFunction((n) => document.querySelectorAll('.token-on').length === n, i);
  }
  await page.getByText('Great sitting! Swing time!').waitFor();
  assert.equal(await page.getByRole('button', { name: /(remove|take away).*token/i }).count(), 0, 'tokens are never taken away');
  // Switching to another saved reward starts that board fresh; the saved one comes back intact.
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-more').click(); // quick editor → full editor
  await editor(page).locator('[data-template="Working for bubbles"]').getByRole('button', { name: 'Use' }).click();
  await editor(page).locator('[data-template="Working for swing"]').getByRole('button', { name: 'Use' }).click();
  assert.equal(await editor(page).getByLabel('Reward words').inputValue(), 'Swing');
  assert.equal(await preview(page).locator('.token').count(), 5);
  await ctx.close();
});

test('routine builder: 1 to 5 steps, reorder, three views, saved routines restore', async () => {
  const { ctx, page } = await openApp();
  await openMyDay(page);
  await page.getByRole('tab', { name: 'My Steps' }).click();
  await holdGrownup(page, 'Hold to mark this step done');
  await page.locator('.steps .sched-done').waitFor();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Visual schedules' }).click();
  await page.getByRole('button', { name: 'Open routine builder' }).click();
  // Down to one step…
  await editor(page).getByRole('button', { name: 'Remove step 3' }).click();
  await editor(page).getByRole('button', { name: 'Remove step 2' }).click();
  assert.ok(await editor(page).getByRole('button', { name: 'Remove step 1' }).isDisabled(), 'at least one step');
  // …up to five.
  for (let i = 0; i < 4; i++) await editor(page).getByTestId('add-step').click();
  assert.ok(await editor(page).getByTestId('add-step').isDisabled(), 'at most five steps');
  await editor(page).getByLabel('Step 2 words').fill('Shoes on');
  await editor(page).getByLabel('Step 3 words').fill('Jacket');
  await editor(page).getByRole('button', { name: 'Move step 3 up' }).click();
  assert.equal(await editor(page).getByLabel('Step 2 words').inputValue(), 'Jacket');
  assert.equal(await editor(page).getByLabel('Step 3 words').inputValue(), 'Shoes on');
  await pickArasaac(page, 'step-4', 'park');
  await editor(page).getByLabel('Routine name').fill('Park trip');
  await editor(page).getByTestId('layout-nowNextLater').check();
  await preview(page).locator('.nnl-now').waitFor();
  await editor(page).getByTestId('template-name').fill('Park trip');
  await editor(page).getByTestId('save-template').click();
  await editor(page).getByRole('button', { name: 'Duplicate Park trip' }).click();
  await editor(page).locator('[data-template="Park trip copy"]').waitFor();
  await saveSchedule(page);
  await page.getByRole('button', { name: /back to Talk/ }).click();

  await openMyDay(page);
  await page.getByRole('tab', { name: 'My Steps' }).click();
  assert.equal(await page.locator('.nnl .sched-card').count(), 3);
  // Step 1 was already done before editing, so NOW is step 2; editing kept that progress.
  assert.match((await page.locator('.nnl-now').textContent()) ?? '', /Jacket/);
  await holdGrownup(page, 'Hold to mark this step done');
  await page.waitForFunction(() => /Shoes on/.test(document.querySelector('.nnl-now')?.textContent ?? ''));

  // One step at a time, with small previews of what's next.
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-more').click(); // quick editor → full editor
  await editor(page).getByTestId('layout-oneAtATime').check();
  await saveSchedule(page);
  await page.getByRole('tab', { name: 'My Steps' }).click();
  await page.getByTestId('one-step').getByText('STEP 3 OF 5').waitFor();
  assert.equal(await page.locator('.one-step-next .sched-card').count(), 2);

  // Load a different saved routine, then restore ours.
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-more').click(); // quick editor → full editor
  await editor(page).locator('[data-template="Bedtime"]').getByRole('button', { name: 'Use' }).click();
  assert.equal(await editor(page).getByLabel('Step 1 words').inputValue(), 'Bath');
  await editor(page).locator('[data-template="Park trip"]').getByRole('button', { name: 'Use' }).click();
  assert.equal(await editor(page).getByLabel('Step 2 words').inputValue(), 'Jacket');
  assert.equal(await editor(page).getByLabel('Step 4 words').inputValue(), 'Step 4');
  await saveSchedule(page);
  await page.reload();
  await openMyDay(page);
  await page.getByRole('tab', { name: 'My Steps' }).click();
  await page.locator('.nnl-now').getByText('Get shoes').waitFor();
  assert.match((await page.locator('.nnl-next').textContent()) ?? '', /Jacket/);
  await ctx.close();
});

test('schedule editing is protected: My Day "Edit schedule" needs the PIN; unsaved changes need confirming', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page); // sets the PIN
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openMyDay(page);
  await page.getByTestId('edit-schedule').click();
  await typePin(page, '0000');
  await page.getByRole('button', { name: 'Unlock' }).click();
  assert.equal(await editor(page).count(), 0, 'wrong PIN does not open the editor');
  await page.getByRole('dialog').getByRole('button', { name: /Cancel|Close/ }).first().click();
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-more').click(); // quick editor → full editor
  await editor(page).getByLabel('FIRST words').fill('Changed');
  await editor(page).getByTestId('cancel-schedule').click();
  await page.getByRole('alertdialog').getByText('Discard your changes?').waitFor();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
  await editor(page).waitFor({ state: 'detached' });
  assert.equal(await page.locator('.first-then').getByText('Changed').count(), 0);
  await ctx.close();
});

test('schedule pictures (ARASAAC symbol and photo) still show offline', async () => {
  const { ctx, page } = await openApp();
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15000 });
  await openScheduleEditor(page, 'Edit First / Then');
  await pickArasaac(page, 'ft-first', 'teeth');
  await pickPhoto(page, 'ft-then');
  await saveSchedule(page);
  const url = `https://api.arasaac.org/v1/pictograms/${pictoId('teeth')}`;
  await page.waitForFunction(async (u) => !!(await (await caches.open('mimzi-symbols-v1')).match(u)), url, { timeout: 20000 });
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.setOffline(true);
  await page.reload();
  await openMyDay(page);
  for (const sel of [`.first-then img.tile-symbol[src="${url}"]`, '.first-then img.tile-photo']) {
    await page.waitForFunction((s) => {
      const el = document.querySelector(s) as HTMLImageElement | null;
      return !!el && el.complete && el.naturalWidth > 0;
    }, sel);
  }
  await ctx.setOffline(false);
  await ctx.close();
});

for (const [name, viewport] of [
  ['phone', { width: 383, height: 743 }],
  ['onn tablet landscape', { width: 960, height: 600 }],
  ['onn tablet portrait', { width: 600, height: 960 }],
  ['ipad', IPAD],
] as const) {
  test(`My Day and the schedule editor fit on ${name}`, async () => {
    const { ctx, page } = await openApp(viewport);
    await openMyDay(page);
    for (const tab of [/First \/ Then/, /working for/, 'My Steps']) {
      await page.getByRole('tab', { name: tab }).click();
      const ok = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.myday .sched-card, .myday .reward-goal')] as HTMLElement[];
        const media = [...document.querySelectorAll('.myday .sched-media')].map((m) => m.getBoundingClientRect());
        return {
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
          pictures: media.every((r) => r.height >= 40 && r.width >= 40),
          inView: cards.every((c) => c.getBoundingClientRect().bottom <= window.innerHeight + 1),
        };
      });
      assert.deepEqual(ok, { overflowX: false, pictures: true, inView: true }, String(tab));
    }
    await page.getByTestId('edit-schedule').click();
    await typePin(page, PIN);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await typePin(page, PIN);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByTestId('quick-more').click(); // quick editor → full editor
    await editor(page).waitFor();
    const fits = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="schedule-preview"]')!.getBoundingClientRect();
      return p.left >= 0 && p.right <= window.innerWidth + 1 && p.height > 150;
    });
    assert.ok(fits, 'live preview fits the screen');
    await ctx.close();
  });
}

/* ---------------- Phase 4 ---------------- */

test('My Words: caregiver note and SLP export (no scores)', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'My Words', exact: true }).click();
  await page.getByLabel('Target word').fill('more');
  await page.getByLabel('How they say or show it').fill('mo');
  await page.getByLabel('Method').selectOption('Word approximation');
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.locator('tr[data-obs="more"]').waitFor();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Spreadsheet/ }).click()]);
  const csvText = await readFile(await csv.path(), 'utf8');
  assert.match(csvText, /"more","mo","Word approximation"/);
  const [txt] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Summary for therapist/ }).click()]);
  const summary = await readFile(await txt.path(), 'utf8');
  assert.match(summary, /not an assessment/);
  assert.doesNotMatch(summary, /score/i);
  await page.reload();
  await enterParentMode(page, false);
  await page.getByRole('tab', { name: 'My Words', exact: true }).click();
  await page.locator('tr[data-obs="more"]').waitFor();
  await ctx.close();
});

test('Food & Drinks: foods stay hidden until a grown-up picks them; private notes stay private', async () => {
  const { ctx, page } = await openApp();
  await page.locator('.board-grid [data-tile-id="core-folder-food"]').click();
  assert.equal(await page.locator('.board-grid [data-tile-id="food-banana"]').count(), 0, 'library foods start hidden');
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Manage words' }).click();
  await page.getByRole('tab', { name: 'Food & Drinks', exact: true }).click();
  await page.locator('[data-wob="food-banana"]').click();
  await page.getByTestId('wob-toggle').click(); // Manage words: select, then Show / Hide
  await page.getByRole('tab', { name: 'Edit AAC board' }).click();
  await page.getByRole('tab', { name: 'Food & Drinks', exact: true }).click();
  await page.getByRole('button', { name: '+ Add picture' }).click();
  await page.getByLabel('Word on the tile').fill('Blueberries');
  await page.getByLabel(/Private note/).fill('only cut in half');
  await page.getByText(/Mimzi never suggests foods/).waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-word[aria-label="Edit Blueberries"]').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openFolder(page, 'food');
  await page.locator('.board-grid [data-tile-id="food-banana"]').waitFor();
  await (await findTile(page, '.tile[aria-label="Blueberries"]')).click();
  assert.equal((await spoken(page)).at(-1), 'Blueberries');
  assert.equal(await page.getByText('only cut in half').count(), 0, 'private note never shown to the child');
  await ctx.close();
});

test('Parent Mode shows that sync is off; only AAC symbol downloads leave the device', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  assert.match((await page.getByTestId('sync-status').textContent()) ?? '', /This device only/);
  const external = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => !u.startsWith(location.origin) && !u.startsWith('blob:') && !u.startsWith('data:')),
  );
  const hosts = new Set(external.map((u) => new URL(u).hostname));
  for (const h of hosts) assert.ok(['api.arasaac.org', 'static.arasaac.org'].includes(h), `unexpected request to ${h}`);
  await ctx.close();
});

/* ---------------- Phase 5: accessibility basics ---------------- */

for (const [name, viewport] of [
  ['ipad', IPAD],
  ['galaxy', GALAXY],
] as const) {
  test(`child screens: every control has a name and a 44 px touch target (${name})`, async () => {
    const { ctx, page } = await openApp(viewport);
    const problems: string[] = [];
    for (const screen of ['Talk', 'My Day', 'Favorites', 'My People']) {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: screen }).click();
      const found = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('button, [role="tab"], a[href]')]
          .filter((el) => el.offsetParent !== null && !el.closest('.modal'))
          .map((el) => {
            const r = el.getBoundingClientRect();
            const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
            return { label, w: Math.round(r.width), h: Math.round(r.height) };
          }),
      );
      for (const f of found) {
        if (!f.label) problems.push(`${screen}: unnamed control`);
        if (f.w < 44 || f.h < 44) problems.push(`${screen}: “${f.label}” is ${f.w}×${f.h}`);
      }
    }
    assert.deepEqual(problems, []);
    await ctx.close();
  });
}

/* ---------------- Google sign-in, Drive sync, Google Photos (Google mocked) ---------------- */

interface FakeFile {
  id: string;
  name: string;
  appProperties?: Record<string, string>;
  body: Buffer;
  type: string;
}

/** Stands in for Google sign-in, the Drive app folder and the Photos Picker. Shared across "devices". */
function fakeGoogle() {
  const files = new Map<string, FakeFile>();
  let n = 0;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE' };
  const gis = `window.google = { accounts: { oauth2: {
    initTokenClient(cfg) { return { requestAccessToken() { setTimeout(() => cfg.callback({ access_token: 'test-token', expires_in: 3600, scope: cfg.scope }), 20); } }; },
    revoke(t, done) { done && done(); } } } };`;

  async function install(ctx: BrowserContext) {
    await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: gis }));
    await ctx.route('https://www.googleapis.com/oauth2/v3/userinfo', (r) =>
      r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: cors }) : r.fulfill({ json: { email: 'parent@example.com', name: 'Test Parent' }, headers: cors }),
    );
    await ctx.route(/https:\/\/www\.googleapis\.com\/(upload\/)?drive\/v3\/files.*/, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const method = req.method();
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (req.headers()['authorization'] !== 'Bearer test-token') return route.fulfill({ status: 401, headers: cors, body: 'no' });
      const id = url.pathname.match(/files\/([^/]+)$/)?.[1];
      if (!id && method === 'GET') {
        return route.fulfill({ headers: cors, json: { files: [...files.values()].map(({ body: _b, type: _t, ...f }) => f) } });
      }
      if (!id && method === 'POST') {
        const meta = JSON.parse(req.postData() ?? '{}');
        const newIdValue = `file${++n}`;
        files.set(newIdValue, { id: newIdValue, name: meta.name, appProperties: meta.appProperties, body: Buffer.alloc(0), type: 'application/octet-stream' });
        return route.fulfill({ headers: cors, json: { id: newIdValue } });
      }
      const f = id ? files.get(id) : undefined;
      if (!f) return route.fulfill({ status: 404, headers: cors, body: 'not found' });
      if (method === 'PATCH') {
        f.body = req.postDataBuffer() ?? Buffer.alloc(0);
        f.type = req.headers()['content-type'] ?? f.type;
        return route.fulfill({ headers: cors, json: { id } });
      }
      if (method === 'GET' && url.searchParams.get('alt') === 'media') return route.fulfill({ headers: { ...cors, 'Content-Type': f.type }, body: f.body });
      if (method === 'DELETE') {
        files.delete(f.id);
        return route.fulfill({ status: 204, headers: cors });
      }
      return route.fulfill({ status: 400, headers: cors, body: 'unsupported' });
    });
    // Google Photos Picker
    await ctx.route(/https:\/\/photospicker\.googleapis\.com\/v1\/.*/, (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const url = req.url();
      if (url.endsWith('/v1/sessions') && req.method() === 'POST') {
        return route.fulfill({ headers: cors, json: { id: 'sess1', pickerUri: 'https://photos.google.com/picker/sess1', pollingConfig: { pollInterval: '1s', timeoutIn: '60s' } } });
      }
      if (url.includes('/v1/sessions/sess1') && req.method() === 'GET') return route.fulfill({ headers: cors, json: { id: 'sess1', pickerUri: 'x', mediaItemsSet: true } });
      if (url.includes('/v1/mediaItems')) {
        return route.fulfill({ headers: cors, json: { mediaItems: [{ id: 'm1', type: 'PHOTO', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/m1', mimeType: 'image/png', filename: 'ball.png' } }] } });
      }
      return route.fulfill({ status: 200, headers: cors, json: {} });
    });
    await ctx.route('https://photos.google.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>Google Photos (test)</p>' }));
    // Mimzi's own pass-through function (deployed on the host; mocked here)
    await ctx.route(/\/api\/photo\?/, async (route) => {
      const u = new URL(route.request().url()).searchParams.get('url') ?? '';
      if (!u.startsWith('https://lh3.googleusercontent.com/m1=') || route.request().headers()['authorization'] !== 'Bearer test-token') {
        return route.fulfill({ status: 400, body: 'bad' });
      }
      return route.fulfill({ contentType: 'image/png', body: await readFile(PHOTO) });
    });
  }
  return { install, files };
}

async function googleSignIn(page: Page) {
  await page.getByRole('tab', { name: 'Google & sync' }).click();
  await page.getByRole('button', { name: /Sign in with Google/ }).click();
  await page.getByTestId('google-account').waitFor();
  await page.getByText(/Last synced/).waitFor({ timeout: 15000 });
}

test('Google: sign in, then a second device signs in and gets everything (photos, notes) — and deletes sync back', async () => {
  const google = fakeGoogle();
  const ipad = await openApp(IPAD);
  await google.install(ipad.ctx);
  await enterParentMode(ipad.page);
  await addPhotoTile(ipad.page, 'Rex', 'People');
  await ipad.page.getByRole('tab', { name: 'My Words', exact: true }).click();
  await ipad.page.getByLabel('Target word').fill('more');
  await ipad.page.getByLabel('How they say or show it').fill('mo');
  await ipad.page.getByRole('button', { name: 'Add note' }).click();
  await ipad.page.locator('tr[data-obs="more"]').waitFor();
  await googleSignIn(ipad.page);
  assert.match((await ipad.page.getByTestId('google-account').textContent()) ?? '', /Test Parent/);
  const names = [...google.files.values()].map((f) => f.name);
  assert.ok(names.includes('mimzi-state.json'));
  assert.equal(names.filter((x) => x.startsWith('media-photo-')).length, 1, 'photo uploaded once');
  assert.doesNotMatch(google.files.get([...google.files.values()].find((f) => f.name === 'mimzi-state.json')!.id)!.body.toString(), /"hash"/, 'PIN not uploaded');

  const galaxy = await openApp(GALAXY);
  await google.install(galaxy.ctx);
  await enterParentMode(galaxy.page);
  await googleSignIn(galaxy.page);
  await galaxy.page.getByRole('button', { name: /back to Talk/ }).click();
  await galaxy.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'My People' }).click();
  await galaxy.page.locator('.board-grid .tile[aria-label="Rex"] img').waitFor();
  await enterParentMode(galaxy.page, false);
  await galaxy.page.getByRole('tab', { name: 'My Words', exact: true }).click();
  await galaxy.page.locator('tr[data-obs="more"]').waitFor();

  // Delete on the phone, sync, then sync the iPad
  await galaxy.page.getByRole('tab', { name: 'Edit AAC board' }).click();
  await galaxy.page.getByRole('tab', { name: 'People', exact: true }).click();
  await galaxy.page.locator('.edit-word[aria-label="Edit Rex"]').click();
  await galaxy.page.getByRole('button', { name: 'Delete', exact: true }).click();
  await galaxy.page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await galaxy.page.locator('.edit-word[aria-label="Edit Rex"]').waitFor({ state: 'detached' });
  await galaxy.page.getByRole('tab', { name: 'Google & sync' }).click();
  await galaxy.page.getByRole('button', { name: /Sync now/ }).click();
  await galaxy.page.getByRole('button', { name: /Sync now/ }).waitFor();

  await ipad.page.getByRole('button', { name: /Sync now/ }).click();
  await ipad.page.getByRole('button', { name: /Sync now/ }).waitFor();
  await ipad.page.getByRole('tab', { name: 'Edit AAC board' }).click();
  await ipad.page.getByRole('tab', { name: 'People', exact: true }).click();
  await ipad.page.locator('.edit-word[aria-label="Edit Rex"]').waitFor({ state: 'detached' });
  await ipad.page.getByRole('tab', { name: /Recently deleted/ }).click();
  await ipad.page.getByText('Rex').waitFor();

  await ipad.ctx.close();
  await galaxy.ctx.close();
});

test('Google Photos: pick a photo in Google’s picker and use it on a tile', async () => {
  const google = fakeGoogle();
  const { ctx, page } = await openApp();
  await google.install(ctx);
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Toys & Play', exact: true }).click();
  await page.getByRole('button', { name: '+ Add picture' }).click();
  await page.getByLabel('Word on the tile').fill('Blue ball');
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /From Google Photos/ }).click()]);
  assert.ok(popup, 'Google Photos opened in its own window');
  await page.getByTestId('crop-viewport').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Use photo' }).click();
  await page.locator('.tile-preview img.tile-photo').waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-item:has(.edit-word[aria-label="Edit Blue ball"]) img.tile-photo').waitFor();
  await ctx.close();
});

/* ---------------- V3 acceptance tests ---------------- */

test('V3-1/2/9: More speaks with the built-in voice; full sentence; Help speaks', async () => {
  const { ctx, page } = await openApp();
  await page.locator('.board-grid [data-tile-id="core-more"]').click();
  assert.equal((await spoken(page)).at(-1), 'more');
  assert.equal(await page.locator('.board-grid [data-tile-id="core-more"] .tile-media svg, .board-grid [data-tile-id="core-more"] img.tile-symbol').count(), 1, 'button shows an AAC picture');
  await page.locator('.board-grid [data-tile-id="core-help"]').click();
  assert.equal((await spoken(page)).at(-1), 'help');
  assert.equal(await page.locator('.board-grid').getByRole('button', { name: /See sign/ }).count(), 0, 'ASL was removed');
  await ctx.close();
});

test('V3-3: a brand-new word speaks automatically — no recording', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Toys & Play', exact: true }).click();
  await page.getByRole('button', { name: '+ Add picture' }).click();
  await page.getByLabel('Word on the tile').fill('Trampoline');
  await page.getByTestId('choose-picture').click();
  await usePictureFromSearch(page, 'trampoline', 'mul:trampoline');
  await page.getByTestId('picture-picker').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-word[aria-label="Edit Trampoline"]').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await page.locator('.board-grid [data-tile-id="core-folder-play"]').click();
  await (await findTile(page, '.tile[aria-label="Trampoline"]')).click();
  assert.equal((await spoken(page)).at(-1), 'Trampoline');
  await ctx.close();
});

test('V3-4/10: changing the voice and speed; offline the on-device backup voice is used and explained', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Mimzi Voice' }).click();
  await page.locator('.voice-row', { hasText: 'Test Voice B' }).getByText('Test Voice B').click();
  await page.locator('.voice-row.voice-on', { hasText: 'Test Voice B' }).waitFor();
  await page.getByTestId('speech-rate').fill('1.3');
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await page.locator('.board-grid [data-tile-id="core-go"]').click();
  assert.equal((await voicesUsed(page)).at(-1), 'voice-b');
  assert.equal((await ratesUsed(page)).at(-1), 1.3);
  await ctx.setOffline(true);
  await page.locator('.board-grid [data-tile-id="core-look"]').click();
  assert.equal((await voicesUsed(page)).at(-1), 'voice-a', 'Voice B needs internet → on-device Voice A is used offline');
  assert.equal((await spoken(page)).at(-1), 'look');
  await enterParentMode(page, false);
  await page.getByRole('tab', { name: 'Mimzi Voice' }).click();
  await page.getByTestId('voice-status').getByText(/needs the internet/).waitFor();
  await ctx.setOffline(false);
  await ctx.close();
});

test('pronunciation override changes only what is spoken', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Mimzi Voice' }).click();
  await page.getByTestId('pron-word').selectOption('family-mama');
  await page.getByTestId('pron-text').fill('Mah-mah');
  await page.getByTestId('pron-save').click();
  await page.getByText(/→ “Mah-mah”/).waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await page.locator('.board-grid [data-tile-id="core-folder-family"]').click();
  await page.locator('.board-grid [data-tile-id="family-mama"]').click();
  assert.equal((await spoken(page)).at(-1), 'Mah-mah');
  assert.equal(await page.locator('.board-grid [data-tile-id="family-mama"] .tile-label').textContent(), 'Mama');
  await ctx.close();
});

test('V3-5: Manage words — hide words one by one; the count updates and nothing else moves', async () => {
  const { ctx, page } = await openApp();
  const before = await slots(page);
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Manage words' }).click();
  const count = page.getByTestId('wob-count');
  const n = Number(((await count.textContent()) ?? '').match(/(\d+) words? visible/)![1]);
  for (const id of ['core-look', 'core-go']) {
    await page.locator(`[data-wob="${id}"]`).click();
    await page.getByTestId('wob-toggle').click();
  }
  await count.getByText(new RegExp(`^${n - 2} words visible`)).waitFor();
  await count.getByText(/2 hidden/).waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  const after = await slots(page);
  assert.deepEqual(after, before.map((id) => (id === 'core-look' || id === 'core-go' ? null : id)), 'only those two spots are now empty');
  await ctx.close();
});

test('V3-7: hide and restore a word — same spot, picture and speech', async () => {
  const { ctx, page } = await openApp();
  const slotOf = () => page.locator('.board-grid > *').evaluateAll((els) => els.findIndex((e) => (e.getAttribute('data-tile-id') ?? e.querySelector('[data-tile-id]')?.getAttribute('data-tile-id')) === 'core-look'));
  const before = await slotOf();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Manage words' }).click();
  await page.locator('[data-wob="core-look"]').click();
  await page.getByTestId('wob-toggle').click(); // Manage words: select, then Show / Hide
  await page.getByRole('button', { name: /back to Talk/ }).click();
  assert.equal(await slotOf(), -1);
  const g = await page.locator('.board-grid').evaluate((el) => ({ n: el.children.length, cells: Number(el.getAttribute('data-rows')) * Number(el.getAttribute('data-cols')) }));
  assert.equal(g.n, g.cells, 'its slot is kept empty');
  await enterParentMode(page, false);
  await page.getByRole('tab', { name: 'Manage words' }).click();
  await page.locator('[data-wob="core-look"]').click();
  await page.getByTestId('wob-toggle').click(); // Manage words: select, then Show / Hide
  await page.getByRole('tab', { name: 'Grow My Words' }).click();
  await page.getByTestId('vocab-history').getByText('hidden').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  assert.equal(await slotOf(), before);
  await page.locator('.board-grid [data-tile-id="core-look"]').click();
  assert.equal((await spoken(page)).at(-1), 'look');
  await ctx.close();
});

test('V3-6: two new words every Monday — scheduled, then waiting for approval on the day, then added', async () => {
  const ctx = await browser.newContext({ viewport: IPAD, hasTouch: true });
  await ctx.addInitScript({ content: defaultStub });
  await mockSymbolServices(ctx);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-11-18T10:00:00') }); // a Wednesday
  await page.goto(BASE);
  await page.waitForSelector('.board-grid .tile');
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Grow My Words' }).click();
  await page.getByTestId('grow-cadence').selectOption('weekly');
  await page.getByTestId('grow-per').fill('2');
  await page.getByTestId('grow-weekday').selectOption('1');
  await page.locator('[data-grow-pick="food-apple"]').check();
  await page.locator('[data-grow-pick="food-banana"]').check();
  await page.locator('[data-grow-pick="food-grapes"]').check();
  await page.getByTestId('grow-schedule').click();
  const planned = page.getByTestId('grow-planned');
  await planned.getByText('apple').waitFor();
  assert.match((await planned.textContent()) ?? '', /Mon, Nov 23.*apple.*Mon, Nov 23.*banana.*Mon, Nov 30.*grapes/s);
  await page.getByTestId('grow-calendar').locator('[data-day="2026-11-23"]').getByText('apple').waitFor();

  // Next Monday: Mimzi opens, the due words wait for a grown-up.
  await page.clock.setFixedTime(new Date('2026-11-23T08:00:00'));
  await page.reload();
  await page.waitForSelector('.board-grid .tile');
  await page.locator('.board-grid [data-tile-id="core-folder-food"]').click();
  assert.equal(await page.locator('.board-grid [data-tile-id="food-apple"]').count(), 0, 'not added without approval');
  await enterParentMode(page, false);
  await page.getByTestId('grow-banner').click();
  await page.getByTestId('grow-pending').getByRole('button', { name: 'Add all 2' }).click();
  await page.getByTestId('grow-pending').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openFolder(page, 'food');
  await page.locator('.board-grid [data-tile-id="food-apple"]').waitFor();
  await page.locator('.board-grid [data-tile-id="food-banana"]').waitFor();
  assert.equal(await page.locator('.board-grid [data-tile-id="food-grapes"]').count(), 0, 'next week’s word is still waiting');
  await ctx.close();
});

test('V3-8: a real photo replaces the picture on "drink" — it still says "drink"', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.locator('.edit-word[aria-label="Edit drink"]').click();
  await page.getByTestId('photo-input').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-item:has(.edit-word[aria-label="Edit drink"]) img.tile-photo').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await page.locator('.board-grid [data-tile-id="core-drink"] img.tile-photo').waitFor();
  await page.locator('.board-grid [data-tile-id="core-drink"]').click();
  assert.equal((await spoken(page)).at(-1), 'drink');
  await ctx.close();
});

test('folders, Back and Home keep the message', async () => {
  const { ctx, page } = await openApp();
  await page.locator('.board-grid [data-tile-id="core-i"]').click();
  await page.locator('.board-grid [data-tile-id="core-folder-feelings"]').click();
  await page.getByTestId('page-title').getByText('Feelings').waitFor();
  await page.locator('.board-grid [data-tile-id="feelings-happy"]').click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByTestId('page-title').getByText('Home').waitFor();
  assert.equal(await page.getByTestId('sentence-chip').count(), 2);
  await page.getByRole('button', { name: 'Speak message' }).click();
  assert.equal((await spoken(page)).at(-1), 'I happy');
  await ctx.close();
});

/* ---------------- Natural voice ---------------- */

const IPAD_VOICES = [
  { name: 'Fred', voiceURI: 'com.apple.speech.synthesis.voice.Fred', lang: 'en-US', localService: true, default: true },
  { name: 'Samantha', voiceURI: 'com.apple.voice.compact.en-US.Samantha', lang: 'en-US', localService: true, default: false },
  { name: 'Ava (Enhanced)', voiceURI: 'com.apple.voice.enhanced.en-US.Ava', lang: 'en-US', localService: true, default: false },
  { name: 'Bubbles', voiceURI: 'com.apple.speech.synthesis.voice.Bubbles', lang: 'en-US', localService: true, default: false },
];

test('voice: the most natural voice is used automatically at 0.9× with a gentle pitch', async () => {
  const { ctx, page } = await openApp(IPAD, IPAD_VOICES);
  await page.locator('.board-grid [data-tile-id="core-go"]').click();
  assert.equal((await voicesUsed(page)).at(-1), 'com.apple.voice.enhanced.en-US.Ava', 'Enhanced voice beats the robotic device default');
  assert.equal((await ratesUsed(page)).at(-1), 0.9);
  assert.equal((await pitchesUsed(page)).at(-1), 1.1);
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Mimzi Voice' }).click();
  await page.getByTestId('current-voice').getByText('Ava (Enhanced)').waitFor();
  const order = await page.locator('[data-voice]').evaluateAll((els) => els.map((e) => e.getAttribute('data-voice')));
  assert.equal(order[0], 'com.apple.voice.enhanced.en-US.Ava', 'most natural listed first');
  assert.ok(order.indexOf('com.apple.speech.synthesis.voice.Fred') > order.indexOf('com.apple.voice.compact.en-US.Samantha'), 'robotic voices last');
  await page.locator('[data-voice="com.apple.voice.enhanced.en-US.Ava"]').getByText('· Most natural').waitFor();
  await ctx.close();
});

test('voice: a chosen voice is saved, survives a reload and is used for words, sentences and new words', async () => {
  const { ctx, page } = await openApp(IPAD, IPAD_VOICES);
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Mimzi Voice' }).click();
  await page.locator('[data-voice="com.apple.voice.compact.en-US.Samantha"]').getByRole('button', { name: 'Preview Samantha' }).click();
  assert.equal((await voicesUsed(page)).at(-1), 'com.apple.voice.compact.en-US.Samantha', 'preview uses that voice');
  await page.locator('[data-voice="com.apple.voice.compact.en-US.Samantha"]').getByText('Samantha', { exact: true }).click();
  await page.locator('.voice-row.voice-on[data-voice="com.apple.voice.compact.en-US.Samantha"]').waitFor();
  await page.getByTestId('speech-pitch').fill('1.2');
  await page.getByRole('tab', { name: 'Edit AAC board' }).click();
  await page.getByRole('button', { name: '+ Add picture' }).click();
  await page.getByLabel('Word on the tile').fill('Slide');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-word[aria-label="Edit Slide"]').waitFor();
  await page.reload();
  await page.waitForSelector('.board-grid .tile');
  const SAM = 'com.apple.voice.compact.en-US.Samantha';
  await page.locator('.board-grid [data-tile-id="core-i"]').click();
  await page.locator('.board-grid [data-tile-id="core-want"]').click();
  assert.equal((await voicesUsed(page)).at(-1), SAM, 'still Samantha after reload');
  assert.equal((await pitchesUsed(page)).at(-1), 1.2, 'pitch saved');
  await page.getByRole('button', { name: 'Speak message' }).click();
  assert.equal((await spoken(page)).at(-1), 'I want');
  assert.equal((await voicesUsed(page)).at(-1), SAM, 'sentence uses the same voice');
  await (await findTile(page, '.tile[aria-label="Slide"]')).click();
  assert.equal((await spoken(page)).at(-1), 'Slide');
  assert.equal((await voicesUsed(page)).at(-1), SAM, 'a brand-new word uses the same voice, no recording');
  await ctx.close();
});

test('voice: on a device without the chosen voice, Mimzi explains and a replacement can be picked', async () => {
  const ipad = await openApp(IPAD, IPAD_VOICES);
  await enterParentMode(ipad.page);
  await ipad.page.getByRole('tab', { name: 'Mimzi Voice' }).click();
  await ipad.page.locator('[data-voice="com.apple.voice.enhanced.en-US.Ava"]').getByText('Ava (Enhanced)', { exact: true }).click();
  await ipad.page.locator('.voice-row.voice-on[data-voice="com.apple.voice.enhanced.en-US.Ava"]').waitFor();
  await ipad.page.getByRole('tab', { name: 'Backup' }).click();
  const [download] = await Promise.all([ipad.page.waitForEvent('download'), ipad.page.getByRole('button', { name: /Make a backup file/ }).click()]);
  const file = SHOTS + 'voice-backup.json';
  await download.saveAs(file);
  await ipad.ctx.close();

  const TABLET = [
    { name: 'English United States', voiceURI: 'en-us-x-sfg-local', lang: 'en-US', localService: true, default: true },
    { name: 'Google US English', voiceURI: 'Google US English', lang: 'en-US', localService: false, default: false },
  ];
  const tab = await openApp({ width: 960, height: 600 }, TABLET);
  await enterParentMode(tab.page);
  await tab.page.getByRole('tab', { name: 'Backup' }).click();
  await tab.page.getByTestId('restore-input').setInputFiles(file);
  await tab.page.getByRole('alertdialog').getByRole('button', { name: 'Restore backup' }).click();
  await tab.page.getByText('Backup restored.').waitFor();
  await tab.page.getByRole('tab', { name: 'Mimzi Voice' }).click();
  await tab.page.getByTestId('voice-other-device').getByText(/Ava \(Enhanced\)/).waitFor();
  await tab.page.getByTestId('current-voice').getByText('Google US English').waitFor();
  await tab.page.locator('[data-voice="en-us-x-sfg-local"]').getByText('English United States', { exact: true }).click();
  await tab.page.getByTestId('voice-other-device').waitFor({ state: 'detached' });
  await tab.page.getByRole('button', { name: /back to Talk/ }).click();
  await tab.page.locator('.board-grid [data-tile-id="core-more"]').click();
  assert.equal((await voicesUsed(tab.page)).at(-1), 'en-us-x-sfg-local');
  await tab.ctx.close();
});

/* ---------------- Multi-library AAC symbols ---------------- */

const slots = (page: Page) =>
  page.locator('.board-grid > *').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id') ?? e.querySelector('[data-tile-id]')?.getAttribute('data-tile-id') ?? null));
const pictureOf = (page: Page, id: string) => page.locator(`.board-grid [data-tile-id="${id}"] img.tile-symbol`).getAttribute('src');

test('symbols: every starter word gets an ARASAAC picture automatically; nothing moves', async () => {
  const { ctx, page } = await openApp();
  const before = await slots(page);
  await page.waitForFunction(() => document.querySelectorAll('.board-grid img.tile-symbol[data-library="arasaac"]').length >= 18, null, { timeout: 20000 });
  await page.locator('.board-grid [data-tile-id="core-all-done"] img.tile-symbol[data-library="arasaac"]').waitFor({ timeout: 20000 });
  // "More" keeps Mimzi's bubble drawing (ARASAAC's is abstract); "all done" is pinned to the open hands.
  assert.equal(await page.locator('.board-grid [data-tile-id="core-more"] img.tile-symbol').count(), 0);
  assert.equal(await page.locator('.board-grid [data-tile-id="core-more"] .tile-media svg').count(), 1);
  assert.equal(await pictureOf(page, 'core-all-done'), 'https://api.arasaac.org/v1/pictograms/28429', 'open-hands "all done"');
  assert.equal(await pictureOf(page, 'core-no'), 'https://api.arasaac.org/v1/pictograms/5526', 'red X "no"');
  assert.deepEqual(await slots(page), before, 'positions unchanged');
  assert.equal(await page.locator('.board-grid .tile-emoji').count(), 0, 'no emoji artwork');
  await page.locator('.board-grid [data-tile-id="core-more"]').click();
  assert.equal((await spoken(page)).at(-1), 'more', 'speech unchanged');
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Symbol Library' }).click();
  await page.getByTestId('symbol-status').getByText(/starter words have their ARASAAC picture/).waitFor({ timeout: 20000 });
  await page.getByTestId('symbol-credits').getByText(/Sergio Palao/).waitFor();
  await page.getByTestId('symbol-credits').getByText(/CC \(BY-NC-SA\)/).waitFor();
  await ctx.close();
});

test('symbols: change one picture (ARASAAC alternative, Mulberry, OpenSymbols) — label, speech and place stay', async () => {
  osMode = 'on';
  const { ctx, page } = await openApp();
  await page.waitForFunction(() => document.querySelectorAll('.board-grid img.tile-symbol[data-library="arasaac"]').length >= 18, null, { timeout: 20000 });
  const before = await slots(page);
  await enterParentMode(page);
  // Tap the picture → picker (Recent, Saved, then one search across every library).
  await page.locator('[data-change-picture="core-help"]').click();
  await usePictureFromSearch(page, 'help', `arasaac:${pictoId('help') + 1}`);
  await page.getByTestId('picture-picker').waitFor({ state: 'detached' });
  // Another word from OpenSymbols (non-commercial licence in the picture details), another from Mulberry,
  // using the optional library filter.
  await page.locator('[data-change-picture="core-play"]').click();
  let picker = page.getByTestId('picture-picker');
  await picker.getByTestId('library-filter').locator('summary').click();
  for (const l of ['arasaac', 'mulberry', 'mimzi']) await picker.getByTestId(`lib-${l}`).uncheck();
  await picker.getByTestId('picture-search').fill('swing');
  await picker.getByTestId('picture-results').locator('[data-symbol^="os:"]').first().click();
  await picker.getByTestId('picture-credit').getByText(/sclera.*non-commercial/i).waitFor(); // credit + licence in the details
  await picker.getByRole('button', { name: /tawasol/ }).click();
  await picker.getByTestId('picture-credit').getByText(/tawasol/).waitFor();
  await picker.getByTestId('use-picture').click();
  await picker.waitFor({ state: 'detached' });
  await page.locator('[data-change-picture="core-go"]').click();
  picker = page.getByTestId('picture-picker');
  await picker.getByTestId('library-filter').locator('summary').click();
  for (const l of ['arasaac', 'mimzi', 'opensymbols']) await picker.getByTestId(`lib-${l}`).uncheck();
  await picker.getByTestId('picture-search').fill('go');
  await picker.getByTestId('picture-results').locator('[data-symbol="mul:go_,_to"]').click();
  await picker.getByTestId('use-picture').click();
  await picker.waitFor({ state: 'detached' });
  await page.getByRole('tab', { name: 'Symbol Library' }).click();
  await page.getByTestId('symbol-credits').getByText(/tawasol \(via OpenSymbols\)/).waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  assert.equal(await pictureOf(page, 'core-help'), `https://api.arasaac.org/v1/pictograms/${pictoId('help') + 1}`);
  assert.equal(await pictureOf(page, 'core-play'), 'https://cdn.opensymbols.test/swing2.png');
  assert.match((await pictureOf(page, 'core-go')) ?? '', /mulberry\/go_%2C_to\.svg$/);
  assert.deepEqual(await slots(page), before, 'no word moved');
  await page.locator('.board-grid [data-tile-id="core-help"]').click();
  assert.equal((await spoken(page)).at(-1), 'help');
  assert.equal(await page.locator('.board-grid [data-tile-id="core-help"] .tile-label').textContent(), 'help');
  // Switching the default style never touches a picture a grown-up chose.
  await enterParentMode(page, false);
  await page.getByRole('tab', { name: 'Symbol Library' }).click();
  await page.getByTestId('style-mulberry').click();
  await page.locator('[data-testid="style-mulberry"]:checked').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  assert.match((await pictureOf(page, 'core-want')) ?? '', /mulberry\/want_%2C_to\.svg$/, 'automatic pictures follow the style');
  assert.equal(await pictureOf(page, 'core-play'), 'https://cdn.opensymbols.test/swing2.png', 'chosen picture kept');
  assert.deepEqual(await slots(page), before);
  osMode = 'off';
  await ctx.close();
});

test('symbols: a photo can replace any symbol, and removing it brings the symbol back', async () => {
  const { ctx, page } = await openApp();
  await page.waitForFunction(() => document.querySelectorAll('.board-grid img.tile-symbol[data-library="arasaac"]').length >= 18, null, { timeout: 20000 });
  await enterParentMode(page);
  await page.locator('.edit-word[aria-label="Edit eat"]').click();
  await page.getByTestId('photo-input').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await page.locator('.board-grid [data-tile-id="core-eat"] img.tile-photo').waitFor();
  await enterParentMode(page, false);
  await page.locator('.edit-word[aria-label="Edit eat"]').click();
  await page.getByRole('button', { name: /Remove photo/ }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await page.locator(`.board-grid [data-tile-id="core-eat"] img.tile-symbol[src="https://api.arasaac.org/v1/pictograms/${pictoId('eat')}"]`).waitFor();
  await ctx.close();
});

test('symbols: downloaded ARASAAC pictures work offline', async () => {
  const { ctx, page } = await openApp();
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15000 });
  await page.locator('.board-grid [data-tile-id="core-want"] img.tile-symbol[data-library="arasaac"]').waitFor({ timeout: 20000 });
  const url = (await pictureOf(page, 'core-want'))!;
  await page.waitForFunction(async (u) => !!(await (await caches.open('mimzi-symbols-v1')).match(u)), url, { timeout: 20000 });
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.board-grid .tile');
  const img = page.locator('.board-grid [data-tile-id="core-want"] img.tile-symbol');
  assert.equal(await img.getAttribute('src'), url);
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel) as HTMLImageElement | null;
    return !!el && el.complete && el.naturalWidth > 0;
  }, '.board-grid [data-tile-id="core-want"] img.tile-symbol');
  await ctx.setOffline(false);
  await ctx.close();
});

test('symbols: words ARASAAC has no picture for keep their built-in picture', async () => {
  ARASAAC_NONE.add('i');
  const { ctx, page } = await openApp();
  await page.waitForFunction(() => document.querySelectorAll('.board-grid img.tile-symbol[data-library="arasaac"]').length >= 17, null, { timeout: 20000 });
  assert.match((await pictureOf(page, 'core-i')) ?? '', /mulberry\/I\.svg$/);
  ARASAAC_NONE.delete('i');
  await ctx.close();
});

/* ---------------- Professional board: no emoji; sign tag never covers the picture ---------------- */

for (const [name, viewport] of [
  ['phone', { width: 383, height: 743 }],
  ['onn tablet landscape', { width: 960, height: 600 }],
  ['onn tablet portrait', { width: 600, height: 960 }],
  ['ipad', IPAD],
] as const) {
  test(`board looks professional on ${name}: no emoji, no ASL tags, every tile has a picture and label`, async () => {
    const { ctx, page } = await openApp(viewport);
    await page.locator('.board-grid [data-tile-id="core-want"] img.tile-symbol[data-library="arasaac"]').waitFor({ timeout: 20000 });
    const emoji = await page.evaluate(() => {
      const text = (document.querySelector('.child-view') as HTMLElement).innerText;
      return [...text.matchAll(/\p{Extended_Pictographic}/gu)].map((m) => m[0]);
    });
    assert.deepEqual(emoji, [], 'no emoji anywhere on the child screen');
    assert.equal(await page.locator('.sign-tag, .sign-btn').count(), 0, 'no ASL tags (ASL was removed)');
    // Every tile has a picture and a readable label.
    const bare = await page.locator('.board-grid .tile').evaluateAll((els) => els.filter((e) => !e.querySelector('img, svg') || !e.querySelector('.tile-label')?.textContent?.trim()).length);
    assert.equal(bare, 0);
    await ctx.close();
  });
}

/* ---------------- Schedule editor on an 8" Android tablet, with the on-screen keyboard ---------------- */

/** Is the element fully on screen and actually the thing under its centre (not covered)? */
const reachable = (page: Page, testIdOrSelector: string) =>
  page.evaluate((sel) => {
    const el = (/^[\w-]+$/.test(sel) ? document.querySelector(`[data-testid="${sel}"]`) : document.querySelector(sel)) as HTMLElement | null;
    if (!el) return 'missing';
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight + 1 || r.right > window.innerWidth + 1) return `off-screen ${JSON.stringify([r.top, r.bottom, window.innerHeight])}`;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && (hit === el || el.contains(hit)) ? 'ok' : `covered by ${hit?.className}`;
  }, testIdOrSelector);

for (const [name, size, keyboard] of [
  ['onn landscape', { width: 960, height: 600 }, { width: 960, height: 300 }],
  ['onn portrait', { width: 600, height: 960 }, { width: 600, height: 560 }],
] as const) {
  test(`schedule editor on the ${name} tablet stays usable with the keyboard open`, async () => {
    const { ctx, page } = await openApp(size);
    await openMyDay(page);
    await page.getByRole('tab', { name: 'My Steps' }).click();
    await page.getByTestId('edit-schedule').click();
    await typePin(page, PIN);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await typePin(page, PIN);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByTestId('quick-more').click(); // quick editor → full editor
    await editor(page).waitFor();
    // Keyboard opens (Chrome on Android resizes the page to the space above it).
    await page.setViewportSize(keyboard);
    for (const field of ['Step 3 words', 'New template name']) {
      const input = editor(page).getByLabel(field);
      await input.click();
      await input.pressSequentially('ab');
      await page.waitForTimeout(700);
      const box = (await input.boundingBox())!;
      assert.ok(box.y >= 0 && box.y + box.height <= keyboard.height + 1, `${field} visible above the keyboard (${box.y})`);
    }
    await page.screenshot({ path: `${SHOTS}editor-keyboard-${name.replace(' ', '-')}.png` });
    for (const id of ['save-schedule', 'cancel-schedule', 'schedule-preview']) assert.equal(await reachable(page, id), 'ok', id);
    const overlap = await page.evaluate(() => {
      const p = document.querySelector('.se-preview')!.getBoundingClientRect();
      const f = document.querySelector('.se-form')!.getBoundingClientRect();
      const visibleForm = { top: Math.max(f.top, 0), bottom: Math.min(f.bottom, window.innerHeight) };
      return p.left < f.right - 1 && p.right > f.left + 1 && p.top < visibleForm.bottom - 1 && p.bottom > visibleForm.top + 1 && getComputedStyle(document.querySelector('.se-preview')!).position !== 'sticky';
    });
    assert.equal(overlap, false, 'preview and form never overlap');
    // Keyboard closes; picture selection works and its Cancel is reachable.
    await page.setViewportSize(size);
    await editor(page).getByTestId('step-1').getByRole('button', { name: /Change picture/ }).click();
    await page.getByTestId('picture-picker').getByTestId('picture-search').waitFor();
    assert.equal(await reachable(page, '[data-testid="picture-picker"] .modal-actions .btn'), 'ok', 'chooser Cancel reachable');
    await page.getByTestId('picture-picker').getByRole('button', { name: 'Cancel' }).click();
    await page.screenshot({ path: `${SHOTS}editor-${name.replace(' ', '-')}.png` });
    await ctx.close();
  });
}

/* ---------------- Saved schedules: full lifecycle for all three kinds ---------------- */

const KINDS = [
  { kind: 'First / Then', open: 'Edit First / Then', card: 'ft-first', words: 'FIRST words', speak: 'FIRST spoken words', child: /First \/ Then/, childCard: '.first-then .sched-card', spokenPrefix: 'First ' },
  { kind: 'reward', open: 'Edit reward', card: 'reward-item', words: 'Reward words', speak: 'Reward spoken words', child: /working for/, childCard: '.reward-goal', spokenPrefix: "I'm working for " },
  { kind: 'routine', open: 'Open routine builder', card: 'step-1', words: 'Step 1 words', speak: 'Step 1 spoken words', child: 'My Steps', childCard: '.steps .sched-card', spokenPrefix: '' },
] as const;

for (const k of KINDS) {
  test(`saved ${k.kind}: create, edit, duplicate, rename, switch, delete; Cancel discards, Save keeps`, async () => {
    const { ctx, page } = await openApp();
    await openScheduleEditor(page, k.open);
    const card = editor(page).getByTestId(k.card);
    // Edit the current one: words, voice, colour, symbol and a photo (shown before saving).
    await editor(page).getByLabel(k.words).fill('Blue swing');
    await editor(page).getByLabel(k.speak).fill('Swing time');
    await card.getByRole('button', { name: 'blue card' }).click();
    await pickPhoto(page, k.card);
    await card.locator('.card-picture img.tile-photo').waitFor(); // card editor shows the new photo before Save
    await preview(page).locator('img.tile-photo').first().waitFor(); // and so does the live preview
    await pickArasaac(page, k.card, 'swing');
    await card.locator(`.card-picture img.tile-symbol[src="https://api.arasaac.org/v1/pictograms/${pictoId('swing')}"]`).waitFor();
    // Save as template, duplicate, rename the copy.
    await editor(page).getByTestId('template-name').fill('Plan A');
    await editor(page).getByTestId('save-template').click();
    await editor(page).getByRole('button', { name: 'Duplicate Plan A' }).click();
    await editor(page).getByLabel('Name of Plan A copy').fill('Plan B');
    await editor(page).getByLabel('Name of Plan B').blur();
    // Change the current one, then switch back to Plan B: its picture, words, voice and colour come back.
    await editor(page).getByLabel(k.words).fill('Something else');
    await editor(page).locator('[data-template="Plan B"]').getByRole('button', { name: 'Use' }).click();
    assert.equal(await editor(page).getByLabel(k.words).inputValue(), 'Blue swing');
    assert.equal(await editor(page).getByLabel(k.speak).inputValue(), 'Swing time');
    await card.locator(`.card-picture.tile-blue img.tile-symbol[src="https://api.arasaac.org/v1/pictograms/${pictoId('swing')}"]`).waitFor();
    // Delete Plan A and save everything.
    await editor(page).getByRole('button', { name: 'Delete Plan A' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await saveSchedule(page);

    // Cancel throws away only the unsaved edits.
    await page.getByRole('button', { name: k.open }).click();
    await editor(page).getByLabel(k.words).fill('Not saved');
    await editor(page).getByTestId('template-name').fill('Plan C');
    await editor(page).getByTestId('save-template').click();
    await editor(page).getByTestId('cancel-schedule').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
    await page.getByRole('button', { name: k.open }).click();
    assert.equal(await editor(page).getByLabel(k.words).inputValue(), 'Blue swing', 'saved change kept');
    assert.equal(await editor(page).locator('[data-template="Plan C"]').count(), 0, 'unsaved template discarded');
    assert.equal(await editor(page).locator('[data-template="Plan A"]').count(), 0, 'deleted template stays deleted');
    await editor(page).locator('[data-template="Plan B"]').waitFor();
    await editor(page).getByTestId('cancel-schedule').click(); // nothing changed → closes straight away
    await editor(page).waitFor({ state: 'detached' });

    // The child sees and hears exactly that, and it all survives a reload.
    await page.getByRole('button', { name: /back to Talk/ }).click();
    await page.reload();
    await openMyDay(page);
    await page.getByRole('tab', { name: k.child }).click();
    const first = page.locator(k.childCard).first();
    await first.click();
    assert.equal((await spoken(page)).at(-1), `${k.spokenPrefix}Swing time`);
    await first.locator(`img.tile-symbol[src="https://api.arasaac.org/v1/pictograms/${pictoId('swing')}"]`).waitFor();
    if (k.kind !== 'reward') assert.match((await first.getAttribute('class')) ?? '', /tile-blue/);
    await ctx.close();
  });
}

test('switching saved boards resets progress as intended; earned tokens never disappear otherwise', async () => {
  const { ctx, page } = await openApp();
  await openMyDay(page);
  await page.getByRole('tab', { name: /working for/ }).click();
  await holdGrownup(page, 'Hold to add a token');
  await holdGrownup(page, 'Hold to add a token');
  await page.waitForFunction(() => document.querySelectorAll('.token-on').length === 2);
  // Editing the reward (not switching) keeps progress.
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-more').click(); // quick editor → full editor
  await editor(page).getByLabel('Goal').fill('Tidy toys');
  await editor(page).getByTestId('token-count').fill('4');
  await saveSchedule(page);
  assert.equal(await page.locator('.token-on').count(), 2, 'progress kept after editing');
  assert.equal(await page.locator('.token').count(), 4);
  // Choosing another saved board starts it fresh (the intended reset).
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-more').click(); // quick editor → full editor
  await editor(page).locator('[data-template="Working for music"]').getByRole('button', { name: 'Use' }).click();
  await saveSchedule(page);
  assert.equal(await page.locator('.token-on').count(), 0);
  await page.locator('[data-testid="tokens"][data-style="heart"]').waitFor();
  await page.locator('.reward-goal').getByText('Music').waitFor();
  await ctx.close();
});

test('layouts with completed steps: numbered, Now / Next / Later and one step at a time', async () => {
  const { ctx, page } = await openApp();
  await openMyDay(page);
  await page.getByRole('tab', { name: 'My Steps' }).click();
  await holdGrownup(page, 'Hold to mark this step done');
  await holdGrownup(page, 'Hold to mark this step done');
  await page.waitForFunction(() => document.querySelectorAll('.steps .sched-done').length === 2);
  assert.match((await page.locator('.steps .sched-current').textContent()) ?? '', /Go outside/, 'current step highlighted');
  assert.equal(await page.locator('.steps .sched-done .sched-check').count(), 2, 'done steps show a check');
  // Now / Next / Later on the last step: NEXT and LATER are empty placeholders.
  for (const [layout, tab] of [['layout-nowNextLater', 'My Steps'], ['layout-oneAtATime', 'My Steps']] as const) {
    await page.getByTestId('edit-schedule').click();
    await typePin(page, PIN);
    if (layout === 'layout-nowNextLater') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await typePin(page, PIN);
    }
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByTestId('quick-more').click(); // quick editor → full editor
    await editor(page).getByRole('tab', { name: 'Routine' }).click();
    await editor(page).getByTestId(layout).check();
    await saveSchedule(page);
    await page.getByRole('tab', { name: tab }).click();
    if (layout === 'layout-nowNextLater') {
      assert.match((await page.locator('.nnl-now').textContent()) ?? '', /Go outside/);
      assert.equal(await page.locator('.nnl-next.sched-empty').count(), 1);
      assert.equal(await page.locator('.nnl-later.sched-empty').count(), 1);
    } else {
      await page.getByTestId('one-step').getByText('STEP 3 OF 3').waitFor();
      assert.equal(await page.locator('.one-step-next').count(), 0, 'nothing comes after the last step');
    }
  }
  await holdGrownup(page, 'Hold to mark this step done');
  await page.getByText('All done! A grown-up can start again.').waitFor();
  await holdGrownup(page, 'Hold to start the steps again');
  await page.getByTestId('one-step').getByText('STEP 1 OF 3').waitFor();
  await ctx.close();
});

test('schedule editor releases every temporary photo URL (no memory leak)', async () => {
  const { ctx, page } = await openApp();
  await page.evaluate(() => {
    const w = window as unknown as { __urls: Set<string> };
    w.__urls = new Set();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource) => {
      const u = create(b);
      w.__urls.add(u);
      return u;
    };
    URL.revokeObjectURL = (u: string) => {
      w.__urls.delete(u);
      revoke(u);
    };
  });
  const live = () => page.evaluate(() => (window as unknown as { __urls: Set<string> }).__urls.size);
  await openScheduleEditor(page, 'Edit First / Then');
  await pickPhoto(page, 'ft-first');
  await pickPhoto(page, 'ft-first'); // replaces the first one
  await pickPhoto(page, 'ft-then');
  assert.ok((await live()) >= 2, 'previews are showing');
  await editor(page).getByTestId('cancel-schedule').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
  await editor(page).waitFor({ state: 'detached' });
  assert.equal(await live(), 0, 'all temporary URLs released after Cancel');
  // Save: only the two photos in use are stored (the replaced one is dropped), and the
  // editor's own temporary URLs are released (the app keeps one URL per stored photo).
  await page.getByRole('button', { name: 'Edit First / Then' }).click();
  await pickPhoto(page, 'ft-first');
  await pickPhoto(page, 'ft-first');
  await pickPhoto(page, 'ft-then');
  await saveSchedule(page);
  assert.equal(await live(), 2, 'one URL per stored photo, none left over from the editor');
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open('mimzi');
      r.onsuccess = () => res(r.result);
    });
    return new Promise<number>((res) => {
      const q = db.transaction('media').objectStore('media').count();
      q.onsuccess = () => res(q.result);
    });
  });
  assert.equal(stored, 2, 'replaced photo not stored');
  await ctx.close();
});

/* ---------------- Compact tablet layout: essential words and navigation ---------------- */

for (const [name, viewport] of [
  ['onn landscape', { width: 960, height: 600 }],
  ['onn portrait', { width: 600, height: 960 }],
] as const) {
  test(`compact ${name}: essential words always reachable; every page reachable from Home with Back/Home`, async () => {
    const { ctx, page } = await openApp(viewport);
    assert.equal(await page.locator('.category-bar').isVisible().catch(() => false), false, 'page list hidden on 8" tablets');
    for (const word of ['help', 'stop', 'no', 'more', 'all done']) {
      const t = page.locator(`.quick-bar .tile[aria-label="${word}"]`);
      const b = (await t.boundingBox())!;
      assert.ok(b && b.width >= 44 && b.height >= 44 && b.y + b.height <= viewport.height, `${word} quick word is on screen and big enough`);
    }
    for (const control of ['Speak message', 'Remove last word', 'Clear message']) {
      const b = await page.getByRole('button', { name: control }).boundingBox();
      assert.ok(b && b.y >= 0, `${control} visible`);
    }
    // Every folder on Home opens its page; Back returns to Home; quick words stay on every page.
    const folders: string[] = [];
    for (let p = 0; p < 3; p++) {
      folders.push(...(await page.locator('.board-grid .tile-folder').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id')!))));
      const next = page.getByRole('button', { name: 'Next page' });
      if (!(await next.isEnabled())) break;
      await next.click();
    }
    assert.equal(new Set(folders).size, 13, 'all 13 pages have a folder on Home');
    for (const id of folders) {
      const home = page.locator('.page-toolbar').getByRole('button', { name: 'Home' });
      if (await home.isEnabled()) await home.click();
      for (let p = 0; p < 3 && (await page.locator(`.board-grid [data-tile-id="${id}"]`).count()) === 0; p++) await page.getByRole('button', { name: 'Next page' }).click();
      await page.locator(`.board-grid [data-tile-id="${id}"]`).click();
      assert.notEqual(await page.getByTestId('page-title').textContent(), 'Home');
      assert.equal(await page.locator('.quick-bar .tile[aria-label="help"]').count(), 1, 'quick words on every page');
      await page.getByRole('button', { name: 'Back' }).click();
      await page.getByTestId('page-title').getByText('Home').waitFor();
    }
    await ctx.close();
  });
}


/* ---------------- Accessibility & reliability fixes (PR #2 review) ---------------- */

test('caregiver progress without a sustained hold: tap explains, editor Progress buttons work', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page); // sets the PIN
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openMyDay(page);
  await page.getByRole('button', { name: 'Hold to mark FIRST done' }).click(); // a quick tap
  await page.getByTestId('grownup-hint').getByText(/press and hold that button, or tap “Edit schedule”/).waitFor();
  assert.equal(await page.locator('.first-then .sched-done').count(), 0, 'a tap alone changes nothing');
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-more').click(); // quick editor → full editor
  await editor(page).getByTestId('progress-firstThen').getByRole('button', { name: /Mark FIRST done/ }).click();
  await editor(page).getByRole('tab', { name: 'I’m Working For' }).click();
  await editor(page).getByTestId('progress-reward').getByRole('button', { name: /Add token/ }).click();
  await editor(page).getByTestId('progress-reward').getByRole('button', { name: /Add token/ }).click();
  await editor(page).getByRole('tab', { name: 'Routine' }).click();
  await editor(page).getByTestId('progress-routine').getByRole('button', { name: /Mark current step done/ }).click();
  await saveSchedule(page);
  await page.locator('.first-then .sched-done').waitFor();
  await page.getByRole('tab', { name: /working for/ }).click();
  assert.equal(await page.locator('.token-on').count(), 2);
  await page.getByRole('tab', { name: 'My Steps' }).click();
  assert.equal(await page.locator('.steps .sched-done').count(), 1);
  // Reset without holding.
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-more').click(); // quick editor → full editor
  await editor(page).getByRole('tab', { name: 'I’m Working For' }).click();
  await editor(page).getByTestId('progress-reward').getByRole('button', { name: /Reset tokens/ }).click();
  await saveSchedule(page);
  await page.getByRole('tab', { name: /working for/ }).click();
  assert.equal(await page.locator('.token-on').count(), 0);
  await page.getByRole('button', { name: /reset tokens/i }).waitFor(); // child-screen control renamed
  await ctx.close();
});

test('speech: a silent engine is reported (with retry), an interruption is not', async () => {
  const { ctx, page } = await openApp();
  // One word first, so the engine counts as warmed up (the very first word may wait longer).
  await page.locator('.board-grid [data-tile-id="core-want"]').click();
  await page.waitForFunction(() => ((window as unknown as { __said?: string[] }).__said ?? []).length > 0);
  await speechMode(page, 'silent');
  await page.locator('.board-grid [data-tile-id="core-more"]').click();
  const fail = page.getByTestId('speech-fail');
  await fail.waitFor({ timeout: 14000 });
  assert.match((await fail.textContent()) ?? '', /couldn’t say “more”.*shown at the top/, 'honest failure; the word is in the message bar');
  await page.waitForTimeout(4000);
  assert.equal(await fail.count(), 1, 'the message stays until handled');
  await speechMode(page, 'ok');
  const before = (await spoken(page)).length;
  await fail.getByRole('button', { name: 'Try again' }).click();
  await fail.waitFor({ state: 'detached' });
  assert.equal((await spoken(page)).length, before + 1);
  assert.equal((await spoken(page)).at(-1), 'more');
  await speechMode(page, 'interrupt');
  await page.locator('.board-grid [data-tile-id="core-go"]').click();
  await page.waitForTimeout(5000);
  assert.equal(await page.getByTestId('speech-fail').count(), 0, 'interrupted on purpose is not a failure');
  await speechMode(page, 'error');
  await page.locator('.board-grid [data-tile-id="core-look"]').click();
  await page.getByTestId('speech-fail').getByText(/couldn’t say “look”/).waitFor();
  await ctx.close();
});

test('"Say it again" replays the same recording, pronunciation and language; a broken recording falls back to the voice', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Board & accessibility' }).click();
  await page.getByText('Show the sentence bar').click(); // single-word mode shows "Say it again"
  await page.getByRole('tab', { name: 'Mimzi Voice' }).click();
  await page.getByTestId('pron-word').selectOption('family-mama');
  await page.getByTestId('pron-text').fill('Mah-mah');
  await page.getByTestId('pron-save').click();
  await page.getByRole('tab', { name: 'Edit AAC board' }).click();
  await page.locator('.edit-word[aria-label="Edit go"]').click();
  await page.getByLabel('Voice language (optional)').fill('es-US');
  await page.getByRole('button', { name: /Record your voice/ }).click();
  await page.getByRole('button', { name: /Stop/ }).waitFor();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /Stop/ }).click();
  await page.locator('.recorder audio').waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  // Recording, replayed exactly.
  await page.locator('.board-grid [data-tile-id="core-go"]').click();
  assert.equal((await playedAudio(page)).length, 1);
  await page.getByRole('button', { name: 'Say it again' }).click();
  assert.equal((await playedAudio(page)).length, 2, 'replay uses the recording');
  // Recording can't play → the built-in voice says it, in the word's language.
  await page.evaluate(() => ((window as unknown as { __audioMode: string }).__audioMode = 'fail'));
  await page.getByRole('button', { name: 'Say it again' }).click();
  await page.waitForFunction(() => (window as unknown as { __spoken: string[] }).__spoken.at(-1) === 'go');
  assert.equal((await langsUsed(page)).at(-1), 'es-US');
  // Pronunciation override survives replay.
  await openFolder(page, 'family');
  await page.locator('.board-grid [data-tile-id="family-mama"]').click();
  await page.getByRole('button', { name: 'Say it again' }).click();
  const said = await spoken(page);
  assert.deepEqual(said.slice(-2), ['Mah-mah', 'Mah-mah']);
  assert.equal(await page.locator('.spoken-text').textContent(), 'Mama', 'shown as the label');
  await ctx.close();
});

test('My Day shows the phrase being said, and a failure with retry (no "top of the screen" claim)', async () => {
  const { ctx, page } = await openApp();
  await openMyDay(page);
  await page.locator('.first-then .sched-card').first().click();
  await page.getByTestId('myday-saying').getByText(/“First Brush teeth”/).waitFor();
  await speechMode(page, 'error');
  await page.getByRole('button', { name: 'Say it' }).click();
  const box = page.getByTestId('myday-saying');
  await box.getByText(/couldn’t say “First Brush teeth, then Play cars”/).waitFor();
  assert.doesNotMatch((await box.textContent()) ?? '', /top of the screen/);
  assert.equal(await page.getByTestId('speech-fail').count(), 0, 'shown in My Day, not as a second banner');
  await speechMode(page, 'ok');
  await box.getByRole('button', { name: 'Try again' }).click();
  await box.getByText(/Said: “First Brush teeth, then Play cars”/).waitFor();
  await ctx.close();
});

test('dialog focus: Edit schedule → PIN → editor → picture chooser / confirm; Escape closes only the top one; focus returns', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openMyDay(page);
  const opener = page.getByTestId('edit-schedule');
  await opener.focus();
  await page.keyboard.press('Enter');
  const inDialog = (sel: string) =>
    page.waitForFunction((s) => !!document.activeElement && !!document.querySelector(s)?.contains(document.activeElement), sel, { timeout: 2000 }).then(() => true, () => false);
  assert.ok(await inDialog('.pin-modal'), 'focus moves into the PIN dialog');
  for (let i = 0; i < 20; i++) await page.keyboard.press('Tab');
  assert.ok(await inDialog('.pin-modal'), 'Tab stays inside the PIN dialog');
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-more').click(); // quick editor → full editor
  await editor(page).waitFor();
  assert.ok(await inDialog('[data-testid="schedule-editor"]'), 'focus moves into the editor');
  for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+Tab');
  assert.ok(await inDialog('[data-testid="schedule-editor"]'), 'Shift+Tab stays inside the editor');
  // Picture chooser on top: Escape closes just the chooser.
  await editor(page).getByTestId('ft-first').getByRole('button', { name: /Change picture/ }).click();
  await page.getByTestId('picture-picker').waitFor();
  assert.ok(await inDialog('[data-testid="picture-picker"]'));
  await page.keyboard.press('Escape');
  await page.getByTestId('picture-picker').waitFor({ state: 'detached' });
  assert.equal(await editor(page).count(), 1, 'editor still open');
  // Unsaved change → Escape asks first; Escape on the question closes only the question.
  await editor(page).getByLabel('FIRST words').fill('Shoes');
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('alertdialog');
  await confirm.getByText('Discard your changes?').waitFor();
  assert.ok(await inDialog('[role="alertdialog"]'), 'focus moves into the confirmation');
  await page.keyboard.press('Escape');
  await confirm.waitFor({ state: 'detached' });
  assert.equal(await editor(page).getByLabel('FIRST words').inputValue(), 'Shoes', 'edits kept');
  await editor(page).getByTestId('save-schedule').click();
  await editor(page).waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'edit-schedule');
  await page.locator('.first-then').getByText('Shoes').waitFor();
  await ctx.close();
});

test('sentence bar for screen readers: readable message, short announcements, one Speak action', async () => {
  const { ctx, page } = await openApp();
  await page.locator('.board-grid [data-tile-id="core-i"]').click();
  await page.locator('.board-grid [data-tile-id="core-want"]').click();
  await page.getByTestId('message-text').getByText('Message: I want', { exact: true }).waitFor();
  await page.getByTestId('message-live').getByText('Added want', { exact: true }).waitFor();
  assert.equal(await page.locator('.sentence-bar').getByRole('button', { name: /speak|say/i }).count(), 1, 'one Speak action');
  const speak = page.getByRole('button', { name: 'Speak message' });
  assert.equal(await speak.getAttribute('aria-describedby'), 'message-text');
  await page.getByRole('button', { name: 'Remove last word' }).click();
  await page.getByTestId('message-live').getByText('Removed want', { exact: true }).waitFor();
  await page.locator('.sentence-words').click(); // the familiar tap on the pictures still speaks
  assert.equal((await spoken(page)).at(-1), 'I');
  await page.getByRole('button', { name: 'Clear message' }).click();
  await page.getByTestId('message-live').getByText('Message cleared', { exact: true }).waitFor();
  await page.getByTestId('message-text').getByText('Message is empty', { exact: true }).waitFor();
  await ctx.close();
});

test('compact screens: "Groups" opens the word-group list when enabled; hidden when the setting is off', async () => {
  const { ctx, page } = await openApp({ width: 600, height: 960 });
  const groups = page.getByTestId('groups-btn');
  await groups.click();
  const sheet = page.getByTestId('groups-sheet');
  await sheet.getByRole('button', { name: /Feelings/ }).click();
  await page.getByTestId('page-title').getByText('Feelings').waitFor();
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('page-title').getByText('Home').waitFor();
  await groups.click();
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  const onGroups = await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'groups-btn', null, { timeout: 2000 }).then(() => true, () => false);
  assert.ok(onGroups, 'focus back on Groups');
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Board & accessibility' }).click();
  await page.getByTestId('page-list-setting').selectOption('hide');
  await page.getByRole('button', { name: /back to Talk/ }).click();
  assert.equal(await page.getByTestId('groups-btn').count(), 0, 'off → no group list');
  await openFolder(page, 'feelings'); // folders still work
  await page.getByTestId('page-title').getByText('Feelings').waitFor();
  await ctx.close();
});

test('My Day tabs: arrow keys, one tab stop, labelled panels, stable "My Steps"', async () => {
  const { ctx, page } = await openApp();
  await openMyDay(page);
  const tabs = page.getByRole('tab');
  assert.deepEqual(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('tabindex'))), ['0', '-1', '-1'], 'one tab stop');
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'I’m working for');
  assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'My Steps');
  const panel = page.getByRole('tabpanel');
  assert.equal(await panel.getAttribute('aria-labelledby'), 'myday-tab-routine');
  await panel.getByTestId('routine-note').getByText(/Numbered: three steps · 3 steps/).waitFor();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'First / Then', 'wraps around');
  await ctx.close();
});

test('saved boards switch only on "Use board"; active board shown; routine templates keep "show upcoming"', async () => {
  const { ctx, page } = await openApp();
  await openScheduleEditor(page, 'Open routine builder');
  await editor(page).getByTestId('layout-oneAtATime').check();
  await editor(page).getByText('Show small pictures of the next steps').click(); // off for this routine
  await editor(page).getByLabel('Routine name').fill('Quiet');
  await editor(page).getByTestId('template-name').fill('Quiet');
  await editor(page).getByTestId('save-template').click();
  await saveSchedule(page);
  const vs = page.getByTestId('vs-routine');
  await vs.getByTestId('active-board').getByText('Quiet').waitFor();
  await vs.getByLabel('Choose saved Routine — Quiet').selectOption({ label: 'Morning Routine' });
  assert.match((await vs.getByTestId('active-board').textContent()) ?? '', /Quiet/, 'nothing switches on selection');
  await vs.getByText(/Switching starts it fresh/).waitFor();
  await vs.getByRole('button', { name: 'Use board' }).click();
  await page.getByTestId('vs-routine').getByTestId('active-board').getByText('Morning Routine').waitFor();
  // Older template (no saved setting) → keeps the current setting (off).
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openMyDay(page);
  await page.getByRole('tab', { name: 'My Steps' }).click();
  assert.equal(await page.locator('.one-step-next').count(), 0);
  // Back to Quiet via the editor: its own "off" is restored; a routine saved with "on" restores on.
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-more').click(); // quick editor → full editor
  await editor(page).getByText('Show small pictures of the next steps').click(); // on
  await editor(page).getByTestId('template-name').fill('Busy');
  await editor(page).getByTestId('save-template').click();
  await editor(page).locator('[data-template="Quiet"]').getByRole('button', { name: 'Use' }).click();
  assert.equal(await editor(page).getByText('Show small pictures of the next steps').locator('input').isChecked(), false);
  await editor(page).locator('[data-template="Busy"]').getByRole('button', { name: 'Use' }).click();
  assert.equal(await editor(page).getByText('Show small pictures of the next steps').locator('input').isChecked(), true);
  await editor(page).locator('[data-template="Busy"][data-active]').getByText('On screen').waitFor();
  await saveSchedule(page);
  await page.locator('.one-step-next').waitFor();
  await ctx.close();
});

/* ---------------- Viewport sweep: phones and compact tablet, normal and largest text ---------------- */

const SWEEP = [
  ['phone portrait', { width: 390, height: 844 }],
  ['phone landscape', { width: 844, height: 390 }],
  ['tablet portrait', { width: 600, height: 960 }],
  ['tablet landscape', { width: 960, height: 600 }],
] as const;

for (const [name, vp] of SWEEP) {
  test(`viewport sweep: ${name} (${vp.width}×${vp.height})`, async () => {
    const { ctx, page } = await openApp(vp);
    const problems: string[] = [];
    const check = async (where: string) => {
      const r = await page.evaluate(() => {
        const out: string[] = [];
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (document.documentElement.scrollWidth > vw + 1) out.push('page scrolls sideways');
        const onScreen = (el: Element) => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && b.top >= -1 && b.left >= -1 && b.bottom <= vh + 1 && b.right <= vw + 1;
        };
        for (const q of document.querySelectorAll('.quick-bar .tile')) {
          const b = q.getBoundingClientRect();
          if (!onScreen(q) || b.width < 44 || b.height < 44) out.push(`quick word ${q.getAttribute('aria-label')} ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
        for (const s of document.querySelectorAll('.board-grid .sign-btn')) {
          const b = s.getBoundingClientRect();
          if (b.width < 44 || b.height < 44) out.push(`ASL hit area ${Math.round(b.width)}×${Math.round(b.height)}`);
          const tag = s.querySelector('.sign-tag')!.getBoundingClientRect();
          const pic = s.closest('.tile-wrap')!.querySelector('.tile-media')!.getBoundingClientRect();
          if (tag.top < pic.bottom - 1 && tag.bottom > pic.top && tag.left < pic.right && tag.right > pic.left) out.push('ASL tag over picture');
        }
        for (const t of document.querySelectorAll('.board-grid .tile')) {
          const b = t.getBoundingClientRect();
          if (b.height < 44 || b.width < 44) out.push(`tile ${t.getAttribute('aria-label')} ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
        for (const sel of ['.nav-btn', '.page-toolbar button']) for (const el of document.querySelectorAll(sel)) if (getComputedStyle(el).display !== 'none' && !onScreen(el)) out.push(`${sel} off screen`);
        return out;
      });
      problems.push(...r.map((x) => `${where}: ${x}`));
    };
    for (const scale of [1, 1.6]) {
      if (scale !== 1) {
        await enterParentMode(page);
        await page.getByRole('tab', { name: 'Board & accessibility' }).click();
        await page.locator('input[type=range]').first().fill(String(scale));
        await page.getByRole('button', { name: /back to Talk/ }).click();
      }
      const tag = `text ${scale * 100}%`;
      await page.screenshot({ path: `${SHOTS}sweep-${vp.width}x${vp.height}-${scale}-home-early.png` });
      await page.locator('.board-grid [data-tile-id="core-want"] img.tile-symbol[data-library="arasaac"]').waitFor({ timeout: 20000 });
      await check(`${tag} Home`);
      await page.screenshot({ path: `${SHOTS}sweep-${vp.width}x${vp.height}-${scale}-home.png` });
      await openFolder(page, 'feelings');
      await check(`${tag} Feelings`);
      await page.getByRole('button', { name: 'Back' }).click();
      const groups = page.getByTestId('groups-btn');
      if (await groups.isVisible()) {
        await groups.click();
        await page.getByTestId('groups-sheet').getByRole('button', { name: /Food/ }).click();
        await page.getByTestId('page-title').getByText(/Food/).waitFor();
        await page.getByRole('button', { name: 'Home' }).click();
      }
      await openMyDay(page);
      for (const tab of [/First \/ Then/, /working for/, 'My Steps']) {
        await page.getByRole('tab', { name: tab }).click();
        const ok = await page.evaluate(() => [...document.querySelectorAll('.myday .sched-media, .myday .reward-goal .sched-media')].every((m) => m.getBoundingClientRect().height >= 36));
        if (!ok) problems.push(`${tag} My Day ${tab}: picture too small`);
        await check(`${tag} My Day ${tab}`);
      }
      await page.screenshot({ path: `${SHOTS}sweep-${vp.width}x${vp.height}-${scale}-myday.png` });
      await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Talk' }).click();
    }
    // Parent Mode and the schedule editor with a simulated on-screen keyboard (≈45% of the height).
    await enterParentMode(page, false);
    const tabsOk = await page.getByRole('tab', { name: 'Visual schedules' }).isVisible();
    if (!tabsOk) problems.push('Parent Mode: tabs not reachable');
    await page.getByRole('tab', { name: 'Visual schedules' }).click();
    await page.getByRole('button', { name: 'Edit First / Then' }).click();
    await editor(page).waitFor();
    await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) });
    const field = editor(page).getByLabel('THEN spoken words');
    await field.click();
    await page.waitForTimeout(700);
    const fb = (await field.boundingBox())!;
    if (fb.y < 0 || fb.y + fb.height > vp.height * 0.55 + 1) problems.push('keyboard: field hidden');
    for (const id of ['save-schedule', 'cancel-schedule']) {
      const r = await page.evaluate((i) => {
        const el = document.querySelector(`[data-testid="${i}"]`)!;
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return b.top >= 0 && b.bottom <= window.innerHeight && !!hit && el.contains(hit);
      }, id);
      if (!r) problems.push(`keyboard: ${id} not reachable`);
    }
    await page.screenshot({ path: `${SHOTS}sweep-${vp.width}x${vp.height}-keyboard.png` });
    await page.setViewportSize(vp);
    await editor(page).getByTestId('ft-then').getByRole('button', { name: /Change picture/ }).click();
    const chooserOk = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="picture-picker"]')!.getBoundingClientRect();
      const cancel = document.querySelector('[data-testid="picture-picker"] .modal-actions .btn') as HTMLElement;
      cancel.scrollIntoView({ block: 'nearest' });
      const b = cancel.getBoundingClientRect();
      return c.left >= 0 && c.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1;
    });
    if (!chooserOk) problems.push('picture chooser does not fit');
    await page.screenshot({ path: `${SHOTS}sweep-${vp.width}x${vp.height}-chooser.png` });
    assert.deepEqual(problems, [], problems.join('\n'));
    await ctx.close();
  });
}

test('Android app: speech uses the tablet engine when the web view has no browser speech', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  // Simulate the Capacitor web view: no speechSynthesis, a native TextToSpeech plugin.
  await ctx.addInitScript({
    content: `
      delete window.speechSynthesis; delete window.SpeechSynthesisUtterance;
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
      window.__native = [];
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: { TextToSpeech: {
          speak: (o) => { window.__native.push(o); return Promise.resolve(); },
          stop: () => Promise.resolve(),
        } },
      };
    `,
  });
  await mockSymbolServices(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForSelector('.board-grid .tile');
  await page.locator('.board-grid [data-tile-id="core-want"]').click();
  await page.waitForFunction(() => (window as unknown as { __native: unknown[] }).__native.length > 0);
  const calls = await page.evaluate(() => (window as unknown as { __native: { text: string; lang: string; rate: number }[] }).__native);
  assert.equal(calls[0].text.toLowerCase(), 'want');
  assert.match(calls[0].lang, /^en/);
  assert.ok(calls[0].rate > 0.5 && calls[0].rate <= 1.5);
  assert.equal(await page.getByTestId('speech-fail').count(), 0, 'no failure banner');
  // No service worker inside the app (its files are in the APK).
  const sw = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  assert.equal(sw, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ---------- First-tap speech (Android app and Chrome on Android) ---------- */

/** A Capacitor web view whose speech engine needs `readyAfterMs` to start, like the onn after launch. */
function nativeStub(readyAfterMs: number, failText = false) {
  return `
    delete window.speechSynthesis; delete window.SpeechSynthesisUtterance;
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    window.__native = []; window.__nativeSaid = []; window.__nativeStops = 0; window.__failText = ${failText};
    window.__notReadyUntil = Date.now() + ${readyAfterMs};
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: { TextToSpeech: {
        speak: (o) => {
          window.__native.push(o.text);
          if (Date.now() < window.__notReadyUntil) return Promise.reject(Object.assign(new Error('Not yet initialized or not available on this device.'), { code: 'UNAVAILABLE' }));
          if (window.__failText) return Promise.reject(new Error('Failed to read text.'));
          return new Promise((res) => setTimeout(() => { window.__nativeSaid.push(o.text); res(); }, 30));
        },
        stop: () => { window.__nativeStops++; return Promise.resolve(); },
      } },
    };
  `;
}

async function openNative(readyAfterMs: number, opts: { failText?: boolean; viewport?: { width: number; height: number } } = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 800 }, hasTouch: true });
  await ctx.addInitScript({ content: nativeStub(readyAfterMs, opts.failText) });
  await mockSymbolServices(ctx);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector('.board-grid .tile');
  return { ctx, page };
}
const nativeSaid = (page: Page) => page.evaluate(() => (window as unknown as { __nativeSaid: string[] }).__nativeSaid);

test('Android app: a tap while the speech engine is still starting is spoken once, when it is ready', async () => {
  const { ctx, page } = await openNative(2500); // engine ready 2.5 s after launch
  await page.locator('.board-grid [data-tile-id="core-all-done"]').click();
  await page.waitForFunction(() => (window as unknown as { __nativeSaid: string[] }).__nativeSaid.length > 0, null, { timeout: 8000 });
  await page.waitForTimeout(600);
  assert.deepEqual(await nativeSaid(page), ['all done'], 'spoken exactly once');
  assert.equal(await page.getByTestId('speech-fail').count(), 0, 'no failure message for a slow start');
  assert.equal(await page.evaluate(() => (window as unknown as { __nativeStops: number }).__nativeStops), 0, 'no stop() before speaking');
  await ctx.close();
});

test('Android app: rapid taps during start-up say only the newest word (interrupt setting)', async () => {
  const { ctx, page } = await openNative(2000);
  await page.locator('.board-grid [data-tile-id="core-want"]').click();
  await page.locator('.board-grid [data-tile-id="core-more"]').click();
  await page.locator('.board-grid [data-tile-id="core-stop"]').click();
  await page.waitForFunction(() => (window as unknown as { __nativeSaid: string[] }).__nativeSaid.length > 0, null, { timeout: 8000 });
  await page.waitForTimeout(900);
  assert.deepEqual(await nativeSaid(page), ['stop'], 'older words waiting for the engine are dropped, not played late');
  await ctx.close();
});

test('Android app: with “let it finish first”, words waiting for the engine play in order', async () => {
  const { ctx, page } = await openNative(1500);
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Mimzi Voice' }).click();
  await page.locator('select', { has: page.locator('option[value="finish"]') }).selectOption('finish');
  await page.getByRole('button', { name: /back to Talk/ }).click();
  // Simulate the engine still starting (as right after launch).
  await page.evaluate(() => ((window as unknown as { __notReadyUntil: number }).__notReadyUntil = Date.now() + 1500));
  await page.locator('.board-grid [data-tile-id="core-want"]').click();
  await page.locator('.board-grid [data-tile-id="core-more"]').click();
  await page.waitForFunction(() => (window as unknown as { __nativeSaid: string[] }).__nativeSaid.length >= 2, null, { timeout: 8000 });
  assert.deepEqual(await nativeSaid(page), ['want', 'more']);
  await ctx.close();
});

test('Android app: a real failure shows the words and “Try again”, which then speaks', async () => {
  const { ctx, page } = await openNative(0, { failText: true });
  await page.locator('.board-grid [data-tile-id="core-help"]').click();
  const fail = page.getByTestId('speech-fail');
  await fail.waitFor({ timeout: 5000 });
  assert.match((await fail.textContent()) ?? '', /couldn’t say “help”/);
  await page.evaluate(() => ((window as unknown as { __failText: boolean }).__failText = false));
  await fail.getByRole('button', { name: 'Try again' }).click();
  await page.waitForFunction(() => (window as unknown as { __nativeSaid: string[] }).__nativeSaid.length > 0);
  assert.deepEqual(await nativeSaid(page), ['help']);
  await page.waitForTimeout(200);
  assert.equal(await fail.count(), 0, 'message cleared once it spoke');
  await ctx.close();
});

test('Chrome on Android: no needless cancel before a word, and a word dropped after a cancel is recovered', async () => {
  const { ctx, page } = await openApp();
  await speechMode(page, 'android-chrome');
  // Engine idle: tapping must not cancel first (that is what dropped "All done").
  await page.locator('.board-grid [data-tile-id="core-all-done"]').click();
  await page.waitForFunction(() => ((window as unknown as { __said?: string[] }).__said ?? []).includes('all done'));
  assert.equal(await page.evaluate(() => (window as unknown as { __cancels?: number }).__cancels ?? 0), 0, 'no cancel when nothing is playing');
  // Now force a cancel right before a word: Mimzi waits for Chrome to settle, so nothing is dropped.
  await page.evaluate(() => {
    const w = window as unknown as { speechSynthesis: { speaking: boolean } };
    w.speechSynthesis.speaking = true; // pretend a word is still playing
  });
  await page.locator('.board-grid [data-tile-id="core-stop"]').click();
  await page.evaluate(() => ((window as unknown as { speechSynthesis: { speaking: boolean } }).speechSynthesis.speaking = false));
  await page.waitForFunction(() => ((window as unknown as { __said?: string[] }).__said ?? []).includes('stop'), null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => (window as unknown as { __dropped?: number }).__dropped ?? 0), 0, 'the word after a cancel is not dropped');
  assert.equal(await page.getByTestId('speech-fail').count(), 0);
  await ctx.close();
});

test('speech: if the chosen voice fails, the engine’s own voice says the word (no error)', async () => {
  const { ctx, page } = await openApp();
  await speechMode(page, 'voice-fail');
  await page.locator('.board-grid [data-tile-id="core-no"]').click();
  await page.waitForFunction(() => ((window as unknown as { __said?: string[] }).__said ?? []).includes('no'), null, { timeout: 5000 });
  const v = await voicesUsed(page);
  assert.ok(v.at(-2) !== null && v.at(-1) === null, 'first the chosen voice, then the default voice');
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId('speech-fail').count(), 0);
  await ctx.close();
});

test('speech: a cold engine that takes 6 s to start the first word is not reported as failed', async () => {
  const { ctx, page } = await openApp();
  await speechMode(page, 'slowstart');
  await page.locator('.board-grid [data-tile-id="core-help"]').click();
  await page.waitForFunction(() => ((window as unknown as { __said?: string[] }).__said ?? []).includes('help'), null, { timeout: 10000 });
  await page.waitForTimeout(400);
  assert.equal(await page.getByTestId('speech-fail').count(), 0);
  assert.equal((await spoken(page)).filter((w) => w === 'help').length, 1, 'asked once, said once');
  await ctx.close();
});

/* ---------- Compact tablet: everyday tasks with tap counts (portrait and landscape) ---------- */

const COMPACT = [
  { name: 'portrait', viewport: { width: 600, height: 960 } },
  { name: 'landscape', viewport: { width: 960, height: 600 } },
] as const;

/** Opens My Day's editor for the tab on screen: "Edit schedule" → PIN (first-time setup). */
async function unlockQuickEditor(page: Page) {
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByTestId('quick-editor').waitFor();
}
const messageText = (page: Page) => page.getByTestId('message-text').textContent();

for (const c of COMPACT) {
  test(`compact tablet ${c.name}: Stop / All done from My Day speak once and stay in place; core words in every My Day tool`, async () => {
    const { ctx, page } = await openApp(c.viewport);
    await openMyDay(page);
    for (const tab of ['First / Then', 'I’m working for', 'My Steps']) {
      await page.getByRole('tab', { name: tab }).click();
      for (const id of ['core-help', 'core-stop', 'core-no', 'core-more', 'core-all-done']) {
        const t = page.locator(`.quick-bar [data-tile-id="${id}"]`);
        assert.ok(await t.isVisible(), `${id} visible during ${tab}`);
        const b = (await t.boundingBox())!;
        assert.ok(b.width >= 44 && b.height >= 44, `${id} is easy to tap (${Math.round(b.width)}×${Math.round(b.height)})`);
      }
      assert.ok(await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Talk' }).isVisible(), 'Talk is one tap away');
    }
    const before = await page.locator('.quick-bar [data-tile-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id')));
    for (const id of ['core-stop', 'core-all-done']) {
      const n = (await spoken(page)).length;
      await page.locator(`.quick-bar [data-tile-id="${id}"]`).click();
      await page.waitForTimeout(400);
      const said = (await spoken(page)).slice(n);
      assert.deepEqual(said, [id === 'core-stop' ? 'stop' : 'all done'], 'one tap → spoken once');
    }
    assert.deepEqual(await page.locator('.quick-bar [data-tile-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id'))), before, 'Quick Words stay in place');
    await ctx.close();
  });

  test(`compact tablet ${c.name}: change only Then to Bubbles (≤ 3 taps after the PIN); First, its progress and Hugo’s message stay`, async () => {
    const { ctx, page } = await openApp(c.viewport);
    // Hugo is building a message, and FIRST is already done.
    await page.locator('.board-grid [data-tile-id="core-want"]').click();
    await page.locator('.quick-bar [data-tile-id="core-more"]').click();
    const msg = await messageText(page);
    await openMyDay(page);
    await holdGrownup(page, 'Hold to mark FIRST done');
    await page.locator('.first-then .sched-done').first().waitFor();
    await unlockQuickEditor(page);
    let taps = 0;
    const tap = async (l: ReturnType<Page['locator']>) => {
      await l.click();
      taps++;
    };
    await tap(page.locator('[data-quick-card="then"]'));
    await tap(page.getByTestId('quick-choices').locator('[data-quick-choice="Bubbles"]'));
    await tap(page.getByTestId('show-on-board'));
    await page.getByTestId('quick-editor').waitFor({ state: 'detached' });
    assert.ok(taps <= 3, `${taps} taps`);
    console.log(`  [tap count] ${c.name} — Then → Bubbles: ${taps} taps after the PIN`);
    // Back on First / Then (same tab), with Bubbles as THEN, FIRST unchanged and still done.
    await page.locator('.first-then').getByText('Bubbles').waitFor();
    assert.ok(await page.getByRole('tab', { name: 'First / Then' }).getAttribute('aria-selected'));
    assert.match((await page.locator('.first-then').textContent()) ?? '', /Brush teeth/);
    assert.equal(await page.locator('.first-then .sched-done').count(), 1, 'FIRST progress kept');
    assert.equal(await messageText(page), msg, 'Hugo’s message is intact');
    await page.screenshot({ path: `${SHOTS}quick-then-${c.name}.png` });
    await ctx.close();
  });

  test(`compact tablet ${c.name}: switch to a saved reward — the token change is shown before confirming (≤ 3 taps)`, async () => {
    const { ctx, page } = await openApp(c.viewport);
    await openMyDay(page);
    await page.getByRole('tab', { name: /working for/ }).click();
    await holdGrownup(page, 'Hold to add a token');
    await holdGrownup(page, 'Hold to add a token');
    await page.waitForFunction(() => document.querySelectorAll('.token-on').length === 2);
    await unlockQuickEditor(page);
    let taps = 0;
    const tap = async (l: ReturnType<Page['locator']>) => {
      await l.click();
      taps++;
    };
    await tap(page.locator('[data-quick-board="Working for outdoor play"]'));
    const note = page.getByTestId('switch-note');
    await note.waitFor();
    assert.match((await note.textContent()) ?? '', /2 tokens earned now will be cleared.*0 of 3/, 'says what happens to the tokens');
    assert.equal(await page.locator('.token-on').count(), 2, 'nothing changes before confirming');
    await page.screenshot({ path: `${SHOTS}quick-reward-${c.name}.png` });
    await tap(page.getByTestId('confirm-switch'));
    await page.getByTestId('quick-editor').waitFor({ state: 'detached' });
    assert.ok(taps <= 3, `${taps} taps`);
    console.log(`  [tap count] ${c.name} — switch to saved reward: ${taps} taps after the PIN`);
    await page.locator('.reward-goal').getByText('Outside').waitFor();
    assert.equal(await page.locator('.token').count(), 3);
    assert.equal(await page.locator('.token-on').count(), 0);
    await ctx.close();
  });

  test(`compact tablet ${c.name}: open the saved Bedtime routine without typing or More options (≤ 3 taps)`, async () => {
    const { ctx, page } = await openApp(c.viewport);
    await openMyDay(page);
    await page.getByRole('tab', { name: 'My Steps' }).click();
    await unlockQuickEditor(page);
    let taps = 0;
    const tap = async (l: ReturnType<Page['locator']>) => {
      await l.click();
      taps++;
    };
    await tap(page.locator('[data-quick-routine="Bedtime"]'));
    await tap(page.getByTestId('show-on-board'));
    await page.getByTestId('quick-editor').waitFor({ state: 'detached' });
    assert.ok(taps <= 3, `${taps} taps`);
    console.log(`  [tap count] ${c.name} — open Bedtime routine: ${taps} taps after the PIN`);
    await page.locator('.steps, [data-testid="one-step"], .nnl').first().getByText('Bath').waitFor();
    assert.equal(await page.getByRole('tab', { name: 'My Steps' }).getAttribute('aria-selected'), 'true', 'back on My Steps');
    await ctx.close();
  });
}

test('quick editor: Cancel returns to the same tab with the message intact; Bubbles can be found by searching without choosing a library', async () => {
  const { ctx, page } = await openApp({ width: 960, height: 600 });
  await page.locator('.board-grid [data-tile-id="core-want"]').click();
  const msg = await messageText(page);
  await openMyDay(page);
  await page.getByRole('tab', { name: 'My Steps' }).click();
  await unlockQuickEditor(page);
  await page.getByTestId('quick-cancel').click();
  await page.getByTestId('quick-editor').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('tab', { name: 'My Steps' }).getAttribute('aria-selected'), 'true');
  assert.equal(await messageText(page), msg);
  // Search inside the quick editor (no library choice needed).
  await page.getByTestId('edit-schedule').click();
  await typePin(page, PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.locator('[data-quick-card="1"]').click();
  await page.getByTestId('quick-search').click();
  const picker = page.getByTestId('quick-editor').getByTestId('picture-picker');
  assert.equal(await picker.getByTestId('library-filter').getAttribute('open'), null, 'library filter tucked away');
  await picker.getByTestId('picture-search').fill('bubbles');
  await picker.getByTestId('picture-results').locator('[data-symbol="arasaac:6945"]').click();
  await picker.getByTestId('use-picture').click();
  await page.getByTestId('show-on-board').click();
  await page.locator('.steps .sched-card, [data-testid="one-step"]').getByText('Bubbles').first().waitFor();
  // Bubbles is now a Recent picture in every picker.
  await enterParentMode(page, false);
  await page.locator('[data-change-picture="core-play"]').click();
  await page.getByTestId('picker-recent').locator('[data-symbol="arasaac:6945"]').waitFor();
  await ctx.close();
});

/* ---------- Auto layout, Manage words, Arrange words, picture edits ---------- */

const boardInfo = (page: Page) =>
  page.locator('.board-grid').first().evaluate((g) => {
    const tiles = [...g.querySelectorAll('.tile')].map((t) => t.getBoundingClientRect());
    return {
      rows: Number(g.getAttribute('data-rows')),
      cols: Number(g.getAttribute('data-cols')),
      page: Number(g.getAttribute('data-page')),
      ids: [...g.children].map((c) => c.getAttribute('data-tile-id')),
      minSide: Math.min(...tiles.map((r) => Math.min(r.width, r.height))),
    };
  });

test('auto layout: fits the compact tablet in both orientations with large tiles; rotating keeps the page, order, Quick Words and message', async () => {
  const { ctx, page } = await openApp({ width: 960, height: 600 });
  const land = await boardInfo(page);
  assert.ok(land.minSide >= 88, `landscape tiles ≥ 88 px (${Math.round(land.minSide)})`);
  // Go to page 2 of Home and start a message.
  await page.getByRole('button', { name: 'Next page' }).click();
  const p2 = await boardInfo(page);
  const firstOnScreen = p2.ids.find(Boolean)!;
  await page.locator(`.board-grid [data-tile-id="${firstOnScreen}"]`).click();
  const msg = await messageText(page);
  const quick = await page.locator('.quick-bar [data-tile-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id')));
  // Rotate.
  await page.setViewportSize({ width: 600, height: 960 });
  await page.waitForFunction((r) => Number(document.querySelector('.board-grid')?.getAttribute('data-rows')) !== r || true, land.rows);
  await page.waitForTimeout(300);
  const port = await boardInfo(page);
  assert.ok(port.minSide >= 88, `portrait tiles ≥ 88 px (${Math.round(port.minSide)})`);
  assert.ok(port.ids.includes(firstOnScreen), 'the same words are on screen after rotating');
  assert.equal(await messageText(page), msg, 'message kept');
  assert.deepEqual(await page.locator('.quick-bar [data-tile-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id'))), quick, 'Quick Words unchanged');
  // Relative order is the same in both layouts: read Home in order across all pages.
  const order = async () => {
    await page.getByRole('button', { name: 'Home' }).click().catch(() => undefined);
    const all: string[] = [];
    for (let i = 0; i < 6; i++) {
      all.push(...((await boardInfo(page)).ids.filter(Boolean) as string[]));
      const next = page.getByRole('button', { name: 'Next page' });
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
    }
    return all;
  };
  const portOrder = await order();
  await page.setViewportSize({ width: 960, height: 600 });
  await page.waitForTimeout(300);
  assert.deepEqual(await order(), portOrder, 'same relative order in both orientations');
  console.log(`  [auto layout] 960×600 → ${land.rows}×${land.cols} (${Math.round(land.minSide)} px); 600×960 → ${port.rows}×${port.cols} (${Math.round(port.minSide)} px)`);
  await ctx.close();
});

test('Manage words: visible count; swap a practice word into the selected slot — nothing else moves; hidden word keeps its picture and recording; Quick Words stay', async () => {
  const { ctx, page } = await openApp({ width: 960, height: 600 });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Talk' }).click();
  await openFolder(page, 'play');
  const playBefore = await slots(page);
  const quick = await page.locator('.quick-bar [data-tile-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id')));
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Manage words' }).click();
  await page.getByRole('tab', { name: 'Toys & Play', exact: true }).click();
  const count = page.getByTestId('wob-count');
  const visibleBefore = Number(((await count.textContent()) ?? '').match(/(\d+) words? visible/)![1]);
  // Swap "blocks" for the hidden "trampoline".
  const blocks = page.locator('[data-wob="play-blocks"]');
  const slot = await blocks.getAttribute('data-slot');
  await blocks.click();
  await page.getByTestId('wob-swap').click();
  await page.getByTestId('wob-swap-list').locator('[data-cand="play-trampoline"]').click();
  await page.getByTestId('wob-status').getByText(/“trampoline” is now in “blocks”’s spot/).waitFor();
  assert.equal(await page.locator('[data-wob="play-trampoline"]').getAttribute('data-slot'), slot, 'new word is in the selected slot');
  assert.match((await page.locator('[data-wob="play-blocks"]').getAttribute('aria-label')) ?? '', /hidden/, 'old word hidden, not deleted');
  assert.match((await count.textContent()) ?? '', new RegExp(`${visibleBefore} words? visible`), 'same number visible');
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openFolder(page, 'play');
  const playAfter = await slots(page);
  const changed = playBefore.map((id, i) => (id !== playAfter[i] ? i : -1)).filter((i) => i >= 0);
  assert.equal(changed.length, 1, 'only the selected spot changed');
  assert.equal(playAfter[changed[0]], 'play-trampoline');
  assert.deepEqual(await page.locator('.quick-bar [data-tile-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id'))), quick, 'Quick Words in their positions');
  await ctx.close();
});

for (const c of COMPACT) test(`pictures and Arrange words on a compact tablet (${c.name}): replace a picture (recording kept), swap two words, undo, save a move; survives rotation and reopening`, async () => {
  const { ctx, page } = await openApp(c.viewport);
  await enterParentMode(page);
  // Give "go" a recording first.
  await page.locator('.edit-word[aria-label="Edit go"]').click();
  await page.getByRole('button', { name: /Record your voice/ }).click();
  await page.getByRole('button', { name: /Stop/ }).waitFor();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Stop/ }).click();
  await page.locator('.recorder audio').waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-word[aria-label="Edit go"]').waitFor();
  // Tap the picture → picker → Use picture.
  await page.locator('[data-change-picture="core-go"]').click();
  await usePictureFromSearch(page, 'car', 'arasaac:2339');
  await page.getByTestId('picture-picker').waitFor({ state: 'detached' });
  // Arrange words: swap two words by dragging, undo, then move "go" into an empty spot and save.
  await page.getByTestId('arrange-words-btn').click();
  const aw = page.getByTestId('arrange-words');
  await aw.waitFor();
  const dragTo = async (from: string, toSel: string) => {
    const a = (await aw.locator(from).boundingBox())!;
    const b = (await aw.locator(toSel).boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 20, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    assert.equal(await aw.locator(`${toSel}.arrange-target`).count(), 1, 'destination highlighted before dropping');
    await page.mouse.up();
  };
  const slotOf = (id: string) => aw.locator(`[data-arrange-tile="${id}"]`).getAttribute('data-arrange-slot');
  const goSlot = await slotOf('core-go');
  const nextSlot = String(Number(goSlot) + 1); // the word right after "go"
  const neighbour = await aw.locator(`[data-arrange-slot="${nextSlot}"]`).getAttribute('data-arrange-tile');
  assert.ok(neighbour, 'a word sits next to "go"');
  await dragTo('[data-arrange-tile="core-go"]', `[data-arrange-tile="${neighbour}"]`);
  assert.equal(await slotOf('core-go'), nextSlot, 'swapped');
  assert.equal(await slotOf(neighbour!), goSlot);
  await aw.getByTestId('arrange-undo').click();
  assert.equal(await slotOf('core-go'), goSlot, 'undo puts them back');
  // Tap-then-tap: "go" to an empty spot (moves only "go").
  const empty = aw.locator('.arrange-empty').first();
  const emptySlot = await empty.getAttribute('data-arrange-slot');
  await aw.locator('[data-arrange-tile="core-go"]').click();
  await empty.click();
  assert.equal(await slotOf('core-go'), emptySlot);
  await aw.getByTestId('arrange-save').click();
  await aw.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: /back to Talk/ }).click();
  // On Talk: tapping still speaks — the recording, not text-to-speech.
  const findGo = async () => {
    await page.getByRole('button', { name: 'Home' }).click().catch(() => undefined);
    for (let i = 0; i < 5 && !(await page.locator('.board-grid [data-tile-id="core-go"]').count()); i++) await page.getByRole('button', { name: 'Next page' }).click();
    return page.locator('.board-grid [data-tile-id="core-go"]');
  };
  const goTile = await findGo();
  assert.equal(await goTile.locator('img.tile-symbol').getAttribute('src'), 'https://api.arasaac.org/v1/pictograms/2339', 'new picture');
  const played = (await playedAudio(page)).length;
  await goTile.click();
  await page.waitForTimeout(300);
  assert.equal((await playedAudio(page)).length, played + 1, 'original recording still plays');
  assert.equal(await goTile.locator('.tile-label').textContent(), 'go', 'word unchanged');
  // Saved arrangement: same order after rotating and after reopening Mimzi.
  const homeOrder = async () => {
    await page.getByRole('button', { name: 'Home' }).click().catch(() => undefined);
    const all: (string | null)[] = [];
    for (let i = 0; i < 6; i++) {
      all.push(...(await boardInfo(page)).ids);
      const next = page.getByRole('button', { name: 'Next page' });
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
    }
    return all.filter(Boolean);
  };
  const saved = await homeOrder();
  await page.setViewportSize({ width: c.viewport.height, height: c.viewport.width }); // rotate
  await page.waitForTimeout(300);
  assert.deepEqual(await homeOrder(), saved, 'same order after rotating');
  await page.reload();
  await page.waitForSelector('.board-grid .tile');
  assert.deepEqual(await homeOrder(), saved, 'same order after reopening');
  await ctx.close();
});
