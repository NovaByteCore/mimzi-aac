/*
 * Google Drive sync engine. Local-first:
 *  - IndexedDB on each device is the source of truth; the board never waits for this.
 *  - Each word, group, note, and the shared settings / My Day are separate records with a
 *    change time. Merge = newest copy of each record wins (ties broken by device id so
 *    every device agrees). Deletions are kept as tombstones so they spread too.
 *  - Photos, recordings and sign videos are uploaded once each (by id) and downloaded on
 *    devices that don't have them yet.
 * The Parent PIN and each device's own voice choice stay on that device; the last voice picked
 * (sharedVoiceName) syncs so another device can use the same voice when it has it.
 */
import type { Category, GrowPlan, MediaKind, MediaRecord, MyDay, Observation, Settings, Tile, VocabEvent } from '../../types';
import { mergeGrowPlan } from '../grow';
import { mergeRecords, type SyncRecord } from '../sync';
import { referencedMediaIds } from '../media';
import { mergeMyDay, mergeSettings } from '../defaults';
import type { DriveClient, DriveFile } from './drive';

export const STATE_FILE = 'mimzi-state.json';
export const mediaFileName = (id: string) => `media-${id}`;

export type TombstoneStore = 'tiles' | 'categories' | 'observations';
export interface Tombstone {
  store: TombstoneStore;
  id: string;
  deletedAt: number;
}

export interface Stamps {
  settings: number;
  myday: number;
  grow: number;
  history: number;
}

export interface SyncableState {
  tiles: Tile[];
  categories: Category[];
  observations: Observation[];
  settings: Settings;
  myDay: MyDay;
  grow: GrowPlan;
  history: VocabEvent[];
  stamps: Stamps;
  tombstones: Tombstone[];
}

/** Settings that belong to one device and are never synced. */
export function deviceOnlySettings(s: Settings): Pick<Settings, 'pin' | 'voiceURI' | 'voiceName'> {
  return { pin: s.pin, voiceURI: s.voiceURI, voiceName: s.voiceName };
}

export function sharedSettings(s: Settings): Omit<Settings, 'pin' | 'voiceURI' | 'voiceName'> {
  const { pin: _pin, voiceURI: _voice, voiceName: _voiceName, ...rest } = s;
  return rest;
}

export function toRecords(state: SyncableState, deviceId: string): SyncRecord[] {
  const rec = (store: SyncRecord['store'], id: string, updatedAt: number | undefined, value: unknown): SyncRecord => ({
    store,
    id,
    updatedAt: updatedAt ?? 0,
    deviceId,
    value,
  });
  return [
    ...state.tiles.map((t) => rec('tiles', t.id, t.updatedAt, t)),
    ...state.categories.map((c) => rec('categories', c.id, c.updatedAt, c)),
    ...state.observations.map((o) => rec('observations', o.id, o.updatedAt, o)),
    rec('kv', 'settings', state.stamps.settings, sharedSettings(state.settings)),
    rec('kv', 'myday', state.stamps.myday, state.myDay),
    rec('kv', 'grow', state.stamps.grow, state.grow),
    rec('kv', 'history', state.stamps.history, state.history),
    ...state.tombstones.map((t) => ({ store: t.store, id: t.id, updatedAt: t.deletedAt, deviceId, deleted: true, value: null }) as SyncRecord),
  ];
}

export function fromRecords(records: SyncRecord[], keep: Pick<Settings, 'pin' | 'voiceURI' | 'voiceName'>): SyncableState {
  const live = (store: SyncRecord['store']) => records.filter((r) => r.store === store && !r.deleted);
  const settingsRec = records.find((r) => r.store === 'kv' && r.id === 'settings');
  const mydayRec = records.find((r) => r.store === 'kv' && r.id === 'myday');
  const growRec = records.find((r) => r.store === 'kv' && r.id === 'grow');
  const historyRec = records.find((r) => r.store === 'kv' && r.id === 'history');
  const settings = mergeSettings((settingsRec?.value as Partial<Settings>) ?? undefined);
  // Older versions synced voiceName; treat it as the shared preference.
  if (!settings.sharedVoiceName && settings.voiceName) settings.sharedVoiceName = settings.voiceName;
  delete settings.pin;
  delete settings.voiceURI;
  delete settings.voiceName;
  if (keep.pin) settings.pin = keep.pin;
  if (keep.voiceURI) settings.voiceURI = keep.voiceURI;
  if (keep.voiceName) settings.voiceName = keep.voiceName;
  return {
    tiles: live('tiles').map((r) => r.value as Tile),
    categories: live('categories').map((r) => r.value as Category),
    observations: live('observations').map((r) => r.value as Observation),
    settings,
    myDay: mergeMyDay((mydayRec?.value as Partial<MyDay>) ?? undefined),
    grow: mergeGrowPlan((growRec?.value as Partial<GrowPlan>) ?? undefined),
    history: Array.isArray(historyRec?.value) ? (historyRec!.value as VocabEvent[]) : [],
    stamps: { settings: settingsRec?.updatedAt ?? 0, myday: mydayRec?.updatedAt ?? 0, grow: growRec?.updatedAt ?? 0, history: historyRec?.updatedAt ?? 0 },
    tombstones: records
      .filter((r) => r.deleted && r.store !== 'kv')
      .map((r) => ({ store: r.store as TombstoneStore, id: r.id, deletedAt: r.updatedAt })),
  };
}

