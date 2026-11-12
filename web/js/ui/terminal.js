/* 处置终端：可以输入命令的 SOC 控制台。
 * 它只是操作面板的另一种输入方式：同样调用 ZDD.ActionManager / Game.performAction，
 * 不新增规则，不连接真实网络，也不执行任何真实系统命令。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  const COMMANDS = {
    help: { aliases: ['?', 'man'], usage: 'help [命令]', desc: '显示命令列表或单条命令说明' },
    status: { aliases: ['st', 'whoami', 'uptime'], usage: 'status', desc: '查看回合、指标、行动点与威胁等级' },
    devices: { aliases: ['ls', 'devs', 'hosts'], usage: 'devices', desc: '列出设备、IP、状态与补丁' },
    alerts: { aliases: ['alert', 'al'], usage: 'alerts', desc: '列出告警、等级与调查状态' },
    logs: { aliases: ['log', 'tail'], usage: 'logs [关键词] [条数]', desc: '打印最近日志' },
    upgrades: { aliases: ['shop', 'store', 'upg'], usage: 'upgrades', desc: '查看安全加固与价格' },
    scan: { aliases: ['investigate', 'inv'], usage: 'scan <设备|#告警>', desc: '调查告警，揭示线索与下一跳' },
    isolate: { aliases: ['iso', 'contain', 'quarantine'], usage: 'isolate <设备>', desc: '隔离设备，阻止攻击扩散' },
    release: { aliases: ['unisolate', 'uniso'], usage: 'release <设备>', desc: '解除隔离，恢复业务' },
    clean: { aliases: ['eradicate', 'purge'], usage: 'clean <设备>', desc: '清除已控制事件的根因' },
    patch: { aliases: ['fix'], usage: 'patch <设备>', desc: '安装安全补丁' },
    shutdown: { aliases: ['shut', 'off'], usage: 'shutdown <设备>', desc: '关闭服务器 / 网络设备' },
    start: { aliases: ['boot', 'startup'], usage: 'start <设备>', desc: '启动已关闭的设备' },
    restore: { aliases: ['recover'], usage: 'restore <设备>', desc: '从备份恢复设备' },
    mail: { aliases: ['delmail'], usage: 'mail <设备>', desc: '删除钓鱼邮件（需先调查）' },
    passwd: { aliases: ['resetpw', 'password'], usage: 'passwd <设备>', desc: '重置账号密码（需先调查）' },
    block: { aliases: ['ban'], usage: 'block <IP|设备>', desc: '封禁告警来源 IP' },
    protect: { aliases: ['protectbak'], usage: 'protect backup', desc: '保护备份服务器 BAK-01' },
    select: { aliases: ['focus', 'cd'], usage: 'select <设备|#告警>', desc: '在界面中选中目标' },
    next: { aliases: ['advance', 'turn'], usage: 'next', desc: '推进到下一个小时' },
    buy: { aliases: ['purchase'], usage: 'buy <加固ID>', desc: '购买安全加固' },
    save: { aliases: [], usage: 'save', desc: '保存进度到浏览器' },
    history: { aliases: ['hist'], usage: 'history', desc: '查看本次会话的命令历史' },
    date: { aliases: ['time'], usage: 'date', desc: '显示值班时间与剩余小时' },
    ping: { aliases: [], usage: 'ping [设备]', desc: '模拟连通性检查（不发送真实网络包）' },
    clear: { aliases: ['cls'], usage: 'clear', desc: '清屏' },
    exit: { aliases: ['quit', 'q', 'close'], usage: 'exit', desc: '关闭终端（Esc）' },
  };

  const HELP_GROUPS = [
    ['查询', ['help', 'status', 'devices', 'alerts', 'logs', 'upgrades', 'date', 'ping']],
    ['处置', ['scan', 'isolate', 'release', 'clean', 'patch', 'shutdown', 'start', 'restore', 'mail', 'passwd', 'block', 'protect']],
    ['流程', ['next', 'select', 'buy', 'save', 'history', 'clear', 'exit']],
  ];

  const EXAMPLES = {
    help: 'help isolate',
    status: 'status',
    devices: 'devices',
    alerts: 'alerts',
    logs: 'logs PC-01 12',
    upgrades: 'upgrades',
    scan: 'scan PC-01 / scan #1',
    isolate: 'isolate PC-01',
    release: 'release PC-01',
    clean: 'clean PC-01',
    patch: 'patch WEB-01',
    shutdown: 'shutdown DB-01',
    start: 'start DB-01',
    restore: 'restore DB-01',
    mail: 'mail PC-01',
    passwd: 'passwd PC-01',
    block: 'block 198.51.100.23',
    protect: 'protect backup',
    select: 'select #1',
    next: 'next',
    buy: 'buy log_plugin',
    save: 'save',
    history: 'history',
    date: 'date',
    ping: 'ping PC-01',
    clear: 'clear',
    exit: 'exit',
  };

  const ZH = {
    帮助: 'help',
    状态: 'status',
    设备: 'devices',
    告警: 'alerts',
    日志: 'logs',
    加固: 'upgrades',
    调查: 'scan',
    扫描: 'scan',
    隔离: 'isolate',
    解除隔离: 'release',
    解除: 'release',
    清除: 'clean',
    补丁: 'patch',
    关机: 'shutdown',
    开机: 'start',
    启动: 'start',
    恢复: 'restore',
    邮件: 'mail',
    删邮件: 'mail',
    密码: 'passwd',
    重置密码: 'passwd',
    封禁: 'block',
    保护: 'protect',
    选中: 'select',
    推进: 'next',
    购买: 'buy',
    保存: 'save',
    历史: 'history',
    时间: 'date',
    清屏: 'clear',
    退出: 'exit',
  };

  const ALERT_ACTIONS = new Set(['investigate', 'delete_mail', 'reset_password', 'block_source']);

  const PROMPT = 'nightshift@zdd:~$ ';

  function charWidth(ch) {
    const code = ch.codePointAt(0);
    if (
      code >= 0x1100
      && (
        code <= 0x115f
        || code === 0x2329
        || code === 0x232a
        || (code >= 0x2e80 && code <= 0xa4cf)
        || (code >= 0xac00 && code <= 0xd7a3)
        || (code >= 0xf900 && code <= 0xfaff)
        || (code >= 0xfe30 && code <= 0xfe4f)
        || (code >= 0xff00 && code <= 0xff60)
        || (code >= 0xffe0 && code <= 0xffe6)
      )
    ) return 2;
    return 1;
  }

  function textWidth(text) {
    let width = 0;
    for (const ch of String(text)) width += charWidth(ch);
    return width;
  }

  function pad(text, width) {
    const value = String(text);
    return value + ' '.repeat(Math.max(0, width - textWidth(value)));
  }

  function fit(text, width) {
    let out = '';
    let used = 0;
    for (const ch of String(text)) {
      const w = charWidth(ch);
      if (used + w > width) return `${out}…`;
      out += ch;
      used += w;
    }
    return out;
  }

  function normalize(text) {
    return String(text === undefined || text === null ? '' : text).trim().toLowerCase();
  }

  function levenshtein(a, b) {
    const left = String(a);
    const right = String(b);
    const rows = left.length + 1;
    const cols = right.length + 1;
    const grid = new Array(rows);
    for (let i = 0; i < rows; i += 1) {
      grid[i] = new Array(cols);
      grid[i][0] = i;
    }
    for (let j = 0; j < cols; j += 1) grid[0][j] = j;
    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        grid[i][j] = Math.min(
          grid[i - 1][j] + 1,
          grid[i][j - 1] + 1,
          grid[i - 1][j - 1] + cost,
        );
      }
    }
    return grid[rows - 1][cols - 1];
  }

  class Terminal {
    constructor(options) {
      const opts = options || {};
      this.game = opts.game;
      this.audio = opts.audio || null;
      this.effects = opts.effects || null;
      this.topology = opts.topology || null;
      this.onChange = opts.onChange || function noop() {};
      this.onOpenChange = opts.onOpenChange || function noop() {};

      this.root = opts.root;
      this.screen = opts.screen;
      this.form = opts.form;
      this.input = opts.input;
      this.hintEl = opts.hint;
      this.statusEl = opts.status;
      this.closeButton = opts.closeButton;
      this.trigger = opts.trigger || null;

      this.isOpen = false;
      this.booted = false;
      this.history = [];
      this.historyIndex = 0;
      this.draft = '';
      this.lines = [];
      this.lastKeySound = 0;

      this.bindEvents();
    }

    // ------------------------------------------------------------------
    // 打开 / 关闭
    // ------------------------------------------------------------------
    bindEvents() {
      this.form.addEventListener('submit', (event) => {
        event.preventDefault();
        this.commit();
      });
      this.input.addEventListener('keydown', (event) => this.onKeyDown(event));
      this.input.addEventListener('input', () => this.updateHint());
      this.closeButton.addEventListener('click', () => this.close());
      this.root.addEventListener('pointerdown', (event) => {
        if (event.target === this.root) this.close();
      });
    }

    open() {
      if (this.isOpen) return;
      if (!this.game || this.game.state !== 'playing') return;
      this.isOpen = true;
      this.root.hidden = false;
      document.body.classList.add('terminal-open');
      this.onOpenChange(true);
      this.onChange();
      this.refresh();
      if (!this.booted) {
        this.booted = true;
        this.boot();
      } else {
        this.dim('—— 终端已重新连接 ——');
      }
      this.input.value = '';
      this.historyIndex = this.history.length;
      this.updateHint();
      if (this.audio) this.audio.play('boot');
      global.setTimeout(() => {
        if (this.isOpen) this.input.focus();
      }, 20);
    }

    hide() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.root.hidden = true;
      this.input.blur();
      document.body.classList.remove('terminal-open');
      this.onOpenChange(false);
    }

    close() {
      if (!this.isOpen) return;
      this.hide();
      this.onChange();
      if (this.trigger) this.trigger.focus({ preventScroll: true });
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    refresh() {
      if (!this.statusEl) return;
      if (!this.isOpen) {
        this.statusEl.textContent = '';
        return;
      }
      const player = this.game.player;
      const short = this.compactMode();
      const parts = short
        ? [`AP ${player.actionPoints}/${player.maxActionPoints}`, ZDD.formatMoney(player.funds)]
        : [
          ZDD.clockText(this.game.turn),
          `威胁 ${this.game.threatLevel}/5`,
          `AP ${player.actionPoints}/${player.maxActionPoints}`,
          ZDD.formatMoney(player.funds),
        ];
      this.statusEl.textContent = parts.join(' · ');
    }

    // ------------------------------------------------------------------
    // 输出
    // ------------------------------------------------------------------
    addLine(node) {
      this.screen.appendChild(node);
      this.lines.push(node);
      while (this.lines.length > 400) {
        const old = this.lines.shift();
        if (old && old.parentNode) old.parentNode.removeChild(old);
      }
      this.screen.scrollTop = this.screen.scrollHeight;
    }

    line(parts, extraClass) {
      const row = document.createElement('div');
      row.className = `term-line${extraClass ? ` ${extraClass}` : ''}`;
      for (const part of parts) {
        const span = document.createElement('span');
        if (typeof part === 'string') {
          span.textContent = part;
        } else {
          span.textContent = part.text === undefined || part.text === null ? '' : String(part.text);
          if (part.cls) span.className = part.cls;
        }
        row.appendChild(span);
      }
      this.addLine(row);
      return row;
    }

    blank() {
      this.line([{ text: ' ' }], 'term-blank');
    }

    section(title) {
      this.blank();
      this.line([{ text: `  ▸ ${title}`, cls: 'term-info' }]);
    }

    ok(text) {
      this.line([{ text: '  ✓ ', cls: 'term-ok' }, { text: String(text), cls: 'term-ok' }]);
    }

    warn(text) {
      this.line([{ text: '  ! ', cls: 'term-warn' }, { text: String(text), cls: 'term-warn' }]);
    }

    error(text) {
      this.line([{ text: '  ✗ ', cls: 'term-err' }, { text: String(text), cls: 'term-err' }]);
    }

    info(text) {
      this.line([{ text: '  › ', cls: 'term-info' }, { text: String(text) }]);
    }

    dim(text) {
      this.line([{ text: String(text), cls: 'term-dim' }]);
    }

    echo(text) {
      this.line([
        { text: '  ' + PROMPT, cls: 'term-prompt' },
        { text: String(text), cls: 'term-echo' },
      ], 'term-input-line');
    }

    clear() {
      this.screen.innerHTML = '';
      this.lines = [];
    }

    // ------------------------------------------------------------------
    // 输入处理
    // ------------------------------------------------------------------
    commit() {
      const value = this.input.value;
      this.input.value = '';
      this.run(value);
      this.updateHint();
    }

    run(raw) {
      const text = String(raw === undefined || raw === null ? '' : raw).trim();
      if (!text) return;
      this.echo(text);
      if (this.history[this.history.length - 1] !== text) this.history.push(text);
      if (this.history.length > 200) this.history.shift();
      this.historyIndex = this.history.length;
      this.draft = '';

      const tokens = text.split(/\s+/);
      const name = this.canonical(tokens[0]);
      const args = tokens.slice(1);
      if (!name) {
        this.unknown(tokens[0]);
        return;
      }
      this.dispatch(name, args, text);
    }

    canonical(token) {
      const value = normalize(token);
      if (!value) return null;
      if (ZH[value]) return ZH[value];
      if (Object.prototype.hasOwnProperty.call(COMMANDS, value)) return value;
      for (const name of Object.keys(COMMANDS)) {
        if (COMMANDS[name].aliases.includes(value)) return name;
      }
      return null;
    }

    unknown(token) {
      this.error(`命令不存在：${token}`);
      const hint = this.suggest(token);
      if (hint) this.dim(`  你是不是想输入「${hint}」？`);
      this.dim('  输入 help 查看全部命令；Tab 可补全。');
    }

    suggest(token) {
      const value = normalize(token);
      if (!value) return null;
      const pool = [];
      for (const name of Object.keys(COMMANDS)) {
        pool.push(name);
        for (const alias of COMMANDS[name].aliases) pool.push(alias);
      }
      let best = null;
      let bestScore = Infinity;
      for (const candidate of pool) {
        if (candidate.length < 2) continue;
        const score = levenshtein(value, candidate);
        const limit = candidate.length >= 4 ? 2 : 1;
        if (score <= limit && score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      return best;
    }

    /** 手机或窄屏：表格会换行，改用紧凑的逐项格式。 */
    compactMode() {
      const width = this.screen ? this.screen.clientWidth : 0;
      return width > 0 && width < 560;
    }

    onKeyDown(event) {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        this.commit();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.browseHistory(-1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.browseHistory(1);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        this.complete();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'l' || event.key === 'L')) {
        event.preventDefault();
        this.clear();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'C')) {
        event.preventDefault();
        this.line([{ text: '  ' + PROMPT, cls: 'term-prompt' }, { text: '^C', cls: 'term-warn' }]);
        this.input.value = '';
        this.updateHint();
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) this.keySound();
    }

    keySound() {
      const now = Date.now();
      if (now - this.lastKeySound < 28) return;
      this.lastKeySound = now;
      if (this.audio) this.audio.play('key');
    }

    browseHistory(delta) {
      const total = this.history.length;
      if (!total) return;
      if (this.historyIndex === total) this.draft = this.input.value;
      let next = this.historyIndex + delta;
      if (next < 0) next = 0;
      if (next > total) next = total;
      this.historyIndex = next;
      this.input.value = next === total ? this.draft : this.history[next];
      if (this.input.value) {
        const length = this.input.value.length;
        this.input.setSelectionRange(length, length);
      }
      this.updateHint();
    }

    completionTargets() {
      const targets = [];
      for (const device of Object.values(this.game.devices)) {
        targets.push(device.deviceId);
        targets.push(device.ip);
      }
      targets.push('backup');
      return targets;
    }

    complete() {
      const value = this.input.value;
      if (!value.trim()) return;
      const parts = value.split(/\s+/);
      const token = parts[parts.length - 1] || '';
      const pool = parts.length === 1 ? Object.keys(COMMANDS) : this.completionTargets();
      const lower = normalize(token);
      const match = pool.find((item) => normalize(item).startsWith(lower) && normalize(item) !== lower);
      if (!match) {
        this.keySound();
        return;
      }
      parts[parts.length - 1] = match;
      this.input.value = parts.join(' ') + (parts.length === 1 ? ' ' : '');
      this.updateHint();
    }

    updateHint() {
      if (!this.hintEl) return;
      const value = this.input.value;
      if (!value.trim()) {
        this.hintEl.textContent = 'Enter 执行 · Tab 补全 · ↑/↓ 历史 · Esc 关闭';
        return;
      }
      const parts = value.split(/\s+/);
      const token = parts[parts.length - 1] || '';
      const pool = parts.length === 1 ? Object.keys(COMMANDS) : this.completionTargets();
      const lower = normalize(token);
      const match = token
        ? pool.find((item) => normalize(item).startsWith(lower) && normalize(item) !== lower)
        : pool[0];
      this.hintEl.textContent = match ? `Tab 补全：${match}` : 'Enter 执行 · Esc 关闭';
    }

    // ------------------------------------------------------------------
    // 命令分发
    // ------------------------------------------------------------------
    dispatch(name, args, raw) {
      switch (name) {
        case 'help': this.showHelp(args); break;
        case 'status': this.showStatus(); break;
        case 'devices': this.showDevices(); break;
        case 'alerts': this.showAlerts(); break;
        case 'logs': this.showLogs(args); break;
        case 'upgrades': this.showUpgrades(); break;
        case 'scan': this.perform('scan', args); break;
        case 'isolate': this.perform('isolate', args); break;
        case 'release': this.perform('release', args); break;
        case 'clean': this.perform('clean', args); break;
        case 'patch': this.perform('patch', args); break;
        case 'shutdown': this.perform('shutdown', args); break;
        case 'start': this.perform('start', args); break;
        case 'restore': this.perform('restore', args); break;
        case 'mail': this.perform('mail', args); break;
        case 'passwd': this.perform('passwd', args); break;
        case 'block': this.perform('block', args); break;
        case 'protect': this.perform('protect', args); break;
        case 'select': this.doSelect(args); break;
        case 'next': this.doNext(); break;
        case 'buy': this.doBuy(args); break;
        case 'save': this.doSave(); break;
        case 'history': this.showHistory(); break;
        case 'date': this.showDate(); break;
        case 'ping': this.doPing(args); break;
        case 'clear': this.clear(); break;
        case 'exit': this.close(); break;
        default:
          this.unknown(raw || name);
          break;
      }
    }

    boot() {
      this.line([
        { text: '  ZDD · SOC 夜间值班处置台', cls: 'term-info' },
        { text: '   NIGHT SHIFT CONSOLE', cls: 'term-hint' },
      ]);
      this.dim('  ──────────────────────────────────────────────────────────────');
      this.dim('  nightshift.admin@zdd-soc · 本地模拟环境 · 所有主机、IP 与账号均为虚构');
      const alerts = this.game.orderedAlerts;
      const pending = alerts.filter((alert) => !alert.investigated && !alert.resolved).length;
      this.blank();
      this.info(
        `[${ZDD.clockText(this.game.turn)}] 已接入 ${Object.keys(this.game.devices).length} 台设备 · `
        + `${alerts.length} 条告警（未调查 ${pending}） · 威胁 ${this.game.threatLevel}/5`,
      );
      this.dim('  输入 help 查看命令；Tab 补全；↑/↓ 历史；Esc 关闭。');
      this.dim('  常用：status · devices · alerts · scan PC-01 · isolate PC-01 · clean PC-01 · release PC-01');
      this.blank();
    }

    // ------------------------------------------------------------------
    // 查询命令
    // ------------------------------------------------------------------
    showHelp(args) {
      const requested = args[0] ? this.canonical(args[0]) : null;
      if (args[0] && !requested) {
        this.error(`没有「${args[0]}」这个命令。`);
        return;
      }
      if (requested) {
        const spec = COMMANDS[requested];
        this.section(`help · ${requested}`);
        this.info(spec.desc);
        this.dim(`  用法：${spec.usage}`);
        if (spec.aliases.length) this.dim(`  别名：${spec.aliases.join('、')}`);
        if (EXAMPLES[requested]) this.dim(`  示例：${EXAMPLES[requested]}`);
        return;
      }
      this.section('可用命令');
      for (const group of HELP_GROUPS) {
        this.blank();
        this.info(group[0]);
        for (const name of group[1]) {
          this.line([
            { text: '    ' },
            { text: pad(name, 18), cls: 'term-cmd' },
            { text: COMMANDS[name].desc, cls: 'term-dim' },
          ]);
        }
      }
      this.blank();
      this.dim('  目标可以写设备 ID（PC-01）、设备名、IP，或告警编号（#1）。');
      this.dim('  省略目标时使用当前选中的告警或设备；先点告警再输入 scan 也可以。');
      this.dim('  示例：scan PC-01 · isolate PC-01 · clean PC-01 · release PC-01');
    }

    showStatus() {
      const game = this.game;
      const player = game.player;
      const unresolved = game.orderedAlerts.filter((alert) => !alert.resolved).length;
      const activeEvents = game.events.activeEvents().length;
      this.section('值班状态');
      this.info(
        `回合 ${game.turn} / ${player.totalTurns} · ${ZDD.clockText(game.turn)} · 威胁等级 ${game.threatLevel}/5`
        + (game.tutorialMode ? ' · 教程模式' : ''),
      );
      this.info(`安全度 ${player.security}% · 资金 ${ZDD.formatMoney(player.funds)} · 声誉 ${player.reputation}%`);
      this.info(`可用性 ${player.availability}% · 数据完整度 ${player.integrity}% · 行动点 ${player.actionPoints}/${player.maxActionPoints}`);
      this.dim(`未清除告警 ${unresolved} · 活跃攻击链 ${activeEvents} · 连击 ×${game.combo} · 随机种子 ${game.seed}`);
      if (game.lowAvailabilityTurns > 0) {
        this.warn(`可用性已连续 ${game.lowAvailabilityTurns} 回合低于 40%，注意业务崩溃判定。`);
      }
    }

    showDevices() {
      this.section('设备清单');
      if (this.compactMode()) {
        for (const device of Object.values(this.game.devices)) {
          const events = this.game.eventsForDevice(device.deviceId).length;
          this.line([
            { text: `  ${device.deviceId}  `, cls: 'term-cmd' },
            { text: device.name },
          ]);
          this.line([
            { text: `    ${device.ip} · `, cls: 'term-dim' },
            { text: device.status, cls: this.statusClass(device.status) },
            { text: ' · 补丁 ', cls: 'term-dim' },
            { text: device.patched ? '已装' : '缺失', cls: device.patched ? 'term-ok' : 'term-warn' },
            { text: ' · 备份 ', cls: 'term-dim' },
            { text: device.backups ? (device.backupProtected ? '有·已保护' : '有') : '无', cls: 'term-dim' },
            ...(events ? [{ text: ' · 事件 ', cls: 'term-dim' }, { text: String(events), cls: 'term-warn' }] : []),
          ]);
        }
        this.blank();
        this.dim('  提示：处置命令接受设备 ID、设备名或 IP；也可以写告警编号 #1。');
        return;
      }
      this.dim(`  ${pad('ID', 8)}${pad('设备', 20)}${pad('IP', 15)}${pad('状态', 7)}${pad('补丁', 5)}${pad('事件', 6)}备份`);
      for (const device of Object.values(this.game.devices)) {
        const events = this.game.eventsForDevice(device.deviceId).length;
        this.line([
          { text: `  ${pad(device.deviceId, 8)}` },
          { text: pad(fit(device.name, 19), 20) },
          { text: pad(device.ip, 15), cls: 'term-dim' },
          { text: pad(device.status, 7), cls: this.statusClass(device.status) },
          { text: pad(device.patched ? '已装' : '缺失', 5), cls: device.patched ? 'term-ok' : 'term-warn' },
          { text: pad(events ? `⚠${events}` : '—', 6), cls: events ? 'term-warn' : 'term-hint' },
          { text: device.backups ? (device.backupProtected ? '有·已保护' : '有') : '无', cls: 'term-dim' },
        ]);
      }
      this.blank();
      this.dim('  提示：处置命令接受设备 ID、设备名或 IP；也可以写告警编号 #1。');
    }

    showAlerts() {
      const alerts = this.game.orderedAlerts;
      this.section(`告警清单（${alerts.length}）`);
      if (!alerts.length) {
        this.dim('  暂无告警。');
        return;
      }
      if (this.compactMode()) {
        alerts.forEach((alert, index) => {
          this.line([
            { text: `  ${index + 1}  `, cls: 'term-dim' },
            { text: alert.displayLevel, cls: alert.investigated ? 'term-warn' : 'term-hint' },
            { text: `  ${alert.targetId}  ` },
            { text: alert.statusText, cls: 'term-dim' },
          ]);
          this.dim(`     ${alert.title}`);
        });
        this.blank();
        this.dim('  用 #编号 指定告警：scan #1 · select #1；来源与账号在选中后显示。');
        return;
      }
      this.dim(`  ${pad('#', 4)}${pad('等级', 6)}${pad('目标', 9)}${pad('状态', 17)}标题`);
      alerts.forEach((alert, index) => {
        this.line([
          { text: `  ${pad(String(index + 1), 4)}`, cls: 'term-dim' },
          { text: pad(alert.displayLevel, 6), cls: alert.investigated ? 'term-warn' : 'term-hint' },
          { text: pad(alert.targetId, 9) },
          { text: pad(fit(alert.statusText, 16), 17), cls: 'term-dim' },
          { text: fit(alert.title, 34) },
        ]);
      });
      this.blank();
      this.dim('  用 #编号 指定告警：scan #1 · select #1；来源与账号在选中后显示。');
    }

    showLogs(args) {
      let count = 10;
      const cleaned = args.slice();
      if (cleaned.length && /^\d+$/.test(cleaned[cleaned.length - 1])) {
        count = Math.max(1, Math.min(40, Number(cleaned[cleaned.length - 1])));
        cleaned.pop();
      }
      const keyword = cleaned.join(' ').trim();
      const entries = this.game.logs.search(keyword, '全部');
      this.section(keyword ? `日志 · 搜索「${keyword}」` : '最近日志');
      if (!entries.length) {
        this.dim('  没有匹配的日志。');
        return;
      }
      for (const entry of entries.slice(-count)) {
        this.line([
          { text: `  [${entry.clock}] `, cls: 'term-dim' },
          { text: pad(entry.category, 5), cls: 'term-info' },
          { text: entry.message },
        ]);
      }
      if (entries.length > count) {
        this.dim(`  仅显示最近 ${count} 条，共 ${entries.length} 条；可加关键词缩小范围。`);
      }
    }

    showUpgrades() {
      this.section('安全加固');
      for (const track of this.game.upgradeTree.tracks) {
        this.blank();
        this.info(`${track.name} · ${track.tagline}`);
        this.dim(`  ${track.description}`);
        for (const upgrade of this.game.upgradeTree.upgrades) {
          if (upgrade.track !== track.trackId) continue;
          const owned = this.game.player.hasUpgrade(upgrade.upgradeId);
          const checkResult = this.game.upgradeTree.check(upgrade, this.game.player.upgrades);
          const allowed = checkResult[0];
          const tag = owned ? '[已启用]' : allowed ? `[¥${upgrade.cost}]` : '[锁定]';
          this.line([
            { text: `  ${pad(tag, 10)}`, cls: owned ? 'term-ok' : allowed ? 'term-warn' : 'term-hint' },
            { text: pad(upgrade.upgradeId, 16), cls: 'term-cmd' },
            { text: `${upgrade.name}  ` },
            { text: upgrade.description, cls: 'term-dim' },
          ]);
          if (!owned && !allowed && checkResult[1]) this.dim(`             ↳ ${checkResult[1]}`);
        }
      }
      this.blank();
      this.dim('  购买：buy log_plugin（消耗资金，本局永久生效）。');
    }

    showHistory() {
      this.section('命令历史');
      if (!this.history.length) {
        this.dim('  本次会话还没有执行过命令。');
        return;
      }
      this.history.slice(-20).forEach((command, index) => {
        this.dim(`  ${pad(String(index + 1), 4)}${command}`);
      });
    }

    showDate() {
      const left = Math.max(0, this.game.player.totalTurns - this.game.turn + 1);
      this.section('值班时间');
      this.info(`当前 ${ZDD.clockText(this.game.turn)} · 第 ${this.game.turn} 回合 · 距离 08:00 交接还有 ${left} 小时`);
    }

    // ------------------------------------------------------------------
    // 目标解析
    // ------------------------------------------------------------------
    findDevice(token) {
      const value = normalize(token).replace(/[\s\-_]/g, '');
      if (!value) return null;
      const list = Object.values(this.game.devices);
      const fields = (device) => [device.deviceId, device.name, device.shortName, device.ip];
      const exact = list.filter((device) => fields(device).some((field) => normalize(field).replace(/[\s\-_]/g, '') === value));
      if (exact.length === 1) return exact[0];
      if (exact.length > 1) return { ambiguous: exact };
      const loose = list.filter((device) => fields(device).some((field) => normalize(field).replace(/[\s\-_]/g, '').includes(value)));
      if (loose.length === 1) return loose[0];
      if (loose.length > 1) return { ambiguous: loose };
      return null;
    }

    findAlertByToken(token) {
      const value = normalize(token);
      if (!value) return null;
      return this.game.orderedAlerts.find((alert) => (
        !alert.resolved
        && (normalize(alert.sourceIp) === value || normalize(alert.account) === value)
      )) || null;
    }

    resolveTarget(args) {
      const token = args.join(' ').trim();
      if (!token) {
        const current = this.game.currentTarget();
        if (current && current.alert) {
          const device = this.game.devices[current.alert.targetId] || null;
          if (device) return { alert: current.alert, device };
        }
        if (current && current.device) return { device: current.device, alert: null };
        return { error: '缺少目标。先点击告警或设备，或写 PC-01 / #1；devices / alerts 可查看列表。' };
      }

      const numeric = token.match(/^#?(\d{1,2})$/);
      if (numeric) {
        const ordered = this.game.orderedAlerts;
        const index = Number(numeric[1]) - 1;
        if (!(index >= 0 && index < ordered.length)) {
          return { error: `告警编号超出范围：共有 ${ordered.length} 条告警（1-${ordered.length}）。` };
        }
        const alert = ordered[index];
        const device = this.game.devices[alert.targetId] || null;
        if (!device) return { error: `告警 ${alert.alertId} 的目标设备不存在。` };
        return { alert, device };
      }

      const found = this.findDevice(token);
      if (found && found.ambiguous) {
        return { error: `「${token}」匹配到多台设备：${found.ambiguous.map((item) => item.deviceId).join('、')}，请写设备 ID。` };
      }
      if (found) return { device: found, alert: null };

      const alert = this.findAlertByToken(token);
      if (alert) {
        const device = this.game.devices[alert.targetId] || null;
        if (device) return { alert, device };
      }
      return { error: `找不到设备或告警：${token}。输入 devices 或 alerts 查看。` };
    }

    // ------------------------------------------------------------------
    // 处置命令
    // ------------------------------------------------------------------
    perform(name, args) {
      const actionId = ZDD.Terminal.ACTION_IDS[name];
      if (!actionId) {
        this.error(`未实现的命令：${name}`);
        return;
      }
      const prepared = this.prepareAction(actionId, args);
      if (prepared.error) {
        this.error(prepared.error);
        return;
      }

      if (prepared.alert) this.game.selectAlert(prepared.alert);
      else if (prepared.device) this.game.selectDevice(prepared.device.deviceId);
      this.focusTarget(prepared);
      this.onChange();

      if (!prepared.option.enabled) {
        this.warn(`「${prepared.option.name}」不可用：${prepared.option.reason}`);
        return;
      }

      this.dim(
        `  [执行] ${prepared.option.name} · 目标 ${prepared.device.deviceId} · `
        + `AP ${prepared.option.apCost} · ¥${prepared.option.moneyCost}`,
      );
      if (this.audio) this.audio.play('click');
      const result = this.game.performAction(prepared.option, prepared.target);
      this.onChange();
      this.reportAction(prepared, result);    }

    prepareAction(actionId, args) {
      const requested = args.join(' ').trim();
      const specialBackup = ['backup', 'bak', '备份', '备份服务器', 'bak-01'];
      if (actionId === 'protect_backup' && (!requested || specialBackup.includes(normalize(requested)))) {
        const device = this.game.devices['BAK-01'];
        if (!device) return { error: '找不到 BAK-01 备份服务器。' };
        return this.withDeviceOption(actionId, device);
      }

      const resolved = this.resolveTarget(args);
      if (resolved.error) return resolved;
      if (ALERT_ACTIONS.has(actionId)) return this.withAlertOption(actionId, resolved);
      return this.withDeviceOption(actionId, resolved.device);
    }

    withDeviceOption(actionId, device) {
      const target = new ZDD.models.Target('device', null, device);
      const options = this.game.actions.optionsFor(this.game, target);
      const option = options.find((item) => item.actionId === actionId);
      if (!option) {
        const names = options.map((item) => item.name).join('、') || '无';
        return { error: `目标 ${device.name} 上没有「${ZDD.ACTION_NAMES[actionId]}」操作。当前可用：${names}。` };
      }
      return { target, alert: null, device, option };
    }

    withAlertOption(actionId, resolved) {
      const candidates = [];
      if (resolved.alert) {
        candidates.push(resolved.alert);
      } else {
        for (const alert of this.game.orderedAlerts) {
          if (alert.resolved) continue;
          if (alert.targetId !== resolved.device.deviceId) continue;
          candidates.push(alert);
        }
      }
      if (!candidates.length) {
        return {
          error: `设备 ${resolved.device.deviceId} 没有未清除的告警，无法执行「${ZDD.ACTION_NAMES[actionId]}」。`,
        };
      }

      let disabled = null;
      let lastReason = '';
      for (const alert of candidates) {
        const device = this.game.devices[alert.targetId] || resolved.device;
        const target = new ZDD.models.Target('alert', alert, device);
        const options = this.game.actions.optionsFor(this.game, target);
        const option = options.find((item) => item.actionId === actionId);
        if (!option) continue;
        if (option.enabled) return { target, alert, device, option };
        if (!disabled) disabled = { target, alert, device, option };
        lastReason = option.reason || lastReason;
      }
      if (disabled) return disabled;
      return {
        error: `目标上没有「${ZDD.ACTION_NAMES[actionId]}」操作。${lastReason ? `原因：${lastReason}` : ''}`,
      };
    }

    focusTarget(prepared) {
      if (this.effects && this.topology && prepared.device) {
        this.effects.setFocusElement(this.topology.nodeElement(prepared.device.deviceId));
      }
    }

    nextStepHint(actionId, device) {
      const id = device ? device.deviceId : '设备';
      switch (actionId) {
        case 'investigate':
          return `下一步：isolate ${id} 控制扩散，或 mail ${id} 直接阻断钓鱼邮件。`;
        case 'isolate':
          return `已控制；下一步：clean ${id} 清除根因，完成后 release ${id} 恢复业务。`;
        case 'block_source':
          return `已阻断来源；若事件仍在，下一步：clean ${id} 清除根因。`;
        case 'shutdown':
          return `设备离线；用 start ${id} 重新上线。`;
        case 'unisolate':
        case 'startup':
        case 'restore_backup':
          return '业务已恢复。';
        case 'protect_backup':
          return '备份已进入离线保护。';
        case 'eradicate':
          return '根因已清除；如设备仍被隔离，用 release 恢复业务。';
        case 'delete_mail':
        case 'reset_password':
        case 'patch':
          return '根因已移除；检查是否有设备还需要 release 恢复业务。';
        default:
          return '';
      }
    }

    reportAction(prepared, result) {
      if (!result || result.executed === false) {
        this.error(`未执行：${result ? result.message : '未知错误'}`);
        return;
      }
      if (!result.success) {
        this.warn(result.message);
        return;
      }
      this.ok(result.message);
      const player = this.game.player;
      const option = prepared.option;
      this.dim(
        `  消耗 AP ${option.apCost} · 资金 -¥${option.moneyCost} · `
        + `剩余 AP ${player.actionPoints}/${player.maxActionPoints} · ${ZDD.formatMoney(player.funds)}`,
      );
      const hint = this.nextStepHint(option.actionId, prepared.device);
      if (hint) this.dim(`  ${hint}`);
    }

    // ------------------------------------------------------------------
    // 其他命令
    // ------------------------------------------------------------------
    doSelect(args) {
      const resolved = this.resolveTarget(args);
      if (resolved.error) {
        this.error(resolved.error);
        return;
      }
      if (resolved.alert) this.game.selectAlert(resolved.alert);
      else this.game.selectDevice(resolved.device.deviceId);
      this.focusTarget(resolved);
      this.onChange();
      this.printTarget(resolved);
    }

    printTarget(resolved) {
      const device = resolved.device;
      const alert = resolved.alert;
      this.section(`目标 · ${device.name}`);
      this.line([
        { text: '  ' },
        { text: device.deviceId, cls: 'term-cmd' },
        { text: `  ${device.ip}`, cls: 'term-dim' },
      ]);
      this.line([
        { text: '  状态 ' },
        { text: device.status, cls: this.statusClass(device.status) },
        { text: ' · 补丁 ' },
        { text: device.patched ? '已安装' : '缺失', cls: device.patched ? 'term-ok' : 'term-warn' },
        { text: ' · 备份 ' },
        { text: device.backups ? (device.backupProtected ? '有·已保护' : '有') : '无', cls: 'term-dim' },
        { text: ' · 隔离 ' },
        { text: device.isolated ? '是' : '否', cls: device.isolated ? 'term-purple' : 'term-dim' },
      ]);
      if (alert) {
        this.info(`告警：${alert.title}`);
        this.line([
          { text: '  等级 ' },
          { text: alert.displayLevel, cls: alert.investigated ? 'term-warn' : 'term-hint' },
          { text: ' · 状态 ' },
          { text: alert.statusText, cls: 'term-dim' },
          { text: ' · 来源 ' },
          { text: alert.sourceIp || '—', cls: 'term-dim' },
          { text: ' · 账号 ' },
          { text: alert.account || '—', cls: 'term-dim' },
        ]);
        const event = this.game.eventForAlert(alert);
        if (event) {
          this.dim(`  事件：${event.name} · ${event.progressText} · 已控制 ${event.contained ? '是' : '否'} · 已清除 ${event.eradicated ? '是' : '否'}`);
        }
        return;
      }
      const events = this.game.eventsForDevice(device.deviceId);
      if (events.length) {
        for (const event of events) {
          this.dim(`  事件：${event.name} · ${event.progressText} · 已控制 ${event.contained ? '是' : '否'}`);
        }
      } else {
        this.dim('  该设备当前没有关联事件。');
      }
    }

    doNext() {
      const beforeTurn = this.game.turn;
      const beforeAlerts = this.game.orderedAlerts.length;
      if (this.audio) this.audio.play('click');
      this.game.endTurn();

      if (this.game.state !== 'playing') {
        const report = this.game.report;
        if (report) this.warn(`值班结束：${report.endingTitle} · ${report.score} 分（${report.grade}）`);
        else this.warn('值班结束。');
        this.onChange();
        return;
      }

      this.onChange();
      this.section('回合推进');
      this.info(`${ZDD.clockText(beforeTurn)} → ${ZDD.clockText(this.game.turn)} · 第 ${this.game.turn} 回合`);
      this.info(`行动点已重置：${this.game.player.actionPoints}/${this.game.player.maxActionPoints} · 资金 ${ZDD.formatMoney(this.game.player.funds)}`);
      const newAlerts = this.game.orderedAlerts.length - beforeAlerts;
      if (newAlerts > 0) this.warn(`新告警 ${newAlerts} 条，输入 alerts 查看。`);

      if (this.game.pendingDecision) {
        this.warn(`紧急决策：${this.game.pendingDecision.title || ''}`);
        this.dim('  关闭终端后处理决策。');
        this.hide();
      }
    }

    doBuy(args) {
      const token = args.join(' ').trim();
      if (!token) {
        this.error('用法：buy <加固ID>，例如 buy log_plugin；先输入 upgrades 查看列表。');
        return;
      }
      let upgrade = this.game.upgradeTree.get(normalize(token));
      if (!upgrade) {
        const key = normalize(token);
        upgrade = this.game.upgradeTree.upgrades.find(
          (item) => normalize(item.upgradeId) === key || normalize(item.name) === key,
        );
      }
      if (!upgrade) {
        this.error(`没有找到加固项目：${token}。输入 upgrades 查看可用 ID。`);
        return;
      }
      const result = this.game.buyUpgrade(upgrade.upgradeId);
      if (result[0]) {
        this.ok(result[1]);
        this.onChange();
      } else {
        this.warn(result[1]);
      }
    }

    doSave() {
      const ok = this.game.saveGame();
      if (ok) this.ok('存档成功：进度已写入浏览器本地存储。');
      else this.error('存档失败：浏览器可能禁止了本地存储。');
      this.onChange();
    }

    doPing(args) {
      const token = args.join(' ').trim() || 'GW-01';
      const found = this.findDevice(token);
      if (!found || found.ambiguous) {
        this.error(`找不到设备：${token}。`);
        return;
      }
      const device = found;
      this.section(`ping ${device.ip}`);
      for (let index = 1; index <= 3; index += 1) {
        const time = (0.4 + Math.random() * 2).toFixed(1);
        this.dim(`  64 bytes from ${device.ip}: icmp_seq=${index} ttl=60 time=${time} ms`);
      }
      this.ok(`${device.name} 在线（模拟 ICMP，不发送真实网络包）。`);
    }

    statusClass(status) {
      return {
        正常: 'term-ok',
        可疑: 'term-warn',
        感染: 'term-err',
        隔离: 'term-purple',
        离线: 'term-dim',
      }[status] || '';
    }
  }

  Terminal.ACTION_IDS = {
    scan: 'investigate',
    isolate: 'isolate',
    release: 'unisolate',
    clean: 'eradicate',
    patch: 'patch',
    shutdown: 'shutdown',
    start: 'startup',
    restore: 'restore_backup',
    mail: 'delete_mail',
    passwd: 'reset_password',
    block: 'block_source',
    protect: 'protect_backup',
  };

  ZDD.Terminal = Terminal;
})(typeof globalThis !== 'undefined' ? globalThis : this);
