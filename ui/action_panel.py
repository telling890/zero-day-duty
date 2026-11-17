# -*- coding: utf-8 -*-
"""操作面板：根据当前目标显示可用操作、消耗与禁用原因。"""

from __future__ import annotations

import pygame

import settings
from systems.action_manager import ActionOption
from ui import draw_utils
from ui.button import Button

BUTTON_HEIGHT = 50

# A2：不可逆动作要点两次。第一次只“上膛”，4 秒内不确认就自动取消。
CONFIRM_ACTIONS = ("shutdown", "unisolate")
CONFIRM_MS = 4000

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
        # A2：待确认的动作 (action_id, 过期时刻)
        self.pending: tuple[str, int] | None = None
        # C2：就地反馈 (标题, 说明, 颜色, 过期时刻)——代替原来盖在屏幕中央的大字
        self.feedback: tuple[str, str, tuple[int, int, int], int] | None = None

    # ------------------------------------------------------------------
    def set_feedback(
        self,
        title: str,
        detail: str,
        color: tuple[int, int, int],
        duration_ms: int = 2800,
    ) -> None:
        self.feedback = (str(title), str(detail), color, pygame.time.get_ticks() + duration_ms)

    def clear_feedback(self) -> None:
        self.feedback = None

    def active_feedback(self) -> tuple[str, str, tuple[int, int, int]] | None:
        if self.feedback is None:
            return None
        title, detail, color, deadline = self.feedback
        if pygame.time.get_ticks() >= deadline:
            self.feedback = None
            return None
        return title, detail, color

    # ------------------------------------------------------------------
    def pending_action(self) -> str:
        """当前挂在“再点一次确认”上的动作名，没有则返回空串。"""
        if not self.pending:
            return ""
        action_id, deadline = self.pending
        if pygame.time.get_ticks() >= deadline:
            self.pending = None
            return ""
        return action_id

    def _clear_pending(self) -> None:
        self.pending = None

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
        # 目标或可用选项变了：之前“上膛”的确认作废
        self._clear_pending()
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
            # A1：禁用原因直接写在按钮上，不再只藏在悬停提示里
            if option.enabled:
                subtitle = f"AP {option.ap_cost} · ¥{option.money_cost}"
            else:
                subtitle = self._short_reason(option.reason or "不可用", width - 14)
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

    @staticmethod
    def _short_reason(reason: str, width: int) -> str:
        """按钮上只放第一句：完整原因仍留在悬停提示里。

        例如「请先调查告警，确认这是真的是钓鱼邮件」→「请先调查告警」。
        """
        text = reason
        for separator in ("，", "；", ";", ","):
            if separator in text:
                text = text.split(separator)[0]
                break
        return draw_utils.ellipsize(text.strip() or reason, draw_utils.get_font(settings.FONT_TINY), width)

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        self.sync(game)
        target = game.current_target()
        header = f"行动点 {game.player.action_points} / {game.player.max_action_points}"
        draw_utils.draw_panel(surface, self.rect, "操作面板", header_right=header)

        pending = self.pending_action()
        pending_name = next(
            (option.name for _button, option in self.buttons if option.action_id == pending),
            pending,
        )

        small = draw_utils.get_font(settings.FONT_TINY)
        feedback = self.active_feedback()
        if pending:
            # A2：待确认时这一行改写成提示，盖掉“目标：……”那一行
            hint_font = draw_utils.get_font(settings.FONT_TINY, True)
            hint = draw_utils.ellipsize(
                f"{pending_name}：这一步不可逆，再点一次确认执行；4 秒内不确认会自动取消。",
                hint_font,
                self.rect.width - 26,
            )
            surface.blit(hint_font.render(hint, True, settings.ORANGE), (self.rect.x + 13, self.rect.y + 40))
        elif feedback is not None:
            # C2：结果就地显示在提示行里，不再盖住屏幕中央
            self._draw_feedback(surface, feedback)
        else:
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

        # A2：待确认的动作加一圈橙色描边
        if pending:
            for button, option in self.buttons:
                if option.action_id == pending:
                    pygame.draw.rect(
                        surface,
                        settings.ORANGE,
                        button.rect.inflate(4, 4),
                        2,
                        border_radius=8,
                    )
                    break

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
    def _draw_feedback(
        self,
        surface: pygame.Surface,
        feedback: tuple[str, str, tuple[int, int, int]],
    ) -> None:
        """C2：标题用动作颜色、说明用暗色，右边放一个色条——就在按钮上方。"""
        title, detail, color = feedback
        x = self.rect.x + 13
        y = self.rect.y + 40
        pygame.draw.rect(surface, color, pygame.Rect(x - 5, y + 1, 2, 13))
        title_font = draw_utils.get_font(settings.FONT_TINY, True)
        detail_font = draw_utils.get_font(settings.FONT_TINY)
        title_image = title_font.render(title, True, color)
        surface.blit(title_image, (x, y))
        room = self.rect.width - (x - self.rect.x) - title_image.get_width() - 24
        if detail:
            text = draw_utils.ellipsize(f"· {detail}", detail_font, room)
            surface.blit(detail_font.render(text, True, settings.TEXT_DIM), (x + title_image.get_width() + 8, y))

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event, game: "object") -> bool:
        for button, option in self.buttons:
            if button.handle_event(event):
                target = game.current_target()
                if target is None:
                    return True
                # A2：关闭服务器 / 解除隔离先上膛，第二次点击才真正执行
                if option.action_id in CONFIRM_ACTIONS:
                    if self.pending_action() != option.action_id:
                        self.pending = (option.action_id, pygame.time.get_ticks() + CONFIRM_MS)
                        return True
                    self._clear_pending()
                else:
                    self._clear_pending()
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
