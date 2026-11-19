/*
 * Mimzi speech engine. Every word speaks automatically with the device's built-in
 * text-to-speech — no recordings needed. Recordings are optional extras.
 *
 * Built-in voices differ between iPadOS Safari and Android Chrome, so this module:
 *  - speaks synchronously inside the tap (iOS only allows speech from a user gesture),
 *  - never waits forever for an `end` event that some engines don't send,
 *  - ranks the device's voices so the most natural-sounding one is used automatically
 *    (Enhanced / Premium / Natural / Neural voices first, novelty and robotic voices last),
 *  - keeps one preferred voice for every word and sentence, and falls back to an
 *    on-device voice when offline,
 *  - reports which voice was actually used, so Parent Mode can explain any fallback,
 *  - reports failures so the screen can still show the words.
 */
/**
 * spoken / recorded: it played. interrupted: a newer tap (or Stop) cut it off on purpose —
 * not a failure. error: the engine reported a failure, or nothing ever started playing.
 * unsupported: no speech on this device.
 */
import { nativeSpeak, nativeStop, nativeTtsAvailable } from './nativeTts';
export type SpeakResult = 'spoken' | 'recorded' | 'interrupted' | 'unsupported' | 'error';

/** How long to wait for an engine to begin before treating the request as failed. */
export const START_TIMEOUT_MS = 4000;

export interface SpeakOptions {
  rate: number;
  lang: string;
  voiceURI?: string;
  /** Name of the voice chosen on this device (voice URIs can change after updates). */
  voiceName?: string;
  /** Voice chosen on another signed-in device; used here if this device has the same voice. */
  sharedVoiceName?: string;
  pitch?: number;
  volume?: number;
  /** 'interrupt' cuts off whatever is being said; 'finish' lets it finish first. */
  interrupt?: 'interrupt' | 'finish';
}

export interface VoiceUse {
  requested?: string;
  used?: string;
  usedName?: string;
  /**
   * missing: the voice chosen on this device is gone; other-device: the voice chosen on
   * another device isn't installed here; offline: the chosen voice needs internet.
   */
  reason?: 'missing' | 'offline' | 'other-device' | 'none';
  at: number;
}

let currentAudio: HTMLAudioElement | null = null;
let lastUse: VoiceUse | null = null;
const listeners = new Set<(u: VoiceUse) => void>();

