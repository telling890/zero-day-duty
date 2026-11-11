#!/usr/bin/env node
/**
 * 无头浏览器冒烟测试：用 Edge/Chrome 的 DevTools Protocol 打开网页版，
 * 点击一条完整处置链并截图，最后检查控制台异常。
 *
 * 用法：
 *   node tools/browser-smoke.mjs [截图目录]
 * 依赖：本机安装 Microsoft Edge（或设置 CHROME_PATH 指向 chrome.exe）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shotDir = resolve(process.argv[2] || join(root, 'tests', 'screenshots'));
mkdirSync(shotDir, { recursive: true });

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const browserPath = candidates.find((path) => existsSync(path));
if (!browserPath) {
  console.error('找不到浏览器，可用 CHROME_PATH 指定 chrome.exe / msedge.exe');
  process.exit(2);
}

const port = 9333 + Math.floor(Math.random() * 300);
const profile = join(tmpdir(), `zdd-cdp-${Date.now()}`);
const url = `file:///${join(root, 'index.html').replace(/\\/g, '/')}`;
const args = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--window-size=1440,900',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  url,
];

const browser = spawn(browserPath, args, { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await response.json();
      const page = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {
      // 等浏览器启动
    }
    await sleep(250);
  }
  throw new Error('浏览器没有在预期时间内启动');
}

let ws;
let nextId = 1;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];

function send(method, params = {}) {
  const id = nextId;
  nextId += 1;
  return new Promise((resolvePromise, reject) => {
    pending.set(id, { resolve: resolvePromise, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP 超时：${method}`));
      }
    }, 20000);
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`页面脚本异常：${result.exceptionDetails.text}\n${result.result && result.result.description}`);
  }
  return result.result ? result.result.value : undefined;
}

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(shotDir, `${name}.png`);
  writeFileSync(file, Buffer.from(result.data, 'base64'));
  return file;
}

async function click(selector) {
  const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`找不到可点击元素：${selector}`);
  await sleep(260);
}

async function clickText(selector, text) {
  const ok = await evaluate(`(() => {
    const list = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const el = list.find((item) => item.textContent.includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!ok) throw new Error(`找不到包含「${text}」的元素：${selector}`);
  await sleep(260);
}

async function key(keyName, code) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code: code || keyName, windowsVirtualKeyCode: 0 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code: code || keyName, windowsVirtualKeyCode: 0 });
  await sleep(260);
}

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail: detail || '' });
  console.log(`${condition ? '✓' : '✗'} ${name}${detail && !condition ? `：${detail}` : ''}`);
}

async function main() {
  const target = await getTarget();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    ws.addEventListener('open', resolvePromise, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${message.error.message} ${message.error.data || ''}`));
      else entry.resolve(message.result || {});
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      pageErrors.push(details.exception ? details.exception.description : details.text);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description).join(' '));
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evaluate(`document.readyState === 'complete' && !!document.getElementById('metrics') && document.getElementById('metrics').children.length > 0`);
    if (ready) break;
    await sleep(200);
  }

  await sleep(400);
  await screenshot('01-menu');
  check('主菜单已渲染', await evaluate(`!document.getElementById('menu-screen').hidden`));
  check('主菜单有项目链接', (await evaluate(`document.querySelectorAll('.menu-links a').length`)) === 4);
  check('主菜单链接指向项目主页', await evaluate(`document.querySelector('.menu-links a').href === 'https://telling890.github.io/zero-day-duty/'`));

  await click('#menu-start');
  await sleep(300);
  await screenshot('02-briefing');
  check('夜班简报出现', await evaluate(`!!document.querySelector('[data-act="briefing-enter"]')`));

  await click('[data-act="briefing-enter"]');
  await sleep(300);
  await screenshot('03-playing');
  check('值班界面可见', await evaluate(`!document.getElementById('play-screen').hidden`));
  check('顶部 8 项指标', (await evaluate(`document.querySelectorAll('#metrics .metric').length`)) === 8);
  check('拓扑 8 个节点', (await evaluate(`document.querySelectorAll('.topo-node').length`)) === 8);
  check('至少一条告警', (await evaluate(`document.querySelectorAll('.alert-row').length`)) >= 1);

  // 选择第一条真实告警
  await click('.alert-row');
  await sleep(200);
  const actionNames = await evaluate(`Array.from(document.querySelectorAll('.act .act-name')).map((el) => el.textContent)`);
  check('操作面板出现调查与处置操作', actionNames.includes('调查告警') && actionNames.some((name) => name.includes('隔离')), JSON.stringify(actionNames));

  await clickText('.act', '调查告警');
  await sleep(300);
  check('调查后告警显示真实等级', await evaluate(`(document.querySelector('.alert-row .alert-level') || {}).textContent !== '待评估'`));

  await clickText('.act', '隔离');
  await sleep(350);
  await screenshot('04-controlled');
  const afterIsolate = await evaluate(`Array.from(document.querySelectorAll('.act .act-name')).map((el) => el.textContent)`);
  check('隔离后出现清除威胁', afterIsolate.includes('清除威胁'), JSON.stringify(afterIsolate));

  await clickText('.act', '清除威胁');
  await sleep(350);
  await screenshot('05-eradicated');
  check('清除后安全度上升', (await evaluate(`document.querySelector('.metric.security .metric-value').textContent`)).match(/\d+%/)[0].replace('%', '') > 74);

  await clickText('.act', '解除隔离');
  await sleep(300);
  check('解除隔离后出现恢复反馈', await evaluate(`document.querySelector('#fx-feedback .fb-title') && document.querySelector('#fx-feedback').classList.contains('show')`));

  // 日志滚动到最新
  const logState = await evaluate(`(() => { const l = document.getElementById('log-list'); return { top: Math.round(l.scrollTop), h: l.clientHeight, sh: l.scrollHeight, stick: __zdd.panels.logStickToBottom }; })()`);
  check(
    '日志自动滚到最新',
    logState.sh <= logState.h + 8 || logState.top + logState.h >= logState.sh - 12,
    JSON.stringify(logState),
  );

  // 推进回合（空格）
  await key(' ', 'Space');
  await sleep(400);
  check('空格推进到第 2 回合', (await evaluate(`document.querySelector('.metric.turn .metric-value').textContent`)).includes('2 / 10'));
  await screenshot('06-turn2');

  // 暂停 / 恢复（Esc）
  await key('Escape', 'Escape');
  await sleep(300);
  check('Esc 打开暂停', await evaluate(`!!document.querySelector('[data-act="pause-resume"]')`));
  await key('Escape', 'Escape');
  await sleep(300);
  check('Esc 关闭暂停', await evaluate(`document.getElementById('modal').hidden`));

  // 音效开关
  const muteBefore = await evaluate(`document.getElementById('btn-mute').getAttribute('aria-pressed')`);
  await key('m', 'KeyM');
  const muteAfter = await evaluate(`document.getElementById('btn-mute').getAttribute('aria-pressed')`);
  check('M 切换音效', muteBefore !== muteAfter, `${muteBefore} → ${muteAfter}`);
  await key('m', 'KeyM');

  // 点击空白清空选择
  await evaluate(`document.querySelector('.topo-wrap').click()`);
  await sleep(250);
  check('点击拓扑空白清空选择', (await evaluate(`document.getElementById('action-target').textContent`)).includes('未选择'));

  // 点击设备节点
  await click('[data-device="DB-01"]');
  await sleep(250);
  check('点击拓扑节点选中设备', (await evaluate(`document.getElementById('device-title').textContent`)).includes('数据库服务器'));

  // 日志搜索
  await evaluate(`(() => { const input = document.getElementById('log-search'); input.value = 'PC-01'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(400);
  const filtered = await evaluate(`document.querySelectorAll('.log-line').length`);
  const totalLogs = await evaluate(`__zdd ? __zdd.game.logs.entries.length : 0`);
  check('日志搜索缩小结果', filtered > 0 && filtered < totalLogs, `${filtered} / ${totalLogs}`);
  await evaluate(`(() => { const input = document.getElementById('log-search'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);

  // 加固商店
  await key('u', 'KeyU');
  await sleep(300);
  await screenshot('07-shop');
  check('加固商店 7 张卡片', (await evaluate(`document.querySelectorAll('.up-card').length`)) === 7);
  await click('[data-act="shop-close"]');
  await sleep(200);

  // 手册
  await key('F1', 'F1');
  await sleep(300);
  await screenshot('08-help');
  check('值班手册打开', await evaluate(`!!document.querySelector('[data-act="help-close"]')`));
  check('手册内有项目链接', (await evaluate(`document.querySelectorAll('.help-links a').length`)) >= 3);
  await click('[data-act="help-close"]');
  await sleep(200);

  // 暂停 + 存读档
  await click('#btn-pause-2');
  await sleep(300);
  await screenshot('09-pause');
  check('暂停浮层出现', await evaluate(`!!document.querySelector('[data-act="pause-resume"]')`));
  await click('[data-act="pause-save"]');
  await sleep(300);
  await click('[data-act="pause-load"]');
  await sleep(400);
  check('读档后仍在值班', (await evaluate(`document.getElementById('app').dataset.state`)) === 'playing');
  await click('[data-act="pause-resume"]').catch(() => {});
  await sleep(200);

  // 日志过滤
  await clickText('.chip', '情报');
  await sleep(200);
  check('日志分类切换', (await evaluate(`document.querySelector('.chip[aria-selected="true"]').textContent`)) === '情报');
  await clickText('.chip', '全部');

  check('控制台无异常', pageErrors.length === 0, pageErrors.join(' | '));
  check('无 console.error', consoleErrors.length === 0, consoleErrors.join(' | '));

  const failed = checks.filter((item) => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} 通过；截图：${shotDir}`);
  return failed.length;
}

try {
  const failed = await main();
  ws && ws.close();
  browser.kill();
  await sleep(300);
  process.exit(failed > 0 ? 1 : 0);
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  ws && ws.close();
  browser.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch (cleanupError) {
    // 忽略清理失败
  }
  process.exit(1);
}
