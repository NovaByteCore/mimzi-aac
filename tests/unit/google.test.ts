import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSync, toRecords, fromRecords, STATE_FILE, type SyncableState } from '../../src/lib/google/driveSync.ts';
import type { DriveClient, DriveFile } from '../../src/lib/google/drive.ts';
import { handlePhotoProxy, isAllowedPhotoUrl } from '../../server/photoProxy.ts';
import { pickFromGooglePhotos } from '../../src/lib/google/photosPicker.ts';
import { buildSeedCategories, buildSeedTiles } from '../../src/data/vocabulary.ts';
import { defaultMyDay, defaultSettings } from '../../src/lib/defaults.ts';
import type { MediaRecord } from '../../src/types.ts';

/** In-memory stand-in for the Drive appDataFolder. */
function fakeDrive() {
  const files = new Map<string, DriveFile & { blob: Blob }>();
  let n = 0;
  const client: DriveClient = {
    async list() {
      return [...files.values()].map(({ blob: _b, ...f }) => f);
    },
    async download(id) {
      return files.get(id)!.blob;
    },
    async create(name, blob, appProperties) {
      const id = `f${++n}`;
      files.set(id, { id, name, appProperties, blob });
      return id;
    },
    async update(id, blob) {
      files.get(id)!.blob = blob;
    },
    async remove(id) {
      files.delete(id);
    },
  };
  return { client, files };
}

const fresh = (): SyncableState => ({
  tiles: buildSeedTiles(),
  categories: buildSeedCategories(),
  observations: [],
  settings: defaultSettings(),
  myDay: defaultMyDay(),
  stamps: { settings: 0, myday: 0 },
  tombstones: [],
});

/** A device = its state + its media. */
function device(id: string) {
  const media = new Map<string, MediaRecord>();
  let state = fresh();
  return {
    id,
    media,
    get state() {
      return state;
    },
    set state(s) {
      state = s;
    },
    async sync(drive: DriveClient) {
      const r = await runSync({
        local: state,
        deviceId: id,
        drive,
        localMediaIds: new Set(media.keys()),
        readLocalMedia: async (m) => media.get(m),
      });
      state = r.state;
      for (const m of r.downloaded) media.set(m.id, m);
      return r;
    },
  };
}

