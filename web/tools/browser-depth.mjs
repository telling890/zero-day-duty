#!/usr/bin/env node
/**
 * 难度、延迟决策与结算时间线的浏览器测试。
 * 用法：node tools/browser-depth.mjs
 */
import { openSession, sleep } from './cdp.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const session = await openSession({
  width: 1440,
  height: 900,
  shotDir: join(root, 'tests', 'screenshots'),
});

async function startGame() {
  await session.click('#menu-start');
  await sleep(220);
  await session.click('[data-act="briefing-enter"]');
  await sleep(280);
}

const errors = [];
await sleep(500);
const menu = await session.evaluate(`(() => ({
  buttons: document.querySelectorAll('.diff-btn').length,
  active: document.querySelector('.diff-btn.is-active')?.dataset.difficulty,
  desc: document.getElementById('menu-difficulty-desc')?.textContent || '',
}))()`);
session.check('主菜单有 3 个难度按钮', menu.buttons === 3, JSON.stringify(menu));
session.check('默认难度是标准模式', menu.active === 'standard', JSON.stringify(menu));

await session.click('.diff-btn[data-difficulty="expert"]');
await sleep(200);
const selected = await session.evaluate(`(() => ({
  active: document.querySelector('.diff-btn.is-active')?.dataset.difficulty,
  desc: document.getElementById('menu-difficulty-desc')?.textContent || '',
}))()`);
session.check('可以切换到专家模式', selected.active === 'expert' && selected.desc.includes('专家模式'), JSON.stringify(selected));

await startGame();
const state = await session.evaluate(`(() => ({
  difficulty: __zdd.game.difficultyId,
  chip: document.getElementById('topbar-difficulty')?.textContent || '',
}))()`);
session.check('开局使用所选难度', state.difficulty === 'expert', JSON.stringify(state));
session.check('顶栏显示当前难度', state.chip.includes('专家'), JSON.stringify(state));

// 专家模式调查：只给证据，不给完整处置建议
const expertLogs = await session.evaluate(`(() => {
  const game = __zdd.game;
  const alert = game.events.alerts.find((item) => !item.falsePositive);
  game.selectAlert(alert);
  const option = game.actions.optionsFor(game, game.currentTarget()).find((item) => item.actionId === 'investigate');
  const result = game.performAction(option, game.currentTarget());
  return {
    ok: Boolean(result && result.success),
    logs: game.logs.entries.map((entry) => entry.message).join('\\n'),
  };
})()`);
session.check('专家模式调查可用', expertLogs.ok === true);
session.check('专家模式不显示完整建议', !expertLogs.logs.includes('建议处置：'), expertLogs.logs.slice(-300));
session.check('专家模式显示证据不足', expertLogs.logs.includes('处置建议：证据不足'));
session.check('专家模式出现未验证线索', expertLogs.logs.includes('未验证：'));

// 三选一决策
await session.evaluate(`(() => {
  const game = __zdd.game;
  game.turn = 5;
  game.maybeTriggerDecision();
  game.touch();
})()`);
await sleep(300);
const decision = await session.evaluate(`(() => ({
  visible: Boolean(__zdd.game.pendingDecision),
  views: document.querySelectorAll('.choice').length,
  note: document.querySelector('.modal-note')?.textContent || '',
  hints: Array.from(document.querySelectorAll('.choice span')).map((item) => item.textContent),
}))()`);
session.check('三选一决策已打开', decision.visible === true && decision.views === 3, JSON.stringify(decision));
session.check('决策只显示直接成本提示', decision.note.includes('直接成本') && decision.hints.every((hint) => !hint.includes('安全')), JSON.stringify(decision.hints));

await session.click('[data-act="decision-choose"][data-index="2"]');
await sleep(250);
const delayed = await session.evaluate(`(() => ({
  pending: __zdd.game.pendingDelayed.length,
  due: __zdd.game.pendingDelayed[0]?.dueTurn,
  history: __zdd.game.decisionHistory.length,
  timeline: __zdd.game.timeline.some((item) => item.kind === 'decision'),
}))()`);
session.check('选择第三个选项会入队延迟后果', delayed.pending === 1 && delayed.due === 7, JSON.stringify(delayed));
session.check('决策写入历史与时间线', delayed.history >= 1 && delayed.timeline === true, JSON.stringify(delayed));

// 结算：关键复盘与真实时间线
await session.evaluate(`(() => {
  const game = __zdd.game;
  game.turn = 10;
  game.finish('time');
})()`);
await sleep(350);
const result = await session.evaluate(`(() => ({
  state: __zdd.game.state,
  review: Boolean(document.querySelector('.result-review')),
  entries: document.querySelectorAll('.timeline-list li').length,
  text: document.querySelector('.result-review')?.textContent || '',
}))()`);
session.check('结算界面出现关键复盘', result.state === 'result' && result.review === true, JSON.stringify(result));
session.check('结算界面显示真实时间线', result.entries > 0, JSON.stringify(result));
session.check('复盘包含最大失误或关键正确', result.text.includes('关键正确') && result.text.includes('最大失误'), result.text.slice(0, 200));

await session.screenshot('depth-result');
const runtimeErrors = [...(session.pageErrors || []), ...(session.consoleErrors || [])];
session.check('难度与时间线测试无页面异常', runtimeErrors.length === 0, runtimeErrors.join('\n'));
const failed = session.summary();
await session.close();
process.exit(failed ? 1 : 0);
