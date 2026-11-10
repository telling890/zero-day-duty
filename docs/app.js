/* 零日值班 · 主页交互
   1. 滚动进场 / 进度条 / 导航高亮 / 卡片柔光
   2. 试玩一个回合（演示状态机）
   3. 四步循环 / 六种结局（选项卡）
   4. 截图大图（<dialog>）
   5. 命令复制
*/
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============================ 进场动画 ============================ */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

    items.forEach(function (el) { io.observe(el); });

    function revealVisibleNow() {
      var vh = window.innerHeight;
      items.forEach(function (el) {
        if (el.getBoundingClientRect().top < vh * 0.9) el.classList.add('in');
      });
    }

    revealVisibleNow();
    requestAnimationFrame(revealVisibleNow);

    window.setTimeout(function () {
      items.forEach(function (el) { el.classList.add('in'); });
    }, 1500);
  }

  /* ============================ 导航 / 进度 ============================ */
  function initNav() {
    var nav = document.querySelector('.nav-wrap');
    var bar = document.querySelector('.progress i');
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav-links a'));
    var sections = links
      .map(function (link) { return document.querySelector(link.getAttribute('href')); })
      .filter(Boolean);
    var ticking = false;

    function update() {
      ticking = false;
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);

      if (bar) {
        var scrollable = document.documentElement.scrollHeight - window.innerHeight;
        var ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
        bar.style.transform = 'scaleX(' + ratio + ')';
      }

      var current = null;
      sections.forEach(function (section) {
        if (section.getBoundingClientRect().top <= 160) current = section.id;
      });

      links.forEach(function (link) {
        link.classList.toggle('active', link.getAttribute('href') === '#' + current);
      });
    }

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });

    update();
  }

  /* ============================ 卡片柔光 ============================ */
  function initSpotlight() {
    if (reduceMotion || !window.matchMedia('(hover: hover)').matches) return;
    document.querySelectorAll('.card').forEach(function (card) {
      card.addEventListener('pointermove', function (event) {
        var box = card.getBoundingClientRect();
        card.style.setProperty('--mx', (event.clientX - box.left) + 'px');
        card.style.setProperty('--my', (event.clientY - box.top) + 'px');
      }, { passive: true });
    });
  }

  /* ============================ 试玩一个回合 ============================ */
  function initDemo() {
    var root = document.getElementById('demo');
    if (!root) return;

    var out = {
      ap: root.querySelector('[data-demo="ap"]'),
      funds: root.querySelector('[data-demo="funds"]'),
      threat: root.querySelector('[data-demo="threat"]'),
      avail: root.querySelector('[data-demo="avail"]'),
      hint: root.querySelector('[data-demo="hint"]'),
      log: root.querySelector('[data-demo="log"]')
    };
    var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-step]'));
    var reset = root.querySelector('[data-demo-reset]');

    var START = { ap: 6, funds: 1280, threat: 3, avail: 100 };
    var INTRO = '这是演示用的固定剧本，不是真结局。完整版有 6 条攻击链、12 种操作。';

    var steps = [
      {
        ap: 1, funds: 20, threat: 3, cls: '',
        log: '调查完成：真实风险 78%，区间收窄到 ±6%。预测下一跳：MAIL-01。',
        hint: '风险已经可信——先把它按住：隔离 PC-01。'
      },
      {
        ap: 1, funds: 0, threat: 3, cls: 'is-warn',
        log: '控制成功：PC-01 已隔离，攻击链停住。注意，这只是「控制」。',
        hint: '隔离不等于结束。下一步：清除根因。'
      },
      {
        ap: 2, funds: 40, threat: 2, cls: 'is-ok',
        log: '清除成功：恶意附件已删除，事件关闭，威胁等级 3 → 2。',
        hint: '最后一步：把业务恢复回来。'
      },
      {
        ap: 1, funds: 0, threat: 2, cls: 'is-ok',
        log: '恢复完成：PC-01 从 BAK-01 恢复，可用性 100%。本回合还剩 1 点行动点。',
        hint: '这一回合打完了——真实版里，下一回合还有 5 条链在等你。'
      }
    ];

    var state = { ap: START.ap, funds: START.funds, threat: START.threat, avail: START.avail, index: 0 };

    function setNum(el, value) {
      if (el) el.textContent = value;
    }

    function paint() {
      setNum(out.ap, state.ap + ' / 6');
      setNum(out.funds, '¥' + state.funds);
      setNum(out.threat, state.threat + ' / 5');
      setNum(out.avail, state.avail + '%');

      if (out.threat) {
        out.threat.classList.toggle('is-danger', state.threat >= 4);
        out.threat.classList.toggle('is-warn', state.threat === 3);
        out.threat.classList.toggle('is-ok', state.threat <= 2);
      }

      buttons.forEach(function (button, i) {
        var isNext = i === state.index;
        button.disabled = !isNext;
        button.classList.toggle('is-next', isNext);
      });

      if (state.index < steps.length) {
        if (out.hint) out.hint.textContent = steps[state.index].hint;
      } else if (out.hint) {
        out.hint.textContent = '事件已关闭。真实版里，这时候还要留着行动点应付下一条链。';
      }
    }

    function addLine(text, cls) {
      if (!out.log) return;
      var p = document.createElement('p');
      p.className = 'log-line' + (cls ? ' ' + cls : '');
      p.textContent = text;
      out.log.appendChild(p);
      out.log.scrollTop = out.log.scrollHeight;
    }

    function run(step) {
      if (step.ap > state.ap) {
        addLine('行动点不够了：这一步需要 ' + step.ap + ' 点。', 'is-warn');
        return;
      }
      state.ap -= step.ap;
      state.funds -= step.funds;
      state.threat = step.threat;
      state.index += 1;
      addLine(step.log, step.cls);
      if (state.index === steps.length) {
        addLine('回合结束：事件关闭，可用性 100%，本回合花了 5 点行动点、¥60。', 'is-ok');
      }
      paint();
    }

    buttons.forEach(function (button, i) {
      button.addEventListener('click', function () {
        if (i !== state.index) return;
        run(steps[i]);
      });
    });

    if (reset) {
      reset.addEventListener('click', function () {
        state = { ap: START.ap, funds: START.funds, threat: START.threat, avail: START.avail, index: 0 };
        if (out.log) {
          out.log.innerHTML = '';
          var p = document.createElement('p');
          p.className = 'log-line is-muted';
          p.textContent = INTRO;
          out.log.appendChild(p);
        }
        paint();
      });
    }

    paint();
  }

  /* ============================ 通用选项卡 ============================ */
  function initTabs(tabSelector, tabAttr, panelAttr) {
    var tabs = Array.prototype.slice.call(document.querySelectorAll(tabSelector));
    if (!tabs.length) return;
    var panels = Array.prototype.slice.call(document.querySelectorAll('[' + panelAttr + ']'));
    if (!panels.length) return;

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var key = tab.getAttribute(tabAttr);
        tabs.forEach(function (other) {
          var on = other === tab;
          other.classList.toggle('is-active', on);
          other.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panels.forEach(function (panel) {
          panel.classList.toggle('is-active', panel.getAttribute(panelAttr) === key);
        });
      });
    });
  }

  /* ============================ 截图大图 ============================ */
  function initLightbox() {
    var dialog = document.getElementById('shotbox');
    var triggers = Array.prototype.slice.call(document.querySelectorAll('.shot-zoom'));
    if (!dialog || !triggers.length || typeof dialog.showModal !== 'function') return;

    var img = dialog.querySelector('#shotbox-img');
    var cap = dialog.querySelector('#shotbox-cap');
    var count = dialog.querySelector('#shotbox-count');
    var current = 0;

    function show(index) {
      current = (index + triggers.length) % triggers.length;
      var trigger = triggers[current];
      img.src = trigger.getAttribute('data-src');
      img.alt = trigger.getAttribute('aria-label') || '';
      cap.textContent = trigger.getAttribute('data-cap') || '';
      count.textContent = (current + 1) + ' / ' + triggers.length;
    }

    function open(index) {
      show(index);
      dialog.showModal();
    }

    triggers.forEach(function (trigger, i) {
      trigger.addEventListener('click', function () { open(i); });
    });

    dialog.querySelector('[data-shotbox-close]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('[data-shotbox-prev]').addEventListener('click', function () { show(current - 1); });
    dialog.querySelector('[data-shotbox-next]').addEventListener('click', function () { show(current + 1); });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });

    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
    });
  }

  /* ============================ 复制命令 ============================ */
  function initCopy() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-copy]'));
    if (!buttons.length) return;

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var target = document.querySelector(button.getAttribute('data-copy'));
        if (!target) return;
        var text = target.innerText.replace(/\s+$/g, '');

        function done() {
          var original = button.textContent;
          button.textContent = '已复制';
          button.classList.add('is-done');
          window.setTimeout(function () {
            button.textContent = original;
            button.classList.remove('is-done');
          }, 1600);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else {
          fallback();
        }

        function fallback() {
          var area = document.createElement('textarea');
          area.value = text;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          try { document.execCommand('copy'); done(); } catch (error) { /* 保持原样 */ }
          document.body.removeChild(area);
        }
      });
    });
  }

  /* ============================ 启动 ============================ */
  function boot() {
    try {
      initReveal();
      initNav();
      initSpotlight();
      initDemo();
      initTabs('[data-loop]', 'data-loop', 'data-loop-panel');
      initTabs('[data-ending-tab]', 'data-ending-tab', 'data-ending-panel');
      initLightbox();
      initCopy();
    } catch (error) {
      document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
