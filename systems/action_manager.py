# -*- coding: utf-8 -*-
"""玩家操作管理：可用性判断、资源消耗与效果结算。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import settings
from models.alert import Alert
from models.device import Device
from models.player_state import MetricKey

if TYPE_CHECKING:  # 仅用于类型提示
    from game import Game

# 标准难度只给“处置方向”，不直接列出完整步骤
DIRECTION_BY_TYPE = {
    "钓鱼邮件": "先确认投递范围与发件来源，再决定删除邮件、封禁来源或隔离终端；不要直接关停邮件服务器。",
    "异常登录": "先确认账号是否失陷，再重置凭据、踢出会话；必要时隔离登录来源。",
    "模拟勒索软件": "优先控制扩散并保护备份，再清除；不要在扩散中先删文件。",
    "Web 流量异常": "先确认对外服务与补丁状态，再考虑限流、隔离 Web 或封禁来源。",
    "内部账号异常访问": "先核实账号行为与数据范围，再重置凭据、限制导出。",
    "零日漏洞": "优先隔离高价值节点、保护备份，等待补丁窗口；不要只封 IP。",
}

ZONE_BY_DEVICE = {
    "GW-01": "办公网出口",
    "MAIL-01": "邮件网关",
    "WEB-01": "对外 Web",
    "PC-01": "办公终端",
    "PC-02": "办公终端",
    "FIN-01": "财务终端",
    "DB-01": "数据库区",
    "BAK-01": "备份区",
}

# 专家模式的噪声线索：明确标注“未验证”，可能与真实证据冲突
NOISE_CLUES = (
    "同一时间戳附近还有 3 条低危告警，来源尚未核实",
    "日志中有一段响应时间异常，可能只是业务高峰",
    "该账号在另一台设备上有一次正常登录记录，时间接近",
    "来源 IP 的归属信息与告警描述不完全一致",
    "终端上存在一个未签名的计划任务，但无法确认是否与本次事件有关",
)


def _zone_of(device_id: str) -> str:
    return ZONE_BY_DEVICE.get(str(device_id), "未知网段")


@dataclass
class Target:
    """当前选中的操作目标：告警或设备。"""

    kind: str
    alert: Alert | None = None
    device: Device | None = None

    @property
    def label(self) -> str:
        if self.kind == "alert" and self.alert is not None:
            return f"告警「{self.alert.title}」"
        if self.kind == "device" and self.device is not None:
            return f"设备 {self.device.name}"
        return "未选择目标"


@dataclass
class ActionOption:
    """界面上的一颗操作按钮。"""

    action_id: str
    name: str
    ap_cost: int
    money_cost: int
    enabled: bool
    reason: str
    handler_name: str


@dataclass
class ActionResult:
    success: bool
    message: str
    executed: bool = True


class ActionManager:
    """集中管理所有操作，避免逻辑散落在界面代码里。"""

    # 操作元数据：ID -> (显示名, 行动点, 资金, 处理方法名)
    ACTIONS = {
        "investigate": ("调查告警", settings.COST_INVESTIGATE[0], settings.COST_INVESTIGATE[1], "_investigate"),
        "delete_mail": ("删除可疑邮件", settings.COST_DELETE_MAIL[0], settings.COST_DELETE_MAIL[1], "_delete_mail"),
        "reset_password": (
            "重置账号密码",
            settings.COST_RESET_PASSWORD[0],
            settings.COST_RESET_PASSWORD[1],
            "_reset_password",
        ),
        "block_source": ("封禁来源 IP", settings.COST_BLOCK_SOURCE[0], settings.COST_BLOCK_SOURCE[1], "_block_source"),
        "isolate": ("隔离设备", settings.COST_ISOLATE[0], settings.COST_ISOLATE[1], "_isolate_device"),
        "unisolate": ("解除隔离", settings.COST_UNISOLATE[0], settings.COST_UNISOLATE[1], "_unisolate_device"),
        "eradicate": ("清除威胁", settings.COST_ERADICATE[0], settings.COST_ERADICATE[1], "_eradicate_device"),
        "patch": ("安装安全补丁", settings.COST_PATCH[0], settings.COST_PATCH[1], "_patch_device"),
        "shutdown": ("关闭服务器", settings.COST_SHUTDOWN[0], settings.COST_SHUTDOWN[1], "_shutdown_device"),
        "startup": ("启动服务器", settings.COST_STARTUP[0], settings.COST_STARTUP[1], "_startup_device"),
        "restore_backup": ("从备份恢复", settings.COST_RESTORE[0], settings.COST_RESTORE[1], "_restore_backup"),
        "protect_backup": (
            "保护备份服务器",
            settings.COST_PROTECT_BACKUP[0],
            settings.COST_PROTECT_BACKUP[1],
            "_protect_backup",
        ),
    }

    ALERT_ACTION_ORDER = ("investigate", "delete_mail", "reset_password", "block_source")

    # ------------------------------------------------------------------
    # 生成按钮
    # ------------------------------------------------------------------
    def options_for(self, game: "Game", target: Target | None) -> list[ActionOption]:
        if target is None:
            return []
        options: list[ActionOption] = []
        if target.kind == "alert" and target.alert is not None:
            event = game.event_for_alert(target.alert)
            if event is not None and event.contained and not event.eradicated:
                options.append(self._build("eradicate", game, target))
                if target.device is not None:
                    options.append(
                        self._build("unisolate" if target.device.isolated else "isolate", game, target)
                    )
                return options
            for action_id in self.ALERT_ACTION_ORDER:
                options.append(self._build(action_id, game, target))
            if target.device is not None:
                options.append(self._build("unisolate" if target.device.isolated else "isolate", game, target))
                if (
                    event is not None
                    and event.event_type in ("Web 流量异常", "零日漏洞")
                    and event.active_device_id == target.device.device_id
                    and not target.device.patched
                ):
                    options.append(self._build("patch", game, target))
        elif target.kind == "device" and target.device is not None:
            options.extend(self._device_options(game, target))
        return options

    def _device_options(self, game: "Game", target: Target) -> list[ActionOption]:
        """设备相关的操作最多 6 个，刚好放进 3×2 操作面板。"""
        device = target.device
        if device is None:
            return []
        action_ids: list[str] = []
        if game.controlled_events_for_device(device.device_id):
            action_ids.append("eradicate")
        if device.isolated:
            action_ids.append("unisolate")
        elif device.online:
            action_ids.append("isolate")
        if device.can_shutdown:
            action_ids.append("startup" if not device.online else "shutdown")
        if not device.patched:
            action_ids.append("patch")
        if device.backups:
            action_ids.append("restore_backup")
        if device.device_id == "BAK-01" and not device.backup_protected:
            action_ids.append("protect_backup")
        return [self._build(action_id, game, target) for action_id in action_ids[:6]]

    def _build(self, action_id: str, game: "Game", target: Target) -> ActionOption:
        name, ap_cost, money_cost, handler_name = self.ACTIONS[action_id]
        # 安全加固会改变部分操作的成本（效果表定义见 data/upgrades.json）
        mods = game.modifiers
        if action_id == "investigate":
            money_cost = max(0, money_cost + int(mods.get("investigate_money", 0)))
        if action_id == "isolate":
            ap_cost = max(1, ap_cost + int(mods.get("isolate_ap", 0)))
        if action_id == "block_source":
            ap_cost = max(0, ap_cost + int(mods.get("block_source_ap", 0)))
            if "block_source_money" in mods:
                money_cost = max(0, int(mods["block_source_money"]))
        if action_id == "eradicate":
            ap_cost = max(1, ap_cost + int(mods.get("eradicate_ap", 0)))
            money_cost = max(0, money_cost + int(mods.get("eradicate_money", 0)))
        enabled, reason = self._check(action_id, game, target)
        if enabled and not game.player.can_pay(ap_cost, money_cost):
            if game.player.action_points < ap_cost:
                enabled, reason = False, f"行动点不足（需要 {ap_cost} 点）"
            else:
                enabled, reason = False, f"资金不足（需要 ¥{money_cost}）"
        return ActionOption(
            action_id=action_id,
            name=name,
            ap_cost=ap_cost,
            money_cost=money_cost,
            enabled=enabled,
            reason=reason,
            handler_name=handler_name,
        )

    def _check(self, action_id: str, game: "Game", target: Target) -> tuple[bool, str]:
        alert = target.alert
        device = target.device
        event = game.event_for_alert(alert) if alert is not None else None

        if action_id == "investigate":
            if alert is None:
                return False, "请先选择一条告警"
            if alert.resolved:
                return False, "该告警已经处置完成"
            if alert.investigated:
                return False, "该告警已经调查过，线索已记录"
            return True, ""

        if action_id == "delete_mail":
            if alert is None:
                return False, "请先选择一条告警"
            if not alert.investigated:
                return False, "请先调查告警，确认这是否真的是钓鱼邮件"
            if event is None:
                return False, "该告警与钓鱼邮件事件无关"
            if not event.is_active:
                return False, "相关事件已经结束"
            if event.event_type != "钓鱼邮件":
                return False, "只有钓鱼邮件类事件可以删除邮件"
            if event.stage_index > 1:
                return False, "事件已进入后期阶段，删除邮件无法阻止攻击"
            return True, ""

        if action_id == "reset_password":
            if alert is None:
                return False, "请先选择一条告警"
            if not alert.investigated:
                return False, "请先调查告警，确认账号是否真的异常"
            if event is None:
                return False, "该告警不涉及任何账号凭据"
            if not event.is_active:
                return False, "相关事件已经结束"
            if event.credentials_reset:
                return False, "该事件的账号密码已经重置过"
            if event.event_type not in ("钓鱼邮件", "异常登录", "内部账号异常访问"):
                return False, "该事件无法通过重置密码阻断"
            if event.stage_index == 0 and event.event_type == "钓鱼邮件":
                return False, "尚未发现凭据泄露，重置密码暂时无效"
            if event.stage_index > 2:
                return False, "攻击者已建立外联，重置密码无法立即阻断"
            return True, ""

        if action_id == "block_source":
            if alert is None:
                return False, "请先选择一条告警"
            if not alert.source_ip:
                return False, "该告警没有可封禁的外部来源地址"
            if event is not None and not event.is_active:
                return False, "相关事件已经结束"
            if event is not None and event.source_blocked:
                return False, "该来源地址已经封禁"
            return True, ""

        if action_id == "isolate":
            if device is None:
                return False, "请先选择一台设备"
            if device.isolated:
                return False, "设备已处于隔离状态，请使用“解除隔离”"
            if not device.online:
                return False, "设备已经关机，无法再隔离"
            return True, ""

        if action_id == "eradicate":
            if alert is not None:
                event = game.event_for_alert(alert)
                if event is None or not event.contained or event.eradicated:
                    return False, "该告警没有已控制、等待清除的事件"
                return True, ""
            if device is None:
                return False, "请先选择一台设备"
            if not game.controlled_events_for_device(device.device_id):
                return False, "该设备没有已控制、等待清除的事件"
            return True, ""

        if action_id == "unisolate":
            if device is None:
                return False, "请先选择一台设备"
            if not device.isolated:
                return False, "设备未处于隔离状态"
            return True, ""

        if action_id == "patch":
            if device is None:
                return False, "请先选择一台设备"
            if device.patched:
                return False, "设备已安装最新补丁"
            if not device.online:
                return False, "设备已关机，无法在线安装补丁"
            return True, ""

        if action_id == "shutdown":
            if device is None:
                return False, "请先选择一台设备"
            if not device.can_shutdown:
                return False, "该设备不支持远程关机"
            if device.isolated:
                return False, "设备已隔离，请先解除隔离"
            if not device.online:
                return False, "设备已经关机"
            return True, ""

        if action_id == "startup":
            if device is None:
                return False, "请先选择一台设备"
            if device.online:
                return False, "设备已经在线"
            if device.isolated:
                return False, "设备已隔离，请先解除隔离"
            return True, ""

        if action_id == "restore_backup":
            if device is None:
                return False, "请先选择一台设备"
            if not device.backups:
                return False, "该设备没有可用备份"
            if (
                device.health >= 100
                and device.status == "正常"
                and game.player.integrity >= 100
            ):
                return False, "数据完好，暂不需要恢复"
            return True, ""

        if action_id == "protect_backup":
            if device is None:
                return False, "请先选择一台设备"
            if device.device_id != "BAK-01":
                return False, "只有备份服务器需要执行该操作"
            if device.backup_protected:
                return False, "备份服务器已经处于保护状态"
            return True, ""

        return False, "未知操作"

    # ------------------------------------------------------------------
    # 执行
    # ------------------------------------------------------------------
    def execute(self, game: "Game", option: ActionOption, target: Target) -> ActionResult:
        if not option.enabled:
            return ActionResult(False, option.reason, executed=False)
        if not game.spend_resources(option.ap_cost, option.money_cost, f"执行「{option.name}」"):
            return ActionResult(False, "行动点或资金不足，操作未执行", executed=False)

        game.player.stats["actions_used"] = game.player.stats.get("actions_used", 0) + 1
        game.logs.add(
            game.turn,
            settings.clock_text(game.turn),
            "操作",
            f"执行「{option.name}」，目标：{target.label}（行动点 -{option.ap_cost}，资金 -¥{option.money_cost}）",
            source=target.device.name if target.device else "",
        )
        handler = getattr(self, option.handler_name)
        result: ActionResult = handler(game, target)
        if result.success:
            game.record_timeline(
                "action",
                f"{option.name}：{target.label}",
                action_id=option.action_id,
                success=True,
            )
        else:
            game.player.stats["invalid_actions"] = game.player.stats.get("invalid_actions", 0) + 1
            game.record_timeline(
                "mistake",
                f"{option.name} 未生效：{result.message}",
                action_id=option.action_id,
                success=False,
            )
        game.push_message(result.message, settings.GREEN if result.success else settings.YELLOW)
        return result

    @staticmethod
    def _false_penalty(game: "Game", base: int) -> int:
        """误封/误停的声誉代价：难度 × 响应流的自动化副作用。"""
        mode = game.difficulty_mode
        extra = float(game.modifiers.get("false_isolation_penalty", 0.0))
        return max(1, int(round(base * max(1.0, mode.false_isolation_penalty) + extra)))

    # ------------------------------------------------------------------
    # 具体操作效果
    # ------------------------------------------------------------------
    def _investigate(self, game: "Game", target: Target) -> ActionResult:
        alert = target.alert
        assert alert is not None
        stats = game.player.stats
        stats["investigations"] = stats.get("investigations", 0) + 1

        if alert.false_positive:
            alert.mark_investigated("误报")
            stats["false_positives_checked"] = stats.get("false_positives_checked", 0) + 1
            game.logs.add(
                game.turn,
                settings.clock_text(game.turn),
                "告警",
                f"调查结论：{alert.title} 为误报。{alert.conclusion}",
                source=alert.target_id,
                ip=alert.source_ip,
            )
            return ActionResult(True, f"调查完成：该告警是误报。{alert.conclusion}")

        event = game.event_for_alert(alert)
        alert.mark_investigated("真实威胁")
        if event is None:
            return ActionResult(True, "调查确认该告警指向真实威胁，但未关联到具体事件记录。")

        event.investigations += 1
        if event.response_turn is None:
            event.response_turn = max(1, game.turn - event.start_turn + 1)
            stats["response_turns"].append(event.response_turn)
        mode = game.difficulty_mode
        # 威胁情报订阅：一次调查可以多拿到线索，但仍受该阶段线索总数限制
        extra_clues = max(0, int(game.modifiers.get("extra_clue", 0)))
        revealed = [event.reveal_next_clue() for _ in range(1 + extra_clues)]
        clues = [str(item) for item in revealed if item]
        clue = "；".join(clues) if clues else "暂未获得新的可观察线索。"
        noise: list[str] = []
        if mode.clue_noise > 0:
            for _ in range(mode.clue_noise):
                noise.append(f"未验证：{game.rng.choice(NOISE_CLUES)}")
        device = game.devices.get(event.active_device_id)
        source_name = device.name if device else event.target_id
        low, high, confidence = game.risk.estimate(
            event,
            device,
            game.turn,
            game.confidence_bonus,
            mode.risk_scale,
        )
        game.logs.add(
            game.turn,
            settings.clock_text(game.turn),
            "告警",
            f"调查确认「{event.name}」为真实威胁。新线索：{clue}",
            source=source_name,
            account=event.account,
            ip=event.source_ip,
        )
        if mode.recommendations == "full":
            recommended = "、".join(str(item) for item in event.stage.get("recommended", []))
            if recommended:
                game.logs.add(
                    game.turn,
                    settings.clock_text(game.turn),
                    "告警",
                    f"建议处置：{recommended}。",
                    source=source_name,
                )
            warning = event.stage_text("wrong_action", "")
            if warning:
                game.logs.add(
                    game.turn,
                    settings.clock_text(game.turn),
                    "告警",
                    f"风险提示：{warning}",
                    source=source_name,
                )
        elif mode.recommendations == "direction":
            direction = DIRECTION_BY_TYPE.get(
                event.event_type,
                "先确认证据，再决定控制或清除；不要只凭告警等级行动。",
            )
            game.logs.add(
                game.turn,
                settings.clock_text(game.turn),
                "告警",
                f"处置方向：{direction}",
                source=source_name,
            )
        else:
            game.logs.add(
                game.turn,
                settings.clock_text(game.turn),
                "告警",
                "处置建议：证据不足，无法判断完整处置顺序；先继续调查或加固情报。",
                source=source_name,
            )
        if mode.next_hop == "exact" and event.next_device_id:
            next_device = game.devices.get(event.next_device_id)
            next_name = next_device.name if next_device else event.next_device_id
            game.logs.add(
                game.turn,
                settings.clock_text(game.turn),
                "告警",
                f"预测下一跳：{next_name}（{event.next_stage_name}）。提前隔离可拖住攻击。",
                source=source_name,
            )
        elif mode.next_hop == "direction" and event.next_device_id:
            intel_detail = float(game.modifiers.get("next_hop_detail", 0) or 0) > 0
            if intel_detail:
                next_device = game.devices.get(event.next_device_id)
                next_name = next_device.name if next_device else event.next_device_id
                game.logs.add(
                    game.turn,
                    settings.clock_text(game.turn),
                    "告警",
                    f"情报插件推断下一跳：{next_name}（{event.next_stage_name}）。",
                    source=source_name,
                )
            else:
                game.logs.add(
                    game.turn,
                    settings.clock_text(game.turn),
                    "告警",
                    f"下一跳方向：可能在{_zone_of(event.next_device_id)}，具体设备还需要更多证据。",
                    source=source_name,
                )
        elif mode.next_hop == "none" and event.next_device_id:
            intel_detail = float(game.modifiers.get("next_hop_detail", 0) or 0) > 0
            game.logs.add(
                game.turn,
                settings.clock_text(game.turn),
                "告警",
                f"下一跳方向：可能在{_zone_of(event.next_device_id)}，无法确认具体设备。"
                if intel_detail
                else "下一跳：证据不足，无法判断方向。",
                source=source_name,
            )
        related = game.related_alerts(alert)
        if related:
            game.logs.add(
                game.turn,
                settings.clock_text(game.turn),
                "告警",
                f"情报关联：发现 {len(related)} 条同源/同账号告警，可能属于同一攻击活动。",
                source=source_name,
            )
        if mode.recommendations == "full":
            spread_condition = str(event.config.get("spread_condition", ""))
            if spread_condition:
                game.logs.add(
                    game.turn,
                    settings.clock_text(game.turn),
                    "告警",
                    f"传播条件：{spread_condition}",
                    source=source_name,
                )
        for item in noise:
            game.logs.add(
                game.turn,
                settings.clock_text(game.turn),
                "告警",
                item,
                source=source_name,
            )
        if noise:
            game.logs.add(
                game.turn,
                settings.clock_text(game.turn),
                "告警",
                "情报提示：以上含未验证线索，可能与真实证据冲突；建议交叉验证后再处置。",
                source=source_name,
            )
        message = (
            f"确认「{event.name}」是真实威胁。新线索：{clue}｜风险估计 {low}~{high}"
            f"（置信度 {confidence}%）。"
        )
        if mode.recommendations == "direction":
            message += " 情报只给出处置方向，完整步骤需要自行判断。"
        elif mode.recommendations == "none":
            message += " 证据不足，无法给出完整处置顺序。"
        if noise:
            message += " 其中含有未验证线索。"
        game.record_timeline(
            "investigate",
            f"调查「{event.name}」：线索 {event.revealed_clues}/{event.total_clues}，风险 {low}~{high}",
        )
        return ActionResult(True, message)

    def _delete_mail(self, game: "Game", target: Target) -> ActionResult:
        alert = target.alert
        event = game.event_for_alert(alert)
        assert event is not None
        if event.stage_index <= 1:
            success_text = event.stage_text("success", "邮件在附件被打开前删除，事件被阻断。")
            game.eradicate_event(event, "删除可疑邮件", security_gain=4)
            return ActionResult(True, f"已删除可疑邮件并从网关拦截。{success_text}")
        return ActionResult(False, "邮件已删除，但凭据已在更早阶段泄露，攻击链仍在继续。")

    def _reset_password(self, game: "Game", target: Target) -> ActionResult:
        event = game.event_for_alert(target.alert)
        assert event is not None
        event.credentials_reset = True
        game.eradicate_event(event, "重置账号密码", security_gain=3)
        return ActionResult(
            True,
            f"已重置 {event.account or '相关账号'} 的密码并踢出现有会话，攻击者持有的凭据失效。",
        )

    def _block_source(self, game: "Game", target: Target) -> ActionResult:
        alert = target.alert
        assert alert is not None
        if alert.false_positive:
            penalty = 6 + max(0, int(game.modifiers.get("false_block_penalty", 0) or 0))
            game.adjust_metric(
                MetricKey.REPUTATION, -penalty, f"封禁合作方地址 {alert.source_ip}，正常业务中断"
            )
            game.player.stats["false_isolation_loss"] = (
                game.player.stats.get("false_isolation_loss", 0) + penalty
            )
            game.break_combo("误封合作方地址")
            game.record_timeline(
                "false_isolation",
                f"误封合作方地址 {alert.source_ip}：声誉 -{penalty}",
                alert_id=alert.alert_id,
            )
            return ActionResult(
                False,
                f"已封禁 {alert.source_ip}，但该地址属于合作方，接口调用失败，声誉下降。",
            )
        event = game.event_for_alert(alert)
        if event is None:
            return ActionResult(False, "已封禁来源地址，但未找到关联事件记录。")
        if event.stage_index <= 2:
            event.source_blocked = True
            game.contain_event(event, "封禁来源 IP", security_gain=2)
            return ActionResult(True, f"已封禁 {alert.source_ip}，攻击者的外部通道被切断。")
        event.source_blocked = True
        return ActionResult(
            False,
            f"已封禁 {alert.source_ip}，但当前外联会话已经建立，攻击仍在重试，需要隔离目标设备。",
        )

    def _isolate_device(self, game: "Game", target: Target) -> ActionResult:
        device = target.device
        assert device is not None
        device.isolate()
        game.recompute_availability(f"隔离 {device.name}，相关业务中断")
        events = game.events_for_device(device.device_id)
        if events:
            for event in events:
                game.contain_event(event, "隔离设备", security_gain=2, device_id=device.device_id)
            names = "、".join(event.name for event in events)
            impact = game.services.impact_for_device(device.device_id, game.devices)
            suffix = f" 业务影响：{impact}。" if impact else ""
            return ActionResult(
                True,
                f"{device.name} 已隔离，切断了「{names}」的攻击路径；攻击已控制，仍需清除根因。{suffix}",
            )
        if game.has_event_relation(device.device_id):
            return ActionResult(
                True,
                f"{device.name} 已隔离。该设备与近期事件相关，但当前没有以它为主链的活动攻击。",
            )
        game.adjust_metric(MetricKey.REPUTATION, -5, f"误封 {device.name}，影响正常业务")
        penalty = self._false_penalty(game, 5)
        lost = game.adjust_metric(MetricKey.REPUTATION, -(penalty - 5), f"误封代价：{device.name}")
        game.player.stats["false_isolation_loss"] = (
            game.player.stats.get("false_isolation_loss", 0) + max(5, penalty)
        )
        game.player.stats["false_isolations"] = game.player.stats.get("false_isolations", 0) + 1
        game.break_combo("误封设备")
        game.record_timeline(
            "false_isolation",
            f"误封 {device.name}：声誉 -{max(5, penalty)}，业务受影响",
            device_id=device.device_id,
        )
        return ActionResult(
            False,
            f"{device.name} 已隔离，但没有发现该设备相关的活动事件，可能属于误封，声誉下降。",
        )

    def _eradicate_device(self, game: "Game", target: Target) -> ActionResult:
        device = target.device
        if target.kind == "alert":
            event = game.event_for_alert(target.alert)
            if event is None or not event.contained or event.eradicated:
                return ActionResult(False, "该告警没有已控制、等待清除的事件。")
            events = [event]
            device = game.devices.get(event.active_device_id)
        else:
            if device is None:
                return ActionResult(False, "请先选择一台设备。")
            events = game.controlled_events_for_device(device.device_id)
        if not events:
            return ActionResult(False, "该设备没有已控制、等待清除的事件。")
        for event in events:
            game.eradicate_event(event, "清除威胁", security_gain=3, device_id=device.device_id if device else "")
        names = "、".join(event.name for event in events)
        target_name = device.name if device else "目标设备"
        return ActionResult(
            True,
            f"{target_name} 上的「{names}」已完成取证与清除；现在可以恢复业务。",
        )

    def _patch_device(self, game: "Game", target: Target) -> ActionResult:
        device = target.device
        assert device is not None
        device.apply_patch()
        game.adjust_metric(MetricKey.SECURITY, 1, f"修补 {device.name} 的已知漏洞")
        game.recompute_availability(f"{device.name} 安装补丁，进入短暂维护")
        web_events = [
            event
            for event in game.events_for_device(device.device_id)
            if (
                (event.event_type == "Web 流量异常" and event.stage_index <= 2)
                or (event.event_type == "零日漏洞" and event.stage_index <= 1)
            )
        ]
        if web_events:
            for event in web_events:
                game.eradicate_event(event, "安装安全补丁", security_gain=2, device_id=device.device_id)
            return ActionResult(
                True,
                f"{device.name} 补丁/缓解措施安装完成，漏洞利用链被清除；维护期间可用性略降。",
            )
        return ActionResult(
            True,
            f"{device.name} 补丁安装完成，漏洞已修补；未来被利用的风险降低，维护期间可用性略降。",
        )

    def _shutdown_device(self, game: "Game", target: Target) -> ActionResult:
        device = target.device
        assert device is not None
        device.shutdown()
        game.recompute_availability(f"关闭 {device.name}，业务服务中断")
        events = game.events_for_device(device.device_id)
        if events:
            for event in events:
                game.contain_event(event, "关闭服务器", security_gain=1, device_id=device.device_id)
            names = "、".join(event.name for event in events)
            impact = game.services.impact_for_device(device.device_id, game.devices)
            suffix = f" 业务影响：{impact}。" if impact else ""
            return ActionResult(
                True,
                f"{device.name} 已关停，攻击链「{names}」被控制；仍需清除根因。{suffix}",
            )
        game.adjust_metric(MetricKey.REPUTATION, -4, f"无事件时关停 {device.name}，业务中断")
        game.player.stats["false_isolations"] = game.player.stats.get("false_isolations", 0) + 1
        game.break_combo("无必要关停")
        return ActionResult(
            False,
            f"{device.name} 已关停，但没有需要关停的攻击链，业务中断导致声誉下降。",
        )

    def _startup_device(self, game: "Game", target: Target) -> ActionResult:
        device = target.device
        assert device is not None
        device.startup()
        game.recompute_availability(f"启动 {device.name}，业务恢复")
        resumed = game.resume_events_on(device.device_id, method="关闭服务器")
        if resumed:
            return ActionResult(
                False,
                f"{device.name} 已重新启动，但之前被压制的「{'、'.join(resumed)}」重新活跃！",
            )
        return ActionResult(True, f"{device.name} 已重新启动，服务可用性回升。")

    def _restore_backup(self, game: "Game", target: Target) -> ActionResult:
        device = target.device
        assert device is not None
        device.consume_backup()
        device.health = 100
        if device.status == "感染":
            device.set_status("可疑")
        gain = 8 + int(game.modifiers.get("restore_integrity", 0))
        game.adjust_metric(MetricKey.INTEGRITY, gain, f"从 {device.name} 的备份恢复数据")
        game.recompute_availability(f"{device.name} 从备份恢复，业务重新校验")
        return ActionResult(
            True,
            f"{device.name} 已从备份恢复，数据完整度 +{gain}；该备份快照已被消耗。",
        )

    def _protect_backup(self, game: "Game", target: Target) -> ActionResult:
        device = target.device
        assert device is not None
        device.protect_backup()
        game.adjust_metric(MetricKey.SECURITY, 1, "备份服务器启用离线保护")
        game.adjust_metric(MetricKey.INTEGRITY, 2, "备份快照完成完整性校验")
        return ActionResult(
            True,
            "备份服务器已切换为离线保护模式：勒索软件造成的数据损失将大幅降低。",
        )

    def _unisolate_device(self, game: "Game", target: Target) -> ActionResult:
        device = target.device
        assert device is not None
        device.restore()
        game.recompute_availability(f"解除隔离 {device.name}，业务恢复")
        resumed = game.resume_events_on(device.device_id)
        if resumed:
            return ActionResult(
                False,
                f"{device.name} 已恢复上线，但隔离解除后事件「{'、'.join(resumed)}」重新活跃！",
            )
        return ActionResult(True, f"{device.name} 已恢复上线，业务可用性回升。")
