#!/usr/bin/env node
/**
 * 处置终端与键盘操作的浏览器测试。
 * 覆盖：` 热键打开、Tab 补全、↑ 历史、scan/isolate/clean/release/next、
 * 命令错误提示、Esc 关闭、数字键 1 执行操作、手机全屏布局、无控制台异常。
 *
 * 用法：node tools/browser-terminal.mjs
 */
import { openSession, sleep } from './cdp.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shotDir = join(root, 'tests', 'screenshots');

const session = await openSession({ width: 1440, height: 900, shotDir });

async function press(key, code, virtualKey) {
  const params = { key, code, windowsVirtualKeyCode: virtualKey || 0 };
  await session.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, params));
  await session.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, params));
  await sleep(180);
}

async function startGame() {
  await session.click('#menu-start');
  await sleep(260);
  await session.click('[data-act="briefing-enter"]');
  await sleep(320);
}

try {
  await startGame();
  session.check('值班界面已开始', await session.evaluate(`document.getElementById('app').dataset.state === 'playing'`));

  // ------------------------------------------------------------------
  // 1. 数字键执行操作（先测，避免之后告警被清理掉）
  // ------------------------------------------------------------------
  const firstAlertId = await session.evaluate(`__zdd.game.orderedAlerts[0] && __zdd.game.orderedAlerts[0].alertId`);
  await session.click(`[data-alert-id="${firstAlertId}"]`);
  await session.evaluate(`document.activeElement && document.activeElement.blur()`);
  await press('1', 'Digit1', 49);
  await sleep(320);
  const keyInvestigated = await session.evaluate(
    `(() => { const a = __zdd.game.events.alerts.find((item) => item.alertId === ${JSON.stringify(firstAlertId)}); return Boolean(a && a.investigated); })()`,
  );
  session.check('数字键 1 执行「调查告警」', keyInvestigated);
  session.check('数字键操作后 AP 减少', await session.evaluate(`__zdd.game.player.actionPoints < 6`));

  // ------------------------------------------------------------------
  // 2. 重新开一局，测试处置终端
  // ------------------------------------------------------------------
  await session.reload();
  await sleep(500);
  await startGame();

  // 终端默认使用当前选中的告警 / 设备
  const selectedAlertId = await session.evaluate(`__zdd.game.orderedAlerts[0] && __zdd.game.orderedAlerts[0].alertId`);
  await session.click(`[data-alert-id="${selectedAlertId}"]`);

  await press('`', 'Backquote', 192);
  await sleep(320);
  session.check('` 热键打开终端', await session.evaluate(`!document.getElementById('terminal').hidden`));
  const bootText = await session.evaluate(`document.getElementById('term-screen').textContent`);
  session.check('终端显示启动信息', bootText.includes('已接入') && bootText.includes('help'));
  await session.screenshot('terminal-boot');

  // 真实键入 help
  await session.evaluate(`document.getElementById('term-input').focus()`);
  await session.send('Input.insertText', { text: 'help' });
  await press('Enter', 'Enter', 13);
  await sleep(260);
  const helpText = await session.evaluate(`document.getElementById('term-screen').textContent`);
  session.check('键入 help 显示命令表', helpText.includes('可用命令') && helpText.includes('isolate'));

  // Tab 补全
  await session.evaluate(`(() => {
    const input = document.getElementById('term-input');
    input.value = 'iso';
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await press('Tab', 'Tab', 9);
  const completed = await session.evaluate(`document.getElementById('term-input').value`);
  session.check('Tab 补全命令', completed === 'isolate ', completed);

  // ↑ 历史
  await session.evaluate(`document.getElementById('term-input').value = ''`);
  await press('ArrowUp', 'ArrowUp', 38);
  const historyValue = await session.evaluate(`document.getElementById('term-input').value`);
  session.check('↑ 调出历史命令', historyValue === 'help', historyValue);
  await session.evaluate(`document.getElementById('term-input').value = ''`);

  // 调查 → 隔离 → 清除 → 解除隔离
  await session.evaluate(`__zdd.terminal.run('scan')`);
  await sleep(320);
  const scanResult = await session.evaluate(`(() => {
    const alert = __zdd.game.orderedAlerts.find((item) => item.targetId === 'PC-01');
    return { investigated: Boolean(alert && alert.investigated), text: document.getElementById('term-screen').textContent };
  })()`);
  session.check('省略目标时使用当前选中告警', scanResult.investigated);
  session.check('scan 输出调查结论', scanResult.text.includes('调查'), scanResult.text.slice(-80));

  await session.evaluate(`__zdd.terminal.run('isolate PC-01')`);
  await sleep(320);
  session.check('isolate 隔离 PC-01', await session.evaluate(`__zdd.game.devices['PC-01'].isolated`));

  await session.evaluate(`__zdd.terminal.run('clean PC-01')`);
  await sleep(360);
  session.check('clean 清除事件', await session.evaluate(`__zdd.game.events.events.some((event) => event.eradicated)`));

  await session.evaluate(`__zdd.terminal.run('release PC-01')`);
  await sleep(320);
  session.check('release 解除隔离', !(await session.evaluate(`__zdd.game.devices['PC-01'].isolated`)));

  await session.evaluate(`__zdd.terminal.run('status')`);
  const statusText = await session.evaluate(`document.getElementById('term-screen').textContent`);
  session.check('status 输出指标', statusText.includes('值班状态') && statusText.includes('行动点'));

  await session.evaluate(`__zdd.terminal.run('devices')`);
  const devicesText = await session.evaluate(`document.getElementById('term-screen').textContent`);
  session.check('devices 列出 8 台设备', devicesText.includes('GW-01') && devicesText.includes('PC-01') && devicesText.includes('DB-01'));

  await session.evaluate(`__zdd.terminal.run('buy log_plugin')`);
  await sleep(320);
  const bought = await session.evaluate(`(() => ({
    owned: __zdd.game.player.hasUpgrade('log_plugin'),
    funds: __zdd.game.player.funds,
    text: document.getElementById('term-screen').textContent,
  }))()`);
  session.check('buy 购买安全加固', bought.owned && bought.funds < 1250, JSON.stringify({ owned: bought.owned, funds: bought.funds }));

  await session.evaluate(`__zdd.terminal.run('next')`);
  await sleep(420);
  session.check('next 推进到第 2 回合', (await session.evaluate(`__zdd.game.turn`)) === 2);
  session.check('推进后终端仍在', await session.evaluate(`!document.getElementById('terminal').hidden`));

  await session.evaluate(`__zdd.terminal.run('scna PC-01')`);
  const errorText = await session.evaluate(`document.getElementById('term-screen').textContent`);
  session.check('未知命令给出提示', errorText.includes('命令不存在') && errorText.includes('scan'));
  await session.screenshot('terminal-commands');

  const danger = await session.evaluate(`(() => {
    __zdd.game.player.security = 20;
    __zdd.renderAll();
    const on = document.getElementById('app').classList.contains('is-danger');
    __zdd.game.player.security = 74;
    __zdd.renderAll();
    return on && !document.getElementById('app').classList.contains('is-danger');
  })()`);
  session.check('低安全度触发边缘告警光', danger);

  await press('Escape', 'Escape', 27);
  session.check('Esc 关闭终端', await session.evaluate(`document.getElementById('terminal').hidden`));

  // ------------------------------------------------------------------
  // 3. 手机布局
  // ------------------------------------------------------------------
  await session.resize(390, 844, true);
  await sleep(260);
  await session.evaluate(`__zdd.terminal.open()`);
  await sleep(320);
  await session.evaluate(`__zdd.terminal.clear(); __zdd.terminal.run('devices')`);
  await sleep(260);
  const mobile = await session.evaluate(`(() => {
    const rect = document.querySelector('.term-window').getBoundingClientRect();
    return { w: Math.round(rect.width), h: Math.round(rect.height), vw: innerWidth, vh: innerHeight };
  })()`);
  session.check('手机端终端全屏', mobile.w >= mobile.vw - 2 && mobile.h >= mobile.vh - 2, JSON.stringify(mobile));
  session.check('手机端设备表使用紧凑格式', await session.evaluate(`__zdd.terminal.compactMode() && !document.getElementById('term-screen').textContent.includes('ID   设备')`));
  await session.screenshot('terminal-mobile');
  await session.evaluate(`__zdd.terminal.close()`);

  session.check('终端测试无页面异常', session.pageErrors.length === 0, session.pageErrors.join(' | '));
  session.check('终端测试无 console.error', session.consoleErrors.length === 0, session.consoleErrors.join(' | '));

  const failed = session.summary();
  await session.close();
  process.exit(failed > 0 ? 1 : 0);
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  await session.close();
  process.exit(1);
}
