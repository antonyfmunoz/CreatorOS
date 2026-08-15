const VERSION = "creativesos-shell-v2";
const PUBLIC_SHELL = ["/offline.html", "/creativesos.webmanifest", "/field-capture-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PUBLIC_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("creativesos-shell-") && key !== VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) void caches.open(VERSION).then((cache) => cache.put(event.request, response.clone()));
      return response;
    })));
  }
});

// Background Sync is only a wake-up signal. Authenticated request bodies stay
// in the app's user-scoped IndexedDB outbox and are replayed by a visible,
// current-user client, never cached in the service worker.
self.addEventListener("sync", (event) => {
  if (event.tag !== "creativesos-offline-outbox") return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) client.postMessage({ type: "creativesos:flush-offline-outbox" });
  }));
});
