/*
 * App data store: loads everything from IndexedDB once, keeps it in memory for instant
 * taps, and writes every change straight back to IndexedDB.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Category, MediaRecord, MyDay, Observation, Settings, Tile } from '../types';
import * as db from '../lib/db';
import { buildSeedCategories, buildSeedTiles, CATEGORY_SEED } from '../data/vocabulary';
import { mergeMyDay, mergeSettings } from '../lib/defaults';
import { moveTile as computeMove } from '../lib/grid';
import { createBackup, type BackupFile, type RestoredData } from '../lib/backup';
import { referencedMediaIds } from '../lib/media';

export interface MimziData {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  tiles: Tile[];
  categories: Category[];
  settings: Settings;
  myDay: MyDay;
  observations: Observation[];
  mediaUrls: Record<string, string>;
  /** MIME type per media id (e.g. to tell a GIF sign from a video sign). */
  mediaMime: Record<string, string>;
}

export interface MimziActions {
  saveTile(tile: Tile, newMedia?: MediaRecord[]): Promise<void>;
  softDeleteTile(id: string): Promise<void>;
  restoreTile(id: string): Promise<void>;
  purgeTile(id: string): Promise<void>;
  moveTile(id: string, dir: -1 | 1): Promise<void>;
  saveCategory(cat: Category): Promise<void>;
  saveCategories(cats: Category[]): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  updateMyDay(next: MyDay, newMedia?: MediaRecord[]): Promise<void>;
  saveObservation(obs: Observation, newMedia?: MediaRecord[]): Promise<void>;
  deleteObservation(id: string): Promise<void>;
  exportBackup(): Promise<BackupFile>;
  restoreBackup(data: RestoredData): Promise<void>;
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
    mediaUrls: {},
    mediaMime: {},
  });
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await db.getKv<boolean>('seeded'))) {
          await db.putMany('categories', buildSeedCategories());
          await db.putMany('tiles', buildSeedTiles());
          await db.setKv('settings', mergeSettings(undefined));
          await db.setKv('seeded', true);
          for (const c of CATEGORY_SEED) await db.setKv(`migrated:cat:${c.id}`, true);
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
            mediaUrls,
            mediaMime,
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
    async (tile: Tile, newMedia: MediaRecord[] = []) => {
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
    const next = { ...t, ...patch };
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
      const live = dataRef.current.tiles.filter((x) => x.categoryId === categoryId && !x.deletedAt);
      const order = live.length ? Math.max(...live.map((x) => x.order)) + 1 : 0;
      await patchTile(id, { deletedAt: undefined, order, categoryId });
    },
    [patchTile],
  );

  const purgeTile = useCallback(
    async (id: string) => {
      await db.remove('tiles', id);
      const tiles = dataRef.current.tiles.filter((x) => x.id !== id);
      const applyUrls = await commitMedia([], { ...dataRef.current, tiles });
      setData((d) => ({ ...d, tiles: d.tiles.filter((x) => x.id !== id), ...applyUrls(d) }));
    },
    [commitMedia],
  );

  const moveTile = useCallback(async (id: string, dir: -1 | 1) => {
    const changed = computeMove(dataRef.current.tiles, id, dir);
    if (!changed.length) return;
    await db.putMany('tiles', changed);
    const byId = new Map(changed.map((t) => [t.id, t]));
    setData((d) => ({ ...d, tiles: d.tiles.map((t) => byId.get(t.id) ?? t) }));
  }, []);

  const saveCategories = useCallback(async (cats: Category[]) => {
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
    setData((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }));
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...dataRef.current.settings, ...patch };
    await db.setKv('settings', next);
    setData((d) => ({ ...d, settings: next }));
  }, []);

  const updateMyDay = useCallback(
    async (next: MyDay, newMedia: MediaRecord[] = []) => {
      await db.setKv('myday', next);
      const applyUrls = await commitMedia(newMedia, { ...dataRef.current, myDay: next });
      setData((d) => ({ ...d, myDay: next, ...applyUrls(d) }));
    },
    [commitMedia],
  );

  const saveObservation = useCallback(
    async (obs: Observation, newMedia: MediaRecord[] = []) => {
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
      const observations = dataRef.current.observations.filter((o) => o.id !== id);
      const applyUrls = await commitMedia([], { ...dataRef.current, observations });
      setData((d) => ({ ...d, observations: d.observations.filter((o) => o.id !== id), ...applyUrls(d) }));
    },
    [commitMedia],
  );

  const exportBackup = useCallback(async () => {
    const media = await db.getAll('media');
    const { tiles, categories, settings, myDay, observations } = dataRef.current;
    return createBackup({ tiles, categories, settings, media, myDay, observations });
  }, []);

  const restoreBackup = useCallback(async (incoming: RestoredData) => {
    await db.replaceAll(incoming);
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
        mediaUrls,
        mediaMime,
      };
    });
  }, []);

  const value = useMemo(
    () => ({
      ...data,
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
      exportBackup,
      restoreBackup,
    }),
    [
      data,
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
      exportBackup,
      restoreBackup,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMimzi() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMimzi must be used inside <MimziProvider>');
  return v;
}