export interface SyncFile {
  format: 'mimzi-sync';
  version: 1;
  savedAt: string;
  records: SyncRecord[];
}

export function parseSyncFile(text: string): SyncRecord[] {
  const j = JSON.parse(text) as Partial<SyncFile>;
  if (j.format !== 'mimzi-sync' || !Array.isArray(j.records)) throw new Error('The Mimzi file in Google Drive is not readable.');
  return j.records.filter((r) => r && typeof r.id === 'string' && typeof r.store === 'string' && typeof r.updatedAt === 'number');
}

export interface SyncResult {
  state: SyncableState;
  /** Media downloaded from Drive that this device didn't have. */
  downloaded: MediaRecord[];
  uploaded: number;
  removedRemote: number;
  /** Referenced media that exists neither here nor in Drive (e.g. still uploading elsewhere). */
  missing: string[];
}

export async function runSync(opts: {
  local: SyncableState;
  deviceId: string;
  drive: DriveClient;
  localMediaIds: Set<string>;
  readLocalMedia: (id: string) => Promise<MediaRecord | undefined>;
  onProgress?: (msg: string) => void;
}): Promise<SyncResult> {
  const { local, deviceId, drive, localMediaIds, readLocalMedia, onProgress } = opts;
  onProgress?.('Checking Google Drive…');
  const files = await drive.list();
  const stateFiles = files.filter((f) => f.name === STATE_FILE);
  const stateFile = stateFiles[0];
  let remoteRecords: SyncRecord[] = [];
  for (const f of stateFiles) remoteRecords = mergeRecords(remoteRecords, parseSyncFile(await (await drive.download(f.id)).text()));

  const merged = mergeRecords(toRecords(local, deviceId), remoteRecords);
  const state = fromRecords(merged, deviceOnlySettings(local.settings));

  const needed = referencedMediaIds(state);
  const remoteMedia = new Map<string, DriveFile>();
  for (const f of files) if (f.name.startsWith('media-')) remoteMedia.set(f.name.slice('media-'.length), f);

  const downloaded: MediaRecord[] = [];
  const missing: string[] = [];
  const toDownload = [...needed].filter((id) => !localMediaIds.has(id));
  let n = 0;
  for (const id of toDownload) {
    const f = remoteMedia.get(id);
    if (!f) {
      missing.push(id);
      continue;
    }
    onProgress?.(`Downloading photos and sounds (${++n}/${toDownload.length})…`);
    const blob = await drive.download(f.id);
    const mime = f.appProperties?.mime || blob.type || 'application/octet-stream';
    downloaded.push({ id, kind: (f.appProperties?.kind as MediaKind) || 'photo', mime, blob: new Blob([blob], { type: mime }), createdAt: Date.now() });
  }

  let uploaded = 0;
  const toUpload = [...needed].filter((id) => localMediaIds.has(id) && !remoteMedia.has(id));
  for (const id of toUpload) {
    const m = await readLocalMedia(id);
    if (!m) continue;
    onProgress?.(`Saving photos and sounds to Google Drive (${uploaded + 1}/${toUpload.length})…`);
    await drive.create(mediaFileName(id), m.blob, { kind: m.kind, mime: m.mime });
    uploaded++;
  }

  let removedRemote = 0;
  for (const [id, f] of remoteMedia) {
    if (!needed.has(id)) {
      await drive.remove(f.id);
      removedRemote++;
    }
  }

  onProgress?.('Saving words to Google Drive…');
  const file: SyncFile = { format: 'mimzi-sync', version: 1, savedAt: new Date().toISOString(), records: merged };
  const body = new Blob([JSON.stringify(file)], { type: 'application/json' });
  if (stateFile) await drive.update(stateFile.id, body);
  else await drive.create(STATE_FILE, body);
  // Clean up accidental duplicates (two devices creating the first file at the same moment).
  for (const extra of stateFiles.slice(1)) await drive.remove(extra.id);

  return { state, downloaded, uploaded, removedRemote, missing };
}
