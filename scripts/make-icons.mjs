// Renders the PNG app icons from public/icons/icon.svg. Run with `npm run icons`.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = await readFile(dir + 'icon.svg');

await sharp(svg).resize(192, 192).png().toFile(dir + 'icon-192.png');
await sharp(svg).resize(512, 512).png().toFile(dir + 'icon-512.png');
// Apple flattens transparency and applies its own corner mask.
await sharp(svg).resize(180, 180).flatten({ background: '#DCECF8' }).png().toFile(dir + 'apple-touch-icon.png');
// Maskable: keep the artwork inside the 80% safe zone.
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#DCECF8' } })
  .composite([{ input: inner, top: 56, left: 56 }])
  .png()
  .toFile(dir + 'icon-maskable-512.png');

console.log('Icons written to', dir);
