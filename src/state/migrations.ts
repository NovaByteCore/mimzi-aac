/*
 * One-time upgrades for devices that already have Mimzi data. They add what's new
 * without moving or overwriting anything a caregiver has customised.
 */
import * as db from '../lib/db';
import { ARASAAC_SKIP, KEEP_BUNDLED, STARTER_PICTOS } from '../lib/arasaac';
import { buildSeedCategories, buildSeedTiles } from '../data/vocabulary';
import { slotMap } from '../lib/grid';
import type { Category, Tile } from '../types';

const OLD_SEED_NAMES: Record<string, string> = { family: 'My People', core: 'Core', play: 'Play', safety: 'Safety', describe: 'Describe', food: 'Food & Drink' };

/**
 * V3 vocabulary: AAC symbols, word types, folder pages, new pages (Questions, Places…).
 * Mutates the passed arrays so the caller can keep using them.
 */
export async function migrateVocabularyV3(tiles: Tile[], categories: Category[]): Promise<void> {
  if (await db.getKv<boolean>('migrated:vocab3')) return;
  const seedCats = buildSeedCategories();
  const catChanges: Category[] = [];
  for (const seed of seedCats) {
    const existing = categories.find((c) => c.id === seed.id);
    if (!existing) {
      const add = { ...seed, order: Math.max(-1, ...categories.map((c) => c.order)) + 1 };
      categories.push(add);
      catChanges.push(add);
    } else {
      const renamed = existing.name === OLD_SEED_NAMES[seed.id] ? seed.name : existing.name;
      const next = { ...existing, name: renamed, parentId: existing.parentId ?? seed.parentId, symbol: existing.symbol.startsWith('mul:') || existing.updatedAt ? existing.symbol : seed.symbol };
      categories.splice(categories.indexOf(existing), 1, next);
      catChanges.push(next);
    }
  }
  if (catChanges.length) await db.putMany('categories', catChanges);

  const tileChanges: Tile[] = [];
  for (const seed of buildSeedTiles()) {
    const existing = tiles.find((t) => t.id === seed.id);
    if (existing) {
      const untouched = !existing.updatedAt;
      const next: Tile = {
        ...existing,
        wordType: existing.wordType ?? seed.wordType,
        aslSign: existing.aslSign ?? seed.aslSign,
        linkTo: existing.linkTo ?? seed.linkTo,
        symbol: untouched ? seed.symbol : existing.symbol,
      };
      tiles.splice(tiles.indexOf(existing), 1, next);
      tileChanges.push(next);
    } else {
      // New word: use its planned slot if free on that page, otherwise the first free slot.
      const page = tiles.filter((t) => t.categoryId === seed.categoryId && !t.deletedAt);
      const used = new Set(slotMap(page).keys());
      let order = seed.order;
      if (used.has(order)) {
        order = 0;
        while (used.has(order)) order++;
      }
      const add = { ...seed, order };
      tiles.push(add);
      tileChanges.push(add);
    }
  }
  if (tileChanges.length) await db.putMany('tiles', tileChanges);
  await db.setKv('migrated:vocab3', true);
}

/**
 * Multi-library symbols: starter words whose picture a grown-up never changed become
 * "Mimzi-chosen", so they follow the default style (ARASAAC). Pictures a grown-up chose,
 * photos, positions, labels, speech and signs are left exactly as they are.
 */
/** Pure version of the symbol upgrade (also used for backups made by older versions). */
export function upgradeSymbolFields(tiles: Tile[]): { tiles: Tile[]; changed: Tile[] } {
  const seeds = new Map(buildSeedTiles().map((t) => [t.id, t]));
  const changed: Tile[] = [];
  const out = tiles.map((t) => {
    const seed = seeds.get(t.id);
    if (!seed || t.symbolAuto !== undefined) return t;
    const untouched = !t.symbol || t.symbol === seed.symbol;
    const next: Tile = untouched ? { ...t, symbolAuto: true, fallbackSymbol: seed.symbol } : { ...t, symbolAuto: false };
    changed.push(next);
    return next;
  });
  return { tiles: out, changed };
}

export async function migrateSymbolsV4(tiles: Tile[]): Promise<void> {
  if (await db.getKv<boolean>('migrated:symbols4')) return;
  const { tiles: next, changed } = upgradeSymbolFields(tiles);
  tiles.splice(0, tiles.length, ...next);
  if (changed.length) await db.putMany('tiles', changed);
  await db.setKv('migrated:symbols4', true);
}

/**
 * ARASAAC pick fixes (Nov 2026 review against the live service): forget known-bad automatic
 * picks (e.g. a firework for "crackers", the WHO logo for "who") and retry words that had no
 * match, now that better search words exist. Only automatic pictures are touched.
 */
export async function fixArasaacPicksV2(tiles: Tile[]): Promise<void> {
  if (((await db.getKv<number>('symbols:picks')) ?? 0) >= 3) return;
  const changed: Tile[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const pinned = STARTER_PICTOS[t.id];
    const bad = t.autoArasaac && (ARASAAC_SKIP.has(t.autoArasaac.id) || KEEP_BUNDLED.has(t.id) || (pinned && pinned.id !== t.autoArasaac.id));
    if (bad) {
      const { autoArasaac: _old, ...rest } = t;
      tiles[i] = { ...rest, updatedAt: Date.now() } as Tile;
      changed.push(tiles[i]);
    }
  }
  if (changed.length) await db.putMany('tiles', changed);
  await db.setKv('symbols:missing', {});
  await db.setKv('symbols:picks', 3);
}
