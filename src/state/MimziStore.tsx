import { downloadPicture, remotePicture } from '../lib/localPictures';
import { allScheduleItems } from '../lib/myday';
/*
 * App data store: loads everything from IndexedDB once, keeps it in memory for instant
 * taps, and writes every change straight back to IndexedDB.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Category, GrowPlan, MediaRecord, MyDay, Observation, Settings, SymbolInfo, Tile, VocabEvent } from '../types';
import { dayString, mergeGrowPlan, processDue, setStatus, vocabEvent } from '../lib/grow';
import * as db from '../lib/db';
import { buildSeedCategories, buildSeedTiles, CATEGORY_SEED } from '../data/vocabulary';
import { applyNewDefaultsV5, fixArasaacPicksV2, migrateSymbolsV4, migrateVocabularyV3, upgradeSymbolFields } from './migrations';
import defaultPictures from '../../public/symbols/defaultPictures.json';
import { mergeMyDay, mergeSettings } from '../lib/defaults';
import { moveTile as computeMove, nextOrder, slotMap } from '../lib/grid';
import { createBackup, type BackupFile, type RestoredData } from '../lib/backup';
import { referencedMediaIds } from '../lib/media';
import { newId } from '../lib/id';
import { swapWordInto, type SwapResult } from '../lib/manageWords';
import { currentToken, fetchProfile, requestToken, SCOPES, signOut as googleRevoke } from '../lib/google/auth';
import { createDriveClient } from '../lib/google/drive';
import { runSync, sharedSettings, type Stamps, type Tombstone, type TombstoneStore } from '../lib/google/driveSync';

export interface MimziData {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  tiles: Tile[];
  categories: Category[];
  settings: Settings;
  myDay: MyDay;
  observations: Observation[];
  /** Grow My Words schedule. */
  grow: GrowPlan;
  /** Vocabulary history (newest last). */
  history: VocabEvent[];
  mediaUrls: Record<string, string>;
  /** MIME type per media id (e.g. to tell a GIF sign from a video sign). */
  mediaMime: Record<string, string>;
  sync: SyncStatus;
  /** Automatic ARASAAC pictures for starter words. */
  symbols: SymbolStatus;
}

export interface SymbolStatus {
  phase: 'idle' | 'finding' | 'offline' | 'off';
  /** Starter words still waiting for their ARASAAC picture. */
  pending: number;
  /** Starter words ARASAAC has no match for (they keep their bundled picture). */
  missing: string[];
}

export interface SyncStatus {
  account?: { email: string; name: string };
  phase: 'off' | 'idle' | 'syncing' | 'error';
  message?: string;
  lastSyncedAt?: number;
}

export interface MimziActions {
  saveTile(tile: Tile, newMedia?: MediaRecord[]): Promise<void>;
  softDeleteTile(id: string): Promise<void>;
  restoreTile(id: string): Promise<void>;
  purgeTile(id: string): Promise<void>;
  moveTile(id: string, dir: -1 | 1): Promise<void>;
  /** Arrange words: save new slots for several words at once (positions only). */
  saveTileOrders(changes: { id: string; order: number }[]): Promise<void>;
  saveCategory(cat: Category): Promise<void>;
  saveCategories(cats: Category[]): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  updateMyDay(next: MyDay, newMedia?: MediaRecord[]): Promise<void>;
  saveObservation(obs: Observation, newMedia?: MediaRecord[]): Promise<void>;
  deleteObservation(id: string): Promise<void>;
  /** Show or hide words (keeps their slots) and record it in the vocabulary history. */
  setTilesHidden(ids: string[], hidden: boolean, source?: VocabEvent['source']): Promise<void>;
  /** Manage words: put a word into the selected slot (the word there is hidden, not deleted). */
  swapWord(categoryId: string, slot: number, incomingId: string): Promise<SwapResult | null>;
  updateGrow(plan: GrowPlan): Promise<void>;
  /** Approve (show now) or skip/cancel scheduled words. */
  resolveGrow(itemIds: string[], action: 'approve' | 'skip' | 'cancel'): Promise<void>;
  exportBackup(): Promise<BackupFile>;
  restoreBackup(data: RestoredData): Promise<void>;
  /** Sign in with Google (must be called from a tap) and sync with Google Drive. */
  googleSignIn(): Promise<void>;
  googleSignOut(): Promise<void>;
  /** Sync with Google Drive. `interactive` may open the Google window (only from a tap). */
  syncNow(interactive?: boolean, justSignedIn?: SyncStatus['account']): Promise<void>;
  /**
   * Change only a word's picture: a symbol a grown-up chose, or 'auto' to let Mimzi pick
   * (default style). Label, speech, sign, photo and board position never change.
   */
  setTileSymbol(id: string, choice: { symbol: string; symbolInfo?: SymbolInfo } | 'auto'): Promise<void>;
  /**
   * Change only a word's picture from the picture picker: a symbol or a photo. The word,
   * spoken text, recording, sign and board position stay exactly as they were.
   */
  setTilePicture(id: string, picked: { kind: 'symbol'; symbol: string; info: SymbolInfo } | { kind: 'photo'; photoId: string; media?: MediaRecord }): Promise<void>;
  /** Look for ARASAAC pictures for starter words now (e.g. after coming online). */
}

