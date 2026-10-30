// 胶片摄影助手 - Service Worker
//
// 策略：stale-while-revalidate（先给缓存，后台更新）
//   选它的理由：胶片用户常在无网环境查参数，离线必须命中；同时发布新版后
//   用户下次打开能拿到新内容（旧版用 network-first + 不预缓存 HTML，
//   离线时反而没有可回退的页面）。
//
// 版本：改 BUILD 即可让所有用户换到新缓存，activate 会清掉旧版本。

const BUILD = '20261031-2';
const CACHE_PREFIX = 'film-app-';
const CACHE = CACHE_PREFIX + BUILD;

// 预缓存清单：入口 HTML 必须在里面，否则首次离线访问没有任何页面可回退
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-mask.svg',
  // 拆出独立文件后必须一起缓存：漏一个，离线时页面就是没样式或不能点
  './src/app.css',
  './src/app.js'
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

// 判断是不是一个能交给 respondWith 的 Response。
// 没有这个检查时，file:// 下 caches.match 可能返回 undefined，
// respondWith(undefined) 会让整个导航失败 —— 表现为双击开关直接白屏，
// 而且控制台只有一句 "an object that was not a Response was passed"。
function isResponse(v) {
  return !!v && typeof v === 'object' && typeof v.status === 'number' && 'body' in v;
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url;
  try { url = new URL(e.request.url); } catch (_) { return; }
  // 只接管本站资源；跨域交给浏览器默认处理
  if (url.origin !== self.location.origin) return;
  // 导航请求无缓存时必须回落到网络，不能让 respondWith 拿到空值
  if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;

  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(e.request).then(function (hit) {
        var cached = isResponse(hit) ? hit : null;

        var net = fetch(e.request).then(function (res) {
          // 只缓存真正的成功响应。原来看 res.ok 会把 404 页面也存下来，
          // 之后离线访问一律拿到那张 404，且永远不会自愈。
          if (res && res.status === 200 && res.type !== 'opaque') {
            try { c.put(e.request, res.clone()); } catch (_) {}
          }
          return res;
        }).catch(function () {
          // 网络失败：有缓存给缓存
          return cached;
        });

        // 有缓存先给缓存（stale-while-revalidate 的本意）
        if (cached) return cached;
        return net.then(function (res) {
          // 网络也失败且没有缓存：返回一个明确的离线页，
          // 而不是让浏览器抛 ERR_FAILED
          if (isResponse(res)) return res;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>离线</title>' +
            '<body style="font:16px/1.7 system-ui;padding:40px;color:#333">' +
            '<h2>当前处于离线状态</h2><p>这个页面还没有被缓存过。连上网络后再打开一次即可离线使用。</p></body>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      });
    }).catch(function () {
      // 整个缓存流程出任何意外，都退回网络，绝不 reject respondWith
      return fetch(e.request).catch(function () {
        return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      });
    })
  );
});
