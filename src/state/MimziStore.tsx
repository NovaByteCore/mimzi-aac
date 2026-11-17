/*
 * App data store: loads everything from IndexedDB once, keeps it in memory for instant
 * taps, and writes every change straight back to IndexedDB.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Category, MediaRecord, Settings, Tile } from '../types';
import * as db from '../lib/db';
import { buildSeedCategories, buildSeedTiles } from '../data/vocabulary';
import { mergeSettings } from '../lib/defaults';
import { moveTile as computeMove } from '../lib/grid';
import { createBackup, type BackupFile } from '../lib/backup';

export interface MimziData {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  tiles: Tile[];
  categories: Category[];
  settings: Settings;
  mediaUrls: Record<string, string>;
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
  exportBackup(): Promise<BackupFile>;
  restoreBackup(data: { tiles: Tile[]; categories: Category[]; settings: Settings; media: MediaRecord[] }): Promise<void>;
}

const Ctx = createContext<(MimziData & MimziActions) | null>(null);

function mediaIdsOf(tiles: Tile[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tiles) for (const id of [t.photoId, t.audioId, t.signId]) if (id) ids.add(id);
  return ids;
}

export function MimziProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MimziData>({
    status: 'loading',
    tiles: [],
    categories: [],
    settings: mergeSettings(undefined),
    mediaUrls: {},
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
        }
        const [tiles, categories, media, saved] = await Promise.all([
          db.getAll('tiles'),
          db.getAll('categories'),
          db.getAll('media'),
          db.getKv<Partial<Settings>>('settings'),
        ]);
        const mediaUrls: Record<string, string> = {};
        for (const m of media) mediaUrls[m.id] = URL.createObjectURL(m.blob);
        if (!cancelled) {
          setData({ status: 'ready', tiles, categories, settings: mergeSettings(saved), mediaUrls });
        }
      } catch (e) {
        if (!cancelled) setData((d) => ({ ...d, status: 'error', error: e instanceof Error ? e.message : String(e) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveTile = useCallback(async (tile: Tile, newMedia: MediaRecord[] = []) => {
    if (newMedia.length) await db.putMany('media', newMedia);
    await db.put('tiles', tile);
    void db.requestPersistentStorage();
    // Drop media the tile no longer uses (if nothing else uses it).
    const prev = dataRef.current.tiles.find((t) => t.id === tile.id);
    const nextTiles = [...dataRef.current.tiles.filter((t) => t.id !== tile.id), tile];
    const stillUsed = mediaIdsOf(nextTiles);
    const orphaned = prev ? [...mediaIdsOf([prev])].filter((id) => !stillUsed.has(id)) : [];
    for (const id of orphaned) await db.remove('media', id);
    setData((d) => {
      const mediaUrls = { ...d.mediaUrls };
      for (const m of newMedia) mediaUrls[m.id] = URL.createObjectURL(m.blob);
      for (const id of orphaned) {
        if (mediaUrls[id]) URL.revokeObjectURL(mediaUrls[id]);
        delete mediaUrls[id];
      }
      return { ...d, tiles: [...d.tiles.filter((t) => t.id !== tile.id), tile], mediaUrls };
    });
  }, []);

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
      const live = dataRef.current.tiles.filter((x) => x.categoryId === t.categoryId && !x.deletedAt);
      const order = live.length ? Math.max(...live.map((x) => x.order)) + 1 : 0;
      const categoryExists = dataRef.current.categories.some((c) => c.id === t.categoryId);
      await patchTile(id, { deletedAt: undefined, order, categoryId: categoryExists ? t.categoryId : 'core' });
    },
    [patchTile],
  );

  const purgeTile = useCallback(async (id: string) => {
    const t = dataRef.current.tiles.find((x) => x.id === id);
    if (!t) return;
    await db.remove('tiles', id);
    const remaining = dataRef.current.tiles.filter((x) => x.id !== id);
    const stillUsed = mediaIdsOf(remaining);
    const orphaned = [...mediaIdsOf([t])].filter((m) => !stillUsed.has(m));
    for (const m of orphaned) await db.remove('media', m);
    setData((d) => {
      const mediaUrls = { ...d.mediaUrls };
      for (const m of orphaned) {
        if (mediaUrls[m]) URL.revokeObjectURL(mediaUrls[m]);
        delete mediaUrls[m];
      }
      return { ...d, tiles: d.tiles.filter((x) => x.id !== id), mediaUrls };
    });
  }, []);

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

  const exportBackup = useCallback(async () => {
    const media = await db.getAll('media');
    const { tiles, categories, settings } = dataRef.current;
    return createBackup({ tiles, categories, settings, media });
  }, []);

  const restoreBackup = useCallback(
    async (incoming: { tiles: Tile[]; categories: Category[]; settings: Settings; media: MediaRecord[] }) => {
      await db.replaceAll(incoming);
      setData((d) => {
        Object.values(d.mediaUrls).forEach((u) => URL.revokeObjectURL(u));
        const mediaUrls: Record<string, string> = {};
        for (const m of incoming.media) mediaUrls[m.id] = URL.createObjectURL(m.blob);
        return {
          status: 'ready',
          tiles: incoming.tiles,
          categories: incoming.categories,
          settings: incoming.settings,
          mediaUrls,
        };
      });
    },
    [],
  );

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
      exportBackup,
      restoreBackup,
    }),
    [data, saveTile, softDeleteTile, restoreTile, purgeTile, moveTile, saveCategory, saveCategories, deleteCategory, updateSettings, exportBackup, restoreBackup],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMimzi() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMimzi must be used inside <MimziProvider>');
  return v;
}
