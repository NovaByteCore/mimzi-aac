import type { SymbolInfo } from '../types';
import { arasaacInfo, arasaacUrl, bundledArasaacUrl, licenseAllowed, localSymbolData } from './symbols';

/** The original image to save locally. Built-in assets and saved copies need no network. */
export function remotePicture(symbol: string | undefined, info?: SymbolInfo) {
  if (!symbol || localSymbolData(info?.localImage)) return;
  if (symbol.startsWith('arasaac:')) {
    const id = symbol.slice(8);
    const metadata = info ?? arasaacInfo(id, '');
    if (licenseAllowed(metadata) && !bundledArasaacUrl(id)) return { url: arasaacUrl(id), info: metadata };
  } else if (symbol.startsWith('os:') && info?.url && licenseAllowed(info)) {
    return { url: info.url, info };
  }
}

export async function downloadPicture(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Picture download failed');
  const blob = await response.blob();
  if (!blob.size || blob.size > 1024 * 1024) throw new Error('Invalid picture size');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob.slice(0, blob.size, blob.type.split(';')[0]));
  });
  if (!localSymbolData(data)) throw new Error('Unsupported picture format');
  const picture = new Image();
  picture.src = data;
  await picture.decode();
  return data;
}
