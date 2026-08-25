// 胶片摄影助手 - Service Worker
// 策略：HTML / 导航请求 network-first（每次打开都取服务器最新），静态资源 cache-first（离线兜底）
const CACHE = 'film-cache-v2';
const ASSETS = [
  './manifest.webmanifest',
  './icon.svg',
  './icon-mask.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 仅预缓存静态资源；HTML 走 network-first，不预缓存，避免锁住旧页面
      return c.addAll(ASSETS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  // 非同源（如摄像头流 getUserMedia 产生的请求）直接走网络
  if (url.origin !== self.location.origin) return;

  // 导航 / HTML：network-first —— 保证每次打开都是最新
  var isHtml = e.request.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname === '/'
    || url.pathname.endsWith('/');
  if (isHtml) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (h) { return h || caches.match('./index.html'); });
      })
    );
    return;
  }

  // 其它静态资源：cache-first，离线可用
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      });
    })
  );
});
