# -*- coding: utf-8 -*-
"""新手教程：分页讲解 + 一回合实战演练。"""

from __future__ import annotations

from dataclasses import dataclass

import pygame

import settings
from ui import draw_utils
from ui.button import Button


@dataclass(frozen=True)
class TutorialPage:
    title: str
    body: str
    bullets: tuple[str, ...]
    target: tuple[int, int, int, int] | None
    card: tuple[int, int, int, int]


PAGES: tuple[TutorialPage, ...] = (
    TutorialPage(
        title="你的任务",
        body="你是云栖示例科技的夜班安全管理员。从现在到早上 8 点，公司会遭遇 6 条攻击链。",
        bullets=(
            "目标：阻止事件造成重大损失，同时别把业务全部关停。",
            "每回合 = 1 小时，共 10 回合，行动点每回合重置。",
            "安全度归零、数据被偷光或业务崩溃都会失败。",
        ),
        target=(0, 0, 1280, 56),
        card=(280, 104, 720, 330),
    ),
    TutorialPage(
        title="先认识界面",
        body="屏幕分成六块，所有操作都围绕它们展开。",
        bullets=(
            "顶部：回合、威胁等级、安全度、资金、行动点、声誉、可用性、数据完整度。",
            "左侧：网络拓扑，点击节点查看设备。",
            "右侧：安全告警，点击一条告警开始调查。",
            "下方：日志终端、操作面板、消息/指标变化。",
        ),
        target=None,
        card=(240, 126, 800, 390),
    ),
    TutorialPage(
        title="告警不等于真相",
        body="告警等级在调查前显示为“待评估”。平台会误报，真实威胁也不会主动标红。",
        bullets=(
            "点击告警后，在操作面板花 1 AP 调查它。",
            "调查会揭示线索，并缩小风险估计范围。",
            "确认是误报就收手；确认是威胁再选处置方式。",
        ),
        target=(616, 62, 656, 236),
        card=(26, 326, 560, 300),
    ),
    TutorialPage(
        title="处置分为三段",
        body="控制、清除、恢复是三件事。隔离能阻止扩散，但不会自动清除根因。",
        bullets=(
            "控制：隔离、关停、封禁来源，先让攻击停下来。",
            "清除：删除邮件、重置密码、打补丁，或在设备上执行“清除威胁”。",
            "恢复：解除隔离、启动服务、从备份恢复，并确认业务可用。",
            "删除邮件/补丁这类“提前阻断”可以直接清除，不必再补一刀。",
        ),
        target=(616, 516, 656, 196),
        card=(26, 176, 560, 300),
    ),
    TutorialPage(
        title="每个操作都有业务代价",
        body="左下角现在是业务服务面板：邮箱、官网、财务、数据库、备份、办公网。",
        bullets=(
            "隔离和关停会让对应服务中断，收入按 SLA 减少。",
            "关键服务中断会持续扣声誉；连续低可用性会失败。",
            "补丁会进入维护窗口，服务短暂降级。",
            "先控制、再清除、最后恢复，才能把损失压到最低。",
        ),
        target=(8, 392, 600, 166),
        card=(620, 330, 620, 300),
    ),
    TutorialPage(
        title="攻击链与威胁等级",
        body="攻击只会沿着网络关系推进，拓扑上的红/橙色流线就是正在移动的攻击链。",
        bullets=(
            "拓扑节点显示正常、可疑、感染、隔离等状态。",
            "威胁等级随活跃攻击链上升，等级越高伤害越大。",
            "连续阻断会积累连击，连击奖励额外行动点。",
            "第 8 回合会出现零日 BOSS，提前留好行动点。",
        ),
        target=(8, 62, 600, 324),
        card=(620, 340, 620, 300),
    ),
    TutorialPage(
        title="成长、决策与结局",
        body="一局之内还有安全加固、剧情决策和多种结局。",
        bullets=(
            "按 U 打开安全加固，用资金购买本局永久能力。",
            "第 4/7 回合会弹出剧情决策，每个选项都有代价。",
            "F5/F9 存读档，F1 打开完整值班手册，M 开关音效。",
            "结算会给出得分、等级、统计、连击与成就。",
        ),
        target=(0, 564, 600, 148),
        card=(620, 300, 620, 310),
    ),
    TutorialPage(
        title="准备实战",
        body="接下来是一个 4 步演练：选择告警 → 调查 → 删除钓鱼邮件 → 推进回合。",
        bullets=(
            "教程中只有一条钓鱼事件，不会出现其他攻击。",
            "删除邮件会直接清除根因；隔离则只完成“控制”，还需要“清除威胁”。",
            "完成后可以开始真正的 10 回合值班。",
        ),
        target=None,
        card=(300, 170, 680, 330),
    ),
)