function webSpeech(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** True when this device can speak: the browser's speech, or the tablet's engine inside the Android app. */
export function speechSupported(): boolean {
  return webSpeech() || nativeTtsAvailable();
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (!webSpeech()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/** Voices load asynchronously in Chrome; call back whenever the list changes. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!webSpeech()) return () => undefined;
  const synth = window.speechSynthesis;
  synth.addEventListener?.('voiceschanged', cb);
  return () => synth.removeEventListener?.('voiceschanged', cb);
}

/** The last voice decision (for Parent Mode's "Mimzi Voice" status). */
export function lastVoiceUse(): VoiceUse | null {
  return lastUse;
}

export function onVoiceUse(cb: (u: VoiceUse) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/* ---------- voice quality ranking ---------- */

/** Words engines use in the names of their best, most natural voices. */
const NATURAL = /\b(enhanced|premium|natural|neural|wavenet|studio|journey|polyglot|online)\b/i;
/** Apple's built-in fun/novelty voices and the older robotic "Eloquence" and eSpeak voices. */
const ROBOTIC =
  /\b(eloquence|espeak|e-speak|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|fred|ralph|junior|kathy|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;

export type VoiceQuality = 'natural' | 'standard' | 'robotic';

export function voiceQuality(v: Pick<SpeechSynthesisVoice, 'name' | 'voiceURI'>): VoiceQuality {
  const id = `${v.name} ${v.voiceURI}`;
  if (ROBOTIC.test(id)) return 'robotic';
  // iPadOS reports enhanced/premium voices in the voiceURI (…voice.enhanced.… / …voice.premium.…);
  // Chrome's "Google …" voices and Edge's "… Online (Natural)" voices are high quality.
  if (NATURAL.test(id) || /\.(enhanced|premium)\./i.test(v.voiceURI) || /^google\b/i.test(v.name)) return 'natural';
  return 'standard';
}

const sameLang = (v: SpeechSynthesisVoice, lang: string) => (v.lang || '').toLowerCase().replace('_', '-') === lang.toLowerCase();
const sameBase = (v: SpeechSynthesisVoice, lang: string) => (v.lang || '').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase());

/** Higher is better: language match, then naturalness, then on-device, then the device default. */
export function voiceScore(v: SpeechSynthesisVoice, lang: string, online = true): number {
  let s = 0;
  if (sameLang(v, lang)) s += 100;
  else if (sameBase(v, lang)) s += 60;
  const q = voiceQuality(v);
  s += q === 'natural' ? 40 : q === 'standard' ? 20 : -40;
  if (v.localService) s += online ? 5 : 50;
  if (v.default) s += 3;
  return s;
}

/** The device's voices, most natural first, for the language. */
export function rankVoices(voices: SpeechSynthesisVoice[], lang: string, online = true): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => voiceScore(b, lang, online) - voiceScore(a, lang, online) || a.name.localeCompare(b.name));
}

/** The voice Mimzi would pick by itself: the most natural one that works right now. */
export function bestVoice(voices: SpeechSynthesisVoice[], lang: string, online = isOnline()): SpeechSynthesisVoice | undefined {
  const usable = online ? voices : voices.filter((v) => v.localService);
  return rankVoices(usable.length ? usable : voices, lang, online).find((v) => online || v.localService);
}

/**
 * Choose a voice:
 *  1. the voice chosen on this device (matched by URI, or by name if the URI changed),
 *  2. otherwise the voice chosen on another signed-in device, if this device has it,
 *  3. otherwise the most natural voice for the language.
 * Offline, a voice that needs the internet is replaced by the best on-device voice.
 */
export function chooseVoice(
  voices: SpeechSynthesisVoice[],
  voiceURI: string | undefined,
  lang: string,
  online = isOnline(),
  names: { voiceName?: string; sharedVoiceName?: string } = {},
): { voice?: SpeechSynthesisVoice; reason?: VoiceUse['reason'] } {
  const own = voiceURI || names.voiceName;
  const chosen = own
    ? (voiceURI ? voices.find((v) => v.voiceURI === voiceURI) : undefined) ?? (names.voiceName ? voices.find((v) => v.name === names.voiceName) : undefined)
    : names.sharedVoiceName
      ? voices.find((v) => v.name === names.sharedVoiceName)
      : undefined;
  if (chosen && (online || chosen.localService)) return { voice: chosen };
  const voice = bestVoice(voices, lang, online);
  const reason: VoiceUse['reason'] = chosen ? 'offline' : own ? 'missing' : names.sharedVoiceName ? 'other-device' : undefined;
  return { voice, reason: voice ? reason : 'none' };
}

/** Backwards-compatible helper. */
export function pickVoice(voices: SpeechSynthesisVoice[], voiceURI: string | undefined, lang: string) {
  return chooseVoice(voices, voiceURI, lang, true).voice;
}

export function stopAll(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  nativeStop();
  if (webSpeech()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

export function speakText(text: string, opts: SpeakOptions): Promise<SpeakResult> {
  const clean = text.trim();
  if (!clean) return Promise.resolve('spoken');
  if (nativeTtsAvailable()) {
    if ((opts.interrupt ?? 'interrupt') === 'interrupt') stopAll();
    return nativeSpeak(clean, { lang: opts.lang, rate: clamp(opts.rate, 0.5, 1.5), pitch: clamp(opts.pitch ?? 1, 0.5, 1.5), volume: clamp(opts.volume ?? 1, 0, 1) });
  }
  if (!webSpeech()) return Promise.resolve('unsupported');
  const synth = window.speechSynthesis;
  if ((opts.interrupt ?? 'interrupt') === 'interrupt') stopAll();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: SpeakResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    try {
      const u = new SpeechSynthesisUtterance(clean);
      u.rate = clamp(opts.rate, 0.5, 1.5);
      u.pitch = clamp(opts.pitch ?? 1, 0.5, 1.5);
      u.volume = clamp(opts.volume ?? 1, 0, 1);
      u.lang = opts.lang;
      let { voice, reason } = chooseVoice(getVoices(), opts.voiceURI, opts.lang, isOnline(), { voiceName: opts.voiceName, sharedVoiceName: opts.sharedVoiceName });
      // A word with its own language (e.g. a Spanish word on an English board) must not be read
      // by a voice for another language: use the best voice for that language, or none (the
      // engine then picks its own voice for `lang`).
      const base = (opts.lang || '').slice(0, 2).toLowerCase();
      if (voice && base && !(voice.lang || '').toLowerCase().startsWith(base)) {
        const forLang = bestVoice(getVoices().filter((v) => (v.lang || '').toLowerCase().startsWith(base)), opts.lang);
        voice = forLang;
        reason = forLang ? reason : undefined;
      }
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang || opts.lang;
      }
      lastUse = { requested: opts.voiceURI, used: voice?.voiceURI, usedName: voice?.name, reason, at: Date.now() };
      listeners.forEach((l) => l(lastUse!));
      let started = false;
      u.onstart = () => {
        started = true;
      };
      u.onend = () => finish('spoken');
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        // A newer tap cancelling this one is intentional, not a failure.
        finish(e.error === 'interrupted' || e.error === 'canceled' ? 'interrupted' : 'error');
      };
      synth.speak(u);
      if (synth.paused) synth.resume();
      // Some engines never fire start/end. Don't report success unless playback began:
      // it counts as started once `onstart` fires or the engine reports it is speaking.
      const t0 = Date.now();
      const watch = () => {
        if (settled) return;
        if (synth.speaking) started = true;
        const waited = Date.now() - t0;
        if (!started) {
          // Still queued behind another utterance ("finish current word" mode) → keep waiting.
          if (waited >= START_TIMEOUT_MS && !synth.pending) return finish('error');
          if (waited >= START_TIMEOUT_MS * 3) return finish('error');
        } else if (waited >= START_TIMEOUT_MS + 2500 + clean.length * 120) {
          return finish('spoken'); // started, but the engine never said it ended
        }
        setTimeout(watch, 250);
      };
      setTimeout(watch, 250);
    } catch {
      finish('error');
    }
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 1));
}

