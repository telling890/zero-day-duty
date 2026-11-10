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


METRIC_LABELS = {
    MetricKey.SECURITY: "系统安全度",
    MetricKey.FUNDS: "公司资金",
    MetricKey.REPUTATION: "公司声誉",
    MetricKey.AVAILABILITY: "服务可用性",
    MetricKey.INTEGRITY: "数据完整度",
}


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
    ) -> None:
        self.security = security
        self.funds = funds
        self.reputation = reputation
        self.availability = availability
        self.integrity = integrity
        self.action_points = action_points
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

    def refresh_turn(self, turn: int) -> None:
        self.turn = turn
        self.action_points = self.max_action_points

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
            "action_points": self.action_points,
            "turn": self.turn,
        }
