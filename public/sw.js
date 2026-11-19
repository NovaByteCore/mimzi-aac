/* Mimzi service worker — keeps the communication board working offline.
 *
 * Strategy
 *  - On install, cache the app shell: index.html plus every /assets/ file it references,
 *    the manifest and the icons.
 *  - Serve same-origin GET requests cache-first, refreshing the shell in the background.
 *  - A new index.html is only stored once all of the assets it needs are cached, so an
 *    update can never leave the offline copy half-finished.
 *
 * Photos, recordings and tiles live in IndexedDB, not here, so they are available
 * offline without any network request.
 *
 * AAC symbols (bundled Mulberry files, ARASAAC pictograms from static.arasaac.org and any
 * symbol a grown-up picks from another library) are kept in their own cache, so once the
 * app has asked for them they work without internet.
 */
const CACHE = 'mimzi-shell-v3';
const SYMBOLS = 'mimzi-symbols-v1';
// Hosts often send `Vary: Origin` / `Vary: Accept-Encoding`; the page's module script
// request carries an Origin header the precache request didn't, so match by URL only.
const MATCH = { ignoreVary: true, ignoreSearch: false };
const SCOPE = new URL('./', self.registration.scope);
// Symbol image hosts the board may load directly (cache-first).
const REMOTE_SYMBOL_HOSTS = new Set(['static.arasaac.org']);
const INDEX_URL = new URL('index.html', SCOPE).href;
const STATIC_FILES = [
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
].map((p) => new URL(p, SCOPE).href);

function assetUrlsFrom(html) {
  const urls = new Set();
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const url = new URL(m[1], SCOPE);
    if (url.origin === SCOPE.origin && url.pathname.includes('/assets/')) urls.add(url.href);
  }
  return [...urls];
}

async function cacheShell() {
  const cache = await caches.open(CACHE);
  const res = await fetch(INDEX_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('index.html ' + res.status);
  const html = await res.clone().text();
  const assets = assetUrlsFrom(html);
  await cache.addAll(assets);
  await cache.put(INDEX_URL, res);
  // Remove assets from older builds.
  const keep = new Set([...assets, INDEX_URL, ...STATIC_FILES]);
  for (const req of await cache.keys()) {
    if (req.url.includes('/assets/') && !keep.has(req.url)) await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(STATIC_FILES);
      await cacheShell();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE && key !== SYMBOLS && key.startsWith('mimzi-')) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin) {
    // Remote AAC symbols: serve the saved copy when there is one (works offline).
    if (url.protocol !== 'https:' || (req.destination !== 'image' && !REMOTE_SYMBOL_HOSTS.has(url.hostname))) return;
    event.respondWith(
      (async () => {
        const cache = await caches.open(SYMBOLS);
        const cached = await cache.match(url.href, MATCH);
        if (cached) return cached;
        const res = await fetch(req);
        if (REMOTE_SYMBOL_HOSTS.has(url.hostname) && (res.ok || res.type === 'opaque')) await cache.put(url.href, res.clone());
        return res;
      })(),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(INDEX_URL, MATCH);
        const refresh = cacheShell().catch(() => undefined);
        if (cached) {
          event.waitUntil(refresh);
          return cached;
        }
        try {
          return await fetch(req);
        } catch {
          return new Response('Mimzi is offline and has not been saved on this device yet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  // AAC symbols: cache-first in their own cache so they work offline once seen.
  if (url.pathname.includes('/symbols/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SYMBOLS);
        const cached = await cache.match(req, MATCH);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, MATCH);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/icons/'))) {
        await cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'mimzi:refresh-shell') event.waitUntil(cacheShell().catch(() => undefined));
  // The app sends the symbols its words use, so they're saved for offline use right away.
  if (event.data && event.data.type === 'mimzi:cache-symbols' && Array.isArray(event.data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SYMBOLS);
        for (const u of event.data.urls) {
          let abs;
          try {
            abs = new URL(u, SCOPE);
          } catch {
            continue;
          }
          const local = abs.origin === SCOPE.origin;
          if (local ? !abs.pathname.includes('/symbols/') : abs.protocol !== 'https:') continue;
          if (await cache.match(abs.href, MATCH)) continue;
          try {
            let res;
            try {
              res = await fetch(abs.href, local ? undefined : { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
            } catch (e) {
              // Host doesn't allow CORS: keep an opaque copy (still displays in <img>).
              if (local) throw e;
              res = await fetch(abs.href, { mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
            }
            if (res.ok || res.type === 'opaque') await cache.put(abs.href, res);
          } catch {
            /* offline — try again next time */
          }
        }
      })(),
    );
  }
});
