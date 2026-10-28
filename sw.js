// Service worker: guarda a "casca" do app para ele abrir mesmo longe do PC.
// Os dados (api.php) ficam com o app.js, que guarda a última cópia de cada tela
// e uma fila de ações para sincronizar.
const CACHE = 'jarvis-v3';
const FONTES = 'jarvis-fontes';
const CASCA = ['./', 'assets/app.css?v=3', 'assets/app.js?v=3', 'manifest.webmanifest', 'assets/icons/icone-192.png', 'assets/icons/icone-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== FONTES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // fontes do Google: guarda na primeira vez e usa a cópia depois
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTES).then((c) => c.match(e.request).then((r) => r || fetch(e.request).then((n) => { c.put(e.request, n.clone()); return n; }))));
    return;
  }
  if (url.origin !== location.origin || url.pathname.endsWith('api.php')) return;
  // rede primeiro (com limite de tempo); sem o PC, usa o que está guardado
  const navegacao = e.request.mode === 'navigate';
  e.respondWith(
    Promise.race([fetch(e.request), new Promise((_, nao) => setTimeout(() => nao(new Error('demorou')), 4000))]).then((r) => {
      const copia = r.clone();
      if (r.ok) caches.open(CACHE).then((c) => c.put(navegacao ? './' : e.request, copia));
      return r;
    }).catch(() => caches.match(navegacao ? './' : e.request).then((r) => r || caches.match('./')))
  );
});
