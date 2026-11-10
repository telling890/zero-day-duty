# -*- coding: utf-8 -*-
"""业务服务与 SLA 模拟。

设备状态会映射成服务健康度：隔离/离线意味着业务中断，
感染和可疑状态意味着降级。每回合收入与声誉惩罚都由这里计算，
让“关掉一切”不再是免费的最优解。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from models.device import Device, DeviceStatus
from settings import DataError


@dataclass(frozen=True)
class ServiceConfig:
    service_id: str
    name: str
    short_name: str
    device_id: str
    criticality: int
    revenue: int
    customers: int
    sla: str


@dataclass
class ServiceView:
    config: ServiceConfig
    device_name: str
    health: float
    status: str
    revenue_loss: int
    detail: str

    @property
    def online(self) -> bool:
        return self.health >= 0.99

    @property
    def interrupted(self) -> bool:
        return self.health <= 0.05


class ServiceManager:
    """根据设备状态计算业务服务健康度、收入和 SLA 违约。"""

    STATUS_NORMAL = "正常"
    STATUS_DEGRADED = "降级"
    STATUS_MAINTENANCE = "维护"
    STATUS_DAMAGED = "受损"
    STATUS_DOWN = "中断"

    def __init__(self, payload: dict[str, Any]) -> None:
        services = payload.get("services", [])
        if not isinstance(services, list) or not services:
            raise DataError("services.json 缺少非空的 services 列表")
        self.configs: list[ServiceConfig] = []
        seen: set[str] = set()
        for item in services:
            if not isinstance(item, dict):
                raise DataError("services.json 中的每一项服务都必须是 JSON 对象")
            required = ("id", "name", "short", "device", "criticality", "revenue")
            missing = [key for key in required if key not in item]
            if missing:
                raise DataError(f"服务配置缺少字段 {missing}（服务 {item.get('id', '未知')}）")
            service_id = str(item["id"])
            if service_id in seen:
                raise DataError(f"服务 ID 重复：{service_id}")
            seen.add(service_id)
            try:
                criticality = int(item["criticality"])
                revenue = int(item["revenue"])
                customers = int(item.get("customers", 0))
            except (TypeError, ValueError) as exc:
                raise DataError(f"服务 {service_id} 的数值字段不合法") from exc
            if not 1 <= criticality <= 5:
                raise DataError(f"服务 {service_id} 的 criticality 必须在 1~5 之间")
            if revenue < 0 or customers < 0:
                raise DataError(f"服务 {service_id} 的收入/客户数不能为负")
            self.configs.append(
                ServiceConfig(
                    service_id=service_id,
                    name=str(item["name"]),
                    short_name=str(item["short"]),
                    device_id=str(item["device"]),
                    criticality=criticality,
                    revenue=revenue,
                    customers=customers,
                    sla=str(item.get("sla", "99.5%")),
                )
            )

    # ------------------------------------------------------------------
    # 健康度
    # ------------------------------------------------------------------
    @staticmethod
    def health_for_device(device: Device) -> tuple[float, str, str]:
        """返回 (健康度, 状态文本, 原因)。"""
        if not device.online:
            return 0.0, ServiceManager.STATUS_DOWN, "设备离线"
        if device.isolated:
            return 0.0, ServiceManager.STATUS_DOWN, "设备隔离"
        if device.status == DeviceStatus.INFECTED:
            return 0.35, ServiceManager.STATUS_DAMAGED, "恶意代码活动"
        if device.status == DeviceStatus.SUSPICIOUS:
            return 0.70, ServiceManager.STATUS_DEGRADED, "异常行为告警"
        if device.maintenance_turns > 0:
            return 0.65, ServiceManager.STATUS_MAINTENANCE, "补丁维护窗口"
        if device.health < 50:
            return 0.50, ServiceManager.STATUS_DEGRADED, "设备健康度过低"
        return 1.0, ServiceManager.STATUS_NORMAL, "运行正常"

    def views(self, devices: dict[str, Device]) -> list[ServiceView]:
        result: list[ServiceView] = []
        for config in self.configs:
            device = devices.get(config.device_id)
            if device is None:
                raise DataError(f"服务 {config.service_id} 指向不存在的设备 {config.device_id}")
            health, status, reason = self.health_for_device(device)
            loss = int(round(config.revenue * (1.0 - health)))
            result.append(
                ServiceView(
                    config=config,
                    device_name=device.name,
                    health=health,
                    status=status,
                    revenue_loss=loss,
                    detail=reason,
                )
            )
        return result

    def income(self, devices: dict[str, Device]) -> int:
        """按 SLA 结算的当回合服务收入（满额 120）。"""
        total = 0.0
        for config in self.configs:
            device = devices.get(config.device_id)
            if device is None:
                continue
            health, _status, _reason = self.health_for_device(device)
            total += config.revenue * health
        return int(round(total))

    def availability(self, devices: dict[str, Device]) -> int:
        """按业务重要度加权的服务可用性，用于顶部指标。"""
        weight_sum = 0
        health_sum = 0.0
        for config in self.configs:
            device = devices.get(config.device_id)
            if device is None:
                continue
            health, _status, _reason = self.health_for_device(device)
            weight_sum += config.criticality
            health_sum += config.criticality * health
        if weight_sum == 0:
            return 100
        return max(0, min(100, int(round(health_sum / weight_sum * 100))))

    def interrupted_services(self, devices: dict[str, Device]) -> list[ServiceView]:
        return [view for view in self.views(devices) if view.interrupted]

    def critical_outages(self, devices: dict[str, Device]) -> list[ServiceView]:
        return [
            view
            for view in self.views(devices)
            if view.interrupted and view.config.criticality >= 4
        ]

    def impact_for_device(self, device_id: str, devices: dict[str, Device]) -> str:
        """给操作结果用的一句话业务影响。"""
        affected = [
            view
            for view in self.views(devices)
            if view.config.device_id == device_id and view.health < 0.99
        ]
        if not affected:
            return ""
        parts = []
        for view in affected:
            suffix = f"-¥{view.revenue_loss}/回合" if view.revenue_loss else "无直接收入"
            parts.append(f"{view.config.short_name} {view.status}（{suffix}）")
        return "；".join(parts)

    def total_potential_revenue(self) -> int:
        return sum(config.revenue for config in self.configs)

    def total_customers(self) -> int:
        return sum(config.customers for config in self.configs)
