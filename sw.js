/**
 * sw.js – permette di installare la Biblioteca come app e di aprirla anche senza rete
 * © 2026 Angelo Alaia – Tutti i diritti riservati
 *
 * Regola semplice: si chiede SEMPRE prima la versione aggiornata al sito; solo se la rete manca
 * si usa l'ultima copia salvata sul dispositivo. Così gli aggiornamenti arrivano subito come prima.
 * Riguarda solo i file del sito: Firebase, il catalogo SBN e gli altri servizi esterni non passano di qui.
 */
const CACHE = 'spesf-v2';
const SHELL = ['index.html', 'login.html', 'catalogo.html', 'prestiti.html', 'iscritti.html', 'club.html', 'notifiche.html', 'riepilogo.html',
  'styles.css', 'caratteri.css', 'icone.css', 'tema.js', 'app.js', 'state.js', 'cloud.js', 'scanner.js', 'export.js', 'firebase-config.js',
  'logo-grimaldi.png', 'logo-grimaldi-negativo.png', 'icona-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; /* tutto il resto va direttamente in rete */
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await caches.match('index.html') : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
