'use strict';
/**
 * 在无 electron 依赖的环境下跑 tools-verify.js 的等价校验。
 * 借用 job-bingo 已装的 electron 运行时（NODE_PATH 指过去）。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

// 用独立的 userData：SW 注册是跟着用户数据目录走的，
// 复用默认目录时上一轮的旧 SW 会继续拦截请求，
// 导致「明明修好了却还是失败」的假阴性。
const stamp = process.argv[2] || String(Date.now());
const profile = path.join(os.tmpdir(), 'film-verify-' + stamp);
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);

app.disableHardwareAcceleration();
setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 30000);

app.whenReady().then(async () => {
  const w = new BrowserWindow({
    width: 420, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const errors = [];
  w.webContents.on('console-message', (_e, l, m) => { if (l >= 2) errors.push(m.slice(0, 160)); });
  w.webContents.on('did-fail-load', (_e, c, d) => errors.push('LOAD-FAIL ' + c + ' ' + d));

  await w.loadFile(path.resolve(__dirname, '..', 'index.html'));
  await new Promise((r) => setTimeout(r, 1800));

  const r = await w.webContents.executeJavaScript(`(() => {
    const cs = getComputedStyle(document.body);
    return {
      bg: cs.backgroundColor,
      hasCards: document.querySelectorAll('.pc').length,
      hasIso: document.querySelectorAll('.iso-chip').length,
      refBodyLen: (document.getElementById('ref-body') || { innerHTML: '' }).innerHTML.length,
      tabs: document.querySelectorAll('nav .tab').length,
      hasCss: !!document.querySelector('link[href*="app.css"]'),
      cssLoaded: [...document.styleSheets].some(s => (s.href || '').includes('app.css')),
      hasAppJs: !!document.querySelector('script[src*="app.js"]'),
      swSupported: 'serviceWorker' in navigator,
      swControlled: !!navigator.serviceWorker && !!navigator.serviceWorker.controller,
      // 等效曝光换算器
      evSwap: !!document.getElementById('swApe'),
      evValue: (document.getElementById('swEv') || {}).textContent || '',
      evCombos: document.querySelectorAll('#swOut .so-item').length,
      evTip: (document.getElementById('swTip') || {}).textContent || '',
    };
  })()`).catch((e) => ({ error: String(e) }));

  const sw = await w.webContents.executeJavaScript(
    `navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => r.scope)).catch(e => 'ERR ' + e.message)`
  ).catch((e) => 'ERR ' + e.message);

  console.log(JSON.stringify({ r, sw, errors }, null, 2));
  app.exit(0);
});
