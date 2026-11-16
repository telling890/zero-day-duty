#!/usr/bin/env node
/**
 * 项目主页主题回归测试：docs/index.html 与 docs/privacy.html 是否跟着本机外观走。
 *
 * 设计：style.css 是「纸张」浅色主题，soc-theme.css 整份包在
 * @media (prefers-color-scheme: dark) 里，所以
 *   本机浅色 → 纸张主题（米白底、朱红强调）
 *   本机深色 → SOC 深色主题（近黑底、青色强调）
 *
 * 用法：node tools/browser-docs-theme.mjs [截图目录]
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSession, sleep } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shotDir = resolve(process.argv[2] || join(root, 'tests', 'screenshots', 'docs-theme'));

const REVEAL = "(() => { const st = document.createElement('style'); st.textContent = '.reveal{opacity:1 !important;transform:none !important}'; document.head.appendChild(st); return true; })()";

function luminance(text) {
  const match = String(text).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!match) return null;
  const [r, g, b] = match.slice(1).map((value) => {
    const channel = Number(value) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function openPage(page) {
  const session = await openSession({ width: 1440, height: 1000, page, shotDir, skipReady: true });
  await sleep(900);
  await session.evaluate(REVEAL);
  return session;
}

async function setScheme(session, scheme) {
  await session.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-color-scheme', value: scheme }],
  });
  await sleep(400);
  await session.evaluate(REVEAL);
  await sleep(200);
}

async function styleOf(session, selector, props) {
  return session.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const s = getComputedStyle(el);
    const out = {};
    for (const key of ${JSON.stringify(props)}) out[key] = s.getPropertyValue(key);
    return out;
  })()`);
}

async function shot(session, name, selector) {
  if (selector) {
    await session.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.scrollIntoView({ block: 'start' }); return true; })()`);
    await sleep(400);
    await session.evaluate(REVEAL);
    await sleep(150);
  } else {
    await session.evaluate('window.scrollTo(0, 0)');
    await sleep(200);
  }
  await session.screenshot(name);
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: detail || '' });
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? `：${detail}` : ''}`);
}

/* ---------- 首页 ---------- */
const home = await openPage('../docs/index.html');

await setScheme(home, 'light');
const paperBody = await styleOf(home, 'body', ['background-color', 'color']);
check('首页 · 浅色：底色是纸张米白', paperBody['background-color'] === 'rgb(242, 239, 230)', paperBody['background-color']);
check('首页 · 浅色：正文是墨色', luminance(paperBody.color) < 0.05, paperBody.color);
const paperKicker = await styleOf(home, '.section-kicker', ['color']);
check('首页 · 浅色：强调色是朱红', paperKicker.color === 'rgb(193, 54, 42)', paperKicker.color);
const paperProgress = await styleOf(home, '.demo-progress span', ['border-color', 'color']);
check('首页 · 浅色：试玩进度条有样式（不是裸文本）', paperProgress['border-color'] !== 'rgb(0, 0, 0)' && paperProgress['border-color'] !== 'currentcolor', JSON.stringify(paperProgress));
await shot(home, '01-home-light-top');
await shot(home, '02-home-light-try', '#try');
await shot(home, '03-home-light-features', '#features');
await shot(home, '04-home-light-endings', '#endings');
await shot(home, '05-home-light-download', '#download');
await shot(home, '06-home-light-footer', 'footer');

await setScheme(home, 'dark');
const socBody = await styleOf(home, 'body', ['background-color', 'color']);
check('首页 · 深色：底色是 SOC 近黑', socBody['background-color'] === 'rgb(7, 11, 17)', socBody['background-color']);
const socKicker = await styleOf(home, '.section-kicker', ['color']);
check('首页 · 深色：强调色是青色', socKicker.color === 'rgb(0, 224, 255)', socKicker.color);
const socProgress = await styleOf(home, '.demo-progress span.is-active', ['color']);
check('首页 · 深色：进度条激活态是青色', socProgress.color === 'rgb(0, 224, 255)', socProgress.color);
await shot(home, '11-home-dark-top');
await shot(home, '12-home-dark-try', '#try');

/* 移动端 */
await setScheme(home, 'light');
await home.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await sleep(500);
await shot(home, '07-home-light-mobile');
await home.close();

/* ---------- 隐私政策 ---------- */
const privacy = await openPage('../docs/privacy.html');

await setScheme(privacy, 'light');
const pBody = await styleOf(privacy, 'body', ['background-color', 'color']);
check('隐私页 · 浅色：底色是纸张米白', pBody['background-color'] === 'rgb(242, 239, 230)', pBody['background-color']);
const pText = await styleOf(privacy, '.policy p:not(.meta)', ['color']);
check('隐私页 · 浅色：正文可读（深色字）', luminance(pText.color) < 0.15, pText.color);
const pLink = await styleOf(privacy, '.policy a', ['color']);
check('隐私页 · 浅色：链接是朱红', pLink.color === 'rgb(193, 54, 42)', pLink.color);
await shot(privacy, '21-privacy-light');

await setScheme(privacy, 'dark');
const pDark = await styleOf(privacy, 'body', ['background-color']);
check('隐私页 · 深色：底色是 SOC 近黑', pDark['background-color'] === 'rgb(7, 11, 17)', pDark['background-color']);
const pDarkText = await styleOf(privacy, '.policy p:not(.meta)', ['color']);
check('隐私页 · 深色：正文是浅色字', luminance(pDarkText.color) > 0.5, pDarkText.color);
const pDarkLink = await styleOf(privacy, '.policy a', ['color']);
check('隐私页 · 深色：链接是青色', pDarkLink.color === 'rgb(0, 224, 255)', pDarkLink.color);
await shot(privacy, '22-privacy-dark');

const errors = [...home.pageErrors, ...home.consoleErrors, ...privacy.pageErrors, ...privacy.consoleErrors];
check('没有页面脚本异常 / 控制台错误', errors.length === 0, errors.join(' | '));

await privacy.close();

const failed = checks.filter((item) => !item.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} 通过`);
console.log(`截图目录：${shotDir}`);
process.exit(failed ? 1 : 0);
