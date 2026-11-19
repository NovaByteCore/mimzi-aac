// Build-time configuration from VITE_* environment variables (see .env.example).
// These values are public — nothing secret belongs here.
// `import.meta.env` is provided by Vite; under Node (unit tests) it is undefined.
const env = (import.meta.env ?? {}) as Record<string, string | boolean | undefined>;

export const config = {
  appName: String(env.VITE_APP_NAME || 'Mimzi'),
  defaultSpeechLang: String(env.VITE_DEFAULT_SPEECH_LANG || 'en-US'),
  syncProvider: String(env.VITE_SYNC_PROVIDER || ''),
  /** Google OAuth Web client ID (public, not a secret). Empty = Google features show setup help. */
  googleClientId: String(env.VITE_GOOGLE_CLIENT_ID || ''),
  /** Same-origin pass-through that fetches picked Google Photos (Google blocks direct browser downloads). */
  photosProxyUrl: String(env.VITE_PHOTOS_PROXY_URL || '/api/photo'),
  isProd: Boolean(env.PROD),
  /**
   * Set VITE_COMMERCIAL_USE=true for any commercial deployment. Symbols under noncommercial
   * licences (ARASAAC, other CC BY-NC sets) are then switched off automatically.
   */
  commercialUse: String(env.VITE_COMMERCIAL_USE || '').toLowerCase() === 'true',
  /** Same-origin OpenSymbols search function (holds the shared secret server-side). */
  openSymbolsUrl: String(env.VITE_OPENSYMBOLS_URL || '/api/symbols'),
};
