// Oak S3 spike - hand-written Service Worker (no Workbox).
//   /sounds/<packVersion>/*  CacheFirst  (immutable: the version is in the path)
//   everything else same-origin GET (app shell)  NetworkFirst, falling back to cache when offline
// Production: template PACK_VERSION from scripts/sounds/pack.config.ts at build time.
const PACK_VERSION = "v1";
const SOUNDS_CACHE = `oak-sounds-${PACK_VERSION}`;
const SHELL_CACHE = "oak-shell-v1";
const stats = { soundsFromCache: 0, soundsFromNetwork: 0, shellFromCache: 0, shellFromNetwork: 0, failed: 0 };

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // drop caches of older pack versions
      for (const name of await caches.keys()) {
        if (name.startsWith("oak-sounds-") && name !== SOUNDS_CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(SOUNDS_CACHE);
  // ignoreSearch: the pack never uses query strings; ignoreVary: static files
  const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  if (hit) {
    stats.soundsFromCache++;
    return hit;
  }
  const response = await fetch(request);
  // only cache complete, successful, same-origin responses (never a 206 or an error page)
  if (response.status === 200 && response.type === "basic") {
    stats.soundsFromNetwork++;
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.status === 200 && response.type === "basic") {
      stats.shellFromNetwork++;
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (hit) {
      stats.shellFromCache++;
      return hit;
    }
    stats.failed++;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch third-party requests
  if (url.pathname.startsWith("/api/")) return; // tutor/server API is never cached
  if (url.pathname.startsWith("/sounds/")) event.respondWith(cacheFirst(request));
  else event.respondWith(networkFirst(request));
});

self.addEventListener("message", (event) => {
  const { type, urls } = event.data ?? {};
  const reply = (data) => event.ports[0]?.postMessage(data);
  if (type === "stats") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SOUNDS_CACHE);
        reply({ ...stats, soundsCached: (await cache.keys()).length, cache: SOUNDS_CACHE });
      })(),
    );
  } else if (type === "precache") {
    // "download the whole pack for offline use": small batches, skip what is already cached
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SOUNDS_CACHE);
        let added = 0;
        let bytes = 0;
        const errors = [];
        const queue = [...urls];
        const worker = async () => {
          for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
            try {
              if (await cache.match(url, { ignoreVary: true })) continue;
              const response = await fetch(url);
              if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
              bytes += Number(response.headers.get("content-length") ?? 0);
              await cache.put(url, response);
              added++;
            } catch (err) {
              errors.push(`${url}: ${err.message}`);
            }
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        reply({ added, bytes, errors, soundsCached: (await cache.keys()).length });
      })(),
    );
  }
});
