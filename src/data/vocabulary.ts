/*
 * Starter vocabulary for ages ~24–36 months. This is a starting point, not a limit:
 * every word, picture, category and position can be changed in Parent Mode, and
 * nothing is locked behind levels or lessons.
 */
import type { Category, Tile, TileColor } from '../types';

export const CATEGORY_SEED: Omit<Category, 'order' | 'hidden' | 'builtIn'>[] = [
  { id: 'core', name: 'Core', symbol: 'svg:more', color: 'sun' },
  { id: 'needs', name: 'Needs', symbol: '🥛', color: 'blue' },
  { id: 'feelings', name: 'Feelings', symbol: '😊', color: 'peach' },
  { id: 'family', name: 'My People', symbol: '👨‍👩‍👦', color: 'lavender' },
  { id: 'play', name: 'Play', symbol: '⚽', color: 'sage' },
  { id: 'social', name: 'Social', symbol: '👋', color: 'rose' },
  { id: 'actions', name: 'Actions', symbol: '🏃', color: 'cream' },
  { id: 'body', name: 'Body', symbol: '👃', color: 'peach' },
  { id: 'safety', name: 'Safety', symbol: 'svg:safe', color: 'rose' },
  { id: 'describe', name: 'Describe', symbol: '🐘', color: 'blue' },
  { id: 'phrases', name: 'Phrases', symbol: '💬', color: 'lavender' },
];

type Word = [label: string, symbol: string, speak?: string];

const WORDS: Record<string, Word[]> = {
  core: [
    ['I', 'svg:me'], ['want', 'svg:want'], ['more', 'svg:more'], ['go', 'svg:go'],
    ['stop', 'svg:stop'], ['help', 'svg:help'], ['open', 'svg:open'], ['close', 'svg:close'],
    ['up', 'svg:up'], ['down', 'svg:down'], ['in', 'svg:in'], ['out', 'svg:out'],
    ['on', 'svg:on'], ['off', 'svg:off'], ['again', 'svg:again'], ['all done', 'svg:all-done'],
    ['look', '👀'], ['come', 'svg:come'], ['get', 'svg:get'], ['give', 'svg:give'],
    ['play', '🧸'], ['yes', 'svg:yes'], ['no', 'svg:no'], ['mine', 'svg:mine'],
    ['me', 'svg:me'], ['you', 'svg:you'], ['this', 'svg:this'], ['that', 'svg:that'],
    ['wait', 'svg:wait'],
  ],
  needs: [
    ['eat', '🍽️'], ['drink', '🥤'], ['hungry', '😋'], ['thirsty', '💧'], ['milk', '🥛'],
    ['water', '🚰'], ['snack', '🍪'], ['potty', '🚽'], ['pee', '💦'], ['poop', '💩'],
    ['diaper', '🩲'], ['sleep', '😴'], ['tired', '🥱'], ['hurt', '🤕'], ['break', 'svg:break'],
  ],
  feelings: [
    ['happy', '😊'], ['sad', '😢'], ['mad', '😠'], ['scared', '😨'], ['excited', '🤩'],
    ['silly', '🤪'], ['frustrated', '😤'], ['upset', '😣'], ['calm', '😌'],
  ],
  family: [
    ['Mama', '👩'], ['Dada', '👨'], ['Grandma', '👵'], ['Grandpa', '👴'],
    ['friend', '🧒'], ['teacher', '🧑‍🏫'], ['pet', '🐶'],
  ],
  play: [
    ['ball', '⚽'], ['bubbles', '🫧'], ['cars', '🚗'], ['blocks', '🧱'], ['books', '📚'],
    ['music', '🎵'], ['outside', '🌳'], ['jump', '🦘'], ['run', '🏃'], ['slide', '🛝'],
    ['swing', '🌈'], ['my turn', 'svg:me'], ['your turn', 'svg:you'],
  ],
  social: [
    ['hi', '👋'], ['bye', '👋'], ['please', '🙏'], ['thank you', '💛'], ['hug', '🤗'],
    ['kiss', '😘'], ['love you', '❤️'], ['good morning', '🌅'], ['good night', '🌙'],
  ],
  actions: [
    ['walk', '🚶'], ['run', '🏃'], ['sit', '🪑'], ['stand', '🧍'], ['wash', '🧼'],
    ['brush', '🪥'], ['push', '👐'], ['pull', '🪢'], ['throw', '🤾'], ['catch', '🧤'],
    ['read', '📖'], ['sing', '🎤'],
  ],
  body: [
    ['head', '🙂'], ['eyes', '👀'], ['ears', '👂'], ['nose', '👃'], ['mouth', '👄'],
    ['hands', '🙌'], ['feet', '🦶'], ['belly', '🫃'], ['arm', '💪'], ['leg', '🦵'], ['teeth', '🦷'],
  ],
  safety: [
    ['stop', 'svg:stop'], ['no', 'svg:no'], ['help', 'svg:help'], ['hurt', '🤕'],
    ['hot', '🔥'], ['cold', '🧊'], ['scared', '😨'], ['too loud', '🙉'],
    ['too bright', '😎'], ['break', 'svg:break'], ['safe', 'svg:safe'], ['not safe', 'svg:not-safe'],
  ],
  describe: [
    ['big', '🐘'], ['little', '🐭'], ['wet', '💧'], ['dry', '☀️'], ['dirty', '🟤'],
    ['clean', '✨'], ['fast', '🐆'], ['slow', '🐢'], ['yummy', '😋'], ['yucky', '🤢'],
  ],
  phrases: [
    ['More please', 'svg:more'], ['Help me', 'svg:help'], ['I want that', 'svg:that'],
    ['Open it', 'svg:open'], ['Go outside', '🌳'], ['More bubbles', '🫧'], ['My turn', 'svg:me'],
    ['All done', 'svg:all-done'], ['No thank you', 'svg:no'], ["I don't want it", 'svg:no'],
    ['It hurts', '🤕'], ['Where Mama?', '👩'], ['Read book', '📖'], ['Play cars', '🚗'],
  ],
};

const CATEGORY_COLOR: Record<string, TileColor> = Object.fromEntries(CATEGORY_SEED.map((c) => [c.id, c.color]));

/** Stable id for a seeded word, e.g. core-all-done. */
export function seedTileId(categoryId: string, label: string): string {
  return `${categoryId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** The always-visible quick words: Help, Stop, No, More, All done. */
export const QUICK_TILE_IDS = ['core-help', 'core-stop', 'core-no', 'core-more', 'core-all-done'];

const FAVORITES = new Set(['play-bubbles', 'play-cars', 'play-books', 'play-outside', 'needs-milk', 'play-music']);

export function buildSeedCategories(): Category[] {
  return CATEGORY_SEED.map((c, i) => ({ ...c, order: i, hidden: false, builtIn: true }));
}

export function buildSeedTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (const [categoryId, words] of Object.entries(WORDS)) {
    words.forEach(([label, symbol, speak], order) => {
      const id = seedTileId(categoryId, label);
      tiles.push({
        id,
        label,
        speak: speak ?? label,
        categoryId,
        order,
        symbol,
        color: CATEGORY_COLOR[categoryId] ?? 'cream',
        favorite: FAVORITES.has(id),
        hidden: false,
        builtIn: true,
      });
    });
  }
  return tiles;
}
