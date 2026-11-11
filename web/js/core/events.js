/* 事件管理器：排期、派发、阶段推进、误报噪音、攻击战役节奏。 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});
  const { SecurityEvent, Alert } = ZDD.models;

  const SAFE_ACCOUNTS = [
    'li.na@example-corp.test',
    'zhang.wei@example-corp.test',
    'wang.qiang@example-corp.test',
    'chen.yu@example-corp.test',
    'svc-web@example-corp.test',
  ];
  const CAMPAIGN_DEFAULT_THRESHOLD = 3;
  const INTEL_CATEGORY = '情报';

  class EventManager {
    constructor(payload, rng, logs, tutorial) {
      this.payload = payload;
      this.rng = rng;
      this.logs = logs;
      this.tutorial = Boolean(tutorial);
      this.events = [];
      this.alerts = [];
      this.spawnedEventIds = new Set();
      this.alertCounter = 0;
      this.lastFalsePositiveTurn = -99;
      this.usedFalsePositiveTitles = new Set();
      this.spawnSchedule = {};
      this.campaignRuntime = {};
      for (const campaign of this.campaignConfigs) {
        this.campaignRuntime[String(campaign.id || '')] = EventManager.newCampaignRuntime();
      }
      this.buildSpawnSchedule();
    }

    static newCampaignRuntime() {
      return { momentum: 0, escalations: 0, revealed: false, settled: false };
    }

    get eventConfigs() {
      return (this.payload.events || []).filter((item) => item && typeof item === 'object');
    }

    get campaignConfigs() {
      return (this.payload.campaigns || []).filter((item) => item && typeof item === 'object');
    }

    /** 固定事件保留，其余打乱到 3~5 回合。 */
    buildSpawnSchedule() {
      if (this.tutorial) {
        for (const config of this.eventConfigs) {
          if (!config.enabled) continue;
          const baseTurn = Number(config.spawn_turn ?? 1) || 1;
          if (baseTurn <= 1) this.spawnSchedule[String(config.id || '')] = 1;
        }
        return;
      }
      const flexible = [];
      for (const config of this.eventConfigs) {
        if (!config.enabled) continue;
        const baseTurn = Number(config.spawn_turn ?? 1) || 1;
        const eventId = String(config.id || '');
        if (baseTurn <= 1 || baseTurn >= 8) this.spawnSchedule[eventId] = baseTurn;
        else flexible.push(config);
      }
      const slots = [3, 4, 5, 6, 7];
      this.rng.shuffle(flexible);
      flexible.forEach((config, index) => {
        if (index >= slots.length) return;
        this.spawnSchedule[String(config.id || '')] = slots[index];
      });
    }

    getEvent(eventId) {
      if (!eventId) return null;
      return this.events.find((event) => event.eventId === eventId) || null;
    }

    getEventConfig(eventId) {
      if (!eventId) return null;
      return this.eventConfigs.find((config) => String(config.id || '') === String(eventId)) || null;
    }

    activeEvents() {
      return this.events.filter((event) => event.isActive);
    }

    getCampaign(campaignId) {
      if (!campaignId) return null;
      return this.campaignConfigs.find((campaign) => String(campaign.id || '') === String(campaignId)) || null;
    }

    campaignIdOf(eventId) {
      if (!eventId) return '';
      for (const campaign of this.campaignConfigs) {
        if ((campaign.members || []).map(String).includes(String(eventId))) return String(campaign.id || '');
      }
      return '';
    }

    campaignOf(eventId) {
      return this.getCampaign(this.campaignIdOf(eventId));
    }

    campaignMembers(campaign) {
      const ids = new Set((campaign.members || []).map(String));
      return this.events.filter((event) => ids.has(event.eventId));
    }

    runtime(campaign) {
      const id = String(campaign.id || '');
      if (!this.campaignRuntime[id]) this.campaignRuntime[id] = EventManager.newCampaignRuntime();
      return this.campaignRuntime[id];
    }

    static threshold(campaign) {
      const value = Number(campaign.momentum_threshold ?? CAMPAIGN_DEFAULT_THRESHOLD);
      return Number.isFinite(value) && value >= 1 ? Math.floor(value) : CAMPAIGN_DEFAULT_THRESHOLD;
    }

    campaignStatus() {
      return this.campaignConfigs.map((campaign) => {
        const runtime = this.runtime(campaign);
        const members = this.campaignMembers(campaign);
        return {
          id: String(campaign.id || ''),
          name: String(campaign.name || ''),
          actor: String(campaign.actor || campaign.name || ''),
          spawned: members.length,
          expected: (campaign.members || []).length,
          resolved: members.filter((event) => event.eradicated).length,
          failed: members.filter((event) => event.failed).length,
          active: members.filter((event) => event.isActive).length,
          momentum: runtime.momentum,
          threshold: EventManager.threshold(campaign),
          escalations: runtime.escalations,
          revealed: runtime.revealed,
          settled: runtime.settled,
        };
      });
    }

    campaignSettled(campaign, members) {
      const spawnedIds = new Set(members.map((event) => event.eventId));
      const pending = (campaign.members || []).map(String).filter((id) => !spawnedIds.has(id));
      if (pending.length) return false;
      return members.every((event) => event.eradicated || event.failed);
    }

    /** 回合结束：无处置的一方会积攒节奏压力，到阈值就升级。 */
    advanceCampaigns(game) {
      if (this.tutorial) return;
      for (const campaign of this.campaignConfigs) {
        const runtime = this.runtime(campaign);
        if (runtime.settled) continue;
        const members = this.campaignMembers(campaign);
        if (!members.length) continue;
        const active = members.filter((event) => event.isActive);
        if (!active.length) {
          runtime.momentum = Math.max(0, runtime.momentum - 1);
          if (this.campaignSettled(campaign, members)) {
            runtime.settled = true;
            game.logs.add(
              game.turn,
              ZDD.clockText(game.turn),
              INTEL_CATEGORY,
              `情报：「${campaign.name || ''}」的已知行动已全部处置，节奏压力解除。`,
            );
          }
          continue;
        }
        runtime.momentum += 1;
        if (runtime.momentum < EventManager.threshold(campaign)) continue;
        runtime.momentum = 0;
        runtime.escalations += 1;
        this.escalateCampaign(game, campaign, active);
        if (game.state !== 'playing') return;
      }
    }

    maybeRevealCampaign(game, campaign) {
      const runtime = this.runtime(campaign);
      if (runtime.revealed) return false;
      if (this.campaignMembers(campaign).length < 2) return false;
      runtime.revealed = true;
      const name = String(campaign.name || '');
      const actor = String(campaign.actor || name);
      const text = String(campaign.reveal || '')
        || `情报：多起告警来自同一攻击者「${actor}」，已归入战役「${name}」。控制住任意一处，对方的整体节奏就会被拖慢。`;
      game.logs.add(game.turn, ZDD.clockText(game.turn), INTEL_CATEGORY, text);
      game.pushMessage(`情报确认：多起告警同源于「${actor}」（战役「${name}」）。`, 'purple');
      game.effects.addBanner(`情报 · ${actor}`, `战役「${name}」已被识别`, 'purple');
      return true;
    }

    escalateCampaign(game, campaign, active) {
      const name = String(campaign.name || '');
      const actor = String(campaign.actor || name);
      const clock = ZDD.clockText(game.turn);
      const pending = (campaign.members || [])
        .map(String)
        .filter((id) => !this.spawnedEventIds.has(id));

      // 1) 还没登场的成员：把排期提前到下一回合
      for (const eventId of pending) {
        const nextTurn = game.turn + 1;
        const scheduled = this.spawnSchedule[eventId];
        if (scheduled !== undefined && scheduled <= nextTurn) continue;
        this.spawnSchedule[eventId] = nextTurn;
        const config = this.getEventConfig(eventId) || {};
        const eventName = String(config.name || eventId);
        const plan = scheduled !== undefined ? `，原计划第 ${scheduled} 回合` : '';
        this.maybeRevealCampaign(game, campaign);
        game.logs.add(
          game.turn,
          clock,
          INTEL_CATEGORY,
          `情报：${actor} 正在加快节奏，「${eventName}」提前到第 ${nextTurn} 回合${plan}。`,
        );
        game.pushMessage(`情报：${actor} 提前投放「${eventName}」，下一回合就会落地。`, 'purple');
        game.effects.addBanner(`情报 · ${actor}`, `「${eventName}」提前到第 ${nextTurn} 回合`, 'purple');
        return;
      }

      // 2) 成员都已出现：直接推进最靠前的那条攻击链
      let target = active[0];
      for (const event of active) {
        if (event.stageIndex > target.stageIndex
          || (event.stageIndex === target.stageIndex && event.startTurn < target.startTurn)) {
          target = event;
        }
      }
      this.maybeRevealCampaign(game, campaign);
      if (target.stageIndex >= target.maxStageIndex) {
        game.logs.add(
          game.turn,
          clock,
          INTEL_CATEGORY,
          `情报：${actor} 不再等待，对「${target.name}」完成最后一击。`,
        );
        game.pushMessage(`情报：${actor} 对「${target.name}」完成了最后一击！`, 'red');
        this.triggerFinalLoss(game, target);
        return;
      }
      const oldName = target.stageName;
      target.advance();
      target.lastAdvanceTurn = game.turn;
      game.logs.add(
        game.turn,
        clock,
        INTEL_CATEGORY,
        `情报：${actor} 绕过轮询节奏，把「${target.name}」从“${oldName}”推进到“${target.stageName}”。`,
      );
      game.pushMessage(`情报：${actor} 加速推进「${target.name}」到“${target.stageName}”！`, 'red');
      this.applyStage(game, target, oldName);
    }

    startTurn(game) {
      this.spawnDueEvents(game);
      this.maybeFalsePositive(game);
      this.backgroundNoise(game);
    }

    spawnDueEvents(game) {
      for (const config of this.eventConfigs) {
        if (!config.enabled) continue;
        const eventId = String(config.id || '');
        if (!eventId || this.spawnedEventIds.has(eventId)) continue;
        if (this.tutorial && this.spawnSchedule[eventId] === undefined) continue;
        const spawnTurn = Number(this.spawnSchedule[eventId] ?? config.spawn_turn ?? 1) || 1;
        if (game.turn !== spawnTurn) continue;

        const event = new SecurityEvent(config, game.turn);
        if (!game.devices[event.targetId]) {
          game.logs.add(
            game.turn,
            ZDD.clockText(game.turn),
            '系统',
            `事件 ${event.eventId} 的目标设备 ${event.targetId} 不存在，已跳过。`,
          );
          this.spawnedEventIds.add(eventId);
          continue;
        }
        const campaign = this.campaignOf(eventId);
        if (campaign) event.campaignId = String(campaign.id || '');
        this.events.push(event);
        this.spawnedEventIds.add(eventId);
        this.announceStage(game, event, true);
        if (campaign) this.maybeRevealCampaign(game, campaign);
      }
    }

    announceStage(game, event, first) {
      const clock = ZDD.clockText(game.turn);
      const stage = event.stage;
      const device = game.devices[event.activeDeviceId];
      const sourceName = device ? device.name : event.targetId;
      game.logs.add(
        game.turn,
        clock,
        event.eventType === '钓鱼邮件' && event.stageIndex === 0 ? '邮件' : '告警',
        String(stage.log || event.name),
        { source: sourceName, account: event.account, ip: event.sourceIp },
      );
      const alert = this.createAlert(game, {
        title: String(stage.alert_title || event.name),
        level: String(stage.alert_level || event.severityLabel),
        targetId: event.activeDeviceId,
        eventId: event.eventId,
        sourceIp: event.sourceIp,
        account: event.account,
        detail: String(stage.alert_detail || event.summary),
      });
      const prefix = first ? '检测到新的可疑活动' : '事件升级';
      game.pushMessage(`${prefix}：${alert.title}（${alert.level}）`, alert.levelColor);
      if (first && event.severity >= 5) game.onCriticalEvent(event);
    }

    createAlert(game, opts) {
      this.alertCounter += 1;
      const alert = new Alert({
        alertId: `A-${String(this.alertCounter).padStart(3, '0')}`,
        title: opts.title,
        level: opts.level,
        targetId: opts.targetId,
        turn: game.turn,
        clock: ZDD.clockText(game.turn),
        eventId: opts.eventId || null,
        sourceIp: opts.sourceIp || '',
        account: opts.account || '',
        detail: opts.detail || '',
        falsePositive: Boolean(opts.falsePositive),
        conclusion: opts.conclusion || '',
      });
      this.alerts.push(alert);
      game.onAlertCreated(alert);
      return alert;
    }

    maybeFalsePositive(game) {
      if (this.tutorial) return;
      const pool = (this.payload.false_positive_alerts || []).filter((item) => item && typeof item === 'object');
      if (!pool.length) return;
      const turn = game.turn;
      let shouldSpawn = turn === 1;
      if (!shouldSpawn) shouldSpawn = turn - this.lastFalsePositiveTurn >= 2 && this.rng.random() < 0.5;
      if (!shouldSpawn) return;
      let candidates = pool.filter((item) => !this.usedFalsePositiveTitles.has(item.title));
      if (!candidates.length) candidates = pool;
      const config = this.rng.choice(candidates);
      const targetId = String(config.target || '');
      if (!game.devices[targetId]) return;
      const title = String(config.title || '可疑活动');
      this.usedFalsePositiveTitles.add(title);
      this.lastFalsePositiveTurn = turn;
      const alert = this.createAlert(game, {
        title,
        level: String(config.level || '低危'),
        targetId,
        sourceIp: String(config.source_ip || ''),
        account: String(config.account || ''),
        detail: String(config.detail || ''),
        falsePositive: true,
        conclusion: String(config.conclusion || ''),
      });
      game.player.stats.false_positives_seen = (game.player.stats.false_positives_seen || 0) + 1;
      game.logs.add(
        game.turn,
        ZDD.clockText(game.turn),
        '告警',
        `监控平台产生告警：${alert.title}（${alert.level}），来源 ${targetId}。`,
        { source: targetId, ip: alert.sourceIp },
      );
      game.pushMessage(`新的告警：${alert.title}（${alert.level}）`, alert.levelColor);
    }

    backgroundNoise(game) {
      const templates = (this.payload.background_logs || []).filter((item) => item && typeof item === 'object');
      if (!templates.length) return;
      const count = 2 + this.rng.randint(0, 2);
      for (let i = 0; i < count; i += 1) {
        const template = this.rng.choice(templates);
        let text = String(template.text || '');
        text = text
          .replace(/\{n\}/g, String(this.rng.randint(3, 97)))
          .replace(/\{account\}/g, this.rng.choice(SAFE_ACCOUNTS));
        game.logs.add(game.turn, ZDD.clockText(game.turn), String(template.category || '系统'), text);
      }
    }

    advanceEvents(game) {
      for (const event of this.events) {
        if (!event.isActive) continue;
        const device = game.devices[event.activeDeviceId];
        const stage = event.stage;
        if (device && !device.isAvailable && Boolean(stage.spreading)) {
          const reason = device.isolated ? '处于隔离状态' : '处于关机状态';
          game.logs.add(
            game.turn,
            ZDD.clockText(game.turn),
            '网络',
            `${device.name} ${reason}，${event.name} 的横向传播被阻断。`,
            { source: device.name },
          );
          game.pushMessage(`阻断生效：${device.name} ${reason}，攻击链暂时停止推进。`, 'green');
          continue;
        }
        if (event.stageIndex >= event.maxStageIndex) {
          this.triggerFinalLoss(game, event);
          if (game.state !== 'playing') return;
          continue;
        }
        const oldName = event.stageName;
        const nextDeviceId = event.nextDeviceId;
        const nextDevice = nextDeviceId ? game.devices[nextDeviceId] : null;
        const nextStage = event.stageIndex < event.maxStageIndex ? event.stages[event.stageIndex + 1] : {};
        if (nextDevice && !nextDevice.isAvailable && Boolean(nextStage.spreading)) {
          const reason = nextDevice.isolated ? '已提前隔离' : '已提前关机';
          game.logs.add(
            game.turn,
            ZDD.clockText(game.turn),
            '网络',
            `${nextDevice.name} ${reason}，${event.name} 无法移动到下一跳，攻击链被拖住。`,
            { source: nextDevice.name },
          );
          game.pushMessage(`预判生效：${nextDevice.name} ${reason}，攻击暂时无法进入下一阶段。`, 'green');
          continue;
        }
        event.advance();
        event.lastAdvanceTurn = game.turn;
        this.applyStage(game, event, oldName);
      }
    }

    applyStage(game, event, oldStageName) {
      const device = game.devices[event.activeDeviceId];
      const deviceName = device ? device.name : event.targetId;
      const reason = `「${event.name}」从“${oldStageName}”发展为“${event.stageName}”`;
      const multiplier = Number(game.threatMultiplier || 1);
      const securityCost = Math.round(event.stageCost('security_cost') * multiplier);
      const integrityCost = Math.round(event.stageCost('integrity_cost') * multiplier);
      const reputationCost = Math.round(event.stageCost('reputation_cost') * multiplier);
      const availabilityCost = Math.round(event.stageCost('availability_cost') * multiplier);

      if (securityCost) game.adjustMetric('security', -securityCost, reason);
      if (integrityCost) game.adjustMetric('integrity', -integrityCost, EventManager.mechanismReason('integrity', event));
      if (reputationCost) game.adjustMetric('reputation', -reputationCost, EventManager.mechanismReason('reputation', event));
      if (availabilityCost) game.adjustMetric('availability', -availabilityCost, EventManager.mechanismReason('availability', event));

      for (const [deviceId, status] of Object.entries(event.stage.device_status || {})) {
        const target = game.devices[String(deviceId)];
        if (!target) continue;
        target.setStatus(String(status));
        game.logs.add(
          game.turn,
          ZDD.clockText(game.turn),
          '网络',
          `${target.name} 状态变更为「${target.statusLabel}」。`,
          { source: target.name },
        );
      }

      game.logs.add(
        game.turn,
        ZDD.clockText(game.turn),
        '告警',
        event.stageText('log', event.name),
        { source: deviceName, account: event.account, ip: event.sourceIp },
      );
      const alert = this.createAlert(game, {
        title: event.stageText('alert_title', event.name),
        level: event.stageText('alert_level', event.severityLabel),
        targetId: event.activeDeviceId,
        eventId: event.eventId,
        sourceIp: event.sourceIp,
        account: event.account,
        detail: event.stageText('alert_detail', event.summary),
      });
      game.pushMessage(
        `事件升级：「${event.name}」进入“${event.stageName}”，新告警 ${alert.title}（${alert.level}）。`,
        'red',
      );
      game.breakCombo('攻击链推进');
      game.recomputeAvailability('设备安全状态变化影响服务可用性');
    }

    triggerFinalLoss(game, event) {
      event.markFailed(game.turn);
      const device = game.devices[event.activeDeviceId];
      const deviceName = device ? device.name : event.activeDeviceId;
      const costs = event.failureCosts;
      const multiplier = Number(game.threatMultiplier || 1);
      let securityCost = Math.round(Number(costs.security ?? 8) * multiplier);
      let integrityCost = Math.round(Number(costs.integrity ?? 12) * multiplier);
      let reputationCost = Math.round(Number(costs.reputation ?? 8) * multiplier);
      let availabilityCost = Math.round(Number(costs.availability ?? 0) * multiplier);

      let mitigated = false;
      if (event.failureEnding === 'ransomware') {
        const backupServer = game.devices['BAK-01'];
        let isProtected = Boolean(backupServer && backupServer.backupProtected);
        isProtected = isProtected || Boolean(game.modifiers.ransom_mitigation);
        if (isProtected) {
          mitigated = true;
          securityCost = Math.max(1, Math.floor(securityCost / 2));
          integrityCost = Math.max(1, Math.floor(integrityCost / 2));
          reputationCost = Math.max(1, Math.floor(reputationCost / 2));
          availabilityCost = Math.max(0, Math.floor(availabilityCost / 2));
        }
      }

      if (availabilityCost) game.adjustMetric('availability', -availabilityCost, `「${event.name}」造成服务中断`);
      game.adjustMetric('integrity', -integrityCost, `「${event.name}」造成核心数据损失`);
      game.adjustMetric('reputation', -reputationCost, `「${event.name}」造成对外可见事故`);
      game.adjustMetric('security', -securityCost, `「${event.name}」未被阻断`);
      if (device) device.setStatus('感染');

      const endingTitles = {
        data_leak: '数据外泄已确认',
        ransomware: '模拟勒索软件失控',
        security_breach: '管理员权限彻底失守',
      };
      const title = endingTitles[event.failureEnding] || '重大安全事件';
      this.createAlert(game, {
        title: `${title}：${event.name}`,
        level: '极危',
        targetId: event.activeDeviceId,
        eventId: event.eventId,
        sourceIp: event.sourceIp,
        account: event.account,
        detail: String(event.stage.final_loss || event.summary),
      });
      game.logs.add(
        game.turn,
        ZDD.clockText(game.turn),
        '告警',
        `最终损失：${title}，${deviceName} 未能保住。`,
        { source: deviceName },
      );
      game.pushMessage(`严重损失：${title}（${event.name}）！`, 'red');
      game.recomputeAvailability('设备受损影响服务');

      if (event.failureEnding === 'ransomware') {
        if (mitigated) {
          game.pushMessage('离线备份/备份保护生效：勒索损失大幅降低，业务仍可在后续回合恢复。', 'orange');
          return;
        }
        game.ransomwareFailed = true;
        game.finish('ransomware');
        return;
      }
      if (event.failureEnding === 'security_breach') {
        game.securityBreach = true;
        game.finish('security_breach');
        return;
      }
      game.dataLeak = true;
      game.finish('data_leak');
    }

    toState() {
      return {
        spawned_event_ids: Array.from(this.spawnedEventIds).sort(),
        alert_counter: this.alertCounter,
        last_false_positive_turn: this.lastFalsePositiveTurn,
        used_false_positive_titles: Array.from(this.usedFalsePositiveTitles).sort(),
        spawn_schedule: Object.assign({}, this.spawnSchedule),
        campaign_runtime: Object.fromEntries(
          Object.entries(this.campaignRuntime).map(([id, runtime]) => [id, Object.assign({}, runtime)]),
        ),
        events: this.events.map((event) => event.toState()),
        alerts: this.alerts.map((alert) => alert.toDict()),
      };
    }

    applyState(state) {
      if (!state || typeof state !== 'object') return;
      this.spawnedEventIds = new Set((state.spawned_event_ids || []).map(String));
      this.alertCounter = Number(state.alert_counter || 0);
      this.lastFalsePositiveTurn = Number(state.last_false_positive_turn ?? -99);
      this.usedFalsePositiveTitles = new Set((state.used_false_positive_titles || []).map(String));
      if (state.spawn_schedule && typeof state.spawn_schedule === 'object') {
        this.spawnSchedule = {};
        for (const [key, value] of Object.entries(state.spawn_schedule)) {
          if (Number.isFinite(Number(value))) this.spawnSchedule[String(key)] = Number(value);
        }
      }

      this.events = [];
      for (const eventState of state.events || []) {
        if (!eventState || typeof eventState !== 'object') continue;
        const config = this.getEventConfig(String(eventState.event_id || ''));
        if (!config) continue;
        const event = new SecurityEvent(config, Number(eventState.start_turn || 1));
        event.applyState(eventState);
        event.campaignId = this.campaignIdOf(event.eventId) || String(eventState.campaign_id || '');
        this.events.push(event);
      }

      this.campaignRuntime = {};
      for (const campaign of this.campaignConfigs) {
        this.campaignRuntime[String(campaign.id || '')] = EventManager.newCampaignRuntime();
      }
      const savedRuntime = state.campaign_runtime;
      if (savedRuntime && typeof savedRuntime === 'object') {
        for (const [id, runtime] of Object.entries(savedRuntime)) {
          if (!this.campaignRuntime[id] || !runtime || typeof runtime !== 'object') continue;
          this.campaignRuntime[id] = {
            momentum: Math.max(0, Number(runtime.momentum || 0) | 0),
            escalations: Math.max(0, Number(runtime.escalations || 0) | 0),
            revealed: Boolean(runtime.revealed),
            settled: Boolean(runtime.settled),
          };
        }
      }

      this.alerts = (state.alerts || [])
        .filter((item) => item && typeof item === 'object')
        .map((item) => Alert.fromDict(item));
    }

    static mechanismReason(key, event) {
      const mapping = {
        integrity: `「${event.name}」造成数据被篡改或外泄`,
        reputation: `「${event.name}」造成对外可见的安全事故`,
        availability: `「${event.name}」影响业务系统运行`,
      };
      return mapping[key] || event.name;
    }
  }

  ZDD.EventManager = EventManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
