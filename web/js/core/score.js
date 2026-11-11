/* 结算：分数、等级、结局、风格、成就与早间新闻。 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  const ENDINGS = {
    perfect: [
      '完美防守',
      '所有真实威胁都在造成重大损失前被阻断，公司平安度过这个夜班。\n'
        + '没有误封，没有数据外泄，值班记录干净得像一份教学范例。',
    ],
    costly: [
      '成功但损失严重',
      '危机最终被控制，但数据、声誉或资金付出了明显代价。\n'
        + '公司还在运转，只是这份值班报告不太适合在晨会上展示。',
    ],
    data_leak: [
      '数据泄露',
      '核心数据已经外泄或被破坏，监管通报与客户索赔接踵而至。\n'
        + '止损做得再快，也无法当作什么都没发生。',
    ],
    over_defense: [
      '过度防御导致业务崩溃',
      '为了阻断攻击，你关闭或隔离了过多服务，业务连续性先于攻击崩溃。\n'
        + '安全的目标是让业务安全地运行，而不是让业务停止运行。',
    ],
    security_breach: [
      '安全体系崩溃',
      '安全度归零，告警、身份与边界控制全面失效。\n'
        + '这不是某一次操作的失误，而是整晚响应节奏的累积结果。',
    ],
    ransomware: [
      '模拟勒索软件失控',
      '勒索软件完成了对核心数据的模拟加密，且备份未能救场。\n'
        + '业务恢复时间无法估算，这将是公司历史上最长的一个夜晚。',
    ],
  };

  const STYLE_COMMENTS = {
    激进隔离型: '你倾向于先隔离再调查，响应果断，但误封会伤害正常业务与声誉。',
    反应迟缓型: '你花了较多回合才处理真实威胁，攻击链因此进入了更深的阶段。',
    精准快速型: '你几乎在第一时间锁定并阻断了威胁，调查与处置的节奏非常干净。',
    资源透支型: '你有效控制了风险，但资金消耗过大，后续运营压力明显。',
    稳健均衡型: '你在安全、业务与成本之间保持了相对均衡，属于可持续的值班风格。',
    善后不足型: '你成功压制了攻击，但把清除根因留到了最后；控制不等于解决。',
  };

  class ScoreSystem {
    evaluate(summary) {
      const endingKey = this.chooseEnding(summary);
      const [endingTitle, endingText] = ENDINGS[endingKey];
      const score = this.score(summary);
      const grade = this.capGrade(this.grade(score), endingKey);
      const style = this.style(summary);
      const [newsHeadline, newsDetail] = this.news(summary, endingKey);
      return {
        score,
        grade,
        endingKey,
        endingTitle,
        endingText,
        style,
        styleComment: STYLE_COMMENTS[style] || '',
        stats: this.stats(summary),
        achievements: this.achievements(summary, endingKey),
        newsHeadline,
        newsDetail,
      };
    }

    achievements(summary, endingKey) {
      const list = [];
      if (endingKey === 'perfect') list.push('完美防守');
      if (Number(summary.false_isolations || 0) === 0) list.push('零误封');
      if (Number(summary.identified || 0) >= Number(summary.total_events || 1) && Number(summary.total_events || 0) > 0) {
        list.push('情报闭环');
      }
      if (Number(summary.best_combo || 0) >= 3) list.push('连击大师');
      const average = Number(summary.average_response || 0);
      if (average > 0 && average <= 1 && Number(summary.resolved || 0) > 0) list.push('闪电响应');
      if (Number(summary.funds || 0) >= 1000) list.push('预算管家');
      return list.slice(0, 5);
    }

    chooseEnding(summary) {
      const reason = summary.reason || 'time';
      if (reason === 'security') return 'security_breach';
      if (reason === 'availability') return 'over_defense';
      if (reason === 'integrity') return 'data_leak';
      if (reason === 'ransomware') return 'ransomware';
      if (reason === 'data_leak') return 'data_leak';
      if (summary.ransomware_failed) return 'ransomware';
      if (summary.security_breach) return 'security_breach';
      if (summary.data_leak) return 'data_leak';
      const total = Number(summary.total_events || 0);
      const resolved = Number(summary.resolved || 0);
      const controlledOnly = Number(summary.controlled_only || 0);
      const perfect = total > 0
        && resolved === total
        && controlledOnly === 0
        && Number(summary.integrity || 0) >= 90
        && Number(summary.security || 0) >= 60
        && Number(summary.availability || 0) >= 80
        && Number(summary.false_isolations || 0) === 0;
      return perfect ? 'perfect' : 'costly';
    }

    score(summary) {
      const security = Number(summary.security || 0);
      const integrity = Number(summary.integrity || 0);
      const reputation = Number(summary.reputation || 0);
      const availability = Number(summary.availability || 0);
      const funds = Number(summary.funds || 0);
      const total = Math.max(1, Number(summary.total_events || 0));
      const resolved = Number(summary.resolved || 0);
      const controlledOnly = Number(summary.controlled_only || 0);
      const checked = Number(summary.false_positives_checked || 0);
      const falseIsolations = Number(summary.false_isolations || 0);
      const missed = Number(summary.missed || 0);

      const fundsRatio = (Math.min(funds, 1200) / 1200) * 100;
      let value = security * 0.22
        + integrity * 0.25
        + reputation * 0.12
        + availability * 0.2
        + fundsRatio * 0.08;
      value += ((resolved + controlledOnly * 0.35) / total) * 18;
      value += checked * 2;
      value += Number(summary.best_combo || 0) * 3;
      value -= falseIsolations * 12;
      value -= missed * 15;
      value -= controlledOnly * 2;
      return Math.max(0, Math.min(130, Math.round(value)));
    }

    grade(score) {
      if (score >= 98) return 'S';
      if (score >= 82) return 'A';
      if (score >= 66) return 'B';
      if (score >= 48) return 'C';
      return 'D';
    }

    capGrade(grade, endingKey) {
      const ranks = { S: 0, A: 1, B: 2, C: 3, D: 4 };
      const caps = {
        perfect: 'S',
        costly: 'A',
        data_leak: 'C',
        over_defense: 'C',
        ransomware: 'D',
        security_breach: 'D',
      };
      const cap = caps[endingKey] || 'D';
      return ranks[grade] >= ranks[cap] ? grade : cap;
    }

    style(summary) {
      if (Number(summary.false_isolations || 0) >= 2) return '激进隔离型';
      if (Number(summary.controlled_only || 0) >= 2) return '善后不足型';
      if (Number(summary.missed || 0) >= 1) return '反应迟缓型';
      const average = Number(summary.average_response || 0);
      if (average > 0 && average <= 1.5 && Number(summary.resolved || 0) >= Number(summary.total_events || 0) && Number(summary.total_events || 0) > 0) {
        return '精准快速型';
      }
      if (Number(summary.funds || 0) <= 200) return '资源透支型';
      return '稳健均衡型';
    }

    news(summary, endingKey) {
      const company = '云栖示例科技';
      const controlled = Number(summary.controlled_only || 0);
      const headlines = {
        perfect: `${company}夜班零事故，客户称“完全没感觉到攻击”`,
        costly: `${company}凌晨经历服务抖动，早间已恢复`,
        data_leak: `${company}疑似客户数据外泄，监管已介入`,
        over_defense: `为防攻击全面停服，${company}早间遭客户投诉`,
        security_breach: `${company}安全体系失守，早会紧急取消`,
        ransomware: `${company}核心数据被加密，恢复时间未定`,
      };
      const details = {
        perfect: '安全团队在 08:00 前清除全部攻击链，官网与下单服务始终保持在线。',
        costly: '威胁已被压制，但服务降级、声誉损失与善后成本写进了今早的复盘报告。',
        data_leak: '凌晨的异常外联没有被及时切断，客户名单出现在不该出现的地方。',
        over_defense: '攻击没有击垮业务，连续的隔离与停服先让下单服务崩溃了。',
        security_breach: '身份与边界控制全面失效，值班记录被移交到应急委员会。',
        ransomware: '备份未能及时保护，核心数据库被模拟加密，恢复窗口仍未知。',
      };
      let detail = details[endingKey] || '';
      if (controlled) detail += ` 另有 ${controlled} 条攻击链只完成控制、未清除根因。`;
      return [headlines[endingKey] || `${company}经历了一个不平静的夜班`, detail];
    }

    stats(summary) {
      const total = Number(summary.total_events || 0);
      const identified = Number(summary.identified || 0);
      const resolved = Number(summary.resolved || 0);
      const controlledOnly = Number(summary.controlled_only || 0);
      const average = Number(summary.average_response || 0);
      const avgText = average > 0 ? `${average.toFixed(1)} 回合` : '—';
      const checked = Number(summary.false_positives_checked || 0);
      const seen = Number(summary.false_positives_seen || 0);
      return [
        ['正确识别事件', `${identified} / ${total}`],
        ['彻底清除事件', `${resolved} / ${total}`],
        ['仅控制未清除', `${controlledOnly} 个`],
        ['漏掉的真实威胁', `${Number(summary.missed || 0)} 个`],
        ['误报告警处理', `${checked} / ${seen}`],
        ['误封次数', `${Number(summary.false_isolations || 0)} 次`],
        ['平均响应回合', avgText],
        ['最终资金', ZDD.formatMoney(Number(summary.funds || 0))],
        ['最终可用性', `${Number(summary.availability || 0)}%`],
        ['最终数据完整度', `${Number(summary.integrity || 0)}%`],
        ['剩余安全度', `${Number(summary.security || 0)}%`],
        ['最高连击', `×${Number(summary.best_combo || 0)}`],
      ];
    }
  }

  ZDD.ScoreSystem = ScoreSystem;
  ZDD.ENDINGS = ENDINGS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
