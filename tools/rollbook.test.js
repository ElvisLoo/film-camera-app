'use strict';
/**
 * 胶卷卷册：回归测试。
 *
 * 这类"记录类"功能出错代价很高：用户是拿它对照一周后冲洗出来的照片的。
 * 所以重点不在"正常存得对不对"，而在：
 *   - 存档损坏时能不能别让 App 打不开
 *   - 存储空间满了会不会静默丢数据
 *   - 脏数据会不会污染整个列表
 */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../src/rollbook');

function mockStorage(init) {
  const m = Object.assign({}, init || {});
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _dump: () => m,
  };
}

function freshStore() {
  const st = mockStorage();
  const s = new R.RollStore(st);
  s.load();
  return { store: s, storage: st };
}

// ---- 数据清洗 ----

test('缺少 EV 的记录被丢弃', () => {
  assert.strictEqual(R.sanitizeShot({ aperture: 8 }), null);
  assert.strictEqual(R.sanitizeShot({ ev: 'abc' }), null);
  assert.strictEqual(R.sanitizeShot(null), null);
  assert.strictEqual(R.sanitizeShot('x'), null);
});

test('EV 是数字字符串时接受（手输/旧版数据）', () => {
  const s = R.sanitizeShot({ ev: '12.5' });
  assert.ok(s);
  assert.strictEqual(s.ev, 12.5);
});

test('非法字段回落到安全默认值，不产生 NaN', () => {
  const s = R.sanitizeShot({ ev: 10, iso: 'x', aperture: -1 });
  assert.ok(Number.isFinite(s.iso));
  assert.ok(s.iso > 0);
  assert.ok(Number.isFinite(s.aperture));
  assert.ok(s.aperture > 0);
});

test('备注与快门被截断，避免超长撑破界面', () => {
  const s = R.sanitizeShot({ ev: 10, note: 'x'.repeat(200), shutter: 'y'.repeat(100) });
  assert.ok(s.note.length <= 24);
  assert.ok(s.shutter.length <= 16);
});

test('未知胶片类型回落到彩色负片', () => {
  const roll = R.sanitizeRoll({ id: 'a', type: 'unknown-film' });
  assert.strictEqual(roll.type, 'color');
});

test('ISO 被夹到合理范围', () => {
  assert.strictEqual(R.sanitizeRoll({ id: 'a', iso: 999999 }).iso, 6400);
  assert.strictEqual(R.sanitizeRoll({ id: 'a', iso: 1 }).iso, 25);
});

test('没有 id 的卷被丢弃', () => {
  assert.strictEqual(R.sanitizeRoll({ label: 'x' }), null);
  assert.strictEqual(R.sanitizeRoll(null), null);
});

test('卷内张数有序（按时间正序）', () => {
  const roll = R.sanitizeRoll({
    id: 'a',
    shots: [
      { ev: 10, at: 3000 },
      { ev: 11, at: 1000 },
      { ev: 12, at: 2000 },
    ],
  });
  assert.deepStrictEqual(roll.shots.map((s) => s.at), [1000, 2000, 3000]);
});

test('单卷张数受上限约束', () => {
  const shots = [];
  for (let i = 0; i < 200; i += 1) shots.push({ ev: 10, at: 1000 + i });
  const roll = R.sanitizeRoll({ id: 'a', shots });
  assert.strictEqual(roll.shots.length, R.MAX_SHOTS);
});

// ---- 存储 ----

test('开卷后能落盘并读回', () => {
  const { store, storage } = freshStore();
  const roll = store.startRoll({ type: 'bw', label: '测试', iso: 800 });
  assert.ok(roll.id);

  const reloaded = new R.RollStore(storage);
  reloaded.load();
  assert.strictEqual(reloaded.list().length, 1);
  assert.strictEqual(reloaded.list()[0].label, '测试');
  assert.strictEqual(reloaded.list()[0].iso, 800);
});

test('往卷里加照片并读回', () => {
  const { store, storage } = freshStore();
  const roll = store.startRoll({});
  assert.strictEqual(store.addShot(roll.id, { ev: 12.3, iso: 400, aperture: 8, shutter: '1/125' }).ok, true);

  const reloaded = new R.RollStore(storage);
  reloaded.load();
  assert.strictEqual(reloaded.list()[0].shots.length, 1);
  assert.strictEqual(reloaded.list()[0].shots[0].ev, 12.3);
});

