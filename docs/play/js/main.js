/* 入口：装配游戏、界面、音效、快捷键与渲染循环。 */
(function (global) {
  'use strict';
  const ZDD = global.ZDD;
  const document = global.document;

  function $(id) {
    return document.getElementById(id);
  }

  const refs = {
    app: $('app'),
    menu: $('menu-screen'),
    play: $('play-screen'),
    metrics: $('metrics'),
    deviceTitle: $('device-title'),
    deviceMeta: $('device-meta'),
    devicePanel: $('device-panel'),
    alertMeta: $('alert-meta'),
    alertList: $('alert-list'),
    logMeta: $('log-meta'),
    logChips: $('log-chips'),
    logSearch: $('log-search'),
    logList: $('log-list'),
    actionAp: $('action-ap'),
    actionTarget: $('action-target'),
    actionGrid: $('action-grid'),
    actionHint: $('action-hint'),
    messages: $('messages'),
    advance: $('btn-advance'),
    modal: $('modal'),
    modalCard: $('modal-card'),
    guide: $('guide'),
    ring: $('guide-ring'),
    topoWrap: $('topo-wrap'),
    topoSvg: $('topo-links'),
    topoNodes: $('topo-nodes'),
    recap: $('turn-recap'),
    nightTint: $('night-tint'),
    nightBeat: $('night-beat'),
  };

  const game = new ZDD.Game({ data: ZDD.data, seed: ZDD.randomSeed(), storage: global.localStorage });
  game.seed = ZDD.randomSeed();
  game.difficultyId = game.difficultySet.defaultId;
  const audio = new ZDD.AudioManager();
  const effects = new ZDD.Effects({
    flash: $('fx-flash'),
    banners: $('fx-banners'),
    floaters: $('fx-floaters'),
    bursts: $('fx-bursts'),
    combo: $('fx-combo'),
    feedback: $('fx-feedback'),
  });
  game.audio = audio;
  game.effects = effects;
  game.onActionFeedback = (feedback) => showActionFeedback(feedback);

  const panels = new ZDD.Panels(refs);
  const screens = new ZDD.Screens({
    modal: refs.modal,
    card: refs.modalCard,
    guide: refs.guide,
    ring: refs.ring,
  });
  screens.setRefs(refs);

  const topology = new ZDD.Topology({
    wrap: refs.topoWrap,
    svg: refs.topoSvg,
    layer: refs.topoNodes,
    game,
    onSelect: (deviceId) => {
      clearConfirm();
      game.selectDevice(deviceId);
      effects.setFocusElement(topology.nodeElement(deviceId));
      renderAll();
      scrollToActions();
    },
  });

  const ui = {
    modal: null,
    tutorialOpen: false,
    tutorialPage: 0,
    guideStep: 0,
    guideBase: null,
    guideCompleted: false,
    logCategory: '全部',
    logKeyword: '',
    terminalOpen: false,
    scriptOpen: false,
    phoneTurn: 0,
    phoneUsed: {},
    phoneToast: '',
    phoneResult: null,
    phoneRandomId: null,
  };

  const terminal = new ZDD.Terminal({
    root: $('terminal'),
    screen: $('term-screen'),
    form: $('term-form'),
    input: $('term-input'),
    hint: $('term-hint'),
    status: $('term-status'),
    closeButton: $('term-close'),
    trigger: $('btn-terminal'),
    game,
    audio,
    effects,
    topology,
    onChange: () => renderAll(),
    onOpenChange: (open) => {
      ui.terminalOpen = open;
    },
  });

  const script = new ZDD.ScriptPanel({
    root: $('script'),
    code: $('script-code'),
    gutter: $('script-gutter'),
    highlight: $('script-highlight'),
    console: $('script-console'),
    status: $('script-status'),
    meta: $('script-meta'),
    line: $('script-line'),
    count: $('script-count'),
    runButton: $('script-run'),
    stepButton: $('script-step'),
    stopButton: $('script-stop'),
    exampleSelect: $('script-example'),
    clearButton: $('script-clear'),
    helpButton: $('script-help'),
    closeButton: $('script-close'),
    trigger: $('btn-script'),
    game,
    audio,
    effects,
    topology,
    onChange: () => renderAll(),
    onOpenChange: (open) => {
      ui.scriptOpen = open;
    },
  });

  let lastRevision = -1;
  let lastState = null;
  let pendingRender = true;

  // ------------------------------------------------------------------
  // 体验包 A+B：确认、回合结算、夜色、失败预兆
  // ------------------------------------------------------------------
  const RECAP_MS = 1700;
  const CONFIRM_MS = 4000;
  const CONFIRM_ACTIONS = new Set(['shutdown', 'unisolate']);
  const NIGHT_BEATS = {
    1: { title: '22:00 · 交接完毕', detail: '值班开始，10 小时后早会。' },
    4: { title: '01:00 · 深夜', detail: '值班第 4 小时，还有 6 回合到早会。' },
    7: { title: '04:00 · 最难熬的一段', detail: '值班第 7 小时，还有 3 回合到早会。' },
    10: { title: '07:00 · 天快亮了', detail: '最后一次结算，再撑 1 小时。' },
  };
  const NIGHT_TINTS = [
    [1, 'rgba(30, 78, 146, 0.09)'],
    [3, 'rgba(24, 58, 122, 0.11)'],
    [5, 'rgba(16, 34, 86, 0.14)'],
    [7, 'rgba(22, 44, 94, 0.11)'],
    [9, 'rgba(98, 76, 46, 0.07)'],
    [10, 'rgba(122, 92, 50, 0.06)'],
  ];

  let confirmArm = null;
  let confirmTimer = null;
  let recapTimer = null;
  let feedbackTimer = null;
  let lastRecapSeq = 0;
  let lastNightTurn = 0;

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clearConfirm() {
    confirmArm = null;
    panels.setConfirm(-1);
    if (confirmTimer) {
      global.clearTimeout(confirmTimer);
      confirmTimer = null;
    }
  }

  /**
   * C2：操作结果写在操作面板的提示行里——就地、不挡日志、不挡告警。
   * 正确时才在目标位置炸一小簇粒子，错误时只留文字。
   */
  function showActionFeedback(feedback) {
    if (!feedback) return;
    panels.setFeedback(feedback, 2800);
    if (feedback.correct) effects.addBurst(null, feedback.color, 14);
    if (feedbackTimer) global.clearTimeout(feedbackTimer);
    feedbackTimer = global.setTimeout(() => {
      panels.clearFeedback();
      if (game.state === 'playing') renderAll();
    }, 2800);
  }

  /** B1：推进回合后的 1.5 秒“呼吸”——这一小时发生了什么，以及下回合预警。 */
  function showRecap(recap) {
    if (!refs.recap || !recap) return;
    const items = (recap.items || [])
      .map((item) => `<span class="recap-item ${escapeHtml(item.tone || 'calm')}">${escapeHtml(item.text)}</span>`)
      .join('');
    const next = recap.next && recap.next.length
      ? `<div class="recap-next">${escapeHtml(recap.next.join(' · '))}</div>`
      : '';
    refs.recap.innerHTML = `
      <div class="recap-head">
        <span class="recap-title">第 ${recap.turn} 回合结算</span>
        <span class="recap-clock">${escapeHtml(recap.clock)} 结束</span>
      </div>
      <div class="recap-items">${items || '<span class="recap-item calm">这一小时风平浪静，没有任何指标变化。</span>'}</div>
      ${next}
      <i class="recap-bar"></i>
    `;
    refs.recap.classList.add('show');
    refs.app.classList.add('recap-open');
    global.clearTimeout(recapTimer);
    recapTimer = global.setTimeout(() => {
      refs.recap.classList.remove('show');
      refs.app.classList.remove('recap-open');
    }, RECAP_MS);
  }

  /** B2：夜色随时钟走，22 点偏冷、03 点最沉、06 点回温。 */
  function applyNight(turn) {
    if (!refs.nightTint) return;
    let color = NIGHT_TINTS[0][1];
    for (const [at, value] of NIGHT_TINTS) {
      if (turn >= at) color = value;
    }
    refs.nightTint.style.backgroundColor = color;
  }

  function pulseNightBeat() {
    if (!refs.nightBeat) return;
    refs.nightBeat.classList.add('on');
    global.setTimeout(() => refs.nightBeat.classList.remove('on'), 460);
  }

  // ------------------------------------------------------------------
  // 模态优先级
  // ------------------------------------------------------------------
  function activeModalKind() {
    if (game.showBriefing) return 'briefing';
    if (ui.tutorialOpen) return 'tutorial';
    if (game.pendingDecision) {
      return game.pendingDecision.kind === 'life' ? 'phone' : 'decision';
    }
    if (ui.terminalOpen) return 'terminal';
    if (ui.scriptOpen) return 'script';
    if (game.tutorialMode) return ui.guideCompleted ? 'tutorial-complete' : null;
    if (ui.modal === 'phone') return 'phone';
    if (ui.modal === 'help') return 'help';
    if (ui.modal === 'shop') return 'shop';
    if (ui.modal === 'history') return 'history';
    if (game.state === 'result') return 'result';
    if (game.state === 'paused') return 'pause';
    return null;
  }

  function renderAll() {
    if (game.state === 'result' && ui.modal) ui.modal = null;
    if (game.pendingDecision && ui.modal) ui.modal = null;
    if (game.state !== 'playing' && terminal.isOpen) terminal.hide();

    // 手机：每回合重置主动操作；有待回复的生活消息时给顶栏加角标
    if (ui.phoneTurn !== game.turn) {
      ui.phoneTurn = game.turn;
      ui.phoneUsed = {};
      ui.phoneToast = '';
      ui.phoneResult = null;
    }
    const phoneBadge = $('phone-badge');
    if (phoneBadge) {
      const unread = (game.pendingDecision && game.pendingDecision.kind === 'life' ? 1 : 0)
        + ((game.randomActive && game.randomActive.length) || 0);
      phoneBadge.hidden = unread === 0;
      phoneBadge.textContent = unread ? String(unread) : '';
    }

    // B1：只有“刚推进过”的回合才播摘要，读档/重开不会误播
    if (game.turnRecap && game.turnRecap.seq !== lastRecapSeq) {
      lastRecapSeq = game.turnRecap.seq;
      if (game.state === 'playing') showRecap(game.turnRecap);
    }

    // B2：夜色随时钟走；22/01/04/07 点给一次整点节拍
    if (game.state === 'playing' && game.turn !== lastNightTurn) {
      lastNightTurn = game.turn;
      applyNight(game.turn);
      const beat = NIGHT_BEATS[game.turn];
      if (beat) {
        pulseNightBeat();
        effects.addBanner(beat.title, beat.detail, 'purple');
      }
    } else if (game.state === 'menu') {
      lastNightTurn = 0;
      clearConfirm();
      if (refs.nightTint) refs.nightTint.style.backgroundColor = 'transparent';
    }

    panels.render(game, ui);
    terminal.refresh();
    script.refresh();

    const danger = game.state !== 'menu' && (
      game.threatLevel >= 4
      || game.player.security <= 30
      || game.player.availability <= 40
    );
    refs.app.classList.toggle('is-danger', danger);

    // B4：连续两回合可用性不足 → 画面降饱和、轻微发抖
    const collapse = game.state !== 'menu' && game.lowAvailabilityTurns >= 2;
    refs.app.classList.toggle('is-collapse', collapse);

    if (game.state !== 'menu') {
      const topbar = document.getElementById('topbar');
      const topbarHeight = Math.round(topbar.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--topbar-h', `${topbarHeight}px`);
      if (lastState === 'menu' || lastState === null) topology.layout();
      topology.render();
    }
    lastState = game.state;

    screens.renderModal(activeModalKind(), ui, game);
    const guideStep = game.tutorialMode && !ui.guideCompleted && !ui.tutorialOpen ? ui.guideStep : null;
    screens.renderGuide(guideStep, game);

    // 主菜单信息
    $('menu-seed-text').textContent = `随机种子 ${game.seed}`;
    const difficulty = game.difficultyMode;
    document.querySelectorAll('.diff-btn').forEach((button) => {
      const active = button.dataset.difficulty === difficulty.id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('menu-difficulty-desc').textContent = `${difficulty.name}：${difficulty.tagline}。${difficulty.description}`;
    $('topbar-difficulty').textContent = difficulty.name;
    const hasSave = game.saveManager.hasSave();
    const continueButton = $('menu-continue');
    continueButton.disabled = !hasSave;
    continueButton.title = hasSave ? '读取上次保存的进度' : '还没有存档';
    const muteButton = $('btn-mute');
    muteButton.setAttribute('aria-pressed', String(audio.muted));
    muteButton.textContent = audio.muted ? '音效：关' : '音效：开';
    muteButton.title = audio.muted ? '音效已关闭（M）' : '音效开启（M）';
    const terminalButton = $('btn-terminal');
    terminalButton.setAttribute('aria-pressed', String(ui.terminalOpen));
    const menuMute = $('menu-mute');
    menuMute.setAttribute('aria-pressed', String(audio.muted));
    menuMute.textContent = audio.muted ? '音效：关（M）' : '音效：开（M）';
    menuMute.title = audio.muted ? '点击开启音效（M）' : '点击关闭音效（M）';

    document.body.classList.toggle('is-menu', game.state === 'menu');
    pendingRender = false;
    lastRevision = game.revision;
  }

  function scheduleRender() {
    pendingRender = true;
  }

  /** 窄屏上选中目标后直接滚到操作面板，省掉一次长滚动。 */
  function scrollToActions() {
    if (!global.matchMedia('(max-width: 980px)').matches) return;
    const panel = refs.actionGrid.closest('.panel-actions');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** 执行操作面板里的第 index 个操作（鼠标点击与数字键共用）。 */
  function activateAction(index) {
    if (game.state !== 'playing' || activeModalKind()) return false;
    const option = panels.lastOptions[index];
    const target = game.currentTarget();
    if (!option || !target || !option.enabled) return false;

    // A2：关闭服务器 / 解除隔离不可逆，点第一次只“上膛”，点第二次才执行
    if (CONFIRM_ACTIONS.has(option.actionId)) {
      const armed = confirmArm
        && confirmArm.index === index
        && confirmArm.actionId === option.actionId
        && confirmArm.label === target.label;
      if (!armed) {
        confirmArm = { index, actionId: option.actionId, label: target.label };
        panels.setConfirm(index);
        if (confirmTimer) global.clearTimeout(confirmTimer);
        confirmTimer = global.setTimeout(() => {
          clearConfirm();
          if (game.state === 'playing') renderAll();
        }, CONFIRM_MS);
        audio.play('click');
        renderAll();
        return true;
      }
    }
    clearConfirm();

    effects.setFocusElement(target.device ? topology.nodeElement(target.device.deviceId) : null);
    const hint = game.consumeActionHint(option, target);
    if (hint) {
      game.pushMessage(`新手提示：${hint}`, 'orange');
      effects.addBanner('新手提示', hint.slice(0, 46), 'orange');
    }
    // 点击音由动作自己的音色取代（调查是键盘、隔离是断电、清除是扫频）
    game.performAction(option, target);
    renderAll();
    return true;
  }

  // ------------------------------------------------------------------
  // 教程推进
  // ------------------------------------------------------------------
  function startGuide() {
    ui.guideStep = 0;
    ui.guideCompleted = false;
    ui.guideBase = { terminal: game.terminalActions || 0, script: game.scriptActions || 0, runs: game.scriptRuns || 0 };
    screens.renderGuide(0, game);
    const step = ZDD.GUIDE_STEPS[0];
    game.pushMessage(`${step.title}：${step.instruction}`, 'tutorial');
    scheduleRender();
  }

  /** 带练第 5 步要用的脚本；编辑器空着就填进去（不自动打开面板）。 */
  function tutorialScriptSource() {
    const step = ZDD.GUIDE_STEPS && ZDD.GUIDE_STEPS[4];
    return step && step.helper ? step.helper.source : '';
  }

  function ensureTutorialScript() {
    if (!game.tutorialMode || ui.guideStep !== 4) return;
    const stock = script.matchesStockTemplate && script.matchesStockTemplate();
    if (!stock && script.hasContent && script.hasContent()) return;
    script.prefill(tutorialScriptSource());
    renderAll();
  }

  function updateTutorial() {
    if (!game.tutorialMode || ui.guideCompleted || ui.tutorialOpen) return;
    const base = ui.guideBase || { terminal: 0, script: 0, runs: 0 };
    const terminalHits = (game.terminalActions || 0) - base.terminal;
    const scriptHits = (game.scriptActions || 0) - base.script;
    const scriptRuns = (game.scriptRuns || 0) - (base.runs || 0);
    let advance = false;
    if (ui.guideStep === 0 && game.selectedAlert) advance = true;
    else if (ui.guideStep === 1 && game.selectedAlert && game.selectedAlert.investigated) advance = true;
    // 第 3 步刻意要求「用命令」完成隔离：只看状态会被点按钮蒙混过去
    else if (ui.guideStep === 2 && terminalHits > 0 && game.events.events.some((event) => event.contained)) advance = true;
    else if (ui.guideStep === 3 && game.events.events.some((event) => event.eradicated)) advance = true;
    // 第 5 步：设备已恢复 + 跑过脚本。允许「0 个操作」——
    // 如果玩家已经手动解除隔离，脚本执行 release 会是 0 个操作，不应该卡死。
    else if (ui.guideStep === 4 && scriptRuns > 0 && game.events.events.some((event) => (
      event.eradicated && game.devices[event.activeDeviceId] && !game.devices[event.activeDeviceId].isolated
    ))) advance = true;
    else if (ui.guideStep === 5 && game.turn >= 2) advance = true;
    if (!advance) return;

    ui.guideStep += 1;
    ui.guideBase = {
      terminal: game.terminalActions || 0,
      script: game.scriptActions || 0,
      runs: game.scriptRuns || 0,
    };
    // 进入「用脚本恢复」这一步时，编辑器如果是空的就先填好，
    // 否则玩家按 C 只会看到一个空面板，运行后 0 个操作、直接卡住。
    if (ui.guideStep === 4) ensureTutorialScript();
    // 上一步用过的工具自动收起，否则聚光灯会打在覆盖层下面、点不到的按钮上
    if (ui.guideStep === 3 && terminal.isOpen) terminal.close();
    if (ui.guideStep === 5 && script.isOpen) script.close();
    if (ui.guideStep >= ZDD.GUIDE_STEPS.length) {
      ui.guideCompleted = true;
      audio.play('upgrade');
      effects.flash('green', 50);
      effects.addBanner('教程完成', '点击、命令、脚本三条通道都走通了', 'green');
      screens.renderGuide(null, game);
    } else {
      audio.play('success');
      const step = ZDD.GUIDE_STEPS[ui.guideStep];
      game.pushMessage(`${step.title}：${step.instruction}`, 'tutorial');
      screens.renderGuide(ui.guideStep, game);
    }
    scheduleRender();
  }

  // ------------------------------------------------------------------
  // 模态按钮
  // ------------------------------------------------------------------
  function phoneDo(kind) {
    const player = game.player;
    const used = ui.phoneUsed || {};
    if (used[kind] === game.turn) {
      ui.phoneToast = '这一项今晚已经做过了，先顾告警吧。';
      renderAll();
      return;
    }
    if (kind === 'transfer') {
      if (player.funds < 200) { ui.phoneToast = '资金不够，转不了。'; renderAll(); return; }
      game.adjustMetric('funds', -200, '手机 · 给家里转账');
      game.adjustLife('family', 6, '手机 · 给家里转账');
      game.adjustLife('mood', 2, '手机 · 给家里转账');
      ui.phoneToast = '转账成功：家庭 +6，心情 +2。';
    } else if (kind === 'takeout') {
      if (player.funds < 60) { ui.phoneToast = '资金不够，点不了宵夜。'; renderAll(); return; }
      game.adjustMetric('funds', -60, '手机 · 点宵夜');
      game.adjustLife('energy', 8, '手机 · 点宵夜');
      game.adjustLife('mood', 8, '手机 · 点宵夜');
      ui.phoneToast = '宵夜到了：体力 +8，心情 +8。';
    } else if (kind === 'coffee') {
      if (player.funds < 25) { ui.phoneToast = '资金不够，买不了咖啡。'; renderAll(); return; }
      game.adjustMetric('funds', -25, '手机 · 买咖啡');
      game.adjustLife('energy', 5, '手机 · 买咖啡');
      ui.phoneToast = '喝了口热的：体力 +5。';
    } else if (kind === 'call') {
      if (player.actionPoints < 1) { ui.phoneToast = '行动点不够，先把手头的处置做完。'; renderAll(); return; }
      game.applyActionPointDelta(-1, '手机 · 视频通话');
      game.adjustLife('family', 8, '手机 · 视频通话');
      game.adjustLife('mood', 4, '手机 · 视频通话');
      ui.phoneToast = '视频接通了：家庭 +8，心情 +4。';
    } else {
      return;
    }
    used[kind] = game.turn;
    ui.phoneUsed = used;
    ui.phoneResult = null;
    ui.modal = 'phone';
    audio.play('click');
    renderAll();
  }

  function handleModalAction(act, target) {
    switch (act) {
      case 'briefing-enter':
        game.showBriefing = false;
        renderAll();
        break;
      case 'modifier-pick':
        game.applyRunModifier(target.dataset.id);
        renderAll();
        break;
      case 'tutorial-prev':
        ui.tutorialPage = Math.max(0, ui.tutorialPage - 1);
        renderAll();
        break;
      case 'tutorial-next':
        if (ui.tutorialPage < ZDD.TUTORIAL_PAGES.length - 1) {
          ui.tutorialPage += 1;
          renderAll();
        } else {
          ui.tutorialOpen = false;
          audio.play('click');
          startGuide();
        }
        break;
      case 'tutorial-skip':
        ui.tutorialOpen = false;
        game.finishTutorial(false);
        ui.guideCompleted = false;
        renderAll();
        break;
      case 'tutorial-start':
        ui.guideCompleted = false;
        ui.tutorialPage = 0;
        game.finishTutorial(true);
        renderAll();
        break;
      case 'tutorial-menu':
        ui.guideCompleted = false;
        game.finishTutorial(false);
        renderAll();
        break;
      case 'help-close':
        ui.modal = null;
        renderAll();
        break;
      case 'decision-choose':
        game.chooseDecision(Number(target.dataset.index));
        renderAll();
        break;
      case 'phone-choose': {
        const decision = game.pendingDecision;
        const index = Number(target.dataset.index);
        if (!decision || !Array.isArray(decision.choices) || !decision.choices[index]) break;
        const choice = decision.choices[index];
        const before = { energy: game.player.energy, mood: game.player.mood, family: game.player.family };
        game.chooseDecision(index);
        const deltas = {};
        ['energy', 'mood', 'family'].forEach((key) => {
          const delta = game.player[key] - before[key];
          if (delta) deltas[key] = delta;
        });
        ui.phoneResult = {
          title: decision.title || '',
          label: choice.label || '',
          result: choice.result || '',
          deltas,
        };
        ui.modal = 'phone';
        audio.play('click');
        renderAll();
        break;
      }
      case 'phone-after':
        ui.phoneResult = null;
        ui.phoneRandomId = null;
        ui.phoneToast = '';
        ui.modal = null;
        renderAll();
        break;
      case 'phone-close':
        if (game.pendingDecision && game.pendingDecision.kind === 'life') {
          ui.phoneToast = '先把这条消息回掉，再继续值班。';
          renderAll();
          break;
        }
        ui.phoneResult = null;
        ui.phoneRandomId = null;
        ui.phoneToast = '';
        ui.modal = null;
        renderAll();
        break;
      case 'phone-random-open':
        ui.phoneRandomId = String(target.dataset.id || '');
        ui.modal = 'phone';
        renderAll();
        break;
      case 'phone-random-choose': {
        const id = String(target.dataset.id || '');
        const index = Number(target.dataset.index);
        const resolved = game.resolveRandomEvent(id, index);
        if (!resolved) break;
        const deltas = {};
        ['energy', 'mood', 'family'].forEach((key) => {
          const value = Number((resolved.effects || {})[key] || 0);
          if (value) deltas[key] = value;
        });
        ui.phoneRandomId = null;
        ui.phoneResult = { label: resolved.label, result: resolved.result, deltas };
        ui.modal = 'phone';
        audio.play('click');
        renderAll();
        break;
      }
      case 'phone-do':
        phoneDo(target.dataset.kind);
        break;
      case 'shop-buy': {
        const [ok, message] = game.buyUpgrade(target.dataset.upgrade);
        if (!ok) game.pushMessage(message, 'orange');
        renderAll();
        break;
      }
      case 'shop-close':
        ui.modal = null;
        renderAll();
        break;
      case 'history-close':
        ui.modal = null;
        renderAll();
        break;
      case 'history-clear':
        if (global.confirm('清空这台设备上的历史记录？此操作不可恢复。')) {
          game.saveManager.clearHistory();
          renderAll();
        }
        break;
      case 'result-restart':
        ui.modal = null;
        ui.guideCompleted = false;
        game.seed = ZDD.randomSeed();
        game.newGame({ briefing: true, difficulty: game.difficultyId });
        renderAll();
        break;
      case 'result-menu':
        ui.modal = null;
        game.state = 'menu';
        audio.stopAmbient();
        game.touch();
        renderAll();
        break;
      case 'pause-resume':
        game.state = 'playing';
        game.touch();
        renderAll();
        break;
      case 'pause-save':
        game.saveGame();
        renderAll();
        break;
      case 'pause-load':
        game.loadGame();
        renderAll();
        break;
      case 'pause-shop':
        ui.modal = 'shop';
        renderAll();
        break;
      case 'pause-restart':
        game.newGame({ difficulty: game.difficultyId });
        renderAll();
        break;
      case 'pause-menu':
        game.state = 'menu';
        audio.stopAmbient();
        game.touch();
        renderAll();
        break;
      case 'guide-exit':
        ui.guideCompleted = false;
        game.finishTutorial(false);
        renderAll();
        break;
      case 'guide-fill': {
        // 沉浸式带练：把当前这一步要用的命令/脚本直接填好，玩家只需要按回车或点运行
        const step = ZDD.GUIDE_STEPS[ui.guideStep];
        if (!step || !step.helper) break;
        if (step.helper.kind === 'terminal') {
          terminal.open();
          terminal.prefill(step.helper.cmd);
        } else if (step.helper.kind === 'script') {
          script.openWith(step.helper.source);
        }
        audio.play('click');
        renderAll();
        break;
      }
      case 'test-sound':
        playSoundTest();
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // 事件绑定
  // ------------------------------------------------------------------
  function bindMenu() {
    $('menu-start').addEventListener('click', () => {
      ui.modal = null;
      game.newGame({ briefing: true, difficulty: game.difficultyId });
      game.pushMessage('提示：按 ` 打开终端，按 C 打开自动化剧本，都可以直接处置目标。', 'accent');
      renderAll();
    });
    $('menu-continue').addEventListener('click', () => {
      ui.modal = null;
      const ok = game.loadGame();
      if (!ok) scheduleRender();
      renderAll();
    });
    $('menu-tutorial').addEventListener('click', () => {
      ui.modal = null;
      ui.guideCompleted = false;
      ui.tutorialOpen = true;
      ui.tutorialPage = 0;
      game.newGame({ tutorial: true, difficulty: game.difficultyId });
      renderAll();
    });
    $('menu-history').addEventListener('click', () => {
      ui.modal = 'history';
      renderAll();
    });
    $('menu-seed').addEventListener('click', () => {
      game.seed = ZDD.randomSeed();
      $('menu-seed-text').textContent = `随机种子 ${game.seed}`;
    });
    document.querySelectorAll('.diff-btn').forEach((button) => {
      button.addEventListener('click', () => {
        game.difficultyId = button.dataset.difficulty;
        renderAll();
      });
    });
    $('menu-help').addEventListener('click', () => {
      ui.modal = 'help';
      renderAll();
    });
    $('menu-mute').addEventListener('click', toggleAudio);
  }

  function toggleAudio() {
    const muted = audio.toggleMute();
    audio.ensure();
    if (!muted) audio.play('click');
    if (game.state === 'playing') game.pushMessage(`音效已${muted ? '关闭' : '开启'}。`, 'dim');
    renderAll();
    return muted;
  }

  function playSoundTest() {
    if (audio.muted) audio.toggleMute();
    const ctx = audio.ensure();
    audio.play('success');
    global.setTimeout(() => audio.play('alert'), 520);
    const report = () => {
      const blocked = !audio.ctx || audio.ctx.state !== 'running';
      if (game.state === 'playing') {
        game.pushMessage(
          blocked
            ? '浏览器仍阻止了声音：请检查站点静音、系统音量，或在新标签页直接打开本页。'
            : '已播放测试音；如果仍然没有声音，请检查系统音量或浏览器对该站点的静音设置。',
          blocked ? 'orange' : 'accent',
        );
      }
      renderAll();
    };
    global.setTimeout(report, 250);
    if (game.state !== 'playing') report();
    return ctx;
  }

  function bindPlay() {
    $('btn-help').addEventListener('click', () => {
      if (ui.modal === 'help') ui.modal = null;
      else ui.modal = 'help';
      renderAll();
    });
    $('btn-mute').addEventListener('click', toggleAudio);
    const pause = () => {
      if (game.state !== 'playing') return;
      game.state = 'paused';
      game.touch();
      renderAll();
    };
    $('btn-pause').addEventListener('click', pause);
    $('btn-pause-2').addEventListener('click', pause);
    $('btn-terminal').addEventListener('click', () => {
      if (game.state !== 'playing' || activeModalKind()) return;
      terminal.open();
    });
    $('btn-script').addEventListener('click', () => {
      if (game.state !== 'playing' || activeModalKind()) return;
      ensureTutorialScript();
      script.open();
    });
    $('btn-phone').addEventListener('click', () => {
      if (game.state !== 'playing') return;
      if (game.pendingDecision && game.pendingDecision.kind === 'life') {
        ui.modal = 'phone';
        renderAll();
        return;
      }
      if (activeModalKind() && activeModalKind() !== 'phone') return;
      if (ui.modal === 'phone') {
        ui.modal = null;
        ui.phoneResult = null;
        ui.phoneRandomId = null;
        ui.phoneToast = '';
      } else {
        ui.modal = 'phone';
      }
      renderAll();
    });
    refs.advance.addEventListener('click', () => {
      if (game.state !== 'playing' || activeModalKind()) return;
      clearConfirm();
      panels.clearFeedback();
      game.endTurn();
      renderAll();
    });

    refs.alertList.addEventListener('click', (event) => {
      const row = event.target.closest('[data-alert-id]');
      if (!row) return;
      const alert = game.events.alerts.find((item) => item.alertId === row.dataset.alertId);
      if (!alert) return;
      clearConfirm();
      game.selectAlert(alert);
      effects.setFocusElement(topology.nodeElement(alert.targetId));
      renderAll();
      scrollToActions();
    });

    refs.actionGrid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action-index]');
      if (!button || button.disabled) return;
      activateAction(Number(button.dataset.actionIndex));
      // 鼠标点完后把焦点还给页面，避免空格误触同一个操作
      if (event.detail > 0) button.blur();
    });

    refs.logChips.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-category]');
      if (!chip) return;
      ui.logCategory = chip.dataset.category;
      panels.logStickToBottom = true;
      renderAll();
    });

    let searchTimer = null;
    refs.logSearch.addEventListener('input', () => {
      ui.logKeyword = refs.logSearch.value;
      panels.logStickToBottom = true;
      global.clearTimeout(searchTimer);
      searchTimer = global.setTimeout(renderAll, 120);
    });
    refs.logSearch.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        refs.logSearch.value = '';
        ui.logKeyword = '';
        refs.logSearch.blur();
        renderAll();
        event.stopPropagation();
      }
    });

    refs.logList.addEventListener('scroll', () => panels.onLogScroll(), { passive: true });
    for (const type of ['wheel', 'touchstart', 'mousedown']) {
      refs.logList.addEventListener(type, () => panels.markUserScrollIntent(), { passive: true });
    }

    refs.topoWrap.addEventListener('click', (event) => {
      if (event.target.closest('[data-device]')) return;
      clearConfirm();
      game.clearSelection();
      effects.setFocusElement(null);
      renderAll();
    });

    refs.modalCard.addEventListener('click', (event) => {
      const button = event.target.closest('[data-act]');
      if (!button || button.disabled) return;
      handleModalAction(button.dataset.act, button);
    });

    refs.guide.addEventListener('click', (event) => {
      const button = event.target.closest('[data-act]');
      if (!button) return;
      handleModalAction(button.dataset.act, button);
    });

    global.addEventListener('resize', () => {
      topology.layout();
      scheduleRender();
      if (ui.guideStep < ZDD.GUIDE_STEPS.length) screens.updateRing(ui.guideStep);
    });
    global.addEventListener('scroll', () => {
      if (ui.guideStep < ZDD.GUIDE_STEPS.length) screens.updateRing(ui.guideStep);
    }, { passive: true });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      const tag = (event.target && event.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (event.target && event.target.isContentEditable);
      const interactive = ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

      if (typing) return;

      // ` 或 ~：打开 / 关闭处置终端（只在不处于其他浮层时）
      if (event.key === '`' || event.key === '~' || event.code === 'Backquote') {
        if (ui.scriptOpen) return;
        if (ui.terminalOpen) {
          event.preventDefault();
          terminal.close();
          return;
        }
        if (game.state === 'playing' && !activeModalKind()) {
          event.preventDefault();
          terminal.open();
          return;
        }
      }

      // C：打开 / 关闭自动化剧本
      if (!event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'c' || event.key === 'C')) {
        if (ui.scriptOpen) {
          event.preventDefault();
          script.close();
          return;
        }
        if (ui.terminalOpen) {
          event.preventDefault();
          terminal.close();
          ensureTutorialScript();
          script.open();
          return;
        }
        if (game.state === 'playing' && !activeModalKind()) {
          event.preventDefault();
          ensureTutorialScript();
          script.open();
          return;
        }
      }

      if (event.key === 'F1') {
        event.preventDefault();
        const current = activeModalKind();
        if (current && current !== 'help' && current !== 'pause' && current !== 'result') return;
        if (ui.modal === 'help') ui.modal = null;
        else ui.modal = 'help';
        renderAll();
        return;
      }

      if (event.key === 'p' || event.key === 'P') {
        if (!['playing', 'paused'].includes(game.state)) return;
        if (game.pendingDecision && game.pendingDecision.kind === 'life') {
          ui.modal = 'phone';
          renderAll();
          return;
        }
        if (ui.terminalOpen || ui.scriptOpen) return;
        if (activeModalKind() && activeModalKind() !== 'phone') return;
        if (ui.modal === 'phone') {
          ui.modal = null;
          ui.phoneResult = null;
          ui.phoneRandomId = null;
          ui.phoneToast = '';
        } else {
          ui.modal = 'phone';
        }
        renderAll();
        return;
      }

      if (event.key === 'm' || event.key === 'M') {
        const muted = audio.toggleMute();
        if (game.state === 'playing') game.pushMessage(`音效已${muted ? '关闭' : '开启'}。`, 'dim');
        renderAll();
        return;
      }

      if (event.key === 'u' || event.key === 'U') {
        if (!['playing', 'paused'].includes(game.state) || game.tutorialMode) return;
        if (ui.terminalOpen || ui.scriptOpen) return;
        if (activeModalKind() === 'decision' || activeModalKind() === 'briefing') return;
        if (ui.modal === 'shop') ui.modal = null;
        else ui.modal = 'shop';
        renderAll();
        return;
      }

      if (event.key === 'F5') {
        event.preventDefault();
        if (game.state === 'playing' && !activeModalKind()) {
          game.saveGame();
          renderAll();
        }
        return;
      }
      if (event.key === 'F9') {
        event.preventDefault();
        if (!activeModalKind() || activeModalKind() === 'pause') {
          game.loadGame();
          renderAll();
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        const kind = activeModalKind();
        if (kind === 'script') {
          script.close();
          return;
        }
        if (kind === 'terminal') {
          terminal.close();
          return;
        }
        if (kind === 'phone') {
          if (game.pendingDecision && game.pendingDecision.kind === 'life') {
            ui.phoneToast = '先把这条消息回掉，再继续值班。';
            renderAll();
            return;
          }
          ui.modal = null;
          ui.phoneResult = null;
          ui.phoneRandomId = null;
          ui.phoneToast = '';
          renderAll();
          return;
        }
        if (kind === 'briefing' || kind === 'decision') return;
        if (kind === 'help' || kind === 'shop' || kind === 'history') {
          ui.modal = null;
          renderAll();
        } else if (kind === 'tutorial') {
          ui.tutorialOpen = false;
          game.finishTutorial(false);
          renderAll();
        } else if (kind === 'tutorial-complete') {
          ui.guideCompleted = false;
          game.finishTutorial(false);
          renderAll();
        } else if (game.state === 'playing' && game.tutorialMode) {
          game.finishTutorial(false);
          ui.guideCompleted = false;
          renderAll();
        } else if (game.state === 'playing') {
          game.state = 'paused';
          game.touch();
          renderAll();
        } else if (game.state === 'paused') {
          game.state = 'playing';
          game.touch();
          renderAll();
        } else if (game.state === 'result') {
          game.state = 'menu';
          audio.stopAmbient();
          game.touch();
          renderAll();
        }
        return;
      }

      if (event.key === ' ' && game.state === 'playing' && !activeModalKind()) {
        // 焦点在按钮上时交给按钮自身的空格/回车行为，避免重复触发
        if (interactive) return;
        event.preventDefault();
        clearConfirm();
        panels.clearFeedback();
        game.endTurn();
        renderAll();
        return;
      }

      // 数字键 1–9：执行操作面板里对应按钮（与鼠标点击等价）
      if (/^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (game.state === 'playing' && !activeModalKind()) {
          event.preventDefault();
          activateAction(Number(event.key) - 1);
          return;
        }
      }

      if ((event.key === 'Enter' || event.key === 'NumpadEnter') && game.state === 'menu') {
        if (interactive) return;
        event.preventDefault();
        game.newGame({ briefing: true, difficulty: game.difficultyId });
        renderAll();
      }
    });
  }

  function bindAudioUnlock() {
    const unlock = () => {
      audio.ensure();
      if (game.state === 'playing') audio.playAmbient();
    };
    // 不注销：iOS/Safari 在切后台后可能再次 suspend，每次手势都顺手恢复
    for (const type of ['pointerdown', 'keydown', 'touchstart']) {
      global.addEventListener(type, unlock, { passive: true });
    }

    // 所有按钮/可选行统一给一个轻点击音，避免“点了没反应”的感觉
    document.addEventListener('click', (event) => {
      const target = event.target.closest('button, .alert-row, .chip, .choice, .topo-node');
      if (!target || target.disabled) return;
      if (target.classList.contains('act')) return; // 操作按钮由 performAction 前统一播放
      audio.play('click');
    }, { capture: true });
  }

  // ------------------------------------------------------------------
  // 渲染循环
  // ------------------------------------------------------------------
  function loop() {
    updateTutorial();
    if (pendingRender || game.revision !== lastRevision) renderAll();
    global.requestAnimationFrame(loop);
  }

  function init() {
    bindMenu();
    bindPlay();
    bindKeyboard();
    bindAudioUnlock();
    topology.build();
    panels.render(game, ui);
    // 用同样的数据模型重建设备节点（newGame 会重建对象，但 deviceId 不变）
    renderAll();
    if (game.state !== 'menu') topology.render();
    global.requestAnimationFrame(loop);
    global.setInterval(() => {
      if (game.tutorialMode && !ui.guideCompleted) screens.updateRing(ui.guideStep);
    }, 350);
    // 调试与自动化测试用的只读句柄
    global.__zdd = { game, ui, effects, screens, panels, topology, audio, terminal, script, renderAll };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

