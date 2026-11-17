# -*- coding: utf-8 -*-
"""顶部状态栏：回合、时间与所有全局指标。"""

from __future__ import annotations

import math

import pygame

import settings
from models.player_state import MetricKey
from ui import draw_utils


class Dashboard:
    """绘制顶部状态栏。指标变化用箭头与颜色标注，原因写在消息区和日志里。"""

    def __init__(self) -> None:
        self.rect = pygame.Rect(settings.LAYOUT["top_bar"])
        self.brand_width = 160
        # C3：指标掉血要“疼”一下——从旧值滚到新值，同时闪一下颜色
        self.values: dict[str, float] = {}
        self.tweens: dict[str, tuple[float, float, int]] = {}
        self.flashes: dict[str, tuple[int, bool]] = {}

    TWEEN_MS = 520
    FLASH_MS = 520

    def draw(self, surface: pygame.Surface, game: "object") -> None:
        player = game.player
        rect = self.rect
        pygame.draw.rect(surface, settings.PANEL_BG, rect)

        # 品牌区
        title_font = draw_utils.get_font(settings.FONT_H2, True)
        title = title_font.render("零日值班", True, settings.ACCENT)
        surface.blit(title, (rect.x + 14, rect.y + 9))
        tiny = draw_utils.get_font(settings.FONT_TINY)
        subtitle = tiny.render("NET DEFENSE SIM", True, settings.TEXT_FAINT)
        surface.blit(subtitle, (rect.x + 14, rect.y + 32))

        start_x = rect.x + self.brand_width
        pygame.draw.line(surface, settings.PANEL_BORDER, (start_x - 10, rect.y + 10), (start_x - 10, rect.bottom - 10))

        cells = self._cells(game)
        usable = rect.right - start_x - 12
        cell_width = usable / len(cells)
        for index, cell in enumerate(cells):
            x = int(start_x + index * cell_width)
            self._draw_cell(surface, x, int(cell_width), cell)

        pygame.draw.line(
            surface,
            settings.ACCENT_DARK,
            (rect.x, rect.bottom - 1),
            (rect.right, rect.bottom - 1),
        )

    # ------------------------------------------------------------------
    def _cells(self, game: "object") -> list[dict[str, object]]:
        player = game.player
        trend = self.security_trend(game)
        stats = [
            {
                "label": "回合 / 时间",
                "value": f"{game.turn} / {player.total_turns}",
                "sub": f"· {settings.clock_text(game.turn)}",
                "color": settings.ACCENT,
                "ratio": game.turn / max(1, player.total_turns),
            },
            {
                "label": "威胁等级",
                "value": f"{game.threat_level} / 5",
                "ratio": game.threat_level / 5,
                "color": settings.RED if game.threat_level >= 4 else settings.ORANGE,
            },
            {
                "label": "系统安全度",
                "value": f"{player.security}%",
                "num": player.security,
                "fmt": lambda value: f"{value}%",
                "delta": player.turn_delta(MetricKey.SECURITY),
                "ratio": player.security / 100,
                "color": settings.ACCENT,
                "foot": trend["text"] if trend else "",
                "foot_color": settings.RED if trend and trend["sharp"] else settings.ORANGE,
            },
            {
                "label": "公司资金",
                "value": settings.format_money(player.funds),
                "num": player.funds,
                "fmt": settings.format_money,
                "delta": player.turn_delta(MetricKey.FUNDS),
                "color": settings.RED if player.funds <= settings.FUNDS_WARN else settings.YELLOW,
            },
            {
                "label": "行动点",
                "value": f"{player.action_points} / {player.max_action_points}",
                "ratio": player.action_points / max(1, player.max_action_points),
                "color": settings.GREEN,
            },
            {
                "label": "公司声誉",
                "value": f"{player.reputation}%",
                "num": player.reputation,
                "fmt": lambda value: f"{value}%",
                "delta": player.turn_delta(MetricKey.REPUTATION),
                "ratio": player.reputation / 100,
                "color": settings.PURPLE,
            },
            {
                "label": "服务可用性",
                "value": f"{player.availability}%",
                "num": player.availability,
                "fmt": lambda value: f"{value}%",
                "delta": player.turn_delta(MetricKey.AVAILABILITY),
                "ratio": player.availability / 100,
                "color": settings.GREEN,
            },
            {
                "label": "数据完整度",
                "value": f"{player.integrity}%",
                "num": player.integrity,
                "fmt": lambda value: f"{value}%",
                "delta": player.turn_delta(MetricKey.INTEGRITY),
                "ratio": player.integrity / 100,
                "color": settings.BLUE,
            },
        ]
        self._track(stats)
        return stats

    # ------------------------------------------------------------------
    def _track(self, cells: list[dict[str, object]]) -> None:
        """记住每个数字指标的上一帧取值，变化时启动滚动与闪烁。"""
        now = pygame.time.get_ticks()
        for cell in cells:
            num = cell.get("num")
            if num is None:
                continue
            key = str(cell["label"])
            previous = self.values.get(key)
            self.values[key] = float(num)  # type: ignore[arg-type]
            if previous is None or int(previous) == int(num):  # type: ignore[arg-type]
                continue
            self.tweens[key] = (previous, float(num), now)  # type: ignore[arg-type]
            self.flashes[key] = (now, float(num) > previous)  # type: ignore[arg-type]

    def _display(self, cell: dict[str, object]) -> tuple[str, tuple[int, int, int]]:
        """滚动中的数字与闪色；动画结束后立刻回到真实值。"""
        key = str(cell["label"])
        color = cell.get("color", settings.TEXT)
        text = str(cell.get("value", ""))
        now = pygame.time.get_ticks()
        tween = self.tweens.get(key)
        if tween is not None:
            start, end, started = tween
            progress = min(1.0, (now - started) / self.TWEEN_MS)
            if progress >= 1.0:
                self.tweens.pop(key, None)
            else:
                eased = 1.0 - (1.0 - progress) ** 3
                value = int(round(start + (end - start) * eased))
                fmt = cell.get("fmt")
                text = fmt(value) if callable(fmt) else str(value)
        flash = self.flashes.get(key)
        if flash is not None:
            started_at, up = flash
            if now - started_at >= self.FLASH_MS:
                self.flashes.pop(key, None)
            else:
                color = settings.GREEN if up else settings.RED
        return text, color  # type: ignore[return-value]

    # ------------------------------------------------------------------
    def security_trend(self, game: "object") -> dict[str, object] | None:
        """B3 趋势预判：按最近两回合安全度的平均跌幅，推算大约几点会失守。

        只读 player.changes，不改任何数值；不足两回合的数据就不显示。
        """
        player = game.player
        if game.turn <= 0:
            return None
        by_turn: dict[int, int] = {}
        for change in player.changes:
            if change.key != MetricKey.SECURITY or change.turn <= 0:
                continue
            by_turn[change.turn] = by_turn.get(change.turn, 0) + int(change.delta)
        turns = sorted(by_turn)[-2:]
        if len(turns) < 2:
            return None
        average = sum(by_turn[turn] for turn in turns) / len(turns)
        if average > -0.5:
            return None
        turns_left = max(1, math.ceil(player.security / -average))
        leak_turn = game.turn + turns_left
        if leak_turn > player.total_turns:
            return None
        return {
            "turn": leak_turn,
            "sharp": turns_left <= 2,
            "text": f"{settings.clock_text(leak_turn)} 失守",
        }

    def _draw_cell(self, surface: pygame.Surface, x: int, width: int, cell: dict[str, object]) -> None:
        label_font = draw_utils.get_font(settings.FONT_TINY)
        value_font = draw_utils.get_font(18, True)
        label = label_font.render(str(cell["label"]), True, settings.TEXT_DIM)
        surface.blit(label, (x + 6, self.rect.y + 6))

        value_text, color = self._display(cell)
        value_image = value_font.render(value_text, True, color)  # type: ignore[arg-type]
        surface.blit(value_image, (x + 6, self.rect.y + 19))

        delta = int(cell.get("delta", 0) or 0)
        if delta:
            delta_color = settings.GREEN if delta > 0 else settings.RED
            delta_image = label_font.render(f"{delta:+d}", True, delta_color)
            surface.blit(
                delta_image,
                (x + 10 + value_image.get_width(), self.rect.y + 24),
            )

        sub = str(cell.get("sub", "") or "")
        if sub:
            sub_image = label_font.render(sub, True, settings.TEXT_FAINT)
            surface.blit(sub_image, (x + 10 + value_image.get_width(), self.rect.y + 24))

        # B3：趋势预判贴在数值行右侧，放不下就省略，绝不挤到隔壁指标里去
        foot = str(cell.get("foot", "") or "")
        if foot:
            foot_font = draw_utils.get_font(10, True)
            used = 10 + value_image.get_width()
            if delta:
                used += label_font.size(f"{delta:+d}")[0] + 4
            available = width - used - 16
            if available > 42:
                text = draw_utils.ellipsize(foot, foot_font, available)
                image = foot_font.render(text, True, cell.get("foot_color", settings.ORANGE))
                surface.blit(image, (x + width - 8 - image.get_width(), self.rect.y + 25))

        ratio = cell.get("ratio")
        if isinstance(ratio, (int, float)):
            bar_rect = pygame.Rect(x + 6, self.rect.y + 45, max(20, width - 22), 4)
            draw_utils.draw_bar(
                surface,
                bar_rect,
                float(ratio),
                color,  # type: ignore[arg-type]
                background=(30, 42, 58),
            )
        pygame.draw.line(
            surface,
            (26, 36, 50),
            (x, self.rect.y + 14),
            (x, self.rect.bottom - 14),
        )
