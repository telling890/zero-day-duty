# -*- coding: utf-8 -*-
"""通用按钮：悬停、按下、点击反馈与禁用原因。"""

from __future__ import annotations

import pygame

import settings
from ui import draw_utils


class Button:
    """一个可点击按钮。

    - 悬停时边框变亮
    - 按下时轻微高亮，松开时若仍在按钮内则触发点击
    - 禁用时变暗，并通过 tooltip_reason 说明原因
    """

    STYLE_COLORS = {
        "default": (settings.PANEL_BG_ALT, (30, 43, 60), settings.PANEL_BORDER, settings.TEXT),
        "primary": ((0, 92, 112), (0, 122, 146), settings.ACCENT, settings.WHITE),
        "danger": ((74, 30, 34), (96, 38, 42), settings.RED, settings.TEXT),
        "ghost": (settings.PANEL_BG, (26, 37, 52), settings.PANEL_BORDER, settings.TEXT_DIM),
        "success": ((22, 62, 48), (30, 84, 62), settings.GREEN, settings.TEXT),
        "info": ((22, 48, 76), (30, 62, 96), settings.BLUE, settings.TEXT),
        "warning": ((68, 52, 24), (88, 68, 30), settings.ORANGE, settings.TEXT),
        "purple": ((48, 34, 72), (62, 45, 92), settings.PURPLE, settings.TEXT),
    }

    def __init__(
        self,
        rect: tuple[int, int, int, int] | pygame.Rect,
        text: str,
        *,
        subtitle: str = "",
        style: str = "default",
        font_size: int = settings.FONT_BODY,
        enabled: bool = True,
        tooltip_reason: str = "",
        tag: str = "",
    ) -> None:
        self.rect = pygame.Rect(rect)
        self.text = text
        self.subtitle = subtitle
        self.style = style
        self.font_size = font_size
        self.enabled = enabled
        self.tooltip_reason = tooltip_reason
        self.tag = tag
        self.pressed = False
        self.flash = 0.0

    # ------------------------------------------------------------------
    def set_state(self, *, enabled: bool | None = None, tooltip_reason: str | None = None) -> None:
        if enabled is not None:
            self.enabled = enabled
        if tooltip_reason is not None:
            self.tooltip_reason = tooltip_reason

    def handle_event(self, event: pygame.event.Event) -> bool:
        """返回 True 表示本次事件完成了一次有效点击。"""
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.rect.collidepoint(event.pos):
                self.pressed = True
                self.flash = 0.12
                return False
        elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
            was_pressed = self.pressed
            self.pressed = False
            if was_pressed and self.rect.collidepoint(event.pos) and self.enabled:
                self.flash = 0.18
                try:
                    from systems.audio_manager import get_audio

                    get_audio().play("click")
                except Exception:
                    pass
                return True
        return False

    def update(self, dt: float) -> None:
        if self.flash > 0:
            self.flash = max(0.0, self.flash - dt)

    def hovered(self, mouse_pos: tuple[int, int]) -> bool:
        return self.enabled and self.rect.collidepoint(mouse_pos)

    def draw(self, surface: pygame.Surface, mouse_pos: tuple[int, int]) -> None:
        hover = self.hovered(mouse_pos)
        base, hover_fill, border, text_color = self.STYLE_COLORS.get(
            self.style, self.STYLE_COLORS["default"]
        )
        if not self.enabled:
            fill = (20, 28, 38)
            border_color = (32, 43, 57)
            text_color = settings.TEXT_FAINT
        else:
            fill = hover_fill if hover else base
            border_color = settings.ACCENT if hover else border
            if self.pressed:
                fill = tuple(min(255, channel + 14) for channel in fill)

        rect = self.rect
        pygame.draw.rect(surface, fill, rect, border_radius=6)
        pygame.draw.rect(surface, border_color, rect, 1, border_radius=6)
        if not self.enabled:
            pygame.draw.line(surface, (26, 35, 47), (rect.x + 8, rect.y + 8), (rect.right - 8, rect.y + 8))

        if self.flash > 0 and self.enabled:
            overlay = pygame.Surface(rect.size, pygame.SRCALPHA)
            overlay.fill((255, 255, 255, int(70 * (self.flash / 0.18))))
            surface.blit(overlay, rect.topleft)

        font = draw_utils.get_font(self.font_size, bold=self.style in ("primary", "danger", "success", "warning"))
        if self.subtitle:
            main = font.render(self.text, True, text_color)
            small = draw_utils.get_font(settings.FONT_TINY)
            sub_color = settings.TEXT_DIM if self.enabled else settings.TEXT_FAINT
            sub = small.render(self.subtitle, True, sub_color)
            total = main.get_height() + sub.get_height() + 2
            top = rect.y + (rect.height - total) // 2
            surface.blit(main, (rect.x + (rect.width - main.get_width()) // 2, top))
            surface.blit(
                sub,
                (rect.x + (rect.width - sub.get_width()) // 2, top + main.get_height() + 2),
            )
        else:
            text_image = font.render(self.text, True, text_color)
            surface.blit(
                text_image,
                (
                    rect.x + (rect.width - text_image.get_width()) // 2,
                    rect.y + (rect.height - text_image.get_height()) // 2,
                ),
            )
