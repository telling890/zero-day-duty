# -*- coding: utf-8 -*-
"""游戏结束结算界面。"""

from __future__ import annotations

import pygame

import settings
from systems.score_system import ScoreReport
from ui import draw_utils
from ui.button import Button

ENDING_COLORS = {
    "perfect": settings.GREEN,
    "costly": settings.YELLOW,
    "data_leak": settings.RED,
    "over_defense": settings.ORANGE,
    "security_breach": settings.RED,
    "ransomware": settings.RED,
}


class ResultScreen:
    def __init__(self) -> None:
        self.rect = pygame.Rect(72, 40, 1136, 640)
        self.buttons = {
            "restart": Button((self.rect.right - 420, self.rect.bottom - 64, 190, 44), "再值一班", style="primary"),
            "menu": Button((self.rect.right - 218, self.rect.bottom - 64, 190, 44), "返回主菜单"),
        }

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, report: ScoreReport, game: "object") -> None:
        overlay = draw_utils.dim_surface(surface.get_size(), 200)
        surface.blit(overlay, (0, 0))
        pygame.draw.rect(surface, settings.PANEL_BG, self.rect, border_radius=12)
        pygame.draw.rect(surface, settings.PANEL_BORDER_LIGHT, self.rect, 1, border_radius=12)

        color = ENDING_COLORS.get(report.ending_key, settings.ACCENT)
        tiny = draw_utils.get_font(11)
        header = tiny.render(
            f"值班结算 · {settings.clock_from_minutes(game.shift_minutes)} 结束 · 随机种子 {game.seed}",
            True,
            settings.TEXT_FAINT,
        )
        surface.blit(header, (self.rect.x + 40, self.rect.y + 22))

        title_font = draw_utils.get_font(32, True)
        surface.blit(title_font.render(report.ending_title, True, color), (self.rect.x + 40, self.rect.y + 50))
        draw_utils.draw_text_block(
            surface,
            report.ending_text,
            draw_utils.get_font(13),
            settings.TEXT_DIM,
            (self.rect.x + 40, self.rect.y + 100),
            self.rect.width - 80,
            line_height=20,
        )
        if report.news_headline:
            news_label = tiny.render("早间新闻", True, settings.ORANGE)
            surface.blit(news_label, (self.rect.x + 40, self.rect.y + 158))
            headline = draw_utils.ellipsize(
                report.news_headline,
                draw_utils.get_font(12, True),
                self.rect.width - 170,
            )
            surface.blit(
                draw_utils.get_font(12, True).render(headline, True, settings.TEXT),
                (self.rect.x + 108, self.rect.y + 156),
            )

        # 分数区
        score_rect = pygame.Rect(self.rect.x + 40, self.rect.y + 186, 320, 220)
        pygame.draw.rect(surface, settings.PANEL_BG_ALT, score_rect, border_radius=10)
        pygame.draw.rect(surface, settings.PANEL_BORDER, score_rect, 1, border_radius=10)
        label = tiny.render("最终得分", True, settings.TEXT_DIM)
        surface.blit(label, (score_rect.x + 22, score_rect.y + 18))
        score_font = draw_utils.get_font(64, True)
        score_image = score_font.render(str(report.score), True, color)
        surface.blit(score_image, (score_rect.x + 22, score_rect.y + 48))
        max_image = tiny.render("/ 130", True, settings.TEXT_FAINT)
        surface.blit(max_image, (score_rect.x + 30 + score_image.get_width(), score_rect.y + 94))

        grade_center = (score_rect.right - 74, score_rect.y + 96)
        pygame.draw.circle(surface, (12, 20, 30), grade_center, 52)
        pygame.draw.circle(surface, color, grade_center, 52, 2)
        grade_font = draw_utils.get_font(46, True)
        grade_image = grade_font.render(report.grade, True, color)
        surface.blit(grade_image, (grade_center[0] - grade_image.get_width() // 2, grade_center[1] - grade_image.get_height() // 2 + 2))
        grade_label = tiny.render("等级", True, settings.TEXT_FAINT)
        surface.blit(
            grade_label,
            (grade_center[0] - grade_label.get_width() // 2, grade_center[1] + 58),
        )

        style_image = tiny.render(f"值班风格：{report.style}", True, settings.ACCENT)
        surface.blit(style_image, (score_rect.x + 22, score_rect.y + 150))
        draw_utils.draw_text_block(
            surface,
            report.style_comment,
            draw_utils.get_font(11),
            settings.TEXT_DIM,
            (score_rect.x + 22, score_rect.y + 172),
            score_rect.width - 44,
            line_height=17,
        )

        # 统计表
        stats_rect = pygame.Rect(self.rect.x + 388, self.rect.y + 186, self.rect.width - 428, 300)
        pygame.draw.rect(surface, settings.PANEL_BG_ALT, stats_rect, border_radius=10)
        pygame.draw.rect(surface, settings.PANEL_BORDER, stats_rect, 1, border_radius=10)
        surface.blit(tiny.render("值班统计", True, settings.ACCENT), (stats_rect.x + 18, stats_rect.y + 12))
        label_font = draw_utils.get_font(12)
        value_font = draw_utils.get_font(13, True)
        column_width = (stats_rect.width - 36) // 2
        for index, (name, value) in enumerate(report.stats):
            row = index % 6
            column = index // 6
            x = stats_rect.x + 18 + column * column_width
            y = stats_rect.y + 44 + row * 40
            surface.blit(label_font.render(name, True, settings.TEXT_DIM), (x, y))
            surface.blit(value_font.render(str(value), True, settings.TEXT), (x + 132, y - 1))
            pygame.draw.line(
                surface,
                (28, 40, 55),
                (x, y + 27),
                (x + column_width - 20, y + 27),
            )

        # 成就标签
        if report.achievements:
            tiny_font = draw_utils.get_font(11, True)
            surface.blit(tiny_font.render("成就", True, settings.TEXT_FAINT), (self.rect.x + 40, self.rect.y + 516))
            x = self.rect.x + 84
            colors = (settings.YELLOW, settings.ACCENT, settings.GREEN, settings.PURPLE, settings.ORANGE)
            for index, name in enumerate(report.achievements):
                tag_rect = draw_utils.draw_tag(
                    surface,
                    name,
                    tiny_font,
                    (x, self.rect.y + 512),
                    colors[index % len(colors)],
                    border_only=True,
                )
                x = tag_rect.right + 8

        # 免责声明与按钮
        footnote = "本局所有数据均为虚构；随机种子固定时结果可复现。"
        surface.blit(tiny.render(footnote, True, settings.TEXT_FAINT), (self.rect.x + 40, self.rect.bottom - 54))
        mouse_pos = pygame.mouse.get_pos()
        for button in self.buttons.values():
            button.draw(surface, mouse_pos)

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event) -> str | None:
        for tag, button in self.buttons.items():
            if button.handle_event(event):
                return tag
        return None

    def update(self, dt: float) -> None:
        for button in self.buttons.values():
            button.update(dt)
