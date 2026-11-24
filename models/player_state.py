# -*- coding: utf-8 -*-
"""玩家全局状态：指标、行动点、统计。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import settings


class MetricKey:
    SECURITY = "security"
    FUNDS = "funds"
    REPUTATION = "reputation"
    AVAILABILITY = "availability"
    INTEGRITY = "integrity"
    ENERGY = "energy"
    MOOD = "mood"
    FAMILY = "family"


METRIC_LABELS = {
    MetricKey.SECURITY: "系统安全度",
    MetricKey.FUNDS: "公司资金",
    MetricKey.REPUTATION: "公司声誉",
    MetricKey.AVAILABILITY: "服务可用性",
    MetricKey.INTEGRITY: "数据完整度",
}

LIFE_LABELS = dict(settings.LIFE_LABELS)
# 公司指标 + 生活数值的合并标签表，供结算时间线/隐藏影响文案使用
ALL_LABELS = dict(METRIC_LABELS)
ALL_LABELS.update(LIFE_LABELS)
ALL_LABELS["action_points"] = "行动点"


@dataclass(frozen=True)
class MetricChange:
    """一次指标变化的记录，用于界面显示“为什么变了”。"""

    turn: int
    key: str
    delta: int
    reason: str


def new_stats() -> dict[str, Any]:
    return {
        "actions_used": 0,
        "investigations": 0,
        "false_positives_seen": 0,
        "false_positives_checked": 0,
        "false_isolations": 0,
        "response_turns": [],
        "contained_early": 0,
    }


def _clamp_life(value: object, default: int = 0) -> int:
    """把生活数值夹到 0–100 的整数，脏数据用初始值兜底。"""
    try:
        number = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        number = int(default)
    return max(settings.LIFE_MIN, min(settings.LIFE_MAX, number))


class PlayerState:
    """公司值班员的全局资源与指标。"""

    def __init__(
        self,
        *,
        security: int = settings.INITIAL_SECURITY,
        funds: int = settings.INITIAL_FUNDS,
        reputation: int = settings.INITIAL_REPUTATION,
        availability: int = settings.INITIAL_AVAILABILITY,
        integrity: int = settings.INITIAL_INTEGRITY,
        action_points: int = settings.ACTION_POINTS_PER_TURN,
        energy: int = settings.INITIAL_ENERGY,
        mood: int = settings.INITIAL_MOOD,
        family: int = settings.INITIAL_FAMILY,
    ) -> None:
        self.security = security
        self.funds = funds
        self.reputation = reputation
        self.availability = availability
        self.integrity = integrity
        self.action_points = action_points
        # 生活线：体力 / 心情 / 家庭
        self.energy = _clamp_life(energy)
        self.mood = _clamp_life(mood)
        self.family = _clamp_life(family)
        self.max_action_points = settings.ACTION_POINTS_PER_TURN
        self.turn = 0
        self.total_turns = settings.TOTAL_TURNS
        self.changes: list[MetricChange] = []
        self.stats = new_stats()
        self.upgrades: set[str] = set()

    # ------------------------------------------------------------------
    # 指标读写
    # ------------------------------------------------------------------
    def _bounds(self, key: str) -> tuple[int, int]:
        if key == MetricKey.FUNDS:
            return 0, 999999
        if key in settings.LIFE_KEYS:
            return settings.LIFE_MIN, settings.LIFE_MAX
        return 0, 100

    def value(self, key: str) -> int:
        return int(getattr(self, key))

    def adjust(self, key: str, delta: int, reason: str) -> int:
        """修改指标并记录原因，返回实际变化量（可能被上下限截断）。"""
        delta = int(delta)
        if delta == 0:
            return 0
        low, high = self._bounds(key)
        old = int(getattr(self, key))
        new = max(low, min(high, old + delta))
        actual = new - old
        if actual == 0:
            return 0
        setattr(self, key, new)
        self.changes.append(MetricChange(self.turn, key, actual, reason))
        return actual

    def turn_delta(self, key: str) -> int:
        """本回合该指标的净变化，用于状态栏箭头提示。"""
        return sum(change.delta for change in self.changes if change.turn == self.turn and change.key == key)


    def recent_changes(self, limit: int = 6) -> list[MetricChange]:
        return self.changes[-limit:]

    # ------------------------------------------------------------------
    # 生活线：体力 / 心情 / 家庭
    # ------------------------------------------------------------------
    def adjust_life(self, key: str, delta: int, reason: str) -> int:
        """修改生活数值并记录原因，返回实际变化量（可能被 0–100 截断）。"""
        if key not in settings.LIFE_KEYS:
            return 0
        return self.adjust(key, delta, reason)

    def decay_life(self) -> dict[str, int]:
        """夜班消耗：体力 -3 / 心情 -2 / 家庭 -3，返回每项实际变化量。"""
        actual: dict[str, int] = {}
        for key in settings.LIFE_KEYS:
            actual[key] = self.adjust(key, int(settings.LIFE_DECAY[key]), "夜班消耗")
        return actual

    @property
    def life_score(self) -> int:
        return settings.life_score(self.energy, self.mood, self.family)

    def life_ap_penalty(self) -> int:
        """体力档位带来的行动点惩罚：>=55 无惩罚，30–54 减 1，<30 减 2。"""
        if self.energy < settings.LIFE_AP_LOW_ENERGY:
            return settings.LIFE_AP_PENALTY_HEAVY
        if self.energy < settings.LIFE_AP_FULL_ENERGY:
            return settings.LIFE_AP_PENALTY_LIGHT
        return 0

    def ap_for_turn(self, bonus: int = 0) -> int:
        """本回合行动点 = max(下限 3, 基数 + 加成 - 体力惩罚)。"""
        base = int(self.max_action_points) + int(bonus)
        return max(settings.LIFE_AP_FLOOR, base - self.life_ap_penalty())

    # ------------------------------------------------------------------
    # 资源
    # ------------------------------------------------------------------
    def can_pay(self, ap: int, money: int) -> bool:
        return self.action_points >= ap and self.funds >= money

    def spend(self, ap: int, money: int, reason: str) -> bool:
        if not self.can_pay(ap, money):
            return False
        self.action_points -= ap
        if money:
            self.adjust(MetricKey.FUNDS, -money, reason)
        return True

    def refresh_turn(self, turn: int, ap_bonus: int = 0) -> None:
        self.turn = turn
        self.action_points = self.ap_for_turn(ap_bonus)

    # ------------------------------------------------------------------
    # 判定
    # ------------------------------------------------------------------
    def security_failed(self) -> bool:
        return self.security <= settings.SECURITY_FAIL

    def integrity_failed(self) -> bool:
        return self.integrity <= settings.INTEGRITY_FAIL

    def availability_warning(self) -> bool:
        return self.availability <= settings.AVAILABILITY_FAIL

    def has_upgrade(self, upgrade_id: str) -> bool:
        return upgrade_id in self.upgrades

    # ------------------------------------------------------------------
    # 存档序列化
    # ------------------------------------------------------------------
    def to_dict(self) -> dict[str, Any]:
        return {
            "security": self.security,
            "funds": self.funds,
            "reputation": self.reputation,
            "availability": self.availability,
            "integrity": self.integrity,
            "action_points": self.action_points,
            "energy": self.energy,
            "mood": self.mood,
            "family": self.family,
            "max_action_points": self.max_action_points,
            "turn": self.turn,
            "total_turns": self.total_turns,
            "changes": [
                {"turn": change.turn, "key": change.key, "delta": change.delta, "reason": change.reason}
                for change in self.changes
            ],
            "stats": self.stats,
            "upgrades": sorted(self.upgrades),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PlayerState":
        state = cls(
            security=int(data.get("security", settings.INITIAL_SECURITY)),
            funds=int(data.get("funds", settings.INITIAL_FUNDS)),
            reputation=int(data.get("reputation", settings.INITIAL_REPUTATION)),
            availability=int(data.get("availability", settings.INITIAL_AVAILABILITY)),
            integrity=int(data.get("integrity", settings.INITIAL_INTEGRITY)),
            action_points=int(data.get("action_points", settings.ACTION_POINTS_PER_TURN)),
            # 旧存档没有这三个字段：按初始值补齐，存档版本号仍然保持 1
            energy=_clamp_life(data.get("energy", settings.INITIAL_ENERGY), settings.INITIAL_ENERGY),
            mood=_clamp_life(data.get("mood", settings.INITIAL_MOOD), settings.INITIAL_MOOD),
            family=_clamp_life(data.get("family", settings.INITIAL_FAMILY), settings.INITIAL_FAMILY),
        )
        state.max_action_points = int(data.get("max_action_points", settings.ACTION_POINTS_PER_TURN))
        state.turn = int(data.get("turn", 0))
        state.total_turns = int(data.get("total_turns", settings.TOTAL_TURNS))
        changes = data.get("changes", [])
        if isinstance(changes, list):
            for item in changes[-200:]:
                if not isinstance(item, dict):
                    continue
                state.changes.append(
                    MetricChange(
                        turn=int(item.get("turn", 0)),
                        key=str(item.get("key", "")),
                        delta=int(item.get("delta", 0)),
                        reason=str(item.get("reason", "")),
                    )
                )
        stats = data.get("stats", {})
        if isinstance(stats, dict):
            defaults = new_stats()
            defaults.update(stats)
            state.stats = defaults
        upgrades = data.get("upgrades", [])
        if isinstance(upgrades, list):
            state.upgrades = {str(item) for item in upgrades}
        return state

    def snapshot(self) -> dict[str, int]:
        return {
            MetricKey.SECURITY: self.security,
            MetricKey.FUNDS: self.funds,
            MetricKey.REPUTATION: self.reputation,
            MetricKey.AVAILABILITY: self.availability,
            MetricKey.INTEGRITY: self.integrity,
            "energy": self.energy,
            "mood": self.mood,
            "family": self.family,
            "action_points": self.action_points,
            "turn": self.turn,
        }
