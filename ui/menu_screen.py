# -*- coding: utf-8 -*-
"""主菜单与值班手册（帮助浮层）。"""

from __future__ import annotations

import pygame

import settings
from ui import draw_utils
from ui.button import Button


class HelpOverlay:
    """可复用的帮助浮层，菜单和游戏内都能打开。"""

    LINES = (
        ("值班目标", True),
        ("在 22:00 → 08:00 的实时夜班里处理随机事件，同时避免误封与业务中断。", False),
        ("", False),
        ("值班流程", True),
        ("① 时间自动流逝，告警会随机出现    ② 查看拓扑、日志和设备状态", False),
        ("③ 调查告警、控制并清除威胁    ④ 行动点每 30 游戏分钟恢复 1 点", False),
        ("⑤ 整点结算服务收入与 SLA    ⑥ 03:00 后仍可能爆发新事件", False),
        ("", False),
        ("核心规则", True),
        ("· 安全度降到 0，或数据完整度低于 20 → 失败", False),
        ("· 服务可用性连续 3 小时低于 40 → 过度防御，业务崩溃", False),
        ("· 告警颜色不代表结论：平台会误报，误报也需要调查确认", False),
        ("· 隔离/关停只是“控制”；还要在设备上清除威胁，最后恢复业务", False),
        ("· 服务中断会减少收入并触发 SLA 违约，左下角可看业务状态", False),
        ("· 调查后会预测攻击下一跳；提前隔离下一跳可拖住攻击", False),
        ("· 资金和行动点有限，执行操作前先看消耗", False),
        ("", False),
        ("操作提示", True),
        ("· 点击拓扑节点选择设备；点击右侧告警查看详情；点空白返回总览", False),
        ("· 告警等级在调查前显示为“待评估”，先调查再处置更稳", False),
        ("· 操作面板只显示当前目标可用的操作，灰色按钮悬停可看原因", False),
        ("· 连续彻底清除事件会累积连击，连击奖励额外行动点", False),
        ("· 日志终端支持分类过滤和关键词搜索（英文/数字最稳定）", False),
        ("· 底部“时间流速”切换 ×1/×2；Esc 或空格暂停", False),
        ("· F1 = 手册   U = 安全加固   F5 = 保存   F9 = 读取   M = 音效", False),
        ("", False),
        ("免责声明", True),
        ("本游戏为课程演示，所有 IP、账号、域名与服务器均为虚构数据；", False),
        ("不扫描网络、不连接服务器、不执行系统命令、不包含恶意代码。", False),
    )

    def __init__(self) -> None:
        self.visible = False
        self.rect = pygame.Rect(210, 36, 860, 648)
        self.close_button = Button(
            (self.rect.right - 140, self.rect.bottom - 56, 116, 38),
            "关闭手册",
            style="primary",
        )

    def show(self) -> None:
        self.visible = True

    def hide(self) -> None:
        self.visible = False

    def toggle(self) -> None:
        self.visible = not self.visible

    def draw(self, surface: pygame.Surface) -> None:
        if not self.visible:
            return
        overlay = draw_utils.dim_surface(surface.get_size(), 190)
        surface.blit(overlay, (0, 0))
        pygame.draw.rect(surface, settings.PANEL_BG, self.rect, border_radius=10)
        pygame.draw.rect(surface, settings.ACCENT_DARK, self.rect, 1, border_radius=10)
        title_font = draw_utils.get_font(22, True)
        surface.blit(title_font.render("值班手册", True, settings.ACCENT), (self.rect.x + 26, self.rect.y + 18))
        pygame.draw.line(
            surface,
            settings.PANEL_BORDER,
            (self.rect.x + 24, self.rect.y + 56),
            (self.rect.right - 24, self.rect.y + 56),
        )
        heading_font = draw_utils.get_font(14, True)
        body_font = draw_utils.get_font(13)
        y = self.rect.y + 70
        for text, is_heading in self.LINES:
            if not text:
                y += 6
                continue
            font = heading_font if is_heading else body_font
            color = settings.ACCENT if is_heading else settings.TEXT_DIM
            surface.blit(font.render(text, True, color), (self.rect.x + 30, y))
            y += 21 if is_heading else 19
        self.close_button.draw(surface, pygame.mouse.get_pos())

    def handle_event(self, event: pygame.event.Event) -> bool:
        if not self.visible:
            return False
        if self.close_button.handle_event(event):
            self.hide()
            return True
        if event.type == pygame.KEYDOWN and event.key in (pygame.K_ESCAPE, pygame.K_F1):
            self.hide()
            return True
        # 浮层打开时吞掉其他输入，避免误触底层界面
        return event.type in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEWHEEL)

    def update(self, dt: float) -> None:
        self.close_button.update(dt)


