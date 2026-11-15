# 上架 Steam 清单（零日值班 / Zero-Day Duty）

这目录里是**除了「注册账号、付钱、点上传」之外的全部东西**：能自动化的都写好了，
剩下的是必须你本人操作的步骤（Steamworks 账号、$100 费用、税务、点击 Set Live）。

```
steam/
├─ README.md              ← 本文件：全流程与分工
├─ achievements.md        ← 成就表 + 已落地的桥接层说明（只差 DLL 与后台建项）
├─ redist/                ← steam_api64.dll 放这里（可选，见 redist/README.md）
├─ build/
│  ├─ app_build.vdf       ← SteamPipe 应用构建配置（填 AppID）
│  └─ depot_build.vdf     ← Depot 文件映射（填 DepotID）
├─ store/
│  ├─ description.zh.md   ← 商店页文案（中文）
│  ├─ description.en.md   ← 商店页文案（英文）
│  ├─ metadata.md         ← 系统需求 / 标签 / 定价 / 语言 / 内容声明
│  ├─ screenshots.md      ← 截图清单与每张的解说词
│  └─ capsules/           ← 已生成好的 7 张商店图
└─ scripts/
   ├─ make_capsules.py    ← 重新生成商店图
   ├─ make_screenshots.py ← 截图统一成 1920x1080
   ├─ make_achievement_icons.py ← 成就图标
   ├─ check_assets.py     ← 上架前自检（尺寸/数量/占位符）
   ├─ prepare_content.ps1 ← 把 dist 组装成待上传内容
   └─ upload.ps1          ← 用 steamcmd 上传构建
```

---

## 一、必须你本人做的（我做不了）

| 步骤 | 说明 | 费用 |
| --- | --- | --- |
| 1. 注册 Steamworks 合作伙伴 | <https://partner.steamgames.com/> → 用 Steam 账号登录，填公司/个人信息 | 免费 |
| 2. 支付 Steam Direct 费用 | 每个 App **100 美元**，卖到 1000 美元后返还 | $100 |
| 3. 税务与收款 | 美国预扣税表（非美国个人填 **W-8BEN**）、银行账户、地址验证 | 免费 |
| 4. 创建 App | 后台「Create New App」→ 拿到 **AppID**，同时会自动生成一个 DepotID | 免费 |
| 5. 商店页审核 | 填完商店页 → 提交审核（通常 1–5 个工作日） | 免费 |
| 6. 上传构建 + 设为 Live | 跑本目录脚本上传，然后在后台点「Set Build Live」 | 免费 |
| 7. 商店页开「即将推出」 | 建议提前 2–4 周开，攒愿望单 | 免费 |

> 中国区收款需要能收美元/人民币的账户；Steam 支持国内银行电汇（走 SWIFT）。
> 个人开发者身份即可上架，不必注册公司。

---

## 二、我这边能做、并且已经做好的

### 1. 可上传的构建

```powershell
# 从源码重新打包（需要 py -3.10 + pygame + pyinstaller）
powershell -ExecutionPolicy Bypass -File .\build_exe.ps1

# 组装 Steam 内容目录（steam\content\）
powershell -ExecutionPolicy Bypass -File steam\scripts\prepare_content.ps1
```

`prepare_content.ps1` 会：清空重建 `steam/content`、放进 `零日值班.exe`、`使用说明.txt`、
`saves/` 占位目录，并打印大小与 SHA256（写进商店页或发布公告都方便）。

### 2. SteamPipe 上传

```powershell
# 一次性：填 AppID / DepotID
#   steam\build\app_build.vdf    → "AppID" "APPID_PLACEHOLDER"
#   steam\build\depot_build.vdf  → "DepotID" "DEPOTID_PLACEHOLDER"

$env:STEAM_USER = "你的Steamworks登录名"
powershell -ExecutionPolicy Bypass -File steam\scripts\upload.ps1 -Desc "v1.6.0 首发"
```