test('sync: a new device signs in and gets everything, including photos', async () => {
  const { client, files } = fakeDrive();
  const ipad = device('ipad');
  const photo: MediaRecord = { id: 'photo-1', kind: 'photo', mime: 'image/jpeg', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), createdAt: 1 };
  ipad.media.set(photo.id, photo);
  ipad.state = {
    ...ipad.state,
    tiles: [...ipad.state.tiles, { id: 'tile-dog', label: 'Rex', speak: 'Rex', categoryId: 'family', order: 7, color: 'sage', favorite: true, hidden: false, builtIn: false, photoId: 'photo-1', updatedAt: 100 }],
    settings: { ...ipad.state.settings, grid: { rows: 2, cols: 3 }, pin: { hash: 'ipad-pin', salt: 's', algo: 'pbkdf2' }, voiceURI: 'Samantha' },
    stamps: { settings: 100, myday: 0 },
  };
  const up = await ipad.sync(client);
  assert.equal(up.uploaded, 1);
  assert.ok([...files.values()].some((f) => f.name === STATE_FILE));
  assert.ok([...files.values()].some((f) => f.name === 'media-photo-1'));

  const galaxy = device('galaxy');
  galaxy.state = { ...galaxy.state, settings: { ...galaxy.state.settings, pin: { hash: 'galaxy-pin', salt: 's', algo: 'pbkdf2' } } };
  const down = await galaxy.sync(client);
  assert.equal(down.downloaded.length, 1);
  assert.deepEqual(new Uint8Array(await galaxy.media.get('photo-1')!.blob.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.equal(galaxy.state.tiles.find((t) => t.id === 'tile-dog')?.label, 'Rex');
  assert.deepEqual(galaxy.state.settings.grid, { rows: 2, cols: 3 }, 'shared settings come across');
  assert.equal(galaxy.state.settings.pin?.hash, 'galaxy-pin', 'each device keeps its own PIN');
  assert.equal(galaxy.state.settings.voiceURI, undefined, 'voice choice is per device');
  assert.equal(galaxy.state.tiles.length, ipad.state.tiles.length);
});

test('sync: newest edit wins per word; deletes spread; edits on both devices merge', async () => {
  const { client } = fakeDrive();
  const a = device('a');
  const b = device('b');
  await a.sync(client);
  await b.sync(client);

  // a renames "look", b renames "go" — different words, both survive
  a.state = { ...a.state, tiles: a.state.tiles.map((t) => (t.id === 'core-look' ? { ...t, label: 'peek', updatedAt: 200 } : t)) };
  b.state = { ...b.state, tiles: b.state.tiles.map((t) => (t.id === 'core-go' ? { ...t, label: 'let’s go', updatedAt: 210 } : t)) };
  // same word edited on both: later one wins
  a.state = { ...a.state, tiles: a.state.tiles.map((t) => (t.id === 'core-wait' ? { ...t, label: 'wait A', updatedAt: 300 } : t)) };
  b.state = { ...b.state, tiles: b.state.tiles.map((t) => (t.id === 'core-wait' ? { ...t, label: 'wait B', updatedAt: 310 } : t)) };
  // b permanently deletes a word
  b.state = { ...b.state, tiles: b.state.tiles.filter((t) => t.id !== 'body-teeth'), tombstones: [{ store: 'tiles', id: 'body-teeth', deletedAt: 400 }] };

  await a.sync(client);
  await b.sync(client);
  await a.sync(client);
  for (const d of [a, b]) {
    const label = (id: string) => d.state.tiles.find((t) => t.id === id)?.label;
    assert.equal(label('core-look'), 'peek');
    assert.equal(label('core-go'), 'let’s go');
    assert.equal(label('core-wait'), 'wait B');
    assert.equal(label('body-teeth'), undefined, 'delete reached the other device');
  }
});

test('sync: My Day and settings follow the newest change; unused media is removed from Drive', async () => {
  const { client, files } = fakeDrive();
  const a = device('a');
  a.media.set('photo-x', { id: 'photo-x', kind: 'photo', mime: 'image/jpeg', blob: new Blob(['x']), createdAt: 1 });
  a.state = { ...a.state, myDay: { ...a.state.myDay, reward: { ...a.state.myDay.reward, item: { label: 'Park', done: false, photoId: 'photo-x' } } }, stamps: { settings: 0, myday: 50 } };
  await a.sync(client);
  assert.ok([...files.values()].some((f) => f.name === 'media-photo-x'));
  const b = device('b');
  await b.sync(client);
  assert.equal(b.state.myDay.reward.item.label, 'Park');
  b.state = { ...b.state, myDay: { ...b.state.myDay, reward: { ...b.state.myDay.reward, item: { label: 'Bubbles', done: false } } }, stamps: { ...b.state.stamps, myday: 60 } };
  await b.sync(client);
  assert.equal([...files.values()].some((f) => f.name === 'media-photo-x'), false, 'photo no longer used anywhere');
  await a.sync(client);
  assert.equal(a.state.myDay.reward.item.label, 'Bubbles');
});

test('sync: records round-trip and the PIN never leaves the device', () => {
  const s = fresh();
  s.settings.pin = { hash: 'h', salt: 's', algo: 'pbkdf2' };
  const recs = toRecords(s, 'd');
  assert.equal(JSON.stringify(recs).includes('"hash"'), false);
  const back = fromRecords(recs, { pin: s.settings.pin });
  assert.equal(back.tiles.length, s.tiles.length);
  assert.equal(back.settings.pin?.hash, 'h');
});

/* ---------- Google Photos pass-through ---------- */

test('photo proxy: only Google Photos URLs, only with a Bearer token', async () => {
  assert.equal(isAllowedPhotoUrl('https://lh3.googleusercontent.com/abc=w100'), true);
  assert.equal(isAllowedPhotoUrl('https://evil.com/?x=googleusercontent.com'), false);
  assert.equal(isAllowedPhotoUrl('https://googleusercontent.com.evil.com/x'), false);
  assert.equal(isAllowedPhotoUrl('http://lh3.googleusercontent.com/x'), false);
  assert.equal(isAllowedPhotoUrl('https://user:pw@lh3.googleusercontent.com/x'), false);

  const never = async () => {
    throw new Error('should not fetch');
  };
  const req = (url: string, auth?: string, method = 'GET') =>
    new Request(`https://mimzi.example/api/photo?url=${encodeURIComponent(url)}`, { method, headers: auth ? { Authorization: auth } : {} });
  assert.equal((await handlePhotoProxy(req('https://example.com/x', 'Bearer t'), never)).status, 400);
  assert.equal((await handlePhotoProxy(req('https://lh3.googleusercontent.com/x'), never)).status, 401);
  assert.equal((await handlePhotoProxy(req('https://lh3.googleusercontent.com/x', 'Bearer t', 'POST'), never)).status, 405);
});

test('photo proxy: forwards the token, returns the image, refuses non-images', async () => {
  let sentAuth = '';
  const ok = (async (_u: string, init?: RequestInit) => {
    sentAuth = new Headers(init?.headers).get('Authorization') ?? '';
    return new Response(new Uint8Array([9, 9]), { headers: { 'Content-Type': 'image/jpeg' } });
  }) as typeof fetch;
  const r = await handlePhotoProxy(
    new Request('https://m/api/photo?url=' + encodeURIComponent('https://lh3.googleusercontent.com/p=w1600'), { headers: { Authorization: 'Bearer tok' } }),
    ok,
  );
  assert.equal(r.status, 200);
  assert.equal(sentAuth, 'Bearer tok');
  assert.equal(r.headers.get('Cache-Control'), 'no-store, private');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), new Uint8Array([9, 9]));

  const html = (async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })) as typeof fetch;
  const bad = await handlePhotoProxy(
    new Request('https://m/api/photo?url=' + encodeURIComponent('https://lh3.googleusercontent.com/p'), { headers: { Authorization: 'Bearer tok' } }),
    html,
  );
  assert.equal(bad.status, 415);
});

