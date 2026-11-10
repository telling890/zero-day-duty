# -*- coding: utf-8 -*-
"""新手教程：12 页快速讲解 + 6 步完整处置演练。"""

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
        title="一分钟看懂",
        body="先记住五件事：你要在 10 个回合内清除 6 条攻击链，同时别把公司业务全部关停。",
        bullets=(
            "每回合 6 点行动点（AP），推进回合后恢复；攻击会在回合结束时升级。",
            "基本循环：调查 → 控制 → 清除 → 恢复，四步缺一不可。",
            "隔离/关停只是“控制”；清除根因后告警才会关闭。",
            "服务中断会减少收入、扣声誉；左下角服务面板会实时显示代价。",
            "调查后会提示攻击“下一跳”，提前隔离下一台设备可以拖住攻击。",
        ),
        target=None,
        card=(230, 110, 820, 400),
    ),
    TutorialPage(
        title="你的任务",
        body="你是云栖示例科技的夜班安全管理员。从 22:00 到早上 8:00，公司会遭遇 6 条攻击链。",
        bullets=(
            "目标：在 08:00 前清除全部攻击链，并尽量保持业务在线。",
            "共 10 个回合；每回合行动点 6 点，推进回合后重置。",
            "安全度归零、数据完整度低于 20、服务连续 3 回合低于 40，都会失败。",
        ),
        target=(0, 0, 1280, 56),
        card=(280, 104, 720, 330),
    ),
    TutorialPage(
        title="先认识界面",
        body="屏幕分成六块，所有操作都围绕它们展开。",
        bullets=(
            "顶部：回合/时间、威胁等级、安全度、资金、行动点、声誉、可用性、完整度。",
            "左侧：网络拓扑；点击节点查看设备，点击空白返回业务总览。",
            "右侧：安全告警；点击一条告警，操作面板才会出现对应操作。",
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
            "调查会揭示线索、提高置信度并缩小风险区间。",
            "确认是误报就收手；确认是威胁再选择控制方式。",
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
        title="业务服务与 SLA",
        body="左下角是业务服务面板：邮箱、官网、财务、数据库、备份、办公网。",
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
        title="预判攻击下一跳",
        body="调查后，设备详情会显示攻击下一台可能影响的设备。",
        bullets=(
            "提前隔离下一跳，可以阻止攻击进入下一阶段。",
            "但下一跳设备被隔离也会中断它承载的业务。",
            "把“预判”当成一次提前防守，而不是免费的安全。",
            "拓扑上的红/橙色流线表示正在推进的攻击链。",
        ),
        target=(8, 62, 600, 324),
        card=(620, 340, 620, 300),
    ),
    TutorialPage(
        title="威胁、连击与行动点",
        body="多线同时活跃时，威胁等级会上升，事件升级伤害也会放大。",
        bullets=(
            "威胁等级 = 1 + 活跃攻击链数量（上限 5）。",
            "连续彻底清除事件会累积 COMBO；每 2 连击奖励行动点。",
            "单纯控制不给连击；只控制不清除会在结算时扣分。",
            "行动点有限：先处理最可能造成重大损失的链。",
        ),
        target=(0, 0, 1280, 56),
        card=(280, 104, 720, 330),
    ),
    TutorialPage(
        title="加固、决策与存档",
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
        title="一个回合的完整顺序",
        body="推荐按下面的顺序处理每个回合，避免漏掉善后和业务恢复。",
        bullets=(
            "① 看日志与告警：先分清哪些是真实威胁。",
            "② 调查：确认告警性质，获得线索与下一跳。",
            "③ 控制：隔离/关停/封禁，阻止继续扩散。",
            "④ 清除：删除邮件、补丁或“清除威胁”。",
            "⑤ 恢复：解除隔离/启动服务，恢复业务。",
            "⑥ 加固/决策：有资金就升级，有决策就选择。",
            "⑦ 推进回合：攻击会升级，行动点重置。",
        ),
        target=None,
        card=(210, 120, 860, 420),
    ),
    TutorialPage(
        title="新手最容易犯的错",
        body="这些错误比“操作不够快”更常见，也更容易让一局崩掉。",
        bullets=(
            "只隔离不清除：事件停在“待清除”，结算会扣分。",
            "把全部服务都关掉：攻击没进来，业务先崩。",
            "不调查就乱处置：可能误封合作方、浪费行动点。",
            "忽略下一跳：攻击换一台设备后才发现没防守。",
            "把 AP 花光：下一回合事件升级时没有操作可用。",
        ),
        target=None,
        card=(210, 120, 860, 420),
    ),
    TutorialPage(
        title="准备实战",
        body="接下来是 6 步完整演练，只用一条钓鱼事件，把“调查→控制→清除→恢复→推进”走一遍。",
        bullets=(
            "教程中只有一条钓鱼事件，不会出现其他攻击。",
            "按提示点击即可；每一步都会高亮要点的按钮。",
            "完成后可以开始真正的 10 回合值班。",
        ),
        target=None,
        card=(300, 160, 680, 340),
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
                    style="purple",
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
        pygame.draw.rect(surface, (17, 13, 32), card, border_radius=12)
        pygame.draw.rect(surface, settings.TUTORIAL_DARK, card.inflate(4, 4), 1, border_radius=15)
        pygame.draw.rect(surface, settings.TUTORIAL, card, 2, border_radius=12)

        tiny = draw_utils.get_font(11)
        surface.blit(
            tiny.render(f"新手教程  {self.page + 1} / {len(PAGES)}", True, settings.TUTORIAL_LIGHT),
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
            color = settings.TUTORIAL_LIGHT if pulse else settings.TUTORIAL
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
    """实战演练：6 步提示、目标指针、进度条与完成面板。"""

    STEPS = (
        {
            "title": "选择告警",
            "instruction": "点击右侧告警列表中的第一条告警。",
            "why": "先选目标，操作面板才知道要处理哪条告警。",
            "stage": "选择",
            "color": settings.ACCENT,
        },
        {
            "title": "调查告警",
            "instruction": "点击操作面板里的“调查告警”，花 1 AP 确认威胁。",
            "why": "调查后才会出现建议操作、风险区间和下一跳。",
            "stage": "调查",
            "color": settings.ACCENT,
        },
        {
            "title": "控制攻击",
            "instruction": "点击“隔离设备”，阻止攻击继续扩散。",
            "why": "隔离只是控制，事件会变成“已控制·待清除”。",
            "stage": "控制",
            "color": settings.YELLOW,
        },
        {
            "title": "清除根因",
            "instruction": "点击“清除威胁”，关闭这条告警。",
            "why": "控制不等于解决；不清除会在结算时扣分。",
            "stage": "清除",
            "color": settings.GREEN,
        },
        {
            "title": "恢复业务",
            "instruction": "点击“解除隔离”，让 PC-01 重新上线。",
            "why": "已清除后解除隔离，事件不会复活；业务也会恢复。",
            "stage": "恢复",
            "color": settings.BLUE,
        },
        {
            "title": "推进回合",
            "instruction": "点击“推进回合 →”，进入下一小时。",
            "why": "每回合 AP 重置为 6；攻击会在回合结束时推进。",
            "stage": "推进",
            "color": settings.ORANGE,
        },
    )

    def __init__(self) -> None:
        self.completed = False
        self.step = 0
        self.card = pygame.Rect(8, 62, 600, 212)
        self.exit_button = Button(
            (self.card.right - 122, self.card.bottom - 34, 104, 26),
            "退出教程",
            style="ghost",
            font_size=11,
        )
        self.start_button = Button((380, 420, 220, 44), "开始正式值班", style="purple")
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
        elif self.step == 2 and any(event.contained for event in game.events.events):
            self._advance(game)
        elif self.step == 3 and any(event.eradicated for event in game.events.events):
            self._advance(game)
        elif self.step == 4 and any(
            event.eradicated
            and not game.devices.get(event.active_device_id, None).isolated
            for event in game.events.events
            if game.devices.get(event.active_device_id) is not None
        ):
            self._advance(game)
        elif self.step == 5 and game.turn >= 2:
            self._advance(game)

    def _advance(self, game: "object") -> None:
        self.step += 1
        if self.step >= len(self.STEPS):
            self.completed = True
            game.audio.play("upgrade")
            game.effects.flash(settings.GREEN, 50)
            game.effects.add_banner("教程完成", "你已经掌握完整处置循环", settings.GREEN)
            return
        game.audio.play("success")
        step = self.STEPS[self.step]
        game.push_message(f"{step['title']}：{step['instruction']}", settings.TUTORIAL_LIGHT)

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface, game: "object") -> None:
        if not game.tutorial_mode:
            return
        if self.completed:
            self._draw_complete(surface)
            return
        self._draw_pointer(surface, game)
        step = self.STEPS[self.step]
        color = settings.TUTORIAL
        pygame.draw.rect(surface, (15, 12, 30), self.card, border_radius=9)
        pygame.draw.rect(surface, settings.TUTORIAL_DARK, self.card.inflate(4, 4), 1, border_radius=12)
        pygame.draw.rect(surface, color, self.card, 2, border_radius=9)
        pygame.draw.rect(surface, color, (self.card.x, self.card.y + 12, 4, self.card.height - 24), border_radius=2)
        tiny = draw_utils.get_font(10)
        surface.blit(
            tiny.render(f"实战演练  {self.step + 1} / {len(self.STEPS)}", True, color),
            (self.card.x + 18, self.card.y + 10),
        )
        # 阶段标签
        stage = draw_utils.get_font(10, True).render(step["stage"], True, (10, 18, 27))
        stage_bg = pygame.Rect(self.card.right - 72, self.card.y + 8, 54, 18)
        pygame.draw.rect(surface, color, stage_bg, border_radius=4)
        surface.blit(stage, (stage_bg.centerx - stage.get_width() // 2, stage_bg.y + 2))

        surface.blit(
            draw_utils.get_font(16, True).render(step["title"], True, settings.TEXT),
            (self.card.x + 18, self.card.y + 27),
        )
        draw_utils.draw_text_block(
            surface,
            step["instruction"],
            draw_utils.get_font(12),
            settings.TEXT,
            (self.card.x + 18, self.card.y + 53),
            self.card.width - 148,
            line_height=18,
            max_lines=2,
        )
        draw_utils.draw_text_block(
            surface,
            "为什么：" + step["why"],
            draw_utils.get_font(10.5),
            settings.TEXT_DIM,
            (self.card.x + 18, self.card.y + 92),
            self.card.width - 38,
            line_height=16,
            max_lines=2,
        )
        # 六段进度
        bar_y = self.card.y + 139
        segment_w = 78
        for index in range(len(self.STEPS)):
            rect = pygame.Rect(self.card.x + 18 + index * (segment_w + 6), bar_y, segment_w, 7)
            if index < self.step:
                fill = settings.GREEN
            elif index == self.step:
                fill = color
            else:
                fill = (38, 52, 66)
            pygame.draw.rect(surface, fill, rect, border_radius=3)
        surface.blit(
            tiny.render("提示：先调查，再控制；清除后记得恢复业务。", True, (186, 172, 214)),
            (self.card.x + 18, self.card.y + 154),
        )
        self.exit_button.draw(surface, pygame.mouse.get_pos())

    def _draw_pointer(self, surface: pygame.Surface, game: "object") -> None:
        target = self._target_rect(game)
        if target is None:
            return
        pulse = (pygame.time.get_ticks() // 200) % 2
        color = settings.TUTORIAL_LIGHT if pulse else settings.TUTORIAL
        pygame.draw.rect(surface, color, target.inflate(4, 4), 2, border_radius=6)
        start = (self.card.right + 2, self.card.centery)
        end = (target.left - 4, target.centery)
        mid_x = (start[0] + end[0]) // 2
        pygame.draw.lines(surface, color, False, [start, (mid_x, start[1]), (mid_x, end[1]), end], 2)
        pygame.draw.circle(surface, color, end, 4)

    def _target_rect(self, game: "object") -> pygame.Rect | None:
        if self.step == 0:
            return pygame.Rect(624, 102, 640, 44)
        action = {
            1: "investigate",
            2: "isolate",
            3: "eradicate",
            4: "unisolate",
            5: "advance",
        }.get(self.step)
        if action == "advance":
            return game.bottom_buttons["advance"].rect
        if action:
            return self._action_button_rect(game, action)
        return None

    @staticmethod
    def _action_button_rect(game: "object", action_id: str) -> pygame.Rect | None:
        for button, option in game.action_panel.buttons:
            if option.action_id == action_id:
                return button.rect
        return None

    def _draw_complete(self, surface: pygame.Surface) -> None:
        overlay = draw_utils.dim_surface(surface.get_size(), 200)
        surface.blit(overlay, (0, 0))
        panel = pygame.Rect(300, 170, 680, 320)
        pygame.draw.rect(surface, settings.PANEL_BG, panel, border_radius=12)
        pygame.draw.rect(surface, settings.GREEN, panel, 1, border_radius=12)
        title = draw_utils.get_font(28, True).render("教程完成", True, settings.GREEN)
        surface.blit(title, (panel.centerx - title.get_width() // 2, panel.y + 28))
        body = (
            "你已经完成一次完整循环：\n"
            "调查 → 控制 → 清除 → 恢复 → 推进回合。\n\n"
            "正式值班中会有 6 条攻击链、随机事件顺序、误报、剧情决策和零日 BOSS。\n"
            "记住：隔离只是控制，清除根因才算解决，最后还要恢复业务。"
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
