# -*- coding: utf-8 -*-
"""安全事件模型：按阶段发展的虚构攻击链。"""

from __future__ import annotations

from typing import Any

from settings import DataError


class SecurityEvent:
    """一个按阶段推进的安全事件。

    事件配置全部来自 data/events.json，本类只负责阶段推进与状态记录；
    风险计算交给 systems.risk_engine，界面只读取估计范围。
    """

    def __init__(self, config: dict[str, Any], spawn_turn: int) -> None:
        required = ("id", "name", "type", "initial_target", "severity", "stages")
        missing = [key for key in required if key not in config]
        if missing:
            raise DataError(f"事件配置缺少字段 {missing}（事件 {config.get('id', '未知')}）")
        stages = config["stages"]
        if not isinstance(stages, list) or not stages:
            raise DataError(f"事件 {config['id']} 的 stages 必须是非空列表")
        for stage in stages:
            if not isinstance(stage, dict) or "name" not in stage or "log" not in stage:
                raise DataError(f"事件 {config['id']} 存在缺少 name/log 的阶段配置")

        self.config = config
        self.event_id = str(config["id"])
        self.name = str(config["name"])
        self.event_type = str(config["type"])
        self.target_id = str(config["initial_target"])
        self.severity = int(config["severity"])
        self.severity_label = str(config.get("severity_label", "中危"))
        self.account = str(config.get("account", ""))
        self.source_ip = str(config.get("source_ip", ""))
        self.summary = str(config.get("summary", ""))
        self.failure_ending = str(config.get("failure_ending", "data_leak"))
        # 所属攻击战役（事件链）由 EventManager 依据 campaigns 配置注入
        self.campaign_id = str(config.get("campaign_id", ""))
        failure_costs = config.get("failure_costs", {})
        self.failure_costs: dict[str, int] = {}
        if isinstance(failure_costs, dict):
            for key, value in failure_costs.items():
                try:
                    self.failure_costs[str(key)] = int(value)
                except (TypeError, ValueError):
                    continue
        self.stages: list[dict[str, Any]] = stages

        self.stage_index = 0
        self.start_turn = spawn_turn
        self.last_advance_turn = spawn_turn
        self.contained = False
        self.containment_method = ""
        self.containment_device = ""
        self.contained_turn = 0
        self.eradicated = False
        self.eradication_method = ""
        self.eradicated_turn = 0
        self.failed = False
        self.failed_turn = 0
        self.investigations = 0
        self.revealed_clues = 0
        self.credentials_reset = False
        self.source_blocked = False
        self.response_turn: int | None = None
        self.rewarded = False

    # ------------------------------------------------------------------
    # 阶段信息
    # ------------------------------------------------------------------
    @property
    def stage(self) -> dict[str, Any]:
        return self.stages[self.stage_index]

    @property
    def stage_name(self) -> str:
        return str(self.stage.get("name", f"阶段{self.stage_index + 1}"))

    @property
    def max_stage_index(self) -> int:
        return len(self.stages) - 1

    @property
    def progress_text(self) -> str:
        return f"阶段 {self.stage_index + 1}/{len(self.stages)}"

    @property
    def active_device_id(self) -> str:
        """当前阶段真正被利用/受影响的关键设备。"""
        return str(self.stage.get("active_device", self.target_id))

    @property
    def is_active(self) -> bool:
        return not self.contained and not self.eradicated and not self.failed

    @property
    def is_resolved(self) -> bool:
        """只有清除根因才算真正解决；单纯隔离只是控制。"""
        return self.eradicated

    @property
    def status_text(self) -> str:
        if self.eradicated:
            return "已清除"
        if self.contained:
            return "已控制·待清除"
        if self.failed:
            return "已失守"
        if self.investigations > 0:
            return "调查中"
        return "待调查"

    @property
    def next_device_id(self) -> str:
        """下一阶段预计受影响的设备；已到最终阶段时返回空字符串。"""
        if self.stage_index >= self.max_stage_index:
            return ""
        next_stage = self.stages[self.stage_index + 1]
        return str(next_stage.get("active_device", self.target_id))

    @property
    def next_stage_name(self) -> str:
        if self.stage_index >= self.max_stage_index:
            return ""
        return str(self.stages[self.stage_index + 1].get("name", ""))

    # ------------------------------------------------------------------
    # 推进与线索
    # ------------------------------------------------------------------
    def advance(self) -> bool:
        """进入下一阶段；已经到最终阶段时返回 False。"""
        if self.stage_index >= self.max_stage_index:
            return False
        self.stage_index += 1
        return True

    def reveal_next_clue(self) -> str | None:
        """揭示一条可观察线索，返回线索文本；线索用尽时返回隐藏线索。"""
        clues = [str(item) for item in self.stage.get("clues", [])]
        if self.revealed_clues < len(clues):
            clue = clues[self.revealed_clues]
            self.revealed_clues += 1
            return clue
        hidden = str(self.stage.get("hidden_clue", ""))
        if hidden and not getattr(self, "_hidden_revealed", False):
            self._hidden_revealed = True
            return hidden
        return None

    @property
    def total_clues(self) -> int:
        return len([item for item in self.stage.get("clues", [])])

    def mark_contained(self, method: str, turn: int, device_id: str = "") -> None:
        self.contained = True
        self.containment_method = method
        self.contained_turn = turn
        self.containment_device = device_id
        self.last_advance_turn = turn

    def mark_eradicated(self, method: str, turn: int, device_id: str = "") -> None:
        if not self.contained:
            self.mark_contained(method, turn, device_id)
        self.eradicated = True
        self.eradication_method = method
        self.eradicated_turn = turn
        self.containment_method = self.containment_method or method
        self.containment_device = self.containment_device or device_id

    def resume(self) -> None:
        """解除隔离后，被隔离“压住”的事件重新活跃；已清除事件不会复活。"""
        if self.eradicated:
            return
        self.contained = False
        self.containment_method = ""
        self.containment_device = ""
        self.contained_turn = 0

    def mark_failed(self, turn: int) -> None:
        self.failed = True
        self.failed_turn = turn

    # ------------------------------------------------------------------
    # 数值读取（配置缺省时返回 0）
    # ------------------------------------------------------------------
    def stage_cost(self, key: str) -> int:
        try:
            return int(self.stage.get(key, 0) or 0)
        except (TypeError, ValueError):
            return 0

    def stage_text(self, key: str, default: str = "") -> str:
        value = self.stage.get(key, default)
        return str(value) if value is not None else default

    # ------------------------------------------------------------------
    # 存档序列化
    # ------------------------------------------------------------------
    def to_state(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "campaign_id": self.campaign_id,
            "stage_index": self.stage_index,
            "start_turn": self.start_turn,
            "last_advance_turn": self.last_advance_turn,
            "contained": self.contained,
            "containment_method": self.containment_method,
            "containment_device": self.containment_device,
            "contained_turn": self.contained_turn,
            "eradicated": self.eradicated,
            "eradication_method": self.eradication_method,
            "eradicated_turn": self.eradicated_turn,
            "failed": self.failed,
            "failed_turn": self.failed_turn,
            "investigations": self.investigations,
            "revealed_clues": self.revealed_clues,
            "hidden_revealed": bool(getattr(self, "_hidden_revealed", False)),
            "credentials_reset": self.credentials_reset,
            "source_blocked": self.source_blocked,
            "response_turn": self.response_turn,
            "rewarded": self.rewarded,
        }

    def apply_state(self, state: dict[str, Any]) -> None:
        self.campaign_id = str(state.get("campaign_id", self.campaign_id))
        self.stage_index = max(0, min(self.max_stage_index, int(state.get("stage_index", 0))))
        self.start_turn = int(state.get("start_turn", self.start_turn))
        self.last_advance_turn = int(state.get("last_advance_turn", self.last_advance_turn))
        self.contained = bool(state.get("contained", False))
        self.containment_method = str(state.get("containment_method", ""))
        self.containment_device = str(state.get("containment_device", ""))
        self.contained_turn = int(state.get("contained_turn", 0))
        self.eradicated = bool(state.get("eradicated", False))
        self.eradication_method = str(state.get("eradication_method", ""))
        self.eradicated_turn = int(state.get("eradicated_turn", 0))
        self.failed = bool(state.get("failed", False))
        self.failed_turn = int(state.get("failed_turn", 0))
        self.investigations = max(0, int(state.get("investigations", 0)))
        self.revealed_clues = max(0, int(state.get("revealed_clues", 0)))
        self._hidden_revealed = bool(state.get("hidden_revealed", False))
        self.credentials_reset = bool(state.get("credentials_reset", False))
        self.source_blocked = bool(state.get("source_blocked", False))
        response = state.get("response_turn")
        self.response_turn = int(response) if isinstance(response, (int, float)) else None
        self.rewarded = bool(state.get("rewarded", False))

    def __repr__(self) -> str:  # 便于调试
        state = "已清除" if self.eradicated else ("已控制" if self.contained else ("已失败" if self.failed else "进行中"))
        return f"<SecurityEvent {self.event_id} {self.name} {self.progress_text} {state}>"
