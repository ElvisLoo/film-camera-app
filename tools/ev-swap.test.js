'use strict';
/**
 * 快门显示与 EV 换算：边界测试。
 *
 * 这些函数的输出会直接出现在界面上。用户记下"1/1000000000"这种快门，
 * 或者看到 "16666666m40s"，只会觉得这软件坏了。
 */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/ev-swap');

test('常规快门刻度正常显示', () => {
  assert.strictEqual(E.formatShutter(1 / 125), '1/125');
  assert.strictEqual(E.formatShutter(1 / 500), '1/500');
  assert.strictEqual(E.formatShutter(1), '1s');
  assert.strictEqual(E.formatShutter(15), '15s');
});

test('超过 60 秒用分钟表示，避免数错', () => {
  assert.strictEqual(E.formatShutter(60), '1m');
  assert.strictEqual(E.formatShutter(120), '2m');
  assert.strictEqual(E.formatShutter(90), '1m30s');
});

test('更快于机械极限时明确提示，不打印荒谬数字', () => {
  const s = E.formatShutter(1e-9);
  assert.strictEqual(s, '快于 1/8000');
  assert.ok(!s.includes('1000000000'));
});

test('1/8000 本身仍正常显示', () => {
  assert.strictEqual(E.formatShutter(1 / 8000), '1/8000');
});

test('极慢时提示超出范围，不打印几千万分钟', () => {
  assert.strictEqual(E.formatShutter(601), '长于 10 分钟');
  assert.strictEqual(E.formatShutter(4000), '超过 1 小时');
  assert.strictEqual(E.formatShutter(1e9), '超过 1 小时');
});

test('10 分钟以内仍给具体值（长曝光常用）', () => {
  assert.strictEqual(E.formatShutter(300), '5m');
  assert.strictEqual(E.formatShutter(600), '10m');
});

test('非法输入返回破折号，不显示 NaN', () => {
  for (const bad of [NaN, 0, -1, Infinity, undefined, null, 'x']) {
    const s = E.formatShutter(bad);
    assert.strictEqual(s, '—', `${String(bad)} 应返回破折号`);
    assert.ok(!s.includes('NaN'));
  }
});

test('浮点尾巴被去掉', () => {
  assert.strictEqual(E.formatShutter(15), '15s');
  assert.ok(!E.formatShutter(15).includes('.'));
});

// ---- EV 换算 ----

test('EV 换算闭环：同一 EV 下不同组合亮度一致', () => {
  const ev = E.evOf(8, 1 / 125, 400);
  assert.ok(Math.abs(E.evOf(4, 1 / 500, 400) - ev) < 0.01);
  assert.ok(Math.abs(E.evOf(16, 1 / 30, 400) - ev) < 0.3);
});

test('ISO 翻倍等于 1 档', () => {
  const a = E.evOf(8, 1 / 125, 400);
  const b = E.evOf(8, 1 / 125, 800);
  assert.ok(Math.abs(a - b - 1) < 1e-9);
});

test('非法参数返回 NaN 而不是乱数', () => {
  assert.ok(Number.isNaN(E.evOf(NaN, 0.01, 400)));
  assert.ok(Number.isNaN(E.evOf(0, 0.01, 400)));
  assert.ok(Number.isNaN(E.evOf(8, 0, 400)));
  assert.ok(Number.isNaN(E.shutterFor(NaN, 8, 400)));
});

test('组合列表只含可用档位', () => {
  const combos = E.combinations(11, 400);
  assert.ok(combos.length > 0);
  for (const c of combos) {
    assert.ok(c.aperture > 0);
    assert.ok(c.shutter > 0);
    assert.ok(c.errStops < 0.5, `偏差过大: ${c.text} ${c.errStops}`);
  }
});

test('阳光16：晴天 ISO100 应得到 f/16 1/125', () => {
  const ev = E.evOf(16, 1 / 125, 100);
  const combos = E.combinations(ev, 100);
  const hit = combos.find((c) => c.aperture === 16);
  assert.ok(hit, '应包含 f/16');
  assert.strictEqual(hit.shutter, 1 / 125);
});

test('快门解析接受多种写法', () => {
  assert.strictEqual(E.parseShutter('1/125'), 1 / 125);
  assert.strictEqual(E.parseShutter('2s'), 2);
  assert.strictEqual(E.parseShutter('30'), 30);
  assert.ok(Number.isNaN(E.parseShutter('')));
  assert.ok(Number.isNaN(E.parseShutter('1/0')));
  assert.ok(Number.isNaN(E.parseShutter('abc')));
});
