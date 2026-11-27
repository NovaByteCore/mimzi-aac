/*
 * Google sign-in with Google Identity Services (token model, no server, no client secret).
 * Access tokens live only in memory and last about an hour; nothing is stored except the
 * account's email and name so Parent Mode can show who is signed in.
 *
 * The Google script is loaded only when a grown-up taps "Sign in with Google", so the app
 * makes no requests to Google otherwise.
 */
import { config } from '../../config';
import { nativeGoogleAvailable, nativeGoogleLogin, nativeGoogleLogout, nativeGoogleSilent } from './native';

export const SCOPES = {
  profile: ['openid', 'email', 'profile'],
  drive: ['https://www.googleapis.com/auth/drive.appdata'],
  photos: ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly'],
};

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; scope?: string; login_hint?: string }): void;
}

interface GoogleOAuth2 {
  initTokenClient(cfg: {
    client_id: string;
    scope: string;
    include_granted_scopes?: boolean;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'not-configured' | 'popup-closed' | 'denied' | 'network' | 'unknown' = 'unknown',
  ) {
    super(message);
  }
}

let token: { value: string; expiresAt: number; scopes: Set<string> } | null = null;
let gisPromise: Promise<GoogleOAuth2> | null = null;

export function googleConfigured(): boolean {
  return Boolean(config.googleClientId);
}

function loadGis(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      const o = window.google?.accounts?.oauth2;
      if (o) resolve(o);
      else reject(new GoogleAuthError('Google sign-in did not load.', 'network'));
    };
    s.onerror = () => {
      gisPromise = null;
      reject(new GoogleAuthError('Couldn’t reach Google. Check the internet connection.', 'network'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

export function hasValidToken(scopes: string[] = []): boolean {
  return Boolean(token && token.expiresAt - 60_000 > Date.now() && scopes.every((s) => token!.scopes.has(s)));
}

export function currentToken(): string | null {
  return hasValidToken() ? token!.value : null;
}

/**
 * Ask Google for an access token covering `scopes` (plus anything already granted).
 * Must be called from a tap: it opens Google's sign-in window.
 */
export async function requestToken(scopes: string[], opts: { prompt?: '' | 'consent' | 'select_account'; loginHint?: string } = {}): Promise<string> {
  if (!googleConfigured()) throw new GoogleAuthError('Google sign-in isn’t set up for this copy of Mimzi yet.', 'not-configured');
  if (hasValidToken(scopes)) return token!.value;
  // Android app: Android's own Google account picker (Google blocks web sign-in inside apps).
  if (nativeGoogleAvailable()) {
    const wantedNative = [...new Set([...(token ? [...token.scopes] : []), ...SCOPES.profile, ...scopes])];
    try {
      const r = await nativeGoogleLogin(wantedNative);
      token = { value: r.token, expiresAt: Date.now() + 55 * 60_000, scopes: new Set(wantedNative) };
      quietFailed = false;
      return r.token;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      throw new GoogleAuthError(
        /cancel/i.test(msg) ? 'Google sign-in was cancelled.' : /network|internet|offline/i.test(msg) ? 'Couldn’t reach Google. Check the internet connection.' : `Google sign-in failed: ${msg}`,
        /cancel/i.test(msg) ? 'popup-closed' : /network|internet|offline/i.test(msg) ? 'network' : 'unknown',
      );
    }
  }
  const oauth2 = await loadGis();
  const wanted = [...new Set([...(token ? [...token.scopes] : []), ...SCOPES.profile, ...scopes])];
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: wanted.join(' '),
      include_granted_scopes: true,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new GoogleAuthError(r.error_description || 'Google didn’t allow access.', 'denied'));
          return;
        }
        const granted = new Set((r.scope ?? '').split(' ').filter(Boolean));
        const missing = scopes.filter((s) => !granted.has(s));
        token = { value: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000, scopes: granted };
        if (missing.length) {
          reject(new GoogleAuthError('Some permissions were not ticked. Try again and allow all the boxes Mimzi asks for.', 'denied'));
          return;
        }
        resolve(r.access_token);
      },
      error_callback: (e) => {
        reject(
          e?.type === 'popup_closed'
            ? new GoogleAuthError('The Google window was closed before signing in finished.', 'popup-closed')
            : e?.type === 'popup_failed_to_open'
              ? new GoogleAuthError('The Google window was blocked. Allow pop-ups for this site and try again.', 'popup-closed')
              : new GoogleAuthError(e?.message || 'Google sign-in failed.'),
        );
      },
    });
    client.requestAccessToken({ prompt: opts.prompt ?? '', login_hint: opts.loginHint });
  });
}

export async function fetchProfile(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<{ email: string; name: string }> {
  const r = await fetchImpl('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new GoogleAuthError('Couldn’t read the Google account name.', 'network');
  const j = (await r.json()) as { email?: string; name?: string };
  return { email: j.email ?? '', name: j.name ?? '' };
}

export async function signOut(): Promise<void> {
  const t = token?.value;
  token = null;
  if (nativeGoogleAvailable()) {
    await nativeGoogleLogout();
    return;
  }
  if (t && window.google?.accounts?.oauth2) {
    await new Promise<void>((resolve) => window.google!.accounts!.oauth2!.revoke(t, resolve));
  }
}

let quietFailed = false;
/**
 * Android app only: get access again without any screen (after Mimzi was closed, or the hourly
 * token ran out), so automatic backup keeps going. Returns null when that isn't possible; then a
 * grown-up taps Sync now once. After one failure it doesn't keep retrying until a tap succeeds.
 */
export async function quietToken(scopes: string[], email?: string): Promise<string | null> {
  if (hasValidToken(scopes)) return token!.value;
  if (!nativeGoogleAvailable() || quietFailed) return null;
  const wanted = [...new Set([...SCOPES.profile, ...scopes])];
  try {
    const r = await Promise.race([
      nativeGoogleSilent(wanted),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Timed out.')), 20_000)),
    ]);
    if (email && r.email && r.email.toLowerCase() !== email.toLowerCase()) throw new Error('Different account.');
    token = { value: r.token, expiresAt: Date.now() + 55 * 60_000, scopes: new Set(wanted) };
    return r.token;
  } catch {
    quietFailed = true;
    return null;
  }
}

/** Can Mimzi sync right now without a tap? (a live token, or the Android app can reconnect quietly) */
export function canSyncQuietly(scopes: string[]): boolean {
  return hasValidToken(scopes) || (nativeGoogleAvailable() && !quietFailed);
}
