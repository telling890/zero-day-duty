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
      body: '你的目标不是把告警点完，而是在 08:00 前阻止 6 条攻击链，同时别把公司业务全关掉。',
      steps: ['调查', '控制', '清除', '恢复'],
      bullets: [
        '10 个回合、22:00 → 08:00；每回合开始有 6 点行动点（AP）。',
        '每条攻击链都要走完四步：调查 → 控制 → 清除 → 恢复；少一步都不算解决。',
        '只隔离不清除会扣分；清除后不恢复业务，服务仍然中断。',
        '安全度归零、数据完整度 ≤ 20、可用性连续 3 回合 ≤ 40，都会失败。',
        '本教程只放一条钓鱼事件，跟着点一遍就能掌握完整循环。',
      ],
      note: '先把这四步记住：调查 → 控制 → 清除 → 恢复。',
    },
    {
      title: '你的任务与胜负条件',
      body: '你是云栖示例科技的夜班安全管理员。主管、公关和运维都会在消息区留言，但最终做决定的是你。',
      bullets: [
        '目标：08:00 前清除全部 6 条攻击链，并尽量保持业务在线。',
        '失败：安全度归零、数据完整度 ≤ 20、服务可用性连续 3 回合 ≤ 40。',
        '结算会看：清除数、仅控制数、漏报、误封、平均响应、资金、声誉、可用性、完整度和连击。',
        '过度防御也会输：把所有服务关掉，攻击没进来，业务先崩。',
        '行动点和资金有限，优先处理最可能造成重大损失的攻击链。',
      ],
      note: '安全不是「全停」，而是在有限资源下做对取舍。',
    },
    {
      title: '界面地图：先看这 7 块',
      body: '不用记住所有细节，先知道「点哪里、看哪里」，第一回合就能开始。',
      bullets: [
        '顶部：回合/时间、威胁、安全度、资金、AP、声誉、可用性、完整度。',
        '左栏上：网络拓扑；点节点选设备，点空白回到业务总览。',
        '左栏下：设备详情/业务简报；看状态、补丁、备份和服务是否中断。',
        '右栏上：安全告警；点一条告警，操作面板才会出现对应按钮。',
        '右栏中：日志终端；先按「告警/情报」过滤，或用搜索框找设备/IP。',
        '右栏下：操作面板；只显示当前目标可用的操作，灰色按钮悬停看原因。',
        '底部：消息和「推进回合 →」；按空格也可以推进。',
      ],
      note: '最重要的三个位置：右侧告警、右侧操作面板、右下推进回合。',
    },
    {
      title: '第一回合：按顺序点一遍',
      body: '这一页就是「怎么玩」的标准答案。教程里第一回合只有一条钓鱼告警，照下面 6 步点，正好用完 6 点 AP。',
      steps: ['点告警', '调查', '隔离', '清除', '解除隔离', '推进回合'],
      bullets: [
        '① 点右侧告警列表第一条「可疑邮件：伪造付款通知」。',
        '② 点操作面板「调查告警」（1 AP / ¥20）：看清真实等级、线索和下一跳。',
        '③ 点「隔离设备」（2 AP / ¥30）：先控制扩散；这不是清除。',
        '④ 点「清除威胁」（2 AP / ¥60）：根因清除后告警才会关闭。',
        '⑤ 点「解除隔离」（1 AP / ¥0）：让 PC-01 重新上线，业务恢复。',
        '⑥ 点右下「推进回合 →」或按空格：进入 23:00，AP 重置为 6。',
      ],
      note: '顺序不能反：先控制再清除；清除后一定要恢复业务。',
    },
    {
      title: '调查：不要跳过这一步',
      body: '调查前告警等级显示「待评估」。不调查就不知道真假，而且删除邮件、重置密码、封禁来源都不可用。',
      bullets: [
        '调查成本 1 AP / ¥20；每回合只有 6 AP，先花在要处置的告警上。',
        '调查后才会显示真实等级、线索、风险区间、置信度和「下一跳」。',
        '误报也要调查才能确认；确认是误报就不要隔离或清除。',
        '调查结果里的「建议处置」和「风险提示」就是下一步的提示。',
        '调查是识别，不是解决；调查完还要控制、清除、恢复。',
      ],
      note: '先调查，再决定隔离、封禁还是直接删除邮件。',
    },
    {
      title: '控制：先让攻击停下来',
      body: '隔离、关停、封禁都只是「控制」。攻击暂时停住，但根因还在，事件会停在「已控制·待清除」。',
      bullets: [
        '隔离设备：最常用，2 AP；会中断该设备承载的业务。',
        '封禁来源 IP：1 AP，不中断业务，适合应对外部来源。',
        '关闭服务器：2 AP；影响面大，非必要不用。',
        '控制后告警会变成「已控制·待清除」，不要停在这里。',
        '只控制不清除，结算会扣分；先控制再清除才是完整处置。',
      ],
      note: '记住：隔离 ≠ 解决。',
    },
    {
      title: '清除：挖掉根因',
      body: '清除是把攻击根因移除，清除成功后告警才会关闭。不同事件有不同的清除方式。',
      bullets: [
        '钓鱼邮件早期：删除可疑邮件可直接阻断，不一定需要隔离。',
        '凭据泄露：重置账号密码，让攻击者手里的会话失效。',
        '已经控制的事件：在设备上执行「清除威胁」。',
        'Web 流量异常/零日：安装补丁，降低后续被利用的风险。',
        '清除成功会涨安全度、关闭告警，并累积连击；每 2 连击奖励 AP。',
      ],
      note: '清除后别忘了恢复业务，见下一页。',
    },
    {
      title: '恢复：让业务重新上线',
      body: '清除根因之后，设备可能还处于隔离/关机状态，业务仍然中断。恢复是最后一步，不是可选项。',
      bullets: [
        '解除隔离：让设备重新上线；已清除的事件不会因此复活。',
        '启动服务器：关机后重新上线，恢复服务。',
        '从备份恢复：数据损坏时恢复数据完整度。',
        '服务中断会减少收入并扣声誉；严重时会触发 SLA 违约。',
        '连续 3 回合可用性 ≤ 40 会判负；不要用「全关」来换安全。',
      ],
      note: '恢复完成，才算真的处置完一条攻击链。',
    },
    {
      title: '风险、下一跳与同源告警',
      body: '调查之后，告警详情会给出风险区间、置信度和攻击下一跳；它们决定你接下来先防哪里。',
      bullets: [
        '风险区间越窄、置信度越高，判断越准；加固和多次调查都能提升。',
        '「下一跳」是攻击者下一步可能影响的设备；提前隔离可以拖住攻击。',
        '提前隔离下一跳也会中断它的业务，要权衡。',
        '同源 IP/同账号的告警可能属于同一场战役；一起处理，别逐条单打。',
        '威胁等级 = 1 + 活跃攻击链数量；等级越高，事件伤害越大。',
      ],
      note: '看到「同源/战役」提示，先想整条链，而不是单条告警。',
    },
    {
      title: 'AP、资金与业务：为什么不能全点',
      body: '每个操作都有成本。AP 和资金花完，下一回合攻击升级时你就没有牌可打。',
      bullets: [
        '每回合 6 AP，推进回合后重置；资金从公司账户扣除。',
        '操作按钮上写着 AP 和 ¥；灰色按钮悬停可以看到不可用原因。',
        '隔离/关停会中断服务，减少收入、扣声誉；先算代价再点。',
        '连续彻底清除会积累连击；每 2 连击奖励额外 AP。',
        '资金低于 ¥120 时，后续很多操作会受限。',
      ],
      note: '资源有限，优先处理「会造成重大损失」的攻击链。',
    },
    {
      title: '加固、决策与高级操作',
      body: '一局之内还有加固树、剧情决策，以及更快的终端和脚本。',
      bullets: [
        '按 U 或暂停菜单打开安全加固：三条线 × 两层，第二层三选一。',
        '第 4/7 回合会弹出剧情决策，每个选项都有代价，没有免费选项。',
        '顶部「终端」或按 `：输入 scan / isolate / clean / release 等命令。',
        '顶部「脚本」或按 C：用 for + alerts()/devices() 写自动化处置。',
        '操作按钮右上角的数字 1–6，可以直接用键盘执行对应按钮。',
      ],
      note: '先学会手动 4 步，再用终端/脚本提速。',
    },
    {
      title: '准备实战：6 步演练',
      body: '接下来用一条钓鱼事件走完整循环：选告警 → 调查 → 隔离 → 清除 → 解除隔离 → 推进。屏幕上会高亮要点击的位置。',
      steps: ['选告警', '调查', '隔离', '清除', '解除隔离', '推进'],
      bullets: [
        '教程中只有一条钓鱼事件，不会出现其他攻击。',
        '每一步都会用光圈高亮目标按钮；按提示点击即可。',
        '如果点错了，操作面板会提示原因；随时可以退出教程。',
        '正式值班有 6 条攻击链、随机事件顺序、误报和剧情决策。',
        '记住检查清单：调查 → 控制 → 清除 → 恢复 → 推进回合。',
      ],
      note: '完成演练后，点击「开始正式值班」进入 10 回合实战。',
    },
  ];

  const GUIDE_STEPS = [
    {
      title: '选择告警',
      instruction: '点右侧告警列表的第一条告警；选中后下方操作面板才会出现按钮。',
      why: '不知道要处理哪条告警，操作面板不会给你针对性操作。',
      stage: '选择',
      color: 'accent',
    },
    {
      title: '调查告警',
      instruction: '点操作面板「调查告警」，花 1 AP 查看真实等级、线索和下一跳。',
      why: '调查前等级是「待评估」；调查后才能判断真假并选择处置方式。',
      stage: '调查',
      color: 'accent',
    },
    {
      title: '控制攻击',
      instruction: '点「隔离设备」（2 AP），先让攻击停止扩散。',
      why: '隔离只是控制；事件会变成「已控制·待清除」，还没结束。',
      stage: '控制',
      color: 'yellow',
    },
    {
      title: '清除根因',
      instruction: '点「清除威胁」（2 AP），移除根因并关闭告警。',
      why: '只控制不清除会在结算时扣分；清除才算解决。',
      stage: '清除',
      color: 'green',
    },
    {
      title: '恢复业务',
      instruction: '点「解除隔离」（1 AP），让 PC-01 重新上线。',
      why: '已清除的事件不会复活；恢复后服务收入才会回来。',
      stage: '恢复',
      color: 'blue',
    },
    {
      title: '推进回合',
      instruction: '点右下「推进回合 →」或按空格，进入 23:00。',
      why: 'AP 会重置为 6；攻击会在回合结束时推进到下一阶段。',
      stage: '推进',
      color: 'orange',
    },
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
      const steps = Array.isArray(page.steps) && page.steps.length
        ? `
          <div class="tutorial-loop" role="list" aria-label="本页流程">
            ${page.steps.map((step, i) => `
              <span class="tut-step" role="listitem"><i>${i + 1}</i>${esc(step)}</span>
              ${i < page.steps.length - 1 ? '<span class="tut-arrow" aria-hidden="true">→</span>' : ''}
            `).join('')}
          </div>
        `
        : '';
      return `
        <p class="modal-kicker">新手教程 · ${index + 1} / ${TUTORIAL_PAGES.length}</p>
        <h2 class="modal-title" id="modal-title">${esc(page.title)}</h2>
        <p class="modal-sub">${esc(page.body)}</p>
        ${steps}
        <div class="tutorial-pages">
          ${TUTORIAL_PAGES.map((_, i) => `<i class="${i <= index ? 'done' : ''}"></i>`).join('')}
        </div>
        <ul class="tutorial-bullets">
          ${page.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join('')}
        </ul>
        ${page.note ? `<p class="tutorial-note">${esc(page.note)}</p>` : ''}
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
        <p class="modal-sub">你刚刚走完了完整循环：选择告警 → 调查 → 隔离 → 清除 → 解除隔离 → 推进回合。</p>
        <ul class="tutorial-bullets">
          <li>只控制不清除会扣分；清除根因后一定要恢复业务。</li>
          <li>正式值班有 6 条攻击链、随机事件顺序、误报和零日 BOSS。</li>
          <li>每回合先看告警和日志，再花 AP；不要把所有服务都关掉。</li>
          <li>看到「下一跳 / 同源」提示，提前防守或整条链一起处理。</li>
          <li>服务可用性连续 3 回合 ≤ 40 会失败；随时看左下角业务状态。</li>
        </ul>
        <p class="tutorial-note">第一回合的标准顺序：点告警 → 调查 → 隔离 → 清除 → 解除隔离 → 推进回合。</p>
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
        ['自动化剧本', [
          '· 按 C 或点顶部「脚本」打开；Ctrl+Enter 运行，单步可逐条执行。',
          '· 查询：alerts() / devices() / events() / find("PC-01") / status()',
          '· 处置：scan(a) / isolate(d) / clean(d) / release(d) / block(a) 等',
          '· 语法是 Python 风格子集：变量、if/elif/else、for、while、列表与属性访问；暂不支持 def。',
        ]],
        ['操作提示', [
          '· 点击拓扑节点选择设备；点击右侧告警查看详情',
          '· 告警等级在调查前显示为“待评估”，先调查再处置更稳',
          '· 操作面板只显示当前目标可用的操作，灰色按钮悬停可看原因',
          '· 连续正确处置会累积连击，连击奖励额外行动点',
          '· 日志终端支持分类过滤和关键词搜索（英文/数字最稳定）',
          '· 顶部「终端」或按 ` 打开处置终端：scan / isolate / clean / release 等命令，Tab 补全、↑/↓ 历史',
          '· 顶部「脚本」或按 C 打开自动化剧本：用 for + alerts()/devices() 批量处置，Ctrl+Enter 运行',
          '· 操作按钮右上角的数字对应键盘 1–6，选中目标后可直接按键执行',
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
不扫描网络、不连接服务器、不执行系统命令、不包含恶意代码。<br />
音效需要先点击或按键一次才会解锁；如果听不到声音，先点「播放测试音」，再检查系统音量和浏览器对该站点的静音设置。</p>
        <nav class="menu-links help-links" aria-label="项目链接">
          <a href="https://telling890.github.io/zero-day-duty/" target="_blank" rel="noreferrer">项目主页</a>
          <a href="https://github.com/telling890/zero-day-duty" target="_blank" rel="noreferrer">GitHub 源码</a>
          <a href="https://github.com/telling890/zero-day-duty/releases/latest" target="_blank" rel="noreferrer">下载 Windows 版</a>
          <a href="README.md" target="_blank" rel="noreferrer">网页版说明</a>
        </nav>
        <div class="modal-actions">
          <button class="btn" data-act="test-sound">播放测试音</button>
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
          <button class="btn ghost" data-act="test-sound">播放测试音</button>
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
