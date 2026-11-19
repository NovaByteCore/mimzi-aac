export type TileColor =
  | 'blue'
  | 'cream'
  | 'sage'
  | 'lavender'
  | 'peach'
  | 'sun'
  | 'rose'
  | 'white'
  | 'yellow'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'grey';

export const TILE_COLORS: TileColor[] = ['yellow', 'green', 'blue', 'orange', 'pink', 'purple', 'red', 'white', 'grey', 'cream', 'sage', 'lavender', 'peach', 'sun', 'rose'];

/**
 * Word types for AAC colour coding (Mimzi's version of the Modified Fitzgerald Key):
 * people & pronouns yellow · actions green · describing blue · things orange ·
 * social & phrases pink · questions purple · no/stop/important red · little words white · folders grey.
 */
export type WordType = 'pronoun' | 'verb' | 'describe' | 'noun' | 'social' | 'question' | 'important' | 'little' | 'folder';

export const WORD_TYPE_COLOR: Record<WordType, TileColor> = {
  pronoun: 'yellow',
  verb: 'green',
  describe: 'blue',
  noun: 'orange',
  social: 'pink',
  question: 'purple',
  important: 'red',
  little: 'white',
  folder: 'grey',
};

export const WORD_TYPE_LABEL: Record<WordType, string> = {
  pronoun: 'People & pronouns',
  verb: 'Actions',
  describe: 'Describing',
  noun: 'Things',
  social: 'Social & phrases',
  question: 'Questions',
  important: 'No / stop / important',
  little: 'Little words',
  folder: 'Folders',
};

export interface Tile {
  id: string;
  /** Text shown on the tile. */
  label: string;
  /** What Mimzi says aloud. Defaults to the label. */
  speak: string;
  /** Optional spelling just for the voice (e.g. "Ree-ah" for "Ria"). Never shown. */
  pronunciation?: string;
  /** Optional speech language for this word (BCP-47), e.g. "es-US". */
  lang?: string;
  /** Word type for colour coding. */
  wordType?: WordType;
  /** Folder button: opens this page instead of speaking. */
  linkTo?: string;
  categoryId: string;
  /** Position inside its category. Only a caregiver changes this — never automatic. */
  order: number;
  /**
   * The picture: "arasaac:<id>", "mul:<file>", "svg:<key>", "os:<repo>:<id>" (see lib/symbols.ts),
   * otherwise short text a caregiver typed.
   */
  symbol?: string;
  /** Source, author and licence of the chosen symbol (library symbols). */
  symbolInfo?: SymbolInfo;
  /**
   * true = Mimzi chooses the picture (starter words): it follows the default symbol style.
   * A grown-up choosing a picture sets this to false, and Mimzi never changes it again.
   */
  symbolAuto?: boolean;
  /** The ARASAAC pictogram Mimzi found for this word (used when the style is ARASAAC). */
  autoArasaac?: { id: number; name: string };
  /** Bundled picture (Mulberry / Mimzi) shown until a downloaded symbol is available offline. */
  fallbackSymbol?: string;
  /** Key of a Mimzi ASL sign drawing (src/data/aslSigns.tsx), shown when ASL drawings are on. */
  aslSign?: string;
  /** IndexedDB media id of a caregiver photo. Shown instead of the symbol when present. */
  photoId?: string;
  /** IndexedDB media id of a caregiver recording. Played instead of text-to-speech. */
  audioId?: string;
  /** IndexedDB media id of a caregiver-provided ASL video/GIF (Phase 2 UI). */
  signId?: string;
  color: TileColor;
  favorite: boolean;
  /** Hidden tiles keep their slot (blank) so other words do not move. */
  hidden: boolean;
  /** Soft-deleted timestamp; restorable from Parent Mode. */
  deletedAt?: number;
  builtIn: boolean;
  /** Caregiver-only note (e.g. about a food). Never shown on child screens. */
  privateNote?: string;
  /** Last change time (ms) — used by Google Drive sync to pick the newest copy. */
  updatedAt?: number;
}

export interface SymbolInfo {
  library: 'arasaac' | 'mulberry' | 'mimzi' | 'opensymbols';
  /** OpenSymbols repository key (e.g. "sclera", "tawasol"). */
  repo?: string;
  id: string;
  name: string;
  url?: string;
  author: string;
  authorUrl?: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
}

