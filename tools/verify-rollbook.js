'use strict';
/**
 * 胶卷记录：真实渲染验证。
 *
 * 验证走的是真页面、真 localStorage、真 DOM 事件，
 * 不是直接调模块函数 —— 那样证明不了"用户点得到"。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow } = require('electron');

app.setPath('userData', path.join(os.tmpdir(), 'film-roll-' + Date.now()));
app.disableHardwareAcceleration();
setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 45000);

app.whenReady().then(async () => {
  const w = new BrowserWindow({
    width: 420, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const errors = [];
  w.webContents.on('console-message', (_e, l, m) => { if (l >= 2) errors.push(m.slice(0, 150)); });

  await w.loadFile(path.resolve(__dirname, '..', 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));

  const out = await w.webContents.executeJavaScript(`(async () => {
    const $ = (id) => document.getElementById(id);
    const res = {};

    res.hasModule = !!window.RollBook;
    res.hasPage = !!$('page-roll');
    res.tabCount = document.querySelectorAll('nav .tab').length;

    // 1) 切到胶卷页
    const rollTab = document.querySelector('nav .tab[data-page="roll"]');
    res.hasRollTab = !!rollTab;
    if (rollTab) rollTab.click();
    await new Promise(r => setTimeout(r, 200));
    res.rollPageVisible = !$('page-roll').classList.contains('hidden');

    // 2) 初始应为空
    res.initiallyEmpty = $('rollEmpty').style.display !== 'none';

    // 3) 开一卷
    $('newRollType').value = 'bw';
    $('newRollLabel').value = '测试黑白卷';
    $('btnNewRoll').click();
    await new Promise(r => setTimeout(r, 250));

    const cards = document.querySelectorAll('.roll-card');
    res.afterNew = {
      cardCount: cards.length,
      firstTitle: cards.length ? cards[0].querySelector('.rc-title').textContent : '',
      firstMeta: cards.length ? cards[0].querySelector('.rc-meta').textContent : '',
      detailShown: !$('rollDetail').classList.contains('hidden'),
    };

    // 4) 回列表，再去测光页记录一张
    $('btnRollBack').click();
    await new Promise(r => setTimeout(r, 150));

    document.querySelector('nav .tab[data-page="meter"]').click();
    await new Promise(r => setTimeout(r, 200));
    res.hintOnMeter = $('logShotHint').textContent;

    $('btnLogShot').click();
    await new Promise(r => setTimeout(r, 300));
    res.afterLog = {
      toast: ($('toastEl') || {}).textContent || '',
      hint: $('logShotHint').textContent,
    };

    // 5) 回胶卷页看详情
    document.querySelector('nav .tab[data-page="roll"]').click();
    await new Promise(r => setTimeout(r, 200));
    const c2 = document.querySelector('.roll-card');
    if (c2) c2.click();
    await new Promise(r => setTimeout(r, 250));
    res.detail = {
      shots: document.querySelectorAll('#rollShots .so-item').length,
      firstShot: (document.querySelector('#rollShots .so-item') || {}).textContent || '',
      meta: $('rollDetailMeta').textContent,
    };

    // 6) 数据真的落盘了吗
    res.stored = (window.localStorage.getItem('filmrolls.v1') || '').length > 0;
    res.currentRollSaved = !!window.localStorage.getItem('film.currentRoll');

    return res;
  })()`).catch((e) => ({ err: String(e) }));

  const checks = [
    ['RollBook 模块已加载', out.hasModule === true],
    ['胶卷页存在', out.hasPage === true],
    ['导航有三个 tab', out.tabCount === 3],
    ['有胶卷 tab', out.hasRollTab === true],
    ['切页正常', out.rollPageVisible === true],
    ['初始显示空提示', out.initiallyEmpty === true],
    ['开卷后出现卡片', out.afterNew && out.afterNew.cardCount === 1],
    ['卡片标题是卷名', out.afterNew && out.afterNew.firstTitle.includes('测试黑白卷')],
    ['卡片显示胶片类型', out.afterNew && out.afterNew.firstMeta.includes('黑白负片')],
    ['开卷后自动进详情', out.afterNew && out.afterNew.detailShown === true],
    ['测光页提示当前卷', out.hintOnMeter && out.hintOnMeter.includes('测试黑白卷')],
    ['记一张后有提示', out.afterLog && out.afterLog.hint.includes('1 张')],
    ['详情页显示 1 张', out.detail && out.detail.shots === 1],
    ['那张显示 EV 与光圈', out.detail && /EV/.test(out.detail.firstShot) && /f\//.test(out.detail.firstShot)],
    ['数据已写入 localStorage', out.stored === true],
    ['当前卷已记住', out.currentRollSaved === true],
    ['控制台无报错', errors.length === 0],
  ];

  console.log(JSON.stringify(out, null, 2));
  console.log('');
  let pass = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (ok) pass += 1;
  }
  if (errors.length) console.log('\n错误:', errors.slice(0, 3));
  console.log(`\n${pass}/${checks.length} 通过`);
  app.exit(pass === checks.length ? 0 : 1);
});
