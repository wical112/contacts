/* contacts — service worker v9
   策略改動（解決舊用戶食 v7 cache）：
   - install 時清掉所有舊版本 cache（不再保留任何之前 shell）
   - HTML / navigation request 改 network-first（永遠拿最新 index.html）
   - 其他 static asset（icons / manifest / svg）仍 cache-first
   - skipWaiting + clients.claim 讓新 SW 立即 active
*/
const VERSION = "v11-2026-05-29-wenqing-light";
const SHELL = "shell-" + VERSION;
const URLS = [
  "./", "./index.html", "./manifest.webmanifest", "./icon.svg",
  "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    // 先 nuke 所有舊 cache（包括所有舊 VERSION shell-*）
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    const c = await caches.open(SHELL);
    await c.addAll(URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation / HTML 一律 network-first，保證拿最新 index.html
  const isHTML = req.mode === "navigate"
    || (req.headers.get("accept") || "").includes("text/html")
    || url.pathname === "/" || url.pathname.endsWith(".html");
  if (isHTML) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: "no-cache" });
        if (res && res.ok) {
          const c = await caches.open(SHELL);
          c.put(req, res.clone());
        }
        return res;
      } catch {
        const c = await caches.open(SHELL);
        return (await c.match(req, { ignoreSearch: true }))
          || (await c.match("./index.html"))
          || Response.error();
      }
    })());
    return;
  }

  // 其他 static asset：cache-first
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone());
      return res;
    } catch {
      return (await c.match("./index.html")) || Response.error();
    }
  })());
});
