/*
 * Build-time: choose the default ARASAAC picture for every starter word and save the images
 * inside the app (public/symbols/arasaac/<id>.webp), so the board looks exactly the same
 * online, offline and on a brand-new install in Airplane Mode.
 *
 * Uses the same choices as the app (pinned pictures, curated search words, ARASAAC's
 * "best search", known-bad matches skipped). Needs the internet; run it in CI:
 *   npx tsx scripts/fetch-default-pictures.ts
 * Writes src/data/defaultPictures.json. ARASAAC pictograms: Sergio Palao, Government of
 * Aragón, CC BY-NC-SA 4.0 (credited in Parent Mode → Symbol Library).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { buildSeedTiles } from '../src/data/vocabulary';
import { bestArasaac, keepBundled, pinnedPicto, starterQueries } from '../src/lib/arasaac';
import { everydayPictures } from '../src/lib/pictureSets';

const OUT_DIR = 'public/symbols/arasaac';
const SIZE = 320;

async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

const tiles: Record<string, { id: number; name: string }> = {};
const missing: string[] = [];
for (const t of buildSeedTiles()) {
  if (keepBundled(t)) continue;
  const pinned = pinnedPicto(t);
  if (pinned) {
    tiles[t.id] = pinned;
    continue;
  }
  let found: { id: number; name: string } | undefined;
  for (const q of starterQueries(t)) {
    const hit = await retry(() => bestArasaac(q));
    if (hit) {
      found = { id: Number(hit.info.id), name: hit.name };
      break;
    }
  }
  if (found) tiles[t.id] = found;
  else missing.push(t.id);
}
const everyday = everydayPictures().map((p) => Number(p.symbol.slice(8)));
const ids = [...new Set([...Object.values(tiles).map((x) => x.id), ...everyday])].sort((a, b) => a - b);

await mkdir(OUT_DIR, { recursive: true });
let bytes = 0;
for (const id of ids) {
  const png = await retry(async () => {
    const res = await fetch(`https://api.arasaac.org/v1/pictograms/${id}?download=false`);
    if (!res.ok) throw new Error(`${id}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });
  const webp = await sharp(png).resize(SIZE, SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).webp({ quality: 82 }).toBuffer();
  bytes += webp.length;
  await writeFile(`${OUT_DIR}/${id}.webp`, webp);
}
await writeFile(
  'src/data/defaultPictures.json',
  JSON.stringify({ version: 1, source: 'ARASAAC (Sergio Palao, Government of Aragón, CC BY-NC-SA 4.0)', size: SIZE, tiles, missing, ids }, null, 1) + '\n',
);
console.log(`Default pictures: ${Object.keys(tiles).length} words, ${ids.length} images, ${(bytes / 1024).toFixed(0)} KB; no match: ${missing.join(', ') || 'none'}`);
