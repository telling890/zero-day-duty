# -*- coding: utf-8 -*-
"""界面绘制工具：字体缓存、面板、文本换行、标签与提示框。"""

from __future__ import annotations

import pygame

import settings

_FONT_PATH: str | None = None
FONT_FALLBACK = False
_font_cache: dict[tuple[int, bool], pygame.font.Font] = {}


def set_font_path(path: object | None) -> None:
    """设置中文字体路径；path 为 None 时使用 pygame 默认字体。"""
    global _FONT_PATH, FONT_FALLBACK
    _FONT_PATH = str(path) if path else None
    FONT_FALLBACK = _FONT_PATH is None
    _font_cache.clear()


def get_font(size: int, bold: bool = False) -> pygame.font.Font:
    key = (int(size), bool(bold))
    cached = _font_cache.get(key)
    if cached is not None:
        return cached
    font: pygame.font.Font
    if _FONT_PATH:
        try:
            font = pygame.font.Font(_FONT_PATH, int(size))
        except (OSError, pygame.error):
            font = pygame.font.Font(None, int(size))
    else:
        font = pygame.font.Font(None, int(size))
    try:
        font.set_bold(bool(bold))
    except pygame.error:
        pass
    _font_cache[key] = font
    return font


def draw_panel(
    surface: pygame.Surface,
    rect: pygame.Rect,
    title: str = "",
    *,
    header_right: str = "",
    title_color: tuple[int, int, int] = settings.ACCENT,
    bg: tuple[int, int, int] = settings.PANEL_BG,
    border: tuple[int, int, int] = settings.PANEL_BORDER,
) -> pygame.Rect:
    """绘制带标题的圆角面板，返回内容区矩形。"""
    pygame.draw.rect(surface, bg, rect, border_radius=8)
    pygame.draw.rect(surface, border, rect, 1, border_radius=8)
    header_h = 34 if title else 10
    if title:
        font = get_font(settings.FONT_BODY, True)
        image = font.render(title, True, title_color)
        surface.blit(image, (rect.x + 12, rect.y + 8))
        if header_right:
            small = get_font(settings.FONT_TINY)
            right_image = small.render(header_right, True, settings.TEXT_DIM)
            surface.blit(right_image, (rect.right - 12 - right_image.get_width(), rect.y + 11))
        pygame.draw.line(
            surface,
            border,
            (rect.x + 8, rect.y + 33),
            (rect.right - 8, rect.y + 33),
        )
    return pygame.Rect(
        rect.x + 12,
        rect.y + header_h + 6,
        rect.width - 24,
        rect.height - header_h - 12,
    )


def wrap_text(text: str, font: pygame.font.Font, max_width: int) -> list[str]:
    """按像素宽度换行；中文没有空格，因此逐字符切分。"""
    if not text:
        return [""]
    max_width = max(12, max_width)
    lines: list[str] = []
    for paragraph in str(text).split("\n"):
        if paragraph == "":
            lines.append("")
            continue
        current = ""
        for char in paragraph:
            trial = current + char
            if font.size(trial)[0] <= max_width or not current:
                current = trial
            else:
                lines.append(current)
                current = char
        if current:
            lines.append(current)
    return lines or [""]


def draw_text_block(
    surface: pygame.Surface,
    text: str,
    font: pygame.font.Font,
    color: tuple[int, int, int],
    pos: tuple[int, int],
    max_width: int,
    *,
    line_height: int | None = None,
    max_lines: int | None = None,
) -> int:
    """绘制自动换行文本，返回占用高度。"""
    lines = wrap_text(text, font, max_width)
    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
        if lines:
            lines[-1] = ellipsize(lines[-1] + "…", font, max_width)
    height = line_height or font.get_linesize()
    x, y = pos
    for index, line in enumerate(lines):
        image = font.render(line, True, color)
        surface.blit(image, (x, y + index * height))
    return height * len(lines)


def ellipsize(text: str, font: pygame.font.Font, max_width: int) -> str:
    if font.size(text)[0] <= max_width:
        return text
    suffix = "…"
    while text and font.size(text + suffix)[0] > max_width:
        text = text[:-1]
    return text + suffix


def draw_tag(
    surface: pygame.Surface,
    text: str,
    font: pygame.font.Font,
    pos: tuple[int, int],
    color: tuple[int, int, int],
    *,
    filled: bool = False,
    border_only: bool = False,
) -> pygame.Rect:
    """绘制小标签，返回占用的矩形。"""
    width = font.size(text)[0] + 12
    height = font.get_height() + 4
    rect = pygame.Rect(pos[0], pos[1], width, height)
    if filled:
        pygame.draw.rect(surface, color, rect, border_radius=4)
        text_color = settings.BG
    elif border_only:
        pygame.draw.rect(surface, color, rect, 1, border_radius=4)
        text_color = color
    else:
        background = tuple(int(c * 0.22 + settings.PANEL_BG[i] * 0.78) for i, c in enumerate(color))
        pygame.draw.rect(surface, background, rect, border_radius=4)
        text_color = color
    image = font.render(text, True, text_color)
    surface.blit(
        image,
        (rect.x + (rect.width - image.get_width()) // 2, rect.y + (rect.height - image.get_height()) // 2),
    )
    return rect


def draw_bar(
    surface: pygame.Surface,
    rect: pygame.Rect,
    ratio: float,
    color: tuple[int, int, int],
    *,
    background: tuple[int, int, int] = (28, 40, 55),
) -> None:
    ratio = max(0.0, min(1.0, ratio))
    pygame.draw.rect(surface, background, rect, border_radius=3)
    if ratio > 0:
        fill = pygame.Rect(rect.x, rect.y, max(2, int(rect.width * ratio)), rect.height)
        pygame.draw.rect(surface, color, fill, border_radius=3)


def draw_tooltip(
    surface: pygame.Surface,
    text: str,
    pos: tuple[int, int],
    *,
    max_width: int = 300,
) -> None:
    """在鼠标附近绘制提示框，并确保不超出窗口。"""
    if not text:
        return
    font = get_font(settings.FONT_SMALL)
    lines = wrap_text(text, font, max_width)
    width = max(font.size(line)[0] for line in lines) + 20
    height = len(lines) * font.get_linesize() + 14
    x = min(pos[0] + 14, settings.SCREEN_WIDTH - width - 8)
    y = min(pos[1] + 18, settings.SCREEN_HEIGHT - height - 8)
    rect = pygame.Rect(x, y, width, height)
    pygame.draw.rect(surface, (12, 18, 27), rect, border_radius=6)
    pygame.draw.rect(surface, settings.PANEL_BORDER_LIGHT, rect, 1, border_radius=6)
    for index, line in enumerate(lines):
        image = font.render(line, True, settings.TEXT)
        surface.blit(image, (rect.x + 10, rect.y + 7 + index * font.get_linesize()))


def dim_surface(size: tuple[int, int], alpha: int = 170) -> pygame.Surface:
    overlay = pygame.Surface(size, pygame.SRCALPHA)
    overlay.fill((4, 7, 12, alpha))
    return overlay
