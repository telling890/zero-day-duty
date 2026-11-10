# -*- coding: utf-8 -*-
"""游戏主控制器：状态机、回合流程、指标结算与界面调度。

界面绘制委托给 ui/ 下的各个面板，游戏规则委托给 systems/ 下的管理器，
本模块只负责“把它们连起来”，避免逻辑与绘制混在一起。
"""

from __future__ import annotations

import random
from collections import deque
from enum import Enum
from typing import Any

import pygame

import settings
from models.device import Device, validate_device_configs
from models.player_state import METRIC_LABELS, MetricKey, PlayerState
from systems.action_manager import ActionResult, ActionManager, ActionOption, Target
from systems.audio_manager import get_audio
from systems.event_manager import EventManager
from systems.log_system import LogSystem
from systems.risk_engine import RiskEngine
from systems.save_manager import SaveManager
from systems.score_system import ScoreReport, ScoreSystem
from systems.service_manager import ServiceManager
from ui import draw_utils
from ui.action_panel import ActionPanel
from ui.alert_panel import AlertPanel
from ui.briefing_screen import BriefingScreen
from ui.button import Button
from ui.dashboard import Dashboard
from ui.decision_screen import DecisionScreen
from ui.device_panel import DevicePanel
from ui.effects import EffectsManager
from ui.history_screen import HistoryScreen
from ui.log_panel import LogPanel
from ui.menu_screen import HelpOverlay, MenuScreen
from ui.network_view import NetworkView
from ui.result_screen import ResultScreen
from ui.tutorial_screen import TutorialGuide, TutorialScreen
from ui.upgrade_screen import UpgradeScreen


class GameState(str, Enum):
    MENU = "menu"
    PLAYING = "playing"
    PAUSED = "paused"
    RESULT = "result"


