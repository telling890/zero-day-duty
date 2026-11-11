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
  };

  const game = new ZDD.Game({ data: ZDD.data, seed: ZDD.randomSeed(), storage: global.localStorage });
  game.seed = ZDD.randomSeed();
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
  game.onActionFeedback = (feedback) => effects.showFeedback(feedback);

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
    guideCompleted: false,
    logCategory: '全部',
    logKeyword: '',
  };

  let lastRevision = -1;
  let lastState = null;
  let pendingRender = true;

  // ------------------------------------------------------------------
  // 模态优先级
  // ------------------------------------------------------------------
  function activeModalKind() {
    if (game.showBriefing) return 'briefing';
    if (ui.tutorialOpen) return 'tutorial';
    if (game.tutorialMode) return ui.guideCompleted ? 'tutorial-complete' : null;
    if (ui.modal === 'help') return 'help';
    if (game.pendingDecision) return 'decision';
    if (ui.modal === 'shop') return 'shop';
    if (ui.modal === 'history') return 'history';
    if (game.state === 'result') return 'result';
    if (game.state === 'paused') return 'pause';
    return null;
  }

  function renderAll() {
    if (game.state === 'result' && ui.modal) ui.modal = null;
    if (game.pendingDecision && ui.modal) ui.modal = null;

    panels.render(game, ui);

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
    const hasSave = game.saveManager.hasSave();
    const continueButton = $('menu-continue');
    continueButton.disabled = !hasSave;
    continueButton.title = hasSave ? '读取上次保存的进度' : '还没有存档';
    const muteButton = $('btn-mute');
    muteButton.setAttribute('aria-pressed', String(audio.muted));
    muteButton.textContent = audio.muted ? '静音' : '音效';
    muteButton.title = audio.muted ? '音效已关闭（M）' : '音效开启（M）';

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

  // ------------------------------------------------------------------
  // 教程推进
  // ------------------------------------------------------------------
  function startGuide() {
    ui.guideStep = 0;
    ui.guideCompleted = false;
    screens.renderGuide(0, game);
    const step = ZDD.GUIDE_STEPS[0];
    game.pushMessage(`${step.title}：${step.instruction}`, 'tutorial');
    scheduleRender();
  }

  function updateTutorial() {
    if (!game.tutorialMode || ui.guideCompleted || ui.tutorialOpen) return;
    let advance = false;
    if (ui.guideStep === 0 && game.selectedAlert) advance = true;
    else if (ui.guideStep === 1 && game.selectedAlert && game.selectedAlert.investigated) advance = true;
    else if (ui.guideStep === 2 && game.events.events.some((event) => event.contained)) advance = true;
    else if (ui.guideStep === 3 && game.events.events.some((event) => event.eradicated)) advance = true;
    else if (ui.guideStep === 4 && game.events.events.some((event) => (
      event.eradicated && game.devices[event.activeDeviceId] && !game.devices[event.activeDeviceId].isolated
    ))) advance = true;
    else if (ui.guideStep === 5 && game.turn >= 2) advance = true;
    if (!advance) return;

    ui.guideStep += 1;
    if (ui.guideStep >= ZDD.GUIDE_STEPS.length) {
      ui.guideCompleted = true;
      audio.play('upgrade');
      effects.flash('green', 50);
      effects.addBanner('教程完成', '你已经掌握完整处置循环', 'green');
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
  function handleModalAction(act, target) {
    switch (act) {
      case 'briefing-enter':
        game.showBriefing = false;
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
        game.newGame({ briefing: true });
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
        game.newGame();
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
      game.newGame({ briefing: true });
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
      game.newGame({ tutorial: true });
      renderAll();
    });
    $('menu-history').addEventListener('click', () => {
      ui.modal = 'history';
      renderAll();
    });
    $('menu-seed').addEventListener('click', () => {
      game.seed = ZDD.randomSeed();
      $('menu-seed-text').textContent = `随机种子 ${game.seed}`;
      audio.play('click');
    });
    $('menu-help').addEventListener('click', () => {
      ui.modal = 'help';
      renderAll();
    });
  }

  function bindPlay() {
    $('btn-help').addEventListener('click', () => {
      if (ui.modal === 'help') ui.modal = null;
      else ui.modal = 'help';
      renderAll();
    });
    $('btn-mute').addEventListener('click', () => {
      const muted = audio.toggleMute();
      if (game.state === 'playing') {
        game.pushMessage(`音效已${muted ? '关闭' : '开启'}。`, 'dim');
      }
      renderAll();
    });
    const pause = () => {
      if (game.state !== 'playing') return;
      game.state = 'paused';
      game.touch();
      renderAll();
    };
    $('btn-pause').addEventListener('click', pause);
    $('btn-pause-2').addEventListener('click', pause);
    refs.advance.addEventListener('click', () => {
      if (game.state !== 'playing' || activeModalKind()) return;
      game.endTurn();
      renderAll();
    });

    refs.alertList.addEventListener('click', (event) => {
      const row = event.target.closest('[data-alert-id]');
      if (!row) return;
      const alert = game.events.alerts.find((item) => item.alertId === row.dataset.alertId);
      if (!alert) return;
      game.selectAlert(alert);
      effects.setFocusElement(topology.nodeElement(alert.targetId));
      renderAll();
      scrollToActions();
    });

    refs.actionGrid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action-index]');
      if (!button || button.disabled) return;
      const index = Number(button.dataset.actionIndex);
      const option = panels.lastOptions[index];
      const target = game.currentTarget();
      if (!option || !target) return;
      effects.setFocusElement(target.device ? topology.nodeElement(target.device.deviceId) : null);
      audio.play('click');
      game.performAction(option, target);
      // 鼠标点完后把焦点还给页面，避免空格误触同一个操作
      if (event.detail > 0) button.blur();
      renderAll();
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

      if (event.key === 'F1') {
        event.preventDefault();
        const current = activeModalKind();
        if (current && current !== 'help' && current !== 'pause' && current !== 'result') return;
        if (ui.modal === 'help') ui.modal = null;
        else ui.modal = 'help';
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
        game.endTurn();
        renderAll();
        return;
      }

      if ((event.key === 'Enter' || event.key === 'NumpadEnter') && game.state === 'menu') {
        if (interactive) return;
        event.preventDefault();
        game.newGame({ briefing: true });
        renderAll();
      }
    });
  }

  function bindAudioUnlock() {
    const unlock = () => {
      audio.ensure();
      if (game.state === 'playing') audio.playAmbient();
      global.removeEventListener('pointerdown', unlock);
      global.removeEventListener('keydown', unlock);
    };
    global.addEventListener('pointerdown', unlock);
    global.addEventListener('keydown', unlock);
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
    global.__zdd = { game, ui, effects, screens, panels, topology, renderAll };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
