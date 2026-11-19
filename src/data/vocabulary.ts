/*
 * Starter vocabulary for ages ~2–3 (an original Mimzi set — not copied from any
 * commercial AAC page set). A starting point, never a limit: every word, picture,
 * page and position can be changed in Parent Mode.
 *
 * Pictures: "mul:<name>" = Mulberry Symbols (CC BY-SA 4.0, © Steve Lee,
 * https://mulberrysymbols.org), bundled in public/symbols/mulberry. "svg:<key>" =
 * original Mimzi symbols for words Mulberry doesn't cover (src/data/symbols.tsx).
 *
 * Position matters (motor planning): each word's `order` is its fixed slot on its page.
 * `null` in a list = an intentionally empty slot.
 */
import type { Category, Tile, TileColor, WordType } from '../types';

export const HOME_PAGE = 'core';

export const CATEGORY_SEED: (Omit<Category, 'order' | 'hidden' | 'builtIn'> & { folderSymbol: string })[] = [
  { id: 'core', name: 'Home', symbol: 'mul:I', folderSymbol: 'mul:I', color: 'sun' },
  { id: 'needs', name: 'Needs', symbol: 'mul:toilet', folderSymbol: 'mul:toilet', color: 'blue', parentId: 'core' },
  { id: 'food', name: 'Food & Drinks', symbol: 'mul:plate', folderSymbol: 'mul:plate', color: 'peach', parentId: 'core' },
  { id: 'family', name: 'People', symbol: 'mul:family', folderSymbol: 'mul:family', color: 'lavender', parentId: 'core' },
  { id: 'play', name: 'Toys & Play', symbol: 'mul:toy_box', folderSymbol: 'mul:toy_box', color: 'sage', parentId: 'core' },
  { id: 'feelings', name: 'Feelings', symbol: 'mul:happy_lady', folderSymbol: 'mul:happy_lady', color: 'peach', parentId: 'core' },
  { id: 'questions', name: 'Questions', symbol: 'mul:what', folderSymbol: 'mul:what', color: 'lavender', parentId: 'core' },
  { id: 'actions', name: 'Actions', symbol: 'mul:run_,_to', folderSymbol: 'mul:run_,_to', color: 'sage', parentId: 'core' },
  { id: 'body', name: 'Body', symbol: 'mul:body_outline', folderSymbol: 'mul:body_outline', color: 'peach', parentId: 'core' },
  { id: 'places', name: 'Places', symbol: 'mul:house', folderSymbol: 'mul:house', color: 'blue', parentId: 'core' },
  { id: 'social', name: 'Social', symbol: 'mul:hello', folderSymbol: 'mul:hello', color: 'rose', parentId: 'core' },
  { id: 'safety', name: 'Safety & Comfort', symbol: 'svg:safe', folderSymbol: 'svg:safe', color: 'rose', parentId: 'core' },
  { id: 'describe', name: 'Describing', symbol: 'mul:large', folderSymbol: 'mul:large', color: 'blue', parentId: 'core' },
  { id: 'phrases', name: 'Phrases', symbol: 'mul:communication_book', folderSymbol: 'mul:communication_book', color: 'lavender', parentId: 'core' },
];

interface W {
  label: string;
  symbol: string;
  type: WordType;
  speak?: string;
  /** Hidden at first (kept in its slot; a grown-up chooses when it appears). */
  hidden?: boolean;
  link?: string;
  id?: string;
}

const w = (label: string, symbol: string, type: WordType, extra: Partial<W> = {}): W => ({ label, symbol, type, ...extra });
const folder = (pageId: string): W => {
  const c = CATEGORY_SEED.find((x) => x.id === pageId)!;
  return { label: c.name, symbol: c.folderSymbol, type: 'folder', link: pageId, id: `core-folder-${pageId}` };
};

