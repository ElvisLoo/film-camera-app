// 胶片摄影助手 - Service Worker
//
// 策略：stale-while-revalidate（先给缓存，后台更新）
//   选它的理由：胶片用户常在无网环境查参数，离线必须命中；同时发布新版后
//   用户下次打开能拿到新内容（旧版用 network-first + 不预缓存 HTML，
//   离线时反而没有可回退的页面）。
//
// 版本：改 BUILD 即可让所有用户换到新缓存，activate 会清掉旧版本。

const BUILD = '20261030-1';
const CACHE_PREFIX = 'film-app-';
const CACHE = CACHE_PREFIX + BUILD;

// 预缓存清单：入口 HTML 必须在里面，否则首次离线访问没有任何页面可回退
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-mask.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 逐条 add 并各自 catch：单个图标 404 不应让整次安装失败，
      // 否则旧 SW 继续服务，用户永远停在旧版。
      return Promise.all(PRECACHE.map(function (url) {
        return c.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) {
          // 只删本应用的旧版本，不碰同域其它应用的缓存
          return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE;
        }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url;
  try { url = new URL(e.request.url); } catch (_) { return; }
  // 只接管本站资源；跨域交给浏览器默认处理
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(e.request).then(function (hit) {
        var net = fetch(e.request).then(function (res) {
          if (res && res.ok) c.put(e.request, res.clone());
          return res;
        }).catch(function () {
          // 网络失败：有缓存给缓存，没缓存就如实失败
          return hit;
        });
        return hit || net;
      });
    })
  );
});
