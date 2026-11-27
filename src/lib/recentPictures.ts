/*
 * Recent pictures: the last pictures a grown-up used (on the board or in My Day), shown first
 * in every picture picker. They're kept on this device, and their images are saved for
 * offline use by the service worker, so they work in Airplane Mode on the tablet.
 */
import * as db from './db';
import { arasaacUrl, mulberryUrl } from './symbols';
import type { SymbolInfo } from '../types';

export interface RecentPicture {
  symbol: string;
  info: SymbolInfo;
  at: number;
}

const KEY = 'pictures:recent';
const MAX = 24;
let cache: RecentPicture[] | null = null;
const listeners = new Set<(list: RecentPicture[]) => void>();

export async function getRecentPictures(): Promise<RecentPicture[]> {
  if (cache) return cache;
  try {
    cache = ((await db.getKv<RecentPicture[]>(KEY)) ?? []).filter((r) => r && r.symbol && r.info);
  } catch {
    cache = [];
  }
  return cache;
}

export async function addRecentPicture(symbol: string, info: SymbolInfo | undefined): Promise<void> {
  if (!symbol || !info || symbol.startsWith('photo:')) return;
  const list = await getRecentPictures();
  const next = [{ symbol, info, at: Date.now() }, ...list.filter((r) => r.symbol !== symbol)].slice(0, MAX);
  cache = next;
  try {
    await db.setKv(KEY, next);
  } catch {
    /* best effort */
  }
  listeners.forEach((l) => l(next));
}

export function onRecentPictures(cb: (list: RecentPicture[]) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Image URLs to keep offline for a list of picture references. */
export function pictureUrls(symbols: { symbol: string; info?: SymbolInfo }[]): string[] {
  const out = new Set<string>();
  for (const { symbol, info } of symbols) {
    if (symbol.startsWith('arasaac:')) out.add(arasaacUrl(symbol.slice(8)));
    else if (symbol.startsWith('mul:')) out.add(mulberryUrl(symbol.slice(4)));
    else if (symbol.startsWith('os:') && info?.url) out.add(info.url);
  }
  return [...out];
}

/** Test hook. */
export function resetRecentPicturesForTests(): void {
  cache = null;
}
