// Service worker: guarda a "casca" do app para abrir rápido e instalar como aplicativo.
// Os dados (api.php) sempre vêm da internet.
const CACHE = 'jarvis-v2';
const CASCA = ['./', 'index.php', 'assets/app.css?v=2', 'assets/app.js?v=2', 'manifest.webmanifest', 'assets/icons/icone-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('api.php')) return;
  // rede primeiro; sem internet, usa o que está guardado
  e.respondWith(
    fetch(e.request).then((r) => {
      const copia = r.clone();
      if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./')))
  );
});
