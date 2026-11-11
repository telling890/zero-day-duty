/* 界面特效层：闪光、横幅、浮动文字、粒子、连击、操作反馈。
 * 只影响观感，不参与游戏判定。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  function colorValue(name) {
    const map = ZDD.colors || {};
    return map[name] || map.green || '#40d082';
  }

  class Effects {
    constructor(els) {
      this.flashEl = els.flash;
      this.bannersEl = els.banners;
      this.floatersEl = els.floaters;
      this.burstsEl = els.bursts;
      this.comboEl = els.combo;
      this.feedbackEl = els.feedback;
      this.focusElement = null;
      this.timers = new Set();
      this.reduced = global.matchMedia
        ? global.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    }

    later(fn, ms) {
      const id = global.setTimeout(() => {
        this.timers.delete(id);
        fn();
      }, ms);
      this.timers.add(id);
      return id;
    }

    setFocusElement(el) {
      this.focusElement = el || null;
    }

    defaultPoint() {
      const el = this.focusElement;
      if (el && el.getBoundingClientRect && el.isConnected) {
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      return { x: global.innerWidth / 2, y: global.innerHeight * 0.34 };
    }

    flash(color, strength) {
      if (!this.flashEl) return;
      this.flashEl.style.background = colorValue(color);
      this.flashEl.style.transition = 'none';
      this.flashEl.style.opacity = String(Math.min(0.55, ((strength || 40) / 255) * 2.2));
      // 强制回流后再淡出
      void this.flashEl.offsetWidth;
      this.flashEl.style.transition = 'opacity 700ms ease';
      this.flashEl.style.opacity = '0';
    }

    addBanner(title, detail, color) {
      if (!this.bannersEl) return;
      // 只保留最新一条，避免连续告警把屏幕盖满
      this.bannersEl.textContent = '';
      const el = document.createElement('div');
      el.className = 'banner';
      el.style.setProperty('--banner-color', colorValue(color));
      el.innerHTML = '<span class="banner-title"></span><small class="banner-detail"></small>';
      el.querySelector('.banner-title').textContent = title;
      el.querySelector('.banner-detail').textContent = detail;
      this.bannersEl.appendChild(el);
      this.later(() => el.classList.add('out'), 2100);
      this.later(() => el.remove(), 2600);
    }

    addFloater(text, color, position) {
      if (!this.floatersEl) return;
      const point = position || this.defaultPoint();
      const el = document.createElement('div');
      el.className = 'floater';
      el.textContent = text;
      el.style.setProperty('--float-color', colorValue(color));
      el.style.left = `${point.x}px`;
      el.style.top = `${point.y}px`;
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
      this.floatersEl.appendChild(el);
      this.later(() => el.remove(), 1400);
    }

    addCombo(text) {
      if (!this.comboEl) return;
      this.comboEl.textContent = text;
      this.comboEl.classList.remove('show');
      void this.comboEl.offsetWidth;
      this.comboEl.classList.add('show');
      this.later(() => this.comboEl.classList.remove('show'), 1300);
    }

    addBurst(position, color, count) {
      if (!this.burstsEl) return;
      const point = position && position !== 'center' ? position : this.defaultPoint();
      const total = count || 12;
      const hue = colorValue(color);
      for (let i = 0; i < total; i += 1) {
        const spark = document.createElement('span');
        spark.className = 'spark';
        const angle = (Math.PI * 2 * i) / total + Math.random() * 0.5;
        const distance = 30 + Math.random() * 70;
        spark.style.left = `${point.x}px`;
        spark.style.top = `${point.y}px`;
        spark.style.setProperty('--spark-color', hue);
        spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
        spark.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
        this.burstsEl.appendChild(spark);
        this.later(() => spark.remove(), 760);
      }
    }

    showFeedback(feedback) {
      if (!this.feedbackEl) return;
      const el = this.feedbackEl;
      el.innerHTML = `
        <p class="fb-title"></p>
        <p class="fb-detail"></p>
        <i class="fb-line"></i>
      `;
      el.querySelector('.fb-title').textContent = feedback.title;
      el.querySelector('.fb-detail').textContent = feedback.detail || '';
      el.style.setProperty('--fb-color', colorValue(feedback.color));
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
      if (feedback.correct) {
        this.addBurst('center', feedback.color, 18);
      }
      if (this.feedbackTimer) global.clearTimeout(this.feedbackTimer);
      this.feedbackTimer = global.setTimeout(() => {
        el.classList.remove('show');
        this.feedbackTimer = null;
      }, 2800);
    }
  }

  ZDD.Effects = Effects;
})(typeof globalThis !== 'undefined' ? globalThis : this);
