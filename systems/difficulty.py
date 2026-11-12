# -*- coding: utf-8 -*-
"""难度配置：三档难度只改变信息质量、提示与容错，不直接增加攻击伤害。

数据来自 data/difficulty.json，桌面版和网页版共用同一份配置。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from settings import DataError

DIFFICULTY_IDS = ("novice", "standard", "expert")


@dataclass(frozen=True)
class DifficultyMode:
    mode_id: str
    name: str
    tagline: str
    description: str
    recommendations: str  # full / direction / none
    next_hop: str  # exact / direction / none
    risk_scale: float
    clue_noise: int
    false_positive_rate: float
    log_delay: int
    hints: int
    false_isolation_penalty: float
    decision_detail: str  # full / partial

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.mode_id,
            "name": self.name,
            "tagline": self.tagline,
            "recommendations": self.recommendations,
            "next_hop": self.next_hop,
            "risk_scale": self.risk_scale,
            "clue_noise": self.clue_noise,
            "false_positive_rate": self.false_positive_rate,
            "log_delay": self.log_delay,
            "hints": self.hints,
            "false_isolation_penalty": self.false_isolation_penalty,
        }


def _text(item: dict[str, Any], key: str, default: str = "") -> str:
    return str(item.get(key, default) or default).strip()


def _number(item: dict[str, Any], key: str, default: float, minimum: float = 0.0) -> float:
    try:
        value = float(item.get(key, default))
    except (TypeError, ValueError) as exc:
        raise DataError(f"难度字段 {key} 必须是数字") from exc
    return max(minimum, value)


class DifficultySet:
    """校验并索引三种难度。旧存档缺少难度时回退到默认值。"""

    def __init__(self, payload: dict[str, Any] | None) -> None:
        raw = payload if isinstance(payload, dict) else {}
        modes = raw.get("modes")
        if not isinstance(modes, list) or not modes:
            raise DataError("difficulty.json 必须包含非空的 modes 列表")
        parsed: list[DifficultyMode] = []
        seen: set[str] = set()
        for item in modes:
            if not isinstance(item, dict):
                raise DataError("difficulty.json 的每个难度必须是对象")
            mode_id = _text(item, "id")
            if not mode_id:
                raise DataError("难度缺少 id")
            if mode_id in seen:
                raise DataError(f"难度 id 重复：{mode_id}")
            seen.add(mode_id)
            recommendations = _text(item, "recommendations", "none")
            next_hop = _text(item, "next_hop", "none")
            if recommendations not in ("full", "direction", "none"):
                raise DataError(f"难度 {mode_id} 的 recommendations 必须是 full/direction/none")
            if next_hop not in ("exact", "direction", "none"):
                raise DataError(f"难度 {mode_id} 的 next_hop 必须是 exact/direction/none")
            decision_detail = _text(item, "decision_detail", "partial")
            if decision_detail not in ("full", "partial"):
                raise DataError(f"难度 {mode_id} 的 decision_detail 必须是 full/partial")
            parsed.append(
                DifficultyMode(
                    mode_id=mode_id,
                    name=_text(item, "name", mode_id),
                    tagline=_text(item, "tagline"),
                    description=_text(item, "description"),
                    recommendations=recommendations,
                    next_hop=next_hop,
                    risk_scale=_number(item, "risk_scale", 1.0, 0.1),
                    clue_noise=max(0, int(_number(item, "clue_noise", 0))),
                    false_positive_rate=min(1.0, _number(item, "false_positive_rate", 0.5)),
                    log_delay=max(0, int(_number(item, "log_delay", 0))),
                    hints=max(0, int(_number(item, "hints", 0))),
                    false_isolation_penalty=max(1.0, _number(item, "false_isolation_penalty", 1.0)),
                    decision_detail=decision_detail,
                )
            )
        default = _text(raw, "default", parsed[0].mode_id)
        if default not in seen:
            default = parsed[0].mode_id
        self.modes = parsed
        self.by_id = {mode.mode_id: mode for mode in parsed}
        self.default_id = default

    def get(self, mode_id: str | None) -> DifficultyMode:
        if mode_id and mode_id in self.by_id:
            return self.by_id[mode_id]
        return self.by_id[self.default_id]

    def names(self) -> list[tuple[str, str]]:
        return [(mode.mode_id, mode.name) for mode in self.modes]
