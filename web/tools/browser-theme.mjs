#!/usr/bin/env node
/**
 * 主题回归测试：在无头浏览器里分别模拟「本机深色 / 本机浅色」，
 * 检查页面是否真的跟着系统外观切换（背景、面板、终端），并各截一张图。
 *
 * 用法：
 *   node tools/browser-theme.mjs [截图目录]
 * 依赖：本机安装 Microsoft Edge（或设置 CHROME_PATH 指向 chrome.exe）。
 *
 * 浅色规则在 css/style.css 末尾的 @media (prefers-color-scheme: light) 里；
 * 终端 / 剧本编辑区按设计保持深色，这里一并断言。
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSession, sleep } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shotDir = resolve(process.argv[2] || join(root, 'tests', 'screenshots', 'theme'));

const session = await openSession({ shotDir, width: 1440, height: 900 });
const { send, evaluate, screenshot, click, check, summary, close, pageErrors, consoleErrors } = session;

/* ---------- 颜色小工具：把 getComputedStyle 的输出拆成 0~1 亮度 ---------- */
function parseRgb(text) {
  const match = String(text).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance(text) {
  const rgb = parseRgb(text);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ---------- 会话操作 ---------- */
async function setScheme(scheme) {
  await send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-color-scheme', value: scheme }],
  });
  await send('Page.reload', { ignoreCache: true });
  await sleep(800);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evaluate("document.readyState === 'complete' && document.querySelectorAll('#metrics .metric').length > 0");
    if (ready) break;
    await sleep(150);
  }
  await sleep(200);
}

async function style(selector, props) {
  const list = JSON.stringify(props);
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const s = getComputedStyle(el);
    const out = {};
    for (const key of ${list}) out[key] = s.getPropertyValue(key);
    return out;
  })()`);
}

const isLight = async () => evaluate("window.matchMedia('(prefers-color-scheme: light)').matches");

/* ---------- 深色（本机深色） ---------- */
await setScheme('dark');
check('深色：媒体查询生效', (await isLight()) === false);

const darkBody = await style('body', ['background-color', 'color']);
check('深色：页面底色是深色', luminance(darkBody['background-color']) < 0.05, darkBody['background-color']);
check(
  '深色：正文对比度 ≥ 7',
  contrast(darkBody.color, darkBody['background-color']) >= 7,
  `对比度 ${contrast(darkBody.color, darkBody['background-color']).toFixed(1)}`,
);
await screenshot('01-menu-dark');

await click('#menu-start');
await sleep(500);
await click('[data-act="briefing-enter"]');
await sleep(500);
await screenshot('02-play-dark');
const darkPanel = await style('.panel', ['background-image']);
check('深色：面板是深色渐变', /rgba?\(2[01], 3[01], 4[15]/.test(darkPanel['background-image']), darkPanel['background-image'].slice(0, 80));

/* ---------- 浅色（本机浅色） ---------- */
await setScheme('light');
check('浅色：媒体查询生效', (await isLight()) === true);

const lightBody = await style('body', ['background-color', 'color']);
check('浅色：页面底色是浅色', luminance(lightBody['background-color']) > 0.75, lightBody['background-color']);
check(
  '浅色：正文对比度 ≥ 7',
  contrast(lightBody.color, lightBody['background-color']) >= 7,
  `对比度 ${contrast(lightBody.color, lightBody['background-color']).toFixed(1)}`,
);
await screenshot('03-menu-light');

await click('#menu-start');
await sleep(500);
await click('[data-act="briefing-enter"]');
await sleep(500);
await screenshot('04-play-light');

const lightPanel = await style('.panel', ['background-image']);
check('浅色：面板换成浅色渐变', /255, 255, 255/.test(lightPanel['background-image']), lightPanel['background-image'].slice(0, 80));

const lightTopbar = await style('.topbar', ['background-image']);
check('浅色：顶栏跟着变浅', /238, 243, 249/.test(lightTopbar['background-image']), lightTopbar['background-image'].slice(0, 80));

/* 终端按设计保持深色 */
await click('#btn-terminal');
await sleep(400);
await screenshot('05-terminal-light');
const term = await style('.term-window', ['background-image']);
check('浅色：终端仍是深色窗口', /rgb\(10, 19, 25\)/.test(term['background-image']), term['background-image'].slice(0, 80));
const termScreen = await style('.term-screen', ['color']);
check('浅色：终端文字仍是浅色字', luminance(termScreen.color) > 0.5, termScreen.color);
await click('#term-close');
await sleep(300);

/* 剧本面板同样保持深色，工具栏按钮走深色 token */
await click('#btn-script');
await sleep(400);
await screenshot('06-script-light');
const dock = await style('.script-dock', ['background-image']);
check('浅色：剧本面板仍是深色', /rgb\(11, 19, 26\)/.test(dock['background-image']), dock['background-image'].slice(0, 80));
await click('#script-close');
await sleep(300);

/* 浮层（值班手册）走浅色 */
await click('#btn-help');
await sleep(400);
await screenshot('07-help-light');
const card = await style('.modal-card', ['background-image', 'color']);
check('浅色：弹窗换成浅色', /255, 255, 255/.test(card['background-image']), card['background-image'].slice(0, 80));
check('浅色：弹窗文字对比度 ≥ 7', contrast(card.color, 'rgb(255, 255, 255)') >= 7, `对比度 ${contrast(card.color, 'rgb(255, 255, 255)').toFixed(1)}`);
await evaluate("document.querySelector('#modal').hidden = true");

/* ---------- 移动端竖屏，浅色 ---------- */
await setScheme('light');
await click('#menu-start');
await sleep(400);
await click('[data-act="briefing-enter"]');
await sleep(400);
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await sleep(400);
await screenshot('08-mobile-light');

/* ---------- 收尾 ---------- */
if (pageErrors.length) console.error(`页面异常：\n${pageErrors.join('\n')}`);
if (consoleErrors.length) console.error(`控制台错误：\n${consoleErrors.join('\n')}`);
check('没有页面脚本异常', pageErrors.length === 0, pageErrors.join(' | '));
check('没有控制台错误', consoleErrors.length === 0, consoleErrors.join(' | '));

const failed = summary();
await close();
console.log(`截图目录：${shotDir}`);
process.exit(failed ? 1 : 0);
