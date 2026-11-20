/**
 * Only answer requests made by Mimzi's own pages. Browsers send Sec-Fetch-Site (and Origin
 * on cross-site requests), so another website can't use these functions — e.g. to spend the
 * OpenSymbols key's quota or relay requests through this site.
 */
export function fromSameSite(req: Request): boolean {
  const site = req.headers.get('Sec-Fetch-Site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = req.headers.get('Origin');
  if (!origin) return true; // older browsers on same-origin GET send neither header
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
