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
  pin?: { hash: string; salt: string; algo: 'pbkdf2' | 'fallback' };
}
