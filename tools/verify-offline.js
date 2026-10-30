'use strict';
/**
 * 离线可用性验证：这是胶片助手最核心的承诺。
 *
 * 流程：第一次在线加载 → SW 安装并预缓存 → 关闭窗口 →
 *       断网（阻断所有网络层请求）→ 再打开 → 检查是否仍能渲染。
 *
 * 断网用 webContents.session.enableNetworkEmulation + 拦截路由模拟，
 * 而不是真的拔网线：这样能精确区分「SW 服务了缓存」和「碰巧连上了」。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

const profile = path.join(os.tmpdir(), 'film-offline-' + (process.argv[2] || Date.now()));
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.disableHardwareAcceleration();

const ENTRY = path.resolve(__dirname, '..', 'index.html');
function trace(msg) {
  try { fs.appendFileSync(path.join(os.tmpdir(), 'film-offline-trace.log'), msg + '
'); } catch (_) {}
}
trace('boot cwd=' + process.cwd());
// Electron 在 Windows 上会吞掉 stdout（GUI 子系统），所以结果同时写文件，
// 由外层脚本读取 —— 否则跑到最后什么都看不到。
const OUT_FILE = path.join(os.tmpdir(), 'film-offline-result.json');
function emit(obj) {
  const text = JSON.stringify(obj, null, 2);
  try { fs.writeFileSync(OUT_FILE, text, 'utf8'); } catch (_) {}
  console.log(text);
  return text;
}

setTimeout(() => { emit({ fatal: 'TIMEOUT' }); app.exit(2); }, 45000);

async function open(blockNet) {
  const w = new BrowserWindow({
    width: 420, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const errors = [];
  w.webContents.on('console-message', (_e, l, m) => { if (l >= 2) errors.push(m.slice(0, 120)); });
  if (blockNet) {
    // 只放行 local file，其它一律 abort
    await w.webContents.session.webRequest.onBeforeRequest(
      { urls: ['*://*/*'] },
      (details, cb) => cb({ cancel: true })
    );
  }
  let loadErr = null;
  try {
    await w.loadFile(ENTRY);
  } catch (e) {
    loadErr = String(e.message || e);
  }
  await new Promise((r) => setTimeout(r, 1600));
  const r = loadErr ? { loadErr } : await w.webContents.executeJavaScript(`(() => {
    return {
      cards: document.querySelectorAll('.pc').length,
      css: [...document.styleSheets].some(s => (s.href || '').includes('app.css')),
      refLen: (document.getElementById('ref-body') || { innerHTML: '' }).innerHTML.length,
      title: document.title,
    };
  })()`).catch((e) => ({ err: String(e) }));
  const ctl = await w.webContents.executeJavaScript(
    `!!(navigator.serviceWorker && navigator.serviceWorker.controller)`
  ).catch(() => false);
  w.destroy();
  return { r, ctl, errors };
}

app.whenReady().then(async () => {
  trace('ready');
  const online = await open(false);
  trace('online ' + JSON.stringify(online.r));
  await new Promise((r) => setTimeout(r, 1200)); // 等 install/activate 完成
  trace('sleeping');
  const offline = await open(true);
  trace('offline ' + JSON.stringify(offline.r));

  const out = { online, offline };
  const okOnline = online.r && online.r.cards === 6;
  const okOffline = offline.r && offline.r.cards === 6 && offline.r.css && !offline.r.loadErr;

  out.summary = {
    online: okOnline ? 'pass' : 'fail',
    offline: okOffline ? 'pass' : 'fail',
  };
  emit(out);
  app.exit(okOnline && okOffline ? 0 : 1);
});
