# -*- coding: utf-8 -*-
"""安全加固商店：用公司资金购买本局内永久生效的被动能力。"""

from __future__ import annotations

import pygame

import settings
from ui import draw_utils
from ui.button import Button


class UpgradeScreen:
    def __init__(self) -> None:
        self.visible = False
        self.rect = pygame.Rect(180, 82, 920, 556)
        self.buy_buttons: list[tuple[Button, str]] = []
        self.close_button = Button((self.rect.right - 172, self.rect.bottom - 58, 148, 38), "返回值班", style="primary")
        self._signature: tuple[object, ...] | None = None

    # ------------------------------------------------------------------
    def open(self) -> None:
        self.visible = True
        self._signature = None

    def close(self) -> None:
        self.visible = False

    # ------------------------------------------------------------------
    def _sync(self, game: "object") -> None:
        catalog = game.upgrade_catalog
        signature = (
            int(game.player.funds),
            tuple(upgrade.get("id") for upgrade in catalog),
            tuple(sorted(game.player.upgrades)),
        )
        if signature == self._signature:
            return
        self._signature = signature
        self.buy_buttons = []
        for index, upgrade in enumerate(catalog[:4]):
            row, column = divmod(index, 2)
            x = self.rect.x + 28 + column * 438
            y = self.rect.y + 112 + row * 188
            card = pygame.Rect(x, y, 418, 166)
            button = Button(
                (card.right - 142, card.bottom - 48, 122, 34),
                "购买",
                style="default",
                font_size=13,
                enabled=game.player.funds >= int(upgrade.get("cost", 0))
                and str(upgrade.get("id")) not in game.player.upgrades,
                tooltip_reason="资金不足" if game.player.funds < int(upgrade.get("cost", 0)) else "",
            )
            self.buy_buttons.append((button, str(upgrade.get("id"))))

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
        surface.blit(title_font.render("安全加固", True, settings.ACCENT), (self.rect.x + 28, self.rect.y + 20))
        small = draw_utils.get_font(12)
        surface.blit(
            small.render("用预算购买本局永久生效的能力。升级不消耗行动点。", True, settings.TEXT_DIM),
            (self.rect.x + 28, self.rect.y + 54),
        )
        money_font = draw_utils.get_font(18, True)
        money = money_font.render(f"可用预算 {settings.format_money(game.player.funds)}", True, settings.YELLOW)
        surface.blit(money, (self.rect.right - 28 - money.get_width(), self.rect.y + 22))
        pygame.draw.line(
            surface,
            settings.PANEL_BORDER,
            (self.rect.x + 24, self.rect.y + 84),
            (self.rect.right - 24, self.rect.y + 84),
        )

        colors = (settings.ACCENT, settings.GREEN, settings.ORANGE, settings.PURPLE)
        for index, upgrade in enumerate(game.upgrade_catalog[:4]):
            row, column = divmod(index, 2)
            x = self.rect.x + 28 + column * 438
            y = self.rect.y + 112 + row * 188
            card = pygame.Rect(x, y, 418, 166)
            owned = str(upgrade.get("id")) in game.player.upgrades
            color = colors[index % len(colors)]
            pygame.draw.rect(surface, settings.PANEL_BG_ALT, card, border_radius=8)
            pygame.draw.rect(surface, color if owned else settings.PANEL_BORDER, card, 1, border_radius=8)
            pygame.draw.rect(surface, color, (card.x, card.y + 12, 4, card.height - 24), border_radius=2)

            name_font = draw_utils.get_font(16, True)
            surface.blit(name_font.render(str(upgrade.get("name", "")), True, settings.TEXT), (card.x + 18, card.y + 14))
            cost = int(upgrade.get("cost", 0))
            if owned:
                draw_utils.draw_tag(surface, "已启用", small, (card.right - 88, card.y + 12), settings.GREEN, filled=True)
            else:
                draw_utils.draw_tag(surface, f"¥{cost}", small, (card.right - 88, card.y + 12), settings.YELLOW)
            draw_utils.draw_text_block(
                surface,
                str(upgrade.get("description", "")),
                draw_utils.get_font(12),
                settings.TEXT_DIM,
                (card.x + 18, card.y + 48),
                card.width - 36,
                line_height=19,
                max_lines=3,
            )
            if owned:
                owned_font = draw_utils.get_font(13, True)
                surface.blit(
                    owned_font.render("本局已生效", True, settings.GREEN),
                    (card.right - 142, card.bottom - 41),
                )

        mouse_pos = pygame.mouse.get_pos()
        for button, upgrade_id in self.buy_buttons:
            upgrade = next((item for item in game.upgrade_catalog if str(item.get("id")) == upgrade_id), None)
            if upgrade is None or upgrade_id in game.player.upgrades:
                continue
            button.draw(surface, mouse_pos)
        self.close_button.draw(surface, mouse_pos)

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
                result = game.buy_upgrade(upgrade_id)
                if not result[0]:
                    game.push_message(result[1], settings.ORANGE)
                self._signature = None
                return True
        return event.type in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEWHEEL)

    def update(self, dt: float) -> None:
        self.close_button.update(dt)
        for button, _upgrade_id in self.buy_buttons:
            button.update(dt)
