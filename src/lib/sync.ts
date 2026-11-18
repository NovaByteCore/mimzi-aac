/*
 * Optional cross-device sync — architecture only (see docs/SYNC.md).
 *
 * Mimzi is local-first: IndexedDB is the source of truth on each device and the board
 * never waits for the network. A sync provider, if one is ever enabled, runs in the
 * background and only moves changes between devices. No provider is enabled, and none
 * will be until the owner chooses one and approves any account or cost.
 */
import { config } from '../config';

export type SyncState =
  | { kind: 'off' }
  | { kind: 'idle'; lastSyncedAt: number }
  | { kind: 'syncing' }
  | { kind: 'offline'; lastSyncedAt?: number }
  | { kind: 'error'; message: string; lastSyncedAt?: number };

/** One record as a sync provider sees it. Media blobs travel separately (content-addressed). */
export interface SyncRecord {
  store: 'tiles' | 'categories' | 'observations' | 'kv';
  id: string;
  /** Last change time on the device that made it (ms). */
  updatedAt: number;
  /** Device that made the change — breaks ties deterministically. */
  deviceId: string;
  deleted?: boolean;
  value: unknown;
}

export interface SyncProvider {
  readonly id: string;
  readonly label: string;
  push(records: SyncRecord[]): Promise<void>;
  pull(since: number): Promise<SyncRecord[]>;
  uploadMedia(id: string, blob: Blob): Promise<void>;
  downloadMedia(id: string): Promise<Blob>;
}

/**
 * Conflict rule: last writer wins per record, using (updatedAt, deviceId) so every device
 * reaches the same answer. Deletions are tombstones so a delete on one device isn't undone
 * by an older copy on another.
 */
export function resolveConflict(local: SyncRecord | undefined, remote: SyncRecord): SyncRecord {
  if (!local) return remote;
  if (remote.updatedAt !== local.updatedAt) return remote.updatedAt > local.updatedAt ? remote : local;
  return remote.deviceId > local.deviceId ? remote : local;
}

export function mergeRecords(local: SyncRecord[], remote: SyncRecord[]): SyncRecord[] {
  const key = (r: SyncRecord) => `${r.store}/${r.id}`;
  const out = new Map(local.map((r) => [key(r), r]));
  for (const r of remote) out.set(key(r), resolveConflict(out.get(key(r)), r));
  return [...out.values()];
}

/** The only provider that exists today. */
export function currentSyncState(): SyncState {
  return { kind: 'off' };
}

export function syncStatusText(state: SyncState): string {
  switch (state.kind) {
    case 'off':
      return config.syncProvider ? 'Sync is set up but not turned on' : 'This device only — sync is off';
    case 'idle':
      return `Synced ${new Date(state.lastSyncedAt).toLocaleString()}`;
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return 'Offline — changes are saved on this device';
    case 'error':
      return `Sync problem: ${state.message}`;
  }
}
