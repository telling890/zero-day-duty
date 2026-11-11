/* 日志系统：保序收集、分类过滤、关键词搜索。 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  class LogSystem {
    constructor(maxEntries) {
      this.entries = [];
      this.maxEntries = maxEntries || 800;
    }

    add(turn, clock, category, message, extra) {
      const options = extra || {};
      const cat = ZDD.LOG_CATEGORIES.includes(category) ? category : '系统';
      const entry = {
        turn: Number(turn),
        clock: String(clock),
        category: cat,
        message: String(message),
        source: String(options.source || ''),
        account: String(options.account || ''),
        ip: String(options.ip || ''),
      };
      this.entries.push(entry);
      if (this.entries.length > this.maxEntries) {
        this.entries.splice(0, this.entries.length - this.maxEntries);
      }
      return entry;
    }

    static haystack(entry) {
      return [entry.message, entry.source, entry.account, entry.ip, entry.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    }

    search(keyword, category) {
      const needle = String(keyword || '').trim().toLowerCase();
      const cat = category || '全部';
      return this.entries.filter((entry) => {
        if (cat && cat !== '全部' && entry.category !== cat) return false;
        if (needle && !LogSystem.haystack(entry).includes(needle)) return false;
        return true;
      });
    }

    recent(count) {
      return this.entries.slice(-(count || 8));
    }

    clear() {
      this.entries = [];
    }
  }

  ZDD.LogSystem = LogSystem;
})(typeof globalThis !== 'undefined' ? globalThis : this);
