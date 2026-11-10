# -*- coding: utf-8 -*-
"""事件管理器：加载事件配置、按回合派发事件、推进阶段、生成告警与噪音日志。"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING, Any

import settings
from models.alert import Alert
from models.security_event import SecurityEvent
from systems.log_system import LogSystem

if TYPE_CHECKING:  # 仅用于类型提示，避免循环导入
    from game import Game


SAFE_ACCOUNTS = (
    "li.na@example-corp.test",
    "zhang.wei@example-corp.test",
    "wang.qiang@example-corp.test",
    "chen.yu@example-corp.test",
    "svc-web@example-corp.test",
)


class EventManager:
    """负责“世界”一侧的推进：事件、告警、背景日志。

    Game 负责指标与判定，EventManager 通过 game 的公共方法修改状态，
    保持“逻辑”和“界面”分离。
    """

    def __init__(
        self,
        payload: dict[str, Any],
        rng: random.Random,
        log_system: LogSystem,
        tutorial: bool = False,
    ) -> None:
        self.payload = payload
        self.rng = rng
        self.logs = log_system
        self.tutorial = tutorial
        self.events: list[SecurityEvent] = []
        self.alerts: list[Alert] = []
        self.spawned_event_ids: set[str] = set()
        self.alert_counter = 0
        self.last_false_positive_turn = -99
        self.used_false_positive_titles: set[str] = set()
        self.spawn_schedule: dict[str, int] = {}
        self._build_spawn_schedule()

    def _build_spawn_schedule(self) -> None:
        """固定事件（首回合教学、第 8 回合零日）保留，其余事件打乱到 3~6 回合。"""
        if self.tutorial:
            for config in self.event_configs:
                if not config.get("enabled", False):
                    continue
                try:
                    base_turn = int(config.get("spawn_turn", 1))
                except (TypeError, ValueError):
                    base_turn = 1
                if base_turn <= 1:
                    self.spawn_schedule[str(config.get("id", ""))] = 1
            return
        flexible: list[dict[str, Any]] = []
        for config in self.event_configs:
            if not config.get("enabled", False):
                continue
            try:
                base_turn = int(config.get("spawn_turn", 1))
            except (TypeError, ValueError):
                base_turn = 1
            event_id = str(config.get("id", ""))
            if base_turn <= 1 or base_turn >= 8:
                self.spawn_schedule[event_id] = base_turn
            else:
                flexible.append(config)
        slots = [3, 4, 5, 6, 7]
        self.rng.shuffle(flexible)
        for index, config in enumerate(flexible):
            if index >= len(slots):
                break
            self.spawn_schedule[str(config.get("id", ""))] = slots[index]

    # ------------------------------------------------------------------
    # 加载与校验
    # ------------------------------------------------------------------
    @staticmethod
    def load_payload(path: Any) -> dict[str, Any]:
        raw = settings.load_json(path)
        if not isinstance(raw, dict):
            raise settings.DataError("events.json 的根节点必须是 JSON 对象")
        events = raw.get("events")
        if not isinstance(events, list) or not events:
            raise settings.DataError("events.json 中必须包含非空的 events 列表")
        for item in events:
            if not isinstance(item, dict):
                raise settings.DataError("events.json 中的事件必须是 JSON 对象")
            # 构造一次事件以完成字段校验（不加入游戏）
            probe = SecurityEvent(item, spawn_turn=int(item.get("spawn_turn", 1)))
            if not probe.event_id:
                raise settings.DataError("事件 ID 不能为空")
        false_positives = raw.get("false_positive_alerts", [])
        if not isinstance(false_positives, list):
            raise settings.DataError("false_positive_alerts 必须是列表")
        background = raw.get("background_logs", [])
        if not isinstance(background, list):
            raise settings.DataError("background_logs 必须是列表")
        return raw

    @property
    def event_configs(self) -> list[dict[str, Any]]:
        return [item for item in self.payload.get("events", []) if isinstance(item, dict)]

    def get_event(self, event_id: str | None) -> SecurityEvent | None:
        if not event_id:
            return None
        for event in self.events:
            if event.event_id == event_id:
                return event
        return None

    def get_event_config(self, event_id: str | None) -> dict[str, Any] | None:
        if not event_id:
            return None
        for config in self.event_configs:
            if str(config.get("id", "")) == event_id:
                return config
        return None

    def active_events(self) -> list[SecurityEvent]:
        return [event for event in self.events if event.is_active]

    # ------------------------------------------------------------------
    # 回合开始
    # ------------------------------------------------------------------
    def start_turn(self, game: "Game") -> None:
        self._spawn_due_events(game)
        self._maybe_false_positive(game)
        self._background_noise(game)

    def _spawn_due_events(self, game: "Game") -> None:
        for config in self.event_configs:
            if not config.get("enabled", False):
                continue
            event_id = str(config.get("id", ""))
            if not event_id or event_id in self.spawned_event_ids:
                continue
            if self.tutorial and event_id not in self.spawn_schedule:
                continue
            try:
                spawn_turn = int(self.spawn_schedule.get(event_id, config.get("spawn_turn", 1)))
            except (TypeError, ValueError):
                spawn_turn = 1
            if game.turn != spawn_turn:
                continue

            event = SecurityEvent(config, spawn_turn=game.turn)
            if event.target_id not in game.devices:
                game.logs.add(
                    game.turn,
                    settings.clock_text(game.turn),
                    "系统",
                    f"事件 {event.event_id} 的目标设备 {event.target_id} 不存在，已跳过。",
                )
                self.spawned_event_ids.add(event_id)
                continue
            self.events.append(event)
            self.spawned_event_ids.add(event_id)
            self._announce_stage(game, event, first=True)

    def _announce_stage(self, game: "Game", event: SecurityEvent, first: bool = False) -> None:
        """记录日志、生成告警、推送消息。"""
        clock = settings.clock_text(game.turn)
        stage = event.stage
        device = game.devices.get(event.active_device_id)
        source_name = device.name if device else event.target_id
        game.logs.add(
            game.turn,
            clock,
            "邮件" if event.event_type == "钓鱼邮件" and event.stage_index == 0 else "告警",
            str(stage.get("log", event.name)),
            source=source_name,
            account=event.account,
            ip=event.source_ip,
        )
        alert = self.create_alert(
            game,
            title=str(stage.get("alert_title", event.name)),
            level=str(stage.get("alert_level", event.severity_label)),
            target_id=event.active_device_id,
            event_id=event.event_id,
            source_ip=event.source_ip,
            account=event.account,
            detail=str(stage.get("alert_detail", event.summary)),
        )
        prefix = "检测到新的可疑活动" if first else "事件升级"
        game.push_message(f"{prefix}：{alert.title}（{alert.level}）", alert.level_color)
        if first and event.severity >= 5 and hasattr(game, "on_critical_event"):
            game.on_critical_event(event)

    def create_alert(
        self,
        game: "Game",
        *,
        title: str,
        level: str,
        target_id: str,
        event_id: str | None = None,
        source_ip: str = "",
        account: str = "",
        detail: str = "",
        false_positive: bool = False,
        conclusion: str = "",
    ) -> Alert:
        self.alert_counter += 1
        alert = Alert(
            alert_id=f"A-{self.alert_counter:03d}",
            title=title,
            level=level,
            target_id=target_id,
            turn=game.turn,
            clock=settings.clock_text(game.turn),
            event_id=event_id,
            source_ip=source_ip,
            account=account,
            detail=detail,
            false_positive=false_positive,
            conclusion=conclusion,
        )
        self.alerts.append(alert)
        if hasattr(game, "on_alert_created"):
            game.on_alert_created(alert)
        return alert

    # ------------------------------------------------------------------
    # 误报与背景噪音
    # ------------------------------------------------------------------
    def _maybe_false_positive(self, game: "Game") -> None:
        if self.tutorial:
            return
        pool = [item for item in self.payload.get("false_positive_alerts", []) if isinstance(item, dict)]
        if not pool:
            return
        turn = game.turn
        should_spawn = turn == 1
        if not should_spawn:
            should_spawn = (turn - self.last_false_positive_turn >= 2) and self.rng.random() < 0.5
        if not should_spawn:
            return
        candidates = [item for item in pool if item.get("title") not in self.used_false_positive_titles]
        if not candidates:
            candidates = pool
        config = self.rng.choice(candidates)
        target_id = str(config.get("target", ""))
        if target_id not in game.devices:
            return
        title = str(config.get("title", "可疑活动"))
        self.used_false_positive_titles.add(title)
        self.last_false_positive_turn = turn
        alert = self.create_alert(
            game,
            title=title,
            level=str(config.get("level", "低危")),
            target_id=target_id,
            source_ip=str(config.get("source_ip", "")),
            account=str(config.get("account", "")),
            detail=str(config.get("detail", "")),
            false_positive=True,
            conclusion=str(config.get("conclusion", "")),
        )
        game.player.stats["false_positives_seen"] = game.player.stats.get("false_positives_seen", 0) + 1
        game.logs.add(
            game.turn,
            settings.clock_text(game.turn),
            "告警",
            f"监控平台产生告警：{alert.title}（{alert.level}），来源 {target_id}。",
            source=target_id,
            ip=alert.source_ip,
        )
        game.push_message(f"新的告警：{alert.title}（{alert.level}）", alert.level_color)

    def _background_noise(self, game: "Game") -> None:
        templates = [item for item in self.payload.get("background_logs", []) if isinstance(item, dict)]
        if not templates:
            return
        count = 2 + self.rng.randint(0, 2)
        for _ in range(count):
            template = self.rng.choice(templates)
            text = str(template.get("text", ""))
            try:
                text = text.format(n=self.rng.randint(3, 97), account=self.rng.choice(SAFE_ACCOUNTS))
            except (KeyError, IndexError):
                pass
            game.logs.add(
                game.turn,
                settings.clock_text(game.turn),
                str(template.get("category", "系统")),
                text,
            )

    # ------------------------------------------------------------------
    # 回合结束：事件推进
    # ------------------------------------------------------------------
    def advance_events(self, game: "Game") -> None:
        for event in self.events:
            if not event.is_active:
                continue
            device = game.devices.get(event.active_device_id)
            stage = event.stage
            # 隔离或关机都能阻断当前主链；事件本身仍然存在
            if device is not None and not device.is_available and bool(stage.get("spreading", False)):
                reason = "处于隔离状态" if device.isolated else "处于关机状态"
                game.logs.add(
                    game.turn,
                    settings.clock_text(game.turn),
                    "网络",
                    f"{device.name} {reason}，{event.name} 的横向传播被阻断。",
                    source=device.name,
                )
                game.push_message(f"阻断生效：{device.name} {reason}，攻击链暂时停止推进。", settings.GREEN)
                continue

            if event.stage_index >= event.max_stage_index:
                self._trigger_final_loss(game, event)
                if game.state != "playing":
                    return
                continue

            old_name = event.stage_name
            event.advance()
            event.last_advance_turn = game.turn
            self._apply_stage(game, event, old_name)

    def _apply_stage(self, game: "Game", event: SecurityEvent, old_stage_name: str) -> None:
        device = game.devices.get(event.active_device_id)
        device_name = device.name if device else event.target_id

        reason = f"「{event.name}」从“{old_stage_name}”发展为“{event.stage_name}”"
        multiplier = float(getattr(game, "threat_multiplier", 1.0))
        security_cost = int(round(event.stage_cost("security_cost") * multiplier))
        integrity_cost = int(round(event.stage_cost("integrity_cost") * multiplier))
        reputation_cost = int(round(event.stage_cost("reputation_cost") * multiplier))
        availability_cost = int(round(event.stage_cost("availability_cost") * multiplier))

        if security_cost:
            game.adjust_metric("security", -security_cost, reason)
        if integrity_cost:
            game.adjust_metric("integrity", -integrity_cost, mechanism_reason("integrity", event))
        if reputation_cost:
            game.adjust_metric("reputation", -reputation_cost, mechanism_reason("reputation", event))
        if availability_cost:
            game.adjust_metric("availability", -availability_cost, mechanism_reason("availability", event))

        # 设备状态变化（例如 PC-01 从“可疑”变为“感染”）
        for device_id, status in dict(event.stage.get("device_status", {})).items():
            target = game.devices.get(str(device_id))
            if target is not None:
                target.set_status(str(status))
                game.logs.add(
                    game.turn,
                    settings.clock_text(game.turn),
                    "网络",
                    f"{target.name} 状态变更为「{target.status_label}」。",
                    source=target.name,
                )

        # 日志 + 告警
        game.logs.add(
            game.turn,
            settings.clock_text(game.turn),
            "告警",
            event.stage_text("log", event.name),
            source=device_name,
            account=event.account,
            ip=event.source_ip,
        )
        alert = self.create_alert(
            game,
            title=event.stage_text("alert_title", event.name),
            level=event.stage_text("alert_level", event.severity_label),
            target_id=event.active_device_id,
            event_id=event.event_id,
            source_ip=event.source_ip,
            account=event.account,
            detail=event.stage_text("alert_detail", event.summary),
        )
        game.push_message(
            f"事件升级：「{event.name}」进入“{event.stage_name}”，新告警 {alert.title}（{alert.level}）。",
            settings.RED,
        )
        game.break_combo("攻击链推进")
        game.recompute_availability("设备安全状态变化影响服务可用性")

    def _trigger_final_loss(self, game: "Game", event: SecurityEvent) -> None:
        """最终阶段仍未处理：按事件类型造成一次性重大损失并决定结局。"""
        event.mark_failed(game.turn)
        device = game.devices.get(event.active_device_id)
        device_name = device.name if device else event.active_device_id

        costs = event.failure_costs
        multiplier = float(getattr(game, "threat_multiplier", 1.0))
        security_cost = int(round(costs.get("security", 8) * multiplier))
        integrity_cost = int(round(costs.get("integrity", 12) * multiplier))
        reputation_cost = int(round(costs.get("reputation", 8) * multiplier))
        availability_cost = int(round(costs.get("availability", 0) * multiplier))

        mitigated = False
        if event.failure_ending == "ransomware":
            backup_server = game.devices.get("BAK-01")
            protected = bool(backup_server and backup_server.backup_protected)
            protected = protected or game.player.has_upgrade("offline_backup")
            if protected:
                mitigated = True
                security_cost = max(1, security_cost // 2)
                integrity_cost = max(1, integrity_cost // 2)
                reputation_cost = max(1, reputation_cost // 2)
                availability_cost = max(0, availability_cost // 2)

        if availability_cost:
            game.adjust_metric(
                "availability",
                -availability_cost,
                f"「{event.name}」造成服务中断",
            )
        game.adjust_metric("integrity", -integrity_cost, f"「{event.name}」造成核心数据损失")
        game.adjust_metric("reputation", -reputation_cost, f"「{event.name}」造成对外可见事故")
        game.adjust_metric("security", -security_cost, f"「{event.name}」未被阻断")
        if device is not None:
            device.set_status("感染")

        ending_titles = {
            "data_leak": "数据外泄已确认",
            "ransomware": "模拟勒索软件失控",
            "security_breach": "管理员权限彻底失守",
        }
        title = ending_titles.get(event.failure_ending, "重大安全事件")
        self.create_alert(
            game,
            title=f"{title}：{event.name}",
            level="极危",
            target_id=event.active_device_id,
            event_id=event.event_id,
            source_ip=event.source_ip,
            account=event.account,
            detail=str(event.stage.get("final_loss", event.summary)),
        )
        game.logs.add(
            game.turn,
            settings.clock_text(game.turn),
            "告警",
            f"最终损失：{title}，{device_name} 未能保住。",
            source=device_name,
        )
        game.push_message(f"严重损失：{title}（{event.name}）！", settings.RED)
        game.recompute_availability("设备受损影响服务")

        if event.failure_ending == "ransomware":
            if mitigated:
                game.push_message(
                    "离线备份/备份保护生效：勒索损失大幅降低，业务仍可在后续回合恢复。",
                    settings.ORANGE,
                )
                return
            game.ransomware_failed = True
            game.finish("ransomware")
            return
        if event.failure_ending == "security_breach":
            game.security_breach = True
            game.finish("security_breach")
            return
        game.data_leak = True
        game.finish("data_leak")

    # ------------------------------------------------------------------
    # 存档序列化
    # ------------------------------------------------------------------
    def to_state(self) -> dict[str, Any]:
        return {
            "spawned_event_ids": sorted(self.spawned_event_ids),
            "alert_counter": self.alert_counter,
            "last_false_positive_turn": self.last_false_positive_turn,
            "used_false_positive_titles": sorted(self.used_false_positive_titles),
            "spawn_schedule": dict(self.spawn_schedule),
            "events": [event.to_state() for event in self.events],
            "alerts": [alert.to_dict() for alert in self.alerts],
        }

    def apply_state(self, state: dict[str, Any]) -> None:
        spawned = state.get("spawned_event_ids", [])
        self.spawned_event_ids = {str(item) for item in spawned} if isinstance(spawned, list) else set()
        self.alert_counter = int(state.get("alert_counter", 0))
        self.last_false_positive_turn = int(state.get("last_false_positive_turn", -99))
        used = state.get("used_false_positive_titles", [])
        self.used_false_positive_titles = {str(item) for item in used} if isinstance(used, list) else set()
        schedule = state.get("spawn_schedule", {})
        if isinstance(schedule, dict):
            self.spawn_schedule = {
                str(key): int(value)
                for key, value in schedule.items()
                if isinstance(value, (int, float))
            }

        self.events = []
        for event_state in state.get("events", []):
            if not isinstance(event_state, dict):
                continue
            config = self.get_event_config(str(event_state.get("event_id", "")))
            if config is None:
                continue
            event = SecurityEvent(config, spawn_turn=int(event_state.get("start_turn", 1)))
            event.apply_state(event_state)
            self.events.append(event)

        self.alerts = []
        for alert_state in state.get("alerts", []):
            if isinstance(alert_state, dict):
                self.alerts.append(Alert.from_dict(alert_state))


def mechanism_reason(key: str, event: SecurityEvent) -> str:
    """为不同类型的指标变化生成可读原因。"""
    mapping = {
        "integrity": f"「{event.name}」造成数据被篡改或外泄",
        "reputation": f"「{event.name}」造成对外可见的安全事故",
        "availability": f"「{event.name}」影响业务系统运行",
    }
    return mapping.get(key, event.name)
