/* 浮层与教程：主菜单之外的暂停、简报、教程、决策、加固、历史、结算、手册。 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const TUTORIAL_PAGES = [
    {
      title: '一分钟看懂',
      body: '先记住五件事：你要在 10 个回合内清除 6 条攻击链，同时别把公司业务全部关停。',
      bullets: [
        '每回合 6 点行动点（AP），推进回合后恢复；攻击会在回合结束时升级。',
        '基本循环：调查 → 控制 → 清除 → 恢复，四步缺一不可。',
        '隔离/关停只是“控制”；清除根因后告警才会关闭。',
        '服务中断会减少收入、扣声誉；左下角服务面板会实时显示代价。',
        '调查后会提示攻击“下一跳”，提前隔离下一台设备可以拖住攻击。',
      ],
    },
    {
      title: '你的任务',
      body: '你是云栖示例科技的夜班安全管理员。从 22:00 到早上 8:00，公司会遭遇 6 条攻击链。',
      bullets: [
        '目标：在 08:00 前清除全部攻击链，并尽量保持业务在线。',
        '共 10 个回合；每回合行动点 6 点，推进回合后重置。',
        '安全度归零、数据完整度低于 20、服务连续 3 回合低于 40，都会失败。',
      ],
    },
    {
      title: '先认识界面',
      body: '屏幕分成六块，所有操作都围绕它们展开。',
      bullets: [
        '顶部：回合/时间、威胁等级、安全度、资金、行动点、声誉、可用性、完整度。',
        '左侧：网络拓扑；点击节点查看设备，点击空白返回业务总览。',
        '右侧：安全告警；点击一条告警，操作面板才会出现对应操作。',
        '下方：日志终端、操作面板、消息/指标变化。',
      ],
    },
    {
      title: '告警不等于真相',
      body: '告警等级在调查前显示为“待评估”。平台会误报，真实威胁也不会主动标红。',
      bullets: [
        '点击告警后，在操作面板花 1 AP 调查它。',
        '调查会揭示线索、提高置信度并缩小风险区间。',
        '确认是误报就收手；确认是威胁再选择控制方式。',
      ],
    },
    {
      title: '处置分为三段',
      body: '控制、清除、恢复是三件事。隔离能阻止扩散，但不会自动清除根因。',
      bullets: [
        '控制：隔离、关停、封禁来源，先让攻击停下来。',
        '清除：删除邮件、重置密码、打补丁，或在设备上执行“清除威胁”。',
        '恢复：解除隔离、启动服务、从备份恢复，并确认业务可用。',
        '删除邮件/补丁这类“提前阻断”可以直接清除，不必再补一刀。',
      ],
    },
    {
      title: '业务服务与 SLA',
      body: '左下角是业务服务面板：邮箱、官网、财务、数据库、备份、办公网。',
      bullets: [
        '隔离和关停会让对应服务中断，收入按 SLA 减少。',
        '关键服务中断会持续扣声誉；连续低可用性会失败。',
        '补丁会进入维护窗口，服务短暂降级。',
        '先控制、再清除、最后恢复，才能把损失压到最低。',
      ],
    },
    {
      title: '预判攻击下一跳',
      body: '调查后，设备详情会显示攻击下一台可能影响的设备。',
      bullets: [
        '提前隔离下一跳，可以阻止攻击进入下一阶段。',
        '但下一跳设备被隔离也会中断它承载的业务。',
        '把“预判”当成一次提前防守，而不是免费的安全。',
        '拓扑上的红/橙色流线表示正在推进的攻击链。',
      ],
    },
    {
      title: '威胁、连击与行动点',
      body: '多线同时活跃时，威胁等级会上升，事件升级伤害也会放大。',
      bullets: [
        '威胁等级 = 1 + 活跃攻击链数量（上限 5）。',
        '连续彻底清除事件会累积 COMBO；每 2 连击奖励行动点。',
        '单纯控制不给连击；只控制不清除会在结算时扣分。',
        '行动点有限：先处理最可能造成重大损失的链。',
      ],
    },
    {
      title: '加固、决策与存档',
      body: '一局之内还有两层安全加固、剧情决策和多种结局。',
      bullets: [
        '按 U 打开安全加固：三条线各两层，用资金买本局永久能力。',
        '第二层是专精（情报深挖 / 快速清场 / 保业务），只能选一个。',
        '同一攻击者的多起告警会标成“同源”，放着不管会加快节奏。',
        '第 4/7 回合会弹出剧情决策，每个选项都有代价。',
        'F5/F9 存读档，F1 打开完整值班手册，M 开关音效。',
      ],
    },
    {
      title: '一个回合的完整顺序',
      body: '推荐按下面的顺序处理每个回合，避免漏掉善后和业务恢复。',
      bullets: [
        '① 看日志与告警：先分清哪些是真实威胁。',
        '② 调查：确认告警性质，获得线索与下一跳。',
        '③ 控制：隔离/关停/封禁，阻止继续扩散。',
        '④ 清除：删除邮件、补丁或“清除威胁”。',
        '⑤ 恢复：解除隔离/启动服务，恢复业务。',
        '⑥ 加固/决策：有资金就升级，有决策就选择。',
        '⑦ 推进回合：攻击会升级，行动点重置。',
      ],
    },
    {
      title: '新手最容易犯的错',
      body: '这些错误比“操作不够快”更常见，也更容易让一局崩掉。',
      bullets: [
        '只隔离不清除：事件停在“待清除”，结算会扣分。',
        '把全部服务都关掉：攻击没进来，业务先崩。',
        '不调查就乱处置：可能误封合作方、浪费行动点。',
        '忽略下一跳：攻击换一台设备后才发现没防守。',
        '把 AP 花光：下一回合事件升级时没有操作可用。',
      ],
    },
    {
      title: '准备实战',
      body: '接下来是 6 步完整演练，只用一条钓鱼事件，把“调查→控制→清除→恢复→推进”走一遍。',
      bullets: [
        '教程中只有一条钓鱼事件，不会出现其他攻击。',
        '按提示点击即可；每一步都会高亮要点的按钮。',
        '完成后可以开始真正的 10 回合值班。',
      ],
    },
  ];

  const GUIDE_STEPS = [
    { title: '选择告警', instruction: '点击右侧告警列表中的第一条告警。', why: '先选目标，操作面板才知道要处理哪条告警。', stage: '选择', color: 'accent' },
    { title: '调查告警', instruction: '点击操作面板里的“调查告警”，花 1 AP 确认威胁。', why: '调查后才会出现建议操作、风险区间和下一跳。', stage: '调查', color: 'accent' },
    { title: '控制攻击', instruction: '点击“隔离设备”，阻止攻击继续扩散。', why: '隔离只是控制，事件会变成“已控制·待清除”。', stage: '控制', color: 'yellow' },
    { title: '清除根因', instruction: '点击“清除威胁”，关闭这条告警。', why: '控制不等于解决；不清除会在结算时扣分。', stage: '清除', color: 'green' },
    { title: '恢复业务', instruction: '点击“解除隔离”，让 PC-01 重新上线。', why: '已清除后解除隔离，事件不会复活；业务也会恢复。', stage: '恢复', color: 'blue' },
    { title: '推进回合', instruction: '点击“推进回合 →”，进入下一小时。', why: '每回合 AP 重置为 6；攻击会在回合结束时推进。', stage: '推进', color: 'orange' },
  ];

  const ENDING_COLORS = {
    perfect: 'var(--green)',
    costly: 'var(--yellow)',
    data_leak: 'var(--red)',
    over_defense: 'var(--orange)',
    security_breach: 'var(--red)',
    ransomware: 'var(--red)',
  };

  class Screens {
    constructor(refs) {
      this.modal = refs.modal;
      this.card = refs.card;
      this.guide = refs.guide;
      this.ring = refs.ring;
      this.kind = null;
    }

    hideModal() {
      this.modal.hidden = true;
      this.kind = null;
      this.card.innerHTML = '';
    }

    showModal(kind, html, extraClass) {
      const previousKind = this.kind;
      const previousScroll = this.card.scrollTop;
      this.kind = kind;
      this.card.className = `modal-card${extraClass ? ` ${extraClass}` : ''}`;
      this.card.innerHTML = html;
      this.modal.hidden = false;
      this.card.scrollTop = previousKind === kind ? previousScroll : 0;
      if (!this.card.contains(document.activeElement)) {
        this.card.focus({ preventScroll: true });
      }
    }

    renderModal(kind, ui, game) {
      if (!kind) {
        this.hideModal();
        return;
      }
      const renderers = {
        briefing: () => this.briefingHtml(),
        tutorial: () => this.tutorialHtml(ui),
        'tutorial-complete': () => this.tutorialCompleteHtml(),
        help: () => this.helpHtml(),
        decision: () => this.decisionHtml(game),
        shop: () => this.shopHtml(game),
        history: () => this.historyHtml(game),
        result: () => this.resultHtml(game),
        pause: () => this.pauseHtml(game),
      };
      const renderer = renderers[kind];
      if (!renderer) {
        this.hideModal();
        return;
      }
      const extra = kind === 'tutorial' || kind === 'tutorial-complete' ? 'purple' : kind === 'shop' || kind === 'history' ? 'wide' : '';
      this.showModal(kind, renderer(), extra);
    }

    // ------------------------------------------------------------------
    // 简报
    // ------------------------------------------------------------------
    briefingHtml() {
      const people = [
        ['主管 · 陈可', '客户在催交付，任何停服都要先报备。别把“安全”变成“全停”。', 'var(--accent)'],
        ['公关 · 林岚', '媒体来问先别擅自回应，把情况同步给我。', 'var(--purple)'],
        ['IT 运维 · 阿哲', '备份服务器在 BAK-01。别等数据库被加密了才想起它。', 'var(--orange)'],
      ];
      return `
        <p class="modal-kicker">22:00 · 夜班交接 · 云栖示例科技（虚构）</p>
        <h2 class="modal-title" id="modal-title">今晚，守住这家公司。</h2>
        <p class="modal-sub">你是夜班安全管理员。接下来的 10 个小时，6 条攻击链会陆续出现。先听同事说完，再决定今晚怎么值班。</p>
        <div class="people">
          ${people.map(([name, line, color]) => `
            <div class="person" style="--p-color:${color}">
              <i></i>
              <div><strong>${esc(name)}</strong><span>${esc(line)}</span></div>
            </div>
          `).join('')}
        </div>
        <p class="objective">今晚目标：08:00 前清除全部攻击链，同时让业务保持在线。</p>
        <p class="modal-note">提示：先调查，再控制；控制后还要清除，最后恢复业务。</p>
        <div class="modal-actions">
          <button class="btn primary" data-act="briefing-enter">进入值班</button>
        </div>
      `;
    }

    // ------------------------------------------------------------------
    // 教程
    // ------------------------------------------------------------------
    tutorialHtml(ui) {
      const page = TUTORIAL_PAGES[Math.min(ui.tutorialPage, TUTORIAL_PAGES.length - 1)];
      const index = Math.min(ui.tutorialPage, TUTORIAL_PAGES.length - 1);
      const last = index === TUTORIAL_PAGES.length - 1;
      return `
        <p class="modal-kicker">新手教程 · ${index + 1} / ${TUTORIAL_PAGES.length}</p>
        <h2 class="modal-title" id="modal-title">${esc(page.title)}</h2>
        <p class="modal-sub">${esc(page.body)}</p>
        <div class="tutorial-pages">
          ${TUTORIAL_PAGES.map((_, i) => `<i class="${i <= index ? 'done' : ''}"></i>`).join('')}
        </div>
        <ul class="tutorial-bullets">
          ${page.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join('')}
        </ul>
        <div class="modal-actions">
          <button class="btn ghost" data-act="tutorial-prev" ${index === 0 ? 'disabled' : ''}>上一步</button>
          <button class="btn ghost" data-act="tutorial-skip">跳过</button>
          <span class="spacer"></span>
          <button class="btn purple" data-act="tutorial-next">${last ? '进入实战演练' : '下一步'}</button>
        </div>
      `;
    }

    tutorialCompleteHtml() {
      return `
        <p class="modal-kicker">实战演练完成</p>
        <h2 class="modal-title" id="modal-title">教程完成</h2>
        <p class="modal-sub">你已经完成一次完整循环：
调查 → 控制 → 清除 → 恢复 → 推进回合。

正式值班中会有 6 条攻击链、随机事件顺序、误报、剧情决策和零日 BOSS。
记住：隔离只是控制，清除根因才算解决，最后还要恢复业务。</p>
        <div class="modal-actions">
          <button class="btn ghost" data-act="tutorial-menu">返回主菜单</button>
          <button class="btn purple" data-act="tutorial-start">开始正式值班</button>
        </div>
      `;
    }

    // ------------------------------------------------------------------
    // 值班手册
    // ------------------------------------------------------------------
    helpHtml() {
      const groups = [
        ['值班目标', [
          '在 10 个回合（22:00 → 08:00）内阻止真实攻击链，同时避免误封与业务中断。',
        ]],
        ['每回合流程', [
          '① 系统生成日志与告警　② 查看网络拓扑和设备状态',
          '③ 调查告警、缩小风险估计范围　④ 消耗行动点执行防御操作',
          '⑤ 未处置事件进入下一阶段　⑥ 结算指标，进入下一个小时',
        ]],
        ['核心规则', [
          '· 安全度降到 0，或数据完整度低于 20 → 失败',
          '· 服务可用性连续 3 回合低于 40 → 过度防御，业务崩溃',
          '· 告警颜色不代表结论：平台会误报，误报也需要调查确认',
          '· 隔离/关停只是“控制”；还要在设备上清除威胁，最后恢复业务',
          '· 服务中断会减少收入并触发 SLA 违约，左下角可看业务状态',
          '· 调查后会预测攻击下一跳；提前隔离下一跳可拖住攻击',
          '· 资金和行动点有限，执行操作前先看消耗',
        ]],
        ['操作提示', [
          '· 点击拓扑节点选择设备；点击右侧告警查看详情',
          '· 告警等级在调查前显示为“待评估”，先调查再处置更稳',
          '· 操作面板只显示当前目标可用的操作，灰色按钮悬停可看原因',
          '· 连续正确处置会累积连击，连击奖励额外行动点',
          '· 日志终端支持分类过滤和关键词搜索（英文/数字最稳定）',
          '· 空格 = 推进回合　Esc = 暂停　F1 = 手册　U = 安全加固',
          '· F5 = 保存进度　F9 = 读取进度　M = 音效开关',
        ]],
      ];
      return `
        <p class="modal-kicker">值班手册 · F1</p>
        <h2 class="modal-title" id="modal-title">值班手册</h2>
        <div class="help-grid">
          ${groups.map(([title, lines]) => `
            <div>
              <h3>${esc(title)}</h3>
              <ul>${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
            </div>
          `).join('')}
        </div>
        <p class="help-note">本游戏为课程演示，所有 IP、账号、域名与服务器均为虚构数据；
不扫描网络、不连接服务器、不执行系统命令、不包含恶意代码。</p>
        <nav class="menu-links help-links" aria-label="项目链接">
          <a href="https://telling890.github.io/zero-day-duty/" target="_blank" rel="noreferrer">项目主页</a>
          <a href="https://github.com/telling890/zero-day-duty" target="_blank" rel="noreferrer">GitHub 源码</a>
          <a href="https://github.com/telling890/zero-day-duty/releases/latest" target="_blank" rel="noreferrer">下载 Windows 版</a>
          <a href="README.md" target="_blank" rel="noreferrer">网页版说明</a>
        </nav>
        <div class="modal-actions">
          <button class="btn primary" data-act="help-close">关闭手册</button>
        </div>
      `;
    }

    // ------------------------------------------------------------------
    // 决策
    // ------------------------------------------------------------------
    decisionHtml(game) {
      const decision = game.pendingDecision;
      if (!decision) return '';
      const speaker = String(decision.speaker || '').trim();
      const choices = Array.isArray(decision.choices) ? decision.choices : [];
      return `
        <p class="modal-kicker">第 ${game.turn} 回合 · 值班决策${speaker ? ` · ${esc(speaker)}` : ''}</p>
        <h2 class="modal-title decision-card" id="modal-title">${esc(decision.title || '紧急决策')}</h2>
        <p class="modal-sub">${esc(decision.prompt || '')}</p>
        <p class="modal-note">选择会立即改变指标，并影响本局最终结算。</p>
        <div>
          ${choices.slice(0, 2).map((choice, index) => `
            <button class="choice" data-act="decision-choose" data-index="${index}">
              <strong>${esc(choice.label || '选择')}</strong>
              <span>${esc(choice.hint || '')}</span>
            </button>
          `).join('')}
        </div>
      `;
    }

    // ------------------------------------------------------------------
    // 加固商店
    // ------------------------------------------------------------------
    shopHtml(game) {
      const grouped = game.upgradeTree.byTrack();
      const trackColors = {
        accent: 'var(--accent)',
        green: 'var(--green)',
        orange: 'var(--orange)',
        purple: 'var(--purple)',
        yellow: 'var(--yellow)',
        blue: 'var(--blue)',
      };
      const cards = game.upgradeTree.tracks.map((track) => {
        const color = trackColors[track.color] || 'var(--accent)';
        const list = grouped[track.trackId] || [];
        const owned = list.filter((upgrade) => game.player.upgrades.has(upgrade.upgradeId)).length;
        return `
          <div class="track" style="--track-color:${color}">
            <div class="track-head">
              <h3>${esc(track.name)}</h3>
              <span>${esc(track.tagline)} · 已启用 ${owned}/${list.length}</span>
            </div>
            <div class="track-cards">
              ${list.map((upgrade) => this.upgradeCard(game, upgrade)).join('')}
            </div>
          </div>
        `;
      }).join('');
      return `
        <div class="shop-head">
          <div>
            <p class="modal-kicker">安全加固 · 三线两层</p>
            <h2 class="modal-title" id="modal-title">把预算换成今晚的余量</h2>
          </div>
          <p class="budget">可用预算 ${ZDD.formatMoney(game.player.funds)}</p>
        </div>
        <p class="modal-sub">三条线各两层：第一层随时可补，第二层是专精，同一时间只能选一个。购买后本局内永久生效。</p>
        <div class="tracks">${cards}</div>
        <p class="shop-foot">专精互斥：情报深挖 / 快速清场 / 保业务，三条线只能选一条走到底；选择后本局内不可更改。</p>
        <div class="modal-actions">
          <button class="btn primary" data-act="shop-close">返回值班</button>
        </div>
      `;
    }

    upgradeCard(game, upgrade) {
      const [state, reason] = game.upgradeState(upgrade);
      const canBuy = state === 'available';
      const stateColor = {
        owned: 'var(--green)',
        excluded: 'var(--red)',
        locked: 'var(--dim)',
        unaffordable: 'var(--orange)',
        available: 'var(--faint)',
      }[state];
      const badge = state === 'owned'
        ? '<span class="up-cost" style="color:var(--green)">已启用</span>'
        : `<span class="up-cost">¥${upgrade.cost}</span>`;
      return `
        <div class="up-card" data-state="${state}">
          <div class="up-top">
            <span class="up-tier">L${upgrade.tier}</span>
            <span class="up-name">${esc(upgrade.name)}</span>
            ${badge}
          </div>
          <p class="up-desc">${esc(upgrade.description)}</p>
          <div class="up-state">
            <span style="color:${stateColor}" title="${esc(reason)}">${esc(reason)}</span>
            ${state === 'owned' ? '' : `<button class="btn small" data-act="shop-buy" data-upgrade="${esc(upgrade.upgradeId)}" ${canBuy ? '' : 'disabled'} title="${esc(reason)}">购买</button>`}
          </div>
        </div>
      `;
    }

    // ------------------------------------------------------------------
    // 历史排行榜
    // ------------------------------------------------------------------
    historyHtml(game) {
      const history = game.saveManager.loadHistory();
      if (!history.length) {
        return `
          <p class="modal-kicker">本机记录 · 最多 30 条</p>
          <h2 class="modal-title" id="modal-title">历史排行榜</h2>
          <p class="modal-sub">还没有历史记录。完成一局值班后就会出现在这里。</p>
          <div class="modal-actions">
            <button class="btn primary" data-act="history-close">关闭</button>
          </div>
        `;
      }
      const rows = history.slice(0, 30).map((entry, index) => `
        <tr>
          <td>${index + 1}</td>
          <td class="score">${Number(entry.score || 0)}</td>
          <td><span class="grade-tag grade-${esc(String(entry.grade || '-').slice(0, 1))}">${esc(entry.grade || '-')}</span></td>
          <td title="${esc(entry.ending || '-')}">${esc(entry.ending || '-')}</td>
          <td>${esc(entry.turn || '-')}</td>
          <td>${esc(entry.seed || '-')}</td>
          <td>${esc(entry.timestamp || '-')}</td>
        </tr>
      `).join('');
      return `
        <p class="modal-kicker">本机记录 · 按分数排序 · 最多 30 条</p>
        <h2 class="modal-title" id="modal-title">历史排行榜</h2>
        <p class="modal-sub">历史记录保存在这台设备的浏览器里，不会上传到任何服务器。</p>
        <table class="history-table">
          <thead>
            <tr><th>#</th><th>得分</th><th>等级</th><th>结局</th><th>回合</th><th>种子</th><th>时间</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="modal-actions">
          <button class="btn ghost" data-act="history-clear">清空本机记录</button>
          <button class="btn primary" data-act="history-close">关闭</button>
        </div>
      `;
    }

    // ------------------------------------------------------------------
    // 结算
    // ------------------------------------------------------------------
    resultHtml(game) {
      const report = game.report;
      if (!report) return '';
      const color = ENDING_COLORS[report.endingKey] || 'var(--accent)';
      return `
        <div class="result-head">
          <div>
            <p class="modal-kicker">值班结算 · 第 ${game.turn} 回合结束 · 随机种子 ${game.seed}</p>
            <h2 class="ending-title" id="modal-title" style="color:${color}">${esc(report.endingTitle)}</h2>
            <p class="modal-sub">${esc(report.endingText)}</p>
          </div>
          <div class="grade" style="color:${color}; border-color:${color}">${esc(report.grade)}</div>
        </div>
        <div class="result-news">
          <b>早间新闻</b>
          <strong>${esc(report.newsHeadline)}</strong><br />
          ${esc(report.newsDetail)}
        </div>
        <div class="result-grid">
          <div class="score-box">
            <p class="score-label">最终得分</p>
            <div class="score-row">
              <span class="score-value" style="color:${color}">${report.score}</span>
              <span class="score-max">/ 130</span>
            </div>
            <p class="style-line">值班风格：${esc(report.style)}</p>
            <p class="style-comment">${esc(report.styleComment)}</p>
          </div>
          <div class="stats-box">
            <h3>值班统计</h3>
            <div class="stats-grid">
              ${report.stats.map(([name, value]) => `
                <div class="stat"><span>${esc(name)}</span><b>${esc(value)}</b></div>
              `).join('')}
            </div>
          </div>
        </div>
        ${report.achievements.length ? `
          <div class="achievements">
            <span class="label">成就</span>
            ${report.achievements.map((name, index) => `
              <span class="tag" style="color:${['var(--yellow)', 'var(--accent)', 'var(--green)', 'var(--purple)', 'var(--orange)'][index % 5]}">${esc(name)}</span>
            `).join('')}
          </div>
        ` : ''}
        <p class="modal-note">本局所有数据均为虚构；随机种子固定时结果可复现。</p>
        <div class="modal-actions">
          <button class="btn ghost" data-act="result-menu">返回主菜单</button>
          <button class="btn primary" data-act="result-restart">再值一班</button>
        </div>
      `;
    }

    // ------------------------------------------------------------------
    // 暂停
    // ------------------------------------------------------------------
    pauseHtml(game) {
      return `
        <p class="modal-kicker">第 ${game.turn} / ${game.player.totalTurns} 回合 · ${ZDD.clockText(game.turn)}</p>
        <h2 class="modal-title" id="modal-title">值班暂停</h2>
        <p class="modal-sub">安全度 ${game.player.security}%　·　资金 ${ZDD.formatMoney(game.player.funds)}　·　可用性 ${game.player.availability}%　·　数据完整度 ${game.player.integrity}%
随机种子 ${game.seed}　·　${game.audio.stateText}（按 M 切换）　·　连击 ×${game.combo}</p>
        <div class="modal-actions">
          <button class="btn primary" data-act="pause-resume">继续值班</button>
          <button class="btn" data-act="pause-save">保存进度（F5）</button>
          <button class="btn" data-act="pause-load">读取进度（F9）</button>
          <button class="btn" data-act="pause-shop">安全加固（U）</button>
          <button class="btn" data-act="pause-restart">重新开始本局</button>
          <button class="btn ghost" data-act="pause-menu">返回主菜单</button>
        </div>
        <p class="modal-note">保存的进度只写在这台设备的浏览器里；关闭页面不会自动保存。</p>
      `;
    }

    // ------------------------------------------------------------------
    // 实战演练卡片
    // ------------------------------------------------------------------
    renderGuide(step, game) {
      if (!game.tutorialMode || step === null) {
        this.guide.hidden = true;
        this.ring.hidden = true;
        return;
      }
      const info = GUIDE_STEPS[step];
      const color = ZDD.colors[info.color] || 'var(--tutorial)';
      this.guide.hidden = false;
      this.guide.innerHTML = `
        <div class="guide-top">
          <span class="guide-kicker">实战演练 ${step + 1} / ${GUIDE_STEPS.length}</span>
          <span class="guide-stage" style="background:${color}">${esc(info.stage)}</span>
        </div>
        <h3>${esc(info.title)}</h3>
        <p>${esc(info.instruction)}</p>
        <p class="why">为什么：${esc(info.why)}</p>
        <div class="guide-progress">
          ${GUIDE_STEPS.map((_, i) => `<i class="${i < step ? 'done' : i === step ? 'now' : ''}"></i>`).join('')}
        </div>
        <div class="guide-exit">
          <button class="btn ghost small" data-act="guide-exit">退出教程</button>
        </div>
      `;
      this.updateRing(step);
    }

    guideTarget(step) {
      if (step === 0) return this.refs.alertList.querySelector('.alert-row') || this.refs.alertList;
      if (step === 1) return this.refs.actionGrid.querySelector('[data-action-id="investigate"]');
      if (step === 2) return this.refs.actionGrid.querySelector('[data-action-id="isolate"]');
      if (step === 3) return this.refs.actionGrid.querySelector('[data-action-id="eradicate"]');
      if (step === 4) return this.refs.actionGrid.querySelector('[data-action-id="unisolate"]');
      if (step === 5) return this.refs.advance;
      return null;
    }

    updateRing(step) {
      const target = this.guideTarget(step);
      if (!target || this.guide.hidden) {
        this.ring.hidden = true;
        return;
      }
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        this.ring.hidden = true;
        return;
      }
      this.ring.hidden = false;
      this.ring.style.left = `${rect.left - 4}px`;
      this.ring.style.top = `${rect.top - 4}px`;
      this.ring.style.width = `${rect.width + 8}px`;
      this.ring.style.height = `${rect.height + 8}px`;
    }

    setRefs(refs) {
      this.refs = refs;
    }
  }

  ZDD.Screens = Screens;
  ZDD.TUTORIAL_PAGES = TUTORIAL_PAGES;
  ZDD.GUIDE_STEPS = GUIDE_STEPS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