export function playRecording(url: string, rate: number, volume = 1): Promise<SpeakResult> {
  stopAll();
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      currentAudio = audio;
      audio.playbackRate = clamp(rate, 0.5, 1.5);
      audio.volume = clamp(volume, 0, 1);
      audio.onended = () => resolve('recorded');
      audio.onerror = () => resolve('error');
      // Stopped by a newer tap → interrupted (not a failure).
      audio.onpause = () => {
        if (!audio.ended && currentAudio !== audio) resolve('interrupted');
      };
      audio.play().then(
        () => undefined,
        (e: unknown) => resolve(e instanceof DOMException && e.name === 'AbortError' ? 'interrupted' : 'error'),
      );
    } catch {
      resolve('error');
    }
  });
}

/** What the voice should say for a word: pronunciation override > spoken text > label. */
export function spokenFor(t: { label: string; speak?: string; pronunciation?: string }): string {
  return (t.pronunciation?.trim() || t.speak?.trim() || t.label).trim();
}

/** Speak a tile: optional recording first, then the built-in voice (always available). */
/** A recording if there is one; if it can't play, the built-in voice says the word instead. */
export async function speakTile(speak: string, audioUrl: string | undefined, opts: SpeakOptions): Promise<SpeakResult> {
  if (audioUrl) {
    const r = await playRecording(audioUrl, opts.rate, opts.volume);
    if (r === 'recorded' || r === 'interrupted') return r;
  }
  return speakText(speak, opts);
}
