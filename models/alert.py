# -*- coding: utf-8 -*-
"""告警模型。"""

from __future__ import annotations

from settings import ALERT_LEVEL_COLORS

LEVEL_ORDER = {"极危": 4, "高危": 3, "中危": 2, "低危": 1, "信息": 0}


class Alert:
    """界面右侧告警列表中的一条记录。

    告警只是“线索入口”：真实威胁和误报都使用相同的结构，
    玩家必须通过调查才能确认，不能只看颜色下结论。
    """

    def __init__(
        self,
        alert_id: str,
        title: str,
        level: str,
        target_id: str,
        *,
        turn: int = 1,
        clock: str = "",
        event_id: str | None = None,
        source_ip: str = "",
        account: str = "",
        detail: str = "",
        false_positive: bool = False,
        conclusion: str = "",
    ) -> None:
        self.alert_id = alert_id
        self.title = title
        self.level = level if level in LEVEL_ORDER else "信息"
        self.target_id = target_id
        self.turn = turn
        self.clock = clock
        self.event_id = event_id
        self.source_ip = source_ip
        self.account = account
        self.detail = detail
        self.false_positive = false_positive
        self.conclusion = conclusion

        self.investigated = False
        self.verdict = ""          # "真实威胁" / "误报"
        self.resolved = False
        self.resolve_note = ""

    @property
    def level_priority(self) -> int:
        return LEVEL_ORDER.get(self.level, 0)

    @property
    def display_level(self) -> str:
        """调查前不暴露真实等级，避免玩家只按颜色判断。"""
        if not self.investigated:
            return "待评估"
        if self.false_positive:
            return "误报"
        return self.level

    @property
    def display_priority(self) -> int:
        return self.level_priority if self.investigated else 1

    @property
    def level_color(self) -> tuple[int, int, int]:
        from settings import TEXT_DIM, TEXT_FAINT

        if not self.investigated:
            return TEXT_DIM
        if self.false_positive:
            return TEXT_FAINT
        return ALERT_LEVEL_COLORS.get(self.level, TEXT_DIM)

    @property
    def status_text(self) -> str:
        if self.resolved:
            return "已处置"
        if self.investigated:
            return f"已调查·{self.verdict}" if self.verdict else "已调查"
        return "未调查"

    @property
    def status_color(self) -> tuple[int, int, int]:
        from settings import GREEN, TEXT_DIM, YELLOW

        if self.resolved:
            return GREEN
        if self.investigated:
            return YELLOW if self.verdict == "真实威胁" else TEXT_DIM
        return TEXT_DIM

    def mark_investigated(self, verdict: str) -> None:
        self.investigated = True
        self.verdict = verdict

    def resolve(self, note: str = "") -> None:
        self.resolved = True
        self.resolve_note = note
        if not self.investigated:
            self.investigated = True
            self.verdict = "真实威胁"

    def sort_key(self) -> tuple[int, int, int]:
        """未处置优先、调查后按等级、新告警优先；未调查时不暴露等级顺序。"""
        return (1 if self.resolved else 0, -self.display_priority, -self.turn)

    # ------------------------------------------------------------------
    # 存档序列化
    # ------------------------------------------------------------------
    def to_dict(self) -> dict[str, object]:
        return {
            "alert_id": self.alert_id,
            "title": self.title,
            "level": self.level,
            "target_id": self.target_id,
            "turn": self.turn,
            "clock": self.clock,
            "event_id": self.event_id,
            "source_ip": self.source_ip,
            "account": self.account,
            "detail": self.detail,
            "false_positive": self.false_positive,
            "conclusion": self.conclusion,
            "investigated": self.investigated,
            "verdict": self.verdict,
            "resolved": self.resolved,
            "resolve_note": self.resolve_note,
        }

    @classmethod
    def from_dict(cls, data: dict[str, object]) -> "Alert":
        alert = cls(
            alert_id=str(data.get("alert_id", "A-000")),
            title=str(data.get("title", "未知告警")),
            level=str(data.get("level", "信息")),
            target_id=str(data.get("target_id", "")),
            turn=int(data.get("turn", 1)),
            clock=str(data.get("clock", "")),
            event_id=(str(data["event_id"]) if data.get("event_id") else None),
            source_ip=str(data.get("source_ip", "")),
            account=str(data.get("account", "")),
            detail=str(data.get("detail", "")),
            false_positive=bool(data.get("false_positive", False)),
            conclusion=str(data.get("conclusion", "")),
        )
        alert.investigated = bool(data.get("investigated", False))
        alert.verdict = str(data.get("verdict", ""))
        alert.resolved = bool(data.get("resolved", False))
        alert.resolve_note = str(data.get("resolve_note", ""))
        return alert
