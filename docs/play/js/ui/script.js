/* 自动化剧本面板：编辑、运行、单步执行 ZDD Script。
 * 脚本只调用与操作面板相同的 Game.performAction，不执行任意外部代码。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  const STORAGE_KEY = 'zdd.script.v1';

  const TEMPLATES = [
    {
      id: 'patrol',
      name: '自动巡检（推荐）',
      source: [
        '# 夜班自动巡检：先调查所有未调查的告警',
        'for a in alerts():',
        '    if not a.investigated:',
        '        scan(a)',
        '        print("调查：", a.title)',
        '',
        '# 已控制的事件：清除根因（恢复业务建议手工确认）',
        'for d in devices():',
        '    if d.controlled:',
        '        clean(d)',
        '        print("清除：", d.name)',
      ].join('\n'),
    },
    {
      id: 'purge',
      name: '清场：只清除已控制事件',
      source: [
        'for d in devices():',
        '    if d.controlled:',
        '        clean(d)',
        '        print("已清除：", d.name)',
        '',
        'print("剩余行动点：", status().ap)',
      ].join('\n'),
    },
    {
      id: 'block',
      name: '封禁可疑来源',
      source: [
        'for a in alerts():',
        '    if a.investigated and not a.resolved and a.source_ip:',
        '        print("尝试封禁：", a.source_ip)',
        '        block(a)',
      ].join('\n'),
    },
    {
      id: 'inspect',
      name: '局势查询',
      source: [
        's = status()',
        'print("回合", s.turn, "时间", s.clock, "AP", s.ap, "安全度", s.security)',
        'for a in alerts():',
        '    print(a.display_level, a.target_id, a.title)',
        'print("设备：")',
        'for d in devices():',
        '    if d.isolated or d.status != "正常":',
        '        print(d.id, d.name, d.status)',
      ].join('\n'),
    },
    {
      id: 'single',
      name: '单设备处置',
      source: [
        'd = find("PC-01")',
        'if d:',
        '    print(d.name, d.ip, d.status)',
        '    scan(d)',
        '    isolate(d)',
        '    clean(d)',
        '    print("下一步：确认事件清除后 release(d)")',
      ].join('\n'),
    },
  ];

  const ACTION_IDS = {
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

  const ALERT_ACTIONS = new Set(['investigate', 'delete_mail', 'reset_password', 'block_source']);

  const KEYWORDS = new Set([
    'if', 'elif', 'else', 'for', 'in', 'while', 'break', 'continue', 'pass',
    'and', 'or', 'not', 'True', 'False', 'None', 'def', 'return',
  ]);
  const BUILTIN_NAMES = new Set([
    'print', 'log', 'len', 'range', 'str', 'int', 'float', 'bool', 'help',
    'alerts', 'devices', 'events', 'find', 'status',
  ]);
  const ACTION_NAMES = new Set([
    'scan', 'isolate', 'release', 'clean', 'patch', 'shutdown',
    'start', 'restore', 'mail', 'passwd', 'block', 'protect', 'next',
  ]);

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** 轻量语法高亮：用 pre 镜像 textarea 的文本，避免引入编辑器依赖。 */
  function highlightCode(source) {
    const text = String(source === undefined || source === null ? '' : source);
    const pattern = /#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|\s+|[^]/g;
    let html = '';
    let previous = '';
    let match = pattern.exec(text);
    while (match) {
      const token = match[0];
      if (/^\s+$/.test(token)) {
        html += token;
      } else if (token.startsWith('#')) {
        html += `<span class="c">${escapeHtml(token)}</span>`;
      } else if (token[0] === '"' || token[0] === "'") {
        html += `<span class="s">${escapeHtml(token)}</span>`;
      } else if (/^\d/.test(token)) {
        html += `<span class="n">${escapeHtml(token)}</span>`;
      } else if (/^[A-Za-z_]/.test(token)) {
        let cls = '';
        if (previous === '.') cls = 'attr';
        else if (KEYWORDS.has(token)) cls = 'k';
        else if (BUILTIN_NAMES.has(token)) cls = 'b';
        else if (ACTION_NAMES.has(token)) cls = 'a';
        html += cls ? `<span class="${cls}">${escapeHtml(token)}</span>` : escapeHtml(token);
      } else {
        html += escapeHtml(token);
      }
      previous = token;
      match = pattern.exec(text);
    }
    return html || '\n';
  }

  function normalize(text) {
    return String(text === undefined || text === null ? '' : text).trim().toLowerCase();
  }

  function findDevice(game, token) {
    const value = normalize(token).replace(/[\s\-_]/g, '');
    if (!value) return null;
    const list = Object.values(game.devices);
    const fields = (device) => [device.deviceId, device.name, device.shortName, device.ip];
    const exact = list.filter((device) => fields(device).some(
      (field) => normalize(field).replace(/[\s\-_]/g, '') === value,
    ));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return { ambiguous: exact };
    const loose = list.filter((device) => fields(device).some(
      (field) => normalize(field).replace(/[\s\-_]/g, '').includes(value),
    ));
    if (loose.length === 1) return loose[0];
    if (loose.length > 1) return { ambiguous: loose };
    return null;
  }

  function findAlertByToken(game, token) {
    const value = normalize(token);
    if (!value) return null;
    return game.orderedAlerts.find((alert) => (
      !alert.resolved
      && (normalize(alert.sourceIp) === value || normalize(alert.account) === value)
    )) || null;
  }

  function resolveTargetValue(game, value) {
    if (value === null || value === undefined) return null;
    if (ZDD.ZScript.isWrapped(value)) {
      if (value.kind === 'alert') {
        return { alert: value.value, device: game.devices[value.value.targetId] || null };
      }
      if (value.kind === 'device') return { alert: null, device: value.value };
      return null;
    }
    const token = String(value).trim();
    if (!token) return null;
    const numeric = token.match(/^#?(\d{1,2})$/);
    if (numeric) {
      const ordered = game.orderedAlerts;
      const index = Number(numeric[1]) - 1;
      if (index >= 0 && index < ordered.length) {
        const alert = ordered[index];
        return { alert, device: game.devices[alert.targetId] || null };
      }
      return null;
    }
    const device = findDevice(game, token);
    if (device && device.ambiguous) return { error: `「${token}」匹配到多台设备，请写设备 ID` };
    if (device) return { alert: null, device };
    const alert = findAlertByToken(game, token);
    if (alert) return { alert, device: game.devices[alert.targetId] || null };
    return null;
  }

  class ScriptPanel {
    constructor(options) {
      const opts = options || {};
      this.game = opts.game;
      this.effects = opts.effects || null;
      this.topology = opts.topology || null;
      this.audio = opts.audio || null;
      this.onChange = opts.onChange || function noop() {};
      this.onOpenChange = opts.onOpenChange || function noop() {};

      this.trigger = opts.trigger;
      this.root = opts.root;
      this.code = opts.code;
      this.gutter = opts.gutter;
      this.highlight = opts.highlight || null;
      this.consoleEl = opts.console;
      this.statusEl = opts.status;
      this.metaEl = opts.meta;
      this.lineEl = opts.line;
      this.countEl = opts.count;
      this.runButton = opts.runButton;
      this.stepButton = opts.stepButton;
      this.stopButton = opts.stopButton;
      this.exampleSelect = opts.exampleSelect;
      this.clearButton = opts.clearButton;
      this.helpButton = opts.helpButton;
      this.closeButton = opts.closeButton;

      this.isOpen = false;
      this.running = false;
      this.awaitingStep = false;
      this.mode = 'run';
      this.generator = null;
      this.timer = null;
      this.saveTimer = null;
      this.count = 0;
      this.activeLine = 0;
      this.activeError = false;

      this.bindEvents();
      this.fillTemplates();
      this.loadSource();
      this.renderGutter();
      this.renderHighlight();
      this.updateButtons();
    }

    // ------------------------------------------------------------------
    // 初始化
    // ------------------------------------------------------------------
    bindEvents() {
      this.closeButton.addEventListener('click', () => this.close());
      this.runButton.addEventListener('click', () => this.start('run'));
      this.stepButton.addEventListener('click', () => this.step());
      this.stopButton.addEventListener('click', () => this.stop());
      this.helpButton.addEventListener('click', () => this.printHelp());
      this.clearButton.addEventListener('click', () => this.clearCode());
      this.exampleSelect.addEventListener('change', () => this.loadTemplate(Number(this.exampleSelect.value)));
      this.code.addEventListener('input', () => this.onInput());
      this.code.addEventListener('scroll', () => this.syncScroll());
      this.code.addEventListener('keydown', (event) => this.onKeyDown(event));
      this.code.addEventListener('click', () => this.updateLineLabel());
      this.code.addEventListener('keyup', () => this.updateLineLabel());
      this.code.addEventListener('compositionstart', () => {
        this.code.classList.add('composing');
        if (this.highlight) this.highlight.style.opacity = '0';
      });
      this.code.addEventListener('compositionend', () => {
        this.code.classList.remove('composing');
        if (this.highlight) this.highlight.style.opacity = '';
        this.renderHighlight();
      });
      if (this.root) {
        this.root.addEventListener('pointerdown', (event) => {
          if (event.target === this.root && !this.running) this.close();
        });
      }
    }

    fillTemplates() {
      this.exampleSelect.innerHTML = TEMPLATES.map(
        (template, index) => `<option value="${index}">${template.name}</option>`,
      ).join('') + '<option value="-1">自定义</option>';
    }

    loadSource() {
      let stored = null;
      try {
        stored = global.localStorage.getItem(STORAGE_KEY);
      } catch (error) {
        stored = null;
      }
      if (stored !== null) {
        this.code.value = stored;
      } else {
        this.code.value = TEMPLATES[0].source;
      }
      const matched = TEMPLATES.findIndex((template) => template.source === this.code.value);
      this.exampleSelect.value = matched >= 0 ? String(matched) : '-1';
    }

    // ------------------------------------------------------------------
    // 打开 / 关闭
    // ------------------------------------------------------------------
    open() {
      if (this.isOpen) return;
      if (!this.game || this.game.state !== 'playing') return;
      this.isOpen = true;
      this.root.hidden = false;
      document.body.classList.add('script-open');
      this.onOpenChange(true);
      this.onChange();
      this.refresh();
      if (!this.consoleEl.childElementCount) {
        this.print('ZDD Script 就绪：Ctrl+Enter 运行，Tab 缩进，Esc 关闭。', 'dim');
        this.print('脚本与操作面板共用行动点和资金；不会执行真实系统命令。', 'dim');
      }
      this.setActiveLine(0);
      const coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
      if (!coarse) global.setTimeout(() => { if (this.isOpen) this.code.focus(); }, 20);
    }

    hide() {
      if (!this.isOpen) return;
      this.saveNow();
      this.stopSilent();
      this.isOpen = false;
      this.root.hidden = true;
      this.code.blur();
      document.body.classList.remove('script-open');
      this.onOpenChange(false);
    }

    close() {
      if (!this.isOpen) return;
      this.stopSilent();
      this.hide();
      this.onChange();
      if (this.trigger) this.trigger.focus({ preventScroll: true });
    }

    refresh() {
      if (!this.metaEl) return;
      const player = this.game.player;
      this.metaEl.textContent = [
        `第 ${this.game.turn} 回合`,
        ZDD.clockText(this.game.turn),
        `AP ${player.actionPoints}/${player.maxActionPoints}`,
        ZDD.formatMoney(player.funds),
        `威胁 ${this.game.threatLevel}/5`,
      ].join(' · ');
      if (this.isOpen && this.running && (this.game.state !== 'playing' || this.game.pendingDecision)) {
        this.stopSilent();
        this.setStatus(this.game.pendingDecision ? '等待决策' : '已结束');
        this.updateButtons();
      }
    }

    // ------------------------------------------------------------------
    // 编辑器
    // ------------------------------------------------------------------
    onInput() {
      this.activeLine = 0;
      this.activeError = false;
      this.renderGutter();
      this.renderHighlight();
      this.updateLineLabel();
      this.exampleSelect.value = '-1';
      this.saveSoon();
    }

    renderHighlight() {
      if (!this.highlight) return;
      this.highlight.innerHTML = highlightCode(this.code.value);
      this.syncScroll();
    }

    saveSoon() {
      global.clearTimeout(this.saveTimer);
      this.saveTimer = global.setTimeout(() => {
        try {
          global.localStorage.setItem(STORAGE_KEY, this.code.value);
        } catch (error) {
          // 隐私模式下可能写入失败
        }
      }, 250);
    }

    saveNow() {
      global.clearTimeout(this.saveTimer);
      try {
        global.localStorage.setItem(STORAGE_KEY, this.code.value);
      } catch (error) {
        // 忽略
      }
    }

    renderGutter() {
      const lines = this.code.value.split('\n');
      if (!lines.length) lines.push('');
      const fragment = document.createDocumentFragment();
      lines.forEach((_, index) => {
        const span = document.createElement('span');
        span.dataset.line = String(index + 1);
        span.textContent = String(index + 1);
        fragment.appendChild(span);
      });
      this.gutter.textContent = '';
      this.gutter.appendChild(fragment);
      this.applyLineClasses();
      this.syncScroll();
    }

    applyLineClasses() {
      const items = this.gutter.querySelectorAll('[data-line]');
      items.forEach((item) => {
        item.classList.toggle('active', Number(item.dataset.line) === this.activeLine && !this.activeError);
        item.classList.toggle('error', Number(item.dataset.line) === this.activeLine && this.activeError);
      });
    }

    setActiveLine(line, isError) {
      this.activeLine = Number(line) || 0;
      this.activeError = Boolean(isError);
      this.applyLineClasses();
      if (this.activeLine > 0) {
        const style = global.getComputedStyle(this.code);
        const lineHeight = parseFloat(style.lineHeight) || 20;
        const top = (this.activeLine - 1) * lineHeight;
        if (top < this.code.scrollTop || top > this.code.scrollTop + this.code.clientHeight - lineHeight * 2) {
          this.code.scrollTop = Math.max(0, top - this.code.clientHeight / 2);
        }
        this.syncScroll();
      }
      this.updateLineLabel();
    }

    updateLineLabel() {
      if (!this.lineEl) return;
      const position = this.code.selectionStart || 0;
      const line = this.code.value.slice(0, position).split('\n').length;
      this.lineEl.textContent = `第 ${line} 行 · ${this.code.value.split('\n').length} 行代码`;
    }

    syncScroll() {
      if (this.gutter) this.gutter.scrollTop = this.code.scrollTop;
      if (this.highlight) {
        this.highlight.scrollTop = this.code.scrollTop;
        this.highlight.scrollLeft = this.code.scrollLeft;
      }
    }

    clearCode() {
      if (this.running) return;
      this.code.value = '';
      this.renderGutter();
      this.renderHighlight();
      this.setActiveLine(0);
      this.exampleSelect.value = '-1';
      this.saveNow();
      this.code.focus();
    }

    loadTemplate(index) {
      if (index < 0 || index >= TEMPLATES.length || this.running) {
        return;
      }
      const template = TEMPLATES[index];
      if (this.code.value && this.code.value !== template.source) {
        const ok = global.confirm(`载入示例「${template.name}」会覆盖当前脚本，继续？`);
        if (!ok) {
          this.exampleSelect.value = '-1';
          return;
        }
      }
      this.code.value = template.source;
      this.renderGutter();
      this.renderHighlight();
      this.setActiveLine(0);
      this.saveNow();
      this.print(`已载入示例：${template.name}`, 'dim');
    }

    onKeyDown(event) {
      if (this.running && event.key !== 'Escape') return;
      if (event.key === 'Tab') {
        event.preventDefault();
        const start = this.code.selectionStart;
        const end = this.code.selectionEnd;
        this.code.setRangeText('    ', start, end, 'end');
        this.onInput();
        return;
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.start('run');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (this.running) this.stop();
        else this.close();
        return;
      }
      if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.saveNow();
        this.print('脚本已保存到浏览器本地存储。', 'dim');
      }
    }

    // ------------------------------------------------------------------
    // 运行
    // ------------------------------------------------------------------
    start(mode) {
      if (this.running || !this.isOpen) return;
      let program;
      try {
        program = ZDD.ZScript.compile(this.code.value);
      } catch (error) {
        this.handleError(error, true);
        return;
      }
      this.saveNow();
      this.consoleEl.textContent = '';
      this.count = 0;
      this.updateCount();
      this.setStatus(mode === 'step' ? '单步执行' : '运行中');
      this.print(`▶ ${mode === 'step' ? '单步执行' : '运行脚本'}…`, 'info');
      this.running = true;
      this.mode = mode;
      this.awaitingStep = false;
      this.code.readOnly = true;
      if (this.audio) this.audio.play('click');
      this.generator = ZDD.ZScript.run(program, this.buildHost(), {
        maxSteps: 1500,
        maxActions: 24,
      });
      this.setActiveLine(0);
      this.updateButtons();
      this.tick();
    }

    tick() {
      if (!this.running) return;
      this.timer = null;
      let step;
      try {
        step = this.generator.next();
      } catch (error) {
        this.handleError(error, false);
        return;
      }
      if (step.done) {
        this.finish('done');
        return;
      }
      const event = step.value;
      if (!event || event.type !== 'action') {
        this.timer = global.setTimeout(() => this.tick(), 0);
        return;
      }
      this.count += 1;
      this.updateCount();
      this.printAction(event);
      this.setActiveLine(event.line);
      if (event.stop === 'decision') {
        this.finish('decision');
        return;
      }
      if (event.stop === 'end' || this.game.state !== 'playing') {
        this.finish('end');
        return;
      }
      if (this.game.pendingDecision) {
        this.finish('decision');
        return;
      }
      if (this.mode === 'step') {
        this.awaitingStep = true;
        this.setStatus('单步：等待下一步');
        this.updateButtons();
        return;
      }
      this.timer = global.setTimeout(() => this.tick(), 280);
    }

    step() {
      if (!this.isOpen) return;
      if (this.awaitingStep) {
        this.awaitingStep = false;
        this.setStatus('单步执行');
        this.updateButtons();
        this.tick();
        return;
      }
      if (!this.running) this.start('step');
    }

    stop() {
      if (!this.running) return;
      const hadCount = this.count;
      this.stopSilent();
      this.setStatus('已停止');
      this.updateButtons();
      this.print(`■ 已停止：本次执行 ${hadCount} 个操作。`, 'dim');
    }

    stopSilent() {
      global.clearTimeout(this.timer);
      this.timer = null;
      this.running = false;
      this.awaitingStep = false;
      this.generator = null;
      this.code.readOnly = false;
      this.updateButtons();
    }

    finish(reason) {
      global.clearTimeout(this.timer);
      this.timer = null;
      this.running = false;
      this.awaitingStep = false;
      this.generator = null;
      this.code.readOnly = false;
      this.setActiveLine(0);
      this.updateButtons();
      if (reason === 'done') {
        this.setStatus('完成');
        if (this.audio && this.game.state === 'playing') this.audio.play('success');
        this.print(`脚本完成：共执行 ${this.count} 个操作。`, 'ok');
      } else if (reason === 'decision') {
        this.setStatus('等待决策');
        this.print('脚本在剧情决策前暂停，请先处理决策。', 'warn');
        this.hide();
        this.onChange();
      } else if (reason === 'end') {
        const report = this.game.report;
        this.setStatus('值班结束');
        this.print(
          report
            ? `值班结束：${report.endingTitle} · ${report.score} 分（${report.grade}）。`
            : '值班结束，脚本停止。',
          'warn',
        );
        this.hide();
        this.onChange();
      } else if (reason === 'error') {
        this.setStatus('错误');
      }
    }

    handleError(error, compileTime) {
      const message = error && error.display
        ? error.display
        : (error && error.message ? error.message : String(error));
      const line = Number(error && error.line) || 0;
      this.setStatus(compileTime ? '语法错误' : '运行错误');
      this.print(`✗ ${message}`, 'err');
      if (line) this.setActiveLine(line, true);
      this.running = false;
      this.awaitingStep = false;
      this.generator = null;
      this.code.readOnly = false;
      this.updateButtons();
    }

    updateButtons() {
      this.runButton.disabled = this.running;
      this.runButton.textContent = this.running ? '运行中…' : '▶ 运行';
      this.stepButton.disabled = this.running && !this.awaitingStep;
      this.stepButton.textContent = this.awaitingStep ? '下一步' : '单步';
      this.stopButton.disabled = !this.running;
      if (this.exampleSelect) this.exampleSelect.disabled = this.running;
      if (this.clearButton) this.clearButton.disabled = this.running;
    }

    updateCount() {
      if (this.countEl) this.countEl.textContent = `${this.count} 个操作`;
    }

    setStatus(text) {
      if (!this.statusEl) return;
      this.statusEl.textContent = text;
      if (/错误/.test(text)) this.statusEl.dataset.state = 'error';
      else if (text === '完成') this.statusEl.dataset.state = 'done';
      else if (/等待|单步/.test(text)) this.statusEl.dataset.state = 'waiting';
      else this.statusEl.dataset.state = '';
    }

    // ------------------------------------------------------------------
    // 控制台输出
    // ------------------------------------------------------------------
    print(text, level) {
      const line = document.createElement('div');
      line.className = `sc-line sc-${level || 'print'}`;
      line.textContent = String(text);
      this.consoleEl.appendChild(line);
      while (this.consoleEl.childElementCount > 300) {
        this.consoleEl.removeChild(this.consoleEl.firstElementChild);
      }
      this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
    }

    printAction(event) {
      const prefix = event.ok ? '✓' : '✗';
      const level = event.ok ? 'ok' : 'warn';
      const target = event.target ? ` · ${event.target}` : '';
      const detail = event.message ? ` — ${event.message}` : '';
      this.print(`${prefix} ${event.label || event.name}${target}${detail}`, level);
    }

    printHelp() {
      this.print(ZDD.ZScript.HELP_TEXT, 'dim');
      this.print('提示：先点选一条告警再运行单设备脚本，脚本会作用于该设备。', 'dim');
    }

    // ------------------------------------------------------------------
    // 宿主：把脚本调用接到游戏
    // ------------------------------------------------------------------
    buildHost() {
      const game = this.game;
      const wrapAlert = (alert) => ZDD.ZScript.wrap('alert', alert, {
        id: () => alert.alertId,
        title: () => alert.title,
        level: () => alert.level,
        display_level: () => alert.displayLevel,
        target_id: () => alert.targetId,
        device: () => {
          const device = game.devices[alert.targetId];
          return device ? wrapDevice(device) : null;
        },
        source_ip: () => alert.sourceIp,
        account: () => alert.account,
        investigated: () => alert.investigated,
        false_positive: () => alert.falsePositive,
        controlled: () => alert.controlled,
        resolved: () => alert.resolved,
        status: () => alert.statusText,
        event: () => {
          const event = game.eventForAlert(alert);
          return event ? wrapEvent(event) : null;
        },
      });

      const wrapEvent = (event) => ZDD.ZScript.wrap('event', event, {
        id: () => event.eventId,
        name: () => event.name,
        type: () => event.eventType,
        active: () => event.isActive,
        contained: () => event.contained,
        eradicated: () => event.eradicated,
        progress: () => event.progressText,
        device: () => {
          const device = game.devices[event.activeDeviceId];
          return device ? wrapDevice(device) : null;
        },
        alerts: () => game.orderedAlerts
          .filter((alert) => alert.eventId === event.eventId)
          .map(wrapAlert),
      });

      const wrapDevice = (device) => ZDD.ZScript.wrap('device', device, {
        id: () => device.deviceId,
        name: () => device.name,
        ip: () => device.ip,
        status: () => device.status,
        patched: () => device.patched,
        isolated: () => device.isolated,
        online: () => device.online,
        backups: () => Boolean(device.backups),
        health: () => device.health,
        controlled: () => game.controlledEventsForDevice(device.deviceId).length > 0,
        alerts: () => game.orderedAlerts
          .filter((alert) => alert.targetId === device.deviceId)
          .map(wrapAlert),
        events: () => game.eventsForDevice(device.deviceId).map(wrapEvent),
      });

      return {
        output: (text, level) => this.print(text, level),
        alerts: () => game.orderedAlerts.map(wrapAlert),
        devices: () => Object.values(game.devices).map(wrapDevice),
        events: () => game.events.events.map(wrapEvent),
        find: (token) => {
          const resolved = resolveTargetValue(game, token);
          if (!resolved || resolved.error) return null;
          if (resolved.alert) return wrapAlert(resolved.alert);
          if (resolved.device) return wrapDevice(resolved.device);
          return null;
        },
        status: () => ({
          turn: game.turn,
          clock: ZDD.clockText(game.turn),
          security: game.player.security,
          funds: game.player.funds,
          reputation: game.player.reputation,
          availability: game.player.availability,
          integrity: game.player.integrity,
          ap: game.player.actionPoints,
          max_ap: game.player.maxActionPoints,
          threat: game.threatLevel,
          combo: game.combo,
          seed: game.seed,
        }),
        action: (name, target) => this.perform(name, target),
      };
    }

    prepare(actionId, targetValue, args) {
      if (actionId === 'protect_backup') {
        const token = targetValue === null || targetValue === undefined
          ? ''
          : normalize(ZDD.ZScript.stringify(targetValue));
        const backup = ['', 'backup', 'bak', '备份', '备份服务器', 'bak-01'].includes(token);
        if (backup) {
          const device = this.game.devices['BAK-01'];
          if (!device) return { error: '找不到 BAK-01 备份服务器' };
          return this.withDeviceOption(actionId, device);
        }
      }

      let resolved = null;
      if (targetValue !== null && targetValue !== undefined) {
        resolved = resolveTargetValue(this.game, targetValue);
      } else {
        const current = this.game.currentTarget();
        if (current) {
          resolved = {
            alert: current.alert || null,
            device: current.device || null,
          };
        }
      }
      if (!resolved) return { error: '找不到目标设备或告警，请写设备 ID / IP / #告警编号' };
      if (resolved.error) return resolved;

      if (ALERT_ACTIONS.has(actionId)) {
        return this.withAlertOption(actionId, resolved);
      }
      return this.withDeviceOption(actionId, resolved.device);
    }

    withDeviceOption(actionId, device) {
      if (!device) return { error: '这个操作需要一台设备' };
      const target = new ZDD.models.Target('device', null, device);
      const options = this.game.actions.optionsFor(this.game, target);
      const option = options.find((item) => item.actionId === actionId);
      if (!option) {
        return {
          error: `${device.deviceId} 上没有「${ZDD.ACTION_NAMES[actionId]}」操作`,
          target,
          device,
        };
      }
      return { target, alert: null, device, option };
    }

    withAlertOption(actionId, resolved) {
      const candidates = [];
      if (resolved.alert) {
        candidates.push(resolved.alert);
      } else if (resolved.device) {
        for (const alert of this.game.orderedAlerts) {
          if (alert.resolved) continue;
          if (alert.targetId !== resolved.device.deviceId) continue;
          candidates.push(alert);
        }
      }
      if (!candidates.length) {
        return { error: `${resolved.device ? resolved.device.deviceId : '目标'} 没有未清除的告警` };
      }
      let disabled = null;
      let lastReason = '';
      for (const alert of candidates) {
        const device = this.game.devices[alert.targetId] || resolved.device || null;
        const target = new ZDD.models.Target('alert', alert, device);
        const options = this.game.actions.optionsFor(this.game, target);
        const option = options.find((item) => item.actionId === actionId);
        if (!option) continue;
        if (option.enabled) return { target, alert, device, option };
        if (!disabled) disabled = { target, alert, device, option };
        lastReason = option.reason || lastReason;
      }
      if (disabled) return disabled;
      return { error: lastReason || `目标上没有「${ZDD.ACTION_NAMES[actionId]}」操作` };
    }

    perform(name, targetValue) {
      if (name === 'next') return this.doNext();
      const actionId = ACTION_IDS[name];
      if (!actionId) return { ok: false, message: `未知操作：${name}`, label: name };

      const prepared = this.prepare(actionId, targetValue);
      if (prepared.error) {
        return {
          ok: false,
          message: prepared.error,
          target: prepared.device ? prepared.device.deviceId : '',
          label: ZDD.ACTION_NAMES[actionId] || name,
        };
      }

      if (prepared.alert) this.game.selectAlert(prepared.alert);
      else if (prepared.device) this.game.selectDevice(prepared.device.deviceId);
      if (this.effects && this.topology && prepared.device) {
        this.effects.setFocusElement(this.topology.nodeElement(prepared.device.deviceId));
      }
      this.onChange();

      if (!prepared.option.enabled) {
        return {
          ok: false,
          message: `不可用：${prepared.option.reason}`,
          target: prepared.device ? prepared.device.deviceId : '',
          label: prepared.option.name,
        };
      }

      if (this.audio) this.audio.play('click');
      const result = this.game.performAction(prepared.option, prepared.target);
      this.onChange();

      let stop = null;
      if (this.game.pendingDecision) stop = 'decision';
      else if (this.game.state !== 'playing') stop = 'end';

      return {
        ok: Boolean(result && result.success),
        message: result ? result.message : '操作没有返回结果',
        target: prepared.device ? prepared.device.deviceId : '',
        label: prepared.option.name,
        stop,
      };
    }

    doNext() {
      const before = this.game.turn;
      this.game.endTurn();
      this.onChange();
      let stop = null;
      if (this.game.pendingDecision) stop = 'decision';
      else if (this.game.state !== 'playing') stop = 'end';
      const report = this.game.report;
      return {
        ok: true,
        message: report
          ? `值班结束：${report.endingTitle} · ${report.score} 分（${report.grade}）`
          : `推进到第 ${this.game.turn} 回合（${ZDD.clockText(this.game.turn)}）`,
        target: `${ZDD.clockText(before)} → ${ZDD.clockText(this.game.turn)}`,
        label: '推进回合',
        stop,
      };
    }
  }

  ScriptPanel.TEMPLATES = TEMPLATES;
  ZDD.ScriptPanel = ScriptPanel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
