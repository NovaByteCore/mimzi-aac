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
const SHOTS = fileURLToPath(new URL('../../test-results/', import.meta.url));
const IPAD = { width: 1180, height: 820 };
const GALAXY = { width: 412, height: 915 };
const PIN = '1357';

let browser: Browser;

before(async () => {
  browser = await chromium.launch();
  await mkdir(SHOTS, { recursive: true });
});
after(async () => {
  await browser?.close();
});

// Plain string so the test runner's transpiler can't inject helpers into browser code.
const speechStub = `
  window.__spoken = [];
  const synth = {
    speaking: false, paused: false, pending: false,
    getVoices: () => [],
    speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(new Event('end')), 5); },
    cancel() {}, resume() {}, addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
`;

async function openApp(viewport = IPAD): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, hasTouch: true, acceptDownloads: true });
  await ctx.addInitScript({ content: speechStub });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto(BASE);
  await page.waitForSelector('.board-grid .tile');
  return { ctx, page };
}

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

async function holdParentButton(page: Page) {
  const box = (await page.locator('.nav-parent').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1800);
  await page.mouse.up();
}

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
  assert.equal(await page.locator('.board-grid > *').count(), 9, 'default 3 × 3 grid');
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
  await page.getByRole('button', { name: 'Play', exact: true }).click();
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
  await page.getByRole('tab', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: '+ Add picture' }).click();
  assert.equal(await page.getByTestId('camera-input').getAttribute('capture'), 'environment', 'camera button opens the camera');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await addPhotoTile(page, 'Red ball', 'Play');
  await page.getByRole('button', { name: /back to Talk/ }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Next page' }).click();
  const tile = page.locator('.board-grid .tile[aria-label="Red ball"]');
  await tile.click();
  assert.equal((await spoken(page)).at(-1), 'Red ball');

  await page.reload();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
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
  await page.getByRole('tab', { name: 'Words & pictures' }).click();
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
  await page.getByRole('tab', { name: 'Board & speech' }).click();
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
  await addPhotoTile(first.page, 'Grandma Jo', 'My People');
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
  await first.ctx.close();

  const second = await openApp();
  await enterParentMode(second.page);
  await second.page.getByRole('tab', { name: 'Backup' }).click();
  await second.page.getByTestId('restore-input').setInputFiles(file);
  await second.page.getByRole('alertdialog').getByRole('button', { name: 'Restore backup' }).click();
  await second.page.getByText('Backup restored.').waitFor();
  await second.page.getByRole('button', { name: /back to Talk/ }).click();
  await second.page.getByRole('button', { name: 'My People', exact: true }).first().click();
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
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `page scrolls sideways by ${overflow}px`);
    for (const sel of ['.board-grid', '.quick-bar', '.main-nav', '.top-bar']) {
      const box = (await page.locator(sel).boundingBox())!;
      assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1, `${sel} is off screen`);
    }
    const tile = (await page.locator('.board-grid .tile').first().boundingBox())!;
    assert.ok(tile.width >= 88 && tile.height >= 88, `tiles too small: ${tile.width}×${tile.height}`);
    await page.screenshot({ path: `${SHOTS}${name}.png` });
    await ctx.close();
  });
}
