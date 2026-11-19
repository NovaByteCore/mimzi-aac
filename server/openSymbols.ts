/*
 * OpenSymbols search pass-through (runs as a serverless function on the same site as Mimzi).
 *
 * OpenSymbols (https://www.opensymbols.org) searches many open-licensed AAC symbol libraries.
 * Its API needs a shared secret that must never be in browser code, so this function:
 *  - reads the secret from the OPENSYMBOLS_SECRET environment variable (set in the host's
 *    dashboard — never committed), swaps it for a short-lived token, and searches,
 *  - returns only results with a licence and an https image, flagged safe for children,
 *  - stores and logs nothing.
 * Without a secret it answers 503 { error: "not-configured" } and Mimzi hides OpenSymbols.
 */
const API = 'https://www.opensymbols.org/api/v2';

export interface OpenSymbol {
  id: string;
  repo: string;
  name: string;
  url: string;
  author: string;
  authorUrl?: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
}

let token: { value: string; at: number } | null = null;
const TOKEN_MS = 10 * 60 * 1000;

function json(status: number, body: unknown, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache } });
}

async function getToken(secret: string, fetchImpl: typeof fetch, fresh = false): Promise<string> {
  if (!fresh && token && Date.now() - token.at < TOKEN_MS) return token.value;
  const res = await fetchImpl(`${API}/token?secret=${encodeURIComponent(secret)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('no token');
  token = { value: body.access_token, at: Date.now() };
  return token.value;
}

export function normalizeOpenSymbols(raw: unknown): OpenSymbol[] {
  if (!Array.isArray(raw)) return [];
  const out: OpenSymbol[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const str = (k: string) => (typeof r?.[k] === 'string' ? (r[k] as string) : undefined);
    const url = str('image_url');
    const license = str('license');
    if (!url || !/^https:\/\//.test(url) || !license?.trim()) continue; // properly licensed, https only
    if (r.unsafe_result === true) continue;
    out.push({
      id: String(r.id ?? str('symbol_key') ?? url),
      repo: str('repo_key') ?? 'unknown',
      name: str('name') ?? '',
      url,
      author: str('author') ?? '',
      authorUrl: str('author_url') ?? undefined,
      license,
      licenseUrl: str('license_url') ?? undefined,
      sourceUrl: str('source_url') ?? (str('details_url') ? `https://www.opensymbols.org${str('details_url')}` : undefined),
    });
  }
  return out;
}

export async function handleSymbolSearch(req: Request, secret: string | undefined, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method !== 'GET') return json(405, { error: 'method' });
  if (!secret) return json(503, { error: 'not-configured' });
  const params = new URL(req.url).searchParams;
  const q = (params.get('q') ?? '').trim();
  const locale = (params.get('locale') ?? 'en').toLowerCase();
  if (!q || q.length > 60 || /[\u0000-\u001f]/.test(q)) return json(400, { error: 'query' });
  if (!/^[a-z]{2}$/.test(locale)) return json(400, { error: 'locale' });
  const search = async (fresh: boolean) => {
    const t = await getToken(secret, fetchImpl, fresh);
    return fetchImpl(`${API}/symbols?q=${encodeURIComponent(q)}&locale=${locale}&safe=1&access_token=${encodeURIComponent(t)}`);
  };
  try {
    let res = await search(false);
    if (res.status === 401) res = await search(true);
    if (res.status === 429) return json(429, { error: 'busy' });
    if (!res.ok) return json(502, { error: 'upstream', status: res.status });
    return json(200, normalizeOpenSymbols(await res.json()), 'public, max-age=86400');
  } catch {
    return json(502, { error: 'unreachable' });
  }
}

/** For tests. */
export function resetOpenSymbolsToken() {
  token = null;
}
