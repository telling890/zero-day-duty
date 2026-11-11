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
  check('教程共 12 页', (await evaluate(`document.querySelectorAll('.tutorial-pages i').length`)) === 12);
  await screenshot('10-tutorial-page1');

  for (let i = 0; i < 11; i += 1) await click('[data-act="tutorial-next"]');
  check('教程到第 12 页', await evaluate(`document.querySelector('.modal-kicker').textContent.includes('12 / 12')`));
  await screenshot('11-tutorial-last');
  await click('[data-act="tutorial-next"]');
  check('实战演练提示卡出现', await evaluate(`!document.getElementById('guide').hidden`));
  check('指南第 1 步是选择告警', await evaluate(`document.getElementById('guide').textContent.includes('选择告警')`));
  await screenshot('12-guide-step1');

  await click('.alert-row');
  await clickText('.act', '调查告警');
  await clickText('.act', '隔离');
  await clickText('.act', '清除威胁');
  await clickText('.act', '解除隔离');
  check('指南提示推进回合', await evaluate(`document.getElementById('guide').textContent.includes('推进回合')`));
  await click('#btn-advance');
  await sleep(500);
  check('教程完成浮层', await evaluate(`!!document.querySelector('[data-act="tutorial-start"]')`));
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
