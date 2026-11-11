/* 可复现随机数：状态只有 32 位，便于存档。
 * 不追求与 Python random 序列一致，只保证同一 seed 在同一浏览器版本里复现。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  class RNG {
    constructor(seed) {
      this.state = (Number(seed) >>> 0) || 0x9e3779b9;
      // 先空转几次，避免小种子前几个数太规律
      for (let i = 0; i < 4; i += 1) this.next();
    }

    /** mulberry32，返回 [0, 1) */
    next() {
      this.state = (this.state + 0x6d2b79f5) >>> 0;
      let t = this.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    random() {
      return this.next();
    }

    /** 闭区间整数 [low, high] */
    randint(low, high) {
      const lo = Math.ceil(Math.min(low, high));
      const hi = Math.floor(Math.max(low, high));
      return lo + Math.floor(this.next() * (hi - lo + 1));
    }

    choice(items) {
      if (!items || !items.length) return undefined;
      return items[Math.floor(this.next() * items.length)];
    }

    uniform(low, high) {
      return low + (high - low) * this.next();
    }

    /** Fisher–Yates，原地打乱并返回同一数组 */
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.next() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    }

    getState() {
      return this.state >>> 0;
    }

    setState(state) {
      this.state = Number(state) >>> 0;
    }
  }

  ZDD.RNG = RNG;
  ZDD.randomSeed = function randomSeed() {
    return 1000 + Math.floor(Math.random() * 9000);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
