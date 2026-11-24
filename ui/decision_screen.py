# -*- coding: utf-8 -*-
"""回合间的剧情决策浮层：两个互斥选择，各自有指标代价。"""

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
        # 三个选项时把浮层加高，保证按钮不越过面板底边（1280x720 不能溢出）
        count = max(1, min(3, len([item for item in choices if isinstance(item, dict)])))
        height = 400 + max(0, count - 2) * 74
        self.rect = pygame.Rect(230, 150, 820, height)
        for index, choice in enumerate(choices[:3]):
            if not isinstance(choice, dict):
                continue
            button = Button(
                (self.rect.x + 42, self.rect.y + 214 + index * 74, self.rect.width - 84, 62),
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
        is_life = str(self.decision.get("kind", "") or "") == "life"
        overlay = draw_utils.dim_surface(surface.get_size(), 210)
        surface.blit(overlay, (0, 0))
        # 生活场景用暖色底 + 暖色标题/竖条，和值班决策区分开
        pygame.draw.rect(surface, (26, 21, 16) if is_life else settings.PANEL_BG, self.rect, border_radius=12)
        pygame.draw.rect(surface, settings.ORANGE, self.rect, 1, border_radius=12)
        if is_life:
            pygame.draw.rect(
                surface,
                settings.ORANGE,
                (self.rect.x + 7, self.rect.y + 16, 4, self.rect.height - 32),
                border_radius=2,
            )

        tiny = draw_utils.get_font(11)
        speaker = str(self.decision.get("speaker", "")).strip()
        header = f"第 {game.turn} 回合 · {'生活场景' if is_life else '值班决策'}"
        if speaker:
            header += f" · {speaker}"
        surface.blit(
            tiny.render(header, True, settings.ORANGE),
            (self.rect.x + 42, self.rect.y + 22),
        )
        title_font = draw_utils.get_font(26, True)
        surface.blit(
            title_font.render(
                str(self.decision.get("title", "紧急决策")),
                True,
                settings.YELLOW if is_life else settings.TEXT,
            ),
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
        note = (
            settings.LIFE_DECISION_NOTE
            if is_life
            else "选项只显示可预知的直接成本；安全影响可能在 1–3 回合后显现。"
        )
        surface.blit(
            hint_font.render(note, True, settings.TEXT_FAINT),
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
