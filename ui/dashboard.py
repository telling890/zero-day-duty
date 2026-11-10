# -*- coding: utf-8 -*-
"""顶部状态栏：夜班时间与所有全局指标。"""

from __future__ import annotations

import pygame

import settings
from models.player_state import MetricKey
from ui import draw_utils


class Dashboard:
    """绘制顶部状态栏。指标变化用箭头与颜色标注，原因写在消息区和日志里。"""

    def __init__(self) -> None:
        self.rect = pygame.Rect(settings.LAYOUT["top_bar"])
        self.brand_width = 160

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
        stats = [
            {
                "label": "夜班时间",
                "value": settings.clock_from_minutes(game.shift_minutes),
                "sub": f"· ×{int(game.speed)}",
                "color": settings.ACCENT,
                "ratio": game.shift_minutes / max(1, settings.SHIFT_MINUTES),
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
                "delta": player.turn_delta(MetricKey.SECURITY),
                "ratio": player.security / 100,
                "color": settings.ACCENT,
            },
            {
                "label": "公司资金",
                "value": settings.format_money(player.funds),
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
                "delta": player.turn_delta(MetricKey.REPUTATION),
                "ratio": player.reputation / 100,
                "color": settings.PURPLE,
            },
            {
                "label": "服务可用性",
                "value": f"{player.availability}%",
                "delta": player.turn_delta(MetricKey.AVAILABILITY),
                "ratio": player.availability / 100,
                "color": settings.GREEN,
            },
            {
                "label": "数据完整度",
                "value": f"{player.integrity}%",
                "delta": player.turn_delta(MetricKey.INTEGRITY),
                "ratio": player.integrity / 100,
                "color": settings.BLUE,
            },
        ]
        return stats

    def _draw_cell(self, surface: pygame.Surface, x: int, width: int, cell: dict[str, object]) -> None:
        label_font = draw_utils.get_font(settings.FONT_TINY)
        value_font = draw_utils.get_font(18, True)
        label = label_font.render(str(cell["label"]), True, settings.TEXT_DIM)
        surface.blit(label, (x + 6, self.rect.y + 6))

        color = cell.get("color", settings.TEXT)
        value_text = str(cell.get("value", ""))
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
