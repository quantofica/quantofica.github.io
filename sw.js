// QuantoFica: funcionamento sem internet.
// Ao publicar uma nova versão, altere VERSION para que os telemóveis recebam a atualização.
const VERSION = "quantofica-2026-10-19a";
const CORE = ["./", "./index.html", "./manifest.webmanifest",
  "./icons/icon-192.png?v=2", "./icons/icon-512.png?v=2", "./icons/maskable-512.png?v=2",
  "./icons/apple-touch-icon.png?v=2", "./icons/favicon-32.png?v=2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Página: tenta a rede primeiro (para receber atualizações) e usa a cópia guardada sem internet.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req.url, { cache: "no-store" }).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put("./index.html", copy)); return r; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  // Ficheiros da app e tipos de letra: usa a cópia guardada e atualiza em segundo plano.
  const sameOrigin = url.origin === location.origin;
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "cdnjs.cloudflare.com";
  if (!sameOrigin && !fonts) return;
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
