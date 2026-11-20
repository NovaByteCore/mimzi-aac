/*
 * Everyday pictures a grown-up can pick without typing (quick My Day editor and the picture
 * picker's "Saved" row). ARASAAC pictograms, each checked by eye on the live service
 * (Nov 2026). Their images are saved for offline use by the service worker.
 */
import { arasaacInfo, libraryAllowed } from './symbols';
import type { SymbolInfo } from '../types';

export interface QuickPicture {
  label: string;
  symbol: string;
  info: SymbolInfo;
  /** Bundled Mulberry picture shown if the ARASAAC image isn't saved yet (first use offline). */
  fallback?: string;
}

const A = (id: number, label: string, mul?: string): QuickPicture => ({ label, symbol: `arasaac:${id}`, info: arasaacInfo(id, label), fallback: mul ? `mul:${mul}` : undefined });

const ALL: QuickPicture[] = [
  A(6945, 'Bubbles', 'bubbles'),
  A(2859, 'Playground', 'park_,_to'),
  A(2806, 'Go outside', 'go_outside_,_to'),
  A(25191, 'Book', 'read_book_,_to'),
  A(4609, 'Eat', 'eat_,_to'),
  A(8312, 'Snack', 'biscuits'),
  A(4608, 'Swing', 'swing'),
  A(4759, 'Slide', 'slide'),
  A(4935, 'Blocks', 'bricks'),
  A(2540, 'Puzzle', 'jigsaw_puzzle'),
  A(11238, 'Drawing', 'draw_,_to'),
  A(9813, 'Toys', 'toys'),
  A(24791, 'Music', 'music'),
  A(29151, 'Tablet', 'computer_game'),
  A(25498, 'TV', 'computer_monitor'),
  A(35425, 'Sticker', 'stickers'),
  A(4550, 'Hug', 'hug_,_to'),
  A(35197, 'High five', 'clap_hands_,_to'),
  A(2339, 'Car', 'car'),
  A(3389, 'Store', 'shop'),
  A(6049, 'Sandbox', 'sand_pit'),
  A(2517, 'Dog', 'dog'),
  A(14534, 'Shoes on'),
  A(31853, 'Bath', 'bath'),
  A(2522, 'Pajamas', 'pyjamas'),
  A(2326, 'Brush teeth', 'brush_teeth_,_to'),
  A(28425, 'Nap', 'bed_time'),
  A(6027, 'Bed', 'bed_time'),
];

/** Everyday pictures (empty when ARASAAC can't be used, e.g. a commercial build). */
export function everydayPictures(): QuickPicture[] {
  return libraryAllowed('arasaac') ? ALL : [];
}

export function everydayPicture(label: string): QuickPicture | undefined {
  return everydayPictures().find((p) => p.label.toLowerCase() === label.toLowerCase());
}

const FALLBACKS = new Map(ALL.filter((p) => p.fallback).map((p) => [p.symbol, p.fallback!]));

/** The bundled backup for an everyday picture (used by any picture shown without a word tile). */
export function everydayFallback(symbol: string | undefined): string | undefined {
  return symbol ? FALLBACKS.get(symbol) : undefined;
}
