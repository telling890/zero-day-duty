# -*- coding: utf-8 -*-
"""操作面板：根据当前目标显示可用操作、消耗与禁用原因。"""

from __future__ import annotations

import pygame

import settings
from systems.action_manager import ActionOption
from ui import draw_utils
from ui.button import Button

BUTTON_HEIGHT = 50

ACTION_STYLES = {
    "investigate": "default",
    "delete_mail": "danger",
    "reset_password": "warning",
    "block_source": "info",
    "isolate": "warning",
    "unisolate": "success",
    "eradicate": "purple",
    "patch": "success",
    "shutdown": "danger",
    "startup": "info",
    "restore_backup": "info",
    "protect_backup": "purple",
}


class ActionPanel:
    def __init__(self, rect: tuple[int, int, int, int] | pygame.Rect) -> None:
        self.rect = pygame.Rect(rect)
        self.buttons: list[tuple[Button, ActionOption]] = []
        self._signature: tuple[object, ...] | None = None

    # ------------------------------------------------------------------
    def sync(self, game: "object") -> None:
        target = game.current_target()
        options = game.actions.options_for(game, target)
        signature = (
            target.kind if target else None,
            target.alert.alert_id if target and target.alert else None,
            target.device.device_id if target and target.device else None,
            tuple(
                (option.action_id, option.enabled, option.reason, option.ap_cost, option.money_cost)
                for option in options
            ),
        )
        if signature == self._signature:
            return
        self._signature = signature
        self.buttons = self._build_buttons(options)

    def _build_buttons(self, options: list[ActionOption]) -> list[tuple[Button, ActionOption]]:
        buttons: list[tuple[Button, ActionOption]] = []
        gap = 8
        columns = 3
        width = (self.rect.width - 24 - gap * (columns - 1)) // columns
        start_x = self.rect.x + 12
        start_y = self.rect.y + 64
        for index, option in enumerate(options):
            row, column = divmod(index, columns)
            rect = pygame.Rect(
                start_x + column * (width + gap),
                start_y + row * (BUTTON_HEIGHT + gap),
                width,
                BUTTON_HEIGHT,
            )
            subtitle = f"AP {option.ap_cost} · ¥{option.money_cost}" if option.enabled else "不可用"
            button = Button(
                rect,
                option.name,
                subtitle=subtitle,
                style=ACTION_STYLES.get(option.action_id, "primary") if option.enabled else "default",
                font_size=14,
                enabled=option.enabled,
                tooltip_reason=option.reason,
                tag=option.action_id,
            )
            buttons.append((button, option))
        return buttons

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        self.sync(game)
        target = game.current_target()
        header = f"行动点 {game.player.action_points} / {game.player.max_action_points}"
        draw_utils.draw_panel(surface, self.rect, "操作面板", header_right=header)

        small = draw_utils.get_font(settings.FONT_TINY)
        if target is None:
            caption = "目标：未选择 — 点击告警或设备查看可用操作"
        else:
            caption = f"目标：{target.label}"
        caption = draw_utils.ellipsize(caption, small, self.rect.width - 30)
        surface.blit(small.render(caption, True, settings.TEXT_DIM), (self.rect.x + 13, self.rect.y + 40))

        if not self.buttons:
            font = draw_utils.get_font(settings.FONT_SMALL)
            surface.blit(
                font.render("当前没有可执行的针对性操作。", True, settings.TEXT_FAINT),
                (self.rect.x + 13, self.rect.y + 88),
            )
            return

        mouse_pos = pygame.mouse.get_pos()
        for button, _option in self.buttons:
            button.draw(surface, mouse_pos)

        # 禁用按钮的悬停原因
        for button, option in self.buttons:
            if not button.enabled and button.rect.collidepoint(mouse_pos) and option.reason:
                draw_utils.draw_tooltip(
                    surface,
                    f"{option.name}：{option.reason}",
                    mouse_pos,
                    max_width=300,
                )
                break

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event, game: "object") -> bool:
        for button, option in self.buttons:
            if button.handle_event(event):
                target = game.current_target()
                if target is not None:
                    hint = game.consume_action_hint(option, target)
                    if hint:
                        game.push_message(f"新手提示：{hint}", settings.ORANGE)
                        game.effects.add_banner("新手提示", hint[:46], settings.ORANGE)
                    game.perform_action(option, target)
                return True
        return False

    def update(self, dt: float) -> None:
        for button, _option in self.buttons:
            button.update(dt)
