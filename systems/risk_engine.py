# -*- coding: utf-8 -*-
"""风险评估引擎：内部真实风险 + 玩家可见的估计范围。"""

from __future__ import annotations

import settings
from models.device import Device
from models.security_event import SecurityEvent


class RiskEngine:
    """把多个因素折算成 0~100 的风险值。

    真实风险对玩家隐藏；玩家只看到由“证据置信度”决定的区间，
    调查越多，区间越窄。
    """

    def __init__(self) -> None:
        self.margin_max = settings.RISK_MARGIN_MAX
        self.margin_min = settings.RISK_MARGIN_MIN

    # ------------------------------------------------------------------
    def true_risk(self, event: SecurityEvent, device: Device | None, current_turn: int) -> int:
        """内部真实风险，不直接显示给玩家。"""
        duration = max(0, current_turn - event.start_turn)
        spreading = bool(event.stage.get("spreading", False)) and not event.contained
        risk = 0.0
        risk += event.severity * 6.0                      # 事件严重程度
        if device is not None:
            risk += device.importance * 3.5                # 目标设备重要性
            risk += device.exposure * 2.5                  # 暴露程度
        risk += duration * 3.0                             # 持续时间
        risk += 10.0 if spreading else 0.0                 # 是否正在传播
        risk += 8.0 if event.stage_index >= 2 else 0.0     # 越到后期越危险
        if event.contained:
            risk -= 22.0                                   # 已隔离/已处置
        elif device is not None and device.isolated:
            risk -= 16.0                                   # 目标设备已隔离
        if device is not None and device.backups:
            risk -= 5.0                                    # 有可用备份
        if event.credentials_reset:
            risk -= 6.0
        if event.source_blocked:
            risk -= 6.0
        return int(max(0, min(100, round(risk))))

    # ------------------------------------------------------------------
    def confidence(self, event: SecurityEvent) -> float:
        """证据可信度 0~1：调查次数 + 已揭示线索。"""
        value = (
            settings.CONFIDENCE_BASE
            + event.investigations * settings.CONFIDENCE_PER_INVESTIGATION
            + event.revealed_clues * settings.CONFIDENCE_PER_CLUE
        )
        return max(0.0, min(settings.CONFIDENCE_MAX, value))

    def margin(self, confidence: float) -> int:
        """置信度越高，估计区间越窄。"""
        span = self.margin_max - self.margin_min
        return int(round(self.margin_min + span * (1.0 - confidence)))

    def estimate(
        self,
        event: SecurityEvent,
        device: Device | None,
        current_turn: int,
        confidence_bonus: float = 0.0,
    ) -> tuple[int, int, int]:
        """返回 (下限, 上限, 置信度百分比)。玩家只能看到这个区间。"""
        true_value = self.true_risk(event, device, current_turn)
        confidence = min(settings.CONFIDENCE_MAX, self.confidence(event) + confidence_bonus)
        margin = self.margin(confidence)
        low = max(0, true_value - margin)
        high = min(100, true_value + margin)
        if high - low < 6:
            high = min(100, low + 6)
        return low, high, int(round(confidence * 100))

    def threat_text(self, low: int, high: int) -> str:
        """把区间翻译成等级描述，避免直接暴露真实值。"""
        middle = (low + high) / 2
        if middle >= 70:
            return "严重"
        if middle >= 50:
            return "较高"
        if middle >= 30:
            return "中等"
        return "偏低"
