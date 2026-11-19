/*
 * Google Photos Picker API (the only way, since March 2025, for an app to get photos the
 * user chooses from their Google Photos library). Flow:
 *   1. create a session → Google returns a pickerUri
 *   2. open it; the grown-up picks photos in Google Photos
 *   3. poll the session until mediaItemsSet
 *   4. list the picked items and download each through Mimzi's same-origin pass-through
 *      (Google doesn't allow these downloads directly from a web page)
 *   5. delete the session
 * Mimzi only ever sees the photos that were picked.
 */
import { config } from '../../config';

const API = 'https://photospicker.googleapis.com/v1';

export class PhotosPickerError extends Error {}

interface Session {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
}

interface PickedItem {
  id: string;
  type?: string;
  mediaFile?: { baseUrl: string; mimeType?: string; filename?: string };
}

function seconds(d: string | undefined, fallback: number): number {
  const n = d ? parseFloat(d) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export interface PickOptions {
  token: string;
  /** Window opened synchronously in the tap handler (so pop-up blockers allow it). */
  popup: Window | null;
  maxItems?: number;
  signal?: AbortSignal;
  onStatus?: (msg: string) => void;
  /** Called with the picker link if the window couldn't be opened, so the UI can show it as a button. */
  onPickerUri?: (uri: string) => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface PickedPhoto {
  blob: Blob;
  filename: string;
}

export async function pickFromGooglePhotos(opts: PickOptions): Promise<PickedPhoto[]> {
  const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const auth = { Authorization: `Bearer ${opts.token}` };

  const created = await f(`${API}/sessions`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pickingConfig: { maxItemCount: String(opts.maxItems ?? 1) } }),
  });
  if (!created.ok) throw new PhotosPickerError(created.status === 403 ? 'Google Photos access isn’t switched on for this app yet (see setup guide).' : `Google Photos error ${created.status}.`);
  const session = (await created.json()) as Session;
  const uri = `${session.pickerUri}/autoclose`;

  try {
    if (opts.popup && !opts.popup.closed) opts.popup.location.href = uri;
    else opts.onPickerUri?.(uri);
    opts.onStatus?.('Choose a photo in Google Photos, then come back here.');

    const interval = Math.max(1, seconds(session.pollingConfig?.pollInterval, 3)) * 1000;
    const deadline = Date.now() + Math.min(seconds(session.pollingConfig?.timeoutIn, 900), 1800) * 1000;
    let current = session;
    while (!current.mediaItemsSet) {
      if (opts.signal?.aborted) throw new PhotosPickerError('Cancelled.');
      if (Date.now() > deadline) throw new PhotosPickerError('Google Photos took too long. Try again.');
      await sleep(interval);
      const r = await f(`${API}/sessions/${encodeURIComponent(session.id)}`, { headers: auth });
      if (!r.ok) throw new PhotosPickerError(`Google Photos error ${r.status}.`);
      current = (await r.json()) as Session;
    }

    opts.onStatus?.('Getting your photo…');
    const items: PickedItem[] = [];
    let pageToken = '';
    do {
      const q = new URLSearchParams({ sessionId: session.id, pageSize: '50' });
      if (pageToken) q.set('pageToken', pageToken);
      const r = await f(`${API}/mediaItems?${q}`, { headers: auth });
      if (!r.ok) throw new PhotosPickerError(`Google Photos error ${r.status}.`);
      const j = (await r.json()) as { mediaItems?: PickedItem[]; nextPageToken?: string };
      items.push(...(j.mediaItems ?? []));
      pageToken = j.nextPageToken ?? '';
    } while (pageToken);

    const photos: PickedPhoto[] = [];
    for (const item of items) {
      if (!item.mediaFile?.baseUrl || (item.type && item.type !== 'PHOTO')) continue;
      // =w1600-h1600 keeps the whole picture but caps its size; Mimzi crops to 640 px later.
      const source = `${item.mediaFile.baseUrl}=w1600-h1600`;
      const r = await f(`${config.photosProxyUrl}?url=${encodeURIComponent(source)}`, { headers: auth });
      if (!r.ok) {
        throw new PhotosPickerError(
          r.status === 404 ? 'The Google Photos pass-through isn’t deployed with this copy of Mimzi (see setup guide).' : `Couldn’t download the photo (${r.status}).`,
        );
      }
      photos.push({ blob: await r.blob(), filename: item.mediaFile.filename ?? 'photo.jpg' });
    }
    if (!photos.length) throw new PhotosPickerError('No photo was chosen.');
    return photos;
  } finally {
    void f(`${API}/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE', headers: auth }).catch(() => undefined);
    if (opts.popup && !opts.popup.closed) {
      try {
        opts.popup.close();
      } catch {
        /* ignore */
      }
    }
  }
}