脚本会找 `C:\steamcmd\steamcmd.exe`（没有就提示下载地址），带构建描述调
`steamcmd +login <user> +run_app_build app_build.vdf +quit`，失败时打印日志路径。
上传成功后，**必须回后台 SteamPipe → Builds 点「Set Build Live」**，否则玩家装不到。

### 3. 商店素材

`steam/store/capsules/` 里已经按 Steamworks 要求生成 7 张：

| 用途 | 尺寸 | 文件 |
| --- | --- | --- |
| 主胶囊（商店首页） | 1232×706 | `main_capsule_1232x706.png` |
| 小型胶囊（列表/库） | 231×87 | `small_capsule_231x87.png` |
| 头图 | 460×215 | `header_capsule_460x215.png` |
| 竖版胶囊（新版商店） | 748×896 | `vertical_capsule_748x896.png` |
| 库胶囊 | 600×900 | `library_capsule_600x900.png` |
| 库英雄图 | 3840×1240 | `library_hero_3840x1240.png` |
| Logo（透明） | 1280×720 | `logo_1280x720.png` |

重生成：`python steam\scripts\make_capsules.py`（换底图用 `--source`）。
字体用的是系统 `msyhbd.ttc`；换机器跑要注意字体存在。

### 4. 商店页文案与配置

- `store/description.zh.md` / `description.en.md`：短描述（≤300 字）、长描述、要点、虚构声明
- `store/metadata.md`：类型、标签、系统需求、语言、定价建议、内容调查答案
- `store/screenshots.md`：5 张截图的顺序、解说词、重拍要求

---

## 三、建议的上架时间线

| 时间 | 做什么 |
| --- | --- |
| D-21 | 注册 + 付 $100 + 建 App；把 `description.zh.md` 贴进商店页；上传胶囊图 |
| D-14 | 商店页提交审核；开「即将推出」；发 GitHub / Gitee / B 站 引愿望单 |
| D-7 | 构建上传到 **beta 分支**，自己用 Steam 客户端装一遍跑冒烟测试 |
| D-3 | 商店页过审后补截图/预告片；确认定价与首周折扣 |
| D0 | 构建 Set Live 到 default；点「Release」；发公告 |
| D+7 | 看评论与崩溃日志，出补丁（复用同一套 SteamPipe 流程，Desc 写版本号） |

---

## 四、上架前自查（照这个顺序点）

- [ ] `build_exe.ps1` 从干净环境跑通，`dist\零日值班\零日值班.exe --selftest` 退出码 0
- [ ] 在**没有装 Python** 的机器上双击 exe 能进主菜单
- [ ] 全屏/窗口切换、Alt+Tab、输入法中文输入都不崩
- [ ] 存档写在 `saves\`，删掉 `saves\` 能正常开局（Steam 云要用这个路径）
- [ ] 退出游戏不弹控制台窗口（PyInstaller 已 `--windowed`）
- [ ] 游戏目录里**没有** `steam_appid.txt`（`prepare_content.ps1` 默认不带）
- [ ] 商店页没有真实公司名、真实 IP、真实域名（全部虚构）
- [ ] 隐私：不联网、不上传任何数据 → 商店页「隐私政策」可写"本作不收集任何数据"

---

## 五、二期可选（不影响首发）

- **成就**：桥接层已内置（`steam_bridge.py`，10 个单测），只差放 `steam/redist/steam_api64.dll` 与后台建成就；见 `achievements.md`
- **Steam 云存档**：后台 Auto-Cloud 填 `saves` + `*.json`，**不用改代码**
- **预告片**：Steam 首页曝光权重最高的素材，建议 30–60 秒，录屏 + 字幕
- **英文版**：目前界面只有简体中文；要做英文需要抽 i18n，工作量大，建议首发后再评估
- **Steam Deck 兼容**：Pygame 键盘操作，Deck 上需映射手柄，暂标「未验证」
