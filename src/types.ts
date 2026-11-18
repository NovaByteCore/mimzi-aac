export type TileColor = 'blue' | 'cream' | 'sage' | 'lavender' | 'peach' | 'sun' | 'rose' | 'white';

export const TILE_COLORS: TileColor[] = ['blue', 'cream', 'sage', 'lavender', 'peach', 'sun', 'rose', 'white'];

export interface Tile {
  id: string;
  /** Text shown on the tile. */
  label: string;
  /** What Mimzi says aloud. Defaults to the label. */
  speak: string;
  categoryId: string;
  /** Position inside its category. Only a caregiver changes this — never automatic. */
  order: number;
  /** "svg:<key>" for a built-in Mimzi symbol, otherwise an emoji / short text. */
  symbol?: string;
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
}

export interface Category {
  id: string;
  name: string;
  symbol: string;
  color: TileColor;
  order: number;
  hidden: boolean;
  builtIn: boolean;
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
  /** Show the small "See sign" button on tiles that have a sign video. */
  showSignButtons: boolean;
  signLoop: boolean;
  /** Sign video playback speed (0.5 – 1). */
  signSpeed: number;
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
  /** Use the picture of an existing word tile. */
  tileId?: string;
  /** Or a photo added just for this schedule. */
  photoId?: string;
  done: boolean;
}

export interface FirstThenTemplate {
  id: string;
  name: string;
  first: ScheduleItem;
  then: ScheduleItem;
}

export interface RewardTemplate {
  id: string;
  name: string;
  item: ScheduleItem;
  tokens: number;
}

export interface RoutineTemplate {
  id: string;
  name: string;
  steps: ScheduleItem[];
}

export type MyDayTool = 'firstThen' | 'reward' | 'routine';

export interface MyDay {
  firstThen: { first: ScheduleItem; then: ScheduleItem };
  firstThenTemplates: FirstThenTemplate[];
  reward: { item: ScheduleItem; tokens: number; earned: number };
  rewardTemplates: RewardTemplate[];
  routine: { steps: ScheduleItem[] };
  routineTemplates: RoutineTemplate[];
  /** How the routine is shown: numbered steps, or Now / Next / Later. */
  routineLayout: 'steps' | 'nowNextLater';
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
}
