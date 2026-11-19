import { WORD_TYPE_COLOR, type Settings, type Tile, type TileColor } from '../types';

/** Colour a tile is shown in: AAC word-type colour coding, or the tile's own colour. */
export function displayColor(tile: Pick<Tile, 'color' | 'wordType'>, settings: Pick<Settings, 'colorMode'> | undefined): TileColor {
  if ((settings?.colorMode ?? 'wordType') === 'wordType' && tile.wordType) return WORD_TYPE_COLOR[tile.wordType];
  return tile.color;
}

/** URL of a bundled Mulberry symbol. */
export function mulberryUrl(name: string): string {
  const base = ((import.meta.env ?? {}) as { BASE_URL?: string }).BASE_URL ?? '/';
  return `${base}symbols/mulberry/${encodeURIComponent(name)}.svg`;
}
