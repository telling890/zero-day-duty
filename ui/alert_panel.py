# -*- coding: utf-8 -*-
"""右侧告警列表：滚动、等级、目标与调查状态。"""

from __future__ import annotations

import pygame

import settings
from ui import draw_utils

ROW_HEIGHT = 46


class AlertPanel:
    def __init__(self, rect: tuple[int, int, int, int] | pygame.Rect) -> None:
        self.rect = pygame.Rect(rect)
        self.scroll = 0

    # ------------------------------------------------------------------
    def _ordered(self, game: "object") -> list["object"]:
        return sorted(game.events.alerts, key=lambda alert: alert.sort_key())

    def _visible_rows(self) -> int:
        content_height = self.rect.height - 34 - 12
        return max(1, content_height // ROW_HEIGHT)

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        alerts = self._ordered(game)
        unresolved = len([alert for alert in alerts if not alert.resolved])
        header = f"未清除 {unresolved} / 共 {len(alerts)}   （滚轮滚动）"
        content = draw_utils.draw_panel(surface, self.rect, "安全告警", header_right=header)

        if not alerts:
            font = draw_utils.get_font(settings.FONT_SMALL)
            surface.blit(font.render("暂无告警。保持监控，注意正常业务也会产生噪音。", True, settings.TEXT_DIM), (content.x, content.y + 8))
            return

        rows = self._visible_rows()
        self.scroll = max(0, min(self.scroll, max(0, len(alerts) - rows)))
        visible = alerts[self.scroll : self.scroll + rows]
        mouse_pos = pygame.mouse.get_pos()

        for index, alert in enumerate(visible):
            row_rect = pygame.Rect(content.x, content.y + index * ROW_HEIGHT, content.width, ROW_HEIGHT - 2)
            selected = game.selected_alert is not None and alert.alert_id == game.selected_alert.alert_id
            self._draw_row(surface, game, alert, row_rect, selected, row_rect.collidepoint(mouse_pos))

        # 滚动条
        if len(alerts) > rows:
            track = pygame.Rect(self.rect.right - 7, content.y, 3, rows * ROW_HEIGHT - 4)
            pygame.draw.rect(surface, (30, 42, 58), track, border_radius=2)
            total = len(alerts)
            thumb_h = max(18, int(track.height * rows / total))
            max_scroll = max(1, total - rows)
            thumb_y = track.y + int((track.height - thumb_h) * self.scroll / max_scroll)
            pygame.draw.rect(surface, settings.ACCENT_DARK, (track.x, thumb_y, 3, thumb_h), border_radius=2)

    def _draw_row(
        self,
        surface: pygame.Surface,
        game: "object",
        alert: "object",
        rect: pygame.Rect,
        selected: bool,
        hovered: bool,
    ) -> None:
        if selected:
            pygame.draw.rect(surface, (28, 44, 62), rect, border_radius=5)
            pygame.draw.rect(surface, settings.ACCENT_DARK, rect, 1, border_radius=5)
        elif hovered:
            pygame.draw.rect(surface, (23, 34, 48), rect, border_radius=5)
        if (
            alert.investigated
            and not alert.false_positive
            and not alert.resolved
            and not alert.controlled
            and alert.level in ("高危", "极危")
        ):
            import math

            pulse = (math.sin(pygame.time.get_ticks() / 240.0) + 1.0) / 2.0
            glow = rect.inflate(2, 2)
            color = (int(120 + 90 * pulse), int(45 + 30 * pulse), int(45 + 30 * pulse))
            pygame.draw.rect(surface, color, glow, 1, border_radius=6)
        pygame.draw.rect(surface, alert.level_color, (rect.x, rect.y + 4, 3, rect.height - 8), border_radius=2)

        small = draw_utils.get_font(settings.FONT_TINY, True)
        tiny = draw_utils.get_font(10)
        title_font = draw_utils.get_font(settings.FONT_SMALL, True)

        tag_width = 46
        draw_utils.draw_tag(surface, alert.display_level, tiny, (rect.x + 9, rect.y + 4), alert.level_color, filled=alert.investigated and not alert.false_positive)
        title = draw_utils.ellipsize(alert.title, title_font, rect.width - tag_width - 120)
        surface.blit(title_font.render(title, True, settings.TEXT), (rect.x + 52, rect.y + 3))
        status = small.render(alert.status_text, True, alert.status_color)
        surface.blit(status, (rect.right - 10 - status.get_width(), rect.y + 4))

        target = game.devices.get(alert.target_id)
        target_name = target.short_name if target else alert.target_id
        info = f"目标 {alert.target_id} {target_name} · 第{alert.turn}回合 {alert.clock}"
        if alert.source_ip:
            info += f" · 来源 {alert.source_ip}"
        related = game.related_alerts(alert)
        if related:
            info += f" · 关联 {len(related)} 条"
        surface.blit(tiny.render(draw_utils.ellipsize(info, tiny, rect.width - 20), True, settings.TEXT_DIM), (rect.x + 10, rect.y + 25))

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event, game: "object") -> bool:
        if event.type == pygame.MOUSEWHEEL:
            if self.rect.collidepoint(pygame.mouse.get_pos()):
                self.scroll = max(0, self.scroll - event.y)
                return True
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if not self.rect.collidepoint(event.pos):
                return False
            content_x = self.rect.x + 12
            content_y = self.rect.y + 40
            if event.pos[1] < content_y:
                return False
            index = (event.pos[1] - content_y) // ROW_HEIGHT
            alerts = self._ordered(game)
            index += self.scroll
            if 0 <= index < len(alerts):
                game.select_alert(alerts[int(index)])
                try:
                    from systems.audio_manager import get_audio

                    get_audio().play("click")
                except Exception:
                    pass
                return True
        return False
