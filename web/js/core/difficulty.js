/* 难度配置：与桌面版共用 data/difficulty.json。
 * 难度只改变信息质量、提示和容错，不直接增加攻击伤害。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  const MODE_IDS = ['novice', 'standard', 'expert'];

  class DifficultySet {
    constructor(payload) {
      const raw = payload && typeof payload === 'object' ? payload : {};
      const modes = Array.isArray(raw.modes) ? raw.modes : [];
      if (!modes.length) throw new Error('difficulty.json 缺少 modes');
      this.modes = modes.map((item) => {
        if (!item || typeof item !== 'object') throw new Error('难度配置必须是对象');
        const id = String(item.id || '').trim();
        if (!MODE_IDS.includes(id)) throw new Error(`未知难度 id：${id}`);
        const recommendations = String(item.recommendations || 'none');
        const nextHop = String(item.next_hop || 'none');
        if (!['full', 'direction', 'none'].includes(recommendations)) {
          throw new Error(`难度 ${id} 的 recommendations 无效`);
        }
        if (!['exact', 'direction', 'none'].includes(nextHop)) {
          throw new Error(`难度 ${id} 的 next_hop 无效`);
        }
        const number = (key, fallback, minimum = 0) => {
          const value = Number(item[key] ?? fallback);
          return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
        };
        return {
          id,
          name: String(item.name || id),
          tagline: String(item.tagline || ''),
          description: String(item.description || ''),
          recommendations,
          nextHop,
          riskScale: number('risk_scale', 1, 0.1),
          clueNoise: Math.max(0, Math.trunc(number('clue_noise', 0))),
          falsePositiveRate: Math.min(1, number('false_positive_rate', 0.5)),
          logDelay: Math.max(0, Math.trunc(number('log_delay', 0))),
          hints: Math.max(0, Math.trunc(number('hints', 0))),
          falseIsolationPenalty: Math.max(1, number('false_isolation_penalty', 1)),
          decisionDetail: String(item.decision_detail || 'partial'),
        };
      });
      this.byId = new Map(this.modes.map((mode) => [mode.id, mode]));
      const fallback = String(raw.default || this.modes[0].id);
      this.defaultId = this.byId.has(fallback) ? fallback : this.modes[0].id;
    }

    get(modeId) {
      return this.byId.get(String(modeId || '')) || this.byId.get(this.defaultId);
    }

    names() {
      return this.modes.map((mode) => [mode.id, mode.name]);
    }
  }

  DifficultySet.MODE_IDS = MODE_IDS;
  ZDD.DifficultySet = DifficultySet;
})(typeof globalThis !== 'undefined' ? globalThis : this);
