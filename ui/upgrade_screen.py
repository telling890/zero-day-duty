# -*- coding: utf-8 -*-
"""安全加固商店：三条线 × 两层的被动能力，第二层是互斥专精。

界面只负责把 data/upgrades.json 里的结构画出来并转发点击，
前置条件、互斥与扣费全部由 Game.buy_upgrade 判定。
"""

from __future__ import annotations

import pygame

import settings
from ui import draw_utils
from ui.button import Button

TRACK_COLORS = {
    "accent": settings.ACCENT,
    "green": settings.GREEN,
    "orange": settings.ORANGE,
    "purple": settings.PURPLE,
    "yellow": settings.YELLOW,
    "blue": settings.BLUE,
}

CARD_W = 280
CARD_H = 118
CARD_GAP_Y = 12
COL_GAP = 16
PAD_X = 24
HEADER_Y = 128


class UpgradeScreen:
    def __init__(self) -> None:
        self.visible = False
        self.rect = pygame.Rect(180, 76, 920, 596)
        self.buy_buttons: list[tuple[Button, str]] = []
        self.close_button = Button(
            (self.rect.right - 172, self.rect.bottom - 52, 148, 38),
            "返回值班",
            style="primary",
        )
        self._signature: tuple[object, ...] | None = None
        self._cards: list[tuple[pygame.Rect, object]] = []

    # ------------------------------------------------------------------
    def open(self) -> None:
        self.visible = True
        self._signature = None

    def close(self) -> None:
        self.visible = False

    # ------------------------------------------------------------------
    @staticmethod
    def _track_color(track) -> tuple[int, int, int]:
        return TRACK_COLORS.get(getattr(track, "color", "accent"), settings.ACCENT)

    def _card_state(self, game: "object", upgrade) -> tuple[str, str]:
        """返回 (状态, 说明)：owned / excluded / locked / unaffordable / available。"""
        if upgrade.upgrade_id in game.player.upgrades:
            return "owned", "本局已生效"
        allowed, reason = game.upgrade_tree.check(upgrade, game.player.upgrades)
        if not allowed:
            conflict = game.upgrade_tree.locked_by_upgrade(upgrade, game.player.upgrades)
            if conflict is not None:
                return "excluded", f"与「{conflict.name}」互斥"
            return "locked", reason
        if game.player.funds < upgrade.cost:
            return "unaffordable", f"资金不足（需 ¥{upgrade.cost}）"
        return "available", "可以用预算启用"

    def _layout(self, game: "object") -> list[tuple[pygame.Rect, object]]:
        grouped = game.upgrade_tree.by_track()
        cards: list[tuple[pygame.Rect, object]] = []
        for column, track in enumerate(game.upgrade_tree.tracks):
            x = self.rect.x + PAD_X + column * (CARD_W + COL_GAP)
            for row, upgrade in enumerate(grouped.get(track.track_id, [])):
                y = self.rect.y + HEADER_Y + row * (CARD_H + CARD_GAP_Y)
                cards.append((pygame.Rect(x, y, CARD_W, CARD_H), upgrade))
        return cards

    # ------------------------------------------------------------------
    def _sync(self, game: "object") -> None:
        signature = (
            int(game.player.funds),
            tuple(sorted(game.player.upgrades)),
            tuple(upgrade.upgrade_id for upgrade in game.upgrade_catalog),
        )
        if signature == self._signature:
            return
        self._signature = signature
        self._cards = self._layout(game)
        self.buy_buttons = []
        for card, upgrade in self._cards:
            state, reason = self._card_state(game, upgrade)
            if state == "owned":
                continue
            button = Button(
                (card.right - 98, card.bottom - 36, 84, 26),
                "购买",
                style="default",
                font_size=12,
                enabled=state == "available",
                tooltip_reason=reason,
            )
            self.buy_buttons.append((button, upgrade.upgrade_id))

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        if not self.visible:
            return
        self._sync(game)
        overlay = draw_utils.dim_surface(surface.get_size(), 190)
        surface.blit(overlay, (0, 0))
        pygame.draw.rect(surface, settings.PANEL_BG, self.rect, border_radius=12)
        pygame.draw.rect(surface, settings.ACCENT_DARK, self.rect, 1, border_radius=12)

        title_font = draw_utils.get_font(24, True)
        surface.blit(
            title_font.render("安全加固 · 三线两层", True, settings.ACCENT),
            (self.rect.x + 28, self.rect.y + 18),
        )
        small = draw_utils.get_font(12)
        surface.blit(
            small.render(
                "三条线各两层：第一层随时可补，第二层是专精，同一时间只能选一个。",
                True,
                settings.TEXT_DIM,
            ),
            (self.rect.x + 28, self.rect.y + 52),
        )
        money_font = draw_utils.get_font(18, True)
        money = money_font.render(f"可用预算 {settings.format_money(game.player.funds)}", True, settings.YELLOW)
        surface.blit(money, (self.rect.right - 28 - money.get_width(), self.rect.y + 20))
        pygame.draw.line(
            surface,
            settings.PANEL_BORDER,
            (self.rect.x + 24, self.rect.y + 78),
            (self.rect.right - 24, self.rect.y + 78),
        )

        # 加固线表头
        grouped = game.upgrade_tree.by_track()
        for column, track in enumerate(game.upgrade_tree.tracks):
            x = self.rect.x + PAD_X + column * (CARD_W + COL_GAP)
            color = self._track_color(track)
            name_font = draw_utils.get_font(14, True)
            name_image = name_font.render(track.name, True, color)
            surface.blit(name_image, (x, self.rect.y + 90))
            tagline_font = draw_utils.get_font(10)
            surface.blit(
                tagline_font.render(track.tagline, True, settings.TEXT_FAINT),
                (x + name_image.get_width() + 8, self.rect.y + 94),
            )
            upgrades_in_track = grouped.get(track.track_id, [])
            owned_count = len(
                [
                    upgrade
                    for upgrade in upgrades_in_track
                    if upgrade.upgrade_id in game.player.upgrades
                ]
            )
            count_font = draw_utils.get_font(10, True)
            count_image = count_font.render(
                f"已启用 {owned_count}/{len(upgrades_in_track)}", True, settings.TEXT_FAINT
            )
            surface.blit(
                count_image,
                (x + CARD_W - count_image.get_width(), self.rect.y + 93),
            )
            pygame.draw.line(
                surface,
                color,
                (x, self.rect.y + 114),
                (x + CARD_W, self.rect.y + 114),
                2,
            )

        # 卡片
        for card, upgrade in self._cards:
            self._draw_card(surface, game, card, upgrade)

        footer = draw_utils.get_font(10)
        surface.blit(
            footer.render(
                "专精互斥：情报深挖 / 快速清场 / 保业务，三条线只能选一条走到底；选择后本局内不可更改。",
                True,
                settings.TEXT_FAINT,
            ),
            (self.rect.x + 28, self.rect.bottom - 44),
        )

        mouse_pos = pygame.mouse.get_pos()
        for button, upgrade_id in self.buy_buttons:
            if upgrade_id in game.player.upgrades:
                continue
            button.draw(surface, mouse_pos)
            if not button.enabled and button.rect.collidepoint(mouse_pos) and button.tooltip_reason:
                draw_utils.draw_tooltip(surface, button.tooltip_reason, mouse_pos)
        self.close_button.draw(surface, mouse_pos)

    # ------------------------------------------------------------------
    def _draw_card(self, surface: pygame.Surface, game: "object", card: pygame.Rect, upgrade) -> None:
        track = next(
            (item for item in game.upgrade_tree.tracks if item.track_id == upgrade.track), None
        )
        color = self._track_color(track) if track is not None else settings.ACCENT
        state, reason = self._card_state(game, upgrade)

        border = settings.PANEL_BORDER
        if state == "owned":
            border = color
        elif state == "excluded":
            border = (64, 40, 44)
        pygame.draw.rect(surface, settings.PANEL_BG_ALT, card, border_radius=8)
        pygame.draw.rect(surface, border, card, 1, border_radius=8)
        pygame.draw.rect(surface, color if state != "excluded" else (70, 48, 52), (card.x, card.y + 10, 3, card.height - 20), border_radius=2)

        name_font = draw_utils.get_font(13, True)
        tier_font = draw_utils.get_font(9, True)
        tier_color = settings.TEXT_FAINT if state in ("excluded", "locked") else color
        surface.blit(tier_font.render(f"L{upgrade.tier}", True, tier_color), (card.x + 12, card.y + 12))
        title = draw_utils.ellipsize(upgrade.name, name_font, card.width - 96)
        surface.blit(name_font.render(title, True, settings.TEXT), (card.x + 32, card.y + 9))

        tiny = draw_utils.get_font(10, True)
        if state == "owned":
            draw_utils.draw_tag(surface, "已启用", tiny, (card.right - 64, card.y + 8), settings.GREEN, filled=True)
        else:
            cost_color = settings.YELLOW if state != "unaffordable" else settings.TEXT_FAINT
            draw_utils.draw_tag(surface, f"¥{upgrade.cost}", tiny, (card.right - 62, card.y + 8), cost_color)

        desc_color = settings.TEXT_FAINT if state in ("excluded", "locked") else settings.TEXT_DIM
        draw_utils.draw_text_block(
            surface,
            upgrade.description,
            draw_utils.get_font(11),
            desc_color,
            (card.x + 12, card.y + 32),
            card.width - 24,
            line_height=16,
            max_lines=2,
        )

        state_font = draw_utils.get_font(10)
        state_text = reason
        pygame.draw.line(
            surface,
            (28, 40, 55),
            (card.x + 12, card.bottom - 38),
            (card.right - 12, card.bottom - 38),
        )
        state_color = {
            "owned": settings.GREEN,
            "excluded": settings.RED,
            "locked": settings.TEXT_DIM,
            "unaffordable": settings.ORANGE,
            "available": settings.TEXT_FAINT,
        }.get(state, settings.TEXT_DIM)
        surface.blit(
            state_font.render(
                draw_utils.ellipsize(state_text, state_font, card.width - 118), True, state_color
            ),
            (card.x + 12, card.bottom - 27),
        )

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event, game: "object") -> bool:
        if not self.visible:
            return False
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.close()
            return True
        if self.close_button.handle_event(event):
            self.close()
            return True
        for button, upgrade_id in self.buy_buttons:
            if button.handle_event(event):
                ok, message = game.buy_upgrade(upgrade_id)
                if not ok:
                    game.push_message(message, settings.ORANGE)
                self._signature = None
                return True
        return event.type in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEWHEEL)

    def update(self, dt: float) -> None:
        self.close_button.update(dt)
        for button, _upgrade_id in self.buy_buttons:
            button.update(dt)