class Game:
    def __init__(
        self,
        screen: pygame.Surface,
        seed: int | None = None,
        save_path: object | None = None,
        history_path: object | None = None,
    ) -> None:
        self.screen = screen
        self.seed = int(seed) if seed is not None else random.randint(1000, 9999)
        self.clock = pygame.time.Clock()
        self.running = True
        self.state = GameState.MENU

        # ------------------------------------------------------------------
        # 数据加载：放在构造阶段，数据损坏时能立刻给出明确错误
        # ------------------------------------------------------------------
        device_payload = settings.load_json(settings.DEVICES_FILE)
        if not isinstance(device_payload, dict):
            raise settings.DataError("devices.json 的根节点必须是 JSON 对象")
        self._device_configs = validate_device_configs(device_payload.get("devices"))
        self._event_payload = EventManager.load_payload(settings.EVENTS_FILE)
        service_payload = settings.load_json(settings.SERVICES_FILE)
        if not isinstance(service_payload, dict):
            raise settings.DataError("services.json 的根节点必须是 JSON 对象")
        self.services = ServiceManager(service_payload)
        upgrade_payload = settings.load_json(settings.UPGRADES_FILE)
        upgrades = upgrade_payload.get("upgrades", []) if isinstance(upgrade_payload, dict) else []
        if not isinstance(upgrades, list):
            raise settings.DataError("upgrades.json 中的 upgrades 必须是列表")
        self.upgrade_catalog: list[dict[str, Any]] = [
            item for item in upgrades if isinstance(item, dict) and item.get("id")
        ]
        decision_payload = settings.load_json(settings.DECISIONS_FILE)
        decisions = decision_payload.get("decisions", []) if isinstance(decision_payload, dict) else []
        if not isinstance(decisions, list):
            raise settings.DataError("decisions.json 中的 decisions 必须是列表")
        self.decisions: list[dict[str, Any]] = [
            item for item in decisions if isinstance(item, dict) and item.get("id")
        ]

        # ------------------------------------------------------------------
        # 界面组件
        # ------------------------------------------------------------------
        self.dashboard = Dashboard()
        self.network_view = NetworkView(settings.LAYOUT["network"])
        self.device_panel = DevicePanel(settings.LAYOUT["device"])
        self.alert_panel = AlertPanel(settings.LAYOUT["alerts"])
        self.log_panel = LogPanel(settings.LAYOUT["log"])
        self.action_panel = ActionPanel(settings.LAYOUT["actions"])
        self.menu = MenuScreen()
        self.help = HelpOverlay()
        self.result_screen = ResultScreen()
        self.shop = UpgradeScreen()
        self.history_screen = HistoryScreen()
        self.decision_screen = DecisionScreen()
        self.tutorial_screen = TutorialScreen()
        self.tutorial_guide = TutorialGuide()
        self.briefing = BriefingScreen()
        self.effects = EffectsManager()
        self.audio = get_audio()

        self.bottom_buttons = {
            "advance": Button(
                (406, 618, 186, 40),
                "推进回合 →",
                style="primary",
                font_size=14,
                tag="advance",
            ),
            "pause": Button(
                (406, 666, 186, 30),
                "暂停（Esc）",
                style="ghost",
                font_size=12,
                tag="pause",
            ),
        }
        self.pause_buttons = {
            "resume": Button((420, 270, 440, 40), "继续值班", style="primary"),
            "save": Button((420, 318, 440, 40), "保存进度（F5）"),
            "load": Button((420, 366, 440, 40), "读取进度（F9）"),
            "shop": Button((420, 414, 440, 40), "安全加固（U）"),
            "restart": Button((420, 462, 440, 40), "重新开始本局"),
            "menu": Button((420, 510, 440, 40), "返回主菜单", style="ghost"),
        }

        # ------------------------------------------------------------------
        # 游戏数据（new_game 时重置）
        # ------------------------------------------------------------------
        self.rng = random.Random(self.seed)
        self.player = PlayerState()
        self.devices: dict[str, Device] = {
            config["id"]: Device.from_config(config) for config in self._device_configs
        }
        self.logs = LogSystem()
        self.events = EventManager(self._event_payload, self.rng, self.logs)
        self.risk = RiskEngine()
        self.actions = ActionManager()
        self.score_system = ScoreSystem()
        self.save_manager = SaveManager(save_path=save_path, history_path=history_path)

        self.turn = 0
        self.selected_device_id: str | None = None
        self.selected_alert: Any = None
        self.messages: deque[dict[str, Any]] = deque(maxlen=120)
        self.data_leak = False
        self.ransomware_failed = False
        self.security_breach = False
        self.low_availability_turns = 0
        self.combo = 0
        self.best_combo = 0
        self.seen_decisions: set[str] = set()
        self.tutorial_mode = False
        self.report: ScoreReport | None = None

        self.background = self._build_background()
        self.logs.add(0, settings.clock_text(0), "系统", "监控中心启动，等待值班员开始游戏。")

    # ==================================================================
    # 初始化与背景
    # ==================================================================
    def _build_background(self) -> pygame.Surface:
        surface = pygame.Surface(settings.SCREEN_SIZE)
        surface.fill(settings.BG)
        for x in range(0, settings.SCREEN_WIDTH, 40):
            pygame.draw.line(surface, settings.BG_GRID, (x, 0), (x, settings.SCREEN_HEIGHT))
        for y in range(0, settings.SCREEN_HEIGHT, 40):
            pygame.draw.line(surface, settings.BG_GRID, (0, y), (settings.SCREEN_WIDTH, y))
        glow = pygame.Surface(settings.SCREEN_SIZE, pygame.SRCALPHA)
        pygame.draw.circle(glow, (0, 60, 80, 26), (640, 90), 420)
        surface.blit(glow, (0, 0))
        return surface

    def new_game(self, tutorial: bool = False, briefing: bool = False) -> None:
        self.rng = random.Random(self.seed)
        self.player = PlayerState()
        self.devices = {config["id"]: Device.from_config(config) for config in self._device_configs}
        self.services.views(self.devices)  # 提前校验服务引用的设备是否存在
        self.logs = LogSystem()
        self.tutorial_mode = tutorial
        self.events = EventManager(self._event_payload, self.rng, self.logs, tutorial=tutorial)
        self.turn = 0
        self.selected_device_id = None
        self.selected_alert = None
        self.messages.clear()
        self.data_leak = False
        self.ransomware_failed = False
        self.security_breach = False
        self.low_availability_turns = 0
        self.combo = 0
        self.best_combo = 0
        self.seen_decisions = set()
        self.report = None
        self.effects = EffectsManager()
        self.state = GameState.PLAYING
        self.shop.close()
        self.history_screen.close()
        self.decision_screen.close()
        self.tutorial_screen.close()
        self.tutorial_guide.reset()
        self.briefing.close()
        self.help.hide()
        try:
            pygame.key.stop_text_input()
        except pygame.error:
            pass

        self.log_panel.scroll = 0
        self.log_panel.keyword = ""
        self.log_panel.category = "全部"
        self.log_panel.input_active = False
        self.log_panel._cache_key = None
        self.alert_panel.scroll = 0
        self.action_panel._signature = None

        self.logs.add(
            0,
            settings.clock_text(0),
            "系统",
            f"值班开始：{settings.COMPANY_NAME}，随机种子 {self.seed}。",
        )
        self.audio.play_ambient()
        self.recompute_availability("开局网络状态")
        self.start_turn()
        self.push_message("提示：先看告警和日志，再决定隔离或删除邮件。", settings.ACCENT)
        self.push_message("主管·陈可：今晚客户在催交付，任何停服都要先报备。", settings.TEXT_DIM)
        self.push_message("安全平台：告警等级在调查前显示为“待评估”，先调查再处置更稳。", settings.TEXT_DIM)
        self.push_message("公关·林岚：如果媒体来问，先别擅自回应，把情况同步给我。", settings.PURPLE)
        self.push_message("IT 运维·阿哲：备份服务器在 BAK-01，别等数据库被加密才想起它。", settings.ORANGE)
        if briefing:
            self.briefing.open()

    # ==================================================================
    # 回合流程
    # ==================================================================
    def start_turn(self) -> None:
        self.turn += 1
        self.player.refresh_turn(self.turn)
        self.logs.add(
            self.turn,
            settings.clock_text(self.turn),
            "系统",
            f"第 {self.turn} 回合开始，行动点重置为 {self.player.action_points}。",
        )
        self.push_message(
            f"第 {self.turn} 回合开始（{settings.clock_text(self.turn)}），行动点已重置。",
            settings.ACCENT,
        )
        service_income = self.services.income(self.devices)
        self.adjust_metric(
            MetricKey.FUNDS,
            service_income,
            f"服务收入（SLA 结算，满额 ¥{settings.TURN_INCOME}）",
            push=False,
        )
        if service_income < settings.TURN_INCOME:
            lost = settings.TURN_INCOME - service_income
            self.logs.add(
                self.turn,
                settings.clock_text(self.turn),
                "系统",
                f"SLA 结算：部分服务降级/中断，本回合收入减少 ¥{lost}。",
            )
            self.push_message(
                f"SLA 结算：服务未满负荷，收入 -¥{lost}。业务状态见左下角值班简报。",
                settings.ORANGE,
            )
        self.adjust_metric(MetricKey.FUNDS, -settings.TURN_UPKEEP, "值班运维成本", push=False)
        self.audio.play("turn")
        if self.player.funds <= settings.FUNDS_WARN:
            self.push_message("资金偏低：后续操作的可用选项会受限，请谨慎花费。", settings.ORANGE)
        self.events.start_turn(self)
        self._maybe_trigger_decision()
        self.action_panel._signature = None
        self.log_panel._cache_key = None

    def _maybe_trigger_decision(self) -> None:
        if self.tutorial_mode:
            return
        if self.state != GameState.PLAYING:
            return
        for decision in self.decisions:
            decision_id = str(decision.get("id", ""))
            if not decision_id or decision_id in self.seen_decisions:
                continue
            try:
                turn = int(decision.get("turn", -1))
            except (TypeError, ValueError):
                continue
            if turn != self.turn:
                continue
            self.seen_decisions.add(decision_id)
            self.decision_screen.open(decision)
            self.audio.play("alert")
            self.push_message(f"紧急决策：{decision.get('title', '')}", settings.ORANGE)
            return

    def end_turn(self) -> None:
        if self.state != GameState.PLAYING:
            return
        self.events.advance_events(self)
        if self.state != GameState.PLAYING:
            return
        for device in self.devices.values():
            device.tick_maintenance()
        self.recompute_availability("回合结算：设备状态更新")

        outages = self.services.critical_outages(self.devices)
        if outages:
            names = "、".join(view.config.short_name for view in outages[:3])
            penalty = min(3, len(outages))
            self.adjust_metric(
                MetricKey.REPUTATION,
                -penalty,
                f"SLA 违约：{names}",
                push=False,
            )
            self.player.stats["sla_breaches"] = int(self.player.stats.get("sla_breaches", 0)) + 1
            self.logs.add(
                self.turn,
                settings.clock_text(self.turn),
                "系统",
                f"SLA 违约：{names} 中断，声誉 -{penalty}。",
            )
            self.push_message(
                f"SLA 违约：{names} 仍处于中断状态，声誉 -{penalty}。",
                settings.RED,
            )

        if self.player.availability <= settings.AVAILABILITY_FAIL:
            self.low_availability_turns += 1
            self.push_message(
                f"警告：服务可用性 {self.player.availability}% 低于 {settings.AVAILABILITY_FAIL}%"
                f"（连续 {self.low_availability_turns} 回合）。",
                settings.ORANGE,
            )
        else:
            self.low_availability_turns = 0

        if self.player.security_failed():
            self.finish("security")
            return
        if self.player.integrity_failed():
            self.finish("integrity")
            return
        if self.low_availability_turns >= settings.AVAILABILITY_FAIL_TURNS:
            self.finish("availability")
            return
        if self.turn >= settings.TOTAL_TURNS:
            self.finish("time")
            return
        self.start_turn()

    def finish_tutorial(self, start: bool) -> None:
        self.tutorial_guide.reset()
        self.tutorial_mode = False
        self.tutorial_screen.close()
        self.briefing.close()
        if start:
            self.new_game()
        else:
            self.audio.stop_ambient()
            self.state = GameState.MENU

    def finish(self, reason: str) -> None:
        self.state = GameState.RESULT
        self.briefing.close()
        self.audio.stop_ambient()
        summary = self.build_summary(reason)
        self.report = self.score_system.evaluate(summary)
        if not self.tutorial_mode:
            self.save_manager.append_history(self.report, summary, self.seed)
        self.audio.play("success" if self.report.ending_key == "perfect" else "fail")
        self.effects.flash(settings.GREEN if self.report.ending_key == "perfect" else settings.RED, 55)
        self.logs.add(
            self.turn,
            settings.clock_text(self.turn),
            "系统",
            f"值班结束，结局：{self.report.ending_title}，得分 {self.report.score}（{self.report.grade}）。",
        )
        self.selected_alert = None
        self.action_panel._signature = None
        self.log_panel._cache_key = None

    def build_summary(self, reason: str) -> dict[str, Any]:
        events = self.events.events
        resolved = [event for event in events if event.eradicated]
        controlled_only = [event for event in events if event.contained and not event.eradicated]
        missed = [event for event in events if not event.contained and not event.eradicated]
        identified = [event for event in events if event.investigations > 0]
        response_turns = list(self.player.stats.get("response_turns", []))
        average = sum(response_turns) / len(response_turns) if response_turns else 0.0
        return {
            "reason": reason,
            "turn": self.turn,
            "total_turns": self.player.total_turns,
            "security": self.player.security,
            "funds": self.player.funds,
            "reputation": self.player.reputation,
            "availability": self.player.availability,
            "integrity": self.player.integrity,
            "total_events": len(events),
            "resolved": len(resolved),
            "controlled_only": len(controlled_only),
            "controlled_only_names": [event.name for event in controlled_only],
            "missed": len(missed),
            "missed_names": [event.name for event in missed],
            "identified": len(identified),
            "response_turns": response_turns,
            "average_response": average,
            "false_positives_seen": int(self.player.stats.get("false_positives_seen", 0)),
            "false_positives_checked": int(self.player.stats.get("false_positives_checked", 0)),
            "false_isolations": int(self.player.stats.get("false_isolations", 0)),
            "data_leak": self.data_leak,
            "ransomware_failed": self.ransomware_failed,
            "security_breach": self.security_breach,
            "best_combo": self.best_combo,
            "service_availability": self.services.availability(self.devices),
            "service_income": self.services.income(self.devices),
            "sla_breaches": int(self.player.stats.get("sla_breaches", 0)),
        }

    # ==================================================================
    # 指标与资源
    # ==================================================================
    @property
    def threat_level(self) -> int:
        """威胁等级随未处置事件数量上升，最多 5 级。"""
        active = len([event for event in self.events.events if event.is_active])
        return max(1, min(5, 1 + active))

    @property
    def threat_multiplier(self) -> float:
        return 1.0 + 0.08 * (self.threat_level - 1)

    @property
    def confidence_bonus(self) -> float:
        return 0.15 if self.player.has_upgrade("log_plugin") else 0.0

    def buy_upgrade(self, upgrade_id: str) -> tuple[bool, str]:
        item = next(
            (upgrade for upgrade in self.upgrade_catalog if str(upgrade.get("id")) == upgrade_id),
            None,
        )
        if item is None:
            return False, "没有找到该加固项目"
        if upgrade_id in self.player.upgrades:
            return False, "该加固项目已经启用"
        name = str(item.get("name", upgrade_id))
        try:
            cost = int(item.get("cost", 0))
        except (TypeError, ValueError):
            cost = 0
        if self.player.funds < cost:
            return False, f"资金不足（需要 ¥{cost}）"
        self.adjust_metric(
            MetricKey.FUNDS,
            -cost,
            f"购买安全加固「{name}」",
            push=False,
        )
        self.player.upgrades.add(upgrade_id)
        self.audio.play("upgrade")
        self.effects.flash(settings.GREEN, 36)
        self.effects.add_floater(f"加固完成：{name}", settings.GREEN, (settings.SCREEN_WIDTH // 2, 96))
        self.push_message(f"安全加固已启用：{name}（-¥{cost}）。", settings.GREEN)
        return True, f"已启用「{name}」"

    def choose_decision(self, index: int) -> None:
        screen = self.decision_screen
        decision = screen.decision
        if not screen.visible or not isinstance(decision, dict):
            return
        choices = decision.get("choices", [])
        if not isinstance(choices, list) or not (0 <= index < len(choices)):
            return
        choice = choices[index]
        if not isinstance(choice, dict):
            return
        label = str(choice.get("label", "选择"))
        effects = choice.get("effects", {})
        if isinstance(effects, dict):
            for key, value in effects.items():
                if key not in ("security", "funds", "reputation", "availability", "integrity"):
                    continue
                try:
                    delta = int(value)
                except (TypeError, ValueError):
                    continue
                self.adjust_metric(key, delta, f"值班决策「{decision.get('title', '')}」")
        result = str(choice.get("result", ""))
        self.push_message(f"决策：{label}。{result}", settings.ACCENT)
        self.effects.add_banner(f"决策：{label}", result[:46], settings.ORANGE)
        self.audio.play("click")
        self.decision_screen.close()

    def save_game(self) -> bool:
        ok, message = self.save_manager.save(self)
        self.audio.play("success" if ok else "fail")
        self.push_message(("存档成功：" if ok else "存档失败：") + message, settings.GREEN if ok else settings.RED)
        if ok:
            self.effects.add_floater("进度已保存", settings.GREEN, (settings.SCREEN_WIDTH // 2, 96))
        return ok

    def load_game(self) -> bool:
        ok, message = self.save_manager.load(self)
        if ok:
            self.audio.play("success")
            self.effects.flash(settings.ACCENT, 36)
            self.effects.add_banner("读取存档", f"第 {self.turn} 回合，继续值班", settings.ACCENT)
        else:
            self.audio.play("fail")
            self.push_message(("读取失败：" if message else "读取失败"), settings.RED)
        return ok

    def break_combo(self, reason: str) -> None:
        if self.combo > 0:
            self.push_message(f"连击中断（{reason}）。", settings.ORANGE)
            self.combo = 0

    def adjust_metric(self, key: str, delta: int, reason: str, *, push: bool = True) -> int:
        actual = self.player.adjust(key, delta, reason)
        if actual == 0:
            return 0
        label = METRIC_LABELS.get(key, key)
        self.logs.add(
            self.turn,
            settings.clock_text(self.turn),
            "系统",
            f"{label} {actual:+d}（{reason}）",
        )
        if push:
            color = settings.GREEN if actual > 0 else settings.RED
            self.push_message(f"{label} {actual:+d}：{reason}", color)
        if actual <= -4:
            self.effects.flash(settings.RED, 36)
        return actual

    def spend_resources(self, ap: int, money: int, reason: str) -> bool:
        if not self.player.can_pay(ap, money):
            return False
        self.player.action_points -= ap
        if money:
            self.adjust_metric(MetricKey.FUNDS, -money, reason)
        return True

    def recompute_availability(self, reason: str) -> None:
        """按业务服务健康度重算可用性，而不是简单数设备。"""
        value = self.services.availability(self.devices)
        delta = value - self.player.availability
        if delta == 0:
            return
        self.player.adjust(MetricKey.AVAILABILITY, delta, reason)
        self.logs.add(
            self.turn,
            settings.clock_text(self.turn),
            "系统",
            f"{METRIC_LABELS[MetricKey.AVAILABILITY]} {delta:+d}（{reason}）",
        )
        if delta <= -5:
            self.push_message(f"服务可用性 {delta:+d}：{reason}", settings.ORANGE)

    # ==================================================================
    # 事件与选择
    # ==================================================================
    def contain_event(
        self,
        event: Any,
        method: str,
        *,
        security_gain: int = 2,
        device_id: str = "",
    ) -> None:
        """控制攻击：停止扩散，但事件仍处于“待清除”状态。"""
        if event.eradicated or event.contained:
            return
        event.mark_contained(method, self.turn, device_id=device_id)
        if event.response_turn is None:
            event.response_turn = max(1, self.turn - event.start_turn + 1)
            self.player.stats["response_turns"].append(event.response_turn)
        for alert in self.events.alerts:
            if alert.event_id == event.event_id and not alert.resolved:
                alert.mark_controlled(f"已通过「{method}」控制，等待清除")
        device = self.devices.get(event.active_device_id)
        if device is not None and not device.isolated and device.status in ("感染", "可疑"):
            device.set_status("正常")
        self.recompute_availability("事件控制后业务恢复")
        self.logs.add(
            self.turn,
            settings.clock_text(self.turn),
            "操作",
            f"事件「{event.name}」已被控制，方式：{method}；根因尚未清除。",
        )
        self.push_message(
            f"「{event.name}」已控制，但还没清除。选择相关设备执行「清除威胁」。",
            settings.YELLOW,
        )
        self.audio.play("click")
        self.effects.flash(settings.YELLOW, 24)
        node_rect = self.network_view.node_rects.get(event.active_device_id)
        position = node_rect.center if node_rect else None
        self.effects.add_floater("已控制 · 待清除", settings.YELLOW, position)
        self.effects.add_burst(
            position or (settings.SCREEN_WIDTH // 2, settings.SCREEN_HEIGHT // 2 - 60),
            settings.YELLOW,
            10,
        )

    def eradicate_event(
        self,
        event: Any,
        method: str,
        *,
        security_gain: int = 3,
        device_id: str = "",
    ) -> None:
        """清除根因：事件真正解决，告警才会关闭，并结算连击。"""
        if event.eradicated:
            return
        event.mark_eradicated(method, self.turn, device_id=device_id)
        if event.response_turn is None:
            event.response_turn = max(1, self.turn - event.start_turn + 1)
            self.player.stats["response_turns"].append(event.response_turn)
        for alert in self.events.alerts:
            if alert.event_id == event.event_id and not alert.resolved:
                alert.resolve(f"已通过「{method}」清除根因")
        device = self.devices.get(event.active_device_id)
        if device is not None:
            if device.isolated:
                device.status_before_isolation = "正常"
            elif not device.online:
                device.status_before_offline = "正常"
            elif device.status in ("感染", "可疑"):
                device.set_status("正常")
        self.recompute_availability("事件清除后业务恢复")
        # 同一事件只奖励一次，避免“隔离→解除→再隔离”刷安全度
        if not event.rewarded:
            event.rewarded = True
            self.adjust_metric(MetricKey.SECURITY, security_gain, f"清除「{event.name}」（{method}）")
            self.adjust_metric(MetricKey.REPUTATION, 2, "彻底清除安全事件，客户信心回升")
            self.combo += 1
            self.best_combo = max(self.best_combo, self.combo)
            if self.combo > 1:
                self.push_message(f"干净处置连击 ×{self.combo}！", settings.ACCENT)
                self.effects.add_combo(f"COMBO ×{self.combo}")
                self.audio.play("combo")
            if self.combo % 2 == 0:
                gained = min(2, self.player.max_action_points + 2 - self.player.action_points)
                if gained > 0:
                    self.player.action_points += gained
                    self.push_message(f"连击奖励：行动点 +{gained}", settings.GREEN)
        self.logs.add(
            self.turn,
            settings.clock_text(self.turn),
            "操作",
            f"事件「{event.name}」根因已清除，方式：{method}。",
        )
        success_text = event.stage_text("success", "")
        if success_text:
            self.logs.add(
                self.turn,
                settings.clock_text(self.turn),
                "操作",
                f"清除结果：{success_text}",
            )
        self.push_message(f"事件「{event.name}」已彻底清除。", settings.GREEN)
        self.audio.play("success")
        self.effects.flash(settings.GREEN, 30)
        node_rect = self.network_view.node_rects.get(event.active_device_id)
        position = node_rect.center if node_rect else None
        self.effects.add_floater(f"清除 +{security_gain}", settings.GREEN, position)
        self.effects.add_burst(
            position or (settings.SCREEN_WIDTH // 2, settings.SCREEN_HEIGHT // 2 - 60),
            settings.GREEN,
            16,
        )

    def resume_events_on(self, device_id: str, method: str = "隔离设备") -> list[str]:
        names: list[str] = []
        for event in self.events.events:
            if (
                event.contained
                and not event.eradicated
                and event.containment_method == method
                and event.containment_device == device_id
            ):
                event.resume()
                names.append(event.name)
                device = self.devices.get(device_id)
                device_name = device.name if device else device_id
                action_name = "解除隔离" if method == "隔离设备" else "重新启动"
                self.events.create_alert(
                    self,
                    title=f"事件重新活跃：{event.name}",
                    level="高危",
                    target_id=event.active_device_id,
                    event_id=event.event_id,
                    source_ip=event.source_ip,
                    account=event.account,
                    detail=f"{device_name} {action_name}后，之前被压制的攻击链重新活跃。",
                )
                self.logs.add(
                    self.turn,
                    settings.clock_text(self.turn),
                    "告警",
                    f"{device_name} {action_name}，事件「{event.name}」重新活跃。",
                    source=device_name,
                )
                self.push_message(f"警告：{action_name}使「{event.name}」重新活跃！", settings.RED)
        return names

    def event_for_alert(self, alert: Any) -> Any:
        if alert is None:
            return None
        return self.events.get_event(getattr(alert, "event_id", None))

    def related_alerts(self, alert: Any) -> list[Any]:
        """按事件、来源 IP 或账号找出有关联的告警，用于情报关联提示。"""
        if alert is None:
            return []
        related = []
        for other in self.events.alerts:
            if other.alert_id == alert.alert_id:
                continue
            if (
                (alert.event_id and other.event_id == alert.event_id)
                or (alert.source_ip and other.source_ip == alert.source_ip)
                or (alert.account and other.account == alert.account)
            ):
                related.append(other)
        return related

    def event_for_device(self, device_id: str) -> Any:
        events = self.events_for_device(device_id)
        return events[0] if events else None

    def events_for_device(self, device_id: str) -> list[Any]:
        return [
            event
            for event in self.events.active_events()
            if event.active_device_id == device_id
        ]

    def controlled_events_for_device(self, device_id: str) -> list[Any]:
        """该设备上已控制但尚未清除的事件。"""
        return [
            event
            for event in self.events.events
            if event.contained
            and not event.eradicated
            and not event.failed
            and event.active_device_id == device_id
        ]

    def has_event_relation(self, device_id: str) -> bool:
        """设备是否与任何已生成事件相关（包括已处置事件），用于避免误判误封。"""
        for event in self.events.events:
            if device_id in (event.active_device_id, event.target_id):
                return True
        return False

    def selected_device(self) -> Device | None:
        if self.selected_alert is not None:
            return self.devices.get(self.selected_alert.target_id)
        if self.selected_device_id:
            return self.devices.get(self.selected_device_id)
        return None

    def select_device(self, device_id: str) -> None:
        if device_id not in self.devices:
            return
        self.selected_device_id = device_id
        self.selected_alert = None
        self.action_panel._signature = None

    def clear_selection(self) -> None:
        """清空选择，回到业务总览。"""
        self.selected_device_id = None
        self.selected_alert = None
        self.action_panel._signature = None

    def select_alert(self, alert: Any) -> None:
        self.selected_alert = alert
        self.selected_device_id = alert.target_id
        self.action_panel._signature = None

    def current_target(self) -> Target | None:
        if self.selected_alert is not None:
            return Target(
                "alert",
                alert=self.selected_alert,
                device=self.devices.get(self.selected_alert.target_id),
            )
        if self.selected_device_id:
            device = self.devices.get(self.selected_device_id)
            if device is not None:
                return Target("device", device=device)
        return None

    # ==================================================================
    # 操作与消息
    # ==================================================================
    def perform_action(self, option: ActionOption, target: Target) -> ActionResult:
        result = self.actions.execute(self, option, target)
        self.action_panel.sync(self)
        self.log_panel._cache_key = None
        return result

    def push_message(self, text: str, color: tuple[int, int, int] | None = None) -> None:
        self.messages.append(
            {"text": str(text), "color": color or settings.TEXT, "turn": self.turn}
        )

    def on_alert_created(self, alert: Any) -> None:
        """EventManager 生成新告警时调用，负责音效与横幅。"""
        self.audio.play("alert")
        target = self.devices.get(alert.target_id)
        target_name = target.short_name if target else alert.target_id
        self.effects.add_banner(
            f"新告警 · {alert.title}",
            f"目标 {alert.target_id} {target_name} · 等级待评估",
            alert.level_color if alert.investigated else settings.ACCENT,
        )

    def on_critical_event(self, event: Any) -> None:
        """高危事件出现时的全屏警示。"""
        self.audio.play("fail")
        self.effects.flash(settings.RED, 80)
        self.effects.add_banner(
            f"高危事件：{event.name}",
            "威胁等级上升 · 立即调查或隔离，不要等待",
            settings.RED,
        )

    # ==================================================================
    # 事件处理
    # ==================================================================
    def handle_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.QUIT:
            self.running = False
            return

        if self.briefing.visible:
            self.briefing.handle_event(event)
            return

        if self.tutorial_screen.visible:
            action = self.tutorial_screen.handle_event(event, self)
            if action == "practice":
                self.tutorial_screen.close()
                self.tutorial_guide.reset()
            elif action == "close":
                self.finish_tutorial(start=False)
            return

        if self.tutorial_mode and self.tutorial_guide.completed:
            self.tutorial_guide.handle_event(event, self)
            return

        if self.tutorial_mode and self.tutorial_guide.handle_event(event, self):
            return

        if event.type == pygame.KEYDOWN and event.key == pygame.K_F1:
            self.help.toggle()
            return

        if self.help.visible:
            self.help.handle_event(event)
            return

        if self.decision_screen.visible:
            self.decision_screen.handle_event(event, self)
            return

        if self.history_screen.visible:
            self.history_screen.handle_event(event)
            return

        if self.shop.visible:
            if event.type == pygame.KEYDOWN and event.key == pygame.K_u:
                self.shop.close()
                return
            self.shop.handle_event(event, self)
            return

        if (
            event.type == pygame.KEYDOWN
            and event.key == pygame.K_u
            and self.state in (GameState.PLAYING, GameState.PAUSED)
            and not self.tutorial_mode
            and not (self.state == GameState.PLAYING and self.log_panel.input_active)
        ):
            self.shop.open()
            return

        if (
            event.type == pygame.KEYDOWN
            and event.key == pygame.K_m
            and not (self.state == GameState.PLAYING and self.log_panel.input_active)
        ):
            muted = self.audio.toggle_mute()
            if not muted:
                self.audio.play("click")
            if self.state == GameState.PLAYING:
                self.push_message(f"音效已{'关闭' if muted else '开启'}。", settings.TEXT_DIM)
            return

        if self.state == GameState.MENU:
            self._handle_menu_event(event)
        elif self.state == GameState.PLAYING:
            self._handle_playing_event(event)
        elif self.state == GameState.PAUSED:
            self._handle_paused_event(event)
        elif self.state == GameState.RESULT:
            self._handle_result_event(event)

    def _handle_menu_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.KEYDOWN and event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
            self.new_game(briefing=True)
            return
        action = self.menu.handle_event(event)
        if action == "start":
            self.new_game(briefing=True)
        elif action == "continue":
            self.load_game()
        elif action == "tutorial":
            self.new_game(tutorial=True)
            self.effects.banners.clear()
            self.effects.floaters.clear()
            self.effects.flash_alpha = 0
            self.tutorial_screen.open()
        elif action == "help":
            self.help.show()
        elif action == "history":
            self.history_screen.open()
        elif action == "seed":
            self.seed = random.randint(1000, 9999)
        elif action == "quit":
            self.running = False

    def _handle_playing_event(self, event: pygame.event.Event) -> None:
        # 日志输入框优先获得键盘事件（否则 Esc 会被当成暂停）
        if self.log_panel.handle_event(event, self):
            return
        if self.log_panel.input_active and event.type == pygame.KEYDOWN:
            # 输入状态下的其他按键交给 TEXTINPUT 处理，不能触发暂停/推进回合
            return

        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_F5:
                self.save_game()
                return
            if event.key == pygame.K_F9:
                self.load_game()
                return

        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                self.state = GameState.PAUSED
                return
            if event.key == pygame.K_SPACE:
                self.end_turn()
                return

        if self.bottom_buttons["advance"].handle_event(event):
            self.end_turn()
            return
        if self.bottom_buttons["pause"].handle_event(event):
            self.state = GameState.PAUSED
            return

        if self.network_view.handle_event(event, self):
            return
        if self.alert_panel.handle_event(event, self):
            return
        if self.action_panel.handle_event(event, self):
            return

    def _handle_paused_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.state = GameState.PLAYING
            return
        if self.pause_buttons["resume"].handle_event(event):
            self.state = GameState.PLAYING
        elif self.pause_buttons["save"].handle_event(event):
            self.save_game()
        elif self.pause_buttons["load"].handle_event(event):
            self.load_game()
        elif self.pause_buttons["shop"].handle_event(event):
            self.shop.open()
        elif self.pause_buttons["restart"].handle_event(event):
            self.new_game()
        elif self.pause_buttons["menu"].handle_event(event):
            self.audio.stop_ambient()
            self.state = GameState.MENU

    def _handle_result_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.audio.stop_ambient()
            self.state = GameState.MENU
            return
        action = self.result_screen.handle_event(event)
        if action == "restart":
            self.new_game()
        elif action == "menu":
            self.audio.stop_ambient()
            self.state = GameState.MENU

    # ==================================================================
    # 更新
    # ==================================================================
    def update(self, dt: float) -> None:
        if self.state == GameState.MENU:
            self.menu.update(dt)
        elif self.state == GameState.PLAYING:
            self.action_panel.sync(self)
            self.action_panel.update(dt)
            for button in self.bottom_buttons.values():
                button.update(dt)
        elif self.state == GameState.PAUSED:
            for button in self.pause_buttons.values():
                button.update(dt)
        elif self.state == GameState.RESULT:
            self.result_screen.update(dt)
        if self.shop.visible:
            self.shop.update(dt)
        if self.history_screen.visible:
            self.history_screen.update(dt)
        if self.decision_screen.visible:
            self.decision_screen.update(dt)
        if self.tutorial_screen.visible:
            self.tutorial_screen.update(dt)
        if self.tutorial_mode:
            self.tutorial_guide.update_step(self)
            self.tutorial_guide.update(dt)
        if self.briefing.visible:
            self.briefing.update(dt)
        self.effects.update(dt)
        self.help.update(dt)

    # ==================================================================
    # 绘制
    # ==================================================================
    def draw(self) -> None:
        self.screen.blit(self.background, (0, 0))
        self._draw_scanline()
        if self.state == GameState.MENU:
            self.menu.draw(self.screen, self)
        else:
            self._draw_play()
            if self.state == GameState.PLAYING:
                self.effects.draw(self.screen)
            if self.state == GameState.PAUSED:
                self._draw_pause()
            elif self.state == GameState.RESULT and self.report is not None:
                self.result_screen.draw(self.screen, self.report, self)
        if self.decision_screen.visible:
            self.decision_screen.draw(self.screen, self)
        if self.shop.visible:
            self.shop.draw(self.screen, self)
        if self.history_screen.visible:
            self.history_screen.draw(self.screen, self)
        if self.tutorial_screen.visible:
            self.tutorial_screen.draw(self.screen, self)
        elif self.tutorial_mode:
            self.tutorial_guide.draw(self.screen, self)
        if self.briefing.visible:
            self.briefing.draw(self.screen)
        if draw_utils.FONT_FALLBACK:
            self._draw_font_warning()
        if self.help.visible:
            self.help.draw(self.screen)
        pygame.display.flip()

    def _draw_scanline(self) -> None:
        """缓慢移动的扫描线，让背景有一点“正在监控”的感觉。"""
        ticks = pygame.time.get_ticks()
        y = (ticks // 26) % (settings.SCREEN_HEIGHT + 160) - 80
        line = pygame.Surface((settings.SCREEN_WIDTH, 2), pygame.SRCALPHA)
        line.fill((0, 224, 255, 12))
        self.screen.blit(line, (0, y))
        glow = pygame.Surface((settings.SCREEN_WIDTH, 26), pygame.SRCALPHA)
        for offset in range(26):
            alpha = max(0, int(7 * (1 - offset / 26)))
            pygame.draw.line(glow, (0, 224, 255, alpha), (0, offset), (settings.SCREEN_WIDTH, offset))
        self.screen.blit(glow, (0, y + 2))

    def _draw_font_warning(self) -> None:
        font = draw_utils.get_font(12, True)
        text = "未找到中文字体：中文可能显示为方块，请安装微软雅黑或黑体。"
        image = font.render(text, True, settings.RED)
        rect = pygame.Rect(8, settings.SCREEN_HEIGHT - 24, image.get_width() + 16, 20)
        pygame.draw.rect(self.screen, (30, 10, 12), rect, border_radius=4)
        self.screen.blit(image, (rect.x + 8, rect.y + 3))

    def _draw_play(self) -> None:
        self.dashboard.draw(self.screen, self)
        self.network_view.draw(self.screen, self)
        self.device_panel.draw(self.screen, self)
        self.alert_panel.draw(self.screen, self)
        self.log_panel.draw(self.screen, self)
        self.action_panel.draw(self.screen, self)
        self._draw_bottom()

    def _draw_bottom(self) -> None:
        rect = pygame.Rect(settings.LAYOUT["bottom"])
        header = f"行动点 {self.player.action_points} / {self.player.max_action_points}"
        if self.combo > 1:
            header += f"  ·  连击 ×{self.combo}"
        draw_utils.draw_panel(self.screen, rect, "消息 / 指标变化", header_right=header)

        small = draw_utils.get_font(11)
        messages = list(self.messages)[-6:]
        y = rect.y + 40
        max_width = rect.width - 232
        for message in messages:
            text = draw_utils.ellipsize(f"· {message['text']}", small, max_width)
            image = small.render(text, True, message["color"])
            self.screen.blit(image, (rect.x + 12, y))
            y += 16

        mouse_pos = pygame.mouse.get_pos()
        for button in self.bottom_buttons.values():
            button.draw(self.screen, mouse_pos)

    def _draw_pause(self) -> None:
        overlay = draw_utils.dim_surface(settings.SCREEN_SIZE, 180)
        self.screen.blit(overlay, (0, 0))
        rect = pygame.Rect(390, 80, 500, 560)
        pygame.draw.rect(self.screen, settings.PANEL_BG, rect, border_radius=12)
        pygame.draw.rect(self.screen, settings.PANEL_BORDER_LIGHT, rect, 1, border_radius=12)
        title = draw_utils.get_font(26, True).render("值班暂停", True, settings.ACCENT)
        self.screen.blit(title, (rect.centerx - title.get_width() // 2, rect.y + 24))

        info_font = draw_utils.get_font(13)
        lines = (
            f"当前回合：第 {self.turn} / {settings.TOTAL_TURNS} 回合（{settings.clock_text(self.turn)}）",
            f"随机种子：{self.seed}",
            f"安全度 {self.player.security}%   ·   资金 {settings.format_money(self.player.funds)}",
            f"可用性 {self.player.availability}%   ·   数据完整度 {self.player.integrity}%",
            f"{self.audio.state_text}（按 M 切换）   ·   连击 ×{self.combo}",
        )
        for index, line in enumerate(lines):
            image = info_font.render(line, True, settings.TEXT_DIM)
            self.screen.blit(image, (rect.centerx - image.get_width() // 2, rect.y + 74 + index * 22))

        mouse_pos = pygame.mouse.get_pos()
        for button in self.pause_buttons.values():
            button.draw(self.screen, mouse_pos)

    # ==================================================================
    # 主循环
    # ==================================================================
    def run(self) -> None:
        while self.running:
            dt = self.clock.tick(settings.FPS) / 1000.0
            for event in pygame.event.get():
                self.handle_event(event)
            self.update(dt)
            self.draw()
