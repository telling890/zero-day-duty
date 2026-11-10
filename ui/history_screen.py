# -*- coding: utf-8 -*-
"""历史排行榜浮层：显示本机保存的最高分记录。"""

from __future__ import annotations

import pygame

import settings
from ui import draw_utils
from ui.button import Button


class HistoryScreen:
    def __init__(self) -> None:
        self.visible = False
        self.rect = pygame.Rect(190, 92, 900, 536)
        self.close_button = Button((self.rect.right - 166, self.rect.bottom - 56, 140, 38), "关闭", style="primary")

    def open(self) -> None:
        self.visible = True

    def close(self) -> None:
        self.visible = False

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        if not self.visible:
            return
        overlay = draw_utils.dim_surface(surface.get_size(), 195)
        surface.blit(overlay, (0, 0))
        pygame.draw.rect(surface, settings.PANEL_BG, self.rect, border_radius=12)
        pygame.draw.rect(surface, settings.ACCENT_DARK, self.rect, 1, border_radius=12)

        title_font = draw_utils.get_font(24, True)
        surface.blit(title_font.render("历史排行榜", True, settings.ACCENT), (self.rect.x + 28, self.rect.y + 20))
        tiny = draw_utils.get_font(11)
        surface.blit(
            tiny.render("本机最高分记录（最多 30 条，按分数排序）", True, settings.TEXT_DIM),
            (self.rect.x + 28, self.rect.y + 54),
        )
        pygame.draw.line(
            surface,
            settings.PANEL_BORDER,
            (self.rect.x + 24, self.rect.y + 80),
            (self.rect.right - 24, self.rect.y + 80),
        )

        history = game.save_manager.load_history()
        if not history:
            font = draw_utils.get_font(14)
            surface.blit(
                font.render("还没有历史记录。完成一局值班后就会出现在这里。", True, settings.TEXT_DIM),
                (self.rect.x + 30, self.rect.y + 110),
            )
        else:
            header = ("#", "得分", "等级", "结局", "回合", "种子", "时间")
            x_positions = (30, 100, 190, 330, 600, 690, 780)
            header_font = draw_utils.get_font(11, True)
            for text, x in zip(header, x_positions):
                surface.blit(header_font.render(text, True, settings.TEXT_FAINT), (self.rect.x + x, self.rect.y + 94))
            row_font = draw_utils.get_font(12)
            score_font = draw_utils.get_font(13, True)
            for index, entry in enumerate(history[:10]):
                y = self.rect.y + 122 + index * 34
                if index % 2 == 0:
                    pygame.draw.rect(
                        surface,
                        (22, 32, 46),
                        (self.rect.x + 22, y - 5, self.rect.width - 44, 30),
                        border_radius=4,
                    )
                grade = str(entry.get("grade", "-"))
                grade_color = {
                    "S": settings.YELLOW,
                    "A": settings.GREEN,
                    "B": settings.ACCENT,
                    "C": settings.TEXT_DIM,
                    "D": settings.RED,
                }.get(grade, settings.TEXT_DIM)
                values = (
                    str(index + 1),
                    str(entry.get("score", 0)),
                    grade,
                    str(entry.get("ending", "-")),
                    str(entry.get("turn", "-")),
                    str(entry.get("seed", "-")),
                    str(entry.get("timestamp", "-")),
                )
                for column, (text, x) in enumerate(zip(values, x_positions)):
                    font = score_font if column == 1 else row_font
                    color = grade_color if column == 2 else (settings.TEXT if column <= 2 else settings.TEXT_DIM)
                    image = font.render(draw_utils.ellipsize(text, font, 150 if column == 3 else 110), True, color)
                    surface.blit(image, (self.rect.x + x, y))

        self.close_button.draw(surface, pygame.mouse.get_pos())

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event) -> bool:
        if not self.visible:
            return False
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.close()
            return True
        if self.close_button.handle_event(event):
            self.close()
            return True
        return event.type in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEWHEEL)

    def update(self, dt: float) -> None:
        self.close_button.update(dt)
