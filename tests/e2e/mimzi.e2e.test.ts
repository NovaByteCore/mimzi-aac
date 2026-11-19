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
  window.__spoken = [];
  window.__voices = [];
  window.__rates = [];
  window.__pitches = [];
  const fakeVoices = __FAKE_VOICES__;
  const synth = {
    speaking: false, paused: false, pending: false,
    getVoices: () => fakeVoices,
    speak(u) { window.__spoken.push(u.text); window.__voices.push(u.voice ? u.voice.voiceURI : null); window.__rates.push(u.rate); window.__pitches.push(u.pitch); setTimeout(() => u.onend && u.onend(new Event('end')), 5); },
    cancel() {}, resume() {}, addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  // The real utterance only accepts real SpeechSynthesisVoice objects; the fake voices need a plain one.
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; this.lang = ''; } };
`;
const stubWith = (voices: object[]) => speechStubTemplate.replace('__FAKE_VOICES__', JSON.stringify(voices));
const defaultStub = speechStubTemplate.replace('__FAKE_VOICES__', JSON.stringify(DEFAULT_VOICES));


async function openApp(viewport = IPAD, voices: object[] = DEFAULT_VOICES): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, hasTouch: true, acceptDownloads: true, permissions: ['microphone'] });
  await ctx.addInitScript({ content: stubWith(voices) });
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
  await page.locator(`.board-grid [data-tile-id="core-folder-${page_id}"]`).click();
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
  await page.locator(`.edit-tile[aria-label="Edit ${label}"] img.tile-photo`).waitFor();
}

test('opens straight to the Talk board — no login, quick words always there', async () => {
  const { ctx, page } = await openApp();
  assert.equal(await page.getByRole('dialog').count(), 0);
  const quick = await page.locator('.quick-bar .tile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(quick, ['help', 'stop', 'no', 'more', 'all done']);
  assert.equal(await page.locator('.board-grid > *').count(), 24, 'default 4 × 6 grid on a tablet');
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

test('Parent Mode needs a long press and the PIN', async () => {
  const { ctx, page } = await openApp();
  await page.locator('.nav-parent').click(); // quick tap
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole('dialog').count(), 0, 'a quick tap must not open Parent Mode');
  await enterParentMode(page, true);
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
  await page.getByRole('button', { name: 'Next page' }).click();
  const tile = page.locator('.board-grid .tile[aria-label="Red ball"]');
  await tile.click();
  assert.equal((await spoken(page)).at(-1), 'Red ball');

  await page.reload();
  await page.locator('.board-grid [data-tile-id="core-folder-play"]').click();
  await page.getByRole('button', { name: 'Next page' }).click();
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
  await page.locator('.edit-tile[aria-label="Edit look"]').click();
  await page.getByLabel('Word on the tile').fill('peek');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-tile[aria-label="Edit peek"]').waitFor();
  // Reorder: move "want" earlier, before "I"
  await page.getByRole('button', { name: 'Move want earlier' }).click();
  await page.waitForFunction(() => document.querySelector('.edit-tile')?.getAttribute('aria-label') === 'Edit want', null, { timeout: 3000 });
  const firstTwo = await page.locator('.edit-tile').evaluateAll((els) => els.slice(0, 2).map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(firstTwo, ['Edit want', 'Edit I']);
  // Delete with confirmation, then restore
  await page.locator('.edit-tile[aria-label="Edit peek"]').click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.edit-tile[aria-label="Edit peek"]').waitFor({ state: 'detached' });
  await page.getByRole('tab', { name: /Recently deleted/ }).click();
  await page.locator('[data-deleted-tile="core-look"]').getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('tab', { name: 'Edit AAC board' }).click();
  await page.locator('.edit-tile[aria-label="Edit peek"]').waitFor();
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
  await page.locator('.edit-tile[aria-label="Edit go"]').click();
  await page.getByRole('button', { name: /Record your voice/ }).click();
  await page.getByRole('button', { name: /Stop/ }).waitFor();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Stop/ }).click();
  await page.locator('.recorder audio').waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-tile[aria-label="Edit go"]').waitFor();
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

test('ASL sign video: only plays after tapping See sign', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.locator('.edit-tile[aria-label="Edit more"]').click();
  await page.getByTestId('sign-input').setInputFiles(SIGN);
  await page.getByTestId('sign-preview').waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-tile[aria-label="Edit more"]').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  assert.equal(await page.locator('video').count(), 0, 'no sign video on the board');
  assert.ok(await page.getByRole('button', { name: 'See sign for more' }).count() >= 1);
  await page.locator('.board-grid').getByRole('button', { name: 'See sign for more' }).click().catch(() => undefined);
  const video = page.getByRole('dialog', { name: 'Sign for more' }).locator('video');
  await video.waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector('.sign-modal video') as HTMLVideoElement | null;
    return !!v && v.currentTime > 0;
  });
  await page.getByRole('button', { name: /Close/ }).click();
  assert.equal(await page.locator('video').count(), 0);
  // Tapping the tile itself still just speaks
  await page.locator('.board-grid [data-tile-id="core-more"]').click();
  assert.equal((await spoken(page)).at(-1), 'more');
  await ctx.close();
});

test('quick words can be changed by a caregiver', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Board & accessibility' }).click();
  await page.getByTestId('quick-add-select').selectOption('core-yes');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByTestId('quick-list').getByText('yes').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  const quick = await page.locator('.quick-bar .tile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(quick, ['help', 'stop', 'no', 'more', 'all done', 'yes']);
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
  await holdGrownup(page, 'Hold to start a new board');
  await page.waitForFunction(() => document.querySelectorAll('.token-on').length === 0);
  await ctx.close();
});

test('routine: parent edits steps and switches to Now / Next / Later (same data)', async () => {
  const { ctx, page } = await openApp();
  await openMyDay(page);
  await page.getByRole('tab', { name: /three steps/ }).click();
  assert.equal(await page.locator('.steps .sched-card').count(), 3);
  await holdGrownup(page, 'Hold to mark this step done');
  await page.locator('.steps .sched-done').waitFor();

  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Visual schedules' }).click();
  await page.getByTestId('step-2').getByLabel('Step 2 words').fill('Shoes on');
  await page.getByLabel(/Now \/ Next \/ Later/).check();
  await page.getByRole('button', { name: 'Save My Day' }).click();
  await page.getByText('Saved.').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();

  await openMyDay(page);
  await page.getByRole('tab', { name: /Now \/ Next \/ Later/ }).click();
  assert.match((await page.locator('.nnl-now').textContent()) ?? '', /Shoes on/, 'step 1 is done, so NOW is step 2');
  assert.match((await page.locator('.nnl-next').textContent()) ?? '', /Go outside/);
  await holdGrownup(page, 'Hold to mark this step done');
  await page.waitForFunction(() => /Go outside/.test(document.querySelector('.nnl-now')?.textContent ?? ''));
  await ctx.close();
});

test('My Day templates can be saved and reused', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Visual schedules' }).click();
  await page.getByTestId('ft-first').getByLabel('FIRST words').fill('Bath');
  await page.locator('.template-row').first().getByPlaceholder('e.g. Bedtime').fill('Bath time');
  await page.getByRole('button', { name: 'Save for later' }).first().click();
  await page.getByRole('button', { name: 'Use “Bath time”' }).waitFor();
  await page.getByTestId('ft-first').getByLabel('FIRST words').fill('Something else');
  await page.getByRole('button', { name: 'Use “Bath time”' }).click();
  await page.getByText('Using “Bath time”.').waitFor();
  assert.equal(await page.getByTestId('ft-first').getByLabel('FIRST words').inputValue(), 'Bath');
  await ctx.close();
});

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
  await page.getByRole('tab', { name: 'Words on My Board' }).click();
  await page.getByRole('tab', { name: 'Food & Drinks', exact: true }).click();
  await page.locator('[data-wob="food-banana"]').click();
  await page.getByRole('tab', { name: 'Edit AAC board' }).click();
  await page.getByRole('tab', { name: 'Food & Drinks', exact: true }).click();
  await page.getByRole('button', { name: '+ Add picture' }).click();
  await page.getByLabel('Word on the tile').fill('Blueberries');
  await page.getByLabel(/Private note/).fill('only cut in half');
  await page.getByText(/Mimzi never suggests foods/).waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-tile[aria-label="Edit Blueberries"]').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await openFolder(page, 'food');
  await page.locator('.board-grid [data-tile-id="food-banana"]').waitFor();
  await (await findTile(page, '.tile[aria-label="Blueberries"]')).click();
  assert.equal((await spoken(page)).at(-1), 'Blueberries');
  assert.equal(await page.getByText('only cut in half').count(), 0, 'private note never shown to the child');
  await ctx.close();
});

test('Parent Mode shows that sync is off and data stays on this device', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  assert.match((await page.getByTestId('sync-status').textContent()) ?? '', /This device only/);
  const external = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => !u.startsWith(location.origin) && !u.startsWith('blob:') && !u.startsWith('data:')),
  );
  assert.deepEqual(external, [], 'no requests leave the app’s own address');
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
  await galaxy.page.locator('.edit-tile[aria-label="Edit Rex"]').click();
  await galaxy.page.getByRole('button', { name: 'Delete', exact: true }).click();
  await galaxy.page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await galaxy.page.locator('.edit-tile[aria-label="Edit Rex"]').waitFor({ state: 'detached' });
  await galaxy.page.getByRole('tab', { name: 'Google & sync' }).click();
  await galaxy.page.getByRole('button', { name: /Sync now/ }).click();
  await galaxy.page.getByRole('button', { name: /Sync now/ }).waitFor();

  await ipad.page.getByRole('button', { name: /Sync now/ }).click();
  await ipad.page.getByRole('button', { name: /Sync now/ }).waitFor();
  await ipad.page.getByRole('tab', { name: 'Edit AAC board' }).click();
  await ipad.page.getByRole('tab', { name: 'People', exact: true }).click();
  await ipad.page.locator('.edit-tile[aria-label="Edit Rex"]').waitFor({ state: 'detached' });
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
  await page.locator('.edit-tile[aria-label="Edit Blue ball"] img.tile-photo').waitFor();
  await ctx.close();
});

/* ---------------- V3 acceptance tests ---------------- */

test('V3-1/2/9: More speaks with the built-in voice; full sentence; Help speaks and shows its ASL sign separately', async () => {
  const { ctx, page } = await openApp();
  await page.locator('.board-grid [data-tile-id="core-more"]').click();
  assert.equal((await spoken(page)).at(-1), 'more');
  assert.equal(await page.locator('.board-grid [data-tile-id="core-more"] img.tile-symbol').count(), 1, 'button shows an AAC symbol');
  await page.locator('.board-grid [data-tile-id="core-help"]').click();
  assert.equal((await spoken(page)).at(-1), 'help');
  const before = (await spoken(page)).length;
  await page.locator('.board-grid').getByRole('button', { name: 'See sign for help' }).click();
  await page.getByTestId('sign-drawing').waitFor();
  assert.equal((await spoken(page)).length, before, 'See sign never speaks over the AAC voice');
  await page.getByRole('button', { name: /Close/ }).click();
  await ctx.close();
});

test('V3-3: a brand-new word speaks automatically — no recording', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Toys & Play', exact: true }).click();
  await page.getByRole('button', { name: '+ Add picture' }).click();
  await page.getByLabel('Word on the tile').fill('Trampoline');
  await page.getByTestId('symbol-search').fill('trampoline');
  await page.locator('[data-symbol="trampoline"]').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-tile[aria-label="Edit Trampoline"]').waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await page.locator('.board-grid [data-tile-id="core-folder-play"]').click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.locator('.board-grid .tile[aria-label="Trampoline"]').click();
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

test('V3-5: Words on My Board — six words, in their own places', async () => {
  const { ctx, page } = await openApp();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Words on My Board' }).click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: /Show the first 6 by position/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Hide' }).click(); // "no" and "break" are important words
  await page.getByTestId('wob-count').getByText(/Showing 6 of/).waitFor();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  const cells = await page.locator('.board-grid > *').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id') ?? e.querySelector('[data-tile-id]')?.getAttribute('data-tile-id') ?? null));
  assert.deepEqual(cells.slice(0, 6), ['core-i', 'core-want', 'core-more', 'core-help', 'core-stop', 'core-all-done']);
  assert.ok(cells.slice(6).every((c) => c === null), 'other slots are empty, nothing moved up');
  await ctx.close();
});

test('V3-7: hide and restore a word — same spot, picture and speech', async () => {
  const { ctx, page } = await openApp();
  const slotOf = () => page.locator('.board-grid > *').evaluateAll((els) => els.findIndex((e) => (e.getAttribute('data-tile-id') ?? e.querySelector('[data-tile-id]')?.getAttribute('data-tile-id')) === 'core-look'));
  const before = await slotOf();
  await enterParentMode(page);
  await page.getByRole('tab', { name: 'Words on My Board' }).click();
  await page.locator('[data-wob="core-look"]').click();
  await page.getByRole('button', { name: /back to Talk/ }).click();
  assert.equal(await slotOf(), -1);
  assert.equal(await page.locator('.board-grid > *').count(), 24, 'its slot is kept empty');
  await enterParentMode(page, false);
  await page.getByRole('tab', { name: 'Words on My Board' }).click();
  await page.locator('[data-wob="core-look"]').click();
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
  await page.locator('.edit-tile[aria-label="Edit drink"]').click();
  await page.getByTestId('photo-input').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.edit-tile[aria-label="Edit drink"] img.tile-photo').waitFor();
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
  await page.locator('[data-voice="com.apple.voice.enhanced.en-US.Ava"]').getByText('★ Most natural').waitFor();
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
  await page.locator('.edit-tile[aria-label="Edit Slide"]').waitFor();
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
