# -*- coding: utf-8 -*-
"""值班过程中的剧情决策浮层：两个互斥选择，各自有指标代价。"""

from __future__ import annotations

import pygame

import settings
from ui import draw_utils
from ui.button import Button


class DecisionScreen:
    def __init__(self) -> None:
        self.visible = False
        self.decision: dict[str, object] | None = None
        self.buttons: list[Button] = []
        self.rect = pygame.Rect(230, 150, 820, 400)

    # ------------------------------------------------------------------
    def open(self, decision: dict[str, object]) -> None:
        self.decision = decision
        self.visible = True
        self.buttons = []
        choices = decision.get("choices", [])
        if not isinstance(choices, list):
            choices = []
        for index, choice in enumerate(choices[:2]):
            if not isinstance(choice, dict):
                continue
            button = Button(
                (self.rect.x + 42, self.rect.y + 218 + index * 82, self.rect.width - 84, 66),
                str(choice.get("label", "选择")),
                subtitle=str(choice.get("hint", "")),
                style="primary" if index == 0 else "default",
                font_size=16,
                tag=str(index),
            )
            self.buttons.append(button)

    def close(self) -> None:
        self.visible = False
        self.decision = None
        self.buttons = []

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        if not self.visible or not self.decision:
            return
        overlay = draw_utils.dim_surface(surface.get_size(), 210)
        surface.blit(overlay, (0, 0))
        pygame.draw.rect(surface, settings.PANEL_BG, self.rect, border_radius=12)
        pygame.draw.rect(surface, settings.ORANGE, self.rect, 1, border_radius=12)

        tiny = draw_utils.get_font(11)
        speaker = str(self.decision.get("speaker", "")).strip()
        header = f"{settings.clock_from_minutes(game.shift_minutes)} · 值班决策"
        if speaker:
            header += f" · {speaker}"
        surface.blit(
            tiny.render(header, True, settings.ORANGE),
            (self.rect.x + 42, self.rect.y + 22),
        )
        title_font = draw_utils.get_font(26, True)
        surface.blit(
            title_font.render(str(self.decision.get("title", "紧急决策")), True, settings.TEXT),
            (self.rect.x + 42, self.rect.y + 48),
        )
        draw_utils.draw_text_block(
            surface,
            str(self.decision.get("prompt", "")),
            draw_utils.get_font(14),
            settings.TEXT_DIM,
            (self.rect.x + 42, self.rect.y + 96),
            self.rect.width - 84,
            line_height=23,
            max_lines=4,
        )
        hint_font = draw_utils.get_font(11)
        surface.blit(
            hint_font.render("选择会立即改变指标，并影响本局最终结算。", True, settings.TEXT_FAINT),
            (self.rect.x + 42, self.rect.y + 184),
        )
        mouse_pos = pygame.mouse.get_pos()
        for button in self.buttons:
            button.draw(surface, mouse_pos)

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event, game: "object") -> bool:
        if not self.visible:
            return False
        for index, button in enumerate(self.buttons):
            if button.handle_event(event):
                game.choose_decision(index)
                return True
        return event.type in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEWHEEL)

    def update(self, dt: float) -> None:
        for button in self.buttons:
            button.update(dt)
