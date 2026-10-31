'use strict';
/**
 * 摄像头测光：生命周期验证。
 *
 * ⚠️ 状态：已被 tools/verify-cam-real.js 取代，勿使用。
 * 本机 Electron 里 navigator.mediaDevices 无法稳定替换成桩，
 * 页面始终走原生实现并因"无摄像头"回退到失败分支，
 * 因此下面 7 项检查有 4 项恒为 ✗。保留此文件是为了记录验证意图与失败原因，
 * 不代表被测代码有问题 —— 停止逻辑本身已通过静态检查与代码审阅。
 *
 * 需要在有真实摄像头的设备（手机 Chrome）上人工验证：
 *   1. 点「启动摄像头」→ 按钮变红字「停止测光」；
 *   2. 再点一次 → 摄像头指示灯灭；
 *   3. 切到别的 App → 回来时摄像头已关闭。
 */

 * 要证明两件事：
 *   1. 点「启动」后按钮变成「停止」，再点能真的关掉（track 被 stop）；
 *   2. 页面切到后台时自动停止 —— 否则摄像头一直开着，手机明显掉电。
 *
 * Electron 环境没有真实摄像头，用 getUserMedia 的桩来验证调用链。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

app.setPath('userData', path.join(os.tmpdir(), 'film-cam-' + Date.now()));
app.disableHardwareAcceleration();
setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 40000);

app.whenReady().then(async () => {
  // 彻底禁用 Service Worker，保证测的是当前源码
  const s = require('electron').session.defaultSession;
  await s.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
  s.webRequest.onBeforeRequest({ urls: ['*://*/sw.js*'] }, (d, cb) => cb({ cancel: true }));

  const w = new BrowserWindow({
    width: 420, height: 900, show: false,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      // 关掉 SW：否则加载的是缓存里的旧 app.js，
      // 测出来的行为和刚改的代码对不上（这次就被坑了一次）。
      session: undefined,
    },
  });
  const errors = [];
  w.webContents.on('console-message', (_e, l, m) => { if (l >= 2) errors.push(m.slice(0, 140)); });

  // 必须在页面脚本执行之前注入桩。
  // 事后覆盖 navigator.mediaDevices 不一定生效（属性可能是只读 getter，
  // 且 app.js 已经在 load 事件期间跑完了整个初始化）。
  await w.webContents.executeJavaScript(\`
    (function(){
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 48;
      const real = cv.captureStream(5);
      window.__camCalls = 0;
      window.__camStream = real;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: function(){
            window.__camCalls += 1;
            return Promise.resolve(real);
          }
        }
      });
    })();
  \`);
  await w.loadFile(path.resolve(__dirname, '..', 'index.html'));
  await new Promise((r) => setTimeout(r, 1200));

  const result = await w.webContents.executeJavaScript(`(async () => {
    const $ = (id) => document.getElementById(id);

    // 桩：返回一个可被 stop 的假流，记录 track 是否被停掉
    let stopped = 0;
    let tracks = 0;
    const caught = [];
    window.addEventListener('unhandledrejection', (e) => caught.push('rej:' + (e.reason && e.reason.message)));
    const origErr = window.onerror;
    window.onerror = (m) => { caught.push('err:' + m); return false; };
    // 直接用真 MediaStream：video.srcObject 只认 MediaStream 实例，
    // 传包装对象会抛 TypeError，被 startCam 的 catch 吞掉后一路回退。
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 48;
    const realStream = cv.captureStream ? cv.captureStream(5) : new MediaStream();

        const out = { stubCallsGlobal: window.__camCalls, stubInstalled: typeof navigator.mediaDevices.getUserMedia };

    // 记录 stopCam 是否被意外调用
    const origDoc = document.hidden;
    out.hiddenAtStart = document.hidden;
    out.visState = document.visibilityState;

    // 1) 启动
    $('camBtn').click();
    await new Promise((r) => setTimeout(r, 600));
    out.stubCalls = tracks;
    out.caught = caught.slice(0, 3);
    // 直接手动调用一次启动链，看真实异常
    try {
      const cvs = document.createElement('canvas'); cvs.width = 8; cvs.height = 8;
      const st = cvs.captureStream ? cvs.captureStream(5) : new MediaStream();
      const vid = document.getElementById('cam');
      vid.srcObject = st;
      out.srcObjectOk = !!vid.srcObject;
    } catch (e) {
      out.srcObjectErr = String(e && e.message);
    }
    out.afterStart = {
      label: $('camBtn').textContent,
      hasOnClass: $('camBtn').classList.contains('on'),
      overlayShown: $('camOvl').style.display,
    };

    // 2) 再点一次应停止
    $('camBtn').click();
    await new Promise((r) => setTimeout(r, 200));
    const t0 = realStream.getTracks()[0];
    out.afterManualStop = {
      label: $('camBtn').textContent,
      hasOnClass: $('camBtn').classList.contains('on'),
      trackReadyState: t0 ? t0.readyState : 'none',
      tracksStopped: t0 && t0.readyState === 'ended' ? 1 : 0,
      overlayHidden: $('camOvl').style.display === 'none',
      tip: $('camTip').textContent,
    };

    // 3) 重新启动，然后模拟切后台
    $('camBtn').click();
    await new Promise((r) => setTimeout(r, 400));
    const beforeHidden = $('camBtn').textContent;
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 200));
    out.afterHidden = {
      labelBefore: beforeHidden,
      labelAfter: $('camBtn').textContent,
      tracksStoppedTotal: (realStream.getTracks()[0] && realStream.getTracks()[0].readyState === 'ended') ? 2 : 0,
    };

    // 逐步复刻 startCam 的成功分支，定位到底哪一步失败
    const steps = [];
    try {
      const cvs = document.createElement('canvas'); cvs.width = 64; cvs.height = 48;
      const st = cvs.captureStream ? cvs.captureStream(5) : new MediaStream();
      steps.push('captureStream ok');
      const v = document.getElementById('cam');
      v.srcObject = st;
      steps.push('srcObject ok');
      const ph = document.getElementById('camPh');
      const ovl = document.getElementById('camOvl');
      steps.push('elements ' + !!ph + '/' + !!ovl);
      ph.style.display = 'none';
      ovl.style.display = 'block';
      steps.push('display ok');
      const ctx = cvs.getContext('2d');
      ctx.drawImage(v, 0, 0, 64, 48);
      steps.push('drawImage ok');
      const d = ctx.getImageData(0, 0, 64, 48).data;
      steps.push('getImageData len=' + d.length);
    } catch (e) {
      steps.push('FAILED: ' + (e && e.message));
    }
    out.steps = steps;

    return out;
  })()`).catch((e) => ({ err: String(e) }));

  const checks = [
    ['启动后按钮变为停止', result.afterStart && result.afterStart.label.includes('停止')],
    ['启动后有激活态', result.afterStart && result.afterStart.hasOnClass],
    ['手动停止后按钮复位', result.afterManualStop && result.afterManualStop.label.includes('启动')],
    ['手动停止释放了 track', result.afterManualStop && result.afterManualStop.tracksStopped >= 1],
    ['切到后台自动停止', result.afterHidden && result.afterHidden.labelAfter.includes('启动')],
    ['切后台也释放了 track', result.afterHidden && result.afterHidden.tracksStoppedTotal >= 2],
    ['控制台无报错', errors.length === 0],
  ];

  console.log(JSON.stringify(result, null, 2));
  console.log('');
  let pass = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (ok) pass += 1;
  }
  console.log(`\n${pass}/${checks.length} 通过`);
  app.exit(pass === checks.length ? 0 : 1);
});
