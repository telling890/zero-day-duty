/* 无浏览器逻辑测试：直接加载经典脚本，在 Node 里跑回合与操作。
 * 运行：node tests/logic.test.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

require(`${root}/js/data/game-data.js`);
require(`${root}/js/core/rng.js`);
require(`${root}/js/core/models.js`);
require(`${root}/js/core/log.js`);
require(`${root}/js/core/services.js`);
require(`${root}/js/core/upgrades.js`);
require(`${root}/js/core/risk.js`);
require(`${root}/js/core/events.js`);
require(`${root}/js/core/actions.js`);
require(`${root}/js/core/score.js`);
require(`${root}/js/core/save.js`);
require(`${root}/js/core/difficulty.js`);
require(`${root}/js/core/game.js`);

const ZDD = globalThis.ZDD;
const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function newGame(seed = 2024, tutorial = false, difficulty = 'standard') {
  const game = new ZDD.Game({ data: ZDD.data, seed, storage: memoryStorage() });
  game.newGame({ tutorial, briefing: false, difficulty });
  return game;
}

function logsText(game) {
  return game.logs.entries.map((entry) => entry.message).join('\n');
}

function investigateReal(game) {
  const alert = game.events.alerts.find((item) => !item.falsePositive);
  game.selectAlert(alert);
  game.performAction(
    game.actions.optionsFor(game, game.currentTarget()).find((o) => o.actionId === 'investigate'),
    game.currentTarget(),
  );
}

test('数据加载：8 台设备、6 条事件、6 项服务、7 个加固', () => {
  const game = new GameForData();
  assert.equal(Object.keys(game.devices).length, 8);
  assert.equal(game.events.eventConfigs.length, 6);
  assert.equal(game.services.configs.length, 6);
  assert.equal(game.upgradeTree.upgrades.length, 7);
});

function GameForData() {
  return new ZDD.Game({ data: ZDD.data, seed: 1, storage: memoryStorage() });
}

test('开局：第 1 回合、22:00、行动点 6、有 1 条告警', () => {
  const game = newGame();
  assert.equal(game.turn, 1);
  assert.equal(ZDD.clockText(1), '22:00');
  assert.equal(game.player.actionPoints, 6);
  assert.ok(game.events.alerts.length >= 1);
  assert.equal(game.state, 'playing');
});

test('同种子排期可复现，不同种子会打乱', () => {
  const a = newGame(777);
  const b = newGame(777);
  assert.deepEqual(a.events.spawnSchedule, b.events.spawnSchedule);
  const c = newGame(778);
  assert.notDeepEqual(a.events.spawnSchedule, c.events.spawnSchedule);
  assert.equal(a.events.spawnSchedule['EVT-PHISH-01'], 1);
  assert.equal(a.events.spawnSchedule['EVT-ZERODAY-06'], 8);
});

test('调查前无法删除邮件；调查后可以', () => {
  const game = newGame();
  const alert = game.events.alerts.find((item) => !item.falsePositive);
  const target = new ZDD.models.Target('alert', alert, game.devices[alert.targetId]);
  const options = game.actions.optionsFor(game, target);
  const mail = options.find((option) => option.actionId === 'delete_mail');
  assert.equal(mail.enabled, false);
  assert.match(mail.reason, /调查/);

  const investigate = options.find((option) => option.actionId === 'investigate');
  const result = game.performAction(investigate, target);
  assert.equal(result.success, true);
  assert.equal(alert.investigated, true);

  const after = game.actions.optionsFor(game, target);
  const mailAfter = after.find((option) => option.actionId === 'delete_mail');
  assert.equal(mailAfter.enabled, true);
});

test('完整处置链：调查 → 隔离 → 清除 → 解除隔离', () => {
  const game = newGame(2024, true);
  const alert = game.events.alerts.find((item) => item.eventId);
  game.selectAlert(alert);
  const target = game.currentTarget();

  const run = (actionId) => {
    const option = game.actions.optionsFor(game, game.currentTarget()).find((o) => o.actionId === actionId);
    assert.ok(option, `缺少操作 ${actionId}`);
    assert.equal(option.enabled, true, `${actionId} 应可用：${option.reason}`);
    return game.performAction(option, game.currentTarget());
  };

  run('investigate');
  const isolateResult = run('isolate');
  assert.equal(isolateResult.success, true);
  const event = game.events.getEvent(alert.eventId);
  assert.equal(event.contained, true);
  assert.equal(event.eradicated, false);

  run('eradicate');
  assert.equal(event.eradicated, true);
  assert.equal(game.combo, 1);
  assert.ok(game.player.security > 74);

  run('unisolate');
  assert.equal(game.devices[event.activeDeviceId].isolated, false);
});

test('误报调查不涨安全度，也不会关告警', () => {
  const game = newGame();
  const alert = game.events.alerts.find((item) => item.falsePositive);
  assert.ok(alert, '第 1 回合应出现误报');
  game.selectAlert(alert);
  const option = game.actions.optionsFor(game, game.currentTarget()).find((o) => o.actionId === 'investigate');
  const result = game.performAction(option, game.currentTarget());
  assert.equal(result.success, true);
  assert.equal(alert.verdict, '误报');
  assert.equal(alert.resolved, false);
});

test('隔离无事件设备算误封：声誉下降、连击中断', () => {
  const game = newGame();
  const device = game.devices['PC-02'];
  game.selectDevice(device.deviceId);
  const option = game.actions.optionsFor(game, game.currentTarget()).find((o) => o.actionId === 'isolate');
  const before = game.player.reputation;
  const result = game.performAction(option, game.currentTarget());
  assert.equal(result.success, false);
  assert.ok(game.player.reputation < before);
  assert.equal(game.player.stats.false_isolations, 1);
});

test('回合推进：攻击阶段上升、行动点重置', () => {
  const game = newGame(2024, true);
  const event = game.events.events[0];
  const stage = event.stageIndex;
  game.endTurn();
  assert.equal(game.turn, 2);
  assert.equal(game.player.actionPoints, 6);
  assert.ok(event.stageIndex > stage || event.contained);
});

test('服务可用性随隔离下降，解除后回升', () => {
  const game = newGame();
  const device = game.devices['WEB-01'];
  game.selectDevice(device.deviceId);
  const isolate = game.actions.optionsFor(game, game.currentTarget()).find((o) => o.actionId === 'isolate');
  game.performAction(isolate, game.currentTarget());
  const low = game.player.availability;
  assert.ok(low < 100);
  const unisolate = game.actions.optionsFor(game, game.currentTarget()).find((o) => o.actionId === 'unisolate');
  game.performAction(unisolate, game.currentTarget());
  assert.ok(game.player.availability > low);
});

test('加固：预算不足与专精互斥', () => {
  const game = newGame();
  game.player.funds = 1200;
  assert.equal(game.buyUpgrade('log_plugin')[0], true);
  assert.equal(game.buyUpgrade('threat_intel')[0], true);
  const blocked = game.buyUpgrade('playbook');
  assert.equal(blocked[0], false);
  assert.match(blocked[1], /互斥/);
});

test('剧情决策：第 4 回合弹出并影响指标', () => {
  const game = newGame();
  // 先把首回合钓鱼事件按住，避免放着不管在第 3 回合就被战役收尾
  const alert = game.events.alerts.find((item) => item.eventId);
  game.selectAlert(alert);
  const isolate = game.actions.optionsFor(game, game.currentTarget()).find((o) => o.actionId === 'isolate');
  game.performAction(isolate, game.currentTarget());
  while (game.turn < 4 && game.state === 'playing') game.endTurn();
  assert.equal(game.state, 'playing');
  assert.ok(game.pendingDecision, '第 4 回合应出现决策');
  const before = game.player.availability;
  const effects = game.pendingDecision.choices[0].effects;
  game.chooseDecision(0);
  assert.equal(game.pendingDecision, null);
  assert.equal(game.player.availability, before + Number(effects.availability || 0));
});

test('存档/读档往返：回合、指标、告警、随机数状态保持一致', () => {
  const game = newGame(4321);
  const alert = game.events.alerts.find((item) => item.eventId);
  game.selectAlert(alert);
  game.performAction(game.actions.optionsFor(game, game.currentTarget())[0], game.currentTarget());
  game.endTurn();
  assert.equal(game.saveGame(), true);

  const turn = game.turn;
  const security = game.player.security;
  const alerts = game.events.alerts.length;
  const rngState = game.rng.getState();

  game.newGame();
  assert.equal(game.loadGame(), true);
  assert.equal(game.turn, turn);
  assert.equal(game.player.security, security);
  assert.equal(game.events.alerts.length, alerts);
  assert.equal(game.rng.getState(), rngState);
  assert.equal(game.state, 'playing');
});

test('结算：10 回合后给出报告并写入历史', () => {
  const game = newGame(99);
  let guard = 0;
  while (game.state === 'playing' && guard < 40) {
    if (game.pendingDecision) game.chooseDecision(0);
    game.endTurn();
    guard += 1;
  }
  assert.equal(game.state, 'result');
  assert.ok(game.report);
  assert.ok(game.report.score >= 0 && game.report.score <= 130);
  assert.ok(game.report.grade);
  assert.ok(game.saveManager.loadHistory().length >= 1);
});

test('攻击战役：同源事件出现后会被揭示', () => {
  const game = newGame(2024);
  let revealed = false;
  let guard = 0;
  while (!revealed && guard < 12) {
    if (game.pendingDecision) game.chooseDecision(0);
    game.endTurn();
    guard += 1;
    revealed = game.events.campaignStatus().some((item) => item.revealed);
    if (game.state !== 'playing') break;
  }
  assert.equal(revealed, true);
});

test('风险区间随调查收窄', () => {
  const game = newGame(2024, true);
  const event = game.events.events[0];
  const device = game.devices[event.activeDeviceId];
  const [low1, high1] = game.risk.estimate(event, device, game.turn, 0);
  const alert = game.events.alerts.find((item) => item.eventId === event.eventId);
  game.selectAlert(alert);
  game.performAction(
    game.actions.optionsFor(game, game.currentTarget()).find((o) => o.actionId === 'investigate'),
    game.currentTarget(),
  );
  const [low2, high2] = game.risk.estimate(event, device, game.turn, 0);
  assert.ok(high2 - low2 < high1 - low1);
});

test('难度：三档信息质量不同且默认标准', () => {
  const novice = newGame(2024, false, 'novice');
  const standard = newGame(2024, false, 'standard');
  const expert = newGame(2024, false, 'expert');
  assert.deepEqual(novice.difficultySet.modes.map((mode) => mode.id), ['novice', 'standard', 'expert']);

  investigateReal(novice);
  assert.match(logsText(novice), /建议处置：/);
  assert.match(logsText(novice), /预测下一跳：/);

  investigateReal(standard);
  assert.match(logsText(standard), /处置方向：/);
  assert.doesNotMatch(logsText(standard), /建议处置：/);
  assert.doesNotMatch(logsText(standard), /预测下一跳：/);

  investigateReal(expert);
  assert.match(logsText(expert), /处置建议：证据不足/);
  assert.match(logsText(expert), /下一跳：证据不足/);
  assert.match(logsText(expert), /未验证：/);
  assert.equal(expert.difficultyId, 'expert');
});

test('决策：隐藏安全影响 + 1–3 回合延迟 + 三选一', () => {
  const game = newGame();
  game.turn = 4;
  game.maybeTriggerDecision();
  assert.ok(game.pendingDecision);
  assert.ok(!game.pendingDecision.choices[0].hint.includes('安全'));
  game.chooseDecision(0);
  assert.equal(game.pendingDelayed.length, 1);
  assert.equal(game.pendingDelayed[0].dueTurn, 6);
  game.turn = 6;
  game.processDelayedEffects();
  assert.equal(game.pendingDelayed.length, 0);
  assert.match(logsText(game), /延迟后果/);

  game.turn = 5;
  game.pendingDecision = null;
  game.maybeTriggerDecision();
  assert.equal(game.pendingDecision.id, 'service_tradeoff');
  assert.equal(game.pendingDecision.choices.length, 3);
  game.chooseDecision(2);
  assert.equal(game.pendingDelayed[0].dueTurn, 7);
});

test('存档：难度、延迟后果与时间线可往返，旧存档有默认值', () => {
  const storage = memoryStorage();
  const game = new ZDD.Game({ data: ZDD.data, seed: 2024, storage });
  game.newGame({ difficulty: 'expert' });
  game.turn = 4;
  game.maybeTriggerDecision();
  game.chooseDecision(0);
  assert.equal(game.saveGame(), true);
  const other = new ZDD.Game({ data: ZDD.data, seed: 2024, storage });
  other.newGame({ difficulty: 'standard' });
  assert.equal(other.loadGame(), true);
  assert.equal(other.difficultyId, 'expert');
  assert.equal(other.pendingDelayed.length, 1);
  assert.ok(other.timeline.length > 0);

  const raw = JSON.parse(other.saveManager.read('zdd.savegame.v1'));
  delete raw.difficulty;
  delete raw.timeline;
  delete raw.pending_delayed;
  delete raw.decision_history;
  other.saveManager.write('zdd.savegame.v1', JSON.stringify(raw));
  assert.equal(other.loadGame(), true);
  assert.equal(other.difficultyId, 'standard');
  assert.equal(other.pendingDelayed.length, 0);
});

test('攻击者：夜鸦在隔离面足够大时等待并留下线索', () => {
  const game = newGame();
  game.devices['WEB-01'].isolate();
  game.devices['DB-01'].isolate();
  const event = game.events.events[0];
  const stage = event.stageIndex;
  for (let i = 0; i < 3; i += 1) game.events.advanceCampaigns(game);
  assert.ok(game.events.campaignRuntime['CAM-NIGHTJACK'].waits >= 1);
  assert.equal(event.stageIndex, stage);
  assert.match(logsText(game), /活动强度突然下降/);
  assert.ok(game.timeline.some((item) => item.kind === 'actor_wait'));
});

test('攻击者：灰烬从已补丁目标转向并留下探测线索', () => {
  const game = newGame();
  const webConfig = game.events.getEventConfig('EVT-WEB-04');
  const web = new ZDD.models.SecurityEvent(webConfig, 3);
  web.campaignId = 'CAM-CINDER';
  game.events.events.push(web);
  game.events.spawnedEventIds.add(web.eventId);
  game.devices['WEB-01'].patched = true;
  const bossConfig = JSON.parse(JSON.stringify(game.events.getEventConfig('EVT-ZERODAY-06')));
  bossConfig.stages[0].active_device = 'DB-01';
  const boss = new ZDD.models.SecurityEvent(bossConfig, 8);
  boss.campaignId = 'CAM-CINDER';
  game.events.events.push(boss);
  game.events.spawnedEventIds.add(boss.eventId);
  game.devices['DB-01'].patched = false;
  game.turn = 8;
  for (let i = 0; i < 2; i += 1) game.events.advanceCampaigns(game);
  assert.equal(game.events.campaignRuntime['CAM-CINDER'].lastSwitch, boss.eventId);
  assert.match(logsText(game), /转向/);
  assert.ok(game.timeline.some((item) => item.kind === 'actor_switch'));
});

test('专家模式日志延迟一个回合出现', () => {
  const game = newGame(2024, false, 'expert');
  assert.ok(game.events.pendingLogs.length > 0);
  assert.doesNotMatch(logsText(game), /邮件网关记录/);
  game.startTurn();
  assert.match(logsText(game), /\[延迟到达\]/);
});

test('结算：时间线复盘来自真实记录，流派来自加固线', () => {
  const game = newGame();
  game.buyUpgrade('log_plugin');
  game.buyUpgrade('threat_intel');
  investigateReal(game);
  assert.equal(game.doctrine(), '情报主导型');
  game.turn = 10;
  game.finish('time');
  assert.ok(game.report);
  assert.ok(game.report.timeline.length > 0);
  assert.ok(game.report.review.keyCorrect);
  assert.ok(game.report.review.keyMistake);
  assert.equal(game.report.doctrine, '情报主导型');
});

let passed = 0;
const failures = [];
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push([name, error]);
    console.log(`  ✗ ${name}\n    ${error && error.stack ? error.stack.split('\n')[1] : error}`);
  }
}
console.log(`\n${passed}/${tests.length} 通过`);
if (failures.length) {
  for (const [name, error] of failures) {
    console.error(`\n失败：${name}\n${error && error.stack ? error.stack : error}`);
  }
  process.exit(1);
}
