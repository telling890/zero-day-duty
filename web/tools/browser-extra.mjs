#!/usr/bin/env node
/* 追加测试：购买加固、历史排行榜、移动端弹层、整局模拟、HTTP 托管。 */
import { openSession } from './cdp.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// 启动一个静态服务器，验证 http:// 下也能正常运行
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = normalize(urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
  const file = join(root, relative);
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
const port = server.address().port;

const session = await openSession({ width: 1280, height: 800, page: join(root, 'index.html') });
const {
  evaluate, screenshot, click, clickText, resize, reload, check, summary, close,
  pageErrors, consoleErrors,
} = session;

try {
  await click('#menu-start');
  await click('[data-act="briefing-enter"]');

  // ============================ 购买加固 ============================
  await click('#btn-pause-2');
  await click('[data-act="pause-shop"]');
  const beforeFunds = await evaluate(`__zdd.game.player.funds`);
  await click('[data-upgrade="log_plugin"]');
  await sleep(250);
  check('购买加固后预算减少', (await evaluate(`__zdd.game.player.funds`)) === beforeFunds - 150);
  check('加固卡片变为已启用', (await evaluate(`document.querySelector('[data-upgrade="log_plugin"]') === null`)));
  await screenshot('20-shop-bought');
  await click('[data-act="shop-close"]');
  check('关闭商店回到暂停', await evaluate(`!!document.querySelector('[data-act="pause-resume"]')`));
  await click('[data-act="pause-resume"]');

  // ============================ 整局模拟 ============================
  const result = await evaluate(`(() => {
    const g = __zdd.game;
    let guard = 0;
    while (g.state === 'playing' && guard < 30) {
      if (g.pendingDecision) g.chooseDecision(0);
      g.endTurn();
      guard += 1;
    }
    return { state: g.state, turn: g.turn, score: g.report && g.report.score, grade: g.report && g.report.grade, ending: g.report && g.report.endingTitle };
  })()`);
  check('整局可正常结算', result.state === 'result' && typeof result.score === 'number', JSON.stringify(result));
  await screenshot('21-result-full');
  check('结算显示结局', await evaluate(`!!document.querySelector('.ending-title')`));

  // ============================ 历史排行榜 ============================
  await click('[data-act="result-menu"]');
  await sleep(300);
  await click('#menu-history');
  await sleep(300);
  check('历史排行榜有记录', (await evaluate(`document.querySelectorAll('.history-table tbody tr').length`)) >= 1);
  await screenshot('22-history');
  await click('[data-act="history-close"]');

  // ============================ 移动端弹层 ============================
  await resize(390, 844, true);
  await reload();
  await click('#menu-start');
  await sleep(300);
  await screenshot('23-mobile-briefing');
  check('移动端简报按钮可见', await evaluate(`(() => { const r = document.querySelector('[data-act="briefing-enter"]').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })()`));
  await click('[data-act="briefing-enter"]');
  await click('.alert-row');
  await sleep(500);
  check('移动端选中告警后滚到操作面板', await evaluate(`(() => { const r = document.querySelector('.panel-actions').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })()`));
  await screenshot('24-mobile-actions-open');
  await click('#btn-pause-2');
  await evaluate(`document.querySelector('[data-act="pause-shop"]').click()`);
  await sleep(300);
  await screenshot('25-mobile-shop');
  check('移动端商店可用', await evaluate(`document.querySelectorAll('.up-card').length === 7`));
  await click('[data-act="shop-close"]');
  await sleep(200);
  await screenshot('26-mobile-pause');

  // ============================ HTTP 托管 ============================
  const httpSession = await openSession({ width: 1280, height: 800, page: join(root, 'index.html') });
  const httpUrl = `http://127.0.0.1:${port}/`;
  await httpSession.send('Page.navigate', { url: httpUrl });
  await sleep(1200);
  const httpReady = await httpSession.evaluate(`document.readyState === 'complete' && document.getElementById('metrics').children.length > 0`);
  check('HTTP 静态托管可加载', httpReady);
  await httpSession.click('#menu-start');
  await httpSession.click('[data-act="briefing-enter"]');
  check('HTTP 下可开始游戏', (await httpSession.evaluate(`__zdd.game.state`)) === 'playing');
  await httpSession.screenshot('27-http-playing');
  await httpSession.close();

  check('控制台无异常', pageErrors.length === 0, pageErrors.join(' | '));
  check('无 console.error', consoleErrors.length === 0, consoleErrors.join(' | '));

  const failed = summary();
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  console.error('页面异常：', pageErrors);
  await close();
  server.close();
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
