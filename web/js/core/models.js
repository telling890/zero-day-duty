/* 数据模型：设备、告警、安全事件、玩家状态。
 * 规则与桌面版 models/*.py 一一对应，只把 pygame 依赖去掉。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  // ------------------------------------------------------------------
  // 常量
  // ------------------------------------------------------------------
  const COLORS = {
    accent: '#00e0ff',
    accentDark: '#006e84',
    green: '#40d082',
    yellow: '#f0c43c',
    orange: '#f08c32',
    red: '#ec5854',
    purple: '#a878e6',
    tutorial: '#ae8eff',
    tutorialLight: '#e0d6ff',
    tutorialDark: '#684eb4',
    blue: '#54a0f0',
    text: '#e2ebf4',
    dim: '#899cb2',
    faint: '#58687c',
    white: '#ffffff',
  };

  const LEVEL_ORDER = { 极危: 4, 高危: 3, 中危: 2, 低危: 1, 信息: 0 };
  const LEVEL_COLORS = {
    极危: '#ff4060',
    高危: COLORS.red,
    中危: COLORS.orange,
    低危: COLORS.yellow,
    信息: COLORS.blue,
  };

  const STATUS = {
    NORMAL: '正常',
    SUSPICIOUS: '可疑',
    INFECTED: '感染',
    ISOLATED: '隔离',
    OFFLINE: '离线',
  };
  const STATUS_SEVERITY = { 正常: 0, 可疑: 1, 感染: 2, 隔离: 3, 离线: 4 };
  const STATUS_COLORS = {
    正常: COLORS.green,
    可疑: COLORS.yellow,
    感染: COLORS.red,
    隔离: COLORS.purple,
    离线: COLORS.faint,
  };
  const STATUS_GLYPHS = { 正常: '●', 可疑: '▲', 感染: '×', 隔离: '■', 离线: '○' };

  const TOTAL_TURNS = 10;
  const START_HOUR = 22;
  const ACTION_POINTS_PER_TURN = 6;
  const TURN_INCOME = 120;
  const TURN_UPKEEP = 40;
  const INITIAL = {
    security: 74,
    funds: 1200,
    reputation: 78,
    availability: 100,
    integrity: 100,
  };
  const SECURITY_FAIL = 0;
  const INTEGRITY_FAIL = 20;
  const AVAILABILITY_FAIL = 40;
  const AVAILABILITY_FAIL_TURNS = 3;
  const FUNDS_WARN = 120;

  const METRIC_LABELS = {
    security: '系统安全度',
    funds: '公司资金',
    reputation: '公司声誉',
    availability: '服务可用性',
    integrity: '数据完整度',
  };

  const LOG_CATEGORIES = ['邮件', '登录', '网络', '告警', '操作', '情报', '系统'];

  function clockText(turn) {
    const hour = (START_HOUR + Math.max(0, Number(turn) - 1)) % 24;
    return `${String(hour).padStart(2, '0')}:00`;
  }

  function formatMoney(value) {
    return `¥${value}`;
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  // ------------------------------------------------------------------
  // 设备
  // ------------------------------------------------------------------
  class Device {
    constructor(config) {
      this.deviceId = String(config.id);
      this.name = String(config.name);
      this.shortName = String(config.short);
      this.deviceType = String(config.type);
      this.ip = String(config.ip);
      this.securityLevel = Number(config.security_level);
      this.importance = Number(config.importance);
      this.critical = Boolean(config.critical);
      this.patched = Boolean(config.patched);
      this.vulnerabilities = (config.vulnerabilities || []).map(String);
      this.neighbors = (config.neighbors || []).map(String);
      this.backups = Boolean(config.backups);
      const pos = Array.isArray(config.pos) ? config.pos : [0.5, 0.5];
      this.pos = [clamp(Number(pos[0]), 0, 1), clamp(Number(pos[1]), 0, 1)];

      this.health = 100;
      this.online = true;
      this.status = STATUS.NORMAL;
      this.isolated = false;
      this.lastLog = '';
      this.statusBeforeIsolation = STATUS.NORMAL;
      this.statusBeforeOffline = STATUS.NORMAL;
      this.backupProtected = false;
      this.maintenanceTurns = 0;
    }

    static fromConfig(config) {
      const required = [
        'id', 'name', 'short', 'type', 'ip', 'security_level', 'importance',
        'critical', 'patched', 'vulnerabilities', 'neighbors', 'backups', 'pos',
      ];
      const missing = required.filter((key) => !(key in config));
      if (missing.length) throw new Error(`设备配置缺少字段 ${missing.join(',')}`);
      return new Device(config);
    }

    get statusLabel() {
      return this.status;
    }

    /** 暴露程度：安全等级越低、漏洞越多、未打补丁，越容易被利用。 */
    get exposure() {
      const levelPart = Math.max(0, 6 - this.securityLevel);
      const patchPart = this.patched ? 0 : 2;
      const vulnPart = Math.min(3, this.vulnerabilities.length);
      return levelPart + patchPart + vulnPart;
    }

    get isAvailable() {
      return this.online && !this.isolated;
    }

    get canShutdown() {
      return this.deviceType === '服务器' || this.deviceType === '网络设备';
    }

    setStatus(status) {
      if (!(status in STATUS_SEVERITY)) return;
      this.status = status;
      if (status === STATUS.OFFLINE) this.online = false;
      else if (status !== STATUS.ISOLATED && !this.online) this.online = true;
    }

    isolate() {
      if (!this.isolated) {
        this.statusBeforeIsolation = [STATUS.NORMAL, STATUS.SUSPICIOUS, STATUS.INFECTED].includes(this.status)
          ? this.status
          : STATUS.NORMAL;
      }
      this.isolated = true;
      this.status = STATUS.ISOLATED;
    }

    restore() {
      this.isolated = false;
      this.online = true;
      const previous = this.statusBeforeIsolation;
      this.status = [STATUS.NORMAL, STATUS.SUSPICIOUS, STATUS.INFECTED].includes(previous)
        ? previous
        : STATUS.NORMAL;
    }

    shutdown() {
      if (!this.isolated) {
        this.statusBeforeOffline = [STATUS.NORMAL, STATUS.SUSPICIOUS, STATUS.INFECTED].includes(this.status)
          ? this.status
          : STATUS.NORMAL;
      }
      this.online = false;
      this.status = STATUS.OFFLINE;
    }

    startup() {
      this.online = true;
      this.status = [STATUS.NORMAL, STATUS.SUSPICIOUS, STATUS.INFECTED].includes(this.statusBeforeOffline)
        ? this.statusBeforeOffline
        : STATUS.NORMAL;
    }

    applyPatch() {
      this.patched = true;
      this.vulnerabilities = [];
      this.health = Math.min(100, this.health + 5);
      this.maintenanceTurns = 2;
    }

    protectBackup() {
      this.backupProtected = true;
    }

    consumeBackup() {
      this.backups = false;
    }

    tickMaintenance() {
      if (this.maintenanceTurns > 0) this.maintenanceTurns -= 1;
    }

    damage(amount) {
      this.health = clamp(this.health - Number(amount), 0, 100);
    }

    toState() {
      return {
        health: this.health,
        online: this.online,
        status: this.status,
        isolated: this.isolated,
        status_before_isolation: this.statusBeforeIsolation,
        status_before_offline: this.statusBeforeOffline,
        backup_protected: this.backupProtected,
        maintenance_turns: this.maintenanceTurns,
        backups: this.backups,
        patched: this.patched,
        vulnerabilities: this.vulnerabilities.slice(),
      };
    }

    applyState(state) {
      if (!state || typeof state !== 'object') return;
      this.health = Number(state.health ?? this.health);
      this.online = Boolean(state.online ?? this.online);
      if (String(state.status ?? '') in STATUS_SEVERITY) this.status = String(state.status);
      this.isolated = Boolean(state.isolated ?? this.isolated);
      this.statusBeforeIsolation = String(state.status_before_isolation ?? this.statusBeforeIsolation);
      this.statusBeforeOffline = String(state.status_before_offline ?? this.statusBeforeOffline);
      this.backupProtected = Boolean(state.backup_protected ?? this.backupProtected);
      this.maintenanceTurns = Math.max(0, Number(state.maintenance_turns ?? this.maintenanceTurns) | 0);
      this.backups = Boolean(state.backups ?? this.backups);
      this.patched = Boolean(state.patched ?? this.patched);
      if (Array.isArray(state.vulnerabilities)) this.vulnerabilities = state.vulnerabilities.map(String);
    }
  }

  // ------------------------------------------------------------------
  // 告警
  // ------------------------------------------------------------------
  class Alert {
    constructor(opts) {
      this.alertId = String(opts.alertId);
      this.title = String(opts.title);
      this.level = opts.level in LEVEL_ORDER ? opts.level : '信息';
      this.targetId = String(opts.targetId);
      this.turn = Number(opts.turn || 1);
      this.clock = String(opts.clock || '');
      this.eventId = opts.eventId || null;
      this.sourceIp = String(opts.sourceIp || '');
      this.account = String(opts.account || '');
      this.detail = String(opts.detail || '');
      this.falsePositive = Boolean(opts.falsePositive);
      this.conclusion = String(opts.conclusion || '');

      this.investigated = false;
      this.verdict = '';
      this.controlled = false;
      this.resolved = false;
      this.resolveNote = '';
    }

    get levelPriority() {
      return LEVEL_ORDER[this.level] || 0;
    }

    get displayLevel() {
      if (!this.investigated) return '待评估';
      if (this.falsePositive) return '误报';
      return this.level;
    }

    get displayPriority() {
      return this.investigated ? this.levelPriority : 1;
    }

    get levelColor() {
      if (!this.investigated) return COLORS.dim;
      if (this.falsePositive) return COLORS.faint;
      return LEVEL_COLORS[this.level] || COLORS.dim;
    }

    get statusText() {
      if (this.resolved) return '已清除';
      if (this.controlled) return '已控制·待清除';
      if (this.investigated) return this.verdict ? `已调查·${this.verdict}` : '已调查';
      return '未调查';
    }

    get statusColor() {
      if (this.resolved) return COLORS.green;
      if (this.controlled) return COLORS.yellow;
      if (this.investigated) return this.verdict === '真实威胁' ? COLORS.yellow : COLORS.dim;
      return COLORS.dim;
    }

    markInvestigated(verdict) {
      this.investigated = true;
      this.verdict = verdict;
    }

    markControlled(note) {
      if (this.resolved) return;
      this.controlled = true;
      this.resolveNote = note || '';
    }

    resolve(note) {
      this.resolved = true;
      this.controlled = false;
      this.resolveNote = note || '';
      if (!this.investigated) {
        this.investigated = true;
        this.verdict = '真实威胁';
      }
    }

    sortKey() {
      return [
        this.resolved ? 1 : 0,
        this.controlled ? 1 : 0,
        -this.displayPriority,
        -this.turn,
      ];
    }

    toDict() {
      return {
        alert_id: this.alertId,
        title: this.title,
        level: this.level,
        target_id: this.targetId,
        turn: this.turn,
        clock: this.clock,
        event_id: this.eventId,
        source_ip: this.sourceIp,
        account: this.account,
        detail: this.detail,
        false_positive: this.falsePositive,
        conclusion: this.conclusion,
        investigated: this.investigated,
        verdict: this.verdict,
        controlled: this.controlled,
        resolved: this.resolved,
        resolve_note: this.resolveNote,
      };
    }

    static fromDict(data) {
      const alert = new Alert({
        alertId: data.alert_id || 'A-000',
        title: data.title || '未知告警',
        level: data.level || '信息',
        targetId: data.target_id || '',
        turn: data.turn || 1,
        clock: data.clock || '',
        eventId: data.event_id || null,
        sourceIp: data.source_ip || '',
        account: data.account || '',
        detail: data.detail || '',
        falsePositive: data.false_positive || false,
        conclusion: data.conclusion || '',
      });
      alert.investigated = Boolean(data.investigated);
      alert.verdict = String(data.verdict || '');
      alert.controlled = Boolean(data.controlled);
      alert.resolved = Boolean(data.resolved);
      alert.resolveNote = String(data.resolve_note || '');
      return alert;
    }
  }

  // ------------------------------------------------------------------
  // 安全事件
  // ------------------------------------------------------------------
  class SecurityEvent {
    constructor(config, spawnTurn) {
      const required = ['id', 'name', 'type', 'initial_target', 'severity', 'stages'];
      const missing = required.filter((key) => !(key in config));
      if (missing.length) throw new Error(`事件配置缺少字段 ${missing.join(',')}（事件 ${config.id || '未知'}）`);
      if (!Array.isArray(config.stages) || !config.stages.length) {
        throw new Error(`事件 ${config.id} 的 stages 必须是非空列表`);
      }

      this.config = config;
      this.eventId = String(config.id);
      this.name = String(config.name);
      this.eventType = String(config.type);
      this.targetId = String(config.initial_target);
      this.severity = Number(config.severity);
      this.severityLabel = String(config.severity_label || '中危');
      this.account = String(config.account || '');
      this.sourceIp = String(config.source_ip || '');
      this.summary = String(config.summary || '');
      this.failureEnding = String(config.failure_ending || 'data_leak');
      this.campaignId = String(config.campaign_id || '');
      this.failureCosts = {};
      if (config.failure_costs && typeof config.failure_costs === 'object') {
        for (const [key, value] of Object.entries(config.failure_costs)) {
          const num = Number(value);
          if (Number.isFinite(num)) this.failureCosts[String(key)] = num;
        }
      }
      this.stages = config.stages;

      this.stageIndex = 0;
      this.startTurn = Number(spawnTurn);
      this.lastAdvanceTurn = Number(spawnTurn);
      this.contained = false;
      this.containmentMethod = '';
      this.containmentDevice = '';
      this.containedTurn = 0;
      this.eradicated = false;
      this.eradicationMethod = '';
      this.eradicatedTurn = 0;
      this.failed = false;
      this.failedTurn = 0;
      this.investigations = 0;
      this.revealedClues = 0;
      this.credentialsReset = false;
      this.sourceBlocked = false;
      this.responseTurn = null;
      this.rewarded = false;
      this.hiddenRevealed = false;
    }

    get stage() {
      return this.stages[this.stageIndex];
    }

    get stageName() {
      return String(this.stage.name || `阶段${this.stageIndex + 1}`);
    }

    get maxStageIndex() {
      return this.stages.length - 1;
    }

    get progressText() {
      return `阶段 ${this.stageIndex + 1}/${this.stages.length}`;
    }

    get activeDeviceId() {
      return String(this.stage.active_device || this.targetId);
    }

    get isActive() {
      return !this.contained && !this.eradicated && !this.failed;
    }

    get isResolved() {
      return this.eradicated;
    }

    get statusText() {
      if (this.eradicated) return '已清除';
      if (this.contained) return '已控制·待清除';
      if (this.failed) return '已失守';
      if (this.investigations > 0) return '调查中';
      return '待调查';
    }

    get nextDeviceId() {
      if (this.stageIndex >= this.maxStageIndex) return '';
      const nextStage = this.stages[this.stageIndex + 1];
      return String(nextStage.active_device || this.targetId);
    }

    get nextStageName() {
      if (this.stageIndex >= this.maxStageIndex) return '';
      return String(this.stages[this.stageIndex + 1].name || '');
    }

    advance() {
      if (this.stageIndex >= this.maxStageIndex) return false;
      this.stageIndex += 1;
      return true;
    }

    revealNextClue() {
      const clues = (this.stage.clues || []).map(String);
      if (this.revealedClues < clues.length) {
        const clue = clues[this.revealedClues];
        this.revealedClues += 1;
        return clue;
      }
      const hidden = String(this.stage.hidden_clue || '');
      if (hidden && !this.hiddenRevealed) {
        this.hiddenRevealed = true;
        return hidden;
      }
      return null;
    }

    get totalClues() {
      return (this.stage.clues || []).length;
    }

    markContained(method, turn, deviceId) {
      this.contained = true;
      this.containmentMethod = method;
      this.containedTurn = turn;
      this.containmentDevice = deviceId || '';
      this.lastAdvanceTurn = turn;
    }

    markEradicated(method, turn, deviceId) {
      if (!this.contained) this.markContained(method, turn, deviceId);
      this.eradicated = true;
      this.eradicationMethod = method;
      this.eradicatedTurn = turn;
      this.containmentMethod = this.containmentMethod || method;
      this.containmentDevice = this.containmentDevice || deviceId || '';
    }

    resume() {
      if (this.eradicated) return;
      this.contained = false;
      this.containmentMethod = '';
      this.containmentDevice = '';
      this.containedTurn = 0;
    }

    markFailed(turn) {
      this.failed = true;
      this.failedTurn = turn;
    }

    stageCost(key) {
      const value = Number(this.stage[key] || 0);
      return Number.isFinite(value) ? value : 0;
    }

    stageText(key, fallback) {
      const value = this.stage[key];
      return value === undefined || value === null ? fallback || '' : String(value);
    }

    toState() {
      return {
        event_id: this.eventId,
        campaign_id: this.campaignId,
        stage_index: this.stageIndex,
        start_turn: this.startTurn,
        last_advance_turn: this.lastAdvanceTurn,
        contained: this.contained,
        containment_method: this.containmentMethod,
        containment_device: this.containmentDevice,
        contained_turn: this.containedTurn,
        eradicated: this.eradicated,
        eradication_method: this.eradicationMethod,
        eradicated_turn: this.eradicatedTurn,
        failed: this.failed,
        failed_turn: this.failedTurn,
        investigations: this.investigations,
        revealed_clues: this.revealedClues,
        hidden_revealed: this.hiddenRevealed,
        credentials_reset: this.credentialsReset,
        source_blocked: this.sourceBlocked,
        response_turn: this.responseTurn,
        rewarded: this.rewarded,
      };
    }

    applyState(state) {
      if (!state || typeof state !== 'object') return;
      this.campaignId = String(state.campaign_id ?? this.campaignId);
      this.stageIndex = clamp(Number(state.stage_index ?? 0) | 0, 0, this.maxStageIndex);
      this.startTurn = Number(state.start_turn ?? this.startTurn);
      this.lastAdvanceTurn = Number(state.last_advance_turn ?? this.lastAdvanceTurn);
      this.contained = Boolean(state.contained);
      this.containmentMethod = String(state.containment_method || '');
      this.containmentDevice = String(state.containment_device || '');
      this.containedTurn = Number(state.contained_turn || 0);
      this.eradicated = Boolean(state.eradicated);
      this.eradicationMethod = String(state.eradication_method || '');
      this.eradicatedTurn = Number(state.eradicated_turn || 0);
      this.failed = Boolean(state.failed);
      this.failedTurn = Number(state.failed_turn || 0);
      this.investigations = Math.max(0, Number(state.investigations || 0) | 0);
      this.revealedClues = Math.max(0, Number(state.revealed_clues || 0) | 0);
      this.hiddenRevealed = Boolean(state.hidden_revealed);
      this.credentialsReset = Boolean(state.credentials_reset);
      this.sourceBlocked = Boolean(state.source_blocked);
      this.responseTurn = Number.isFinite(Number(state.response_turn)) && state.response_turn !== null
        ? Number(state.response_turn)
        : null;
      this.rewarded = Boolean(state.rewarded);
    }
  }

  // ------------------------------------------------------------------
  // 玩家状态
  // ------------------------------------------------------------------
  function newStats() {
    return {
      actions_used: 0,
      investigations: 0,
      false_positives_seen: 0,
      false_positives_checked: 0,
      false_isolations: 0,
      response_turns: [],
      contained_early: 0,
      sla_breaches: 0,
    };
  }

  class PlayerState {
    constructor(opts) {
      const options = opts || {};
      this.security = Number(options.security ?? INITIAL.security);
      this.funds = Number(options.funds ?? INITIAL.funds);
      this.reputation = Number(options.reputation ?? INITIAL.reputation);
      this.availability = Number(options.availability ?? INITIAL.availability);
      this.integrity = Number(options.integrity ?? INITIAL.integrity);
      this.actionPoints = Number(options.actionPoints ?? ACTION_POINTS_PER_TURN);
      this.maxActionPoints = ACTION_POINTS_PER_TURN;
      this.turn = 0;
      this.totalTurns = TOTAL_TURNS;
      this.changes = [];
      this.stats = newStats();
      this.upgrades = new Set();
    }

    get(key) {
      return Number(this[key]);
    }

    bounds(key) {
      if (key === 'funds') return [0, 999999];
      return [0, 100];
    }

    adjust(key, delta, reason) {
      const amount = Number(delta) | 0;
      if (!amount) return 0;
      const [low, high] = this.bounds(key);
      const old = Number(this[key]);
      const next = clamp(old + amount, low, high);
      const actual = next - old;
      if (!actual) return 0;
      this[key] = next;
      this.changes.push({ turn: this.turn, key, delta: actual, reason });
      if (this.changes.length > 400) this.changes = this.changes.slice(-400);
      return actual;
    }

    turnDelta(key) {
      return this.changes
        .filter((change) => change.turn === this.turn && change.key === key)
        .reduce((sum, change) => sum + change.delta, 0);
    }

    recentChanges(limit) {
      return this.changes.slice(-(limit || 6));
    }

    canPay(ap, money) {
      return this.actionPoints >= ap && this.funds >= money;
    }

    spend(ap, money, reason) {
      if (!this.canPay(ap, money)) return false;
      this.actionPoints -= ap;
      if (money) this.adjust('funds', -money, reason);
      return true;
    }

    refreshTurn(turn) {
      this.turn = turn;
      this.actionPoints = this.maxActionPoints;
    }

    securityFailed() {
      return this.security <= SECURITY_FAIL;
    }

    integrityFailed() {
      return this.integrity <= INTEGRITY_FAIL;
    }

    availabilityWarning() {
      return this.availability <= AVAILABILITY_FAIL;
    }

    hasUpgrade(id) {
      return this.upgrades.has(id);
    }

    toDict() {
      return {
        security: this.security,
        funds: this.funds,
        reputation: this.reputation,
        availability: this.availability,
        integrity: this.integrity,
        action_points: this.actionPoints,
        max_action_points: this.maxActionPoints,
        turn: this.turn,
        total_turns: this.totalTurns,
        changes: this.changes.slice(-200),
        stats: this.stats,
        upgrades: Array.from(this.upgrades).sort(),
      };
    }

    static fromDict(data) {
      const source = data || {};
      const player = new PlayerState({
        security: Number(source.security ?? INITIAL.security),
        funds: Number(source.funds ?? INITIAL.funds),
        reputation: Number(source.reputation ?? INITIAL.reputation),
        availability: Number(source.availability ?? INITIAL.availability),
        integrity: Number(source.integrity ?? INITIAL.integrity),
        actionPoints: Number(source.action_points ?? ACTION_POINTS_PER_TURN),
      });
      player.maxActionPoints = Number(source.max_action_points ?? ACTION_POINTS_PER_TURN);
      player.turn = Number(source.turn || 0);
      player.totalTurns = Number(source.total_turns ?? TOTAL_TURNS);
      if (Array.isArray(source.changes)) {
        player.changes = source.changes.slice(-200).map((item) => ({
          turn: Number(item.turn || 0),
          key: String(item.key || ''),
          delta: Number(item.delta || 0),
          reason: String(item.reason || ''),
        }));
      }
      if (source.stats && typeof source.stats === 'object') {
        player.stats = Object.assign(newStats(), source.stats);
        if (!Array.isArray(player.stats.response_turns)) player.stats.response_turns = [];
      }
      if (Array.isArray(source.upgrades)) player.upgrades = new Set(source.upgrades.map(String));
      return player;
    }

    snapshot() {
      return {
        security: this.security,
        funds: this.funds,
        reputation: this.reputation,
        availability: this.availability,
        integrity: this.integrity,
        action_points: this.actionPoints,
        turn: this.turn,
      };
    }
  }

  // ------------------------------------------------------------------
  // 操作目标
  // ------------------------------------------------------------------
  class Target {
    constructor(kind, alert, device) {
      this.kind = kind;
      this.alert = alert || null;
      this.device = device || null;
    }

    get label() {
      if (this.kind === 'alert' && this.alert) return `告警「${this.alert.title}」`;
      if (this.kind === 'device' && this.device) return `设备 ${this.device.name}`;
      return '未选择目标';
    }
  }

  ZDD.colors = COLORS;
  ZDD.LEVEL_COLORS = LEVEL_COLORS;
  ZDD.STATUS = STATUS;
  ZDD.STATUS_COLORS = STATUS_COLORS;
  ZDD.STATUS_GLYPHS = STATUS_GLYPHS;
  ZDD.STATUS_SEVERITY = STATUS_SEVERITY;
  ZDD.METRIC_LABELS = METRIC_LABELS;
  ZDD.LOG_CATEGORIES = LOG_CATEGORIES;
  ZDD.consts = {
    TOTAL_TURNS,
    START_HOUR,
    ACTION_POINTS_PER_TURN,
    TURN_INCOME,
    TURN_UPKEEP,
    INITIAL,
    SECURITY_FAIL,
    INTEGRITY_FAIL,
    AVAILABILITY_FAIL,
    AVAILABILITY_FAIL_TURNS,
    FUNDS_WARN,
  };
  ZDD.clockText = clockText;
  ZDD.formatMoney = formatMoney;
  ZDD.clamp = clamp;
  ZDD.models = { Device, Alert, SecurityEvent, PlayerState, Target, newStats };
})(typeof globalThis !== 'undefined' ? globalThis : this);
