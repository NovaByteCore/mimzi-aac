/*
 * Minimal promise wrapper around IndexedDB. Everything Mimzi knows lives here, on the
 * device: tiles, categories, settings, photos, recordings and sign videos.
 */
import type { Category, MediaRecord, MyDay, Observation, Settings, Tile } from '../types';

export const DB_NAME = 'mimzi';
export const DB_VERSION = 2;

export type StoreName = 'tiles' | 'categories' | 'media' | 'kv' | 'observations';

interface StoreTypes {
  tiles: Tile;
  categories: Category;
  media: MediaRecord;
  observations: Observation;
  kv: { key: string; value: unknown };
}

let dbPromise: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support offline storage (IndexedDB).'));
      return;
    }
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('tiles')) db.createObjectStore('tiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      // v2: caregiver observations (My Words)
      if (!db.objectStoreNames.contains('observations')) db.createObjectStore('observations', { keyPath: 'id' });
    };
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Mimzi storage is busy in another tab. Close other Mimzi tabs and try again.'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

export async function getAll<K extends StoreName>(store: K): Promise<StoreTypes[K][]> {
  const db = await openDb();
  return req(db.transaction(store).objectStore(store).getAll()) as Promise<StoreTypes[K][]>;
}

export async function get<K extends StoreName>(store: K, key: string): Promise<StoreTypes[K] | undefined> {
  const db = await openDb();
  return req(db.transaction(store).objectStore(store).get(key)) as Promise<StoreTypes[K] | undefined>;
}

export async function putMany<K extends StoreName>(store: K, values: StoreTypes[K][]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await done(tx);
}

export async function put<K extends StoreName>(store: K, value: StoreTypes[K]): Promise<void> {
  return putMany(store, [value]);
}

export async function remove(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  const row = await get('kv', key);
  return row?.value as T | undefined;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await put('kv', { key, value });
}

/** Replace everything in one transaction (used by backup restore). */
export async function replaceAll(data: {
  tiles: Tile[];
  categories: Category[];
  media: MediaRecord[];
  settings: Settings;
  myDay: MyDay;
  observations: Observation[];
}): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['tiles', 'categories', 'media', 'observations', 'kv'], 'readwrite');
  for (const name of ['tiles', 'categories', 'media', 'observations'] as const) tx.objectStore(name).clear();
  data.tiles.forEach((t) => tx.objectStore('tiles').put(t));
  data.categories.forEach((c) => tx.objectStore('categories').put(c));
  data.media.forEach((m) => tx.objectStore('media').put(m));
  data.observations.forEach((o) => tx.objectStore('observations').put(o));
  tx.objectStore('kv').put({ key: 'settings', value: data.settings });
  tx.objectStore('kv').put({ key: 'myday', value: data.myDay });
  tx.objectStore('kv').put({ key: 'seeded', value: true });
  await done(tx);
}

/** Ask the browser not to evict Mimzi's data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    if (!est) return null;
    return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
  } catch {
    return null;
  }
}
