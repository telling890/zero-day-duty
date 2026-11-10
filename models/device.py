# -*- coding: utf-8 -*-
"""设备模型：网络拓扑中的节点。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from settings import DataError


class DeviceStatus:
    """设备安全状态常量（界面会同时显示文字与符号，不只依赖颜色）。"""

    NORMAL = "正常"
    SUSPICIOUS = "可疑"
    INFECTED = "感染"
    ISOLATED = "隔离"
    OFFLINE = "离线"


STATUS_SEVERITY = {
    DeviceStatus.NORMAL: 0,
    DeviceStatus.SUSPICIOUS: 1,
    DeviceStatus.INFECTED: 2,
    DeviceStatus.ISOLATED: 3,
    DeviceStatus.OFFLINE: 4,
}

REQUIRED_DEVICE_KEYS = (
    "id",
    "name",
    "short",
    "type",
    "ip",
    "security_level",
    "importance",
    "critical",
    "patched",
    "vulnerabilities",
    "neighbors",
    "backups",
    "pos",
)


@dataclass
class Device:
    """一台虚构网络设备。

    运行期字段（health/online/status/isolated）不写入 JSON，
    每次开局由 from_config 重置，保证可复现。
    """

    device_id: str
    name: str
    short_name: str
    device_type: str
    ip: str
    security_level: int
    importance: int
    critical: bool
    patched: bool
    vulnerabilities: list[str] = field(default_factory=list)
    neighbors: list[str] = field(default_factory=list)
    backups: bool = False
    pos: tuple[float, float] = (0.5, 0.5)
    health: int = 100
    online: bool = True
    status: str = DeviceStatus.NORMAL
    isolated: bool = False
    last_log: str = ""
    status_before_isolation: str = DeviceStatus.NORMAL
    status_before_offline: str = DeviceStatus.NORMAL
    backup_protected: bool = False
    maintenance_turns: int = 0

    # ------------------------------------------------------------------
    # 构造与校验
    # ------------------------------------------------------------------
    @classmethod
    def from_config(cls, config: dict[str, Any]) -> "Device":
        missing = [key for key in REQUIRED_DEVICE_KEYS if key not in config]
        if missing:
            raise DataError(
                f"设备配置缺少字段 {missing}（设备 {config.get('id', '未知')}），请检查 data/devices.json"
            )
        pos = config["pos"]
        if not (isinstance(pos, (list, tuple)) and len(pos) == 2):
            raise DataError(f"设备 {config['id']} 的 pos 必须是 [x, y] 两个 0~1 之间的小数")
        try:
            px, py = float(pos[0]), float(pos[1])
        except (TypeError, ValueError) as exc:
            raise DataError(f"设备 {config['id']} 的 pos 不是数字") from exc
        return cls(
            device_id=str(config["id"]),
            name=str(config["name"]),
            short_name=str(config["short"]),
            device_type=str(config["type"]),
            ip=str(config["ip"]),
            security_level=int(config["security_level"]),
            importance=int(config["importance"]),
            critical=bool(config["critical"]),
            patched=bool(config["patched"]),
            vulnerabilities=[str(item) for item in config["vulnerabilities"]],
            neighbors=[str(item) for item in config["neighbors"]],
            backups=bool(config["backups"]),
            pos=(max(0.0, min(1.0, px)), max(0.0, min(1.0, py))),
        )

    # ------------------------------------------------------------------
    # 状态
    # ------------------------------------------------------------------
    @property
    def status_label(self) -> str:
        return self.status

    @property
    def exposure(self) -> int:
        """暴露程度：安全等级越低、漏洞越多、未打补丁，越容易被利用。"""
        level_part = max(0, 6 - self.security_level)
        patch_part = 0 if self.patched else 2
        vuln_part = min(3, len(self.vulnerabilities))
        return level_part + patch_part + vuln_part

    @property
    def is_available(self) -> bool:
        """是否对业务可用（隔离、离线都算不可用）。"""
        return self.online and not self.isolated

    @property
    def can_shutdown(self) -> bool:
        """网关与服务器允许关停；普通终端不提供该操作。"""
        return self.device_type in ("服务器", "网络设备")

    def set_status(self, status: str) -> None:
        if status not in STATUS_SEVERITY:
            return
        self.status = status
        if status == DeviceStatus.OFFLINE:
            self.online = False
        elif status != DeviceStatus.ISOLATED and not self.online:
            self.online = True

    def isolate(self) -> None:
        if not self.isolated:
            self.status_before_isolation = (
                self.status
                if self.status in (DeviceStatus.NORMAL, DeviceStatus.SUSPICIOUS, DeviceStatus.INFECTED)
                else DeviceStatus.NORMAL
            )
        self.isolated = True
        self.status = DeviceStatus.ISOLATED

    def restore(self) -> None:
        self.isolated = False
        self.online = True
        previous = self.status_before_isolation
        if previous in (DeviceStatus.NORMAL, DeviceStatus.SUSPICIOUS, DeviceStatus.INFECTED):
            self.status = previous
        else:
            self.status = DeviceStatus.NORMAL

    def shutdown(self) -> None:
        """关停设备：业务可用性下降，但可以阻断以它为主链的攻击。"""
        if not self.isolated:
            self.status_before_offline = (
                self.status
                if self.status in (DeviceStatus.NORMAL, DeviceStatus.SUSPICIOUS, DeviceStatus.INFECTED)
                else DeviceStatus.NORMAL
            )
        self.online = False
        self.status = DeviceStatus.OFFLINE

    def startup(self) -> None:
        self.online = True
        self.status = (
            self.status_before_offline
            if self.status_before_offline in (DeviceStatus.NORMAL, DeviceStatus.SUSPICIOUS, DeviceStatus.INFECTED)
            else DeviceStatus.NORMAL
        )

    def apply_patch(self) -> None:
        self.patched = True
        self.vulnerabilities.clear()
        self.health = min(100, self.health + 5)
        self.maintenance_turns = 2

    def protect_backup(self) -> None:
        self.backup_protected = True

    def consume_backup(self) -> None:
        self.backups = False

    def tick_maintenance(self) -> None:
        if self.maintenance_turns > 0:
            self.maintenance_turns -= 1

    def damage(self, amount: int) -> None:
        self.health = max(0, min(100, self.health - int(amount)))

    # ------------------------------------------------------------------
    # 存档序列化（只保存运行期状态，静态配置仍从 devices.json 读取）
    # ------------------------------------------------------------------
    def to_state(self) -> dict[str, Any]:
        return {
            "health": self.health,
            "online": self.online,
            "status": self.status,
            "isolated": self.isolated,
            "status_before_isolation": self.status_before_isolation,
            "status_before_offline": self.status_before_offline,
            "backup_protected": self.backup_protected,
            "maintenance_turns": self.maintenance_turns,
            "backups": self.backups,
            "patched": self.patched,
            "vulnerabilities": list(self.vulnerabilities),
        }

    def apply_state(self, state: dict[str, Any]) -> None:
        self.health = int(state.get("health", self.health))
        self.online = bool(state.get("online", self.online))
        status = str(state.get("status", self.status))
        if status in STATUS_SEVERITY:
            self.status = status
        self.isolated = bool(state.get("isolated", self.isolated))
        self.status_before_isolation = str(state.get("status_before_isolation", self.status_before_isolation))
        self.status_before_offline = str(state.get("status_before_offline", self.status_before_offline))
        self.backup_protected = bool(state.get("backup_protected", self.backup_protected))
        self.maintenance_turns = max(0, int(state.get("maintenance_turns", self.maintenance_turns)))
        self.backups = bool(state.get("backups", self.backups))
        self.patched = bool(state.get("patched", self.patched))
        vulnerabilities = state.get("vulnerabilities", self.vulnerabilities)
        if isinstance(vulnerabilities, list):
            self.vulnerabilities = [str(item) for item in vulnerabilities]


def validate_device_configs(raw_configs: Any) -> list[dict[str, Any]]:
    """校验 devices.json 里的设备列表，返回可安全使用的配置副本。"""
    if not isinstance(raw_configs, list) or not raw_configs:
        raise DataError("devices.json 中的 devices 必须是非空列表")
    configs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_configs:
        if not isinstance(item, dict):
            raise DataError("devices.json 中的每一项设备都必须是 JSON 对象")
        device = Device.from_config(item)
        if device.device_id in seen:
            raise DataError(f"设备 ID 重复：{device.device_id}")
        seen.add(device.device_id)
        if not (1 <= device.security_level <= 5):
            raise DataError(f"设备 {device.device_id} 的 security_level 必须在 1~5 之间")
        if not (1 <= device.importance <= 5):
            raise DataError(f"设备 {device.device_id} 的 importance 必须在 1~5 之间")
        configs.append(dict(item))
    # 校验邻接表中的设备确实存在
    for item in configs:
        for neighbor in item["neighbors"]:
            if neighbor not in seen:
                raise DataError(f"设备 {item['id']} 的相邻节点 {neighbor} 不存在")
            if neighbor == item["id"]:
                raise DataError(f"设备 {item['id']} 不能把自己列为相邻节点")
    return configs
