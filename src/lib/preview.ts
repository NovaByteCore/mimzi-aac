/*
 * Board preview in Parent Mode: a look-only copy of the Talk board in a small frame, so a
 * grown-up sees each change right away. The frame is Mimzi itself opened with ?preview=1;
 * it reads the same on-device data, never syncs, and reloads when Parent Mode saves something.
 */

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

/** This copy of Mimzi is the preview inside Parent Mode. */
export const isPreview = params.has('preview');
/** Page the preview opens on. */
export const previewPage = params.get('page') ?? undefined;

const CHANNEL = 'mimzi-board-preview';
let channel: BroadcastChannel | null = null;
function ch(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL);
  return channel;
}

let timer: number | undefined;
/** Parent Mode saved something: refresh any open preview (a moment later, after the save). */
export function notifyPreview(): void {
  if (isPreview) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => ch()?.postMessage('changed'), 250);
}

/** In the preview: reload when the board changes. */
export function listenForChanges(onChange: () => void): () => void {
  const c = ch();
  if (!c) return () => undefined;
  // Several quick changes refresh the preview once, at most every 2 seconds.
  let wait: number | undefined;
  const started = Date.now();
  const handler = () => {
    if (wait !== undefined) return;
    wait = window.setTimeout(onChange, Math.max(300, 2000 - (Date.now() - started)));
  };
  c.addEventListener('message', handler);
  return () => c.removeEventListener('message', handler);
}
