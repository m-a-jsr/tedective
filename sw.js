// Service worker: keeps the app in the device so it starts without internet.
// gen/deploy.py fills VERSION and FILES (every file of the app); a new VERSION makes the device
// download the new app in the background, used from the next start.

const VERSION = "fe9efa27e19a";
const FILES = ["./", "css/app.css", "css/look.css", "img/ikona/apple-touch-180.png", "img/ikona/ikona-192.png", "img/ikona/ikona-512.png", "img/ikona/ikona-maskable-192.png", "img/ikona/ikona-maskable-512.png", "img/ikona/ikona-maskable.svg", "img/ikona/ikona.svg", "img/pozadi/D0.svg", "img/pozadi/D1.svg", "img/pozadi/D2.svg", "img/pozadi/H1.jpg", "img/pozadi/H2.jpg", "img/pozadi/H3.jpg", "img/pozadi/H4.jpg", "img/pozadi/H5.jpg", "img/pozadi/H6.jpg", "img/pozadi/K1.jpg", "img/pozadi/K2.jpg", "img/pozadi/K3.jpg", "img/pozadi/K4.jpg", "img/pozadi/LICENCE.md", "img/pozadi/M1.jpg", "img/pozadi/M10.jpg", "img/pozadi/M2.jpg", "img/pozadi/M3.jpg", "img/pozadi/M4.jpg", "img/pozadi/M5.jpg", "img/pozadi/M6.jpg", "img/pozadi/M7.jpg", "img/pozadi/M8.jpg", "img/pozadi/M9.jpg", "index.html", "js/data/codec.js", "js/data/content.js", "js/data/github.js", "js/data/store.js", "js/data/sync.js", "js/features.js", "js/game/daily.js", "js/game/progression.js", "js/game/session.js", "js/logic/clues.js", "js/logic/czech.js", "js/logic/gen-worker.js", "js/logic/generate.js", "js/logic/grid.js", "js/logic/player.js", "js/logic/sat.js", "js/logic/solver.js", "js/main.js", "js/ui/appearance.js", "js/ui/cast.js", "js/ui/challenges.js", "js/ui/collection.js", "js/ui/conflicts.js", "js/ui/dom.js", "js/ui/game.js", "js/ui/generator.js", "js/ui/home.js", "js/ui/look.js", "js/ui/news.js", "js/ui/print.js", "js/ui/settings.js", "js/ui/setup.js", "js/ui/sound.js", "js/ui/stats.js", "manifest.webmanifest"];
// pictures that are only unlocked later are cached when first shown, not up front
const LAZY = /^img\/pozadi\/(?!M9\.jpg|D0\.svg)/;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // "reload" bypasses the browser's HTTP cache (GitHub Pages lets it keep files for 10 min),
    // otherwise a new version could be stored with old files
    await cache.addAll(FILES.filter(f => !LAZY.test(f)).map(f => new Request(f, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // GitHub API goes straight to the network
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) cache.put(e.request, res.clone());
    return res;
  })());
});
