// Eenvoudige service worker voor de Voorbeeldleiderschap-app.
// Doel: de app installeerbaar maken (PWA) en de schil sneller laden.
// We cachen alleen het eigen HTML-bestand; Firebase-verkeer gaat altijd live
// naar het netwerk, zodat je gegevens nooit "oud" uit de cache komen.

const CACHE = "leiderschap-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Alles wat naar Firebase, Google of ntfy gaat: altijd live, nooit cachen.
  if (
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic") ||
    url.hostname.includes("ntfy.sh")
  ) {
    return; // laat de browser het normaal afhandelen
  }
  // Voor de eigen app-bestanden: eerst netwerk, val terug op cache (offline).
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
