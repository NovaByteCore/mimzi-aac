// Speech inside the Android app (APK). Android's web view has no built-in speech,
// so the app wrapper includes the open-source @capacitor-community/text-to-speech
// plugin, which uses the tablet's own text-to-speech engine (works offline with
// Google's downloaded voices). In a normal browser none of this is present and
// Mimzi uses the browser's speech as before.
//
// Why the first tap used to be silent (confirmed in the plugin's source,
// TextToSpeechPlugin.speak): the plugin starts the tablet's engine when the app
// opens, and until Android reports it ready, every speak() is refused with
// "Not yet initialized or not available on this device." A tap in those first
// seconds was treated as a failure and dropped. Now such a tap is kept and spoken
// as soon as the engine is ready (unless a newer tap replaced it).
//
// The plugin's speak() already stops the previous word itself (QUEUE_FLUSH), and its
// stop() forgets the callbacks of words in flight, so Mimzi no longer calls stop()
// before speaking, and it settles replaced words itself instead of waiting forever.
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

/** How long a tap may wait for the tablet's engine to finish starting. */
export const NATIVE_READY_WAIT_MS = 12000;
const READY_POLL_MS = 300;

function errText(e: unknown): string {
  const o = e as { message?: string; code?: string } | undefined;
  return `${o?.code ?? ''} ${o?.message ?? String(e)}`;
}
const notReadyYet = (e: unknown) => /UNAVAILABLE|not yet initiali[sz]ed|not available/i.test(errText(e));
const languageMissing = (e: unknown) => /language is not supported/i.test(errText(e));

interface Pending {
  id: number;
  settle: (r: SpeakResult) => void;
}
let seq = 0;
let current: Pending | null = null; // the word being spoken (or waiting for the engine)
let queueTail: Promise<unknown> = Promise.resolve(); // "let it finish first" mode
let engineReady = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface NativeSpeakOptions {
  lang: string;
  rate: number;
  pitch?: number;
  volume?: number;
  /** 'interrupt' = a newer tap replaces this one; 'finish' = words play in order. */
  interrupt?: 'interrupt' | 'finish';
}

export function nativeSpeak(text: string, o: NativeSpeakOptions): Promise<SpeakResult> {
  const mode = o.interrupt ?? 'interrupt';
  if (mode === 'finish') {
    const run = queueTail.then(() => speakOne(text, o));
    queueTail = run.catch(() => undefined);
    return run;
  }
  // Interrupt mode: the previous word (spoken or still waiting) is replaced.
  current?.settle('interrupted');
  return speakOne(text, o);
}

function speakOne(text: string, o: NativeSpeakOptions): Promise<SpeakResult> {
  const id = ++seq;
  return new Promise<SpeakResult>((resolve) => {
    let done = false;
    const me: Pending = {
      id,
      settle: (r) => {
        if (done) return;
        done = true;
        if (current === me) current = null;
        resolve(r);
      },
    };
    current = me;
    const replaced = () => done || current !== me;
    const t0 = Date.now();
    let lang = o.lang || 'en-US';
    const attempt = (): void => {
      if (replaced()) return;
      call('speak', {
        text,
        lang,
        rate: o.rate,
        pitch: o.pitch ?? 1,
        volume: o.volume ?? 1,
        category: 'playback',
        queueStrategy: 0, // flush: the plugin stops the previous word itself
      }).then(
        () => {
          engineReady = true;
          me.settle('spoken');
        },
        async (e: unknown) => {
          if (replaced()) return;
          if (notReadyYet(e) && Date.now() - t0 < NATIVE_READY_WAIT_MS) {
            // Engine still starting: keep this word and try again shortly.
            await sleep(READY_POLL_MS);
            attempt();
            return;
          }
          if (languageMissing(e) && lang.includes('-')) {
            lang = lang.split('-')[0]; // e.g. en-US voice missing → any English voice
            attempt();
            return;
          }
          me.settle('error');
        },
      );
    };
    attempt();
    // The plugin only reports when a word ends. If Android never says so (it can drop
    // the callback), don't leave the word "speaking" forever.
    setTimeout(() => me.settle(engineReady ? 'spoken' : 'error'), NATIVE_READY_WAIT_MS + 15000 + text.length * 150);
  });
}

/** Stop speech now (Clear, leaving the board…). Words waiting for the engine are dropped too. */
export function nativeStop(): void {
  if (!nativeTtsAvailable()) return;
  current?.settle('interrupted');
  call('stop').catch(() => {});
}

/** Test hook: forget engine state between tests. */
export function resetNativeTtsForTests(): void {
  seq = 0;
  current = null;
  queueTail = Promise.resolve();
  engineReady = false;
}
