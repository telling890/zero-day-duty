/* 存档与历史排行榜：桌面版写 saves/*.json，网页版写 localStorage。
 * 数据字段与桌面版保持一致，方便对照排查。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});
  const { Device, PlayerState, SecurityEvent } = ZDD.models;

  const SAVE_VERSION = 1;
  const SAVE_KEY = 'zdd.savegame.v1';
  const HISTORY_KEY = 'zdd.history.v1';

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function timestamp() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} `
      + `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  }

  class SaveManager {
    constructor(storage) {
      this.storage = storage || null;
      this.memory = {};
      this.available = false;
      try {
        const probe = '__zdd_probe__';
        this.storage.setItem(probe, '1');
        this.storage.removeItem(probe);
        this.available = true;
      } catch (error) {
        this.available = false;
      }
    }

    read(key) {
      try {
        if (this.available) return this.storage.getItem(key);
      } catch (error) {
        // 隐私模式/配额异常时退回内存，至少本局内可用
      }
      return this.memory[key] !== undefined ? this.memory[key] : null;
    }

    write(key, value) {
      this.memory[key] = value;
      if (!this.available) return false;
      try {
        this.storage.setItem(key, value);
        return true;
      } catch (error) {
        return false;
      }
    }

    hasSave() {
      const raw = this.read(SAVE_KEY);
      return typeof raw === 'string' && raw.length > 20;
    }

    save(game) {
      if (game.tutorialMode) return [false, '实战演练中不支持保存'];
      if (!['playing', 'paused'].includes(game.state)) return [false, '只能在值班进行中保存'];
      const data = {
        version: SAVE_VERSION,
        saved_at: timestamp(),
        seed: game.seed,
        turn: game.turn,
        difficulty: game.difficultyId,
        hints_used: Number(game.hintsUsed || 0),
        timeline: game.timeline.map((item) => Object.assign({}, item)),
        pending_delayed: game.pendingDelayed.map((item) => Object.assign({}, item)),
        decision_history: game.decisionHistory.map((item) => Object.assign({}, item)),
        rng_state: game.rng.getState(),
        player: game.player.toDict(),
        devices: Object.fromEntries(
          Object.entries(game.devices).map(([id, device]) => [id, device.toState()]),
        ),
        event_manager: game.events.toState(),
        logs: game.logs.entries.map((entry) => Object.assign({}, entry)),
        messages: game.messages.map((message) => ({
          text: message.text,
          color: message.color,
          turn: message.turn,
        })),
        flags: {
          data_leak: game.dataLeak,
          ransomware_failed: game.ransomwareFailed,
          security_breach: game.securityBreach,
          low_availability_turns: game.lowAvailabilityTurns,
          combo: game.combo,
          best_combo: game.bestCombo,
          seen_decisions: Array.from(game.seenDecisions).sort(),
        },
      };
      const ok = this.write(SAVE_KEY, JSON.stringify(data));
      if (!ok) return [false, '浏览器拒绝写入本地存储（可能是隐私模式或空间已满）'];
      return [true, '进度已保存到这台设备的浏览器'];
    }

    load(game) {
      if (!this.hasSave()) return [false, '没有找到存档'];
      let data;
      try {
        data = JSON.parse(this.read(SAVE_KEY));
      } catch (error) {
        return [false, '存档内容损坏，无法解析'];
      }
      if (!data || typeof data !== 'object') return [false, '存档格式不正确'];
      if (Number(data.version) !== SAVE_VERSION) return [false, '存档版本不兼容，请重新开始一局'];

      try {
        const configs = new Map(game.deviceConfigs.map((config) => [String(config.id), config]));
        const devices = {};
        for (const [deviceId, state] of Object.entries(data.devices || {})) {
          const config = configs.get(String(deviceId));
          if (!config || !state || typeof state !== 'object') continue;
          const device = Device.fromConfig(config);
          device.applyState(state);
          devices[String(deviceId)] = device;
        }
        if (!Object.keys(devices).length) return [false, '存档中没有可用的设备数据'];

        const player = PlayerState.fromDict(data.player || {});
        const turn = Number(data.turn || 1);
        const seed = Number(data.seed || game.seed);
        const rng = new ZDD.RNG(seed);
        rng.setState(Number(data.rng_state || 0));

        const logs = new ZDD.LogSystem();
        for (const entry of data.logs || []) {
          if (!entry || typeof entry !== 'object') continue;
          logs.add(
            Number(entry.turn || 0),
            String(entry.clock || ''),
            String(entry.category || '系统'),
            String(entry.message || ''),
            {
              source: String(entry.source || ''),
              account: String(entry.account || ''),
              ip: String(entry.ip || ''),
            },
          );
        }

        const savedRngState = rng.getState();
        const events = new ZDD.EventManager(game.eventPayload, rng, logs, false);
        // EventManager 初始化会打乱事件顺序，这里恢复存档时的随机数状态
        rng.setState(savedRngState);
        if (data.event_manager && typeof data.event_manager === 'object') {
          events.applyState(data.event_manager);
        }
        rng.setState(savedRngState);

        const messages = (data.messages || [])
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            text: String(item.text || ''),
            color: String(item.color || 'text'),
            turn: Number(item.turn ?? turn),
          }));

        const flags = data.flags && typeof data.flags === 'object' ? data.flags : {};
        game.applyLoadedState({
          seed,
          rng,
          devices,
          player,
          turn,
          logs,
          events,
          messages,
          difficultyId: String(data.difficulty || game.difficultySet.defaultId),
          hintsUsed: Math.max(0, Number(data.hints_used || 0)),
          timeline: Array.isArray(data.timeline) ? data.timeline.filter((item) => item && typeof item === 'object') : [],
          pendingDelayed: Array.isArray(data.pending_delayed) ? data.pending_delayed.filter((item) => item && typeof item === 'object') : [],
          decisionHistory: Array.isArray(data.decision_history) ? data.decision_history.filter((item) => item && typeof item === 'object') : [],
          dataLeak: Boolean(flags.data_leak),
          ransomwareFailed: Boolean(flags.ransomware_failed),
          securityBreach: Boolean(flags.security_breach),
          lowAvailabilityTurns: Number(flags.low_availability_turns || 0),
          combo: Number(flags.combo || 0),
          bestCombo: Number(flags.best_combo || 0),
          seenDecisions: new Set((flags.seen_decisions || []).map(String)),
        });
        game.pushMessage(`已读取存档：第 ${turn} 回合，继续值班。`, 'accent');
        return [true, `已读取存档（第 ${turn} 回合）`];
      } catch (error) {
        return [false, `存档内容损坏：${error && error.message ? error.message : error}`];
      }
    }

    appendHistory(report, summary, seed) {
      const entry = {
        score: Number(report.score),
        grade: report.grade,
        ending: report.endingTitle,
        style: report.style,
        seed: Number(seed),
        difficulty: String(summary.difficulty_id || 'standard'),
        turn: Number(summary.turn || 0),
        resolved: Number(summary.resolved || 0),
        missed: Number(summary.missed || 0),
        timestamp: timestamp(),
      };
      const history = this.loadHistory();
      history.push(entry);
      history.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
      const trimmed = history.slice(0, 30);
      this.write(HISTORY_KEY, JSON.stringify({ version: 1, history: trimmed }));
      return true;
    }

    loadHistory() {
      const raw = this.read(HISTORY_KEY);
      if (!raw) return [];
      try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return [];
        return Array.isArray(data.history) ? data.history.filter((item) => item && typeof item === 'object') : [];
      } catch (error) {
        return [];
      }
    }

    clearHistory() {
      this.write(HISTORY_KEY, JSON.stringify({ version: 1, history: [] }));
    }

    clearSave() {
      this.memory[SAVE_KEY] = null;
      if (this.available) {
        try {
          this.storage.removeItem(SAVE_KEY);
        } catch (error) {
          // 忽略
        }
      }
    }
  }

  ZDD.SaveManager = SaveManager;
  ZDD.SAVE_VERSION = SAVE_VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : this);
