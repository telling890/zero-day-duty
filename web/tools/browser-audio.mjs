#!/usr/bin/env node
/* 声音测试：用真实鼠标事件解锁 WebAudio，并用 AnalyserNode 验证确实有波形输出。 */
import { openSession, sleep } from './cdp.mjs';

const s = await openSession({ width: 1280, height: 800 });
let failures = 0;

function check(name, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? `：${detail}` : ''}`);
  if (!ok) failures += 1;
}

const center = (selector) => s.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

async function realClick(selector) {
  const point = await center(selector);
  if (!point) throw new Error(`找不到 ${selector}`);
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await sleep(320);
}

const peakOf = (name) => s.evaluate(`(async () => {
  const a = __zdd.audio;
  const data = new Float32Array(a.analyser.fftSize);
  let peak = 0;
  a.play(${JSON.stringify(name)});
  const deadline = performance.now() + 700;
  await new Promise((resolve) => {
    const tick = () => {
      a.analyser.getFloatTimeDomainData(data);
      for (const v of data) peak = Math.max(peak, Math.abs(v));
      if (performance.now() > deadline) resolve(); else requestAnimationFrame(tick);
    };
    tick();
  });
  return Math.round(peak * 1000) / 1000;
})()`);

const audioState = () => s.evaluate(`(() => {
  const a = __zdd.audio;
  return {
    muted: a.muted,
    ctx: a.ctx ? a.ctx.state : null,
    master: a.master ? Math.round(a.master.gain.value * 100) / 100 : null,
    menuText: document.getElementById('menu-mute').textContent,
    menuPressed: document.getElementById('menu-mute').getAttribute('aria-pressed'),
    topbarText: document.getElementById('btn-mute').textContent,
  };
})()`);

check('初始状态为未静音', (await audioState()).menuText.includes('开'));

await realClick('#menu-start');
const started = await audioState();
check('真实点击后 AudioContext 运行', started.ctx === 'running', JSON.stringify(started));
check('主菜单音效开关显示为开', started.menuText.includes('开'));

const successPeak = await peakOf('success');
check('success 音效有波形输出', successPeak > 0.05, `peak=${successPeak}`);
const alertPeak = await peakOf('alert');
check('alert 音效有波形输出', alertPeak > 0.05, `peak=${alertPeak}`);

await s.click('[data-act="briefing-enter"]');
await sleep(300);

await realClick('#btn-mute');
const muted = await audioState();
check('点击后进入静音', muted.muted === true && muted.master === 0, JSON.stringify(muted));
check('顶栏按钮显示为关', muted.topbarText.includes('关'), muted.topbarText);
const mutedPeak = await peakOf('alert');
check('静音时没有波形输出', mutedPeak === 0, `peak=${mutedPeak}`);

await realClick('#btn-pause');
await realClick('[data-act="test-sound"]');
await sleep(400);
const afterTest = await audioState();
check('播放测试音会自动解除静音', afterTest.muted === false, JSON.stringify(afterTest));
const testPeak = await peakOf('upgrade');
check('测试音后仍有波形输出', testPeak > 0.05, `peak=${testPeak}`);

// 真实点击一个操作按钮，确认动作音效链路
await s.click('[data-act="pause-resume"]');
await sleep(200);
await s.click('.alert-row');
await sleep(200);
await s.clickText('.act', '调查告警');
await sleep(500);
const messages = await s.evaluate(`Array.from(document.querySelectorAll('#messages .msg')).map((el) => el.textContent)`);
check('游戏内音效状态提示存在', messages.some((text) => text.includes('音效')), JSON.stringify(messages));
check('控制台无异常', s.pageErrors.length === 0 && s.consoleErrors.length === 0, JSON.stringify([s.pageErrors, s.consoleErrors]));

console.log(failures === 0 ? '\n声音测试全部通过' : `\n${failures} 项失败`);
await s.close();
process.exit(failures === 0 ? 0 : 1);
