#!/usr/bin/env node
/* 端到端流程测试：教程 → 决策 → 结算 → 存档持久化 → 移动端布局。 */
import { openSession } from './cdp.mjs';

const session = await openSession({ width: 1440, height: 900 });
const {
  evaluate, screenshot, click, clickText, key, resize, reload, check, summary, close,
  pageErrors, consoleErrors,
} = session;

try {
  // ============================ 教程 ============================
  await click('#menu-tutorial');
  check('教程第 1 页', await evaluate(`document.querySelector('.modal-title').textContent.includes('一分钟看懂')`));
  check('教程共 15 页', (await evaluate(`document.querySelectorAll('.tutorial-pages i').length`)) === 15);
  await screenshot('10-tutorial-page1');

  for (let i = 0; i < 3; i += 1) await click('[data-act="tutorial-next"]');
  check('教程第 4 页讲第一回合操作', await evaluate(`document.querySelector('.modal-title').textContent.includes('第一回合')`));
  check('第 4 页有 6 步流程图', (await evaluate(`document.querySelectorAll('.tutorial-loop .tut-step').length`)) === 6);
  await screenshot('10b-tutorial-page4');

  for (let i = 0; i < 8; i += 1) await click('[data-act="tutorial-next"]');
  check('第 12 页讲顶栏按钮', await evaluate(`document.querySelector('.modal-title').textContent.includes('顶栏 5 个按钮')`));
  check('第 12 页有 5 个按钮说明', (await evaluate(`document.querySelectorAll('.tutorial-keys .tut-key').length`)) === 5);
  await screenshot('10c-tutorial-topbar');

  await click('[data-act="tutorial-next"]');
  check('第 13 页讲命令行', await evaluate(`document.querySelector('.modal-title').textContent.includes('命令行')`));
  check('第 13 页有 5 步命令流程', (await evaluate(`document.querySelectorAll('.tutorial-loop .tut-step').length`)) === 5);
  await screenshot('10d-tutorial-cli');

  await click('[data-act="tutorial-next"]');
  check('第 14 页讲脚本', await evaluate(`document.querySelector('.modal-title').textContent.includes('脚本')`));
  await screenshot('10e-tutorial-script');

  await click('[data-act="tutorial-next"]');
  check('教程到第 15 页', await evaluate(`document.querySelector('.modal-kicker').textContent.includes('15 / 15')`));
  await screenshot('11-tutorial-last');
  await click('[data-act="tutorial-next"]');
  check('实战演练提示卡出现', await evaluate(`!document.getElementById('guide').hidden`));
  check('指南第 1 步是选择告警', await evaluate(`document.getElementById('guide').textContent.includes('选择告警')`));
  check('提示卡标出输入通道', await evaluate(`document.querySelector('.guide-channel').textContent === '点击'`));
  check('聚光灯压暗其余画面', await evaluate(`(() => {
    const ring = document.getElementById('guide-ring');
    if (ring.hidden) return false;
    const box = ring.getBoundingClientRect();
    return box.width > 0 && getComputedStyle(ring).outlineWidth === '9999px';
  })()`));
  await screenshot('12-guide-step1');

  await click('.alert-row');
  await clickText('.act', '调查告警');
  check('第 3 步改用命令行', await evaluate(`document.querySelector('.guide-channel').textContent === '命令行'`));

  await click('[data-act="guide-fill"]');
  await waitFor(`document.getElementById('term-input').value === 'isolate PC-01'`, 2000);
  check('带练按钮把命令填进终端', await evaluate(`document.getElementById('term-input').value === 'isolate PC-01'`));
  check('终端已打开并套上聚光灯', await evaluate(`document.body.classList.contains('terminal-open') && !document.getElementById('guide-ring').hidden`));
  await screenshot('12b-guide-terminal');
  await press('Enter', 'Enter', 13);
  check('命令隔离后事件进入已控制', await waitFor(`__zdd.game.events.events.some((e) => e.contained)`, 3000));
  check('终端自动收起', await waitFor(`!document.body.classList.contains('terminal-open')`, 2000));

  await clickText('.act', '清除威胁');
  check('第 5 步改用脚本', await evaluate(`document.querySelector('.guide-channel').textContent === '脚本'`));
  await click('[data-act="guide-fill"]');
  await waitFor(`document.getElementById('script-code').value.includes('release(d)')`, 2000);
  check('带练按钮把脚本填进编辑器', await evaluate(`document.getElementById('script-code').value.includes('release(d)')`));
  await screenshot('12c-guide-script');
  await click('#script-run');
  check('脚本执行 release 后设备恢复在线', await waitFor(`(() => {
    const d = __zdd.game.devices['PC-01'];
    return Boolean(d) && !d.isolated;
  })()`, 6000));
  check('脚本自动收起并提示推进回合', await waitFor(`!document.body.classList.contains('script-open')
    && document.getElementById('guide').textContent.includes('推进回合')`, 4000));

  await click('#btn-advance');
  await sleep(600);
  check('教程完成浮层', await evaluate(`!!document.querySelector('[data-act="tutorial-start"]')`));
  check('完成页讲清三种输入方式', await evaluate(`document.querySelector('.modal-sub').textContent.includes('三种输入方式')`));
  await screenshot('13-tutorial-complete');
  await click('[data-act="tutorial-start"]');
  check('开始正式值班后进入 playing', (await evaluate(`document.getElementById('app').dataset.state`)) === 'playing');
  check('正式值班没有教程提示卡', await evaluate(`document.getElementById('guide').hidden`));

  // ============================ 决策 ============================
  await evaluate(`(() => { const g = __zdd.game; g.turn = 3; g.player.turn = 3; g.startTurn(); __zdd.renderAll(); return true; })()`);
  await sleep(400);
  check('第 4 回合弹出剧情决策', await evaluate(`!!document.querySelector('[data-act="decision-choose"]')`));
  await screenshot('14-decision');
  const before = await evaluate(`__zdd.game.player.availability`);
  await click('[data-act="decision-choose"]');
  await sleep(300);
  const after = await evaluate(`__zdd.game.player.availability`);
  check('决策立即改变指标', before !== after, `${before} → ${after}`);
  check('决策浮层关闭', await evaluate(`!document.querySelector('[data-act="decision-choose"]')`));

  // ============================ 结算 ============================
  await evaluate(`(() => { const g = __zdd.game; g.player.security = 1; g.finish('security'); __zdd.renderAll(); return true; })()`);
  await sleep(400);
  check('结算浮层出现', await evaluate(`!!document.querySelector('[data-act="result-restart"]')`));
  check('安全体系崩溃结局', await evaluate(`document.querySelector('.ending-title').textContent.includes('安全体系崩溃')`));
  check('等级被限制为 D', (await evaluate(`document.querySelector('.result-head .grade').textContent`)).trim() === 'D');
  check('结算统计 12 项', (await evaluate(`document.querySelectorAll('.stats-grid .stat').length`)) === 12);
  await screenshot('15-result');

  await click('[data-act="result-restart"]');
  check('再值一班进入夜班简报', await evaluate(`!!document.querySelector('[data-act="briefing-enter"]')`));
  await click('[data-act="briefing-enter"]');

  // ============================ 存档跨刷新 ============================
  await click('.alert-row');
  await clickText('.act', '调查告警');
  await key('F5', 'F5');
  const savedSecurity = await evaluate(`__zdd.game.player.security`);
  await reload();
  check('刷新后回到主菜单', (await evaluate(`document.getElementById('app').dataset.state`)) === 'menu');
  const continueEnabled = await evaluate(`!document.getElementById('menu-continue').disabled`);
  check('刷新后「继续上次值班」可用', continueEnabled);
  if (continueEnabled) {
    await click('#menu-continue');
    await sleep(400);
    check('读档后回到值班', (await evaluate(`document.getElementById('app').dataset.state`)) === 'playing');
    check('读档恢复指标', (await evaluate(`__zdd.game.player.security`)) === savedSecurity);
  }

  // ============================ 移动端 ============================
  await resize(390, 844, true);
  await reload();
  await click('#menu-start');
  await click('[data-act="briefing-enter"]');
  await sleep(500);
  check('移动端无横向溢出', (await evaluate(`document.documentElement.scrollWidth <= 391`)),
    await evaluate(`String(document.documentElement.scrollWidth)`));
  check('移动端顶栏可见', (await evaluate(`document.querySelector('.topbar').getBoundingClientRect().height > 40`)));
  await screenshot('16-mobile-top');
  await evaluate(`document.querySelector('#alert-list').scrollIntoView({ block: 'start' })`);
  await sleep(300);
  await screenshot('17-mobile-alerts');
  await evaluate(`document.querySelector('#action-grid').scrollIntoView({ block: 'center' })`);
  await sleep(300);
  await screenshot('18-mobile-actions');
  await screenshot('19-mobile-full', true);

  check('控制台无异常', pageErrors.length === 0, pageErrors.join(' | '));
  check('无 console.error', consoleErrors.length === 0, consoleErrors.join(' | '));

  const failed = summary();
  await close();
  process.exit(failed > 0 ? 1 : 0);
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  console.error('页面异常：', pageErrors);
  await close();
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** 轮询等待页面条件成立，用于脚本/命令这类异步推进。 */
async function waitFor(expression, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(120);
  }
  return false;
}

/** 真实按键（带 virtualKeyCode，Enter 才能触发表单提交）。 */
async function press(keyName, code, virtualKey) {
  const params = { key: keyName, code, windowsVirtualKeyCode: virtualKey || 0 };
  await session.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, params));
  await session.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, params));
  await sleep(200);
}
