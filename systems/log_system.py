# -*- coding: utf-8 -*-
"""日志系统：收集、过滤与关键词搜索。"""

from __future__ import annotations

from dataclasses import dataclass

LOG_CATEGORIES = ("邮件", "登录", "网络", "告警", "操作", "情报", "系统")


@dataclass(frozen=True)
class LogEntry:
    turn: int
    clock: str
    category: str
    message: str
    source: str = ""
    account: str = ""
    ip: str = ""

    def haystack(self) -> str:
        return " ".join(
            part for part in (self.message, self.source, self.account, self.ip, self.category) if part
        ).casefold()

    def line_text(self) -> str:
        return f"[{self.clock}] [{self.category}] {self.message}"


class LogSystem:
    """保序保存日志，并提供不区分大小写的搜索。"""

    def __init__(self, max_entries: int = 800) -> None:
        self.entries: list[LogEntry] = []
        self.max_entries = max_entries

    def add(
        self,
        turn: int,
        clock: str,
        category: str,
        message: str,
        *,
        source: str = "",
        account: str = "",
        ip: str = "",
    ) -> LogEntry:
        if category not in LOG_CATEGORIES:
            category = "系统"
        entry = LogEntry(
            turn=turn,
            clock=clock,
            category=category,
            message=message,
            source=source,
            account=account,
            ip=ip,
        )
        self.entries.append(entry)
        if len(self.entries) > self.max_entries:
            del self.entries[: len(self.entries) - self.max_entries]
        return entry

    def search(self, keyword: str = "", category: str = "全部") -> list[LogEntry]:
        """按设备/账号/事件类型/关键词过滤，返回时间正序结果。"""
        keyword = (keyword or "").strip().casefold()
        results: list[LogEntry] = []
        for entry in self.entries:
            if category and category != "全部" and entry.category != category:
                continue
            if keyword and keyword not in entry.haystack():
                continue
            results.append(entry)
        return results

    def recent(self, count: int = 8) -> list[LogEntry]:
        return self.entries[-count:]

    def clear(self) -> None:
        self.entries.clear()
