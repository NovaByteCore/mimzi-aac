/*
 * Minimal Google Drive client for the hidden, per-app "appDataFolder".
 * Only Mimzi can read or write this folder; it doesn't appear in the user's Drive file list.
 * Uses the non-sensitive drive.appdata scope.
 */
export interface DriveFile {
  id: string;
  name: string;
  appProperties?: Record<string, string>;
  modifiedTime?: string;
  size?: string;
}

export interface DriveClient {
  list(): Promise<DriveFile[]>;
  download(id: string): Promise<Blob>;
  create(name: string, blob: Blob, appProperties?: Record<string, string>): Promise<string>;
  update(id: string, blob: Blob): Promise<void>;
  remove(id: string): Promise<void>;
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export function createDriveClient(getToken: () => Promise<string>, fetchImpl: typeof fetch = (...a) => fetch(...a)): DriveClient {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const t = await getToken();
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${t}` } });
    } catch {
      throw new DriveError('Couldn’t reach Google Drive. Check the internet connection.');
    }
    if (!res.ok) {
      const msg =
        res.status === 401
          ? 'Google sign-in expired. Sign in again.'
          : res.status === 403
            ? 'Google Drive refused the request (permission or storage full).'
            : `Google Drive error ${res.status}.`;
      throw new DriveError(msg, res.status);
    }
    return res;
  }

  return {
    async list() {
      const out: DriveFile[] = [];
      let pageToken = '';
      do {
        const q = new URLSearchParams({
          spaces: 'appDataFolder',
          fields: 'nextPageToken,files(id,name,appProperties,modifiedTime,size)',
          pageSize: '1000',
        });
        if (pageToken) q.set('pageToken', pageToken);
        const j = (await (await call(`${API}/files?${q}`)).json()) as { files?: DriveFile[]; nextPageToken?: string };
        out.push(...(j.files ?? []));
        pageToken = j.nextPageToken ?? '';
      } while (pageToken);
      return out;
    },
    async download(id) {
      return (await call(`${API}/files/${encodeURIComponent(id)}?alt=media`)).blob();
    },
    async create(name, blob, appProperties) {
      const meta = await call(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parents: ['appDataFolder'], appProperties }),
      });
      const { id } = (await meta.json()) as { id: string };
      await this.update(id, blob);
      return id;
    },
    async update(id, blob) {
      await call(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob,
      });
    },
    async remove(id) {
      await call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}
