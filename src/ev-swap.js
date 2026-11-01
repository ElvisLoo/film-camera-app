/**
 * 等效曝光换算（互易律）
 *
 * 摄影里最常问的一句是「同样是这个亮度，换个光圈怎么拍？」
 * 心里算错一档就是过曝或欠曝，而胶片的容错只有 1-2 档，反转片更是不到 1 档。
 *
 * 公式（EV 用 ISO100 为基准）：
 *   EV100 = log2(N² / t) − log2(ISO / 100)
 *   其中 N 是光圈 f 值，t 是快门秒数。
 * 反过来已知 EV 求某个光圈下的快门：t = N² / 2^(EV + log2(ISO/100))
 *
 * 全部用纯函数，方便在浏览器里直接验证，也方便将来被测光模块复用。
 */
(function (global) {
  'use strict';

  var APERTURES = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
  // 快门刻度按三分之一档排布（相机上的实际刻度），不是纯几何级数
  var SHUTTERS = [
    1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30,
    1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 15, 30,
  ];
  var ISOS = [50, 100, 200, 400, 800, 1600];

  /** "1/125" / "1s" / "2s" → 秒 */
  function parseShutter(text) {
    var s = String(text || '').trim().toLowerCase();
    if (!s) return NaN;
    if (s.indexOf('/') >= 0) {
      var p = s.split('/');
      var a = Number(p[0]);
      var b = Number(p[1]);
      if (!isFinite(a) || !isFinite(b) || b === 0) return NaN;
      return a / b;
    }
    var n = Number(s.replace(/s$/, ''));
    return isFinite(n) && n > 0 ? n : NaN;
  }

  /** 秒 → 显示文案（和相机刻度一致） */
  function formatShutter(t) {
    if (!(t > 0) || !isFinite(t)) return '—';
    // 相机上没有比 1/8000 更快的机械快门，也没有比 30 秒更长的档位。
    // 但长曝光场景（星轨、夜景）确实会用到几分钟，
    // 所以慢端放宽到 10 分钟才判定「超出可用范围」。
    var FASTEST = 1 / 8000;
    var SLOWEST_OK = 600;
    if (t < FASTEST / 2) return '快于 1/8000';
    if (t > SLOWEST_OK) {
      if (t >= 3600) return '超过 1 小时';
      return '长于 10 分钟';
    }
    if (t < 1) {
      var d = Math.round(1 / t);
      if (d < 1) d = 1;
      return '1/' + d;
    }
    // 超过 60 秒用「Xm Ys」，直接写 120s 会让人数错
    if (t >= 60) {
      var total = Math.round(t);
      var m = Math.floor(total / 60);
      var sec = total % 60;
      return sec === 0 ? m + 'm' : m + 'm' + sec + 's';
    }
    // 去掉浮点尾巴：15 不要显示成 15.000000000000002
    var r = Math.round(t * 10) / 10;
    return (r % 1 === 0 ? String(r) : r.toFixed(1)) + 's';
  }

  /** 计算 EV（以 ISO100 为基准） */
  function evOf(aperture, shutterSec, iso) {
    var N = Number(aperture);
    var t = Number(shutterSec);
    var S = Number(iso);
    if (!(N > 0) || !(t > 0) || !(S > 0)) return NaN;
    var ev = Math.log(N * N / t) / Math.LN2 - Math.log(S / 100) / Math.LN2;
    return isFinite(ev) ? ev : NaN;
  }

  /** 已知 EV 与光圈、ISO，求快门秒数 */
  function shutterFor(ev, aperture, iso) {
    var N = Number(aperture);
    var S = Number(iso);
    if (!isFinite(ev) || !(N > 0) || !(S > 0)) return NaN;
    var t = (N * N) / Math.pow(2, ev + Math.log(S / 100) / Math.LN2);
    return isFinite(t) && t > 0 ? t : NaN;
  }

  /** 找最接近的刻度值（相机的快门/光圈都是离散的） */
  function nearest(list, value) {
    var best = list[0];
    var bestD = Infinity;
    for (var i = 0; i < list.length; i++) {
      // 用对数距离：快门和光圈都是等比刻度，线性距离会偏向大值
      var d = Math.abs(Math.log(list[i]) - Math.log(value));
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    return best;
  }

  /**
   * 给定一个 EV，列出「常见光圈 × 可用快门」的组合。
   * 只保留落在刻度范围里的，并按快门从快到慢排序。
   */
  function combinations(ev, iso) {
    var out = [];
    for (var i = 0; i < APERTURES.length; i++) {
      var n = APERTURES[i];
      var t = shutterFor(ev, n, iso);
      if (!isFinite(t) || t <= 0) continue;
      // 只保留快门刻度范围内的，超出范围说明这个光圈在现实里用不了
      if (t < SHUTTERS[0] / 1.2 || t > SHUTTERS[SHUTTERS.length - 1] * 1.2) continue;
      var snapped = nearest(SHUTTERS, t);
      out.push({
        aperture: n,
        shutter: snapped,
        exact: t,
        // 吸附到刻度会带来偏差，超过 1/6 档就该提醒
        errStops: Math.abs(Math.log(t / snapped) / Math.LN2),
        text: 'f/' + n + ' · ' + formatShutter(snapped),
      });
    }
    return out;
  }

  var api = {
    APERTURES: APERTURES,
    SHUTTERS: SHUTTERS,
    ISOS: ISOS,
    parseShutter: parseShutter,
    formatShutter: formatShutter,
    evOf: evOf,
    shutterFor: shutterFor,
    nearest: nearest,
    combinations: combinations,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EVSwap = api;
})(typeof window !== 'undefined' ? window : globalThis);
