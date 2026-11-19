/*
 * Mimzi speech engine. Every word speaks automatically with the device's built-in
 * text-to-speech — no recordings needed. Recordings are optional extras.
 *
 * Built-in voices differ between iPadOS Safari and Android Chrome, so this module:
 *  - speaks synchronously inside the tap (iOS only allows speech from a user gesture),
 *  - never waits forever for an `end` event that some engines don't send,
 *  - prefers voices that work without internet ("local" voices) when offline,
 *  - reports which voice was actually used, so Parent Mode can explain any fallback,
 *  - reports failures so the screen can still show the words.
 */
export type SpeakResult = 'spoken' | 'recorded' | 'unsupported' | 'error';

export interface SpeakOptions {
  rate: number;
  lang: string;
  voiceURI?: string;
  pitch?: number;
  volume?: number;
  /** 'interrupt' cuts off whatever is being said; 'finish' lets it finish first. */
  interrupt?: 'interrupt' | 'finish';
}

export interface VoiceUse {
  requested?: string;
  used?: string;
  usedName?: string;
  reason?: 'missing' | 'offline' | 'none';
  at: number;
}

let currentAudio: HTMLAudioElement | null = null;
let lastUse: VoiceUse | null = null;
const listeners = new Set<(u: VoiceUse) => void>();

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/** Voices load asynchronously in Chrome; call back whenever the list changes. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported()) return () => undefined;
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

/**
 * Choose a voice: the caregiver's choice if it exists (and, when offline, works offline);
 * otherwise the best voice for the language, preferring on-device voices.
 */
export function chooseVoice(
  voices: SpeechSynthesisVoice[],
  voiceURI: string | undefined,
  lang: string,
  online = isOnline(),
): { voice?: SpeechSynthesisVoice; reason?: VoiceUse['reason'] } {
  const chosen = voiceURI ? voices.find((v) => v.voiceURI === voiceURI) : undefined;
  if (chosen && (online || chosen.localService)) return { voice: chosen };
  const exact = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-') === lang.toLowerCase());
  const base = voices.filter((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const pool = exact.length ? exact : base.length ? base : voices;
  const usable = online ? pool : pool.filter((v) => v.localService);
  const voice = usable.find((v) => v.localService) ?? usable[0];
  const reason = voiceURI ? (chosen ? 'offline' : 'missing') : undefined;
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
  if (speechSupported()) {
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
  if (!speechSupported()) return Promise.resolve('unsupported');
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
      const { voice, reason } = chooseVoice(getVoices(), opts.voiceURI, opts.lang);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang || opts.lang;
      }
      lastUse = { requested: opts.voiceURI, used: voice?.voiceURI, usedName: voice?.name, reason, at: Date.now() };
      listeners.forEach((l) => l(lastUse!));
      u.onend = () => finish('spoken');
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        // A newer tap cancelling this one is normal, not a failure.
        finish(e.error === 'interrupted' || e.error === 'canceled' ? 'spoken' : 'error');
      };
      synth.speak(u);
      if (synth.paused) synth.resume();
      // Some engines never fire `end`; don't leave callers hanging.
      setTimeout(() => finish('spoken'), 2500 + clean.length * 120);
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
      audio.play().then(
        () => undefined,
        () => resolve('error'),
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
export async function speakTile(speak: string, audioUrl: string | undefined, opts: SpeakOptions): Promise<SpeakResult> {
  if (audioUrl) {
    const r = await playRecording(audioUrl, opts.rate, opts.volume);
    if (r === 'recorded') return r;
  }
  return speakText(speak, opts);
}
