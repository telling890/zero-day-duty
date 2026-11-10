# -*- coding: utf-8 -*-
"""设备详情面板：展示选中设备的关键属性与风险估计。"""

from __future__ import annotations

import pygame

import settings
from ui import draw_utils


class DevicePanel:
    def __init__(self, rect: tuple[int, int, int, int] | pygame.Rect) -> None:
        self.rect = pygame.Rect(rect)

    def draw(self, surface: pygame.Surface, game: "object") -> None:
        device = game.selected_device()
        alert = game.selected_alert
        title = f"设备详情 · {device.name}" if device else "值班简报"
        content = draw_utils.draw_panel(surface, self.rect, title, header_right="点击拓扑节点可切换")

        if device is None:
            small = draw_utils.get_font(settings.FONT_TINY)
            active = game.events.active_events()
            resolved = len([event for event in game.events.events if event.contained])
            pending = len([alert for alert in game.events.alerts if not alert.investigated and not alert.resolved])
            surface.blit(
                draw_utils.get_font(13, True).render(
                    "夜班目标：在 08:00 前阻止全部攻击链，并尽量保持业务在线。",
                    True,
                    settings.TEXT,
                ),
                (content.x, content.y + 2),
            )
            tags = (
                (f"威胁 {game.threat_level}/5", settings.RED if game.threat_level >= 4 else settings.ORANGE),
                (f"活跃攻击链 {len(active)}", settings.RED if active else settings.GREEN),
                (f"已阻断 {resolved}", settings.GREEN),
                (f"待调查 {pending}", settings.ACCENT),
            )
            x = content.x
            for text, color in tags:
                tag_rect = draw_utils.draw_tag(surface, text, small, (x, content.y + 26), color)
                x = tag_rect.right + 8

            timeline = pygame.Rect(content.x, content.y + 56, content.width, 18)
            segment_width = (timeline.width - 9 * 4) / 10
            for index in range(10):
                segment = pygame.Rect(
                    int(timeline.x + index * (segment_width + 4)),
                    timeline.y,
                    int(segment_width),
                    12,
                )
                if index + 1 < game.turn:
                    color = (50, 76, 90)
                elif index + 1 == game.turn:
                    color = settings.ACCENT
                else:
                    color = (30, 42, 56)
                pygame.draw.rect(surface, color, segment, border_radius=3)
                if index + 1 == game.turn:
                    pygame.draw.rect(surface, settings.WHITE, segment, 1, border_radius=3)
            surface.blit(
                small.render("22:00", True, settings.TEXT_FAINT),
                (content.x, content.y + 72),
            )
            end_text = small.render("08:00", True, settings.TEXT_FAINT)
            surface.blit(end_text, (content.right - end_text.get_width(), content.y + 72))
            surface.blit(
                small.render(
                    "提示：点击左侧节点查看设备，或点击右侧告警开始调查。",
                    True,
                    settings.TEXT_FAINT,
                ),
                (content.x, content.y + 92),
            )
            return

        # 第一行：状态标签 + 健康值
        status_color = settings.STATUS_COLORS.get(device.status, settings.TEXT_DIM)
        tag_rect = draw_utils.draw_tag(
            surface,
            f"{settings.STATUS_GLYPHS.get(device.status, '?')} {device.status_label}",
            draw_utils.get_font(settings.FONT_TINY, True),
            (content.x, content.y),
            status_color,
            filled=True,
        )
        small = draw_utils.get_font(settings.FONT_TINY)
        health_color = settings.GREEN if device.health > 70 else (settings.YELLOW if device.health > 40 else settings.RED)
        health_text = small.render(f"健康值 {device.health}", True, health_color)
        surface.blit(health_text, (tag_rect.right + 14, content.y + 3))
        bar_rect = pygame.Rect(tag_rect.right + 14 + health_text.get_width() + 10, content.y + 6, 120, 5)
        draw_utils.draw_bar(surface, bar_rect, device.health / 100, health_color)
        online_text = small.render("在线" if device.online else "离线", True, settings.GREEN if device.online else settings.TEXT_FAINT)
        surface.blit(online_text, (bar_rect.right + 12, content.y + 1))

        # 第二行：安全等级 / 重要度 / 补丁 / 备份
        row_two_y = content.y + 26
        text = (
            f"安全等级 {'★' * device.security_level}{'☆' * (5 - device.security_level)}    "
            f"重要度 {'★' * device.importance}{'☆' * (5 - device.importance)}"
        )
        image = small.render(text, True, settings.TEXT_DIM)
        surface.blit(image, (content.x, row_two_y))
        patch_color = settings.GREEN if device.patched else settings.RED
        patch_text = small.render(f"补丁：{'已安装' if device.patched else '缺失'}", True, patch_color)
        surface.blit(patch_text, (content.x + 300, row_two_y))
        backup_color = settings.GREEN if device.backups else settings.TEXT_FAINT
        backup_label = "有·已保护" if device.backup_protected else ("有" if device.backups else "无")
        backup_text = small.render(f"备份：{backup_label}", True, settings.PURPLE if device.backup_protected else backup_color)
        surface.blit(backup_text, (content.x + 395, row_two_y))
        vuln_text = small.render(f"漏洞：{len(device.vulnerabilities)} 个", True, settings.YELLOW if device.vulnerabilities else settings.TEXT_FAINT)
        surface.blit(vuln_text, (content.x + 500, row_two_y))

        # 第三行：IP / 类型 / 相邻节点
        neighbors = "、".join(device.neighbors) if device.neighbors else "无"
        line = f"IP {device.ip}   ·   {device.device_type}   ·   相邻：{neighbors}"
        line = draw_utils.ellipsize(line, small, content.width)
        surface.blit(small.render(line, True, settings.TEXT_FAINT), (content.x, content.y + 46))

        # 第四行：当前告警摘要与风险估计
        if alert is not None:
            self._draw_alert_summary(surface, game, alert, content)
        else:
            recent = self._recent_log(game, device)
            if recent is not None:
                text = f"最近日志：[{recent.clock}] {recent.message}"
                surface.blit(
                    small.render(draw_utils.ellipsize(text, small, content.width), True, settings.TEXT_FAINT),
                    (content.x, content.y + 68),
                )
            else:
                hint = small.render(
                    "提示：选择告警后可调查、删除邮件、重置密码或封禁来源。",
                    True,
                    settings.TEXT_FAINT,
                )
                surface.blit(hint, (content.x, content.y + 68))

    @staticmethod
    def _recent_log(game: "object", device: "object"):
        """设备最近一条相关日志，用于设备详情与悬停提示。"""
        for entry in reversed(game.logs.entries):
            if entry.source == device.name or device.device_id in entry.message:
                return entry
        return None

    def _draw_alert_summary(self, surface: pygame.Surface, game: "object", alert: "object", content: pygame.Rect) -> None:
        small = draw_utils.get_font(settings.FONT_TINY)
        y = content.y + 66
        title_text = draw_utils.ellipsize(f"当前告警：{alert.title}", small, content.width - 120)
        surface.blit(small.render(title_text, True, alert.level_color), (content.x, y))
        draw_utils.draw_tag(
            surface,
            alert.display_level,
            small,
            (content.x + content.width - 52, y - 2),
            alert.level_color,
            filled=alert.investigated and not alert.false_positive,
        )
        info = f"来源 {alert.source_ip or '—'}   账号 {alert.account or '—'}   {alert.status_text}"
        surface.blit(small.render(draw_utils.ellipsize(info, small, content.width), True, settings.TEXT_DIM), (content.x, y + 18))

        event = game.event_for_alert(alert)
        if event is not None:
            device = game.devices.get(event.active_device_id)
            low, high, confidence = game.risk.estimate(
                event, device, game.turn, game.confidence_bonus
            )
            threat = game.risk.threat_text(low, high)
            risk_line = f"风险估计：{low} ~ {high}（{threat}，置信度 {confidence}%）"
            surface.blit(small.render(risk_line, True, settings.ORANGE), (content.x, y + 36))
            stage_line = f"已掌握线索 {event.revealed_clues}/{event.total_clues} · {event.progress_text}"
            surface.blit(small.render(stage_line, True, settings.TEXT_FAINT), (content.x + 280, y + 36))
        else:
            surface.blit(small.render("该告警未关联到进行中的事件，建议先调查确认。", True, settings.TEXT_FAINT), (content.x, y + 36))
