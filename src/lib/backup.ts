/*
 * Backup export / import. A backup is one JSON file that includes photos and recordings
 * (base64). It is created on the device and never uploaded anywhere by Mimzi.
 * The Parent PIN is NOT included, so restoring on another device keeps that device's PIN.
 */
import type { Category, MediaKind, MediaRecord, MyDay, Observation, Settings, Tile } from '../types';
import { OBSERVATION_METHODS } from '../types';
import { mergeMyDay, mergeSettings } from './defaults';

export const BACKUP_FORMAT = 'mimzi-backup';
export const BACKUP_VERSION = 2;

export interface BackupMedia {
  id: string;
  kind: MediaKind;
  mime: string;
  createdAt: number;
  data: string; // base64
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tiles: Tile[];
  categories: Category[];
  settings: Omit<Settings, 'pin'>;
  media: BackupMedia[];
  /** v2+ */
  myDay?: MyDay;
  /** v2+ */
  observations?: Observation[];
}

export interface RestoredData {
  tiles: Tile[];
  categories: Category[];
  settings: Settings;
  media: MediaRecord[];
  myDay: MyDay;
  observations: Observation[];
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function createBackup(input: {
  tiles: Tile[];
  categories: Category[];
  settings: Settings;
  media: MediaRecord[];
  myDay: MyDay;
  observations: Observation[];
}): Promise<BackupFile> {
  const { pin: _pin, ...settings } = input.settings;
  const media: BackupMedia[] = [];
  for (const m of input.media) {
    media.push({
      id: m.id,
      kind: m.kind,
      mime: m.mime,
      createdAt: m.createdAt,
      data: arrayBufferToBase64(await m.blob.arrayBuffer()),
    });
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tiles: input.tiles,
    categories: input.categories,
    settings,
    media,
    myDay: input.myDay,
    observations: input.observations,
  };
}

export class BackupError extends Error {}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate an untrusted backup file and turn it into records ready for IndexedDB. */
export function parseBackup(raw: unknown, currentPin?: Settings['pin']): RestoredData {
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new BackupError('This file is not a Mimzi backup.');
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of Mimzi. Update Mimzi first.');
  }
  const { tiles, categories, media, settings } = raw;
  if (!Array.isArray(tiles) || !Array.isArray(categories) || !Array.isArray(media)) {
    throw new BackupError('The backup file is incomplete or damaged.');
  }
  const cleanTiles: Tile[] = tiles.map((t, i) => {
    if (!isObj(t) || typeof t.id !== 'string' || typeof t.label !== 'string' || typeof t.categoryId !== 'string') {
      throw new BackupError(`Tile ${i + 1} in the backup is damaged.`);
    }
    return {
      id: t.id,
      label: t.label,
      speak: typeof t.speak === 'string' ? t.speak : t.label,
      categoryId: t.categoryId,
      order: typeof t.order === 'number' ? t.order : i,
      symbol: typeof t.symbol === 'string' ? t.symbol : undefined,
      photoId: typeof t.photoId === 'string' ? t.photoId : undefined,
      audioId: typeof t.audioId === 'string' ? t.audioId : undefined,
      signId: typeof t.signId === 'string' ? t.signId : undefined,
      color: (typeof t.color === 'string' ? t.color : 'cream') as Tile['color'],
      favorite: Boolean(t.favorite),
      hidden: Boolean(t.hidden),
      deletedAt: typeof t.deletedAt === 'number' ? t.deletedAt : undefined,
      builtIn: Boolean(t.builtIn),
      privateNote: typeof t.privateNote === 'string' ? t.privateNote : undefined,
    };
  });
  const cleanCategories: Category[] = categories.map((c, i) => {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.name !== 'string') {
      throw new BackupError(`Category ${i + 1} in the backup is damaged.`);
    }
    return {
      id: c.id,
      name: c.name,
      symbol: typeof c.symbol === 'string' ? c.symbol : '⭐',
      color: (typeof c.color === 'string' ? c.color : 'cream') as Category['color'],
      order: typeof c.order === 'number' ? c.order : i,
      hidden: Boolean(c.hidden),
      builtIn: Boolean(c.builtIn),
    };
  });
  const cleanMedia: MediaRecord[] = media.map((m, i) => {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.data !== 'string' || typeof m.mime !== 'string') {
      throw new BackupError(`Photo or recording ${i + 1} in the backup is damaged.`);
    }
    const kind = m.kind === 'audio' || m.kind === 'sign' ? m.kind : 'photo';
    try {
      return {
        id: m.id,
        kind,
        mime: m.mime,
        createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
        blob: base64ToBlob(m.data, m.mime),
      };
    } catch {
      throw new BackupError(`Photo or recording ${i + 1} in the backup could not be read.`);
    }
  });
  const merged = mergeSettings(isObj(settings) ? (settings as Partial<Settings>) : undefined);
  delete merged.pin;
  if (currentPin) merged.pin = currentPin;
  const rawObs = Array.isArray(raw.observations) ? raw.observations : [];
  const observations: Observation[] = rawObs.map((o, i) => {
    if (!isObj(o) || typeof o.id !== 'string' || typeof o.target !== 'string') {
      throw new BackupError(`My Words entry ${i + 1} in the backup is damaged.`);
    }
    const method = OBSERVATION_METHODS.includes(o.method as Observation['method']) ? (o.method as Observation['method']) : 'Speech';
    return {
      id: o.id,
      target: o.target,
      pronunciation: typeof o.pronunciation === 'string' ? o.pronunciation : '',
      method,
      date: typeof o.date === 'string' ? o.date : new Date().toISOString().slice(0, 10),
      notes: typeof o.notes === 'string' ? o.notes : '',
      audioId: typeof o.audioId === 'string' ? o.audioId : undefined,
      createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
    };
  });
  const myDay = mergeMyDay(isObj(raw.myDay) ? (raw.myDay as Partial<MyDay>) : undefined);
  return { tiles: cleanTiles, categories: cleanCategories, settings: merged, media: cleanMedia, myDay, observations };
}

export function backupFileName(date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  return `mimzi-backup-${d}.json`;
}
