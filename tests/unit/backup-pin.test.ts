import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, parseBackup, BackupError, backupFileName, arrayBufferToBase64 } from '../../src/lib/backup.ts';
import { createPinRecord, verifyPin, isValidPin } from '../../src/lib/pin.ts';
import { buildSeedCategories, buildSeedTiles } from '../../src/data/vocabulary.ts';
import { defaultSettings } from '../../src/lib/defaults.ts';

test('backup round-trips tiles, categories, settings and binary media', async () => {
  const tiles = buildSeedTiles().slice(0, 5);
  tiles[0] = { ...tiles[0], photoId: 'photo-1', label: 'Puppy' };
  const bytes = new Uint8Array(70_000).map((_, i) => (i * 7) % 256); // larger than one base64 chunk
  const settings = { ...defaultSettings(), speechRate: 1.3, pin: { hash: 'h', salt: 's', algo: 'pbkdf2' as const } };
  const backup = await createBackup({
    tiles,
    categories: buildSeedCategories(),
    settings,
    media: [{ id: 'photo-1', kind: 'photo', mime: 'image/jpeg', blob: new Blob([bytes], { type: 'image/jpeg' }), createdAt: 1 }],
  });
  assert.equal('pin' in backup.settings, false, 'PIN must not be exported');
  const json = JSON.parse(JSON.stringify(backup));
  const restored = parseBackup(json, { hash: 'local', salt: 'x', algo: 'pbkdf2' });
  assert.equal(restored.tiles[0].label, 'Puppy');
  assert.equal(restored.settings.speechRate, 1.3);
  assert.equal(restored.settings.pin?.hash, 'local', 'keeps this device’s PIN');
  const back = new Uint8Array(await restored.media[0].blob.arrayBuffer());
  assert.deepEqual(back, bytes);
});

test('backup import rejects files that are not Mimzi backups', () => {
  assert.throws(() => parseBackup({ hello: 'world' }), BackupError);
  assert.throws(() => parseBackup(null), BackupError);
  assert.throws(() => parseBackup({ format: 'mimzi-backup', version: 99, tiles: [], categories: [], media: [] }), /newer version/);
  assert.throws(() => parseBackup({ format: 'mimzi-backup', version: 1, tiles: [{ nope: 1 }], categories: [], media: [] }), /Tile 1/);
});

test('backup file name is dated', () => {
  assert.equal(backupFileName(new Date('2026-03-04T10:00:00Z')), 'mimzi-backup-2026-03-04.json');
  assert.equal(arrayBufferToBase64(new TextEncoder().encode('hi').buffer as ArrayBuffer), 'aGk=');
});

test('PIN: only 4–8 digits, verify accepts the right PIN only', async () => {
  assert.equal(isValidPin('123'), false);
  assert.equal(isValidPin('12a4'), false);
  assert.equal(isValidPin('1234'), true);
  const rec = await createPinRecord('2468');
  assert.equal(rec.algo, 'pbkdf2');
  assert.notEqual(rec.hash, '2468');
  assert.equal(await verifyPin('2468', rec), true);
  assert.equal(await verifyPin('2469', rec), false);
});
