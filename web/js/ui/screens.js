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
      title: '加固与剧情决策',
      body: '除了处置告警，一局之内还有两件事会影响结局：花钱买加固，以及在关键时刻做决策。',
      bullets: [
        '按 U 或暂停菜单打开安全加固：三条线 × 两层，第二层三选一，买了本局永久生效。',
        '开局可选新手/标准/专家：只改变信息质量、提示和误判代价，不直接增加攻击伤害。',
        '第 4/5/7 回合会弹出剧情决策，第 5 回合是三选一；选项只显示直接成本，安全影响可能延后 1–3 回合显现。',
        '延迟后果会回到日志与结算时间里解释；没有免费选项，也没有稳赚不赔的路线。',
        '拿不准时按 F1 打开值班手册，规则和快捷键都在里面。',
      ],
      note: '先学会手动处置，再考虑用资金换效率。',
    },
    {
      title: '顶栏 5 个按钮怎么用',
      body: '值班全程都能点，记住快捷键会快很多。',
      buttons: [
        ['终端', '` / ~', '打开命令行（反引号键）；输入 scan PC-01 / isolate PC-01 等命令，Tab 补全，Esc 关闭。'],
        ['脚本', 'C', '打开自动化剧本；用 for + alerts() 批量处置，Ctrl+Enter 运行，Esc 关闭。'],
        ['手册', 'F1', '完整规则、快捷键和「播放测试音」；忘记怎么玩时先看这里。'],
        ['音效', 'M', '开/关音效；浏览器需要先点击页面一次才允许出声。'],
        ['暂停', 'Esc', '保存（F5）、读取（F9）、安全加固、重开或返回主菜单。'],
      ],
      note: '操作面板按钮右上角的 1–6 可直接按键盘执行；空格推进回合。新手先记 Esc / F1 / M；命令与脚本的完整玩法在接下来两页。',
    },
    {
      title: '命令行：用终端处置',
      body: '顶栏「终端」或按反引号 ` 打开 SOC 命令行。命令和点按钮是同一套操作：同样扣 AP、同样扣钱、同样受回合规则约束。',
      steps: ['status', 'alerts', 'scan PC-01', 'isolate PC-01', 'next'],
      bullets: [
        '打开：顶部「终端」或反引号 `；Esc 关闭，clear 清屏。',
        '目标写法：设备名（PC-01）或告警编号（#1）；scan 两种都收。',
        '查询：status / devices / alerts / logs PC-01 12 / upgrades / date / ping PC-01。',
        '处置：scan → isolate → clean → release；封禁来源用 block <IP>，买加固用 buy log_plugin。',
        'Tab 补全命令与设备名，↑/↓ 翻历史，help 看全部 28 条命令。',
        '中文也能输入：调查 / 隔离 / 清除 / 解除隔离 / 推进，会自动映射到对应命令。',
      ],
      note: '先 status 看 AP、alerts 找目标，再动手；命令不成立时会打印原因，不会白扣费用。',
    },
    {
      title: '脚本：批量自动处置',
      body: '顶栏「脚本」或按 C 打开自动化剧本。ZDD Script 是 Python 风格子集，每次调用都等价于点一次按钮，不会联网、不会执行真实系统命令。',
      steps: ['打开脚本', '选模板', 'Ctrl+Enter 运行', '看逐条输出'],
      bullets: [
        '查询：alerts() / devices() / events() / find("PC-01") / status()。',
        '处置：scan(a) / isolate(d) / clean(d) / release(d) / block(a) / next()。',
        '语法：变量、if/elif/else、for、while、break/continue、列表与属性访问；不支持 def 和 import。',
        '范例：for a in alerts(): 然后在下一行缩进写 if not a.investigated: scan(a)。',
        'Ctrl+Enter 运行，「单步」逐条执行；报错会标出行号，遇到剧情决策会自动暂停。',
        '模板下拉里有「自动巡检 / 清场 / 封禁来源 / 局势查询 / 单设备处置」，可直接套用再改。',
      ],
      note: '脚本不替你判断误报：调查后拿到 a.false_positive 再决定是否批量隔离，避免误封扣分。',
    },
    {
      title: '值班之外：生活线',
      body: '你是夜班安全管理员，也是一个有身体、有情绪、有家的人。除了告警和指标，这个夜班还跟着三条生活数值：体力、心情、家庭。',
      bullets: [
        '三条数值：体力 / 心情 / 家庭，初值 72 / 70 / 60，范围 0–100；顶栏「值班员状态」一格看完。',
        '每回合消耗：第 2 回合起，每回合开始时体力 −3、心情 −2、家庭 −3（第 1 回合不扣）。',
        '体力 → 行动点：≥55 是满 6 点；30–54 只剩 5 点；<30 只剩 4 点（下限 3 点）。',
        '心情 → 判断力：心情 <40 时，调查置信度 −10%，风险区间变宽。',
        '家庭 → 结局：家庭 ≤25 触发「没守住家」；家庭 ≥70 且体力 ≥50 会「带回了早饭」。',
        '第 2/3/6/9/10 回合会出现生活场景：工资到账、老板发火、家里视频、天亮回家、早会。选项只写直接成本，隐性影响到期才解释。',
      ],
      note: '值班员不是机器。',
    },
    {
      title: '准备实战：6 步带练',
      body: '接下来用一条钓鱼事件走完整循环，而且刻意让你三种输入方式各用一次：点按钮、敲命令、跑脚本。',
      steps: ['选告警', '调查', '命令隔离', '清除', '脚本恢复', '推进'],
      bullets: [
        '背景会被压暗，只为你圈出这一步该操作的位置；旁边的提示卡说清「做什么」和「为什么」。',
        '第 3 步必须用终端跑 isolate PC-01，第 5 步必须用脚本跑 release(d)——点按钮不会点亮进度。',
        '打不动命令或脚本时，点提示卡上的「帮我把命令/脚本填好」，内容会自动填进输入框，你只要回车或点运行。',
        '教程里只有一条钓鱼事件，不会出现其他攻击；点上一步用过的终端/脚本会自动收起。',
        '随时可以点「退出教程」；正式值班有 6 条攻击链、随机顺序、误报和剧情决策。',
      ],
      note: '完成带练后点「开始正式值班」进入 10 回合实战。',
    },
  ];

  const GUIDE_STEPS = [
    {
      title: '选择告警',
      stage: '选择',
      channel: '点击',
      color: 'accent',
      keys: ['点一条告警'],
      instruction: '点右侧告警列表的第一条告警；选中后下方操作面板才会出现按钮。',
      why: '不知道要处理哪条告警，操作面板不会给你针对性操作。',
    },
    {
      title: '调查告警',
      stage: '调查',
      channel: '点击',
      color: 'accent',
      keys: ['点「调查告警」'],
      instruction: '点操作面板「调查告警」，花 1 AP 看清真实等级、线索和下一跳。',
      why: '调查前等级是「待评估」；调查后才能判断真假并选择处置方式。',
    },
    {
      title: '用命令隔离',
      stage: '命令',
      channel: '命令行',
      color: 'yellow',
      keys: ['反引号 `', 'isolate PC-01', 'Enter'],
      instruction: '按 ` 打开终端，输入 isolate PC-01 再回车。敲不动就点下面的按钮，它会替你把命令填进输入框。',
      why: '终端和按钮是同一套操作：一样扣 2 AP；隔离后事件变成「已控制·待清除」，还没结束。',
      helper: { kind: 'terminal', cmd: 'isolate PC-01', label: '帮我把命令填好' },
    },
    {
      title: '清除根因',
      stage: '清除',
      channel: '点击',
      color: 'green',
      keys: ['点「清除威胁」'],
      instruction: '终端已自动收起。点操作面板「清除威胁」（2 AP），把根因挖掉。',
      why: '只控制不清除，结算会扣分；清除成功，告警才会关闭。',
    },
    {
      title: '用脚本恢复',
      stage: '脚本',
      channel: '脚本',
      color: 'blue',
      keys: ['C', 'Ctrl+Enter'],
      instruction: '按 C 打开脚本，运行这三行剧本：find("PC-01") 找到设备，release(d) 让业务重新上线。',
      why: '脚本是第三种输入方式，调的仍是同一套操作，AP 和钱照扣，但能批量重复。',
      helper: {
        kind: 'script',
        label: '帮我把脚本填好',
        source: 'd = find("PC-01")\nrelease(d)\nprint("PC-01 已恢复：", d.status)',
      },
    },
    {
      title: '推进回合',
      stage: '推进',
      channel: '点击',
      color: 'orange',
      keys: ['点「推进回合」'],
      instruction: '脚本已自动收起。点右下「推进回合 →」或按空格，看 AP 重置为 6。',
      why: '到这里三种输入方式都试过了：点按钮、敲命令、跑脚本，它们完全等价。',
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
      const extra = kind === 'decision' && game && game.pendingDecision && game.pendingDecision.kind === 'life'
        ? 'life-decision'
        : kind === 'tutorial' || kind === 'tutorial-complete' ? 'purple' : kind === 'shop' || kind === 'history' ? 'wide' : '';
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
      const buttons = Array.isArray(page.buttons) && page.buttons.length
        ? `
          <div class="tutorial-keys" role="list" aria-label="顶栏按钮">
            ${page.buttons.map(([name, key, desc]) => `
              <div class="tut-key" role="listitem">
                <span class="tut-key-name">${esc(name)}</span>
                <kbd>${esc(key)}</kbd>
                <span class="tut-key-desc">${esc(desc)}</span>
              </div>
            `).join('')}
          </div>
        `
        : '';
      const bullets = Array.isArray(page.bullets) && page.bullets.length
        ? `
          <ul class="tutorial-bullets">
            ${page.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join('')}
          </ul>
        `
        : '';
      return `
        <p class="modal-kicker">新手教程 · ${index + 1} / ${TUTORIAL_PAGES.length}</p>
        <h2 class="modal-title" id="modal-title">${esc(page.title)}</h2>
        <p class="modal-sub">${esc(page.body)}</p>
        ${steps}
        ${buttons}
        <div class="tutorial-pages">
          ${TUTORIAL_PAGES.map((_, i) => `<i class="${i <= index ? 'done' : ''}"></i>`).join('')}
        </div>
        ${bullets}
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
        <p class="modal-sub">刚才这一遍你用了三种输入方式，做的是同一件事：选择 → 调查 → 隔离 → 清除 → 恢复 → 推进。</p>
        <ul class="tutorial-bullets">
          <li>点击：告警、调查、清除——最直观，适合边看边判断。</li>
          <li>命令行：按反引号键 \` 打开，isolate PC-01 这类命令，记得住命令时连打很快。</li>
          <li>脚本：按 C 打开，几行 ZDD Script 批量处置，适合重复动作和整条攻击链。</li>
          <li>三者共用同一套规则与 AP / 资金，没有“免费捷径”；脚本也不会替你判断误报。</li>
          <li>正式值班有 6 条攻击链、随机顺序、误报和零日 BOSS；先调查，再决定控制还是清除。</li>
        </ul>
        <p class="tutorial-note">检查清单：调查 → 控制 → 清除 → 恢复 → 推进回合；随时按 F1 查手册。</p>
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
          '· 顶栏按钮：终端（`）、脚本（C）、手册（F1）、音效（M）、暂停（Esc）',
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
          <a href="https://telling890.github.io/zero-day-duty/privacy.html" target="_blank" rel="noreferrer">隐私政策</a>
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
      const choiceButtons = choices.slice(0, 3).map((choice, index) => `
        <button class="choice${decision.kind === 'life' ? ' life' : ''}" data-act="decision-choose" data-index="${index}">
          <strong>${esc(choice.label || '选择')}</strong>
          <span>${esc(choice.hint || '')}</span>
        </button>
      `).join('');
      // 生活场景：暖色、眉题换成「生活场景」，说明行讲清三条生活数值怎么影响玩法
      if (decision.kind === 'life') {
        return `
          <p class="modal-kicker">第 ${game.turn} 回合 · 生活场景${speaker ? ` · ${esc(speaker)}` : ''}</p>
          <h2 class="modal-title decision-card life" id="modal-title">${esc(decision.title || '生活场景')}</h2>
          <p class="modal-sub">${esc(decision.prompt || '')}</p>
          <p class="modal-note">生活选择会改变体力、心情与家庭：体力影响每回合行动点，心情影响判断力，家庭影响结局评价。</p>
          <div>${choiceButtons}</div>
        `;
      }
      return `
        <p class="modal-kicker">第 ${game.turn} 回合 · 值班决策${speaker ? ` · ${esc(speaker)}` : ''}</p>
        <h2 class="modal-title decision-card" id="modal-title">${esc(decision.title || '紧急决策')}</h2>
        <p class="modal-sub">${esc(decision.prompt || '')}</p>
        <p class="modal-note">选项只显示可预知的直接成本；安全与业务影响可能在 1–3 回合后显现，结算时会解释。</p>
        <div>${choiceButtons}</div>
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
          <td>${esc({ novice: '新手', standard: '标准', expert: '专家' }[entry.difficulty] || '标准')}</td>
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
            <tr><th>#</th><th>得分</th><th>等级</th><th>结局</th><th>回合</th><th>难度</th><th>种子</th><th>时间</th></tr>
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
    /**
     * 结算页「生活」卡：三条数值 + 生活分 + 一句评语。
     * 不塞进 12 行值班统计网格，避免布局溢出。
     */
    lifeCardHtml(life) {
      const data = life || {};
      const alert = ZDD.LIFE_ALERT || { energy: 30, mood: 40, family: 25 };
      const rows = [
        { label: '体力', value: Number(data.energy ?? 0), color: 'var(--green)', danger: Number(data.energy) < alert.energy },
        { label: '心情', value: Number(data.mood ?? 0), color: 'var(--purple)', danger: Number(data.mood) < alert.mood },
        { label: '家庭', value: Number(data.family ?? 0), color: 'var(--orange)', danger: Number(data.family) <= alert.family },
      ];
      const items = rows.map((row) => {
        const tone = row.danger ? 'var(--red)' : row.color;
        const width = Math.max(0, Math.min(100, row.value));
        return `
          <div class="life-item">
            <span class="life-item-label">${esc(row.label)}</span>
            <b class="life-item-value" style="color:${tone}">${row.value}</b>
            <i class="life-item-bar" style="color:${tone}"><em style="width:${width}%"></em></i>
          </div>
        `;
      }).join('');
      return `
        <div class="result-life">
          <h3>生活 <span>体力 / 心情 / 家庭</span></h3>
          <div class="result-life-grid">
            ${items}
            <div class="life-item score">
              <span class="life-item-label">生活分</span>
              <b class="life-item-value">${Number(data.score ?? 0)}</b>
            </div>
          </div>
          <p class="life-comment">${esc(data.comment || '')}</p>
        </div>
      `;
    }

    resultHtml(game) {
      const report = game.report;
      if (!report) return '';
      const color = ENDING_COLORS[report.endingKey] || 'var(--accent)';
      const review = report.review || {};
      const dangerous = review.dangerousEvent || {};
      const timeline = Array.isArray(report.timeline) ? report.timeline.slice(-10) : [];
      return `
        <div class="result-head">
          <div>
            <p class="modal-kicker">值班结算 · 第 ${game.turn} 回合结束 · ${esc(game.difficultyMode.name)} · 随机种子 ${game.seed}</p>
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
            <p class="style-line">值班风格：${esc(report.style)} · ${esc(report.doctrine)}</p>
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
          ${this.lifeCardHtml(report.life)}
        </div>
        ${report.achievements.length ? `
          <div class="achievements">
            <span class="label">成就</span>
            ${report.achievements.map((name, index) => `
              <span class="tag" style="color:${['var(--yellow)', 'var(--accent)', 'var(--green)', 'var(--purple)', 'var(--orange)'][index % 5]}">${esc(name)}</span>
            `).join('')}
          </div>
        ` : ''}
        <div class="result-review">
          <h3>关键复盘 <span>只从本局真实记录提取，不按分数反推</span></h3>
          <div class="review-grid">
            <div><span>关键正确</span><p>${esc(review.keyCorrect || '—')}</p></div>
            <div><span>最大失误</span><p>${esc(review.keyMistake || '—')}</p></div>
            <div><span>无效操作</span><p>${Number(review.invalidActions || 0)} 次 · 误封损失 ${Number(review.falseIsolationLoss || 0)} 声誉</p></div>
            <div><span>打法与最危险攻击</span><p>${esc(report.doctrine)}${dangerous.name ? ` · ${esc(dangerous.name)}（第 ${dangerous.stage} 阶段）` : ' · 没有完成清除的高危事件'}</p></div>
          </div>
          ${timeline.length ? `
            <ol class="timeline-list">
              ${timeline.map((item) => `
                <li><time>${esc(item.clock || '')}</time><span>${esc(item.text || '')}</span></li>
              `).join('')}
            </ol>
          ` : '<p class="modal-note">本局没有记录到关键事件。</p>'}
        </div>
        <p class="modal-note">本局所有数据均为虚构；同一随机种子 + 同一难度可复现。</p>
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
        this.guide.classList.remove('guide-dock-top');
        document.body.classList.remove('guide-active');
        return;
      }
      const info = GUIDE_STEPS[step];
      const color = ZDD.colors[info.color] || 'var(--tutorial)';
      this.guide.hidden = false;
      document.body.classList.add('guide-active');
      const keys = Array.isArray(info.keys) && info.keys.length
        ? `<div class="guide-keys">${info.keys.map((key) => `<kbd>${esc(key)}</kbd>`).join('')}</div>`
        : '';
      const helper = info.helper
        ? `<button class="btn small purple" data-act="guide-fill">${esc(info.helper.label)}</button>`
        : '';
      this.guide.innerHTML = `
        <div class="guide-top">
          <span class="guide-kicker">实战演练 ${step + 1} / ${GUIDE_STEPS.length}</span>
          <span class="guide-chips">
            <span class="guide-channel">${esc(info.channel || '点击')}</span>
            <span class="guide-stage" style="background:${color}">${esc(info.stage)}</span>
          </span>
        </div>
        <h3>${esc(info.title)}</h3>
        <p>${esc(info.instruction)}</p>
        <p class="why">为什么：${esc(info.why)}</p>
        ${keys}
        <div class="guide-actions">${helper}</div>
        <div class="guide-progress">
          ${GUIDE_STEPS.map((_, i) => `<i class="${i < step ? 'done' : i === step ? 'now' : ''}"></i>`).join('')}
        </div>
        <div class="guide-exit">
          <button class="btn ghost small" data-act="guide-exit">退出教程</button>
        </div>
      `;
      // 窄屏：卡片停在与目标相反的一侧，并把高度限制在空出来的那片区域里，
      // 这样无论目标在页面哪个位置，聚光灯都不会被卡片盖住。
      this.applyDock(step);
      this.updateRing(step);
    }

    /** 窄屏带练卡避让：把卡片停到目标的反侧，高度取该侧空余。 */
    applyDock(step, measured) {
      const narrow = typeof global.matchMedia === 'function'
        && global.matchMedia('(max-width: 980px)').matches;
      const target = narrow ? this.guideTarget(step) : null;
      const rect = measured || (target && typeof target.getBoundingClientRect === 'function'
        ? target.getBoundingClientRect()
        : null);
      if (!narrow || !rect || !rect.height) {
        this.guide.classList.remove('guide-dock-top');
        this.guide.style.maxHeight = '';
        return;
      }
      const vh = global.innerHeight || 0;
      const topbar = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'),
      ) || 120;
      const spaceAbove = rect.top - 12 - (topbar + 8);
      const spaceBelow = vh - 20 - rect.bottom;
      const dockTop = spaceAbove >= spaceBelow;
      this.guide.classList.toggle('guide-dock-top', dockTop);
      const room = Math.max(96, dockTop ? spaceAbove : spaceBelow);
      this.guide.style.maxHeight = `${Math.round(Math.min(room, vh * 0.62))}px`;
    }

    guideTarget(step) {
      const hasClass = (name) => document.body.classList.contains(name);
      if (step === 0) return this.refs.alertList.querySelector('.alert-row') || this.refs.alertList;
      if (step === 1) return this.refs.actionGrid.querySelector('[data-action-id="investigate"]');
      if (step === 2) {
        return hasClass('terminal-open')
          ? document.getElementById('term-input')
          : document.getElementById('btn-terminal');
      }
      if (step === 3) return this.refs.actionGrid.querySelector('[data-action-id="eradicate"]');
      if (step === 4) {
        return hasClass('script-open')
          ? document.getElementById('script-run')
          : document.getElementById('btn-script');
      }
      if (step === 5) return this.refs.advance;
      return null;
    }

    updateRing(step) {
      const target = this.guideTarget(step);
      if (!target || this.guide.hidden) {
        this.ring.hidden = true;
        this.ringStep = null;
        return;
      }
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        this.ring.hidden = true;
        return;
      }
      // 目标完全在视野外时（例如窗口很矮）才滚动一次，其余交给卡片避让
      this.applyDock(step, rect);
      const vh = global.innerHeight || 0;
      const vw = global.innerWidth || 0;
      const offscreen = rect.top < 0 || rect.bottom > vh || rect.left < 0 || rect.right > vw;
      const shouldScroll = this.ringStep !== step && offscreen;
      if (shouldScroll && typeof target.scrollIntoView === 'function') {
        this.ringStep = step;
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        // 平滑滚动不会触发 window 的 scroll 回调（滚动发生在内层容器里），
        // 这里补几次重排，保证光圈跟到新位置，而不是一直停在旧坐标。
        [90, 260, 560].forEach((delay) => {
          global.setTimeout(() => {
            if (!this.guide.hidden) this.updateRing(step);
          }, delay);
        });
      }
      this.ringStep = step;
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
