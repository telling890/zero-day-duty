/* 安全加固树：三条线 × 两层，前置、互斥与效果聚合。 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  class UpgradeTree {
    constructor(payload) {
      const raw = payload || {};
      const rawTracks = raw.tracks || [];
      const rawUpgrades = raw.upgrades || [];
      if (!Array.isArray(rawUpgrades) || !rawUpgrades.length) throw new Error('upgrades.json 缺少 upgrades');
      if (!Array.isArray(rawTracks)) throw new Error('upgrades.json 的 tracks 必须是列表');

      this.tracks = rawTracks.map((item, index) => {
        const trackId = String(item.id || '').trim();
        if (!trackId) throw new Error('加固线缺少 id');
        return {
          trackId,
          name: String(item.name || trackId),
          tagline: String(item.tagline || ''),
          description: String(item.description || ''),
          color: String(item.color || 'accent'),
          order: index,
        };
      });
      if (!this.tracks.length) throw new Error('upgrades.json 至少需要一条加固线');
      const trackIds = new Set(this.tracks.map((track) => track.trackId));

      this.upgrades = rawUpgrades.map((item) => {
        const id = String(item.id || '').trim();
        if (!id) throw new Error('加固项目缺少 id');
        if (!trackIds.has(item.track)) throw new Error(`加固项目 ${id} 引用了不存在的加固线`);
        const effects = {};
        for (const [key, value] of Object.entries(item.effects || {})) {
          effects[String(key)] = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
        }
        return {
          upgradeId: id,
          name: String(item.name || id),
          track: String(item.track),
          tier: Number(item.tier || 1),
          cost: Number(item.cost || 0),
          description: String(item.description || ''),
          effects,
          requires: (item.requires || []).map(String),
          requiresAny: (item.requires_any || []).map(String),
          excludes: (item.excludes || []).map(String),
        };
      });
      const order = new Map(this.tracks.map((track) => [track.trackId, track.order]));
      this.upgrades.sort((a, b) => order.get(a.track) - order.get(b.track) || a.tier - b.tier);
      this.byId = new Map(this.upgrades.map((upgrade) => [upgrade.upgradeId, upgrade]));

      // 互斥必须对称，否则会出现单向锁定
      for (const upgrade of this.upgrades) {
        for (const otherId of upgrade.excludes) {
          const other = this.byId.get(otherId);
          if (!other) throw new Error(`加固项目 ${upgrade.upgradeId} 引用了不存在的项目 ${otherId}`);
          if (!other.excludes.includes(upgrade.upgradeId)) other.excludes.push(upgrade.upgradeId);
        }
      }
    }

    get(upgradeId) {
      return this.byId.get(String(upgradeId)) || null;
    }

    byTrack() {
      const grouped = {};
      for (const track of this.tracks) grouped[track.trackId] = [];
      for (const upgrade of this.upgrades) grouped[upgrade.track].push(upgrade);
      return grouped;
    }

    check(upgrade, owned) {
      const ownedSet = new Set(owned);
      if (ownedSet.has(upgrade.upgradeId)) return [false, '该加固项目已经启用'];
      const conflicts = upgrade.excludes.filter((id) => ownedSet.has(id)).map((id) => this.byId.get(id).name);
      if (conflicts.length) return [false, `与已启用的「${conflicts.join('、')}」互斥，本局只能二选一`];
      const missing = upgrade.requires.filter((id) => !ownedSet.has(id)).map((id) => this.byId.get(id).name);
      if (missing.length) return [false, `需要先启用「${missing.join('、')}」`];
      if (upgrade.requiresAny.length && !upgrade.requiresAny.some((id) => ownedSet.has(id))) {
        return [false, '需要先启用同线的第一层加固'];
      }
      return [true, ''];
    }

    lockedByUpgrade(upgrade, owned) {
      const ownedSet = new Set(owned);
      for (const id of upgrade.excludes) {
        if (ownedSet.has(id)) return this.byId.get(id);
      }
      return null;
    }

    modifiers(owned) {
      const totals = {};
      for (const id of Array.from(owned).sort()) {
        const upgrade = this.byId.get(id);
        if (!upgrade) continue;
        for (const [key, value] of Object.entries(upgrade.effects)) {
          if (key === 'ransom_mitigation') {
            totals[key] = Math.max(totals[key] || 0, value ? 1 : 0);
            continue;
          }
          totals[key] = (totals[key] || 0) + Number(value);
        }
      }
      return totals;
    }

    describe(upgrade) {
      const track = this.tracks.find((item) => item.trackId === upgrade.track);
      return `${track ? track.name : upgrade.track} · 第 ${upgrade.tier} 层`;
    }
  }

  ZDD.UpgradeTree = UpgradeTree;
})(typeof globalThis !== 'undefined' ? globalThis : this);
