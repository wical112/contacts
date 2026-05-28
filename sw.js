/* contacts — service worker
   App shell precache。Firebase / Gemini call 唔經 SW（only same-origin GET）。
   改 code 後一定要 bump VERSION，否則用戶食 cache 舊版。 */
const VERSION = "v2-2026-05-28-debug";
const SHELL = "shell-" + VERSION;
const URLS = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(URLS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(
    ks.filter(k => k !== SHELL).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    } catch {
      return (await c.match("./index.html")) || Response.error();
    }
  })());
});
