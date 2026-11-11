/* 操作管理：12 种操作的可用性判断、消耗与效果结算。 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  const COSTS = {
    investigate: [1, 20],
    delete_mail: [1, 10],
    reset_password: [1, 35],
    block_source: [1, 25],
    isolate: [2, 30],
    unisolate: [1, 0],
    eradicate: [2, 60],
    patch: [1, 45],
    shutdown: [2, 0],
    startup: [1, 0],
    restore_backup: [2, 90],
    protect_backup: [1, 70],
  };

  const NAMES = {
    investigate: '调查告警',
    delete_mail: '删除可疑邮件',
    reset_password: '重置账号密码',
    block_source: '封禁来源 IP',
    isolate: '隔离设备',
    unisolate: '解除隔离',
    eradicate: '清除威胁',
    patch: '安装安全补丁',
    shutdown: '关闭服务器',
    startup: '启动服务器',
    restore_backup: '从备份恢复',
    protect_backup: '保护备份服务器',
  };

  const ALERT_ACTION_ORDER = ['investigate', 'delete_mail', 'reset_password', 'block_source'];

  class ActionManager {
    static styleOf(actionId) {
      return {
        investigate: 'default',
        delete_mail: 'danger',
        reset_password: 'warning',
        block_source: 'info',
        isolate: 'warning',
        unisolate: 'success',
        eradicate: 'purple',
        patch: 'success',
        shutdown: 'danger',
        startup: 'info',
        restore_backup: 'info',
        protect_backup: 'purple',
      }[actionId] || 'default';
    }

    optionsFor(game, target) {
      if (!target) return [];
      const options = [];
      if (target.kind === 'alert' && target.alert) {
        const event = game.eventForAlert(target.alert);
        if (event && event.contained && !event.eradicated) {
          options.push(this.build('eradicate', game, target));
          if (target.device) {
            options.push(this.build(target.device.isolated ? 'unisolate' : 'isolate', game, target));
          }
          return options;
        }
        for (const actionId of ALERT_ACTION_ORDER) options.push(this.build(actionId, game, target));
        if (target.device) {
          options.push(this.build(target.device.isolated ? 'unisolate' : 'isolate', game, target));
          if (
            event
            && (event.eventType === 'Web 流量异常' || event.eventType === '零日漏洞')
            && event.activeDeviceId === target.device.deviceId
            && !target.device.patched
          ) {
            options.push(this.build('patch', game, target));
          }
        }
      } else if (target.kind === 'device' && target.device) {
        options.push(...this.deviceOptions(game, target));
      }
      return options;
    }

    deviceOptions(game, target) {
      const device = target.device;
      if (!device) return [];
      const actionIds = [];
      if (game.controlledEventsForDevice(device.deviceId).length) actionIds.push('eradicate');
      if (device.isolated) actionIds.push('unisolate');
      else if (device.online) actionIds.push('isolate');
      if (device.canShutdown) actionIds.push(!device.online ? 'startup' : 'shutdown');
      if (!device.patched) actionIds.push('patch');
      if (device.backups) actionIds.push('restore_backup');
      if (device.deviceId === 'BAK-01' && !device.backupProtected) actionIds.push('protect_backup');
      return actionIds.slice(0, 6).map((actionId) => this.build(actionId, game, target));
    }

    build(actionId, game, target) {
      const [name, baseAp, baseMoney] = [NAMES[actionId], COSTS[actionId][0], COSTS[actionId][1]];
      const mods = game.modifiers;
      let apCost = baseAp;
      let moneyCost = baseMoney;
      if (actionId === 'investigate') moneyCost = Math.max(0, moneyCost + Math.trunc(mods.investigate_money || 0));
      if (actionId === 'isolate') apCost = Math.max(1, apCost + Math.trunc(mods.isolate_ap || 0));
      if (actionId === 'block_source') {
        apCost = Math.max(0, apCost + Math.trunc(mods.block_source_ap || 0));
        if ('block_source_money' in mods) moneyCost = Math.max(0, Math.trunc(mods.block_source_money));
      }
      if (actionId === 'eradicate') {
        apCost = Math.max(1, apCost + Math.trunc(mods.eradicate_ap || 0));
        moneyCost = Math.max(0, moneyCost + Math.trunc(mods.eradicate_money || 0));
      }
      let [enabled, reason] = this.check(actionId, game, target);
      if (enabled && !game.player.canPay(apCost, moneyCost)) {
        if (game.player.actionPoints < apCost) {
          enabled = false;
          reason = `行动点不足（需要 ${apCost} 点）`;
        } else {
          enabled = false;
          reason = `资金不足（需要 ¥${moneyCost}）`;
        }
      }
      return {
        actionId,
        name,
        apCost,
        moneyCost,
        enabled,
        reason,
        style: ActionManager.styleOf(actionId),
      };
    }

    check(actionId, game, target) {
      const alert = target.alert;
      const device = target.device;
      const event = alert ? game.eventForAlert(alert) : null;

      if (actionId === 'investigate') {
        if (!alert) return [false, '请先选择一条告警'];
        if (alert.resolved) return [false, '该告警已经处置完成'];
        if (alert.investigated) return [false, '该告警已经调查过，线索已记录'];
        return [true, ''];
      }
      if (actionId === 'delete_mail') {
        if (!alert) return [false, '请先选择一条告警'];
        if (!alert.investigated) return [false, '请先调查告警，确认这是否真的是钓鱼邮件'];
        if (!event) return [false, '该告警与钓鱼邮件事件无关'];
        if (!event.isActive) return [false, '相关事件已经结束'];
        if (event.eventType !== '钓鱼邮件') return [false, '只有钓鱼邮件类事件可以删除邮件'];
        if (event.stageIndex > 1) return [false, '事件已进入后期阶段，删除邮件无法阻止攻击'];
        return [true, ''];
      }
      if (actionId === 'reset_password') {
        if (!alert) return [false, '请先选择一条告警'];
        if (!alert.investigated) return [false, '请先调查告警，确认账号是否真的异常'];
        if (!event) return [false, '该告警不涉及任何账号凭据'];
        if (!event.isActive) return [false, '相关事件已经结束'];
        if (event.credentialsReset) return [false, '该事件的账号密码已经重置过'];
        if (!['钓鱼邮件', '异常登录', '内部账号异常访问'].includes(event.eventType)) {
          return [false, '该事件无法通过重置密码阻断'];
        }
        if (event.stageIndex === 0 && event.eventType === '钓鱼邮件') {
          return [false, '尚未发现凭据泄露，重置密码暂时无效'];
        }
        if (event.stageIndex > 2) return [false, '攻击者已建立外联，重置密码无法立即阻断'];
        return [true, ''];
      }
      if (actionId === 'block_source') {
        if (!alert) return [false, '请先选择一条告警'];
        if (!alert.sourceIp) return [false, '该告警没有可封禁的外部来源地址'];
        if (event && !event.isActive) return [false, '相关事件已经结束'];
        if (event && event.sourceBlocked) return [false, '该来源地址已经封禁'];
        return [true, ''];
      }
      if (actionId === 'isolate') {
        if (!device) return [false, '请先选择一台设备'];
        if (device.isolated) return [false, '设备已处于隔离状态，请使用“解除隔离”'];
        if (!device.online) return [false, '设备已经关机，无法再隔离'];
        return [true, ''];
      }
      if (actionId === 'eradicate') {
        if (alert) {
          const alertEvent = game.eventForAlert(alert);
          if (!alertEvent || !alertEvent.contained || alertEvent.eradicated) {
            return [false, '该告警没有已控制、等待清除的事件'];
          }
          return [true, ''];
        }
        if (!device) return [false, '请先选择一台设备'];
        if (!game.controlledEventsForDevice(device.deviceId).length) {
          return [false, '该设备没有已控制、等待清除的事件'];
        }
        return [true, ''];
      }
      if (actionId === 'unisolate') {
        if (!device) return [false, '请先选择一台设备'];
        if (!device.isolated) return [false, '设备未处于隔离状态'];
        return [true, ''];
      }
      if (actionId === 'patch') {
        if (!device) return [false, '请先选择一台设备'];
        if (device.patched) return [false, '设备已安装最新补丁'];
        if (!device.online) return [false, '设备已关机，无法在线安装补丁'];
        return [true, ''];
      }
      if (actionId === 'shutdown') {
        if (!device) return [false, '请先选择一台设备'];
        if (!device.canShutdown) return [false, '该设备不支持远程关机'];
        if (device.isolated) return [false, '设备已隔离，请先解除隔离'];
        if (!device.online) return [false, '设备已经关机'];
        return [true, ''];
      }
      if (actionId === 'startup') {
        if (!device) return [false, '请先选择一台设备'];
        if (device.online) return [false, '设备已经在线'];
        if (device.isolated) return [false, '设备已隔离，请先解除隔离'];
        return [true, ''];
      }
      if (actionId === 'restore_backup') {
        if (!device) return [false, '请先选择一台设备'];
        if (!device.backups) return [false, '该设备没有可用备份'];
        if (device.health >= 100 && device.status === '正常' && game.player.integrity >= 100) {
          return [false, '数据完好，暂不需要恢复'];
        }
        return [true, ''];
      }
      if (actionId === 'protect_backup') {
        if (!device) return [false, '请先选择一台设备'];
        if (device.deviceId !== 'BAK-01') return [false, '只有备份服务器需要执行该操作'];
        if (device.backupProtected) return [false, '备份服务器已经处于保护状态'];
        return [true, ''];
      }
      return [false, '未知操作'];
    }

    execute(game, option, target) {
      if (!option.enabled) return { success: false, message: option.reason, executed: false };
      if (!game.spendResources(option.apCost, option.moneyCost, `执行「${option.name}」`)) {
        return { success: false, message: '行动点或资金不足，操作未执行', executed: false };
      }
      game.player.stats.actions_used = (game.player.stats.actions_used || 0) + 1;
      game.logs.add(
        game.turn,
        ZDD.clockText(game.turn),
        '操作',
        `执行「${option.name}」，目标：${target.label}（行动点 -${option.apCost}，资金 -¥${option.moneyCost}）`,
        { source: target.device ? target.device.name : '' },
      );
      const result = this[option.actionId](game, target) || { success: false, message: '操作没有返回结果' };
      game.pushMessage(result.message, result.success ? 'green' : 'yellow');
      return Object.assign({ executed: true }, result);
    }

    // ------------------------------------------------------------------
    // 具体操作
    // ------------------------------------------------------------------
    investigate(game, target) {
      const alert = target.alert;
      const stats = game.player.stats;
      stats.investigations = (stats.investigations || 0) + 1;

      if (alert.falsePositive) {
        alert.markInvestigated('误报');
        stats.false_positives_checked = (stats.false_positives_checked || 0) + 1;
        game.logs.add(
          game.turn,
          ZDD.clockText(game.turn),
          '告警',
          `调查结论：${alert.title} 为误报。${alert.conclusion}`,
          { source: alert.targetId, ip: alert.sourceIp },
        );
        return { success: true, message: `调查完成：该告警是误报。${alert.conclusion}` };
      }

      const event = game.eventForAlert(alert);
      alert.markInvestigated('真实威胁');
      if (!event) return { success: true, message: '调查确认该告警指向真实威胁，但未关联到具体事件记录。' };

      event.investigations += 1;
      if (event.responseTurn === null) {
        event.responseTurn = Math.max(1, game.turn - event.startTurn + 1);
        stats.response_turns.push(event.responseTurn);
      }
      const extraClues = Math.max(0, Math.trunc(game.modifiers.extra_clue || 0));
      const revealed = [];
      for (let i = 0; i < 1 + extraClues; i += 1) {
        const clue = event.revealNextClue();
        if (clue) revealed.push(clue);
      }
      const clue = revealed.length ? revealed.join('；') : '暂未获得新的可观察线索。';
      const device = game.devices[event.activeDeviceId];
      const [low, high, confidence] = game.risk.estimate(event, device, game.turn, game.confidenceBonus);
      game.logs.add(
        game.turn,
        ZDD.clockText(game.turn),
        '告警',
        `调查确认「${event.name}」为真实威胁。新线索：${clue}`,
        { source: device ? device.name : event.targetId, account: event.account, ip: event.sourceIp },
      );
      const recommended = (event.stage.recommended || []).map(String).join('、');
      if (recommended) {
        game.logs.add(
          game.turn,
          ZDD.clockText(game.turn),
          '告警',
          `建议处置：${recommended}。`,
          { source: device ? device.name : event.targetId },
        );
      }
      const warning = event.stageText('wrong_action', '');
      if (warning) {
        game.logs.add(
          game.turn,
          ZDD.clockText(game.turn),
          '告警',
          `风险提示：${warning}`,
          { source: device ? device.name : event.targetId },
        );
      }
      if (event.nextDeviceId) {
        const nextDevice = game.devices[event.nextDeviceId];
        const nextName = nextDevice ? nextDevice.name : event.nextDeviceId;
        game.logs.add(
          game.turn,
          ZDD.clockText(game.turn),
          '告警',
          `预测下一跳：${nextName}（${event.nextStageName}）。提前隔离可拖住攻击。`,
          { source: device ? device.name : event.targetId },
        );
      }
      const related = game.relatedAlerts(alert);
      if (related.length) {
        game.logs.add(
          game.turn,
          ZDD.clockText(game.turn),
          '告警',
          `情报关联：发现 ${related.length} 条同源/同账号告警，可能属于同一攻击活动。`,
          { source: device ? device.name : event.targetId },
        );
      }
      const spreadCondition = String(event.config.spread_condition || '');
      if (spreadCondition) {
        game.logs.add(
          game.turn,
          ZDD.clockText(game.turn),
          '告警',
          `传播条件：${spreadCondition}`,
          { source: device ? device.name : event.targetId },
        );
      }
      return {
        success: true,
        message: `确认「${event.name}」是真实威胁。新线索：${clue}｜风险估计 ${low}~${high}（置信度 ${confidence}%）。`,
      };
    }

    delete_mail(game, target) {
      const event = game.eventForAlert(target.alert);
      if (!event) return { success: false, message: '该告警没有关联事件。' };
      if (event.stageIndex <= 1) {
        const successText = event.stageText('success', '邮件在附件被打开前删除，事件被阻断。');
        game.eradicateEvent(event, '删除可疑邮件', { securityGain: 4 });
        return { success: true, message: `已删除可疑邮件并从网关拦截。${successText}` };
      }
      return { success: false, message: '邮件已删除，但凭据已在更早阶段泄露，攻击链仍在继续。' };
    }

    reset_password(game, target) {
      const event = game.eventForAlert(target.alert);
      if (!event) return { success: false, message: '该告警没有关联事件。' };
      event.credentialsReset = true;
      game.eradicateEvent(event, '重置账号密码', { securityGain: 3 });
      return {
        success: true,
        message: `已重置 ${event.account || '相关账号'} 的密码并踢出现有会话，攻击者持有的凭据失效。`,
      };
    }

    block_source(game, target) {
      const alert = target.alert;
      if (alert.falsePositive) {
        game.adjustMetric('reputation', -6, `封禁合作方地址 ${alert.sourceIp}，正常业务中断`);
        game.breakCombo('误封合作方地址');
        return {
          success: false,
          message: `已封禁 ${alert.sourceIp}，但该地址属于合作方，接口调用失败，声誉下降。`,
        };
      }
      const event = game.eventForAlert(alert);
      if (!event) return { success: false, message: '已封禁来源地址，但未找到关联事件记录。' };
      if (event.stageIndex <= 2) {
        event.sourceBlocked = true;
        game.containEvent(event, '封禁来源 IP', { securityGain: 2 });
        return { success: true, message: `已封禁 ${alert.sourceIp}，攻击者的外部通道被切断。` };
      }
      event.sourceBlocked = true;
      return {
        success: false,
        message: `已封禁 ${alert.sourceIp}，但当前外联会话已经建立，攻击仍在重试，需要隔离目标设备。`,
      };
    }

    isolate(game, target) {
      const device = target.device;
      device.isolate();
      game.recomputeAvailability(`隔离 ${device.name}，相关业务中断`);
      const events = game.eventsForDevice(device.deviceId);
      if (events.length) {
        for (const event of events) game.containEvent(event, '隔离设备', { securityGain: 2, deviceId: device.deviceId });
        const names = events.map((event) => event.name).join('、');
        const impact = game.services.impactForDevice(device.deviceId, game.devices);
        const suffix = impact ? ` 业务影响：${impact}。` : '';
        return {
          success: true,
          message: `${device.name} 已隔离，切断了「${names}」的攻击路径；攻击已控制，仍需清除根因。${suffix}`,
        };
      }
      if (game.hasEventRelation(device.deviceId)) {
        return {
          success: true,
          message: `${device.name} 已隔离。该设备与近期事件相关，但当前没有以它为主链的活动攻击。`,
        };
      }
      game.adjustMetric('reputation', -5, `误封 ${device.name}，影响正常业务`);
      game.player.stats.false_isolations = (game.player.stats.false_isolations || 0) + 1;
      game.breakCombo('误封设备');
      return {
        success: false,
        message: `${device.name} 已隔离，但没有发现该设备相关的活动事件，可能属于误封，声誉下降。`,
      };
    }

    eradicate(game, target) {
      let device = target.device;
      let events;
      if (target.kind === 'alert') {
        const event = game.eventForAlert(target.alert);
        if (!event || !event.contained || event.eradicated) {
          return { success: false, message: '该告警没有已控制、等待清除的事件。' };
        }
        events = [event];
        device = game.devices[event.activeDeviceId] || null;
      } else {
        if (!device) return { success: false, message: '请先选择一台设备。' };
        events = game.controlledEventsForDevice(device.deviceId);
      }
      if (!events.length) return { success: false, message: '该设备没有已控制、等待清除的事件。' };
      for (const event of events) {
        game.eradicateEvent(event, '清除威胁', { securityGain: 3, deviceId: device ? device.deviceId : '' });
      }
      const names = events.map((event) => event.name).join('、');
      const targetName = device ? device.name : '目标设备';
      return { success: true, message: `${targetName} 上的「${names}」已完成取证与清除；现在可以恢复业务。` };
    }

    patch(game, target) {
      const device = target.device;
      device.applyPatch();
      game.adjustMetric('security', 1, `修补 ${device.name} 的已知漏洞`);
      game.recomputeAvailability(`${device.name} 安装补丁，进入短暂维护`);
      const webEvents = game.eventsForDevice(device.deviceId).filter((event) => (
        (event.eventType === 'Web 流量异常' && event.stageIndex <= 2)
        || (event.eventType === '零日漏洞' && event.stageIndex <= 1)
      ));
      if (webEvents.length) {
        for (const event of webEvents) {
          game.eradicateEvent(event, '安装安全补丁', { securityGain: 2, deviceId: device.deviceId });
        }
        return {
          success: true,
          message: `${device.name} 补丁/缓解措施安装完成，漏洞利用链被清除；维护期间可用性略降。`,
        };
      }
      return {
        success: true,
        message: `${device.name} 补丁安装完成，漏洞已修补；未来被利用的风险降低，维护期间可用性略降。`,
      };
    }

    shutdown(game, target) {
      const device = target.device;
      device.shutdown();
      game.recomputeAvailability(`关闭 ${device.name}，业务服务中断`);
      const events = game.eventsForDevice(device.deviceId);
      if (events.length) {
        for (const event of events) game.containEvent(event, '关闭服务器', { securityGain: 1, deviceId: device.deviceId });
        const names = events.map((event) => event.name).join('、');
        const impact = game.services.impactForDevice(device.deviceId, game.devices);
        const suffix = impact ? ` 业务影响：${impact}。` : '';
        return {
          success: true,
          message: `${device.name} 已关停，攻击链「${names}」被控制；仍需清除根因。${suffix}`,
        };
      }
      game.adjustMetric('reputation', -4, `无事件时关停 ${device.name}，业务中断`);
      game.player.stats.false_isolations = (game.player.stats.false_isolations || 0) + 1;
      game.breakCombo('无必要关停');
      return {
        success: false,
        message: `${device.name} 已关停，但没有需要关停的攻击链，业务中断导致声誉下降。`,
      };
    }

    startup(game, target) {
      const device = target.device;
      device.startup();
      game.recomputeAvailability(`启动 ${device.name}，业务恢复`);
      const resumed = game.resumeEventsOn(device.deviceId, '关闭服务器');
      if (resumed.length) {
        return { success: false, message: `${device.name} 已重新启动，但之前被压制的「${resumed.join('、')}」重新活跃！` };
      }
      return { success: true, message: `${device.name} 已重新启动，服务可用性回升。` };
    }

    restore_backup(game, target) {
      const device = target.device;
      device.consumeBackup();
      device.health = 100;
      if (device.status === '感染') device.setStatus('可疑');
      const gain = 8 + Math.trunc(game.modifiers.restore_integrity || 0);
      game.adjustMetric('integrity', gain, `从 ${device.name} 的备份恢复数据`);
      game.recomputeAvailability(`${device.name} 从备份恢复，业务重新校验`);
      return {
        success: true,
        message: `${device.name} 已从备份恢复，数据完整度 +${gain}；该备份快照已被消耗。`,
      };
    }

    protect_backup(game, target) {
      const device = target.device;
      device.protectBackup();
      game.adjustMetric('security', 1, '备份服务器启用离线保护');
      game.adjustMetric('integrity', 2, '备份快照完成完整性校验');
      return { success: true, message: '备份服务器已切换为离线保护模式：勒索软件造成的数据损失将大幅降低。' };
    }

    unisolate(game, target) {
      const device = target.device;
      device.restore();
      game.recomputeAvailability(`解除隔离 ${device.name}，业务恢复`);
      const resumed = game.resumeEventsOn(device.deviceId);
      if (resumed.length) {
        return { success: false, message: `${device.name} 已恢复上线，但隔离解除后事件「${resumed.join('、')}」重新活跃！` };
      }
      return { success: true, message: `${device.name} 已恢复上线，业务可用性回升。` };
    }
  }

  ZDD.ActionManager = ActionManager;
  ZDD.ACTION_NAMES = NAMES;
  ZDD.ACTION_COSTS = COSTS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
