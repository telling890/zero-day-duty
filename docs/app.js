/* 零日值班 · 主页交互
   1. 滚动进场动画（IntersectionObserver，尊重 reduced-motion）
   2. 导航滚动高亮
   3. 卡片跟随指针的柔光
*/
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------- 进场动画 ---------------------------- */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!items.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
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

    // 首屏元素立刻显现，避免加载瞬间的空白
    requestAnimationFrame(function () {
      var vh = window.innerHeight;
      items.forEach(function (el) {
        if (el.getBoundingClientRect().top < vh * 0.9) el.classList.add('in');
      });
    });
  }

  /* ---------------------------- 导航状态 ---------------------------- */
  function initNav() {
    var nav = document.querySelector('.nav');
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav-links a'));
    var sections = links
      .map(function (link) { return document.querySelector(link.getAttribute('href')); })
      .filter(Boolean);

    var ticking = false;

    function update() {
      ticking = false;

      if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);

      var current = null;
      sections.forEach(function (section) {
        if (section.getBoundingClientRect().top <= 160) current = section.id;
      });

      links.forEach(function (link) {
        link.classList.toggle('active', link.getAttribute('href') === '#' + current);
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    update();
  }

  /* ---------------------------- 卡片柔光 ---------------------------- */
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

  function boot() {
    try {
      initReveal();
      initNav();
      initSpotlight();
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
