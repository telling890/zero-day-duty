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

CAMPAIGN_DEFAULT_THRESHOLD = 3
INTEL_CATEGORY = "情报"


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
        # 专家模式的延迟日志：先入队，下一回合再写入日志终端
        self.pending_logs: list[dict[str, Any]] = []
        # 攻击战役（事件链）的运行时状态：节奏压力、升级次数、是否已揭示
        self.campaign_runtime: dict[str, dict[str, Any]] = {
            str(campaign.get("id", "")): self._new_campaign_runtime()
            for campaign in self.campaign_configs
        }
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
        EventManager._validate_campaigns(raw, events)
        return raw

    @staticmethod
    def _validate_campaigns(raw: dict[str, Any], events: list[Any]) -> None:
        """战役把若干事件串成同一个攻击者的多步行动，因此必须引用真实事件。"""
        campaigns = raw.get("campaigns", [])
        if not isinstance(campaigns, list):
            raise settings.DataError("events.json 中的 campaigns 必须是列表")
        event_ids = {str(item.get("id", "")) for item in events if isinstance(item, dict)}
        seen_campaigns: set[str] = set()
        member_owner: dict[str, str] = {}
        for item in campaigns:
            if not isinstance(item, dict):
                raise settings.DataError("campaigns 中的每个战役必须是 JSON 对象")
            campaign_id = str(item.get("id", "")).strip()
            if not campaign_id:
                raise settings.DataError("攻击战役缺少 id")
            if campaign_id in seen_campaigns:
                raise settings.DataError(f"攻击战役 id 重复：{campaign_id}")
            seen_campaigns.add(campaign_id)
            members = item.get("members")
            if not isinstance(members, list) or len(members) < 2:
                raise settings.DataError(f"攻击战役 {campaign_id} 至少需要 2 个成员事件")
            for member in members:
                member_id = str(member)
                if member_id not in event_ids:
                    raise settings.DataError(
                        f"攻击战役 {campaign_id} 引用了不存在的事件：{member_id}"
                    )
                if member_id in member_owner:
                    raise settings.DataError(
                        f"事件 {member_id} 同时属于战役 {member_owner[member_id]} 和 {campaign_id}"
                    )
                member_owner[member_id] = campaign_id
            try:
                threshold = int(item.get("momentum_threshold", CAMPAIGN_DEFAULT_THRESHOLD))
            except (TypeError, ValueError) as exc:
                raise settings.DataError(
                    f"攻击战役 {campaign_id} 的 momentum_threshold 必须是整数"
                ) from exc
            if threshold < 1:
                raise settings.DataError(f"攻击战役 {campaign_id} 的 momentum_threshold 必须 >= 1")

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
    # 攻击战役（事件链）
    # ------------------------------------------------------------------
    @staticmethod
    def _new_campaign_runtime() -> dict[str, Any]:
        return {
            "momentum": 0,
            "escalations": 0,
            "revealed": False,
            "settled": False,
            "waits": 0,
            "last_switch": "",
            "last_target": "",
        }

    @property
    def campaign_configs(self) -> list[dict[str, Any]]:
        return [item for item in self.payload.get("campaigns", []) if isinstance(item, dict)]

    def get_campaign(self, campaign_id: str | None) -> dict[str, Any] | None:
        if not campaign_id:
            return None
        for campaign in self.campaign_configs:
            if str(campaign.get("id", "")) == str(campaign_id):
                return campaign
        return None

    def campaign_id_of(self, event_id: str | None) -> str:
        if not event_id:
            return ""
        for campaign in self.campaign_configs:
            members = [str(item) for item in campaign.get("members", [])]
            if str(event_id) in members:
                return str(campaign.get("id", ""))
        return ""

    def campaign_of(self, event_id: str | None) -> dict[str, Any] | None:
        return self.get_campaign(self.campaign_id_of(event_id))

    def campaign_members(self, campaign: dict[str, Any]) -> list[SecurityEvent]:
        members = {str(item) for item in campaign.get("members", [])}
        return [event for event in self.events if event.event_id in members]

    def _runtime(self, campaign: dict[str, Any]) -> dict[str, Any]:
        campaign_id = str(campaign.get("id", ""))
        runtime = self.campaign_runtime.get(campaign_id)
        if runtime is None:
            runtime = self._new_campaign_runtime()
            self.campaign_runtime[campaign_id] = runtime
        return runtime

    @staticmethod
    def _threshold(campaign: dict[str, Any]) -> int:
        try:
            return max(1, int(campaign.get("momentum_threshold", CAMPAIGN_DEFAULT_THRESHOLD)))
        except (TypeError, ValueError):
            return CAMPAIGN_DEFAULT_THRESHOLD

    def campaign_status(self) -> list[dict[str, Any]]:
        """给结算与调试用的战役快照。"""
        result: list[dict[str, Any]] = []
        for campaign in self.campaign_configs:
            runtime = self._runtime(campaign)
            members = self.campaign_members(campaign)
            result.append(
                {
                    "id": str(campaign.get("id", "")),
                    "name": str(campaign.get("name", "")),
                    "actor": str(campaign.get("actor", campaign.get("name", ""))),
                    "spawned": len(members),
                    "expected": len([str(item) for item in campaign.get("members", [])]),
                    "resolved": len([event for event in members if event.eradicated]),
                    "failed": len([event for event in members if event.failed]),
                    "active": len([event for event in members if event.is_active]),
                    "momentum": int(runtime["momentum"]),
                    "threshold": self._threshold(campaign),
                    "escalations": int(runtime["escalations"]),
                    "revealed": bool(runtime["revealed"]),
                    "settled": bool(runtime["settled"]),
                    "waits": int(runtime.get("waits", 0)),
                    "style": str(campaign.get("actor_style", "standard")),
                    "last_switch": str(runtime.get("last_switch", "")),
                }
            )
        return result

    def _campaign_settled(self, campaign: dict[str, Any], members: list[SecurityEvent]) -> bool:
        """所有成员都已出现，且每一个都被清除或已失守，战役才算结束。"""
        pending = {str(item) for item in campaign.get("members", [])} - {
            event.event_id for event in members
        }
        if pending:
            return False
        return all(event.eradicated or event.failed for event in members)

    def advance_campaigns(self, game: "Game") -> None:
        """回合结束时的战役节奏结算。

        该战役只要还有“仍在推进”的事件，压力 +1；全部被控制/清除则 -1。
        压力达到阈值就升级：让尚未出现的后续事件提前投放，
        或者直接推进一步已经出现的攻击链。
        """
        if self.tutorial:
            return
        for campaign in self.campaign_configs:
            runtime = self._runtime(campaign)
            if runtime["settled"]:
                continue
            members = self.campaign_members(campaign)
            if not members:
                continue
            active = [event for event in members if event.is_active]
            if not active:
                runtime["momentum"] = max(0, int(runtime["momentum"]) - 1)
                if self._campaign_settled(campaign, members):
                    runtime["settled"] = True
                    game.logs.add(
                        game.turn,
                        settings.clock_text(game.turn),
                        INTEL_CATEGORY,
                        f"情报：「{campaign.get('name', '')}」的已知行动已全部处置，节奏压力解除。",
                    )
                continue
            runtime["momentum"] = int(runtime["momentum"]) + 1
            if runtime["momentum"] < self._threshold(campaign):
                continue
            runtime["momentum"] = 0
            runtime["escalations"] = int(runtime["escalations"]) + 1
            self._escalate_campaign(game, campaign, active)
            if game.state != "playing":
                return

    def _maybe_reveal_campaign(self, game: "Game", campaign: dict[str, Any]) -> bool:
        """同一战役出现第二个事件时，向玩家点明“这些告警是同一个攻击者”。"""
        runtime = self._runtime(campaign)
        if runtime["revealed"]:
            return False
        members = self.campaign_members(campaign)
        if len(members) < 2:
            early = float(game.modifiers.get("campaign_early_reveal", 0) or 0)
            if not early or not any(event.investigations > 0 for event in members):
                return False
        runtime["revealed"] = True
        name = str(campaign.get("name", ""))
        actor = str(campaign.get("actor", name))
        text = str(campaign.get("reveal", "")) or (
            f"情报：多起告警来自同一攻击者「{actor}」，已归入战役「{name}」。"
            "控制住任意一处，对方的整体节奏就会被拖慢。"
        )
        game.logs.add(game.turn, settings.clock_text(game.turn), INTEL_CATEGORY, text)
        game.push_message(f"情报确认：多起告警同源于「{actor}」（战役「{name}」）。", settings.PURPLE)
        game.effects.add_banner(f"情报 · {actor}", f"战役「{name}」已被识别", settings.PURPLE)
        return True

    def _alert_for_event(self, event: SecurityEvent) -> Alert | None:
        for alert in reversed(self.alerts):
            if alert.event_id == event.event_id and not alert.resolved:
                return alert
        return None

    def _escalate_campaign(
        self,
        game: "Game",
        campaign: dict[str, Any],
        active: list[SecurityEvent],
    ) -> None:
        name = str(campaign.get("name", ""))
        actor = str(campaign.get("actor", name))
        clock = settings.clock_text(game.turn)
        runtime = self._runtime(campaign)
        style = str(campaign.get("actor_style", "standard"))
        pending = [
            str(item)
            for item in campaign.get("members", [])
            if str(item) not in self.spawned_event_ids
        ]

        # 夜鸦：发现隔离面足够大时，降低活动强度等待窗口，但仍留下可观察线索
        if style == "stealth":
            isolated = sum(1 for device in game.devices.values() if device.isolated)
            tolerance = max(1, int(campaign.get("isolation_tolerance", 2) or 2))
            if isolated >= tolerance and int(runtime.get("waits", 0)) < 2:
                runtime["waits"] = int(runtime.get("waits", 0)) + 1
                clue = (
                    f"情报：{actor} 的活动强度突然下降，但在隔离网段边缘出现低强度探测；"
                    "它可能在等待隔离解除，而不是放弃。"
                )
                game.logs.add(game.turn, clock, INTEL_CATEGORY, clue)
                game.push_message(clue, settings.PURPLE)
                game.effects.add_banner(f"情报 · {actor}", "攻击者转入低强度等待", settings.PURPLE)
                game.record_timeline("actor_wait", f"{actor} 在 {isolated} 台设备隔离后降低活动强度", actor=actor)
                return
            if int(runtime.get("waits", 0)) >= 2:
                runtime["waits"] = 0
                game.logs.add(
                    game.turn,
                    clock,
                    INTEL_CATEGORY,
                    f"情报：{actor} 等不下去了，重新提高活动强度。",
                )

        # 1) 还有没登场的成员：提前它的排期
        for event_id in pending:
            next_turn = game.turn + 1
            scheduled = self.spawn_schedule.get(event_id)
            if scheduled is not None and scheduled <= next_turn:
                continue
            config = self.get_event_config(event_id) or {}
            target_device = game.devices.get(str(config.get("initial_target", "")))
            if style == "aggressive":
                if target_device is not None and target_device.isolated:
                    game.logs.add(
                        game.turn,
                        clock,
                        INTEL_CATEGORY,
                        f"情报：{actor} 避开了已隔离的「{target_device.name}」，正在寻找新的入口。",
                    )
            self.spawn_schedule[event_id] = next_turn
            event_name = str(config.get("name", event_id))
            plan = f"，原计划第 {scheduled} 回合" if scheduled is not None else ""
            self._maybe_reveal_campaign(game, campaign)
            game.logs.add(
                game.turn,
                clock,
                INTEL_CATEGORY,
                f"情报：{actor} 正在加快节奏，「{event_name}」提前到第 {next_turn} 回合{plan}。",
            )
            game.push_message(
                f"情报：{actor} 提前投放「{event_name}」，下一回合就会落地。",
                settings.PURPLE,
            )
            game.effects.add_banner(
                f"情报 · {actor}", f"「{event_name}」提前到第 {next_turn} 回合", settings.PURPLE
            )
            return

        # 2) 成员都已出现：按攻击者性格选择推进目标
        default_target = max(active, key=lambda event: (event.stage_index, -event.start_turn))
        target = default_target
        reason = ""
        if style == "stealth":
            def stealth_score(event: SecurityEvent) -> tuple[int, int, int]:
                alert = self._alert_for_event(event)
                investigated = bool(alert and alert.investigated)
                return (
                    (0 if investigated else 2) + (0 if event.credentials_reset else 1),
                    event.stage_index,
                    -event.start_turn,
                )

            target = max(active, key=stealth_score)
            reason = "尚未调查的入口与可复用凭据"
        elif style == "aggressive":
            candidates = []
            for event in active:
                device = game.devices.get(event.active_device_id)
                if device is None:
                    continue
                if device.online and not device.patched:
                    candidates.append(event)
            if candidates:
                target = max(
                    candidates,
                    key=lambda event: (
                        game.devices[event.active_device_id].importance,
                        game.devices[event.active_device_id].exposure,
                        event.stage_index,
                    ),
                )
                reason = "在线、未打补丁的高价值资产"
            else:
                runtime["waits"] = int(runtime.get("waits", 0)) + 1
                game.logs.add(
                    game.turn,
                    clock,
                    INTEL_CATEGORY,
                    f"情报：{actor} 没有找到可用的未打补丁入口，暂时收手，等待资产重新上线或补丁窗口过去。",
                )
                game.push_message(
                    f"情报：{actor} 暂时收手，已隔离/已修复的资产没有给它可乘之机。",
                    settings.PURPLE,
                )
                if int(runtime.get("waits", 0)) <= 2:
                    return
                game.logs.add(
                    game.turn,
                    clock,
                    INTEL_CATEGORY,
                    f"情报：{actor} 等不下去，重新尝试已暴露的入口。",
                )
        if target is not default_target:
            clue = (
                f"情报：{actor} 在「{default_target.name}」附近留下异常探测流量，"
                f"随后把注意力转向「{target.name}」（{reason}）。目标可能发生变化。"
            )
            game.logs.add(game.turn, clock, INTEL_CATEGORY, clue)
            game.push_message(clue, settings.PURPLE)
            game.effects.add_banner(f"情报 · {actor}", f"攻击焦点转向「{target.name}」", settings.PURPLE)
            runtime["last_switch"] = str(target.event_id)
            runtime["last_target"] = str(target.active_device_id)
            game.record_timeline(
                "actor_switch",
                f"{actor} 从「{default_target.name}」转向「{target.name}」：{reason}",
                actor=actor,
                from_event=default_target.event_id,
                to_event=target.event_id,
            )
        self._maybe_reveal_campaign(game, campaign)
        if target.stage_index >= target.max_stage_index:
            game.logs.add(
                game.turn,
                clock,
                INTEL_CATEGORY,
                f"情报：{actor} 不再等待，对「{target.name}」完成最后一击。",
            )
            game.push_message(f"情报：{actor} 对「{target.name}」完成了最后一击！", settings.RED)
            self._trigger_final_loss(game, target)
            return
        old_name = target.stage_name
        target.advance()
        target.last_advance_turn = game.turn
        game.logs.add(
            game.turn,
            clock,
            INTEL_CATEGORY,
            f"情报：{actor} 绕过轮询节奏，把「{target.name}」从“{old_name}”推进到“{target.stage_name}”。",
        )
        game.push_message(
            f"情报：{actor} 加速推进「{target.name}」到“{target.stage_name}”！", settings.RED
        )
        game.record_timeline(
            "actor_advance",
            f"{actor} 把「{target.name}」推进到「{target.stage_name}」",
            actor=actor,
            event_id=target.event_id,
        )
        self._apply_stage(game, target, old_name)

    # ------------------------------------------------------------------
    # 回合开始
    # ------------------------------------------------------------------
    def start_turn(self, game: "Game") -> None:
        self._flush_pending_logs(game)
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
            campaign = self.campaign_of(event_id)
            if campaign is not None:
                event.campaign_id = str(campaign.get("id", ""))
            self.events.append(event)
            self.spawned_event_ids.add(event_id)
            self._announce_stage(game, event, first=True)
            if campaign is not None:
                # 第二个同源事件出现时，玩家才真正看清“这是一场战役”
                self._maybe_reveal_campaign(game, campaign)

    def _write_log(
        self,
        game: "Game",
        category: str,
        message: str,
        *,
        source: str = "",
        account: str = "",
        ip: str = "",
        delay: bool = False,
    ) -> None:
        mode = getattr(game, "difficulty_mode", None)
        delay_turns = int(getattr(mode, "log_delay", 0) or 0) if delay else 0
        if delay_turns > 0:
            self.pending_logs.append(
                {
                    "due": int(game.turn) + delay_turns,
                    "category": str(category),
                    "message": str(message),
                    "source": str(source),
                    "account": str(account),
                    "ip": str(ip),
                }
            )
            return
        self.logs.add(
            game.turn,
            settings.clock_text(game.turn),
            category,
            message,
            source=source,
            account=account,
            ip=ip,
        )

    def _flush_pending_logs(self, game: "Game") -> None:
        if not self.pending_logs:
            return
        remaining: list[dict[str, Any]] = []
        for item in self.pending_logs:
            if int(item.get("due", 0)) <= int(game.turn):
                game.logs.add(
                    int(game.turn),
                    settings.clock_text(game.turn),
                    str(item.get("category", "系统")),
                    f"[延迟到达] {item.get('message', '')}",
                    source=str(item.get("source", "")),
                    account=str(item.get("account", "")),
                    ip=str(item.get("ip", "")),
                )
            else:
                remaining.append(item)
        self.pending_logs = remaining

    def _announce_stage(self, game: "Game", event: SecurityEvent, first: bool = False) -> None:
        """记录日志、生成告警、推送消息。"""
        clock = settings.clock_text(game.turn)
        stage = event.stage
        device = game.devices.get(event.active_device_id)
        source_name = device.name if device else event.target_id
        self._write_log(
            game,
            "邮件" if event.event_type == "钓鱼邮件" and event.stage_index == 0 else "告警",
            str(stage.get("log", event.name)),
            source=source_name,
            account=event.account,
            ip=event.source_ip,
            delay=True,
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
        game.record_timeline(
            "attack",
            f"攻击「{event.name}」进入「{event.stage_name}」，目标 {source_name}",
            event_id=event.event_id,
            severity=event.severity,
            stage=event.stage_index + 1,
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
            mode = getattr(game, "difficulty_mode", None)
            rate = float(getattr(mode, "false_positive_rate", 0.5) or 0.5)
            should_spawn = (turn - self.last_false_positive_turn >= 2) and self.rng.random() < rate
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
            next_device_id = event.next_device_id
            next_device = game.devices.get(next_device_id) if next_device_id else None
            next_stage = (
                event.stages[event.stage_index + 1]
                if event.stage_index < event.max_stage_index
                else {}
            )
            if (
                next_device is not None
                and not next_device.is_available
                and bool(next_stage.get("spreading", False))
            ):
                reason = "已提前隔离" if next_device.isolated else "已提前关机"
                game.logs.add(
                    game.turn,
                    settings.clock_text(game.turn),
                    "网络",
                    f"{next_device.name} {reason}，{event.name} 无法移动到下一跳，攻击链被拖住。",
                    source=next_device.name,
                )
                game.push_message(
                    f"预判生效：{next_device.name} {reason}，攻击暂时无法进入下一阶段。",
                    settings.GREEN,
                )
                continue

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
            protected = protected or bool(game.modifiers.get("ransom_mitigation", 0))
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
            "pending_logs": [dict(item) for item in self.pending_logs],
            "campaign_runtime": {
                campaign_id: dict(runtime) for campaign_id, runtime in self.campaign_runtime.items()
            },
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
        pending = state.get("pending_logs", [])
        self.pending_logs = [
            dict(item) for item in pending if isinstance(item, dict)
        ] if isinstance(pending, list) else []

        self.events = []
        for event_state in state.get("events", []):
            if not isinstance(event_state, dict):
                continue
            config = self.get_event_config(str(event_state.get("event_id", "")))
            if config is None:
                continue
            event = SecurityEvent(config, spawn_turn=int(event_state.get("start_turn", 1)))
            event.apply_state(event_state)
            event.campaign_id = self.campaign_id_of(event.event_id) or str(
                event_state.get("campaign_id", "")
            )
            self.events.append(event)

        # 战役节奏状态：旧存档没有这段，按默认值重建
        self.campaign_runtime = {
            str(campaign.get("id", "")): self._new_campaign_runtime()
            for campaign in self.campaign_configs
        }
        saved_runtime = state.get("campaign_runtime", {})
        if isinstance(saved_runtime, dict):
            for campaign_id, runtime in saved_runtime.items():
                if campaign_id not in self.campaign_runtime or not isinstance(runtime, dict):
                    continue
                restored = self._new_campaign_runtime()
                restored["momentum"] = max(0, int(runtime.get("momentum", 0) or 0))
                restored["escalations"] = max(0, int(runtime.get("escalations", 0) or 0))
                restored["revealed"] = bool(runtime.get("revealed", False))
                restored["settled"] = bool(runtime.get("settled", False))
                restored["waits"] = max(0, int(runtime.get("waits", 0) or 0))
                restored["last_switch"] = str(runtime.get("last_switch", ""))
                restored["last_target"] = str(runtime.get("last_target", ""))
                self.campaign_runtime[campaign_id] = restored

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