class TutorialScreen:
    """分页教程浮层。"""

    def __init__(self) -> None:
        self.visible = False
        self.page = 0
        self.buttons: list[tuple[Button, str]] = []

    def open(self) -> None:
        self.visible = True
        self.page = 0
        self._build_buttons()

    def close(self) -> None:
        self.visible = False

    def _build_buttons(self) -> None:
        card = pygame.Rect(PAGES[self.page].card)
        y = card.bottom - 52
        self.buttons = [
            (
                Button(
                    (card.x + 20, y, 100, 34),
                    "上一步",
                    style="ghost",
                    font_size=13,
                    enabled=self.page > 0,
                ),
                "prev",
            ),
            (
                Button((card.x + 132, y, 100, 34), "跳过", style="ghost", font_size=13),
                "skip",
            ),
            (
                Button(
                    (card.right - 174, y, 154, 34),
                    "进入实战演练" if self.page == len(PAGES) - 1 else "下一步",
                    style="primary",
                    font_size=13,
                ),
                "next",
            ),
        ]

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        if not self.visible:
            return
        page = PAGES[self.page]
        self._draw_spotlight(surface, page.target)
        card = pygame.Rect(page.card)
        shadow = card.inflate(12, 12)
        pygame.draw.rect(surface, (4, 8, 14), shadow, border_radius=16)
        pygame.draw.rect(surface, settings.PANEL_BG, card, border_radius=12)
        pygame.draw.rect(surface, settings.ACCENT_DARK, card, 1, border_radius=12)

        tiny = draw_utils.get_font(11)
        surface.blit(
            tiny.render(f"新手教程  {self.page + 1} / {len(PAGES)}", True, settings.ACCENT),
            (card.x + 24, card.y + 18),
        )
        title_font = draw_utils.get_font(24, True)
        surface.blit(title_font.render(page.title, True, settings.TEXT), (card.x + 24, card.y + 42))
        draw_utils.draw_text_block(
            surface,
            page.body,
            draw_utils.get_font(14),
            settings.TEXT_DIM,
            (card.x + 24, card.y + 84),
            card.width - 48,
            line_height=22,
            max_lines=3,
        )
        y = card.y + 150
        bullet_font = draw_utils.get_font(13)
        for bullet in page.bullets:
            y += draw_utils.draw_text_block(
                surface,
                f"· {bullet}",
                bullet_font,
                settings.TEXT,
                (card.x + 26, y),
                card.width - 52,
                line_height=20,
            ) + 5
        mouse = pygame.mouse.get_pos()
        for button, _action in self.buttons:
            button.draw(surface, mouse)

    def _draw_spotlight(
        self,
        surface: pygame.Surface,
        target: tuple[int, int, int, int] | None,
    ) -> None:
        overlay = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
        overlay.fill((3, 6, 11, 205))
        if target is not None:
            rect = pygame.Rect(target).clip(surface.get_rect())
            # 用四块暗色区域留出目标高亮区
            pieces = (
                pygame.Rect(0, 0, surface.get_width(), rect.top),
                pygame.Rect(0, rect.bottom, surface.get_width(), surface.get_height() - rect.bottom),
                pygame.Rect(0, rect.top, rect.left, rect.height),
                pygame.Rect(rect.right, rect.top, surface.get_width() - rect.right, rect.height),
            )
            for piece in pieces:
                if piece.width > 0 and piece.height > 0:
                    overlay.fill((3, 6, 11, 0), piece)
        surface.blit(overlay, (0, 0))
        if target is not None:
            rect = pygame.Rect(target).clip(surface.get_rect())
            pulse = (pygame.time.get_ticks() // 220) % 2
            color = settings.YELLOW if pulse else settings.ACCENT
            pygame.draw.rect(surface, color, rect.inflate(4, 4), 2, border_radius=6)

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event, game: "object") -> str | None:
        if not self.visible:
            return None
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.close()
            return "close"
        for button, action in self.buttons:
            if not button.handle_event(event):
                continue
            if action == "prev":
                if self.page > 0:
                    self.page -= 1
                    self._build_buttons()
                return None
            if action == "skip":
                self.close()
                return "close"
            if action == "next":
                if self.page < len(PAGES) - 1:
                    self.page += 1
                    self._build_buttons()
                    return None
                self.close()
                return "practice"
        return event.type in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEWHEEL)

    def update(self, dt: float) -> None:
        for button, _action in self.buttons:
            button.update(dt)


