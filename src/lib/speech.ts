/*
 * Speech output. Browser text-to-speech differs a lot between iPadOS Safari and
 * Android Chrome, so this module is defensive:
 *  - speak synchronously inside the tap (iOS only allows speech from a user gesture),
 *  - never wait forever for an `end` event that some engines never send,
 *  - report failures so the screen can still show the word.
 * Caregiver recordings (when a tile has one) are played instead of text-to-speech and
 * work fully offline.
 */
export type SpeakResult = 'spoken' | 'recorded' | 'unsupported' | 'error';

export interface SpeakOptions {
  rate: number;
  lang: string;
  voiceURI?: string;
}

let currentAudio: HTMLAudioElement | null = null;

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

export function pickVoice(voices: SpeechSynthesisVoice[], voiceURI: string | undefined, lang: string) {
  if (voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  const exact = voices.filter((v) => v.lang?.toLowerCase() === lang.toLowerCase());
  const base = voices.filter((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const pool = exact.length ? exact : base;
  return pool.find((v) => v.localService) ?? pool[0];
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
  stopAll();
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
      u.rate = Math.min(1.5, Math.max(0.5, opts.rate));
      u.lang = opts.lang;
      const voice = pickVoice(getVoices(), opts.voiceURI, opts.lang);
      if (voice) u.voice = voice;
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

export function playRecording(url: string, rate: number): Promise<SpeakResult> {
  stopAll();
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      currentAudio = audio;
      audio.playbackRate = Math.min(1.5, Math.max(0.5, rate));
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

/** Speak a tile: recording first (offline, parent's voice), then text-to-speech as fallback. */
export async function speakTile(
  speak: string,
  audioUrl: string | undefined,
  opts: SpeakOptions,
): Promise<SpeakResult> {
  if (audioUrl) {
    const r = await playRecording(audioUrl, opts.rate);
    if (r === 'recorded') return r;
  }
  return speakText(speak, opts);
}
