/*
 * Google inside the Android app (APK). Google blocks its web sign-in inside apps like this one,
 * so the APK signs in with Android's own Google account picker instead, through the open-source
 * @capgo/capacitor-social-login plugin (Credential Manager + AuthorizationClient). It returns the
 * same kind of short-lived access token the web version gets, for the same permissions (Drive app
 * folder for sync, Google Photos picker).
 *
 * Google Photos: the picker opens in a browser tab (@capacitor/browser); the picked photo is then
 * downloaded by Android itself (CapacitorHttp), which doesn't need the web version's
 * /api/photo pass-through.
 *
 * In a normal browser none of these plugins exist and the web code paths are used.
 */
import { config } from '../../config';

type PluginFn = (opts?: object) => Promise<unknown>;
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  nativePromise?: (plugin: string, method: string, opts?: object) => Promise<unknown>;
  Plugins?: Record<string, Record<string, PluginFn> | undefined>;
}

function cap(): CapacitorGlobal | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

function isNative(): boolean {
  const c = cap();
  if (!c) return false;
  return c.isNativePlatform ? c.isNativePlatform() : (c.getPlatform?.() ?? 'web') !== 'web';
}

function call<T>(plugin: string, method: string, opts: object = {}): Promise<T> {
  const c = cap();
  const fn = c?.Plugins?.[plugin]?.[method];
  if (fn) return fn(opts) as Promise<T>;
  if (c?.nativePromise) return c.nativePromise(plugin, method, opts) as Promise<T>;
  return Promise.reject(new Error(`${plugin} is not available`));
}

/** Running inside the Android app with the Google sign-in plugin. */
export function nativeGoogleAvailable(): boolean {
  const c = cap();
  return isNative() && Boolean(c?.Plugins?.SocialLogin || c?.nativePromise);
}

let initialized: Promise<void> | null = null;
function init(): Promise<void> {
  if (!initialized) {
    initialized = call<void>('SocialLogin', 'initialize', { google: { webClientId: config.googleClientId, mode: 'online' } }).catch((e) => {
      initialized = null;
      throw e;
    });
  }
  return initialized;
}

interface LoginResult {
  provider?: string;
  result?: {
    accessToken?: { token?: string } | null;
    profile?: { email?: string | null; name?: string | null };
    responseType?: string;
  };
}

export interface NativeToken {
  token: string;
  email: string;
  name: string;
}

/** Android's Google account picker + permission screen. Resolves with an access token. */
export async function nativeGoogleLogin(scopes: string[]): Promise<NativeToken> {
  await init();
  const r = await call<LoginResult>('SocialLogin', 'login', { provider: 'google', options: { scopes, forceRefreshToken: true } });
  const token = r?.result?.accessToken?.token;
  if (!token) throw new Error('Google didn’t return access for Mimzi.');
  return { token, email: r.result?.profile?.email ?? '', name: r.result?.profile?.name ?? '' };
}

/**
 * Reconnect without showing anything: only an account that already allowed Mimzi, picked
 * automatically. Fails quietly (NoCredential) instead of showing the account picker.
 */
export async function nativeGoogleSilent(scopes: string[]): Promise<NativeToken> {
  await init();
  const r = await call<LoginResult>('SocialLogin', 'login', {
    provider: 'google',
    options: { scopes, filterByAuthorizedAccounts: true, autoSelectEnabled: true },
  });
  const token = r?.result?.accessToken?.token;
  if (!token) throw new Error('No saved Google access.');
  return { token, email: r.result?.profile?.email ?? '', name: r.result?.profile?.name ?? '' };
}

export async function nativeGoogleLogout(): Promise<void> {
  try {
    await init();
    await call('SocialLogin', 'logout', { provider: 'google' });
  } catch {
    /* already signed out */
  }
}

/** Open a link in a browser tab on top of the app (used for the Google Photos picker). */
export async function openInBrowserTab(url: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await call('Browser', 'open', { url, presentationStyle: 'popover' });
    return true;
  } catch {
    return false;
  }
}

export async function closeBrowserTab(): Promise<void> {
  if (!isNative()) return;
  try {
    await call('Browser', 'close');
  } catch {
    /* not open */
  }
}

/** Download with Android's own HTTP client (no browser CORS rules), e.g. a picked Google Photo. */
export async function nativeDownload(url: string, headers: Record<string, string>): Promise<Blob> {
  const r = await call<{ status: number; data: string; headers?: Record<string, string> }>('CapacitorHttp', 'request', {
    url,
    method: 'GET',
    headers,
    responseType: 'blob',
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`Download failed (${r.status}).`);
  const type = r.headers?.['Content-Type'] ?? r.headers?.['content-type'] ?? 'image/jpeg';
  const bin = atob(r.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Native platform check for other modules. */
export const inAndroidApp = isNative;
