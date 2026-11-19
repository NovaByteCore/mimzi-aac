/*
 * Parent Mode PIN. The PIN keeps little fingers out of the editing screens; it is not
 * a security boundary for someone who already holds the unlocked device.
 * PBKDF2 (Web Crypto) is used whenever the page is served over HTTPS or localhost.
 */
import type { Settings } from '../types';

type PinRecord = NonNullable<Settings['pin']>;

const ITERATIONS = 150_000;

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return toHex(bytes);
}

function fallbackHash(pin: string, salt: string): string {
  // FNV-1a, iterated. Only used on insecure origins (plain http on a LAN) where Web Crypto is unavailable.
  let h = 0x811c9dc5;
  const input = `${salt}:${pin}`;
  for (let round = 0; round < 5000; round++) {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16);
}

async function pbkdf2(pin: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(bits);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error('PIN must be 4 to 8 digits.');
  const salt = randomSalt();
  if (globalThis.crypto?.subtle) return { hash: await pbkdf2(pin, salt), salt, algo: 'pbkdf2' };
  return { hash: fallbackHash(pin, salt), salt, algo: 'fallback' };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  if (record.algo === 'pbkdf2') {
    if (!globalThis.crypto?.subtle) return false;
    return (await pbkdf2(pin, record.salt)) === record.hash;
  }
  return fallbackHash(pin, record.salt) === record.hash;
}
