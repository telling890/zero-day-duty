/* 游戏主控制器：状态机、回合流程、指标结算。
 * 与桌面版 game.py 对齐，不依赖 DOM，方便 Node 里跑逻辑测试。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});
  const { Device, PlayerState, Target } = ZDD.models;
  const { RNG, clockText, consts } = ZDD;

  const noopAudio = {
    play() {},
    playAmbient() {},
    stopAmbient() {},
    toggleMute() {
      return false;
    },
    get muted() {
      return false;
    },
    get stateText() {
      return '音效未知';
    },
  };

  const noopEffects = {
    flash() {},
    addFloater() {},
    addBanner() {},
    addCombo() {},
    addBurst() {},
    showFeedback() {},
  };

  class Game {
    constructor(options) {
      const opts = options || {};
      const data = opts.data || ZDD.data;
      if (!data) throw new Error('缺少游戏数据，请先加载 js/data/game-data.js');

      this.seed = Number(opts.seed ?? ZDD.randomSeed());
      this.deviceConfigs = (data.devices && data.devices.devices) || [];
      if (!Array.isArray(this.deviceConfigs) || !this.deviceConfigs.length) {
        throw new Error('devices.json 缺少设备列表');
      }
      this.eventPayload = data.events || {};
      this.services = new ZDD.ServiceManager(data.services);
      this.upgradeTree = new ZDD.UpgradeTree(data.upgrades);
      this.decisions = ((data.decisions && data.decisions.decisions) || []).filter(
        (item) => item && item.id,
      );
      this.saveManager = new ZDD.SaveManager(opts.storage);

      this.actions = new ZDD.ActionManager();
      this.risk = new ZDD.RiskEngine();
      this.scoreSystem = new ZDD.ScoreSystem();
      this.rng = new RNG(this.seed);
      this.player = new PlayerState();
      this.devices = {};
      for (const config of this.deviceConfigs) this.devices[String(config.id)] = Device.fromConfig(config);
      this.logs = new ZDD.LogSystem();
      this.events = new ZDD.EventManager(this.eventPayload, this.rng, this.logs, false);

      this.state = 'menu';
      this.turn = 0;
      this.selectedDeviceId = null;
      this.selectedAlert = null;
      this.messages = [];
      this.dataLeak = false;
      this.ransomwareFailed = false;
      this.securityBreach = false;
      this.lowAvailabilityTurns = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.seenDecisions = new Set();
      this.tutorialMode = false;
      this.report = null;
      this.pendingDecision = null;
      this.showBriefing = false;
      this.revision = 0;

      this.audio = noopAudio;
      this.effects = noopEffects;
      this.onActionFeedback = null;
      this.onAlert = null;

      this.logs.add(0, clockText(0), '系统', '监控中心启动，等待值班员开始游戏。');
    }

    // ==================================================================
    // 初始化
    // ==================================================================
    newGame(options) {
      const opts = options || {};
      const tutorial = Boolean(opts.tutorial);
      const briefing = Boolean(opts.briefing);

      this.rng = new RNG(this.seed);
      this.player = new PlayerState();
      this.devices = {};
      for (const config of this.deviceConfigs) this.devices[String(config.id)] = Device.fromConfig(config);
      this.services.views(this.devices); // 提前校验服务引用
      this.logs = new ZDD.LogSystem();
      this.tutorialMode = tutorial;
      this.events = new ZDD.EventManager(this.eventPayload, this.rng, this.logs, tutorial);
      this.turn = 0;
      this.selectedDeviceId = null;
      this.selectedAlert = null;
      this.messages = [];
      this.dataLeak = false;
      this.ransomwareFailed = false;
      this.securityBreach = false;
      this.lowAvailabilityTurns = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.seenDecisions = new Set();
      this.report = null;
      this.pendingDecision = null;
      this.showBriefing = briefing;
      this.state = 'playing';

      this.logs.add(
        0,
        clockText(0),
        '系统',
        `值班开始：${opts.companyName || '云栖示例科技（虚构）'}，随机种子 ${this.seed}。`,
      );
      this.audio.playAmbient();
      this.recomputeAvailability('开局网络状态');
      this.startTurn();
      this.pushMessage('提示：先看告警和日志，再决定隔离或删除邮件。', 'accent');
      this.pushMessage('主管·陈可：今晚客户在催交付，任何停服都要先报备。', 'dim');
      this.pushMessage('安全平台：告警等级在调查前显示为“待评估”，先调查再处置更稳。', 'dim');
      this.pushMessage('公关·林岚：如果媒体来问，先别擅自回应，把情况同步给我。', 'purple');
      this.pushMessage('IT 运维·阿哲：备份服务器在 BAK-01，别等数据库被加密才想起它。', 'orange');
      this.touch();
    }

    startTurn() {
      this.turn += 1;
      this.player.refreshTurn(this.turn);
      this.logs.add(
        this.turn,
        clockText(this.turn),
        '系统',
        `第 ${this.turn} 回合开始，行动点重置为 ${this.player.actionPoints}。`,
      );
      this.pushMessage(`第 ${this.turn} 回合开始（${clockText(this.turn)}），行动点已重置。`, 'accent');

      const serviceIncome = this.services.income(this.devices);
      const incomeBonus = Math.trunc(this.modifiers.income_bonus || 0);
      this.adjustMetric(
        'funds',
        serviceIncome + incomeBonus,
        `服务收入（SLA 结算，满额 ¥${consts.TURN_INCOME}）`
          + (incomeBonus ? ` + 多线路加固 ¥${incomeBonus}` : ''),
        false,
      );
      if (serviceIncome < consts.TURN_INCOME) {
        const lost = consts.TURN_INCOME - serviceIncome;
        this.logs.add(
          this.turn,
          clockText(this.turn),
          '系统',
          `SLA 结算：部分服务降级/中断，本回合收入减少 ¥${lost}。`,
        );
        this.pushMessage(`SLA 结算：服务未满负荷，收入 -¥${lost}。业务状态见左下角值班简报。`, 'orange');
      }
      this.adjustMetric('funds', -consts.TURN_UPKEEP, '值班运维成本', false);
      this.audio.play('turn');
      if (this.player.funds <= consts.FUNDS_WARN) {
        this.pushMessage('资金偏低：后续操作的可用选项会受限，请谨慎花费。', 'orange');
      }
      this.events.startTurn(this);
      this.maybeTriggerDecision();
      this.touch();
    }

    maybeTriggerDecision() {
      if (this.tutorialMode) return;
      if (this.state !== 'playing') return;
      for (const decision of this.decisions) {
        const decisionId = String(decision.id || '');
        if (!decisionId || this.seenDecisions.has(decisionId)) continue;
        const turn = Number(decision.turn ?? -1);
        if (!Number.isFinite(turn) || turn !== this.turn) continue;
        this.seenDecisions.add(decisionId);
        this.pendingDecision = decision;
        this.audio.play('alert');
        this.pushMessage(`紧急决策：${decision.title || ''}`, 'orange');
        return;
      }
    }

    endTurn() {
      if (this.state !== 'playing') return;
      this.events.advanceEvents(this);
      if (this.state !== 'playing') return;
      this.events.advanceCampaigns(this);
      if (this.state !== 'playing') return;
      for (const device of Object.values(this.devices)) device.tickMaintenance();
      this.recomputeAvailability('回合结算：设备状态更新');

      const outages = this.services.criticalOutages(this.devices);
      if (outages.length) {
        const names = outages.slice(0, 3).map((view) => view.config.shortName).join('、');
        const penalty = Math.min(3, outages.length);
        const mitigation = Math.trunc(this.modifiers.sla_reputation_mitigation || 0);
        const effective = Math.max(0, penalty - mitigation);
        if (effective) this.adjustMetric('reputation', -effective, `SLA 违约：${names}`, false);
        this.player.stats.sla_breaches = Number(this.player.stats.sla_breaches || 0) + 1;
        const detail = effective ? `声誉 -${effective}` : '多线路缓冲生效，声誉未受影响';
        this.logs.add(this.turn, clockText(this.turn), '系统', `SLA 违约：${names} 中断，${detail}。`);
        this.pushMessage(`SLA 违约：${names} 仍处于中断状态，${detail}。`, effective ? 'red' : 'orange');
      }

      if (this.player.availability <= consts.AVAILABILITY_FAIL) {
        this.lowAvailabilityTurns += 1;
        this.pushMessage(
          `警告：服务可用性 ${this.player.availability}% 低于 ${consts.AVAILABILITY_FAIL}%`
            + `（连续 ${this.lowAvailabilityTurns} 回合）。`,
          'orange',
        );
      } else {
        this.lowAvailabilityTurns = 0;
      }

      if (this.player.securityFailed()) {
        this.finish('security');
        return;
      }
      if (this.player.integrityFailed()) {
        this.finish('integrity');
        return;
      }
      if (this.lowAvailabilityTurns >= consts.AVAILABILITY_FAIL_TURNS) {
        this.finish('availability');
        return;
      }
      if (this.turn >= consts.TOTAL_TURNS) {
        this.finish('time');
        return;
      }
      this.startTurn();
    }

    finish(reason) {
      this.state = 'result';
      this.pendingDecision = null;
      this.showBriefing = false;
      this.audio.stopAmbient();
      const summary = this.buildSummary(reason);
      this.report = this.scoreSystem.evaluate(summary);
      if (!this.tutorialMode) this.saveManager.appendHistory(this.report, summary, this.seed);
      this.audio.play(this.report.endingKey === 'perfect' ? 'success' : 'fail');
      this.effects.flash(this.report.endingKey === 'perfect' ? 'green' : 'red', 55);
      this.logs.add(
        this.turn,
        clockText(this.turn),
        '系统',
        `值班结束，结局：${this.report.endingTitle}，得分 ${this.report.score}（${this.report.grade}）。`,
      );
      this.selectedAlert = null;
      this.touch();
    }

    finishTutorial(start) {
      this.tutorialMode = false;
      this.showBriefing = false;
      if (start) {
        this.newGame({ briefing: false });
      } else {
        this.audio.stopAmbient();
        this.state = 'menu';
        this.touch();
      }
    }

    buildSummary(reason) {
      const events = this.events.events;
      const resolved = events.filter((event) => event.eradicated);
      const controlledOnly = events.filter((event) => event.contained && !event.eradicated);
      const missed = events.filter((event) => !event.contained && !event.eradicated);
      const identified = events.filter((event) => event.investigations > 0);
      const responseTurns = this.player.stats.response_turns.slice();
      const average = responseTurns.length
        ? responseTurns.reduce((sum, value) => sum + value, 0) / responseTurns.length
        : 0;
      const campaigns = this.events.campaignStatus();
      return {
        reason,
        turn: this.turn,
        total_turns: this.player.totalTurns,
        security: this.player.security,
        funds: this.player.funds,
        reputation: this.player.reputation,
        availability: this.player.availability,
        integrity: this.player.integrity,
        total_events: events.length,
        resolved: resolved.length,
        controlled_only: controlledOnly.length,
        controlled_only_names: controlledOnly.map((event) => event.name),
        missed: missed.length,
        missed_names: missed.map((event) => event.name),
        identified: identified.length,
        response_turns: responseTurns,
        average_response: average,
        false_positives_seen: Number(this.player.stats.false_positives_seen || 0),
        false_positives_checked: Number(this.player.stats.false_positives_checked || 0),
        false_isolations: Number(this.player.stats.false_isolations || 0),
        data_leak: this.dataLeak,
        ransomware_failed: this.ransomwareFailed,
        security_breach: this.securityBreach,
        best_combo: this.bestCombo,
        service_availability: this.services.availability(this.devices),
        service_income: this.services.income(this.devices),
        sla_breaches: Number(this.player.stats.sla_breaches || 0),
        campaigns,
        campaigns_cleared: campaigns.filter(
          (item) => item.spawned && item.resolved === item.spawned,
        ).length,
      };
    }

    // ==================================================================
    // 指标与资源
    // ==================================================================
    get threatLevel() {
      const active = this.events.events.filter((event) => event.isActive).length;
      return Math.max(1, Math.min(5, 1 + active));
    }

    get threatMultiplier() {
      return 1 + 0.08 * (this.threatLevel - 1);
    }

    get modifiers() {
      return this.upgradeTree.modifiers(this.player.upgrades);
    }

    get confidenceBonus() {
      return Number(this.modifiers.confidence_bonus || 0);
    }

    buyUpgrade(upgradeId) {
      const item = this.upgradeTree.get(upgradeId);
      if (!item) return [false, '没有找到该加固项目'];
      const [allowed, reason] = this.upgradeTree.check(item, this.player.upgrades);
      if (!allowed) return [false, reason];
      const cost = Number(item.cost);
      if (this.player.funds < cost) return [false, `资金不足（需要 ¥${cost}）`];
      this.adjustMetric('funds', -cost, `购买安全加固「${item.name}」`, false);
      this.player.upgrades.add(upgradeId);
      this.audio.play('upgrade');
      this.effects.flash('green', 36);
      this.effects.addFloater(`加固完成：${item.name}`, 'green');
      this.pushMessage(
        `安全加固已启用：${item.name}（${this.upgradeTree.describe(item)}，-¥${cost}）。`,
        'green',
      );
      this.touch();
      return [true, `已启用「${item.name}」`];
    }

    chooseDecision(index) {
      const decision = this.pendingDecision;
      if (!decision) return;
      const choices = Array.isArray(decision.choices) ? decision.choices : [];
      if (!(index >= 0 && index < choices.length)) return;
      const choice = choices[index];
      if (!choice || typeof choice !== 'object') return;
      const label = String(choice.label || '选择');
      const effects = choice.effects || {};
      const allowedKeys = ['security', 'funds', 'reputation', 'availability', 'integrity'];
      for (const [key, value] of Object.entries(effects)) {
        if (!allowedKeys.includes(key)) continue;
        const delta = Number(value);
        if (!Number.isFinite(delta)) continue;
        this.adjustMetric(key, delta, `值班决策「${decision.title || ''}」`);
      }
      const result = String(choice.result || '');
      this.pushMessage(`决策：${label}。${result}`, 'accent');
      this.effects.addBanner(`决策：${label}`, result.slice(0, 46), 'orange');
      this.audio.play('click');
      this.pendingDecision = null;
      this.touch();
    }

    saveGame() {
      const [ok, message] = this.saveManager.save(this);
      this.audio.play(ok ? 'success' : 'fail');
      this.pushMessage(`${ok ? '存档成功：' : '存档失败：'}${message}`, ok ? 'green' : 'red');
      if (ok) this.effects.addFloater('进度已保存', 'green');
      this.touch();
      return ok;
    }

    loadGame() {
      const [ok, message] = this.saveManager.load(this);
      if (ok) {
        this.audio.play('success');
        this.effects.flash('accent', 36);
        this.effects.addBanner('读取存档', `第 ${this.turn} 回合，继续值班`, 'accent');
      } else {
        this.audio.play('fail');
        this.pushMessage(`读取失败：${message}`, 'red');
      }
      this.touch();
      return ok;
    }

    breakCombo(reason) {
      if (this.combo > 0) {
        this.pushMessage(`连击中断（${reason}）。`, 'orange');
        this.combo = 0;
      }
    }

    adjustMetric(key, delta, reason, push) {
      const actual = this.player.adjust(key, delta, reason);
      if (!actual) return 0;
      const label = ZDD.METRIC_LABELS[key] || key;
      this.logs.add(this.turn, clockText(this.turn), '系统', `${label} ${actual > 0 ? '+' : ''}${actual}（${reason}）`);
      if (push !== false) {
        this.pushMessage(`${label} ${actual > 0 ? '+' : ''}${actual}：${reason}`, actual > 0 ? 'green' : 'red');
      }
      if (actual <= -4) this.effects.flash('red', 36);
      this.touch();
      return actual;
    }

    spendResources(ap, money, reason) {
      if (!this.player.canPay(ap, money)) return false;
      this.player.actionPoints -= ap;
      if (money) this.adjustMetric('funds', -money, reason);
      return true;
    }

    recomputeAvailability(reason) {
      const value = this.services.availability(this.devices);
      const delta = value - this.player.availability;
      if (!delta) return;
      this.player.adjust('availability', delta, reason);
      this.logs.add(
        this.turn,
        clockText(this.turn),
        '系统',
        `${ZDD.METRIC_LABELS.availability} ${delta > 0 ? '+' : ''}${delta}（${reason}）`,
      );
      if (delta <= -5) this.pushMessage(`服务可用性 ${delta > 0 ? '+' : ''}${delta}：${reason}`, 'orange');
      this.touch();
    }

    // ==================================================================
    // 事件与选择
    // ==================================================================
    containEvent(event, method, options) {
      const opts = options || {};
      if (event.eradicated || event.contained) return;
      event.markContained(method, this.turn, opts.deviceId || '');
      if (event.responseTurn === null) {
        event.responseTurn = Math.max(1, this.turn - event.startTurn + 1);
        this.player.stats.response_turns.push(event.responseTurn);
      }
      for (const alert of this.events.alerts) {
        if (alert.eventId === event.eventId && !alert.resolved) {
          alert.markControlled(`已通过「${method}」控制，等待清除`);
        }
      }
      const device = this.devices[event.activeDeviceId];
      if (device && !device.isolated && ['感染', '可疑'].includes(device.status)) {
        device.setStatus('正常');
      }
      this.recomputeAvailability('事件控制后业务恢复');
      this.logs.add(
        this.turn,
        clockText(this.turn),
        '操作',
        `事件「${event.name}」已被控制，方式：${method}；根因尚未清除。`,
      );
      this.pushMessage(`「${event.name}」已控制，但还没清除。选择相关设备执行「清除威胁」。`, 'yellow');
      this.audio.play('click');
      this.effects.flash('yellow', 24);
      this.effects.addFloater('已控制 · 待清除', 'yellow');
      this.effects.addBurst('center', 'yellow', 10);
      this.touch();
    }

    eradicateEvent(event, method, options) {
      const opts = options || {};
      const securityGain = Number(opts.securityGain ?? 3);
      if (event.eradicated) return;
      event.markEradicated(method, this.turn, opts.deviceId || '');
      if (event.responseTurn === null) {
        event.responseTurn = Math.max(1, this.turn - event.startTurn + 1);
        this.player.stats.response_turns.push(event.responseTurn);
      }
      for (const alert of this.events.alerts) {
        if (alert.eventId === event.eventId && !alert.resolved) {
          alert.resolve(`已通过「${method}」清除根因`);
        }
      }
      const device = this.devices[event.activeDeviceId];
      if (device) {
        if (device.isolated) device.statusBeforeIsolation = '正常';
        else if (!device.online) device.statusBeforeOffline = '正常';
        else if (['感染', '可疑'].includes(device.status)) device.setStatus('正常');
      }
      this.recomputeAvailability('事件清除后业务恢复');
      if (!event.rewarded) {
        event.rewarded = true;
        this.adjustMetric('security', securityGain, `清除「${event.name}」（${method}）`);
        this.adjustMetric('reputation', 2, '彻底清除安全事件，客户信心回升');
        this.combo += 1;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        if (this.combo > 1) {
          this.pushMessage(`干净处置连击 ×${this.combo}！`, 'accent');
          this.effects.addCombo(`COMBO ×${this.combo}`);
          this.audio.play('combo');
        }
        if (this.combo % 2 === 0) {
          const gained = Math.min(2, this.player.maxActionPoints + 2 - this.player.actionPoints);
          if (gained > 0) {
            this.player.actionPoints += gained;
            this.pushMessage(`连击奖励：行动点 +${gained}`, 'green');
          }
        }
      }
      this.logs.add(
        this.turn,
        clockText(this.turn),
        '操作',
        `事件「${event.name}」根因已清除，方式：${method}。`,
      );
      const successText = event.stageText('success', '');
      if (successText) {
        this.logs.add(this.turn, clockText(this.turn), '操作', `清除结果：${successText}`);
      }
      this.pushMessage(`事件「${event.name}」已彻底清除。`, 'green');
      this.audio.play('success');
      this.effects.flash('green', 30);
      this.effects.addFloater(`清除 +${securityGain}`, 'green');
      this.effects.addBurst('center', 'green', 16);
      this.touch();
    }

    resumeEventsOn(deviceId, method) {
      const actionMethod = method || '隔离设备';
      const names = [];
      for (const event of this.events.events) {
        if (
          event.contained
          && !event.eradicated
          && event.containmentMethod === actionMethod
          && event.containmentDevice === deviceId
        ) {
          event.resume();
          names.push(event.name);
          const device = this.devices[deviceId];
          const deviceName = device ? device.name : deviceId;
          const actionName = actionMethod === '隔离设备' ? '解除隔离' : '重新启动';
          this.events.createAlert(this, {
            title: `事件重新活跃：${event.name}`,
            level: '高危',
            targetId: event.activeDeviceId,
            eventId: event.eventId,
            sourceIp: event.sourceIp,
            account: event.account,
            detail: `${deviceName} ${actionName}后，之前被压制的攻击链重新活跃。`,
          });
          this.logs.add(
            this.turn,
            clockText(this.turn),
            '告警',
            `${deviceName} ${actionName}，事件「${event.name}」重新活跃。`,
            { source: deviceName },
          );
          this.pushMessage(`警告：${actionName}使「${event.name}」重新活跃！`, 'red');
        }
      }
      return names;
    }

    eventForAlert(alert) {
      if (!alert) return null;
      return this.events.getEvent(alert.eventId);
    }

    campaignForAlert(alert) {
      const event = this.eventForAlert(alert);
      if (!event) return null;
      return this.events.campaignOf(event.eventId);
    }

    relatedAlerts(alert) {
      if (!alert) return [];
      return this.events.alerts.filter((other) => {
        if (other.alertId === alert.alertId) return false;
        return Boolean(
          (alert.eventId && other.eventId === alert.eventId)
          || (alert.sourceIp && other.sourceIp === alert.sourceIp)
          || (alert.account && other.account === alert.account),
        );
      });
    }

    eventForDevice(deviceId) {
      const events = this.eventsForDevice(deviceId);
      return events.length ? events[0] : null;
    }

    eventsForDevice(deviceId) {
      return this.events.activeEvents().filter((event) => event.activeDeviceId === deviceId);
    }

    controlledEventsForDevice(deviceId) {
      return this.events.events.filter(
        (event) => event.contained
          && !event.eradicated
          && !event.failed
          && event.activeDeviceId === deviceId,
      );
    }

    hasEventRelation(deviceId) {
      return this.events.events.some(
        (event) => deviceId === event.activeDeviceId || deviceId === event.targetId,
      );
    }

    selectedDevice() {
      if (this.selectedAlert) return this.devices[this.selectedAlert.targetId] || null;
      if (this.selectedDeviceId) return this.devices[this.selectedDeviceId] || null;
      return null;
    }

    selectDevice(deviceId) {
      if (!this.devices[deviceId]) return;
      this.selectedDeviceId = deviceId;
      this.selectedAlert = null;
      this.audio.play('click');
      this.touch();
    }

    clearSelection() {
      this.selectedDeviceId = null;
      this.selectedAlert = null;
      this.touch();
    }

    selectAlert(alert) {
      if (!alert) return;
      this.selectedAlert = alert;
      this.selectedDeviceId = alert.targetId;
      this.audio.play('click');
      this.touch();
    }

    currentTarget() {
      if (this.selectedAlert) {
        return new Target('alert', this.selectedAlert, this.devices[this.selectedAlert.targetId] || null);
      }
      if (this.selectedDeviceId) {
        const device = this.devices[this.selectedDeviceId];
        if (device) return new Target('device', null, device);
      }
      return null;
    }

    // ==================================================================
    // 操作与消息
    // ==================================================================
    performAction(option, target) {
      const result = this.actions.execute(this, option, target);
      this.showActionFeedback(option, result);
      this.touch();
      return result;
    }

    showActionFeedback(option, result) {
      if (result.executed === false) return;
      const actionId = option.actionId;
      let title;
      let detail;
      let stage = '';
      let color = 'green';
      if (!result.success) {
        title = '操作未生效';
        detail = result.message;
        color = 'orange';
      } else if (actionId === 'investigate') {
        stage = '调查';
        title = '调查成功';
        detail = result.message;
      } else if (['isolate', 'shutdown', 'block_source'].includes(actionId)) {
        stage = '控制';
        title = '控制成功';
        detail = '攻击已停止扩散，但根因还在。下一步：执行“清除威胁”，再恢复业务。';
      } else if (['delete_mail', 'reset_password', 'patch', 'eradicate'].includes(actionId)) {
        stage = '清除';
        title = '清除成功';
        detail = '根因已移除，告警关闭。别忘了解除隔离或启动服务，让业务恢复。';
      } else if (['unisolate', 'startup', 'restore_backup'].includes(actionId)) {
        stage = '恢复';
        title = '恢复完成';
        detail = '业务已恢复；已经清除的事件不会因为恢复操作重新活跃。';
      } else if (actionId === 'protect_backup') {
        title = '加固完成';
        detail = '备份服务器已进入离线保护，勒索损失会明显降低。';
      } else {
        title = '操作完成';
        detail = result.message;
      }
      if (this.onActionFeedback) {
        this.onActionFeedback({ title, detail, color, stage, correct: result.success && color === 'green' });
      }
    }

    pushMessage(text, color) {
      this.messages.push({ text: String(text), color: color || 'text', turn: this.turn });
      if (this.messages.length > 120) this.messages = this.messages.slice(-120);
      this.touch();
    }

    onAlertCreated(alert) {
      this.audio.play('alert');
      const target = this.devices[alert.targetId];
      const targetName = target ? target.shortName : alert.targetId;
      this.effects.addBanner(
        `新告警 · ${alert.title}`,
        `目标 ${alert.targetId} ${targetName} · 等级待评估`,
        'accent',
      );
      if (this.onAlert) this.onAlert(alert);
      this.touch();
    }

    onCriticalEvent(event) {
      this.audio.play('fail');
      this.effects.flash('red', 80);
      this.effects.addBanner(
        `高危事件：${event.name}`,
        '威胁等级上升 · 立即调查或隔离，不要等待',
        'red',
      );
    }

    applyLoadedState(data) {
      this.seed = Number(data.seed);
      this.rng = data.rng;
      this.devices = data.devices;
      this.player = data.player;
      this.player.turn = Number(data.turn);
      this.turn = Number(data.turn);
      this.logs = data.logs;
      this.events = data.events;
      this.messages = data.messages.slice(-120);
      this.dataLeak = Boolean(data.dataLeak);
      this.ransomwareFailed = Boolean(data.ransomwareFailed);
      this.securityBreach = Boolean(data.securityBreach);
      this.lowAvailabilityTurns = Number(data.lowAvailabilityTurns || 0);
      this.combo = Number(data.combo || 0);
      this.bestCombo = Number(data.bestCombo || 0);
      this.seenDecisions = data.seenDecisions || new Set();
      this.report = null;
      this.selectedAlert = null;
      this.selectedDeviceId = null;
      this.pendingDecision = null;
      this.tutorialMode = false;
      this.state = 'playing';
      this.touch();
    }

    // ==================================================================
    // 供 UI 查询的派生信息
    // ==================================================================
    get activeEvents() {
      return this.events.activeEvents();
    }

    get orderedAlerts() {
      return this.events.alerts.slice().sort((a, b) => {
        const ka = a.sortKey();
        const kb = b.sortKey();
        for (let i = 0; i < ka.length; i += 1) {
          if (ka[i] !== kb[i]) return ka[i] - kb[i];
        }
        return 0;
      });
    }

    get campaignPressureText() {
      for (const campaign of this.events.campaignStatus()) {
        if (campaign.revealed && !campaign.settled && campaign.active) {
          return `${campaign.actor} 节奏 ${campaign.momentum}/${campaign.threshold}`;
        }
      }
      return '';
    }

    upgradeState(upgrade) {
      if (this.player.upgrades.has(upgrade.upgradeId)) return ['owned', '本局已生效'];
      const [allowed, reason] = this.upgradeTree.check(upgrade, this.player.upgrades);
      if (!allowed) {
        const conflict = this.upgradeTree.lockedByUpgrade(upgrade, this.player.upgrades);
        if (conflict) return ['excluded', `与「${conflict.name}」互斥`];
        return ['locked', reason];
      }
      if (this.player.funds < upgrade.cost) return ['unaffordable', `资金不足（需 ¥${upgrade.cost}）`];
      return ['available', '可以用预算启用'];
    }

    touch() {
      this.revision += 1;
    }
  }

  ZDD.Game = Game;
})(typeof globalThis !== 'undefined' ? globalThis : this);
