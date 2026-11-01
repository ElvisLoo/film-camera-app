/**
 * 胶卷卷册（Roll）
 *
 * 为什么按"卷"而不是按"张"：
 *   胶片用户的心智单位是卷。拍完一卷送去冲，看片时也是整卷一起看。
 *   按张记录会把一件事拆成 36 条孤立数据；按卷记录才是他脑子里的样子。
 *
 * 一卷需要记什么：
 *   - 胶片型号（决定宽容度和倒易律特性）
 *   - 机身 ISO 设定（推拉冲洗时与实际宽容度不同）
 *   - 起止时间（对冲洗周期、相册时间线都有用）
 *   - 本卷每张的参数（光圈/快门/EV/备注）
 *
 * 存储用 localStorage：这个 App 是纯静态 PWA，没有后端，
 * 也不该为了存几百行 JSON 引入数据库。
 */
(function (global) {
  'use strict';

  var KEY = 'filmrolls.v1';
  var MAX_ROLLS = 40;
  var MAX_SHOTS = 60;   // 一卷通常 36 张，留点余量

  var FILM_TYPES = [
    { id: 'bw', name: '黑白负片', tol: '±2~3 级', hint: '过曝不慌，欠曝丢暗部' },
    { id: 'color', name: '彩色负片 C-41', tol: '±1.5~2 级', hint: '宁可偏亮半级' },
    { id: 'slide', name: '反转片 E-6', tol: '±0.5 级', hint: '零容错，必须精准' },
  ];

  /** 生成卷 id：时间戳 + 随机后缀 */
  function newId(now, rand) {
    var t = now || Date.now();
    var r = Math.floor((rand || Math.random)() * 0x10000).toString(16);
    while (r.length < 4) r = '0' + r;
    return String(t) + '-' + r;
  }

  /** 数值校验：非法值一律回落到默认，避免出现 NaN 污染整个卷 */
  function num(v, def) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : def;
  }

  function str(v, max) {
    var s = String(v == null ? '' : v).trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  /**
   * 洗一条记录。脏数据直接丢弃 —— 宁可少一条，
   * 也不要在列表里显示 "undefined / f/NaN"。
   */
  function sanitizeShot(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var ev = Number(raw.ev);
    if (!isFinite(ev)) return null;
    return {
      id: str(raw.id, 40) || newId(Number(raw.at) || Date.now()),
      at: num(raw.at, Date.now()),
      ev: ev,
      iso: num(raw.iso, 400),
      aperture: num(raw.aperture, 8),
      shutter: str(raw.shutter, 16) || '—',
      note: str(raw.note, 24),
    };
  }

  function sanitizeRoll(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = str(raw.id, 60);
    if (!id) return null;
    var shots = [];
    if (Array.isArray(raw.shots)) {
      for (var i = 0; i < raw.shots.length && shots.length < MAX_SHOTS; i++) {
        var s = sanitizeShot(raw.shots[i]);
        if (s) shots.push(s);
      }
    }
    shots.sort(function (a, b) { return a.at - b.at; });

    var typeId = str(raw.type, 16);
    var known = FILM_TYPES.some(function (f) { return f.id === typeId; });
    return {
      id: id,
      type: known ? typeId : 'color',
      label: str(raw.label, 40),
      iso: Math.min(6400, Math.max(25, Math.round(num(raw.iso, 400)))),
      startedAt: num(raw.startedAt, Date.now()),
      endedAt: raw.endedAt ? num(raw.endedAt, 0) : null,
      shots: shots,
    };
  }

  /** 一卷的摘要信息，列表里显示用 */
  function summarize(roll) {
    if (!roll) return null;
    var n = roll.shots.length;
    var film = FILM_TYPES.filter(function (f) { return f.id === roll.type; })[0] || FILM_TYPES[1];
    var evs = roll.shots.map(function (s) { return s.ev; });
    var range = null;
    if (evs.length) {
      // 不用 Math.min.apply(null, evs)：参数表过大时会栈溢出。
      // 现在单卷上限 60 张撑得住，但换个上限就会炸，
      // 而且报的是 "Maximum call stack size exceeded"，很难联想到这里。
      var lo = evs[0];
      var hi = evs[0];
      for (var i = 1; i < evs.length; i += 1) {
        if (evs[i] < lo) lo = evs[i];
        if (evs[i] > hi) hi = evs[i];
      }
      range = { min: lo, max: hi };
    }
    return {
      count: n,
      film: film,
      evRange: range,
      // 剩余张数：按 36 张算，负数说明超拍了
      left: Math.max(0, 36 - n),
      full: n >= 36,
    };
  }

  /**
   * 卷册仓库。纯内存操作，读写由 load/save 负责，
   * 方便在 Node 里直接测。
   */
  function RollStore(storage) {
    this.storage = storage || null;
    this.rolls = [];
  }

  RollStore.prototype.load = function () {
    this.rolls = [];
    if (!this.storage) return this;
    var raw = null;
    try {
      raw = this.storage.getItem(KEY);
    } catch (e) {
      // 隐私模式 / 配额耗尽时 getItem 也可能抛
      return this;
    }
    if (!raw) return this;
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // 存档损坏：当没有记录处理，不要让整个 App 打不开
      return this;
    }
    if (!Array.isArray(parsed)) return this;
    for (var i = 0; i < parsed.length && this.rolls.length < MAX_ROLLS; i++) {
      var r = sanitizeRoll(parsed[i]);
      if (r) this.rolls.push(r);
    }
    this.rolls.sort(function (a, b) { return b.startedAt - a.startedAt; });
    return this;
  };

  RollStore.prototype.save = function () {
    if (!this.storage) return { ok: true, skipped: true };
    try {
      this.storage.setItem(KEY, JSON.stringify(this.rolls));
      return { ok: true };
    } catch (e) {
      // 配额满 / 隐私模式：返回失败让界面提示，而不是静默丢数据
      return { ok: false, reason: String(e && e.name || e) };
    }
  };

  RollStore.prototype.list = function () {
    return this.rolls.slice();
  };

  RollStore.prototype.get = function (id) {
    for (var i = 0; i < this.rolls.length; i++) {
      if (this.rolls[i].id === id) return this.rolls[i];
    }
    return null;
  };

  /** 开一卷新胶卷 */
  RollStore.prototype.startRoll = function (opts) {
    var o = opts || {};
    var roll = sanitizeRoll({
      id: newId(),
      type: o.type || 'color',
      label: o.label || '',
      iso: o.iso || 400,
      startedAt: Date.now(),
      shots: [],
    });
    roll.id = newId();
    this.rolls.unshift(roll);
    while (this.rolls.length > MAX_ROLLS) this.rolls.pop();
    this.save();
    return roll;
  };

  /** 往某卷里加一张 */
  RollStore.prototype.addShot = function (rollId, shot) {
    var roll = this.get(rollId);
    if (!roll) return { ok: false, reason: 'no roll' };
    if (roll.shots.length >= MAX_SHOTS) return { ok: false, reason: 'full' };
    var s = sanitizeShot(shot);
    if (!s) return { ok: false, reason: 'bad shot' };
    roll.shots.push(s);
    roll.shots.sort(function (a, b) { return a.at - b.at; });
    this.save();
    return { ok: true, shot: s };
  };

  RollStore.prototype.removeShot = function (rollId, shotId) {
    var roll = this.get(rollId);
    if (!roll) return false;
    var before = roll.shots.length;
    roll.shots = roll.shots.filter(function (s) { return s.id !== shotId; });
    if (roll.shots.length === before) return false;
    this.save();
    return true;
  };

  RollStore.prototype.endRoll = function (rollId) {
    var roll = this.get(rollId);
    if (!roll) return false;
    roll.endedAt = Date.now();
    this.save();
    return true;
  };

  RollStore.prototype.removeRoll = function (rollId) {
    var before = this.rolls.length;
    this.rolls = this.rolls.filter(function (r) { return r.id !== rollId; });
    if (this.rolls.length === before) return false;
    this.save();
    return true;
  };

  /** 导出成纯文本，方便贴到备忘录 */
  RollStore.prototype.exportText = function (rollId) {
    var roll = this.get(rollId);
    if (!roll) return '';
    var sm = summarize(roll);
    var lines = [];
    lines.push('胶卷记录：' + (roll.label || '(未命名)'));
    lines.push('类型：' + sm.film.name + '  ISO ' + roll.iso + '  共 ' + sm.count + ' 张');
    lines.push('');
    roll.shots.forEach(function (s, i) {
      var t = new Date(s.at);
      var pad = function (n) { return n < 10 ? '0' + n : String(n); };
      lines.push((i + 1) + '. ' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) +
        ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) +
        '  EV' + s.ev.toFixed(1) + '  f/' + trimNum(s.aperture) + ' ' + s.shutter +
        '  ISO' + s.iso + (s.note ? '  #' + s.note : ''));
    });
    return lines.join('\n');
  };

  function trimNum(v) {
    var n = Number(v);
    if (!isFinite(n)) return '?';
    return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(1);
  }

  var api = {
    KEY: KEY,
    MAX_ROLLS: MAX_ROLLS,
    MAX_SHOTS: MAX_SHOTS,
    FILM_TYPES: FILM_TYPES,
    newId: newId,
    sanitizeRoll: sanitizeRoll,
    sanitizeShot: sanitizeShot,
    summarize: summarize,
    RollStore: RollStore,
    trimNum: trimNum,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.RollBook = api;
})(typeof window !== 'undefined' ? window : globalThis);
