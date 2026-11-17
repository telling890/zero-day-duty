#!/usr/bin/env node
/**
 * 体验包 A+B 的实机检查 + 截图：禁用理由、二次确认、空态、字号、
 * 回合结算摘要、夜色、趋势预判、失败预兆。
 *
 * 用法：
 *   node tools/browser-feel.mjs [截图目录]
 * 依赖：本机安装 Edge / Chrome（或设置 CHROME_PATH）。
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSession, sleep } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shotDir = resolve(process.argv[2] || join(root, 'tests', 'screenshots', 'feel'));

const session = await openSession({ shotDir, width: 1440, height: 900 });
const { evaluate, screenshot, click, clickText, key, resize, check, summary, close, pageErrors, consoleErrors } = session;

/* ---------- 开局 ---------- */
await click('#menu-start');
await sleep(250);
await click('[data-act="briefing-enter"]');
await sleep(300);
await screenshot('00-start');

/* ---------- A3 空态 + A1 禁用理由 ---------- */
await click('.alert-row');
await sleep(200);

check('告警只有零星几条时出现值守空态', await evaluate(
  "Boolean(document.querySelector('.alert-idle'))",
));

const disabledReasons = await evaluate(`(() => {
  return Array.from(document.querySelectorAll('.act')).filter((el) => el.disabled)
    .map((el) => el.querySelector('.act-cost').textContent.trim());
})()`);
check(
  '禁用按钮把原因写在按钮上（不是“不可用”）',
  disabledReasons.length > 0 && disabledReasons.every((text) => text && text !== '不可用' && text.length > 3),
  JSON.stringify(disabledReasons),
);

await screenshot('01-disabled-reasons');

/* ---------- A4 字号分级 ---------- */
const fontSizes = await evaluate(`(() => {
  const log = document.querySelector('.log-line .log-text');
  const clock = document.querySelector('.log-line .clock');
  return {
    log: log ? getComputedStyle(log).fontSize : '',
    clock: clock ? getComputedStyle(clock).fontSize : '',
    metric: getComputedStyle(document.querySelector('.metric-value')).fontSize,
  };
})()`);
check('日志正文至少 14px（不再压小）', parseFloat(fontSizes.log) >= 14, fontSizes.log);
check('时间戳比正文小一档（有层次）', parseFloat(fontSizes.clock) < parseFloat(fontSizes.log), `${fontSizes.clock} < ${fontSizes.log}`);
check('关键数字 ≥ 18px', parseFloat(fontSizes.metric) >= 18, fontSizes.metric);

/* ---------- A2 不可逆动作二次确认 ---------- */
await clickText('.act', '隔离设备');
await sleep(250);
await clickText('.act', '解除隔离');
await sleep(200);
check('第一次点解除隔离只上膛', await evaluate(`(() => {
  const el = Array.from(document.querySelectorAll('.act')).find((node) => node.textContent.includes('解除隔离'));
  return Boolean(el && el.classList.contains('is-confirm') && el.textContent.includes('再点一次确认'));
})()`));
check('上膛时设备仍在隔离', await evaluate("__zdd.game.devices['PC-01'].isolated === true"));
await screenshot('02-confirm');

await clickText('.act', '解除隔离');
await sleep(250);
check('第二次点击才真正解除隔离', await evaluate("__zdd.game.devices['PC-01'].isolated === false"));

/* ---------- B2 夜色 ---------- */
const tint = await evaluate(`(() => {
  const el = document.getElementById('night-tint');
  const cs = getComputedStyle(el);
  return {
    display: cs.display,
    bg: cs.backgroundColor,
    dark: !matchMedia('(prefers-color-scheme: light)').matches,
    hour: __zdd.game.turn,
  };
})()`);
check(
  '夜色遮罩按时钟上色（深色主题下才生效）',
  !tint.dark || (tint.display !== 'none' && tint.bg !== 'rgba(0, 0, 0, 0)' && tint.bg !== 'transparent'),
  JSON.stringify(tint),
);
check('浅色主题下夜色遮罩自动关闭', tint.dark || tint.display === 'none', JSON.stringify(tint));

/* ---------- B1 回合结算摘要 ---------- */
await key(' ', 'Space');
await sleep(220);
check('推进回合后出现结算摘要', await evaluate("document.getElementById('turn-recap').classList.contains('show')"));
const recapText = await evaluate("document.getElementById('turn-recap').textContent.replace(/\\s+/g, ' ').trim()");
check('摘要写清了这一回合发生了什么', /回合结算/.test(recapText) && recapText.length > 20, recapText.slice(0, 120));
check('摘要出现时顶部横幅让位', await evaluate("document.getElementById('app').classList.contains('recap-open')"));
await screenshot('03-turn-recap');

await sleep(1800);
check('摘要 1.7 秒后自动收起', await evaluate("!document.getElementById('turn-recap').classList.contains('show')"));

/* ---------- B3 趋势预判 ---------- */
const trend = await evaluate(`(() => {
  const game = __zdd.game;
  game.player.security = 30;
  game.player.changes.push({ turn: 1, key: 'security', delta: -12, reason: '测试' });
  game.player.changes.push({ turn: 2, key: 'security', delta: -11, reason: '测试' });
  __zdd.renderAll();
  const el = document.querySelector('.metric.security .metric-foot');
  return el ? el.textContent : '';
})()`);
check('安全度下滑时给出失守时间预判', /失守/.test(trend), trend);

/* ---------- B4 失败预兆 ---------- */
await evaluate(`(() => {
  const game = __zdd.game;
  game.player.availability = 32;
  game.player.security = 22;
  game.lowAvailabilityTurns = 2;
  __zdd.renderAll();
})()`);
await sleep(200);
check('连续低可用性触发失败预兆', await evaluate("document.getElementById('app').classList.contains('is-collapse')"));
await screenshot('04-collapse');

/* ---------- 手机宽度：没 hover 也能看到禁用原因 ---------- */
await resize(390, 844, true);
await sleep(400);
await screenshot('05-mobile');
const mobileReasons = await evaluate(`(() => {
  const el = document.querySelector('.act:disabled .act-cost');
  if (!el) return '';
  return el.textContent.trim();
})()`);
check('手机上禁用原因仍在按钮里可见', Boolean(mobileReasons) && mobileReasons !== '不可用', mobileReasons);

/* ---------- 重开一局：摘要序号不能回退，否则新一局的总结会被当成“已经播过” ---------- */
const recapSeqBefore = await evaluate('__zdd.game.recapSeq');
await evaluate("(() => { const g = __zdd.game; g.newGame({ briefing: false, difficulty: g.difficultyId }); })()");
await evaluate('__zdd.game.endTurn()');
await sleep(260);
const restart = await evaluate(`({
  seq: __zdd.game.recapSeq,
  shown: document.getElementById('turn-recap').classList.contains('show'),
})`);
check(
  '重开一局后结算摘要仍会出现',
  restart.seq > recapSeqBefore && restart.shown,
  JSON.stringify({ before: recapSeqBefore, ...restart }),
);

check('无未捕获异常', pageErrors.length === 0, pageErrors.join(' | '));
check('无 console.error', consoleErrors.length === 0, consoleErrors.join(' | '));

const failed = summary();
await close();
process.exit(failed ? 1 : 0);