test('Google Photos picker: session → poll → list → download via pass-through → delete session', async () => {
  const calls: string[] = [];
  let polls = 0;
  const f = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.replace(/\?.*/, '')}`);
    if (url.endsWith('/v1/sessions') && method === 'POST') {
      assert.match(String(init?.body), /"maxItemCount":"1"/);
      return Response.json({ id: 's1', pickerUri: 'https://photos.google.com/picker/s1', pollingConfig: { pollInterval: '1s', timeoutIn: '60s' } });
    }
    if (url.includes('/v1/sessions/s1') && method === 'GET') return Response.json({ id: 's1', pickerUri: 'x', mediaItemsSet: ++polls >= 2 });
    if (url.includes('/v1/mediaItems')) return Response.json({ mediaItems: [{ id: 'm1', type: 'PHOTO', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/m1', filename: 'dog.jpg' } }] });
    if (url.startsWith('/api/photo')) {
      assert.match(decodeURIComponent(url), /m1=w1600-h1600/);
      return new Response(new Uint8Array([7]), { headers: { 'Content-Type': 'image/jpeg' } });
    }
    if (method === 'DELETE') return new Response(null, { status: 200 });
    throw new Error('unexpected ' + url);
  }) as typeof fetch;
  let shownUri = '';
  const photos = await pickFromGooglePhotos({ token: 't', popup: null, fetchImpl: f, sleep: async () => undefined, onPickerUri: (u) => (shownUri = u) });
  assert.equal(shownUri, 'https://photos.google.com/picker/s1/autoclose');
  assert.equal(photos.length, 1);
  assert.equal(photos[0].filename, 'dog.jpg');
  assert.ok(calls.includes('DELETE https://photospicker.googleapis.com/v1/sessions/s1'), 'session cleaned up');
});
