# -*- coding: utf-8 -*-
"""底部日志终端：分类过滤、关键词搜索与滚动。"""

from __future__ import annotations

import pygame

import settings
from ui import draw_utils

CATEGORY_COLORS = {
    "邮件": settings.BLUE,
    "登录": settings.GREEN,
    "网络": settings.ACCENT,
    "告警": settings.RED,
    "操作": settings.YELLOW,
    "系统": settings.TEXT_DIM,
}


class LogPanel:
    """终端风格日志视图，最新日志在底部，自动滚动。"""

    CATEGORIES = ("全部", "邮件", "登录", "网络", "告警", "操作", "系统")

    def __init__(self, rect: tuple[int, int, int, int] | pygame.Rect) -> None:
        self.rect = pygame.Rect(rect)
        self.scroll = 0
        self.keyword = ""
        self.category = "全部"
        self.input_active = False
        self.chip_rects: list[tuple[pygame.Rect, str]] = []
        self.search_rect = pygame.Rect(self.rect.right - 258, self.rect.y + 6, 246, 23)
        self._cache_key: tuple[str, str, int, int] | None = None
        self._rows: list[tuple[str, tuple[int, int, int], list[str]]] = []
        self._total_height = 0
        self._max_scroll = 0

    # ------------------------------------------------------------------
    # 数据
    # ------------------------------------------------------------------
    def _entries(self, game: "object") -> list["object"]:
        return game.logs.search(self.keyword, self.category)

    def _build_rows(self, entries: list["object"], width: int) -> None:
        font = draw_utils.get_font(settings.FONT_TINY)
        rows: list[tuple[str, tuple[int, int, int], list[str]]] = []
        total = 0
        for entry in entries:
            text = f"[{entry.clock}] [{entry.category}] {entry.message}"
            if entry.source:
                text += f"  ({entry.source})"
            lines = draw_utils.wrap_text(text, font, width)
            rows.append((entry.category, CATEGORY_COLORS.get(entry.category, settings.TEXT_DIM), lines))
            total += len(lines) * 15 + 4
        self._rows = rows
        self._total_height = max(0, total - 4)

    # ------------------------------------------------------------------
    # 绘制
    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        entries = self._entries(game)
        cache_key = (self.keyword, self.category, len(entries), game.turn)
        view = pygame.Rect(
            self.rect.x + 12,
            self.rect.y + 66,
            self.rect.width - 24,
            self.rect.height - 74,
        )
        if cache_key != self._cache_key:
            self._build_rows(entries, view.width - 10)
            self._cache_key = cache_key

        count_text = f"{len(entries)} 条"
        draw_utils.draw_panel(surface, self.rect, "日志终端", header_right=count_text)

        # 搜索框
        active = self.input_active
        pygame.draw.rect(surface, (11, 17, 25), self.search_rect, border_radius=5)
        pygame.draw.rect(
            surface,
            settings.ACCENT if active else settings.PANEL_BORDER,
            self.search_rect,
            1,
            border_radius=5,
        )
        tiny = draw_utils.get_font(10)
        if self.keyword:
            shown = draw_utils.ellipsize(self.keyword, tiny, self.search_rect.width - 44)
            color = settings.TEXT
        else:
            shown = "搜索：设备/账号/IP/关键词"
            color = settings.TEXT_FAINT
        surface.blit(tiny.render(shown, True, color), (self.search_rect.x + 26, self.search_rect.y + 6))
        # 放大镜符号
        surface.blit(tiny.render("搜", True, settings.TEXT_DIM), (self.search_rect.x + 8, self.search_rect.y + 5))
        if active and (pygame.time.get_ticks() // 500) % 2 == 0:
            caret_x = self.search_rect.x + 28 + min(tiny.size(self.keyword)[0], self.search_rect.width - 48)
            pygame.draw.line(
                surface,
                settings.ACCENT,
                (caret_x, self.search_rect.y + 5),
                (caret_x, self.search_rect.bottom - 5),
            )

        # 分类标签
        self.chip_rects = []
        chip_font = draw_utils.get_font(10)
        x = self.rect.x + 12
        y = self.rect.y + 40
        for category in self.CATEGORIES:
            width = chip_font.size(category)[0] + 16
            chip = pygame.Rect(x, y, width, 20)
            selected = category == self.category
            fill = (0, 84, 102) if selected else (22, 32, 46)
            border = settings.ACCENT if selected else settings.PANEL_BORDER
            pygame.draw.rect(surface, fill, chip, border_radius=4)
            pygame.draw.rect(surface, border, chip, 1, border_radius=4)
            image = chip_font.render(category, True, settings.WHITE if selected else settings.TEXT_DIM)
            surface.blit(image, (chip.x + (chip.width - image.get_width()) // 2, chip.y + 3))
            self.chip_rects.append((chip, category))
            x += width + 6

        # 日志内容
        font = draw_utils.get_font(settings.FONT_TINY)
        if not entries:
            surface.blit(
                font.render("没有匹配的日志。清空搜索或切换分类试试。", True, settings.TEXT_DIM),
                (view.x, view.y + 6),
            )
            return

        self._max_scroll = max(0, self._total_height - view.height)
        self.scroll = max(0, min(self.scroll, self._max_scroll))
        start_y = view.y + max(0, view.height - self._total_height) + self.scroll
        # 内容比视口长时，scroll=0 表示对齐到底部
        if self._total_height > view.height:
            start_y = view.y + view.height - self._total_height + self.scroll

        surface.set_clip(view)
        y = start_y
        for _category, color, lines in self._rows:
            row_height = len(lines) * 15 + 4
            if y < view.y:
                y += row_height
                continue
            if y > view.bottom:
                break
            for index, line in enumerate(lines):
                image = font.render(line, True, color)
                surface.blit(image, (view.x, y + index * 15))
            y += row_height
        surface.set_clip(None)

        # 滚动条
        if self._total_height > view.height:
            track = pygame.Rect(self.rect.right - 8, view.y, 3, view.height)
            pygame.draw.rect(surface, (30, 42, 58), track, border_radius=2)
            ratio = view.height / self._total_height
            thumb_h = max(16, int(view.height * ratio))
            max_scroll = max(1, self._max_scroll)
            thumb_y = view.y + int((view.height - thumb_h) * self.scroll / max_scroll)
            pygame.draw.rect(surface, settings.ACCENT_DARK, (track.x, thumb_y, 3, thumb_h), border_radius=2)

    # ------------------------------------------------------------------
    # 事件
    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event, game: "object") -> bool:
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.search_rect.collidepoint(event.pos):
                self.input_active = True
                pygame.key.start_text_input()
                pygame.key.set_text_input_rect(self.search_rect)
                return True
            for chip, category in self.chip_rects:
                if chip.collidepoint(event.pos):
                    self.category = category
                    self.scroll = 0
                    self._deactivate_input()
                    return True
            # 点击其他区域时取消输入焦点，避免空格键被输入框“吃掉”
            self._deactivate_input()
            return False

        if event.type == pygame.MOUSEWHEEL:
            if self.rect.collidepoint(pygame.mouse.get_pos()):
                self.scroll += int(event.y) * 28
                return True
            return False

        if not self.input_active:
            return False

        if event.type == pygame.TEXTINPUT:
            if len(self.keyword) < 30:
                self.keyword += event.text
            self.scroll = 0
            return True
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_BACKSPACE:
                self.keyword = self.keyword[:-1]
                self.scroll = 0
                return True
            if event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                self._deactivate_input()
                return True
            if event.key == pygame.K_ESCAPE:
                if self.keyword:
                    self.keyword = ""
                else:
                    self._deactivate_input()
                return True
        return False

    def _deactivate_input(self) -> None:
        if self.input_active:
            self.input_active = False
            try:
                pygame.key.stop_text_input()
            except pygame.error:
                pass