test('加照片到不存在的卷返回失败而不是崩溃', () => {
  const { store } = freshStore();
  const r = store.addShot('no-such-id', { ev: 10 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no roll');
});

test('卷满后拒绝继续添加', () => {
  const { store } = freshStore();
  const roll = store.startRoll({});
  for (let i = 0; i < R.MAX_SHOTS; i += 1) {
    store.addShot(roll.id, { ev: 10, at: 1000 + i });
  }
  const r = store.addShot(roll.id, { ev: 11 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'full');
});

test('损坏的存档当作没有记录，不抛异常', () => {
  const st = mockStorage();
  st.setItem(R.KEY, '{ 这不是 JSON');
  const s = new R.RollStore(st);
  assert.doesNotThrow(() => s.load());
  assert.strictEqual(s.list().length, 0);
});

test('存档是数组以外的类型也不崩', () => {
  const st = mockStorage();
  st.setItem(R.KEY, '{"not":"array"}');
  const s = new R.RollStore(st);
  s.load();
  assert.strictEqual(s.list().length, 0);
});

test('存储空间满时返回失败，不静默丢数据', () => {
  const st = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  const s = new R.RollStore(st);
  s.load();
  const r = s.save();
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason.length > 0);
});

test('getItem 抛异常（隐私模式）时安全降级', () => {
  const st = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => {},
  };
  const s = new R.RollStore(st);
  assert.doesNotThrow(() => s.load());
  assert.strictEqual(s.list().length, 0);
});

test('卷数超过上限时丢弃最老的', () => {
  const { store } = freshStore();
  for (let i = 0; i < R.MAX_ROLLS + 10; i += 1) {
    store.startRoll({ label: 'r' + i });
  }
  assert.strictEqual(store.list().length, R.MAX_ROLLS);
  // 最新的在最前
  assert.strictEqual(store.list()[0].label, 'r' + (R.MAX_ROLLS + 9));
});

test('删除卷与删除照片', () => {
  const { store } = freshStore();
  const roll = store.startRoll({});
  store.addShot(roll.id, { ev: 10 });
  const shotId = store.list()[0].shots[0].id;

  assert.strictEqual(store.removeShot(roll.id, shotId), true);
  assert.strictEqual(store.list()[0].shots.length, 0);
  assert.strictEqual(store.removeShot(roll.id, 'nope'), false);

  assert.strictEqual(store.removeRoll(roll.id), true);
  assert.strictEqual(store.list().length, 0);
  assert.strictEqual(store.removeRoll('nope'), false);
});

test('结束卷记录结束时间', () => {
  const { store } = freshStore();
  const roll = store.startRoll({});
  assert.strictEqual(roll.endedAt, null);
  assert.strictEqual(store.endRoll(roll.id), true);
  assert.ok(store.get(roll.id).endedAt > 0);
});

// ---- 摘要与导出 ----

test('摘要统计张数、剩余、EV 范围', () => {
  const { store } = freshStore();
  const roll = store.startRoll({ type: 'slide' });
  store.addShot(roll.id, { ev: 10.1, at: 1 });
  store.addShot(roll.id, { ev: 12.3, at: 2 });

  const sm = R.summarize(store.get(roll.id));
  assert.strictEqual(sm.count, 2);
  assert.strictEqual(sm.left, 34);
  assert.strictEqual(sm.full, false);
  assert.strictEqual(sm.evRange.min, 10.1);
  assert.strictEqual(sm.evRange.max, 12.3);
  assert.strictEqual(sm.film.name, '反转片 E-6');
});

test('空卷摘要不崩，EV 范围为 null', () => {
  const { store } = freshStore();
  const roll = store.startRoll({});
  const sm = R.summarize(store.get(roll.id));
  assert.strictEqual(sm.count, 0);
  assert.strictEqual(sm.evRange, null);
});

test('拍满 36 张后 full 为 true', () => {
  const { store } = freshStore();
  const roll = store.startRoll({});
  for (let i = 0; i < 36; i += 1) store.addShot(roll.id, { ev: 10, at: 1000 + i });
  const sm = R.summarize(store.get(roll.id));
  assert.strictEqual(sm.full, true);
  assert.strictEqual(sm.left, 0);
});

test('导出文本包含类型、张数与每张参数', () => {
  const { store } = freshStore();
  const roll = store.startRoll({ type: 'bw', label: '黑白一', iso: 400 });
  store.addShot(roll.id, { ev: 12.3, aperture: 8, shutter: '1/125', iso: 400, note: '窗边', at: 1700000000000 });

  const text = store.exportText(roll.id);
  assert.ok(text.includes('黑白一'));
  assert.ok(text.includes('黑白负片'));
  assert.ok(text.includes('EV12.3'));
  assert.ok(text.includes('f/8'));
  assert.ok(text.includes('1/125'));
  assert.ok(text.includes('#窗边'));
});

test('导出不存在的卷返回空串', () => {
  const { store } = freshStore();
  assert.strictEqual(store.exportText('nope'), '');
});

test('数字去尾零：f/8 而不是 f/8.0', () => {
  assert.strictEqual(R.trimNum(8), '8');
  assert.strictEqual(R.trimNum(8.0), '8');
  assert.strictEqual(R.trimNum(5.6), '5.6');
});

test('没有 storage 时纯内存可用', () => {
  const s = new R.RollStore(null);
  s.load();
  const roll = s.startRoll({});
  assert.ok(s.addShot(roll.id, { ev: 10 }).ok);
  assert.strictEqual(s.list().length, 1);
  assert.strictEqual(s.save().ok, true);
});

// ---- 落盘失败必须让调用方知道 ----

test('配额满时 addShot 返回 persisted:false', () => {
  const st = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  const s = new R.RollStore(st);
  s.load();
  const roll = s.startRoll({});
  const t = Object.assign({}, roll);
  // startRoll 里 save 也会失败，但卷仍在内存里
  const r = s.addShot(t.id, { ev: 12 });
  assert.strictEqual(r.ok, true, '内存里加成功');
  assert.strictEqual(r.persisted, false, '必须告诉调用方没存上');
  assert.ok(r.persistError, '应带错误原因');
});

test('正常存储时 persisted 为 true', () => {
  const { store } = freshStore();
  const roll = store.startRoll({});
  const r = store.addShot(roll.id, { ev: 12 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.persisted, true);
  assert.strictEqual(r.persistError, null);
});

test('没有 storage 时 persisted 为 true（纯内存模式不算失败）', () => {
  const s = new R.RollStore(null);
  s.load();
  const roll = s.startRoll({});
  const r = s.addShot(roll.id, { ev: 12 });
  assert.strictEqual(r.persisted, true);
});
