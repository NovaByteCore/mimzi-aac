// Speech inside the Android app (APK). Android's web view has no built-in speech,
// so the app wrapper includes the open-source @capacitor-community/text-to-speech
// plugin, which uses the tablet's own text-to-speech engine (works offline with
// Google's downloaded voices). In a normal browser none of this is present and
// Mimzi uses the browser's speech as before.
import type { SpeakResult } from './speech';

type PluginFn = (opts?: object) => Promise<unknown>;
interface CapacitorGlobal {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, opts?: object) => Promise<unknown>;
  Plugins?: Record<string, Record<string, PluginFn> | undefined>;
}

function cap(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function nativeTtsAvailable(): boolean {
  const c = cap();
  if (!c) return false;
  const native = c.isNativePlatform ? c.isNativePlatform() : (c.getPlatform?.() ?? 'web') !== 'web';
  return native && Boolean(c.Plugins?.TextToSpeech?.speak || c.nativePromise);
}

function call(method: string, opts: object = {}): Promise<unknown> {
  const c = cap();
  const fn = c?.Plugins?.TextToSpeech?.[method];
  if (fn) return fn(opts);
  if (c?.nativePromise) return c.nativePromise('TextToSpeech', method, opts);
  return Promise.reject(new Error('no native speech'));
}

let seq = 0;

export function nativeSpeak(text: string, o: { lang: string; rate: number; pitch?: number; volume?: number }): Promise<SpeakResult> {
  const mine = ++seq;
  return call('speak', { text, lang: o.lang, rate: o.rate, pitch: o.pitch ?? 1, volume: o.volume ?? 1, category: 'playback', queueStrategy: 0 }).then(
    () => (mine === seq ? 'spoken' : 'interrupted'),
    (e: unknown) => {
      if (mine !== seq) return 'interrupted';
      const msg = String((e as { message?: string })?.message ?? e);
      return /interrupt|stop|cancel/i.test(msg) ? 'interrupted' : 'error';
    },
  );
}

export function nativeStop(): void {
  if (!nativeTtsAvailable()) return;
  seq++;
  call('stop').catch(() => {});
}
