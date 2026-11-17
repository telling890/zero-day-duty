/* 值班界面渲染：顶栏、设备/简报、告警、日志、操作、消息。 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stars(level) {
    const value = Math.max(0, Math.min(5, Number(level) || 0));
    return '★'.repeat(value) + '☆'.repeat(5 - value);
  }

  function levelColorVar(level) {
    return {
      极危: 'var(--critical)',
      高危: 'var(--red)',
      中危: 'var(--orange)',
      低危: 'var(--yellow)',
      信息: 'var(--blue)',
    }[level] || 'var(--dim)';
  }

  class Panels {
    constructor(refs) {
      this.refs = refs;
      this.lastOptions = [];
      this.lastAlertScroll = 0;
      this.lastLogScroll = 0;
      this.logStickToBottom = true;
      this.userScrollIntent = false;
      this.pinFrame = null;
      this.confirmIndex = -1;
      this.feedback = null;
      this.feedbackUntil = 0;
      this.lastMetrics = {};
      this.lastServiceStates = {};
      if (global.ResizeObserver) {
        this.logResizeObserver = new ResizeObserver(() => {
          if (this.logStickToBottom) this.refs.logList.scrollTop = this.refs.logList.scrollHeight;
        });
        this.logResizeObserver.observe(this.refs.logList);
      }
    }

    /** 高代价动作的“再点一次确认”状态；-1 表示没有待确认的动作。 */
    setConfirm(index) {
      this.confirmIndex = Number.isInteger(index) && index >= 0 ? index : -1;
    }

    /** 操作结果就地显示在提示行里（不再盖住屏幕中央）。 */
    setFeedback(feedback, duration) {
      if (!feedback) {
        this.clearFeedback();
        return;
      }
      this.feedback = feedback;
      this.feedbackUntil = Date.now() + (duration || 2800);
    }

    clearFeedback() {
      this.feedback = null;
      this.feedbackUntil = 0;
    }

    activeFeedback() {
      if (!this.feedback) return null;
      if (Date.now() > this.feedbackUntil) {
        this.clearFeedback();
        return null;
      }
      return this.feedback;
    }

    markUserScrollIntent() {
      this.userScrollIntent = true;
    }

    onLogScroll() {
      const list = this.refs.logList;
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 28;
      if (atBottom) this.logStickToBottom = true;
      else if (this.userScrollIntent) this.logStickToBottom = false;
      this.userScrollIntent = false;
    }

    render(game, ui) {
      this.refs.play.hidden = game.state === 'menu';
      this.refs.menu.hidden = game.state !== 'menu';
      document.body.classList.toggle('is-menu', game.state === 'menu');
      document.getElementById('app').dataset.state = game.state;

      this.renderMetrics(game);
      this.renderDevice(game);
      this.renderAlerts(game);
      this.renderLogs(game, ui);
      this.renderActions(game, ui);
      this.renderMessages(game);
    }

    renderMetrics(game) {
      const player = game.player;
      const threat = game.threatLevel;
      const trend = this.securityTrend(game);
      const cells = [
        {
          cls: 'turn',
          label: '回合 / 时间',
          value: `${game.turn} / ${player.totalTurns}`,
          foot: ZDD.clockText(game.turn),
          footClass: 'calm',
          color: 'var(--accent)',
        },
        {
          cls: `threat${threat >= 4 ? ' high' : ''}`,
          label: '威胁等级',
          value: `${threat} / 5`,
          color: threat >= 4 ? 'var(--red)' : 'var(--orange)',
          ratio: threat / 5,
        },
        {
          cls: 'security',
          label: '系统安全度',
          value: `${player.security}%`,
          delta: player.turnDelta('security'),
          color: 'var(--accent)',
          ratio: player.security / 100,
          foot: trend ? `约 ${ZDD.clockText(trend.turn)} 失守` : '',
          footClass: trend && trend.sharp ? 'sharp' : '',
        },
        {
          cls: `funds${player.funds <= ZDD.consts.FUNDS_WARN ? ' low' : ''}`,
          label: '公司资金',
          value: ZDD.formatMoney(player.funds),
          delta: player.turnDelta('funds'),
          color: player.funds <= ZDD.consts.FUNDS_WARN ? 'var(--red)' : 'var(--yellow)',
        },
        {
          cls: 'ap',
          label: '行动点',
          value: `${player.actionPoints} / ${player.maxActionPoints}`,
          color: 'var(--green)',
          ratio: player.actionPoints / Math.max(1, player.maxActionPoints),
        },
        {
          cls: 'reputation',
          label: '公司声誉',
          value: `${player.reputation}%`,
          delta: player.turnDelta('reputation'),
          color: 'var(--purple)',
          ratio: player.reputation / 100,
        },
        {
          cls: 'availability',
          label: '服务可用性',
          value: `${player.availability}%`,
          delta: player.turnDelta('availability'),
          color: 'var(--green)',
          ratio: player.availability / 100,
        },
        {
          cls: 'integrity',
          label: '数据完整度',
          value: `${player.integrity}%`,
          delta: player.turnDelta('integrity'),
          color: 'var(--blue)',
          ratio: player.integrity / 100,
        },
      ];

      this.refs.metrics.innerHTML = cells.map((cell) => {
        const delta = Number(cell.delta || 0);
        const deltaHtml = delta
          ? `<span class="metric-delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}</span>`
          : '';
        const sub = cell.sub ? `<span class="metric-sub ${cell.subClass || ''}">${esc(cell.sub)}</span>` : '';
        const bar = typeof cell.ratio === 'number'
          ? `<div class="metric-bar" style="color:${cell.color}"><i style="width:${Math.max(0, Math.min(1, cell.ratio)) * 100}%"></i></div>`
          : '<div class="metric-bar" style="visibility:hidden"></div>';
        const foot = cell.foot
          ? `<span class="metric-foot ${cell.footClass || ''}">${esc(cell.foot)}</span>`
          : '';
        return `
          <div class="metric ${cell.cls}" role="listitem" title="${esc(cell.label)}">
            <div class="metric-label">${esc(cell.label)}</div>
            <div class="metric-value">${esc(cell.value)}${deltaHtml}${sub}</div>
            ${bar}${foot}
          </div>
        `;
      }).join('');

      this.markMetricChanges(cells);
    }

    numericValue(cell) {
      const match = String(cell.value).match(/-?\d+/);
      return match ? Number(match[0]) : null;
    }

    /** 只有“单个数字”的指标才做滚动；回合/威胁/行动点是分数形式，直接跳过。 */
    metricFormat(key) {
      const map = {
        funds: { prefix: '¥', suffix: '' },
        security: { prefix: '', suffix: '%' },
        availability: { prefix: '', suffix: '%' },
        integrity: { prefix: '', suffix: '%' },
        reputation: { prefix: '', suffix: '%' },
      };
      return map[key] || null;
    }

    /** C3：指标掉了要“疼”一下——闪一下红，数字从旧值滚到新值。 */
    markMetricChanges(cells) {
      const previous = this.lastMetrics || {};
      const next = {};
      for (const cell of cells) {
        const key = String(cell.cls).split(' ')[0];
        next[key] = cell;
        const format = this.metricFormat(key);
        if (!format) continue;
        const before = previous[key];
        if (!before || before.value === cell.value) continue;
        const from = this.numericValue(before);
        const to = this.numericValue(cell);
        if (from === null || to === null || from === to) continue;
        const node = this.refs.metrics.querySelector(`.metric.${key}`);
        if (!node) continue;
        node.classList.add(to > from ? 'tick-up' : 'tick-down');
        this.tweenMetric(node, format, from, to);
      }
      this.lastMetrics = next;
    }

    tweenMetric(node, format, from, to) {
      const valueEl = node.querySelector('.metric-value');
      const textNode = valueEl ? valueEl.firstChild : null;
      if (!textNode || textNode.nodeType !== 3) return;
      const raf = global.requestAnimationFrame;
      if (!raf) {
        textNode.nodeValue = `${format.prefix}${to}${format.suffix}`;
        return;
      }
      const started = global.performance ? global.performance.now() : Date.now();
      const step = (now) => {
        const progress = Math.min(1, Math.max(0, (now - started) / 520));
        const eased = 1 - (1 - progress) ** 3;
        const value = Math.round(from + (to - from) * eased);
        textNode.nodeValue = `${format.prefix}${value}${format.suffix}`;
        if (progress < 1) raf(step);
      };
      raf(step);
    }

    /**
     * B3 趋势预判：按最近两回合安全度的平均跌幅，推算“大约几点会失守”。
     * 只读 player.changes，不动任何数值；不足两回合的数据就不显示。
     */
    securityTrend(game) {
      if (game.state !== 'playing') return null;
      const player = game.player;
      const byTurn = new Map();
      for (const change of player.changes) {
        if (change.key !== 'security') continue;
        byTurn.set(change.turn, (byTurn.get(change.turn) || 0) + change.delta);
      }
      const turns = [...byTurn.keys()]
        .filter((turn) => turn > 0)
        .sort((a, b) => b - a)
        .slice(0, 2);
      if (turns.length < 2) return null;
      const average = turns.reduce((sum, turn) => sum + Number(byTurn.get(turn) || 0), 0) / turns.length;
      if (average > -0.5) return null;
      const turnsLeft = Math.max(1, Math.ceil(player.security / -average));
      const leakTurn = game.turn + turnsLeft;
      if (leakTurn > player.totalTurns) return null;
      return { turn: leakTurn, sharp: turnsLeft <= 2 };
    }

    renderDevice(game) {
      const device = game.selectedDevice();
      const alert = game.selectedAlert;
      const views = game.services.views(game.devices);
      const outages = views.filter((view) => view.interrupted);

      this.refs.deviceTitle.textContent = device ? `设备详情 · ${device.name}` : '值班简报';
      this.refs.deviceMeta.textContent = outages.length
        ? `业务中断 ${outages.length} 项 · 点空白返回总览`
        : '业务正常 · 点空白返回总览';

      if (!device) {
        const active = game.events.activeEvents().length;
        const states = {};
        const services = views.slice(0, 6).map((view) => {
          const key = String(view.config.id || view.config.shortName);
          const previous = this.lastServiceStates[key];
          states[key] = view.status;
          // C3：业务刚掉线时红一下，刚恢复时绿一下
          let pulse = '';
          if (previous && previous !== view.status) {
            if (view.status === '正常') pulse = ' back';
            else pulse = ' lost';
          }
          const loss = view.revenueLoss > 0 ? `<span class="loss">-¥${view.revenueLoss}</span>` : '';
          return `
            <div class="service${pulse}" data-status="${esc(view.status)}">
              <i class="dot"></i>
              <span class="name">${esc(view.config.shortName)}</span>
              <span class="state">${esc(view.status)}</span>
              ${loss}
            </div>
          `;
        }).join('');
        this.lastServiceStates = states;
        this.refs.devicePanel.innerHTML = `
          <p class="briefing-goal">夜班目标：在 08:00 前阻止全部攻击链，并尽量保持业务在线。</p>
          <p class="briefing-meta">威胁 ${game.threatLevel}/5 · 活跃 ${active} · 收入 ¥${game.services.income(game.devices)}/${ZDD.consts.TURN_INCOME}</p>
          <div class="services-grid">${services}</div>
          <p class="panel-hint">服务中断会减少收入并触发 SLA 违约；点击节点可查看设备与处置选项。</p>
        `;
        return;
      }

      const statusColor = ZDD.STATUS_COLORS[device.status] || 'var(--dim)';
      const healthColor = device.health > 70 ? 'var(--green)' : device.health > 40 ? 'var(--yellow)' : 'var(--red)';
      const backupLabel = device.backupProtected ? '有·已保护' : device.backups ? '有' : '无';
      const recent = this.recentLog(game, device);
      const facts = `
        <span>安全等级 <b>${stars(device.securityLevel)}</b></span>
        <span>重要度 <b>${stars(device.importance)}</b></span>
        <span>补丁：<b style="color:${device.patched ? 'var(--green)' : 'var(--red)'}">${device.patched ? '已安装' : '缺失'}</b></span>
        <span>备份：<b style="color:${device.backupProtected ? 'var(--purple)' : device.backups ? 'var(--green)' : 'var(--faint)'}">${backupLabel}</b></span>
        <span>漏洞：<b style="color:${device.vulnerabilities.length ? 'var(--yellow)' : 'var(--faint)'}">${device.vulnerabilities.length} 个</b></span>
        ${device.contact ? `<span class="contact">负责人 <b>${esc(device.contact.name)}</b>${device.contact.role ? ` · ${esc(device.contact.role)}` : ''}</span>` : ''}
      `;
      const line = `IP ${device.ip} · ${device.deviceType} · 相邻：${device.neighbors.length ? device.neighbors.join('、') : '无'}`;

      let extra = '';
      if (alert) {
        extra = this.alertSummary(game, alert);
      } else if (recent) {
        extra = `<p class="device-line">最近日志：[${esc(recent.clock)}] ${esc(recent.message)}</p>`;
      } else {
        extra = '<p class="device-line">提示：选择告警后可调查、删除邮件、重置密码或封禁来源。</p>';
      }

      this.refs.devicePanel.innerHTML = `
        <div class="device-summary">
          <span class="status-tag filled" data-status="${esc(device.status)}" style="color:${statusColor}">
            ${esc(ZDD.STATUS_GLYPHS[device.status] || '?')} ${esc(device.statusLabel)}
          </span>
          <span class="health" style="color:${healthColor}">
            健康值 ${device.health}
            <span class="health-bar"><i style="width:${device.health}%"></i></span>
          </span>
          <span class="health" style="color:${device.online ? 'var(--green)' : 'var(--faint)'}">${device.online ? '在线' : '离线'}</span>
        </div>
        <div class="device-facts">${facts}</div>
        <p class="device-line">${esc(line)}</p>
        ${extra}
      `;
    }

    recentLog(game, device) {
      for (let i = game.logs.entries.length - 1; i >= 0; i -= 1) {
        const entry = game.logs.entries[i];
        if (entry.source === device.name || entry.message.includes(device.deviceId)) return entry;
      }
      return null;
    }

    alertSummary(game, alert) {
      const event = game.eventForAlert(alert);
      const related = game.relatedAlerts(alert);
      let risk = '';
      if (event) {
        const device = game.devices[event.activeDeviceId];
        const [low, high, confidence] = game.risk.estimate(event, device, game.turn, game.confidenceBonus);
        const threatText = game.risk.threatText(low, high);
        let nextHop = '';
        if (event.nextDeviceId) {
          const nextDevice = game.devices[event.nextDeviceId];
          const name = nextDevice ? nextDevice.shortName : event.nextDeviceId;
          const blocked = nextDevice && !nextDevice.isAvailable;
          nextHop = `<span class="next-hop${blocked ? ' blocked' : ''}">下一跳 ${esc(name)}${blocked ? '（已预隔离）' : ''}</span>`;
        }
        risk = `
          <div class="risk-line">
            <span>风险估计：${low} ~ ${high}（${esc(threatText)}，置信度 ${confidence}%）</span>
            <span>线索 ${event.revealedClues}/${event.totalClues} · ${esc(event.progressText)}</span>
            ${nextHop}
          </div>
        `;
      } else {
        risk = '<div class="risk-line"><span>该告警未关联到进行中的事件，建议先调查确认。</span></div>';
      }
      return `
        <div class="alert-summary">
          <div class="alert-summary-title">
            <span>当前告警：${esc(alert.title)}</span>
            <span class="level" style="color:${alert.levelColor}">${esc(alert.displayLevel)}</span>
          </div>
          <div class="alert-summary-meta">
            <span>来源 ${esc(alert.sourceIp || '—')}</span>
            <span>账号 ${esc(alert.account || '—')}</span>
            <span style="color:${alert.statusColor}">${esc(alert.statusText)}</span>
            ${related.length ? `<span>关联 ${related.length} 条</span>` : ''}
          </div>
          ${risk}
        </div>
      `;
    }

    renderAlerts(game) {
      const list = this.refs.alertList;
      this.lastAlertScroll = list.scrollTop;
      const alerts = game.orderedAlerts;
      const unresolved = alerts.filter((alert) => !alert.resolved).length;
      const pressure = game.campaignPressureText;
      this.refs.alertMeta.textContent = `未清除 ${unresolved} / 共 ${alerts.length}${pressure ? ` · ${pressure}` : ''}`;

      if (!alerts.length) {
        list.innerHTML = '<p class="empty">暂无告警。保持监控，注意正常业务也会产生噪音。</p>';
        return;
      }

      const selectedId = game.selectedAlert ? game.selectedAlert.alertId : null;
      let html = alerts.map((alert) => {
        const target = game.devices[alert.targetId];
        const targetName = target ? target.shortName : alert.targetId;
        const related = game.relatedAlerts(alert);
        const campaign = game.campaignForAlert(alert);
        const meta = [
          `目标 ${alert.targetId} ${targetName}`,
          `第${alert.turn}回合 ${alert.clock}`,
          alert.sourceIp ? `来源 ${alert.sourceIp}` : '',
          related.length ? `关联 ${related.length} 条` : '',
          campaign ? `同源 ${campaign.actor || campaign.name}` : '',
        ].filter(Boolean);
        const pulse = alert.investigated && !alert.falsePositive && !alert.resolved
          && !alert.controlled && (alert.level === '高危' || alert.level === '极危');
        const filled = alert.investigated && !alert.falsePositive;
        return `
          <button type="button" class="alert-row${pulse ? ' pulse' : ''}"
            data-alert-id="${esc(alert.alertId)}"
            data-selected="${alert.alertId === selectedId}"
            data-resolved="${alert.resolved}"
            style="--level:${alert.levelColor}"
            title="${esc(alert.title)}">
            <span class="alert-level${filled ? ' filled' : ''}">${esc(alert.displayLevel)}</span>
            <span class="alert-title">${esc(alert.title)}</span>
            <span class="alert-status" style="color:${alert.statusColor}">${esc(alert.statusText)}</span>
            <span class="alert-meta">${meta.map((part) => {
              if (part.startsWith('同源')) return `<span class="same-actor">${esc(part)}</span>`;
              return esc(part);
            }).join(' · ')}</span>
          </button>
        `;
      }).join('');

      // A3 空态：只剩零星告警时，把大块空黑填成“值守中”，而不是留白
      if (unresolved <= 2) {
        const cleared = alerts.length - unresolved;
        html += `
          <div class="alert-idle" aria-hidden="true">
            <span class="idle-scan"></span>
            <strong>监控持续运行</strong>
            <span>已清除 ${cleared} 条 · 当前没有必须立刻处置的告警</span>
            <span>下一个巡检点 ${esc(ZDD.clockText(game.turn + 1))}</span>
          </div>
        `;
      }
      list.innerHTML = html;

      // 选中行滚动到可见区域
      const selected = list.querySelector('[data-selected="true"]');
      if (selected) {
        const top = selected.offsetTop - list.clientHeight / 2;
        list.scrollTop = Math.max(0, Math.min(top, list.scrollHeight - list.clientHeight));
      } else {
        list.scrollTop = this.lastAlertScroll;
      }
    }

    renderLogs(game, ui) {
      const list = this.refs.logList;
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 28;
      if (atBottom) this.logStickToBottom = true;
      this.lastLogScroll = list.scrollTop;

      const categories = ['全部', '邮件', '登录', '网络', '告警', '操作', '情报', '系统'];
      this.refs.logChips.innerHTML = categories.map((category) => `
        <button type="button" class="chip" role="tab" data-category="${esc(category)}"
          aria-selected="${category === ui.logCategory}">${esc(category)}</button>
      `).join('');

      if (this.refs.logSearch.value !== ui.logKeyword) this.refs.logSearch.value = ui.logKeyword;

      const entries = game.logs.search(ui.logKeyword, ui.logCategory);
      this.refs.logMeta.textContent = `${entries.length} 条${ui.logKeyword ? ' · 搜索中' : ''}`;

      if (!entries.length) {
        list.innerHTML = '<p class="empty">没有匹配的日志。清空搜索或切换分类试试。</p>';
        this.logStickToBottom = true;
        return;
      }

      const shown = entries.slice(-220);
      const html = shown.map((entry) => {
        const source = entry.source ? ` <span class="src">(${esc(entry.source)})</span>` : '';
        return `
          <div class="log-line" data-cat="${esc(entry.category)}">
            <span class="clock">[${esc(entry.clock)}]</span>
            <span class="cat">${esc(entry.category)}</span>
            <span class="log-text">${esc(entry.message)}${source}</span>
          </div>
        `;
      }).join('');
      list.innerHTML = (entries.length > shown.length
        ? `<p class="empty">仅显示最近 ${shown.length} 条，共 ${entries.length} 条；用搜索缩小范围。</p>`
        : '') + html;

      if (this.logStickToBottom) {
        list.scrollTop = list.scrollHeight;
        if (this.pinFrame === null) {
          this.pinFrame = global.requestAnimationFrame(() => {
            this.pinFrame = null;
            if (this.logStickToBottom) list.scrollTop = list.scrollHeight;
          });
        }
      } else {
        list.scrollTop = this.lastLogScroll;
      }
    }

    renderActions(game) {
      const target = game.currentTarget();
      const options = game.actions.optionsFor(game, target);
      this.lastOptions = options;
      const ap = game.player.actionPoints;

      this.refs.actionAp.textContent = `行动点 ${ap} / ${game.player.maxActionPoints}${game.combo > 1 ? ` · 连击 ×${game.combo}` : ''}`;
      this.refs.actionTarget.textContent = target
        ? `目标：${target.label}`
        : '目标：未选择 — 点击告警或设备查看可用操作';

      if (!options.length) {
        this.refs.actionGrid.innerHTML = '<p class="empty">当前没有可执行的针对性操作。</p>';
        this.writeHint('');
        return;
      }

      const confirmIndex = this.confirmIndex;
      const confirming = confirmIndex >= 0 && options[confirmIndex] && options[confirmIndex].enabled
        ? confirmIndex
        : -1;

      this.refs.actionGrid.innerHTML = options.map((option, index) => {
        const isConfirm = index === confirming;
        // A1：不可用时直接把原因写在按钮上——触屏没有 hover，藏 title 等于没写
        const cost = option.enabled
          ? (isConfirm ? '再点一次确认' : `AP ${option.apCost} · ¥${option.moneyCost}`)
          : (option.reason || '不可用');
        const title = option.enabled
          ? `${option.name} · AP ${option.apCost} · ¥${option.moneyCost}${isConfirm ? '（再点一次确认执行）' : ''}`
          : `${option.name}：${option.reason}`;
        return `
        <button type="button" class="act${isConfirm ? ' is-confirm' : ''}" data-action-index="${index}"
          data-action-id="${esc(option.actionId)}" data-style="${esc(option.style)}"
          ${option.enabled ? '' : 'disabled aria-disabled="true"'}
          title="${esc(title)}">
          ${index < 9 ? `<span class="act-key" aria-hidden="true">${index + 1}</span>` : ''}
          <span class="act-name">${esc(option.name)}</span>
          <span class="act-cost">${esc(cost)}</span>
        </button>
      `;
      }).join('');

      if (confirming >= 0) {
        const option = options[confirming];
        this.writeHint(`${option.name}：这一步不可逆，再点一次确认执行；4 秒内不确认会自动取消。`);
        return;
      }

      // C2：操作反馈显示在提示行里，就地、不挡屏幕
      const feedback = this.activeFeedback();
      if (feedback) {
        this.writeFeedback(feedback);
        return;
      }

      const disabled = options.filter((option) => !option.enabled);
      this.writeHint(disabled.length === options.length && disabled[0]
        ? `${disabled[0].name}：${disabled[0].reason}`
        : '操作后只完成一步：调查 → 控制 → 清除 → 恢复。键盘 1–6 可直接执行对应按钮。');
    }

    writeHint(text) {
      const hint = this.refs.actionHint;
      hint.classList.remove('is-feedback');
      hint.style.removeProperty('--fb-color');
      hint.title = '';
      hint.textContent = text;
    }

    writeFeedback(feedback) {
      const hint = this.refs.actionHint;
      const color = ZDD.colors[feedback.color] || 'var(--green)';
      hint.classList.add('is-feedback');
      hint.style.setProperty('--fb-color', color);
      hint.title = `${feedback.title}${feedback.detail ? `：${feedback.detail}` : ''}`;
      hint.innerHTML = `<b>${esc(feedback.title)}</b>${feedback.detail ? `<span>${esc(feedback.detail)}</span>` : ''}`;
    }

    renderMessages(game) {
      const messages = game.messages.slice(-4);
      this.refs.messages.innerHTML = messages.map((message) => {
        const color = ZDD.colors[message.color] || 'var(--dim)';
        return `<span class="msg" style="--msg-color:${color}" title="${esc(message.text)}">${esc(message.text)}</span>`;
      }).join('');
    }
  }

  ZDD.Panels = Panels;
})(typeof globalThis !== 'undefined' ? globalThis : this);