/** A first-run grid that suits the screen: 4 × 6 on tablets, 4 × 4 on phones. */
function defaultGridForScreen() {
  const small = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 560;
  return small ? { rows: 4, cols: 4 } : { rows: 4, cols: 6 };
}

const Ctx = createContext<(MimziData & MimziActions) | null>(null);

/** Food & Drink was added after the first release; add it (empty) for existing installs. */
async function migrate(categories: Category[]): Promise<Category[]> {
  const out = [...categories];
  for (const seed of CATEGORY_SEED) {
    if (!(await db.getKv<boolean>(`migrated:cat:${seed.id}`)) && !out.some((c) => c.id === seed.id)) {
      if (seed.id === 'food') {
        const cat: Category = { ...seed, order: Math.max(-1, ...out.map((c) => c.order)) + 1, hidden: false, builtIn: true };
        await db.put('categories', cat);
        out.push(cat);
      }
    }
    await db.setKv(`migrated:cat:${seed.id}`, true);
  }
  return out;
}

export function MimziProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MimziData>({
    status: 'loading',
    tiles: [],
    categories: [],
    settings: mergeSettings(undefined),
    myDay: mergeMyDay(undefined),
    observations: [],
    grow: mergeGrowPlan(undefined),
    history: [],
    mediaUrls: {},
    mediaMime: {},
    sync: { phase: 'off' },
    symbols: { phase: 'idle', pending: 0, missing: [] },
  });
  const dataRef = useRef(data);
  dataRef.current = data;
  const stamps = useRef<Stamps>({ settings: 0, myday: 0, grow: 0, history: 0 });
  const tombstones = useRef<Tombstone[]>([]);
  const deviceId = useRef('');

  const setStamp = (key: keyof Stamps) => {
    stamps.current = { ...stamps.current, [key]: Date.now() };
    void db.setKv('sync:stamps', stamps.current);
  };
  const addTombstone = (store: TombstoneStore, id: string) => {
    tombstones.current = [...tombstones.current.filter((t) => !(t.store === store && t.id === id)), { store, id, deletedAt: Date.now() }];
    void db.setKv('sync:tombstones', tombstones.current);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await db.getKv<boolean>('seeded'))) {
          await db.putMany('categories', buildSeedCategories());
          await db.putMany('tiles', buildSeedTiles());
          await db.setKv('settings', { ...mergeSettings(undefined), grid: defaultGridForScreen() });
          await db.setKv('seeded', true);
          for (const c of CATEGORY_SEED) await db.setKv(`migrated:cat:${c.id}`, true);
          await db.setKv('migrated:vocab3', true);
          await db.setKv('migrated:symbols4', true);
          await db.setKv('symbols:picks', 3);
        }
        const [tiles, rawCategories, media, saved, savedDay, observations] = await Promise.all([
          db.getAll('tiles'),
          db.getAll('categories'),
          db.getAll('media'),
          db.getKv<Partial<Settings>>('settings'),
          db.getKv<Partial<MyDay>>('myday'),
          db.getAll('observations'),
        ]);
        const categories = await migrate(rawCategories);
        await migrateVocabularyV3(tiles, categories);
        await migrateSymbolsV4(tiles);
        await applyNewDefaultsV5(tiles, categories);
        await fixArasaacPicksV2(tiles);
        stamps.current = { settings: 0, myday: 0, grow: 0, history: 0, ...((await db.getKv<Partial<Stamps>>('sync:stamps')) ?? {}) };
        // Grow My Words: apply anything that became due while Mimzi was closed.
        let grow = mergeGrowPlan(await db.getKv<Partial<GrowPlan>>('grow'));
        let history = (await db.getKv<VocabEvent[]>('history')) ?? [];
        {
          const today = dayString();
          const r = processDue(grow, today);
          if (r.plan !== grow && (r.show.length || r.newlyPending.length)) {
            grow = r.plan;
            const shown: Tile[] = [];
            for (const id of r.show) {
              const t = tiles.find((x) => x.id === id);
              if (t && t.hidden) {
                const next = { ...t, hidden: false, updatedAt: Date.now() };
                tiles.splice(tiles.indexOf(t), 1, next);
                shown.push(next);
                history = [...history, vocabEvent(next, 'added', 'scheduled', today)];
              }
            }
            if (shown.length) await db.putMany('tiles', shown);
            await db.setKv('grow', grow);
            await db.setKv('history', history);
            stamps.current = { ...stamps.current, grow: Date.now(), history: Date.now() };
            await db.setKv('sync:stamps', stamps.current);
          }
        }
        tombstones.current = (await db.getKv<Tombstone[]>('sync:tombstones')) ?? [];
        deviceId.current = (await db.getKv<string>('sync:deviceId')) ?? '';
        if (!deviceId.current) {
          deviceId.current = newId('device');
          await db.setKv('sync:deviceId', deviceId.current);
        }
        const account = await db.getKv<SyncStatus['account']>('google:account');
        const lastSyncedAt = await db.getKv<number>('sync:lastSyncedAt');
        const mediaUrls: Record<string, string> = {};
        const mediaMime: Record<string, string> = {};
        for (const m of media) {
          mediaUrls[m.id] = URL.createObjectURL(m.blob);
          mediaMime[m.id] = m.mime;
        }
        if (!cancelled) {
          setData({
            status: 'ready',
            tiles,
            categories,
            settings: mergeSettings(saved),
            myDay: mergeMyDay(savedDay),
            observations,
            grow,
            history,
            mediaUrls,
            mediaMime,
            sync: account ? { phase: 'idle', account, lastSyncedAt } : { phase: 'off' },
            symbols: { phase: 'idle', pending: 0, missing: defaultPictures.missing },
          });
        }
      } catch (e) {
        if (!cancelled) setData((d) => ({ ...d, status: 'error', error: e instanceof Error ? e.message : String(e) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Store new media, then delete any photo/recording nothing refers to any more. */
  const commitMedia = useCallback(async (newMedia: MediaRecord[], next: Pick<MimziData, 'tiles' | 'myDay' | 'observations'>) => {
    if (newMedia.length) {
      await db.putMany('media', newMedia);
      void db.requestPersistentStorage();
    }
    const used = referencedMediaIds(next);
    const known = Object.keys(dataRef.current.mediaUrls);
    const orphaned = known.filter((id) => !used.has(id));
    for (const id of orphaned) await db.remove('media', id);
    return (d: MimziData): Pick<MimziData, 'mediaUrls' | 'mediaMime'> => {
      const mediaUrls = { ...d.mediaUrls };
      const mediaMime = { ...d.mediaMime };
      for (const m of newMedia) {
        mediaUrls[m.id] = URL.createObjectURL(m.blob);
        mediaMime[m.id] = m.mime;
      }
      for (const id of orphaned) {
        if (mediaUrls[id]) URL.revokeObjectURL(mediaUrls[id]);
        delete mediaUrls[id];
        delete mediaMime[id];
      }
      return { mediaUrls, mediaMime };
    };
  }, []);

  const saveTile = useCallback(
    async (input: Tile, newMedia: MediaRecord[] = []) => {
      const tile = { ...input, updatedAt: Date.now() };
      await db.put('tiles', tile);
      const tiles = [...dataRef.current.tiles.filter((t) => t.id !== tile.id), tile];
      const applyUrls = await commitMedia(newMedia, { ...dataRef.current, tiles });
      setData((d) => ({ ...d, tiles: [...d.tiles.filter((t) => t.id !== tile.id), tile], ...applyUrls(d) }));
    },
    [commitMedia],
  );

  const patchTile = useCallback(async (id: string, patch: Partial<Tile>) => {
    const t = dataRef.current.tiles.find((x) => x.id === id);
    if (!t) return;
    const next = { ...t, ...patch, updatedAt: Date.now() };
    await db.put('tiles', next);
    setData((d) => ({ ...d, tiles: d.tiles.map((x) => (x.id === id ? next : x)) }));
  }, []);

  const softDeleteTile = useCallback((id: string) => patchTile(id, { deletedAt: Date.now() }), [patchTile]);

  const restoreTile = useCallback(
    async (id: string) => {
      const t = dataRef.current.tiles.find((x) => x.id === id);
      if (!t) return;
      const categoryExists = dataRef.current.categories.some((c) => c.id === t.categoryId);
      const categoryId = categoryExists ? t.categoryId : 'core';
      // Back to its saved spot if that spot is still free; otherwise the first free spot.
      const live = dataRef.current.tiles.filter((x) => x.categoryId === categoryId && !x.deletedAt && x.id !== id);
      const taken = new Set(slotMap(live).keys());
      const order = categoryId === t.categoryId && !taken.has(t.order) ? t.order : nextOrder(live, categoryId);
      await patchTile(id, { deletedAt: undefined, order, categoryId });
    },
    [patchTile],
  );

  const purgeTile = useCallback(
    async (id: string) => {
      await db.remove('tiles', id);
      addTombstone('tiles', id);
      const tiles = dataRef.current.tiles.filter((x) => x.id !== id);
      const applyUrls = await commitMedia([], { ...dataRef.current, tiles });
      setData((d) => ({ ...d, tiles: d.tiles.filter((x) => x.id !== id), ...applyUrls(d) }));
    },
    [commitMedia],
  );

  const moveTile = useCallback(async (id: string, dir: -1 | 1) => {
    const now = Date.now();
    const changed = computeMove(dataRef.current.tiles, id, dir).map((t) => ({ ...t, updatedAt: now }));
    if (!changed.length) return;
    await db.putMany('tiles', changed);
    const byId = new Map(changed.map((t) => [t.id, t]));
    setData((d) => ({ ...d, tiles: d.tiles.map((t) => byId.get(t.id) ?? t) }));
  }, []);

  const saveCategories = useCallback(async (input: Category[]) => {
    const now = Date.now();
    const cats = input.map((c) => ({ ...c, updatedAt: now }));
    await db.putMany('categories', cats);
    const byId = new Map(cats.map((c) => [c.id, c]));
    setData((d) => {
      const existing = d.categories.map((c) => byId.get(c.id) ?? c);
      const added = cats.filter((c) => !d.categories.some((x) => x.id === c.id));
      return { ...d, categories: [...existing, ...added] };
    });
  }, []);

  const saveCategory = useCallback((cat: Category) => saveCategories([cat]), [saveCategories]);

  const deleteCategory = useCallback(async (id: string) => {
    const hasTiles = dataRef.current.tiles.some((t) => t.categoryId === id && !t.deletedAt);
    if (hasTiles) throw new Error('Move or delete the words in this category first.');
    await db.remove('categories', id);
    addTombstone('categories', id);
    setData((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }));
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...dataRef.current.settings, ...patch };
    await db.setKv('settings', next);
    if (JSON.stringify(sharedSettings(next)) !== JSON.stringify(sharedSettings(dataRef.current.settings))) setStamp('settings');
    setData((d) => ({ ...d, settings: next }));
  }, []);

  const updateMyDay = useCallback(
    async (next: MyDay, newMedia: MediaRecord[] = []) => {
      await db.setKv('myday', next);
      setStamp('myday');
      const applyUrls = await commitMedia(newMedia, { ...dataRef.current, myDay: next });
      setData((d) => ({ ...d, myDay: next, ...applyUrls(d) }));
    },
    [commitMedia],
  );

  const saveObservation = useCallback(
    async (input: Observation, newMedia: MediaRecord[] = []) => {
      const obs = { ...input, updatedAt: Date.now() };
      await db.put('observations', obs);
      const observations = [...dataRef.current.observations.filter((o) => o.id !== obs.id), obs];
      const applyUrls = await commitMedia(newMedia, { ...dataRef.current, observations });
      setData((d) => ({ ...d, observations: [...d.observations.filter((o) => o.id !== obs.id), obs], ...applyUrls(d) }));
    },
    [commitMedia],
  );

  const deleteObservation = useCallback(
    async (id: string) => {
      await db.remove('observations', id);
      addTombstone('observations', id);
      const observations = dataRef.current.observations.filter((o) => o.id !== id);
      const applyUrls = await commitMedia([], { ...dataRef.current, observations });
      setData((d) => ({ ...d, observations: d.observations.filter((o) => o.id !== id), ...applyUrls(d) }));
    },
    [commitMedia],
  );

  const recordHistory = async (events: VocabEvent[]) => {
    if (!events.length) return;
    const history = [...dataRef.current.history, ...events].slice(-2000);
    await db.setKv('history', history);
    setStamp('history');
    setData((d) => ({ ...d, history }));
  };

  const setTilesHidden = useCallback(async (ids: string[], hidden: boolean, source: VocabEvent['source'] = 'manual') => {
    const now = Date.now();
    const today = dayString();
    const changed = dataRef.current.tiles.filter((t) => ids.includes(t.id) && t.hidden !== hidden).map((t) => ({ ...t, hidden, updatedAt: now }));
    if (!changed.length) return;
    await db.putMany('tiles', changed);
    const byId = new Map(changed.map((t) => [t.id, t]));
    setData((d) => ({ ...d, tiles: d.tiles.map((t) => byId.get(t.id) ?? t) }));
    await recordHistory(changed.map((t) => vocabEvent(t, hidden ? 'hidden' : source === 'scheduled' ? 'added' : 'shown', source, today)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTileOrders = useCallback(async (changes: { id: string; order: number }[]) => {
    if (!changes.length) return;
    const now = Date.now();
    const byId = new Map(changes.map((c) => [c.id, c.order]));
    const changed = dataRef.current.tiles.filter((t) => byId.has(t.id)).map((t) => ({ ...t, order: byId.get(t.id)!, updatedAt: now }));
    await db.putMany('tiles', changed);
    const next = new Map(changed.map((t) => [t.id, t]));
    setData((d) => ({ ...d, tiles: d.tiles.map((t) => next.get(t.id) ?? t) }));
  }, []);

  const swapWord = useCallback(async (categoryId: string, slot: number, incomingId: string) => {
    const r = swapWordInto(dataRef.current.tiles, categoryId, slot, incomingId, () => newId('tile'));
    if (!r || !r.changed.length) return r;
    await db.putMany('tiles', r.changed);
    const byId = new Map(r.changed.map((t) => [t.id, t]));
    setData((d) => {
      const known = new Set(d.tiles.map((t) => t.id));
      return { ...d, tiles: [...d.tiles.map((t) => byId.get(t.id) ?? t), ...r.changed.filter((t) => !known.has(t.id))] };
    });
    const today = dayString();
    await recordHistory([vocabEvent(r.placed, 'shown', 'manual', today), ...(r.displaced ? [vocabEvent(r.displaced, 'hidden', 'manual', today)] : [])]);
    return r;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateGrow = useCallback(async (plan: GrowPlan) => {
    await db.setKv('grow', plan);
    setStamp('grow');
    setData((d) => ({ ...d, grow: plan }));
  }, []);

  const resolveGrow = useCallback(
    async (itemIds: string[], action: 'approve' | 'skip' | 'cancel') => {
      const today = dayString();
      const plan = dataRef.current.grow;
      const items = plan.items.filter((i) => itemIds.includes(i.id));
      const status = action === 'approve' ? 'added' : action === 'skip' ? 'skipped' : 'canceled';
      await updateGrow(setStatus(plan, itemIds, status, today));
      if (action === 'approve') await setTilesHidden(items.map((i) => i.tileId), false, 'scheduled');
      else {
        const tiles = dataRef.current.tiles;
        await recordHistory(
          items.map((i) => tiles.find((t) => t.id === i.tileId)).filter((t): t is Tile => Boolean(t)).map((t) => vocabEvent(t, action === 'skip' ? 'skipped' : 'canceled', 'scheduled', today)),
        );
      }
    },
    [updateGrow, setTilesHidden], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const exportBackup = useCallback(async () => {
    const media = await db.getAll('media');
    const { tiles, categories, settings, myDay, observations, grow, history } = dataRef.current;
    return createBackup({ tiles, categories, settings, media, myDay, observations, grow, history });
  }, []);

  const restoreBackup = useCallback(async (raw: RestoredData) => {
    // A restored backup is the caregiver's newest choice: mark it newer than anything in sync.
    const now = Date.now();
    const incoming: RestoredData = {
      ...raw,
      tiles: upgradeSymbolFields(raw.tiles).tiles.map((t) => ({ ...t, updatedAt: now })),
      categories: raw.categories.map((c) => ({ ...c, updatedAt: now })),
      observations: raw.observations.map((o) => ({ ...o, updatedAt: now })),
    };
    await db.replaceAll(incoming);
    stamps.current = { settings: now, myday: now, grow: now, history: now };
    await db.setKv('sync:stamps', stamps.current);
    setData((d) => {
      Object.values(d.mediaUrls).forEach((u) => URL.revokeObjectURL(u));
      const mediaUrls: Record<string, string> = {};
      const mediaMime: Record<string, string> = {};
      for (const m of incoming.media) {
        mediaUrls[m.id] = URL.createObjectURL(m.blob);
        mediaMime[m.id] = m.mime;
      }
      return {
        status: 'ready',
        tiles: incoming.tiles,
        categories: incoming.categories,
        settings: incoming.settings,
        myDay: incoming.myDay,
        observations: incoming.observations,
        grow: incoming.grow,
        history: incoming.history,
        mediaUrls,
        mediaMime,
        symbols: d.symbols,
        sync: d.sync,
      };
    });
  }, []);

  const setSync = (patch: Partial<SyncStatus>) => setData((d) => ({ ...d, sync: { ...d.sync, ...patch } }));
  const syncing = useRef(false);

  const syncNow = useCallback(async (interactive = false, justSignedIn?: SyncStatus['account']) => {
    if (syncing.current) return;
    const account = justSignedIn ?? dataRef.current.sync.account;
    if (!account) return;
    syncing.current = true;
    setSync({ phase: 'syncing', message: 'Connecting to Google…' });
    try {
      const getToken = async () => {
        // Non-interactive syncs only run while a token from an earlier tap is still valid.
        if (!interactive) {
          const t = currentToken();
          if (!t) throw Object.assign(new Error('Tap “Sync now” to reconnect to Google.'), { needsTap: true });
          return t;
        }
        return requestToken(SCOPES.drive, { loginHint: account.email });
      };
      const drive = createDriveClient(getToken);
      const cur = dataRef.current;
      const localMedia = await db.getAll('media');
      const result = await runSync({
        local: {
          tiles: cur.tiles,
          categories: cur.categories,
          observations: cur.observations,
          settings: cur.settings,
          myDay: cur.myDay,
          grow: cur.grow,
          history: cur.history,
          stamps: stamps.current,
          tombstones: tombstones.current,
        },
        deviceId: deviceId.current,
        drive,
        localMediaIds: new Set(localMedia.map((m) => m.id)),
        readLocalMedia: async (id) => localMedia.find((m) => m.id === id),
        onProgress: (message) => setSync({ message }),
      });
      const keepIds = referencedMediaIds(result.state);
      const media = [...localMedia.filter((m) => keepIds.has(m.id)), ...result.downloaded];
      // Apply only if nothing changed locally while syncing; otherwise the next sync merges it.
      const now0 = dataRef.current;
      const unchanged =
        now0.tiles === cur.tiles &&
        now0.categories === cur.categories &&
        now0.observations === cur.observations &&
        now0.settings === cur.settings &&
        now0.myDay === cur.myDay &&
        now0.grow === cur.grow &&
        now0.history === cur.history;
      if (unchanged) {
        await db.replaceAll({ ...result.state, media });
        stamps.current = result.state.stamps;
        tombstones.current = result.state.tombstones;
        await db.setKv('sync:stamps', stamps.current);
        await db.setKv('sync:tombstones', tombstones.current);
        setData((d) => {
          Object.values(d.mediaUrls).forEach((u) => URL.revokeObjectURL(u));
          const mediaUrls: Record<string, string> = {};
          const mediaMime: Record<string, string> = {};
          for (const m of media) {
            mediaUrls[m.id] = URL.createObjectURL(m.blob);
            mediaMime[m.id] = m.mime;
          }
          return { ...d, ...result.state, mediaUrls, mediaMime };
        });
      }
      const now = Date.now();
      await db.setKv('sync:lastSyncedAt', now);
      setSync({
        phase: 'idle',
        lastSyncedAt: now,
        message: result.missing.length ? `${result.missing.length} photo(s) or sound(s) are still on another device — sync that device too.` : undefined,
      });
    } catch (e) {
      setSync({ phase: 'error', message: e instanceof Error ? e.message : 'Sync failed.' });
    } finally {
      syncing.current = false;
    }
  }, []);

  const googleSignIn = useCallback(async () => {
    setSync({ phase: 'syncing', message: 'Opening Google…' });
    try {
      const t = await requestToken(SCOPES.drive, { prompt: 'select_account' });
      const profile = await fetchProfile(t);
      const previous = dataRef.current.sync.account;
      if (previous && previous.email && previous.email !== profile.email) {
        throw new Error(`This device was linked to ${previous.email}. Sign out first to switch accounts.`);
      }
      await db.setKv('google:account', profile);
      setSync({ account: profile, phase: 'idle', message: undefined });
      await syncNow(true, profile);
    } catch (e) {
      setSync({ phase: dataRef.current.sync.account ? 'error' : 'off', message: e instanceof Error ? e.message : 'Sign-in failed.' });
    }
  }, [syncNow]);

  const googleSignOut = useCallback(async () => {
    await googleRevoke();
    await db.setKv('google:account', null);
    await db.setKv('sync:lastSyncedAt', null);
    setData((d) => ({ ...d, sync: { phase: 'off' } }));
  }, []);

  const setTileSymbol = useCallback(
    async (id: string, choice: { symbol: string; symbolInfo?: SymbolInfo } | 'auto') => {
      const t = dataRef.current.tiles.find((x) => x.id === id);
      if (!t) return;
      const next: Tile =
        choice === 'auto'
          ? { ...t, symbol: t.fallbackSymbol ?? t.symbol, symbolInfo: undefined, symbolAuto: true, updatedAt: Date.now() }
          : { ...t, symbol: choice.symbol, symbolInfo: choice.symbolInfo, symbolAuto: false, fallbackSymbol: t.fallbackSymbol ?? (t.symbol && /^(mul|svg):/.test(t.symbol) ? t.symbol : undefined), updatedAt: Date.now() };
      await db.put('tiles', next);
      setData((d) => ({ ...d, tiles: d.tiles.map((x) => (x.id === id ? next : x)) }));
    },
    [],
  );

  const setTilePicture = useCallback(
    async (id: string, picked: { kind: 'symbol'; symbol: string; info: SymbolInfo } | { kind: 'photo'; photoId: string; media?: MediaRecord }) => {
      const t = dataRef.current.tiles.find((x) => x.id === id);
      if (!t) return;
      if (picked.kind === 'photo') {
        await saveTile({ ...t, photoId: picked.photoId, updatedAt: Date.now() }, picked.media ? [picked.media] : undefined);
        return;
      }
      const next: Tile = {
        ...t,
        photoId: undefined, // the chosen symbol shows instead of the photo (the photo stays in the Photo Library)
        symbol: picked.symbol,
        symbolInfo: picked.info,
        symbolAuto: false,
        fallbackSymbol: t.fallbackSymbol ?? (t.symbol && /^(mul|svg):/.test(t.symbol) ? t.symbol : undefined),
        updatedAt: Date.now(),
      };
      await db.put('tiles', next);
      setData((d) => ({ ...d, tiles: d.tiles.map((x) => (x.id === id ? next : x)) }));
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const ready = data.status === 'ready';
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let running = false;
    const keepOlderPictures = async () => {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        const { tiles, myDay } = dataRef.current;
        const urls = new Set<string>();
        for (const entry of [...tiles.filter((tile) => !tile.symbolAuto), ...allScheduleItems(myDay)]) {
          const source = remotePicture(entry.symbol, entry.symbolInfo);
          if (source) urls.add(source.url);
        }
        const saved = new Map<string, string>();
        for (const url of urls) {
          if (controller.signal.aborted) return;
          const request = new AbortController();
          const abort = () => request.abort();
          controller.signal.addEventListener('abort', abort, { once: true });
          const timer = setTimeout(abort, 8000);
          try {
            saved.set(url, await downloadPicture(url, request.signal));
          } catch {
            // An unavailable picture stays selected and can be retried at the next online launch.
          } finally {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', abort);
          }
        }
        if (controller.signal.aborted || !saved.size) return;
        const upgrade = (entry: { symbol?: string; symbolInfo?: SymbolInfo }) => {
          const source = remotePicture(entry.symbol, entry.symbolInfo);
          const localImage = source && saved.get(source.url);
          if (!source || !localImage) return false;
          entry.symbolInfo = { ...source.info, localImage };
          return true;
        };
        for (const tile of dataRef.current.tiles) {
          const next = { ...tile };
          if (!tile.symbolAuto && upgrade(next)) await patchTile(tile.id, { symbolInfo: next.symbolInfo });
        }
        const nextDay = structuredClone(dataRef.current.myDay);
        let changed = false;
        for (const item of allScheduleItems(nextDay)) {
          if (upgrade(item)) changed = true;
        }
        if (changed) await updateMyDay(nextDay);
      } finally {
        running = false;
      }
    };
    const retry = () => void keepOlderPictures().catch(() => undefined);
    retry();
    window.addEventListener('online', retry);
    return () => {
      controller.abort();
      window.removeEventListener('online', retry);
    };
  }, [ready, patchTile, updateMyDay]);

  const value = useMemo(
    () => ({
      ...data,
      setTileSymbol,
      setTilePicture,
      saveTile,
      softDeleteTile,
      restoreTile,
      purgeTile,
      moveTile,
      saveCategory,
      saveCategories,
      deleteCategory,
      updateSettings,
      updateMyDay,
      saveObservation,
      deleteObservation,
      setTilesHidden,
      swapWord,
      saveTileOrders,
      updateGrow,
      resolveGrow,
      exportBackup,
      restoreBackup,
      googleSignIn,
      googleSignOut,
      syncNow,
    }),
    [
      data,
      setTileSymbol,
      setTilePicture,
      saveTile,
      softDeleteTile,
      restoreTile,
      purgeTile,
      moveTile,
      saveCategory,
      saveCategories,
      deleteCategory,
      updateSettings,
      updateMyDay,
      saveObservation,
      deleteObservation,
      setTilesHidden,
      swapWord,
      saveTileOrders,
      updateGrow,
      resolveGrow,
      exportBackup,
      restoreBackup,
      googleSignIn,
      googleSignOut,
      syncNow,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Like useMimzi, but returns null outside the provider (for shared display components). */
export function useOptionalMimzi() {
  return useContext(Ctx);
}

export function useMimzi() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMimzi must be used inside <MimziProvider>');
  return v;
}
