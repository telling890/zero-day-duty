#!/usr/bin/env node
/* 小型 CDP 会话封装：启动无头浏览器、点击、截图、收集异常。 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

export const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

export function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) || null;
}

export async function openSession(options = {}) {
  const browserPath = findBrowser();
  if (!browserPath) throw new Error('找不到浏览器，可用 CHROME_PATH 指定');
  const width = options.width || 1440;
  const height = options.height || 900;
  const mobile = Boolean(options.mobile);
  const port = 9200 + Math.floor(Math.random() * 500);
  const profile = join(tmpdir(), `zdd-flow-${Date.now()}`);
  const pagePath = options.page ? resolve(root, options.page) : join(root, 'index.html');
  const url = `file:///${pagePath.replace(/\\/g, '/')}`;
  const browser = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    `--window-size=${width},${height}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    url,
  ], { stdio: 'ignore' });

  const deadline = Date.now() + 25000;
  let target = null;
  while (!target && Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl) || null;
    } catch (error) {
      // 等浏览器启动
    }
    if (!target) await sleep(250);
  }
  if (!target) {
    browser.kill();
    throw new Error('浏览器没有在预期时间内启动');
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    ws.addEventListener('open', resolvePromise, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const pageErrors = [];
  const consoleErrors = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
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
      const details = result.exceptionDetails;
      const description = details.exception && details.exception.description;
      throw new Error(`页面脚本异常：${details.text}${description ? `\n${description}` : ''}`);
    }
    return result.result ? result.result.value : undefined;
  }

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });

  async function waitReady() {
    if (options.skipReady) {
      await sleep(600);
      return;
    }
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const ready = await evaluate(`document.readyState === 'complete' && document.getElementById('metrics') && document.getElementById('metrics').children.length > 0`);
      if (ready) return;
      await sleep(200);
    }
    throw new Error('页面没有完成初始化');
  }

  const shotDir = options.shotDir || join(root, 'tests', 'screenshots');
  mkdirSync(shotDir, { recursive: true });
  async function screenshot(name, fullPage = false) {
    const result = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: Boolean(fullPage),
    });
    const file = join(shotDir, `${name}.png`);
    writeFileSync(file, Buffer.from(result.data, 'base64'));
    return file;
  }

  async function click(selector) {
    const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
    if (!ok) throw new Error(`找不到可点击元素：${selector}`);
    await sleep(240);
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
    await sleep(240);
  }

  async function key(keyName, code) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code: code || keyName });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code: code || keyName });
    await sleep(240);
  }

  async function resize(newWidth, newHeight, isMobile) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: newWidth,
      height: newHeight,
      deviceScaleFactor: 1,
      mobile: Boolean(isMobile),
    });
    await sleep(200);
  }

  async function reload() {
    await send('Page.reload', { ignoreCache: true });
    await sleep(500);
    await waitReady();
  }

  const checks = [];
  function check(name, condition, detail) {
    checks.push({ name, ok: Boolean(condition), detail: detail || '' });
    console.log(`${condition ? '✓' : '✗'} ${name}${!condition && detail ? `：${detail}` : ''}`);
  }

  function summary() {
    const failed = checks.filter((item) => !item.ok).length;
    console.log(`\n${checks.length - failed}/${checks.length} 通过`);
    return failed;
  }

  async function close() {
    try {
      ws.close();
    } catch (error) {
      // 忽略
    }
    browser.kill();
    await sleep(250);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理失败
    }
  }

  await waitReady();
  return {
    send, evaluate, screenshot, click, clickText, key, resize, reload, close,
    check, summary, pageErrors, consoleErrors,
  };
}
