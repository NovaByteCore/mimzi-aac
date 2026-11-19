/*
 * One-time upgrades for devices that already have Mimzi data. They add what's new
 * without moving or overwriting anything a caregiver has customised.
 */
import * as db from '../lib/db';
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
