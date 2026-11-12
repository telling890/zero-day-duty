# -*- coding: utf-8 -*-
"""JSON 存档与历史排行榜。

存档文件默认位于 exe/项目目录下的 saves/，包含全部运行期状态；
历史排行榜只保存结算记录，不保存完整对局。
"""

from __future__ import annotations

import json
import random
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import settings
from models.device import Device
from models.player_state import PlayerState
from systems.event_manager import EventManager
from systems.log_system import LogSystem

if TYPE_CHECKING:
    from game import Game


SAVE_VERSION = 1


def _encode_rng(state: object) -> list[Any]:
    version, internal, gauss = state  # type: ignore[misc]
    return [int(version), [int(item) for item in internal], gauss]


def _decode_rng(data: object) -> tuple[int, tuple[int, ...], object]:
    if not isinstance(data, list) or len(data) < 2:
        raise ValueError("随机数状态格式不正确")
    return (int(data[0]), tuple(int(item) for item in data[1]), data[2] if len(data) > 2 else None)


class SaveManager:
    def __init__(
        self,
        save_path: Path | str | None = None,
        history_path: Path | str | None = None,
    ) -> None:
        self.save_path = Path(save_path or settings.SAVE_FILE)
        self.history_path = Path(history_path or settings.HISTORY_FILE)

    # ------------------------------------------------------------------
    def has_save(self) -> bool:
        try:
            return self.save_path.is_file() and self.save_path.stat().st_size > 20
        except OSError:
            return False

    def _write_json(self, path: Path, data: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temp.replace(path)

    # ------------------------------------------------------------------
    def save(self, game: "Game") -> tuple[bool, str]:
        if getattr(game, "tutorial_mode", False):
            return False, "实战演练中不支持保存"
        if game.state.value not in ("playing", "paused"):
            return False, "只能在值班进行中保存"
        data = {
            "version": SAVE_VERSION,
            "saved_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "seed": game.seed,
            "turn": game.turn,
            "difficulty": game.difficulty_id,
            "hints_used": int(game.hints_used),
            "timeline": [dict(item) for item in game.timeline],
            "pending_delayed": [dict(item) for item in game.pending_delayed],
            "decision_history": [dict(item) for item in game.decision_history],
            "rng_state": _encode_rng(game.rng.getstate()),
            "player": game.player.to_dict(),
            "devices": {device_id: device.to_state() for device_id, device in game.devices.items()},
            "event_manager": game.events.to_state(),
            "logs": [
                {
                    "turn": entry.turn,
                    "clock": entry.clock,
                    "category": entry.category,
                    "message": entry.message,
                    "source": entry.source,
                    "account": entry.account,
                    "ip": entry.ip,
                }
                for entry in game.logs.entries
            ],
            "messages": [
                {"text": item["text"], "color": list(item["color"]), "turn": item["turn"]}
                for item in game.messages
            ],
            "flags": {
                "data_leak": game.data_leak,
                "ransomware_failed": game.ransomware_failed,
                "security_breach": game.security_breach,
                "low_availability_turns": game.low_availability_turns,
                "combo": game.combo,
                "best_combo": game.best_combo,
                "seen_decisions": sorted(game.seen_decisions),
            },
        }
        try:
            self._write_json(self.save_path, data)
        except OSError as exc:
            return False, f"写入存档失败：{exc}"
        return True, f"已保存到 {self.save_path}"

    # ------------------------------------------------------------------
    def load(self, game: "Game") -> tuple[bool, str]:
        if not self.has_save():
            return False, "没有找到存档"
        try:
            data = json.loads(self.save_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return False, f"读取存档失败：{exc}"
        if not isinstance(data, dict):
            return False, "存档格式不正确"
        if int(data.get("version", -1)) != SAVE_VERSION:
            return False, "存档版本不兼容，请重新开始一局"

        try:
            configs = {config["id"]: config for config in game._device_configs}
            devices: dict[str, Device] = {}
            for device_id, state in dict(data.get("devices", {})).items():
                config = configs.get(str(device_id))
                if config is None or not isinstance(state, dict):
                    continue
                device = Device.from_config(config)
                device.apply_state(state)
                devices[str(device_id)] = device
            if not devices:
                return False, "存档中没有可用的设备数据"

            player = PlayerState.from_dict(dict(data.get("player", {})))
            turn = int(data.get("turn", 1))
            seed = int(data.get("seed", game.seed))
            rng = random.Random()
            saved_rng_state = _decode_rng(data.get("rng_state"))
            rng.setstate(saved_rng_state)  # type: ignore[arg-type]

            logs = LogSystem()
            for entry_data in data.get("logs", []):
                if not isinstance(entry_data, dict):
                    continue
                logs.add(
                    int(entry_data.get("turn", 0)),
                    str(entry_data.get("clock", "")),
                    str(entry_data.get("category", "系统")),
                    str(entry_data.get("message", "")),
                    source=str(entry_data.get("source", "")),
                    account=str(entry_data.get("account", "")),
                    ip=str(entry_data.get("ip", "")),
                )

            events = EventManager(game._event_payload, rng, logs)
            manager_state = data.get("event_manager", {})
            if isinstance(manager_state, dict):
                events.apply_state(manager_state)
            # EventManager 初始化时可能会打乱事件顺序，这里恢复存档时的随机数状态
            rng.setstate(saved_rng_state)  # type: ignore[arg-type]

            messages: list[dict[str, Any]] = []
            for item in data.get("messages", []):
                if not isinstance(item, dict):
                    continue
                color = item.get("color", list(settings.TEXT))
                if not isinstance(color, (list, tuple)) or len(color) != 3:
                    color = settings.TEXT
                messages.append(
                    {
                        "text": str(item.get("text", "")),
                        "color": tuple(int(channel) for channel in color),
                        "turn": int(item.get("turn", turn)),
                    }
                )

            flags = data.get("flags", {})
            if not isinstance(flags, dict):
                flags = {}

            # 所有数据解析成功后再写入 Game，避免半加载状态
            game.seed = seed
            game.rng = rng
            game.difficulty_id = game.difficulty_set.get(
                str(data.get("difficulty", game.difficulty_set.default_id))
            ).mode_id
            game.hints_used = max(0, int(data.get("hints_used", 0)))
            game.timeline = [
                dict(item) for item in data.get("timeline", []) if isinstance(item, dict)
            ] if isinstance(data.get("timeline"), list) else []
            game.pending_delayed = [
                dict(item) for item in data.get("pending_delayed", []) if isinstance(item, dict)
            ] if isinstance(data.get("pending_delayed"), list) else []
            game.decision_history = [
                dict(item) for item in data.get("decision_history", []) if isinstance(item, dict)
            ] if isinstance(data.get("decision_history"), list) else []
            game.devices = devices
            game.player = player
            game.player.turn = turn
            game.turn = turn
            game.logs = logs
            game.events = events
            game.messages.clear()
            game.messages.extend(messages[-120:])
            game.data_leak = bool(flags.get("data_leak", False))
            game.ransomware_failed = bool(flags.get("ransomware_failed", False))
            game.security_breach = bool(flags.get("security_breach", False))
            game.low_availability_turns = int(flags.get("low_availability_turns", 0))
            game.combo = int(flags.get("combo", 0))
            game.best_combo = int(flags.get("best_combo", 0))
            seen = flags.get("seen_decisions", [])
            game.seen_decisions = {str(item) for item in seen} if isinstance(seen, list) else set()
            game.report = None
            game.selected_alert = None
            game.selected_device_id = None
            game.state = type(game.state).PLAYING
            game.help.hide()
            game.shop.close()
            game.history_screen.close()
            game.decision_screen.close()
            game.effects = type(game.effects)()
            game.action_panel._signature = None
            game.log_panel._cache_key = None
            game.log_panel.scroll = 0
            game.alert_panel.scroll = 0
            game.push_message(f"已读取存档：第 {turn} 回合，继续值班。", settings.ACCENT)
            return True, f"已读取存档（第 {turn} 回合）"
        except (KeyError, TypeError, ValueError, IndexError) as exc:
            return False, f"存档内容损坏：{exc}"

    # ------------------------------------------------------------------
    def append_history(self, report: Any, summary: dict[str, Any], seed: int) -> bool:
        entry = {
            "score": int(report.score),
            "grade": report.grade,
            "ending": report.ending_title,
            "style": report.style,
            "seed": int(seed),
            "difficulty": str(summary.get("difficulty_id", "standard")),
            "turn": int(summary.get("turn", 0)),
            "resolved": int(summary.get("resolved", 0)),
            "missed": int(summary.get("missed", 0)),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
        history = self.load_history()
        history.append(entry)
        history.sort(key=lambda item: int(item.get("score", 0)), reverse=True)
        history = history[:30]
        try:
            self._write_json(self.history_path, {"version": 1, "history": history})
        except OSError:
            return False
        return True

    def load_history(self) -> list[dict[str, Any]]:
        if not self.history_path.is_file():
            return []
        try:
            data = json.loads(self.history_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        if not isinstance(data, dict):
            return []
        history = data.get("history", [])
        if not isinstance(history, list):
            return []
        return [item for item in history if isinstance(item, dict)]

    def clear_save(self) -> None:
        try:
            if self.save_path.is_file():
                self.save_path.unlink()
        except OSError:
            pass
