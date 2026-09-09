// Service worker voor de Kompas-app.
// Doel: de app installeerbaar maken (PWA) én laten werken zonder netwerk.
//
// Strategie per soort verzoek:
//  - Data van Firebase (inloggen, database): NOOIT cachen — altijd live.
//  - Firebase-SDK + Google Fonts (vaste, geversioneerde URL's): cache-first,
//    zodat de app ook offline kan opstarten.
//  - Eigen bestanden (index.html, iconen): stale-while-revalidate — meteen uit
//    cache tonen, op de achtergrond verversen.

const VERSION = "kompas-v3";
const SHELL_CACHE = VERSION + "-shell";
const CDN_CACHE = VERSION + "-cdn";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./kompas-embleem.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
];

// Hostnames waarvan het antwoord per gebruiker/moment verschilt: nooit cachen.
const LIVE_ONLY = [
  "firestore.googleapis.com",
  "firebaseio.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "firebase.googleapis.com",
  "ntfy.sh",
];

// Statische, geversioneerde bronnen: veilig om lang te bewaren.
const CACHEABLE_CDN = [
  "www.gstatic.com",       // Firebase-SDK modules
  "fonts.googleapis.com",  // font-CSS
  "fonts.gstatic.com",     // font-bestanden
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) =>
      // per bestand toevoegen: één 404 mag de rest niet blokkeren
      Promise.allSettled(SHELL.map((u) => c.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== CDN_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  const host = url.hostname;

  // 1. Live-only: laat de browser het normaal afhandelen (nooit cache).
  if (LIVE_ONLY.some((h) => host === h || host.endsWith("." + h))) return;

  // 2. Geversioneerde CDN-bronnen: cache-first.
  if (CACHEABLE_CDN.includes(host)) {
    e.respondWith(cacheFirst(req, CDN_CACHE));
    return;
  }

  // 3. Eigen bestanden: stale-while-revalidate, met index.html als laatste redmiddel.
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  // 4. Al het andere: geen bemoeienis.
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    return hit || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  const fetching = fetch(req)
    .then((res) => {
      if (res && res.ok && res.type === "basic") {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);
  return hit || (await fetching) || cache.match("./index.html");
}
