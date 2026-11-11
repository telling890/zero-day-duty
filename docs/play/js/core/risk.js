/* 风险评估：内部真实风险 + 玩家可见的估计区间。 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  const MARGIN_MAX = 28;
  const MARGIN_MIN = 4;
  const CONFIDENCE_BASE = 0.08;
  const CONFIDENCE_PER_CLUE = 0.16;
  const CONFIDENCE_PER_INVESTIGATION = 0.18;
  const CONFIDENCE_MAX = 0.95;

  class RiskEngine {
    trueRisk(event, device, currentTurn) {
      const duration = Math.max(0, currentTurn - event.startTurn);
      const spreading = Boolean(event.stage.spreading) && !event.contained;
      let risk = 0;
      risk += event.severity * 6;
      if (device) {
        risk += device.importance * 3.5;
        risk += device.exposure * 2.5;
      }
      risk += duration * 3;
      if (spreading) risk += 10;
      if (event.stageIndex >= 2) risk += 8;
      if (event.contained) risk -= 22;
      else if (device && device.isolated) risk -= 16;
      if (device && device.backups) risk -= 5;
      if (event.credentialsReset) risk -= 6;
      if (event.sourceBlocked) risk -= 6;
      return Math.max(0, Math.min(100, Math.round(risk)));
    }

    confidence(event) {
      const value = CONFIDENCE_BASE
        + event.investigations * CONFIDENCE_PER_INVESTIGATION
        + event.revealedClues * CONFIDENCE_PER_CLUE;
      return Math.max(0, Math.min(CONFIDENCE_MAX, value));
    }

    margin(confidence) {
      return Math.round(MARGIN_MIN + (MARGIN_MAX - MARGIN_MIN) * (1 - confidence));
    }

    estimate(event, device, currentTurn, confidenceBonus) {
      const trueValue = this.trueRisk(event, device, currentTurn);
      const confidence = Math.min(CONFIDENCE_MAX, this.confidence(event) + (confidenceBonus || 0));
      const margin = this.margin(confidence);
      const low = Math.max(0, trueValue - margin);
      let high = Math.min(100, trueValue + margin);
      if (high - low < 6) high = Math.min(100, low + 6);
      return [low, high, Math.round(confidence * 100)];
    }

    threatText(low, high) {
      const middle = (low + high) / 2;
      if (middle >= 70) return '严重';
      if (middle >= 50) return '较高';
      if (middle >= 30) return '中等';
      return '偏低';
    }
  }

  ZDD.RiskEngine = RiskEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