/** Each page laid out by slot (rows of 6 match the default 4 × 6 grid). */
const PAGES: Record<string, (W | null)[]> = {
  core: [
    // page 1
    w('I', 'mul:I', 'pronoun'), w('want', 'mul:want_,_to', 'verb'), w('more', 'mul:more', 'little'), w('help', 'mul:help_,_to', 'verb'), w('stop', 'svg:stop', 'important'), w('all done', 'mul:finish', 'important'),
    w('you', 'svg:you', 'pronoun'), w('go', 'mul:go_,_to', 'verb'), w('play', 'mul:play_,_to', 'verb'), w('eat', 'mul:eat_,_to', 'verb'), w('drink', 'mul:drink', 'verb'), w('no', 'svg:no', 'important'),
    w('yes', 'svg:yes', 'social'), w('open', 'mul:open', 'verb'), w('look', 'mul:look_,_to', 'verb'), w('get', 'mul:get_,_to', 'verb'), w('again', 'svg:again', 'little'), w('wait', 'svg:wait', 'little'),
    folder('food'), folder('family'), folder('play'), folder('feelings'), folder('needs'), folder('questions'),
    // page 2
    w('me', 'svg:me', 'pronoun'), w('mine', 'svg:mine', 'pronoun'), w('this', 'svg:this', 'little'), w('that', 'svg:that', 'little'), w('come', 'mul:come_,_to', 'verb'), w('give', 'mul:give_,_to', 'verb'),
    w('put', 'mul:put_,_to', 'verb'), w('close', 'mul:close_,_to', 'verb'), w('up', 'mul:up', 'little'), w('down', 'mul:down', 'little'), w('in', 'mul:in', 'little'), w('out', 'mul:out', 'little'),
    w('on', 'mul:on', 'little'), w('off', 'mul:off', 'little'), w('break', 'svg:break', 'important'), null, null, folder('phrases'),
    folder('actions'), folder('body'), folder('places'), folder('social'), folder('safety'), folder('describe'),
  ],
  needs: [
    w('eat', 'mul:eat_,_to', 'verb'), w('drink', 'mul:drink', 'verb'), w('hungry', 'mul:hungry', 'describe'), w('thirsty', 'mul:thirsty', 'describe'), w('milk', 'mul:milk', 'noun'), w('water', 'mul:water', 'noun'),
    w('snack', 'mul:biscuits', 'noun'), w('potty', 'mul:potty_chair', 'noun'), w('pee', 'svg:pee', 'noun'), w('poop', 'svg:poop', 'noun'), w('diaper', 'mul:nappy', 'noun'), w('sleep', 'mul:sleep_female_,_to', 'verb'),
    w('tired', 'mul:yawn_,_to', 'describe'), w('hurt', 'mul:plaster', 'important'), w('break', 'svg:break', 'important'), w('help', 'mul:help_,_to', 'verb'), w('all done', 'mul:finish', 'important'), w('more', 'mul:more', 'little'),
  ],
  // The caregiver chooses which foods appear — all start hidden. Mimzi never suggests foods.
  food: [
    w('milk', 'mul:milk', 'noun', { hidden: true }), w('water', 'mul:water', 'noun', { hidden: true }), w('juice', 'mul:apple_juice', 'noun', { hidden: true }), w('apple', 'mul:apple', 'noun', { hidden: true }), w('banana', 'mul:banana', 'noun', { hidden: true }), w('grapes', 'mul:grapes', 'noun', { hidden: true }),
    w('strawberry', 'mul:strawberry', 'noun', { hidden: true }), w('bread', 'mul:bread', 'noun', { hidden: true }), w('cheese', 'mul:cheese', 'noun', { hidden: true }), w('crackers', 'mul:cracker', 'noun', { hidden: true }), w('yogurt', 'mul:yogurt', 'noun', { hidden: true }), w('cereal', 'mul:cereal_bowl', 'noun', { hidden: true }),
    w('pasta', 'mul:pasta', 'noun', { hidden: true }), w('chicken', 'mul:chicken_nuggets', 'noun', { hidden: true }), w('cookie', 'mul:biscuits', 'noun', { hidden: true }), w('cup', 'mul:cup_non_spill', 'noun', { hidden: true }), w('plate', 'mul:plate', 'noun', { hidden: true }), w('spoon', 'mul:spoon', 'noun', { hidden: true }),
    w('eat', 'mul:eat_,_to', 'verb'), w('drink', 'mul:drink', 'verb'), w('more', 'mul:more', 'little'), w('all done', 'mul:finish', 'important'), w('yummy', 'mul:yummy', 'describe'), w('yucky', 'mul:yucky', 'describe'),
  ],
  family: [
    w('Mama', 'mul:mum_parent', 'pronoun'), w('Dada', 'mul:dad_parent', 'pronoun'), w('Grandma', 'mul:grandmother', 'pronoun'), w('Grandpa', 'mul:grandfather', 'pronoun'), w('brother', 'mul:brother', 'pronoun', { hidden: true }), w('sister', 'mul:sister', 'pronoun', { hidden: true }),
    w('baby', 'mul:baby', 'pronoun', { hidden: true }), w('friend', 'svg:friend', 'pronoun'), w('teacher', 'mul:teacher_1a', 'pronoun'), w('dog', 'mul:dog', 'noun', { hidden: true }), w('cat', 'mul:cat', 'noun', { hidden: true }), w('family', 'mul:family', 'pronoun'),
  ],
  play: [
    w('ball', 'mul:ball', 'noun'), w('bubbles', 'mul:bubbles', 'noun'), w('cars', 'mul:toy_car', 'noun'), w('blocks', 'mul:bricks', 'noun'), w('books', 'mul:read_,_to', 'noun'), w('music', 'mul:music', 'noun'),
    w('dance', 'mul:dance_,_to', 'verb'), w('outside', 'mul:outside', 'noun'), w('slide', 'mul:slide', 'noun'), w('swing', 'mul:swing', 'noun'), w('jump', 'mul:jump_,_to', 'verb'), w('run', 'mul:run_,_to', 'verb'),
    w('my turn', 'svg:my-turn', 'social'), w('your turn', 'svg:your-turn', 'social'), w('teddy', 'mul:teddy_bear', 'noun', { hidden: true }), w('doll', 'mul:doll', 'noun', { hidden: true }), w('puzzle', 'mul:jigsaw_puzzle', 'noun', { hidden: true }), w('crayons', 'mul:crayon', 'noun', { hidden: true }),
    w('playdough', 'mul:playdough', 'noun', { hidden: true }), w('trampoline', 'mul:trampoline', 'noun', { hidden: true }), w('again', 'svg:again', 'little'), w('more', 'mul:more', 'little'), w('all done', 'mul:finish', 'important'), w('play', 'mul:play_,_to', 'verb'),
  ],
  feelings: [
    w('happy', 'mul:happy_lady', 'describe'), w('sad', 'mul:sad_lady', 'describe'), w('mad', 'mul:angry_lady', 'describe'), w('scared', 'mul:afraid_lady', 'describe'), w('excited', 'mul:excited_lady', 'describe'), w('frustrated', 'mul:angry_man', 'describe'),
    w('silly', 'mul:laughing_lady', 'describe'), w('calm', 'mul:serene_lady', 'describe'), w('upset', 'mul:worried_lady', 'describe'), w('tired', 'mul:yawn_,_to', 'describe'), w('hurt', 'mul:plaster', 'important'), w('break', 'svg:break', 'important'),
  ],
  questions: [
    w('what', 'mul:what', 'question'), w('where', 'mul:where', 'question'), w('who', 'mul:who', 'question'), w('why', 'mul:why', 'question'), w('how', 'mul:how', 'question'), w("what's that?", 'mul:what', 'question', { speak: "What's that?", id: 'questions-what-s-that' }),
    w('where Mama?', 'mul:where', 'question', { speak: 'Where Mama?', id: 'questions-where-mama' }),
  ],
  actions: [
    w('walk', 'mul:walk_,_to', 'verb'), w('run', 'mul:run_,_to', 'verb'), w('sit', 'mul:sit_,_to', 'verb'), w('stand', 'mul:stand_,_to', 'verb'), w('wash', 'mul:wash_hands_,_to', 'verb'), w('brush', 'mul:brush_teeth_,_to', 'verb'),
    w('push', 'mul:push_,_to', 'verb'), w('pull', 'mul:pull_,_to', 'verb'), w('throw', 'svg:throw', 'verb'), w('catch', 'mul:catch_,_to', 'verb'), w('read', 'mul:read_,_to', 'verb'), w('sing', 'mul:sing_,_to', 'verb'),
    w('dance', 'mul:dance_,_to', 'verb'), w('jump', 'mul:jump_,_to', 'verb'), w('sleep', 'mul:sleep_female_,_to', 'verb'), w('hug', 'mul:hug_,_to', 'verb'), w('clap', 'mul:clap_hands_,_to', 'verb'), w('draw', 'mul:draw_,_to', 'verb'),
  ],
  body: [
    w('head', 'mul:head', 'noun'), w('eyes', 'mul:eyes', 'noun'), w('ears', 'mul:ear', 'noun'), w('nose', 'mul:nostril', 'noun'), w('mouth', 'mul:mouth', 'noun'), w('hands', 'mul:left_hand', 'noun'),
    w('feet', 'mul:feet', 'noun'), w('belly', 'mul:stomach', 'noun'), w('arms', 'mul:arms', 'noun'), w('legs', 'mul:legs', 'noun'), w('teeth', 'mul:teeth', 'noun'), w('hurt', 'mul:plaster', 'important'),
  ],
  places: [
    w('home', 'mul:house', 'noun'), w('outside', 'mul:outside', 'noun'), w('park', 'mul:play_area', 'noun'), w('school', 'mul:school', 'noun'), w('shop', 'mul:shop', 'noun'), w('car', 'mul:car', 'noun'),
    w('bath', 'mul:bath', 'noun'), w('bed', 'mul:single_bed', 'noun'), w('garden', 'mul:back_garden', 'noun'), w('potty', 'mul:potty_chair', 'noun'),
  ],
  social: [
    w('hi', 'mul:hello', 'social'), w('bye', 'svg:bye', 'social'), w('please', 'svg:please', 'social'), w('thank you', 'svg:thank-you', 'social'), w('hug', 'mul:hug_,_to', 'social'), w('kiss', 'mul:blow_kiss_,_to', 'social'),
    w('love you', 'mul:heart_shape', 'social'), w('good morning', 'mul:morning', 'social'), w('good night', 'mul:night', 'social'), w('yes', 'svg:yes', 'social'), w('no thank you', 'svg:no', 'important'), w('my turn', 'svg:my-turn', 'social'),
  ],
  safety: [
    w('stop', 'svg:stop', 'important'), w('no', 'svg:no', 'important'), w('help', 'mul:help_,_to', 'verb'), w('hurt', 'mul:plaster', 'important'), w('hot', 'mul:hot', 'describe'), w('cold', 'mul:snow', 'describe'),
    w('scared', 'mul:afraid_lady', 'describe'), w('too loud', 'mul:loud', 'describe'), w('too bright', 'mul:bright', 'describe'), w('break', 'svg:break', 'important'), w('safe', 'svg:safe', 'describe'), w('not safe', 'svg:not-safe', 'important'),
    w('quiet', 'mul:quiet', 'describe'), w('hug', 'mul:hug_,_to', 'social'), w('all done', 'mul:finish', 'important'),
  ],
  describe: [
    w('big', 'mul:large', 'describe'), w('little', 'mul:little', 'describe'), w('wet', 'mul:wet', 'describe'), w('dry', 'mul:dry', 'describe'), w('dirty', 'mul:dirty', 'describe'), w('clean', 'mul:clean_hands', 'describe'),
    w('fast', 'mul:fast_2', 'describe'), w('slow', 'mul:snail', 'describe'), w('yummy', 'mul:yummy', 'describe'), w('yucky', 'mul:yucky', 'describe'), w('hot', 'mul:hot', 'describe'), w('cold', 'mul:snow', 'describe'),
    w('soft', 'mul:soft', 'describe'), w('loud', 'mul:loud', 'describe'), w('quiet', 'mul:quiet', 'describe'), w('broken', 'mul:broken', 'describe'),
  ],
  phrases: [
    w('More please', 'mul:more', 'social'), w('Help me', 'mul:help_,_to', 'social'), w('I want that', 'svg:that', 'social'), w('Open it', 'mul:open', 'social'), w('Go outside', 'mul:go_outside_,_to', 'social'), w('More bubbles', 'mul:bubbles', 'social'),
    w('My turn', 'svg:my-turn', 'social'), w('All done', 'mul:finish', 'important'), w('No thank you', 'svg:no', 'important'), w("I don't want it", 'svg:no', 'important'), w('It hurts', 'mul:plaster', 'important'), w('Where is Mama?', 'mul:where', 'question'),
    w('Read book', 'mul:read_,_to', 'social'), w('Play cars', 'mul:toy_car', 'social'), w('Look at that', 'mul:look_,_to', 'social'), w("I don't like that", 'svg:no', 'important'),
  ],
};

