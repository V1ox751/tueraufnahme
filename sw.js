/* Türaufnahme – Service Worker: hält die App offline verfügbar. */
var CACHE = 'tueraufnahme-v4';
var ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-512.png', './logo-full.png', './logo-mark.png'];

function clean(res) {
  // Safari mag keine weitergeleiteten Antworten aus dem Cache bei Navigationen
  if (!res || !res.redirected) return Promise.resolve(res);
  return res.blob().then(function (b) { return new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }); });
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return fetch(u, { cache: 'reload' }).then(function (r) {
          if (!r.ok) throw new Error(u + ' ' + r.status);
          return clean(r).then(function (cr) { return c.put(u, cr); });
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Nur Aufrufe der App-Seite selbst (Ordner oder index.html) zählen als App – sonst würde z. B. ein
  // geöffnetes Icon-Bild die gespeicherte App ersetzen.
  var scopePath = new URL(self.registration.scope).pathname;
  var isApp = req.mode === 'navigate' && (url.pathname === scopePath || url.pathname === scopePath + 'index.html');
  var key = isApp ? './index.html' : req;
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(key, { ignoreSearch: true }).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') {
            return clean(res.clone()).then(function (cr) { return c.put(key, cr); }).then(function () { return res; }, function () { return res; });
          }
          return res;
        }).catch(function () { return null; });
        if (hit) { try { e.waitUntil(net); } catch (x) {} return hit; }        // sofort aus dem Cache, im Hintergrund aktualisieren
        return net.then(function (res) { return res || new Response('Offline – bitte einmal mit Netz öffnen.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); });
      });
    })
  );
});
