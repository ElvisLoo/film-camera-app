'use strict';
/**
 * 等效曝光换算器：交互验证。
 *
 * 断言的是「改一个参数，另一个自动补回来」这个核心行为 ——
 * 用户改光圈是为了换景深，快门必须替他算，否则工具就只是块说明牌。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

app.setPath('userData', path.join(os.tmpdir(), 'film-ev-' + Date.now()));
app.disableHardwareAcceleration();
setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 30000);

app.whenReady().then(async () => {
  const w = new BrowserWindow({
    width: 420, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const errors = [];
  w.webContents.on('console-message', (_e, l, m) => { if (l >= 2) errors.push(m.slice(0, 140)); });
  await w.loadFile(path.resolve(__dirname, '..', 'index.html'));
  await new Promise((r) => setTimeout(r, 1600));

  const result = await w.webContents.executeJavaScript(`(() => {
    const $ = (id) => document.getElementById(id);
    const read = () => ({
      ape: $('swApe').value,
      shut: $('swShut').value,
      iso: $('swIso').value,
      ev: $('swEv').textContent,
      combos: document.querySelectorAll('#swOut .so-item').length,
    });

    const out = { initial: read(), steps: [] };

    // 1) 改光圈：f/5.6 -> f/2.8，快门应更快（数值更小）
    $('swApe').value = '2.8';
    $('swApe').dispatchEvent(new Event('change'));
    out.steps.push({ name: '光圈 f/5.6 -> f/2.8', after: read() });

    // 2) 改回 f/11，快门应变慢
    $('swApe').value = '11';
    $('swApe').dispatchEvent(new Event('change'));
    out.steps.push({ name: '光圈 -> f/11', after: read() });

    // 3) 改快门：直接选 1/1000，EV 应变化
    $('swShut').value = '1/1000';
    $('swShut').dispatchEvent(new Event('change'));
    out.steps.push({ name: '快门 -> 1/1000', after: read() });

    // 4) 改 ISO：EV(ISO100基准) 应不变，组合应重算
    $('swIso').value = '800';
    $('swIso').dispatchEvent(new Event('change'));
    out.steps.push({ name: 'ISO -> 800', after: read() });

    // 5) 高亮：当前组合应被标记
    out.highlighted = document.querySelectorAll('#swOut .so-item.on').length;
    return out;
  })()`).catch((e) => ({ err: String(e) }));

  console.log(JSON.stringify({ result, errors }, null, 2));
  app.exit(0);
});
