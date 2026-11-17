// Build-time configuration from VITE_* environment variables (see .env.example).
// These values are public — nothing secret belongs here.
// `import.meta.env` is provided by Vite; under Node (unit tests) it is undefined.
const env = (import.meta.env ?? {}) as Record<string, string | boolean | undefined>;

export const config = {
  appName: String(env.VITE_APP_NAME || 'Mimzi'),
  defaultSpeechLang: String(env.VITE_DEFAULT_SPEECH_LANG || 'en-US'),
  syncProvider: String(env.VITE_SYNC_PROVIDER || ''),
  isProd: Boolean(env.PROD),
};