/** Words that show an ASL sign drawing under "See sign" (each checked against an ASL reference). */
export const ASL_BY_LABEL: Record<string, string> = {
  more: 'more',
  want: 'want',
  help: 'help',
  stop: 'stop',
  'all done': 'all-done',
  yes: 'yes',
  no: 'no',
  play: 'play',
  eat: 'eat',
  drink: 'drink',
  milk: 'milk',
  sleep: 'sleep',
  hurt: 'hurt',
  please: 'please',
  'thank you': 'thank-you',
  Mama: 'mom',
  Dada: 'dad',
  'Help me': 'help',
  'All done': 'all-done',
  'It hurts': 'hurt',
};

/** Communication that should stay reachable — Mimzi warns before these are hidden. */
export const ESSENTIAL_TILE_IDS = ['core-help', 'core-stop', 'core-no', 'core-break', 'core-all-done'];

/** Stable id for a seeded word, e.g. core-all-done. */
export function seedTileId(categoryId: string, label: string): string {
  return `${categoryId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** The always-visible quick words: Help, Stop, No, More, All done. */
export const QUICK_TILE_IDS = ['core-help', 'core-stop', 'core-no', 'core-more', 'core-all-done'];

const FAVORITES = new Set(['play-bubbles', 'play-cars', 'play-books', 'play-outside', 'needs-milk', 'play-music']);

const CATEGORY_COLOR: Record<string, TileColor> = Object.fromEntries(CATEGORY_SEED.map((c) => [c.id, c.color]));

export function buildSeedCategories(): Category[] {
  return CATEGORY_SEED.map(({ folderSymbol: _f, ...c }, i) => ({ ...c, order: i, hidden: false, builtIn: true }));
}

export function buildSeedTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (const [categoryId, slots] of Object.entries(PAGES)) {
    slots.forEach((word, order) => {
      if (!word) return;
      const id = word.id ?? seedTileId(categoryId, word.label);
      tiles.push({
        id,
        label: word.label,
        speak: word.speak ?? word.label,
        categoryId,
        order,
        symbol: word.symbol,
        // Mimzi picks starter pictures: ARASAAC by default, this bundled one until it's downloaded.
        symbolAuto: true,
        fallbackSymbol: word.symbol,
        aslSign: ASL_BY_LABEL[word.label],
        wordType: word.type,
        linkTo: word.link,
        color: CATEGORY_COLOR[categoryId] ?? 'cream',
        favorite: FAVORITES.has(id),
        hidden: Boolean(word.hidden),
        builtIn: true,
      });
    });
  }
  return tiles;
}

/** Every Mulberry symbol name the starter vocabulary uses (for offline pre-caching and tests). */
export function seedMulberryNames(): string[] {
  const names = new Set<string>();
  for (const t of buildSeedTiles()) if (t.symbol?.startsWith('mul:')) names.add(t.symbol.slice(4));
  for (const c of CATEGORY_SEED) if (c.symbol.startsWith('mul:')) names.add(c.symbol.slice(4));
  return [...names];
}
