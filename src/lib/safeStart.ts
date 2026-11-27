/*
 * Safe start: if Mimzi didn't get through its last start (it froze or crashed before it had run
 * for a little while), this start skips the extras — the quiet Google reconnect and the board
 * preview — so the board itself always comes up. A healthy run clears the flag again.
 */

const KEY = 'mimzi:starting';
const LAST_ERROR = 'mimzi:lastError';
const HEALTHY_AFTER_MS = 20_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

const isPreviewFrame = typeof location !== 'undefined' && new URLSearchParams(location.search).has('preview');

/** The previous start didn't finish: run without extras this time. */
export const safeMode: boolean = !isPreviewFrame && read(KEY) !== null;

/** Call once at start-up (not in the board preview). */
export function beginStart(): void {
  if (isPreviewFrame) return;
  write(KEY, String(Date.now()));
  window.setTimeout(() => write(KEY, null), HEALTHY_AFTER_MS);
}

export function rememberError(message: string): void {
  write(LAST_ERROR, `${new Date().toISOString()} ${message}`.slice(0, 600));
}

export function lastError(): string | null {
  return read(LAST_ERROR);
}
