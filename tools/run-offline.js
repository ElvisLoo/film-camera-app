'use strict';
/**
 * 在教育机器上跑 tools/verify-offline.js 的包装。
 * Electron 是 GUI 子系统程序，直接 spawn 时拿不到 stdout，
 * 这里用 node 转一道：捕获退出码 + 读脚本自己写的 JSON 结果文件。
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const electron = path.join(
  'C:/Users/Admin/WorkBuddy/2026-10-26-18-19-33/job-bingo/node_modules/electron/dist/electron.exe'
);
const script = path.join(__dirname, 'verify-offline.js');
const resultFile = path.join(os.tmpdir(), 'film-offline-result.json');

try { fs.unlinkSync(resultFile); } catch (_) {}

const child = spawn(electron, [script, 'run' + Date.now()], {
  cwd: root,
  env: { ...process.env, NODE_PATH: 'C:/Users/Admin/WorkBuddy/2026-10-26-18-19-33/job-bingo/node_modules' },
  stdio: 'ignore',
});

child.on('exit', (code) => {
  let data = null;
  try { data = JSON.parse(fs.readFileSync(resultFile, 'utf8')); } catch (_) {}
  if (!data) {
    console.log('未产生结果文件，exit=' + code);
    process.exit(1);
  }
  console.log('在线：', data.summary.online);
  console.log('离线：', data.summary.offline);
  console.log('  online  ', JSON.stringify(data.online.r));
  console.log('  offline ', JSON.stringify(data.offline.r));
  console.log('  offline SW 控制:', data.offline.ctl);
  if ((data.offline.errors || []).length) console.log('  offline 错误:', data.offline.errors.slice(0, 3));
  if ((data.online.errors || []).length) console.log('  online 错误:', data.online.errors.slice(0, 3));
  process.exit(data.summary.online === 'pass' && data.summary.offline === 'pass' ? 0 : 1);
});