export interface Category {
  id: string;
  name: string;
  /** Page that holds this page's folder button (undefined = top level). */
  parentId?: string;
  symbol: string;
  color: TileColor;
  order: number;
  hidden: boolean;
  builtIn: boolean;
  updatedAt?: number;
}

export type MediaKind = 'photo' | 'audio' | 'sign';

export interface MediaRecord {
  id: string;
  kind: MediaKind;
  mime: string;
  blob: Blob;
  createdAt: number;
}

export interface GridSize {
  rows: number;
  cols: number;
}

export interface Settings {
  grid: GridSize;
  showSentenceBar: boolean;
  /** 0.5 – 1.5, 1 = normal. */
  speechRate: number;
  /** Preferred voice (SpeechSynthesisVoice.voiceURI) on this device, if chosen. */
  voiceURI?: string;
  /**
   * The last voice a grown-up picked on any device (by name). It syncs, so a second
   * device uses the same voice when it has it, and explains the difference when it doesn't.
   */
  sharedVoiceName?: string;
  /** Version of the voice defaults applied (2 = gentle 1.1 pitch, 0.9× speed). */
  voiceDefaults?: number;
  /** Default picture style for Mimzi-chosen pictures: ARASAAC (default) or the bundled Mulberry set. */
  symbolStyle?: 'arasaac' | 'mulberry';
  speechLang: string;
  /** Multiplier for label text size. */
  textScale: number;
  /** Space between tiles in px. */
  tileGap: number;
  highContrast: boolean;
  reducedMotion: boolean;
  haptics: boolean;
  /** Tile ids shown in the always-visible quick bar. */
  quickTileIds: string[];
  /** Page list next to the board: automatic (hidden on phones and small tablets, where folders + Home/Back do the job) or hidden. */
  pageList?: 'auto' | 'hide';
  /** Show the small "See sign" button on tiles that have a sign video. */
  showSignButtons: boolean;
  signLoop: boolean;
  /** Sign video playback speed (0.5 – 1). */
  signSpeed: number;
  /** Offer ASL sign drawings under "See sign" for words that have one. */
  showAslDrawings: boolean;
  /** 'wordType' = AAC colour coding; 'custom' = each tile's own colour. */
  colorMode: 'wordType' | 'custom';
  /** Voice pitch 0.5–1.5 and volume 0–1 (where the device supports them). */
  speechPitch: number;
  speechVolume: number;
  /** Name of the chosen voice, to explain if it's missing on a device. */
  voiceName?: string;
  /** Speak each word as it's tapped. */
  speakOnTap: boolean;
  /** Say folder names when a folder is opened. */
  speakFolders: boolean;
  /** 'interrupt' = a new tap cuts off the previous word; 'finish' = let it finish first. */
  interruptMode: 'interrupt' | 'finish';
  /** Ignore a second tap on the same button within this many ms (0 = off). */
  repeatGuardMs: number;
  celebrationVisual: boolean;
  celebrationSound: boolean;
  pin?: { hash: string; salt: string; algo: 'pbkdf2' | 'fallback' };
}

/* ---------- My Day ---------- */

/** One picture + words used in a visual schedule. */
export interface ScheduleItem {
  label: string;
  /** What Mimzi says; defaults to the label. */
  speak?: string;
  /** Use the picture of an existing word tile (follows that word's picture). */
  tileId?: string;
  /** Or a photo (a schedule photo, or one reused from a word or another routine). */
  photoId?: string;
  /** Or an AAC symbol picked directly — no board word needed ("arasaac:<id>", "mul:<file>"…). */
  symbol?: string;
  /** Source, author and licence of `symbol`. */
  symbolInfo?: SymbolInfo;
  /** Card colour. */
  color?: TileColor;
  done: boolean;
}

export interface FirstThenTemplate {
  id: string;
  name: string;
  first: ScheduleItem;
  then: ScheduleItem;
}

export type TokenStyle = 'star' | 'check' | 'circle' | 'heart' | 'dot';

