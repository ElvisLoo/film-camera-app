'use strict';
/**
 * 摄像头生命周期：用 Chromium 自带的假摄像头验证。
 *
 * 之前的失败做法是"在页面里替换 navigator.mediaDevices"——
 * 那是个只读 getter，覆盖不稳定，页面仍走原生实现并因无设备而失败。
 *
 * 正确做法：启动时加 --use-fake-device-for-media-stream，
 * 让 Chromium 自己提供一个假摄像头。这样页面代码完全不用改，
 * 测的就是真实路径（真的 getUserMedia、真的 MediaStream、真的 track）。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

app.setPath('userData', path.join(os.tmpdir(), 'film-cam-real-' + Date.now()));
app.disableHardwareAcceleration();
// 关键：Chromium 会提供一个不断产生画面（彩条动画）的假摄像头
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 45000);

app.whenReady().then(async () => {
  const w = new BrowserWindow({
    width: 420, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const errors = [];
  w.webContents.on('console-message', (_e, l, m) => { if (l >= 2) errors.push(m.slice(0, 160)); });

  const wc = w.webContents;
  // 给媒体请求授权，否则 getUserMedia 直接 rejected
  wc.session.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media' || permission === 'videoCapture' || permission === 'audioCapture');
  });

  await w.loadFile(path.resolve(__dirname, '..', 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));

  const out = await wc.executeJavaScript(`(async () => {
    const $ = (id) => document.getElementById(id);
    const res = {};

    res.hasApi = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    // 1) 点启动
    $('camBtn').click();
    // 等真实 getUserMedia 完成（假设备通常 <1s）
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if ($('camBtn').textContent.includes('停止')) break;
    }
    const v = $('cam');
    res.afterStart = {
      label: $('camBtn').textContent,
      onClass: $('camBtn').classList.contains('on'),
      hasStream: !!v.srcObject,
      trackCount: v.srcObject ? v.srcObject.getTracks().length : 0,
      overlayShown: $('camOvl').style.display,
    };

    // 等几帧，确认真的在出读数
    await new Promise((r) => setTimeout(r, 600));
    res.reading = {
      lum: $('lumVal').textContent,
      pct: $('ovlPct').textContent,
      hasValue: $('lumVal').textContent !== '--',
    };

    const track = v.srcObject ? v.srcObject.getTracks()[0] : null;
    res.beforeStop = { readyState: track ? track.readyState : 'none' };

    // 2) 再点一次应停止
    $('camBtn').click();
    await new Promise((r) => setTimeout(r, 300));
    res.afterManualStop = {
      label: $('camBtn').textContent,
      onClass: $('camBtn').classList.contains('on'),
      trackState: track ? track.readyState : 'none',
      overlayHidden: $('camOvl').style.display === 'none',
      srcCleared: !$('cam').srcObject,
    };

    // 3) 重新启动，然后模拟切后台
    $('camBtn').click();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if ($('camBtn').textContent.includes('停止')) break;
    }
    const track2 = $('cam').srcObject ? $('cam').srcObject.getTracks()[0] : null;
    res.beforeHidden = { label: $('camBtn').textContent, trackState: track2 ? track2.readyState : 'none' };

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 300));

    res.afterHidden = {
      label: $('camBtn').textContent,
      trackState: track2 ? track2.readyState : 'none',
    };

    return res;
  })()`).catch((e) => ({ err: String(e) }));

  const checks = [
    ['有 getUserMedia API', out.hasApi === true],
    ['启动后按钮变停止', out.afterStart && out.afterStart.label.includes('停止')],
    ['启动后有激活态', out.afterStart && out.afterStart.onClass === true],
    ['拿到了真实视频流', out.afterStart && out.afterStart.hasStream === true],
    ['流里有 track', out.afterStart && out.afterStart.trackCount >= 1],
    ['遮罩显示', out.afterStart && out.afterStart.overlayShown === 'block'],
    ['读出了照度数值', out.reading && out.reading.hasValue === true],
    ['停止前 track 是 live', out.beforeStop && out.beforeStop.readyState === 'live'],
    ['手动停止后 track 变 ended', out.afterManualStop && out.afterManualStop.trackState === 'ended'],
    ['停止后按钮复位', out.afterManualStop && out.afterManualStop.label.includes('启动')],
    ['停止后遮罩隐藏', out.afterManualStop && out.afterManualStop.overlayHidden === true],
    ['停止后 srcObject 清空', out.afterManualStop && out.afterManualStop.srcCleared === true],
    ['切后台前 track 是 live', out.beforeHidden && out.beforeHidden.trackState === 'live'],
    ['切后台后自动停止', out.afterHidden && out.afterHidden.label.includes('启动')],
    ['切后台后 track 变 ended', out.afterHidden && out.afterHidden.trackState === 'ended'],
  ];

  console.log(JSON.stringify(out, null, 2));
  console.log('');
  let pass = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (ok) pass += 1;
  }
  if (errors.length) console.log('\n控制台错误:', errors.slice(0, 3));
  console.log(`\n${pass}/${checks.length} 通过`);
  app.exit(pass === checks.length ? 0 : 1);
});
