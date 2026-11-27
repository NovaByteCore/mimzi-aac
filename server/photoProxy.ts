/*
 * Google Photos pass-through (runs as a serverless function on the same site as Mimzi).
 *
 * Why: Google requires an Authorization header to download a picked photo and doesn't send
 * CORS headers, so a web page can't download it directly. This function forwards ONE
 * request to Google with the parent's own short-lived token and streams the photo back.
 *
 * Safety:
 *  - only https://*.googleusercontent.com URLs, including after redirects (no open proxy),
 *    and only for Mimzi's own pages (same-origin check)
 *  - only GET, only with a Bearer token, only image responses, size-capped
 *  - nothing is stored or logged; no secrets live here
 */
import { fromSameSite } from './sameOrigin';

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export function isAllowedPhotoUrl(raw: string | null): raw is string {
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && (u.hostname === 'googleusercontent.com' || u.hostname.endsWith('.googleusercontent.com')) && !u.username && !u.password && !u.port;
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function handlePhotoProxy(req: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method !== 'GET') return text(405, 'Method not allowed');
  if (!fromSameSite(req)) return text(403, 'Forbidden');
  const target = new URL(req.url).searchParams.get('url');
  if (!isAllowedPhotoUrl(target)) return text(400, 'Only Google Photos addresses are allowed');
  const auth = req.headers.get('Authorization') ?? '';
  if (!/^Bearer [\w.\-~+/]+=*$/.test(auth)) return text(401, 'Missing Google sign-in');

  // Follow redirects by hand so the parent's token is only ever sent to Google.
  let upstream: Response | undefined;
  let url = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      upstream = await fetchImpl(url, { headers: { Authorization: auth }, redirect: 'manual' });
    } catch {
      return text(502, 'Could not reach Google Photos');
    }
    if (upstream.status < 300 || upstream.status >= 400) break;
    const next = upstream.headers.get('Location');
    const abs = next ? new URL(next, url).href : null;
    if (!isAllowedPhotoUrl(abs)) return text(502, 'Google Photos redirected somewhere unexpected');
    url = abs;
    upstream = undefined;
  }
  if (!upstream) return text(502, 'Too many redirects');
  if (!upstream.ok) return text(upstream.status === 401 || upstream.status === 403 ? upstream.status : 502, `Google Photos returned ${upstream.status}`);
  const type = upstream.headers.get('Content-Type') ?? '';
  if (!type.startsWith('image/')) return text(415, 'Not a photo');
  const len = Number(upstream.headers.get('Content-Length') ?? '0');
  if (len > MAX_BYTES) return text(413, 'Photo too large');
  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return text(413, 'Photo too large');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': type, 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' },
  });
}
