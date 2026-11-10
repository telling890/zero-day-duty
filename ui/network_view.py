# -*- coding: utf-8 -*-
"""左侧网络拓扑视图：节点、连线、状态图例与选择。"""

from __future__ import annotations

import math

import pygame

import settings
from ui import draw_utils

NODE_WIDTH = 108
NODE_HEIGHT = 46


class NetworkView:
    """用邻接表绘制网络关系；点击节点即选中设备。"""

    def __init__(self, rect: tuple[int, int, int, int] | pygame.Rect) -> None:
        self.rect = pygame.Rect(rect)
        self.node_rects: dict[str, pygame.Rect] = {}
        self.hovered_id: str | None = None

    # ------------------------------------------------------------------
    def _layout(self, game: "object") -> pygame.Rect:
        content = pygame.Rect(
            self.rect.x + 12,
            self.rect.y + 40,
            self.rect.width - 24,
            self.rect.height - 48,
        )
        self.node_rects = {}
        for device in game.devices.values():
            x = content.x + int(device.pos[0] * (content.width - NODE_WIDTH))
            y = content.y + int(device.pos[1] * (content.height - NODE_HEIGHT))
            self.node_rects[device.device_id] = pygame.Rect(x, y, NODE_WIDTH, NODE_HEIGHT)
        return content

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        heading = "● 正常   ▲ 可疑   × 感染   ■ 隔离"
        draw_utils.draw_panel(surface, self.rect, "网络拓扑", header_right=heading)
        self._layout(game)

        # 先画连线，避免遮挡节点
        drawn: set[tuple[str, str]] = set()
        for device in game.devices.values():
            for neighbor_id in device.neighbors:
                if neighbor_id not in game.devices:
                    continue
                key = tuple(sorted((device.device_id, neighbor_id)))
                if key in drawn:
                    continue
                drawn.add(key)
                self._draw_link(surface, game, key[0], key[1])

        # 正在推进的攻击链：用流动虚线标出目标设备到当前活动设备的路径
        ticks = pygame.time.get_ticks()
        for event in game.events.active_events():
            start = self.node_rects.get(event.target_id)
            end = self.node_rects.get(event.active_device_id)
            if start is None or end is None or start == end:
                continue
            self._draw_attack_line(surface, start.center, end.center, ticks)

        # 再画节点
        for device in game.devices.values():
            node_rect = self.node_rects[device.device_id]
            self._draw_node(surface, game, device, node_rect)

        # 悬停提示
        if self.hovered_id and self.hovered_id in game.devices:
            device = game.devices[self.hovered_id]
            text = f"{device.name}｜{device.status_label}｜健康 {device.health}"
            if device.isolated:
                text += "｜已隔离"
            recent = next(
                (
                    entry
                    for entry in reversed(game.logs.entries)
                    if entry.source == device.name or device.device_id in entry.message
                ),
                None,
            )
            if recent is not None:
                text += f"\n最近日志：{recent.message}"
            draw_utils.draw_tooltip(surface, text, pygame.mouse.get_pos(), max_width=300)

    def _draw_link(self, surface: pygame.Surface, game: "object", id_a: str, id_b: str) -> None:
        rect_a = self.node_rects.get(id_a)
        rect_b = self.node_rects.get(id_b)
        if rect_a is None or rect_b is None:
            return
        device_a = game.devices[id_a]
        device_b = game.devices[id_b]
        if device_a.isolated or device_b.isolated:
            color = (86, 66, 110)
        elif "感染" in (device_a.status, device_b.status):
            color = (96, 48, 48)
        elif "可疑" in (device_a.status, device_b.status):
            color = (88, 78, 40)
        else:
            color = (40, 58, 78)
        pygame.draw.line(surface, color, rect_a.center, rect_b.center, 2)

    def _draw_attack_line(
        self,
        surface: pygame.Surface,
        start: tuple[int, int],
        end: tuple[int, int],
        ticks: int,
    ) -> None:
        """虚线随时间的偏移量流动，表现攻击链正在推进。"""
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        distance = max(1.0, math.hypot(dx, dy))
        ux, uy = dx / distance, dy / distance
        dash = 11
        gap = 8
        period = dash + gap
        offset = (ticks // 28) % period
        position = offset
        while position < distance:
            begin = position
            finish = min(distance, position + dash)
            p1 = (int(start[0] + ux * begin), int(start[1] + uy * begin))
            p2 = (int(start[0] + ux * finish), int(start[1] + uy * finish))
            pygame.draw.line(surface, (255, 92, 92), p1, p2, 2)
            position += period

    def _draw_node(self, surface: pygame.Surface, game: "object", device: "object", rect: pygame.Rect) -> None:
        status_color = settings.STATUS_COLORS.get(device.status, settings.TEXT_DIM)
        selected = device.device_id == game.selected_device_id
        hovered = device.device_id == self.hovered_id
        active = any(
            event.active_device_id == device.device_id for event in game.events.active_events()
        )

        fill = tuple(int(status_color[i] * 0.16 + settings.PANEL_BG_ALT[i] * 0.84) for i in range(3))
        border = status_color
        border_width = 1
        if selected:
            border, border_width = settings.YELLOW, 2
        elif hovered:
            border, border_width = settings.PANEL_BORDER_LIGHT, 2
            fill = tuple(min(255, channel + 8) for channel in fill)

        pygame.draw.rect(surface, fill, rect, border_radius=6)
        pygame.draw.rect(surface, border, rect, border_width, border_radius=6)
        if selected:
            pygame.draw.rect(surface, (70, 62, 30), rect.inflate(6, 6), 1, border_radius=8)
        if active:
            pulse = (math.sin(pygame.time.get_ticks() / 180.0) + 1.0) / 2.0
            glow = rect.inflate(int(8 + pulse * 8), int(8 + pulse * 8))
            pulse_color = (255, 90, 90) if device.status in ("感染", "可疑") else (240, 160, 60)
            pygame.draw.rect(surface, pulse_color, glow, 1, border_radius=10)

        id_font = draw_utils.get_font(12, True)
        tiny = draw_utils.get_font(settings.FONT_TINY)
        id_image = id_font.render(device.device_id, True, settings.TEXT)
        surface.blit(id_image, (rect.x + 8, rect.y + 5))
        glyph = settings.STATUS_GLYPHS.get(device.status, "?")
        glyph_image = tiny.render(glyph, True, status_color)
        surface.blit(glyph_image, (rect.right - 8 - glyph_image.get_width(), rect.y + 5))

        name_image = tiny.render(device.short_name, True, settings.TEXT_DIM)
        surface.blit(name_image, (rect.x + 8, rect.y + 26))
        status_image = tiny.render(device.status, True, status_color)
        surface.blit(status_image, (rect.right - 8 - status_image.get_width(), rect.y + 26))

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event, game: "object") -> bool:
        if event.type == pygame.MOUSEMOTION:
            self.hovered_id = None
            for device_id, rect in self.node_rects.items():
                if rect.collidepoint(event.pos):
                    self.hovered_id = device_id
                    break
            return False
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            for device_id, rect in self.node_rects.items():
                if rect.collidepoint(event.pos):
                    game.select_device(device_id)
                    try:
                        from systems.audio_manager import get_audio

                        get_audio().play("click")
                    except Exception:
                        pass
                    return True
            if self.rect.collidepoint(event.pos):
                game.clear_selection()
                return True
        return False