class TutorialGuide:
    """实战演练的步骤提示与完成面板。"""

    STEP_TEXT = (
        "第 1 步：点击右侧第一条告警。",
        "第 2 步：在操作面板点击“调查告警”。",
        "第 3 步：点击“删除可疑邮件”；如果已隔离，则点击“清除威胁”。",
        "第 4 步：点击“推进回合 →”，进入下一个小时。",
    )

    def __init__(self) -> None:
        self.completed = False
        self.step = 0
        self.card = pygame.Rect(8, 392, 600, 166)
        self.exit_button = Button((self.card.right - 118, self.card.bottom - 36, 100, 26), "退出教程", style="ghost", font_size=11)
        self.start_button = Button((380, 420, 220, 44), "开始正式值班", style="primary")
        self.menu_button = Button((620, 420, 200, 44), "返回主菜单", style="ghost")

    def reset(self) -> None:
        self.completed = False
        self.step = 0

    # ------------------------------------------------------------------
    def update_step(self, game: "object") -> None:
        if not game.tutorial_mode or self.completed:
            return
        if self.step == 0 and game.selected_alert is not None:
            self._advance(game)
        elif self.step == 1 and game.selected_alert is not None and game.selected_alert.investigated:
            self._advance(game)
        elif self.step == 2 and any(event.eradicated for event in game.events.events):
            self._advance(game)
        elif self.step == 3 and game.turn >= 2:
            self._advance(game)

    def _advance(self, game: "object") -> None:
        self.step += 1
        if self.step >= 4:
            self.completed = True
            game.audio.play("upgrade")
            game.effects.flash(settings.GREEN, 50)
            game.effects.add_banner("教程完成", "你已经掌握调查、处置、推进的循环", settings.GREEN)
            return
        game.audio.play("success")
        game.push_message(self.STEP_TEXT[self.step], settings.ACCENT)

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        if not game.tutorial_mode:
            return
        if self.completed:
            self._draw_complete(surface)
            return
        self._highlight_target(surface, game)
        pygame.draw.rect(surface, (10, 18, 27), self.card, border_radius=8)
        pygame.draw.rect(surface, settings.ORANGE, self.card, 1, border_radius=8)
        tiny = draw_utils.get_font(10)
        surface.blit(
            tiny.render(f"实战演练  {self.step + 1} / 4", True, settings.ORANGE),
            (self.card.x + 18, self.card.y + 12),
        )
        title_font = draw_utils.get_font(14, True)
        surface.blit(title_font.render("跟着提示完成第一回合", True, settings.TEXT), (self.card.x + 18, self.card.y + 32))
        draw_utils.draw_text_block(
            surface,
            self.STEP_TEXT[self.step] if self.step < 4 else "教程完成。",
            draw_utils.get_font(12),
            settings.TEXT,
            (self.card.x + 18, self.card.y + 60),
            self.card.width - 36,
            line_height=19,
        )
        surface.blit(
            tiny.render("提示：调查后才能删除邮件；按 Esc 可暂停，F1 打开完整手册。", True, settings.TEXT_FAINT),
            (self.card.x + 18, self.card.y + 91),
        )
        self.exit_button.draw(surface, pygame.mouse.get_pos())

    def _draw_complete(self, surface: pygame.Surface) -> None:
        overlay = draw_utils.dim_surface(surface.get_size(), 200)
        surface.blit(overlay, (0, 0))
        panel = pygame.Rect(300, 170, 680, 310)
        pygame.draw.rect(surface, settings.PANEL_BG, panel, border_radius=12)
        pygame.draw.rect(surface, settings.GREEN, panel, 1, border_radius=12)
        title = draw_utils.get_font(28, True).render("教程完成", True, settings.GREEN)
        surface.blit(title, (panel.centerx - title.get_width() // 2, panel.y + 28))
        body = (
            "你已经完成一次完整的处置循环：\n"
            "调查告警 → 确认威胁 → 删除钓鱼邮件 → 推进回合。\n\n"
            "正式值班中会有 6 条攻击链、随机事件顺序、误报、剧情决策和零日 BOSS。\n"
            "记住：先调查、再处置，别为了安全把业务全部关停。"
        )
        draw_utils.draw_text_block(
            surface,
            body,
            draw_utils.get_font(14),
            settings.TEXT_DIM,
            (panel.x + 34, panel.y + 82),
            panel.width - 68,
            line_height=24,
        )
        mouse = pygame.mouse.get_pos()
        self.start_button.draw(surface, mouse)
        self.menu_button.draw(surface, mouse)

    def _highlight_target(self, surface: pygame.Surface, game: "object") -> None:
        target = pygame.Rect(624, 102, 640, 44)
        if self.step == 1:
            target = self._action_button_rect(game, "investigate") or target
        elif self.step == 2:
            target = (
                self._action_button_rect(game, "delete_mail")
                or self._action_button_rect(game, "eradicate")
                or pygame.Rect(624, 580, 200, 50)
            )
        elif self.step == 3:
            target = game.bottom_buttons["advance"].rect
        pulse = (pygame.time.get_ticks() // 200) % 2
        color = settings.YELLOW if pulse else settings.ACCENT
        pygame.draw.rect(surface, color, target.inflate(4, 4), 2, border_radius=6)

    @staticmethod
    def _action_button_rect(game: "object", action_id: str) -> pygame.Rect | None:
        for button, option in game.action_panel.buttons:
            if option.action_id == action_id:
                return button.rect
        return None

    # ------------------------------------------------------------------
    def handle_event(self, event: pygame.event.Event, game: "object") -> bool:
        if not game.tutorial_mode:
            return False
        if self.completed:
            if self.start_button.handle_event(event):
                game.finish_tutorial(start=True)
                return True
            if self.menu_button.handle_event(event):
                game.finish_tutorial(start=False)
                return True
            return event.type in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEWHEEL)
        if self.exit_button.handle_event(event):
            game.finish_tutorial(start=False)
            return True
        return False

    def update(self, dt: float) -> None:
        self.exit_button.update(dt)
        self.start_button.update(dt)
        self.menu_button.update(dt)
