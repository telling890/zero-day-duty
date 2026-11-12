#!/usr/bin/env node
/**
 * 自动化剧本面板的浏览器测试。
 * 覆盖：面板打开、默认模板、运行完整处置链、单步、语法错误、本地保存、
 * C 热键开关、手机布局与横向溢出、控制台异常。
 *
 * 用法：node tools/browser-script.mjs
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
  await sleep(160);
}

async function startGame() {
  await session.click('#menu-start');
  await sleep(260);
  await session.click('[data-act="briefing-enter"]');
  await sleep(320);
}

async function setCode(code) {
  await session.evaluate(`(() => {
    const editor = document.getElementById('script-code');
    editor.value = ${JSON.stringify(code)};
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

try {
  await startGame();
  session.check('顶栏有脚本按钮', await session.evaluate(`!!document.getElementById('btn-script')`));

  await session.click('#btn-script');
  await sleep(350);
  session.check('脚本面板打开', await session.evaluate(`!document.getElementById('script').hidden`));
  session.check(
    '默认载入巡检模板',
    (await session.evaluate(`document.getElementById('script-code').value`)).includes('for a in alerts()'),
  );
  session.check('编辑器有行号', (await session.evaluate(`document.querySelectorAll('#script-gutter [data-line]').length`)) >= 5);
  session.check(
    '面板顶部显示 AP/资金',
    (await session.evaluate(`document.getElementById('script-meta').textContent`)).includes('AP'),
  );
  session.check(
    '代码语法高亮生效',
    await session.evaluate(`document.querySelectorAll('#script-highlight .k').length > 0 && document.querySelectorAll('#script-highlight .a').length > 0`),
  );
  await session.screenshot('script-open');

  // 真实键入中文注释与字符串，检查高亮镜像
  await session.evaluate(`(() => {
    const editor = document.getElementById('script-code');
    editor.focus();
    editor.setSelectionRange(0, editor.value.length);
  })()`);
  await session.send('Input.insertText', { text: '# 注释\nprint("嗨")' });
  await sleep(220);
  const typed = await session.evaluate(`(() => ({
    value: document.getElementById('script-code').value,
    mirror: document.getElementById('script-highlight').textContent,
    comments: document.querySelectorAll('#script-highlight .c').length,
    builtins: document.querySelectorAll('#script-highlight .b').length,
  }))()`);
  session.check('键入中文注释与字符串', typed.value.includes('# 注释') && typed.value.includes('print("嗨")'));
  session.check('高亮镜像与源码一致', typed.mirror === typed.value, JSON.stringify(typed));
  session.check('注释和内置函数被着色', typed.comments > 0 && typed.builtins > 0);
  await session.screenshot('script-typed');

  // 运行完整处置链
  await setCode([
    'scan("PC-01")',
    'isolate("PC-01")',
    'clean("PC-01")',
    'release("PC-01")',
  ].join('\n'));
  await session.click('#script-run');
  await sleep(2600);
  const runState = await session.evaluate(`(() => ({
    running: __zdd.script.running,
    status: document.getElementById('script-status').textContent,
    console: document.getElementById('script-console').textContent,
    count: document.getElementById('script-count').textContent,
    investigated: __zdd.game.orderedAlerts.some((a) => a.investigated),
    eradicated: __zdd.game.events.events.some((e) => e.eradicated),
    isolated: __zdd.game.devices['PC-01'].isolated,
    ap: __zdd.game.player.actionPoints,
    readOnly: document.getElementById('script-code').readOnly,
  }))()`);
  session.check('脚本执行调查', runState.investigated);
  session.check('脚本执行清除', runState.eradicated);
  session.check('脚本解除隔离', !runState.isolated);
  session.check('脚本执行 4 个操作', runState.count === '4 个操作', runState.count);
  session.check('脚本完成且停止', runState.status === '完成' && !runState.running);
  session.check('脚本耗尽行动点', runState.ap === 0, String(runState.ap));
  session.check('运行结束后编辑器解锁', !runState.readOnly);
  session.check('控制台有完成汇总', runState.console.includes('脚本完成：共执行 4 个操作'));
  await session.screenshot('script-done');

  // 重新开一局，测试单步
  await session.reload();
  await sleep(400);
  await startGame();
  await session.click('#btn-script');
  await sleep(300);
  await setCode([
    'print("开始单步")',
    'scan("PC-01")',
    'print("单步完成")',
  ].join('\n'));
  await session.click('#script-step');
  await sleep(500);
  const stepState = await session.evaluate(`(() => ({
    awaiting: __zdd.script.awaitingStep,
    status: document.getElementById('script-status').textContent,
    stepText: document.getElementById('script-step').textContent,
    investigated: __zdd.game.orderedAlerts.some((a) => a.investigated),
  }))()`);
  session.check('单步在操作后暂停', stepState.awaiting === true && stepState.status.includes('等待'));
  session.check('单步按钮变为下一步', stepState.stepText === '下一步', stepState.stepText);
  session.check('单步已执行调查', stepState.investigated === true);

  await session.click('#script-step');
  await sleep(700);
  const stepDone = await session.evaluate(`(() => ({
    status: document.getElementById('script-status').textContent,
    console: document.getElementById('script-console').textContent,
  }))()`);
  session.check('再次单步后完成', stepDone.status === '完成', stepDone.status);
  session.check('单步输出结束行', stepDone.console.includes('单步完成'));

  // 语法错误
  await setCode('if x\n    print(1)');
  await session.click('#script-run');
  await sleep(400);
  const syntax = await session.evaluate(`(() => ({
    status: document.getElementById('script-status').textContent,
    console: document.getElementById('script-console').textContent,
    errorLine: !!document.querySelector('#script-gutter .error'),
    runDisabled: document.getElementById('script-run').disabled,
  }))()`);
  session.check('语法错误状态', syntax.status === '语法错误', syntax.status);
  session.check('语法错误提示缺少冒号', syntax.console.includes('冒号'));
  session.check('错误行在行号栏标红', syntax.errorLine === true);
  session.check('语法错误后可以重新运行', syntax.runDisabled === false);

  // next() 连续推进，遇到剧情决策自动暂停并关闭剧本
  await setCode('next()\nnext()\nnext()\nprint("不会执行到这里")');
  await session.click('#script-run');
  await sleep(2200);
  const decision = await session.evaluate(`(() => ({
    pending: Boolean(__zdd.game.pendingDecision),
    hidden: document.getElementById('script').hidden,
    turn: __zdd.game.turn,
    status: document.getElementById('script-status').textContent,
  }))()`);
  session.check('脚本连续推进到第 4 回合', decision.turn === 4, String(decision.turn));
  session.check('遇到剧情决策自动暂停', decision.pending === true && decision.status === '等待决策');
  session.check('决策出现时收起剧本面板', decision.hidden === true);
  await session.reload();
  await sleep(450);
  await startGame();

  // C 热键打开、Esc 关闭
  await press('c', 'KeyC', 67);
  await sleep(300);
  session.check('C 键打开脚本', await session.evaluate(`!document.getElementById('script').hidden`));
  await press('Escape', 'Escape', 27);
  await sleep(300);
  session.check('Esc 键关闭脚本', await session.evaluate(`document.getElementById('script').hidden`));

  // 保存到 localStorage，刷新后仍然存在
  await session.click('#btn-script');
  await sleep(300);
  await setCode('print("saved-marker")');
  await sleep(450);
  const stored = await session.evaluate(`localStorage.getItem('zdd.script.v1')`);
  session.check('脚本写入本地存储', stored && stored.includes('saved-marker'));

  await session.reload();
  await sleep(400);
  await startGame();
  await session.click('#btn-script');
  await sleep(300);
  session.check(
    '刷新后恢复脚本',
    (await session.evaluate(`document.getElementById('script-code').value`)).includes('saved-marker'),
  );

  // 手机布局
  await session.resize(390, 844, true);
  await sleep(300);
  await session.evaluate(`__zdd.script.open()`);
  await sleep(300);
  const mobile = await session.evaluate(`(() => {
    const dock = document.querySelector('.script-dock').getBoundingClientRect();
    const button = document.getElementById('btn-script').getBoundingClientRect();
    return {
      dockWidth: Math.round(dock.width),
      vw: innerWidth,
      buttonRight: Math.round(button.right),
      overflowing: document.documentElement.scrollWidth > innerWidth + 2,
    };
  })()`);
  session.check('手机端剧本全宽', mobile.dockWidth >= mobile.vw - 2, JSON.stringify(mobile));
  session.check('手机端脚本按钮在屏幕内', mobile.buttonRight <= mobile.vw + 1, JSON.stringify(mobile));
  session.check('手机端无横向溢出', mobile.overflowing === false, JSON.stringify(mobile));
  await session.screenshot('script-mobile');
  await session.evaluate(`__zdd.script.close()`);
  await sleep(200);

  session.check('剧本测试无页面异常', session.pageErrors.length === 0, session.pageErrors.join(' | '));
  session.check('剧本测试无 console.error', session.consoleErrors.length === 0, session.consoleErrors.join(' | '));

  const failed = session.summary();
  await session.close();
  process.exit(failed > 0 ? 1 : 0);
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  await session.close();
  process.exit(1);
}