class MenuScreen:
    """主菜单：开始/继续、教程、排行榜、换种子与退出。"""

    def __init__(self) -> None:
        self.buttons: dict[str, Button] = {}
        width, height, gap = 250, 44, 14
        rows = (372, 430, 488)
        left_x, right_x = 378, 652
        specs = (
            ("start", "开始新值班", "primary", left_x, rows[0]),
            ("continue", "继续上次值班", "default", left_x, rows[1]),
            ("tutorial", "新手教程 / 值班手册", "default", left_x, rows[2]),
            ("history", "历史排行榜", "ghost", right_x, rows[0]),
            ("seed", "更换随机种子", "ghost", right_x, rows[1]),
            ("quit", "退出游戏", "ghost", right_x, rows[2]),
        )
        for tag, text, style, x, y in specs:
            self.buttons[tag] = Button(
                (x, y, width, height),
                text,
                style=style,
                enabled=False if tag == "continue" else True,
                tooltip_reason="还没有存档" if tag == "continue" else "",
            )

    def draw(self, surface: pygame.Surface, game: "object") -> None:
        has_save = bool(game.save_manager.has_save())
        continue_button = self.buttons["continue"]
        continue_button.set_state(
            enabled=has_save,
            tooltip_reason="" if has_save else "还没有存档，先开始一局并在暂停菜单保存",
        )
        continue_button.subtitle = "" if has_save else "暂无存档"

        title_font = draw_utils.get_font(62, True)
        title = title_font.render("零日值班", True, settings.TEXT)
        surface.blit(title, (settings.SCREEN_WIDTH // 2 - title.get_width() // 2, 104))
        # 标题下方的强调线
        line_width = 220
        pygame.draw.line(
            surface,
            settings.ACCENT,
            (settings.SCREEN_WIDTH // 2 - line_width // 2, 186),
            (settings.SCREEN_WIDTH // 2 + line_width // 2, 186),
            2,
        )
        subtitle_font = draw_utils.get_font(22, True)
        subtitle = subtitle_font.render("网络安全防御模拟器", True, settings.ACCENT)
        surface.blit(subtitle, (settings.SCREEN_WIDTH // 2 - subtitle.get_width() // 2, 200))

        tiny = draw_utils.get_font(11)
        english = tiny.render("Z E R O - D A Y   N I G H T   S H I F T   ·   N E T W O R K   D E F E N S E   S I M", True, settings.TEXT_FAINT)
        surface.blit(english, (settings.SCREEN_WIDTH // 2 - english.get_width() // 2, 236))

        intro = (
            f"你是{settings.COMPANY_NAME}的夜班安全管理员。\n"
            "6 条攻击链、10 个小时、有限的预算：调查告警、隔离设备、加固系统，守住这家公司。\n"
            "所有数据均为虚构，本游戏不连接任何真实网络。"
        )
        draw_utils.draw_text_block(
            surface,
            intro,
            draw_utils.get_font(13),
            settings.TEXT_DIM,
            (settings.SCREEN_WIDTH // 2 - 330, 272),
            660,
            line_height=22,
        )

        mouse_pos = pygame.mouse.get_pos()
        for button in self.buttons.values():
            button.draw(surface, mouse_pos)

        seed_font = draw_utils.get_font(11)
        seed_text = f"本次随机种子：{game.seed}（同一随机种子可复现同一局）"
        seed_image = seed_font.render(seed_text, True, settings.TEXT_FAINT)
        surface.blit(seed_image, (settings.SCREEN_WIDTH // 2 - seed_image.get_width() // 2, 588))

        disclaimer = "课程演示项目 · 不使用真实恶意代码 · IP 均为文档保留地址"
        disclaimer_image = seed_font.render(disclaimer, True, settings.TEXT_FAINT)
        surface.blit(
            disclaimer_image,
            (settings.SCREEN_WIDTH // 2 - disclaimer_image.get_width() // 2, 658),
        )
        version_image = seed_font.render(settings.GAME_VERSION, True, settings.TEXT_FAINT)
        surface.blit(version_image, (settings.SCREEN_WIDTH - 22 - version_image.get_width(), 694))

    def handle_event(self, event: pygame.event.Event) -> str | None:
        for tag, button in self.buttons.items():
            if button.handle_event(event):
                return tag
        return None

    def update(self, dt: float) -> None:
        for button in self.buttons.values():
            button.update(dt)