export interface RewardBoard {
  item: ScheduleItem;
  /** 1–10 tokens (3 by default). */
  tokens: number;
  /** Earned tokens — only ever added, or cleared by a deliberate reset (never as punishment). */
  earned: number;
  /** e.g. "Sit for the story". */
  goal?: string;
  tokenStyle?: TokenStyle;
  /** Token colour (CSS colour). */
  tokenColor?: string;
  /** Said and shown when the board is complete. */
  completeMessage?: string;
  /** Show the gentle celebration (defaults to the global setting). */
  celebrate?: boolean;
  /** Say the completion message out loud (defaults to the global setting). */
  sound?: boolean;
  /** Board background colour. */
  boardColor?: TileColor;
}

export interface RewardTemplate extends Omit<RewardBoard, 'earned'> {
  id: string;
  name: string;
}

export type RoutineLayout = 'steps' | 'nowNextLater' | 'oneAtATime';

export interface RoutineTemplate {
  id: string;
  name: string;
  /** 1–5 steps. */
  steps: ScheduleItem[];
  layout?: RoutineLayout;
  /** One-at-a-time view: show the next steps small. Older templates: use the current setting. */
  showUpcoming?: boolean;
}

export type MyDayTool = 'firstThen' | 'reward' | 'routine';

export interface MyDay {
  firstThen: { first: ScheduleItem; then: ScheduleItem; name?: string };
  firstThenTemplates: FirstThenTemplate[];
  reward: RewardBoard & { name?: string };
  rewardTemplates: RewardTemplate[];
  /** The routine on screen now (1–5 steps). */
  routine: { steps: ScheduleItem[]; name?: string };
  routineTemplates: RoutineTemplate[];
  /** How the routine is shown: numbered steps, Now / Next / Later, or one step at a time. */
  routineLayout: RoutineLayout;
  /** One-at-a-time view: show small previews of the next steps. */
  showUpcoming?: boolean;
  /** Data version (2 = unified schedule editor). */
  version?: number;
}

/* ---------- My Words (caregiver observations) ---------- */

export const OBSERVATION_METHODS = [
  'Speech',
  'Word approximation',
  'Gesture',
  'Sign',
  'AAC selection',
  'Combined methods',
] as const;

export type ObservationMethod = (typeof OBSERVATION_METHODS)[number];

export interface Observation {
  id: string;
  target: string;
  /** How the child currently says it, e.g. "mo" for "more". */
  pronunciation: string;
  method: ObservationMethod;
  /** yyyy-mm-dd */
  date: string;
  notes: string;
  audioId?: string;
  createdAt: number;
  updatedAt?: number;
}

/* ---------- Grow My Words ---------- */

export type GrowStatus = 'planned' | 'pending' | 'added' | 'skipped' | 'canceled';

export interface GrowItem {
  id: string;
  tileId: string;
  /** yyyy-mm-dd the word is due to appear. */
  dueDate: string;
  status: GrowStatus;
  /** When it actually appeared on the board. */
  addedOn?: string;
}

export interface GrowPlan {
  cadence: 'daily' | 'weekly';
  /** Words per day / per week. */
  perPeriod: number;
  /** For weekly: 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Add due words automatically (needs explicit opt-in). Default: wait for a grown-up to approve. */
  autoAdd: boolean;
  paused: boolean;
  /** Show a reminder in Parent Mode when words are waiting. */
  remind: boolean;
  items: GrowItem[];
}

export interface VocabEvent {
  id: string;
  tileId: string;
  label: string;
  categoryId: string;
  position: number;
  /** yyyy-mm-dd */
  date: string;
  type: 'added' | 'shown' | 'hidden' | 'scheduled' | 'skipped' | 'canceled' | 'created';
  source: 'manual' | 'scheduled';
}

/** Something Mimzi said, kept exactly so it can be replayed or retried the same way. */
export interface Utterance {
  /** The words shown to people. */
  text: string;
  /** What the voice says (pronunciation override applied). */
  speak: string;
  /** Per-word voice language. */
  lang?: string;
  /** A caregiver recording, played first (built-in voice if it can't play). */
  audioUrl?: string;
}

export interface SpeechState {
  utterance: Utterance;
  status: 'speaking' | 'done' | 'failed' | 'unsupported';
  /** Whether the phrase is shown in the bar at the top of the screen. */
  atTop: boolean;
}
