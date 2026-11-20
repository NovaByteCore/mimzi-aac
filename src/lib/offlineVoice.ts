import type { KokoroTTS } from 'kokoro-js';

export const OFFLINE_VOICES = { af_heart: 'Heart', af_bella: 'Bella' } as const;
export type OfflineVoice = keyof typeof OFFLINE_VOICES;

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const CACHE = 'mimzi-voice-pack-v1';
const READY = new URL('/__mimzi_voice_pack_v1__', typeof location === 'undefined' ? 'https://localhost' : location.origin).href;
let engine: Promise<KokoroTTS> | undefined;

export function offlineVoiceId(uri?: string): OfflineVoice | undefined {
  if (uri === 'mimzi:af_heart') return 'af_heart';
  if (uri === 'mimzi:af_bella') return 'af_bella';
  return undefined;
}

export async function offlinePackReady(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    return Boolean(await (await caches.open(CACHE)).match(READY));
  } catch {
    return false;
  }
}

async function cachedRuntime(cache: Cache, url: string, download: boolean) {
  const stored = await cache.match(url);
  if (stored) return stored;
  if (!download) throw new Error('Offline voice files are missing.');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not download the voice runtime.');
  await cache.put(url, response.clone());
  return response;
}

function loadEngine(download: boolean): Promise<KokoroTTS> {
  engine ??= (async () => {
    const [{ KokoroTTS }, { env }] = await Promise.all([import('kokoro-js'), import('@huggingface/transformers')]);
    const cache = await caches.open(CACHE);
    const root = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${env.version}/dist/`;
    const [js, wasm] = await Promise.all([
      cachedRuntime(cache, root + 'ort-wasm-simd-threaded.jsep.mjs', download),
      cachedRuntime(cache, root + 'ort-wasm-simd-threaded.jsep.wasm', download),
    ]);
    const runtime = URL.createObjectURL(new Blob([await js.arrayBuffer()], { type: 'text/javascript' }));
    try {
      const config = env.backends.onnx.wasm!;
      config.numThreads = 1;
      config.wasmPaths = { mjs: runtime };
      config.wasmBinary = await wasm.arrayBuffer();
      env.allowLocalModels = false;
      env.allowRemoteModels = download;
      env.useBrowserCache = false;
      env.useCustomCache = true;
      env.customCache = cache;
      return await KokoroTTS.from_pretrained(MODEL, { device: 'wasm', dtype: 'q8' });
    } finally {
      URL.revokeObjectURL(runtime);
    }
  })().catch((error: unknown) => {
    engine = undefined;
    throw error;
  });
  return engine;
}

export async function installOfflineVoices(): Promise<void> {
  if (await offlinePackReady()) return;
  const tts = await loadEngine(true);
  for (const voice of Object.keys(OFFLINE_VOICES) as OfflineVoice[]) {
    await tts.generate('Hello!', { voice });
  }
  const cache = await caches.open('kokoro-voices');
  for (const voice of Object.keys(OFFLINE_VOICES)) {
    const url = `https://huggingface.co/${MODEL}/resolve/main/voices/${voice}.bin`;
    if (!(await cache.match(url))) throw new Error('The tablet could not save the voice.');
  }
  await (await caches.open(CACHE)).put(READY, new Response('ready'));
}

export async function generateOfflineSpeech(text: string, voice: OfflineVoice, speed: number): Promise<Blob> {
  if (!(await offlinePackReady())) throw new Error('Download the Mimzi voice pack first.');
  const tts = await loadEngine(false);
  const audio = await tts.generate(text, { voice, speed });
  return audio.toBlob();
}
