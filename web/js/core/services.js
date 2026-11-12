/* 业务服务与 SLA：设备状态 → 服务健康度 → 收入、可用性、违约。 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});
  const STATUS = ZDD.STATUS;

  class ServiceManager {
    constructor(payload) {
      const services = (payload && payload.services) || [];
      if (!Array.isArray(services) || !services.length) throw new Error('services.json 缺少非空的 services 列表');
      this.configs = services.map((item) => ({
        serviceId: String(item.id),
        name: String(item.name),
        shortName: String(item.short),
        deviceId: String(item.device),
        criticality: Number(item.criticality),
        revenue: Number(item.revenue),
        customers: Number(item.customers || 0),
        sla: String(item.sla || '99.5%'),
      }));
    }

    /** 返回 [健康度, 状态文本, 原因] */
    static healthForDevice(device) {
      if (!device.online) return [0, '中断', '设备离线'];
      if (device.isolated) return [0, '中断', '设备隔离'];
      if (device.status === STATUS.INFECTED) return [0.35, '受损', '恶意代码活动'];
      if (device.status === STATUS.SUSPICIOUS) return [0.7, '降级', '异常行为告警'];
      if (device.maintenanceTurns > 0) return [0.65, '维护', '补丁维护窗口'];
      if (device.health < 50) return [0.5, '降级', '设备健康度过低'];
      return [1, '正常', '运行正常'];
    }

    views(devices) {
      return this.configs.map((config) => {
        const device = devices[config.deviceId];
        if (!device) throw new Error(`服务 ${config.serviceId} 指向不存在的设备 ${config.deviceId}`);
        const [health, status, detail] = ServiceManager.healthForDevice(device);
        return {
          config,
          deviceName: device.name,
          health,
          status,
          revenueLoss: Math.round(config.revenue * (1 - health)),
          detail,
          get online() {
            return health >= 0.99;
          },
          get interrupted() {
            return health <= 0.05;
          },
        };
      });
    }

    income(devices, floor) {
      let total = 0;
      for (const config of this.configs) {
        const device = devices[config.deviceId];
        if (!device) continue;
        total += config.revenue * ServiceManager.healthForDevice(device)[0];
      }
      const value = Math.round(total);
      const minimum = Number(floor || 0);
      return value > 0 ? Math.max(minimum, value) : value;
    }

    availability(devices) {
      let weightSum = 0;
      let healthSum = 0;
      for (const config of this.configs) {
        const device = devices[config.deviceId];
        if (!device) continue;
        const health = ServiceManager.healthForDevice(device)[0];
        weightSum += config.criticality;
        healthSum += config.criticality * health;
      }
      if (!weightSum) return 100;
      return Math.max(0, Math.min(100, Math.round((healthSum / weightSum) * 100)));
    }

    interruptedServices(devices) {
      return this.views(devices).filter((view) => view.interrupted);
    }

    criticalOutages(devices) {
      return this.views(devices).filter((view) => view.interrupted && view.config.criticality >= 4);
    }

    impactForDevice(deviceId, devices) {
      const affected = this.views(devices).filter((view) => view.config.deviceId === deviceId && view.health < 0.99);
      if (!affected.length) return '';
      return affected
        .map((view) => {
          const suffix = view.revenueLoss ? `-¥${view.revenueLoss}/回合` : '无直接收入';
          return `${view.config.shortName} ${view.status}（${suffix}）`;
        })
        .join('；');
    }

    totalPotentialRevenue() {
      return this.configs.reduce((sum, config) => sum + config.revenue, 0);
    }

    totalCustomers() {
      return this.configs.reduce((sum, config) => sum + config.customers, 0);
    }
  }

  ZDD.ServiceManager = ServiceManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
