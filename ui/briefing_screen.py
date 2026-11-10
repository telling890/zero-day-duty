# -*- coding: utf-8 -*-
"""夜班交接简报：让玩家在开始值班前先认识今晚的同事与目标。"""

from __future__ import annotations

import pygame

import settings
from ui import draw_utils
from ui.button import Button


class BriefingScreen:
    def __init__(self) -> None:
        self.visible = False
        self.rect = pygame.Rect(220, 92, 840, 536)
        self.button = Button(
            (self.rect.centerx - 120, self.rect.bottom - 66, 240, 44),
            "进入值班",
            style="primary",
        )

    def open(self) -> None:
        self.visible = True

    def close(self) -> None:
        self.visible = False

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface) -> None:
        if not self.visible:
            return
        overlay = draw_utils.dim_surface(surface.get_size(), 215)
        surface.blit(overlay, (0, 0))
        pygame.draw.rect(surface, settings.PANEL_BG, self.rect, border_radius=12)
        pygame.draw.rect(surface, settings.ACCENT, self.rect, 1, border_radius=12)

        tiny = draw_utils.get_font(11)
        surface.blit(
            tiny.render("22:00 · 夜班交接 · 云栖示例科技（虚构）", True, settings.ACCENT),
            (self.rect.x + 36, self.rect.y + 22),
        )
        title = draw_utils.get_font(30, True).render("今晚，守住这家公司。", True, settings.TEXT)
        surface.blit(title, (self.rect.x + 36, self.rect.y + 48))
        draw_utils.draw_text_block(
            surface,
            "你是夜班安全管理员。接下来的 10 个小时，6 条攻击链会陆续出现。"
            "先听同事说完，再决定今晚怎么值班。",
            draw_utils.get_font(13),
            settings.TEXT_DIM,
            (self.rect.x + 36, self.rect.y + 92),
            self.rect.width - 72,
            line_height=21,
            max_lines=2,
        )

        people = (
            ("主管 · 陈可", "客户在催交付，任何停服都要先报备。别把“安全”变成“全停”。", settings.ACCENT),
            ("公关 · 林岚", "媒体来问先别擅自回应，把情况同步给我。", settings.PURPLE),
            ("IT 运维 · 阿哲", "备份服务器在 BAK-01。别等数据库被加密了才想起它。", settings.ORANGE),
        )
        y = self.rect.y + 158
        for name, line, color in people:
            card = pygame.Rect(self.rect.x + 36, y, self.rect.width - 72, 62)
            pygame.draw.rect(surface, settings.PANEL_BG_ALT, card, border_radius=8)
            pygame.draw.rect(surface, settings.PANEL_BORDER, card, 1, border_radius=8)
            pygame.draw.rect(surface, color, (card.x, card.y, 4, card.height), border_radius=2)
            surface.blit(draw_utils.get_font(13, True).render(name, True, color), (card.x + 18, card.y + 10))
            surface.blit(
                draw_utils.get_font(12).render(line, True, settings.TEXT_DIM),
                (card.x + 18, card.y + 33),
            )
            y += 74

        objective = pygame.Rect(self.rect.x + 36, y + 4, self.rect.width - 72, 44)
        pygame.draw.rect(surface, (10, 18, 27), objective, border_radius=7)
        surface.blit(
            draw_utils.get_font(12).render(
                "今晚目标：08:00 前清除全部攻击链，同时让业务保持在线。",
                True,
                settings.YELLOW,
            ),
            (objective.x + 16, objective.y + 13),
        )
        surface.blit(
            tiny.render("提示：先调查，再控制；控制后还要清除，最后恢复业务。", True, settings.TEXT_FAINT),
            (self.rect.x + 38, objective.bottom + 10),
        )
        self.button.draw(surface, pygame.mouse.get_pos())

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event) -> bool:
        if not self.visible:
            return False
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.close()
            return True
        if self.button.handle_event(event):
            self.close()
            return True
        return event.type in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEWHEEL)

    def update(self, dt: float) -> None:
        self.button.update(dt)
