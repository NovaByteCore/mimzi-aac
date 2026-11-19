/*
 * Sentence bar state. The child's message is kept exactly as tapped:
 * no grammar fixes, no reordering, no auto-complete.
 */
export interface SentenceItem {
  key: string;
  tileId: string;
  label: string;
  speak: string;
}

export type SentenceAction =
  | { type: 'add'; item: Omit<SentenceItem, 'key'> }
  | { type: 'backspace' }
  | { type: 'clear' };

export const MAX_SENTENCE_ITEMS = 12;

let counter = 0;

export function sentenceReducer(state: SentenceItem[], action: SentenceAction): SentenceItem[] {
  switch (action.type) {
    case 'add':
      if (state.length >= MAX_SENTENCE_ITEMS) return state;
      counter += 1;
      return [...state, { ...action.item, key: `${action.item.tileId}#${counter}` }];
    case 'backspace':
      return state.slice(0, -1);
    case 'clear':
      return [];
    default:
      return state;
  }
}

export function sentenceText(items: SentenceItem[]): string {
  return items
    .map((i) => i.speak.trim())
    .filter(Boolean)
    .join(' ');
}
