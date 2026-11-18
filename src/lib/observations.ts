/*
 * My Words exports for a speech-language pathologist. These are a caregiver's notes in
 * the order they were observed — no scores, levels, percentages or diagnostic wording.
 */
import type { Observation } from '../types';

export function sortObservations(list: Observation[]): Observation[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function csvCell(v: string): string {
  // Quote everything; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function observationsToCsv(list: Observation[]): string {
  const header = ['Date', 'Target word', 'How it was said / shown', 'Method', 'Notes', 'Audio recorded'];
  const rows = sortObservations(list).map((o) => [o.date, o.target, o.pronunciation, o.method, o.notes, o.audioId ? 'yes' : 'no']);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Plain-text summary grouped by target word, oldest first within each word. */
export function observationsToText(list: Observation[], childLabel = 'my child'): string {
  const byWord = new Map<string, Observation[]>();
  for (const o of list) {
    const key = o.target.trim().toLowerCase();
    byWord.set(key, [...(byWord.get(key) ?? []), o]);
  }
  const lines = [
    `Communication notes for ${childLabel}`,
    `Exported from Mimzi on ${new Date().toISOString().slice(0, 10)} — caregiver observations, not an assessment.`,
    '',
  ];
  const words = [...byWord.keys()].sort();
  for (const w of words) {
    const entries = byWord.get(w)!.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    lines.push(`• ${entries[0].target}`);
    for (const e of entries) {
      const said = e.pronunciation ? ` — “${e.pronunciation}”` : '';
      const notes = e.notes ? ` (${e.notes})` : '';
      lines.push(`    ${e.date}: ${e.method}${said}${notes}`);
    }
    lines.push('');
  }
  if (!words.length) lines.push('No observations yet.');
  return lines.join('\n');
}

export function downloadText(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
