/*
 * Google Photos pass-through (runs as a serverless function on the same site as Mimzi).
 *
 * Why: Google requires an Authorization header to download a picked photo and doesn't send
 * CORS headers, so a web page can't download it directly. This function forwards ONE
 * request to Google with the parent's own short-lived token and streams the photo back.
 *
 * Safety:
 *  - only https://*.googleusercontent.com URLs (no open proxy)
 *  - only GET, only with a Bearer token, only image responses, size-capped
 *  - nothing is stored or logged; no secrets live here
 */
const MAX_BYTES = 25 * 1024 * 1024;

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
  const target = new URL(req.url).searchParams.get('url');
  if (!isAllowedPhotoUrl(target)) return text(400, 'Only Google Photos addresses are allowed');
  const auth = req.headers.get('Authorization') ?? '';
  if (!/^Bearer [\w.\-~+/]+=*$/.test(auth)) return text(401, 'Missing Google sign-in');

  let upstream: Response;
  try {
    upstream = await fetchImpl(target, { headers: { Authorization: auth }, redirect: 'follow' });
  } catch {
    return text(502, 'Could not reach Google Photos');
  }
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
