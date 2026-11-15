# 商店页与后台配置（照抄即可）

## 1. 基本信息

| 字段 | 值 |
| --- | --- |
| 名称 | 零日值班 |
| 类型（Genres） | Strategy、Simulation、Indie |
| 开发者 | telling890 |
| 发行商 | telling890 |
| 发行日期 | 与「Set Live」同一天；提前开「即将推出」时选「Coming soon」 |
| 支持平台 | Windows（仅 x64） |
| 售价 | 见第 5 节 |

> 开发者/发行商名字要和 Steamworks 账户里登记的一致，否则审核会被打回。

## 2. 标签（Tags，最多 20 个，建议留 8–10）

按优先级：

```
Turn-Based Strategy
Strategy
Simulation
Indie
Singleplayer
Hacking
Turn-Based Tactics
Difficult
Time Management
Pixel Graphics
```

备注：`Hacking` 与 `Turn-Based Strategy` 是这款游戏最容易被找到的两个标签；
不要选 Multiplayer / Co-op / Early Access 这类会误导的标签。
标签在后台是联想输入，如果某个词不在列表里就换近义词。

## 3. 语言支持

| 语言 | 界面 | 字幕 | 音频 |
| --- | --- | --- | --- |
| 简体中文 | ✔ | ✔ | — |

**只有简体中文**（界面里的按钮、教程、日志都是中文）。英文文案在
`description.en.md`，但**在做出英文界面之前，不要**在语言里勾 English，
否则会被玩家投诉。英文版属于二期工作。

## 4. 系统需求（Windows）

最低配置：

```
操作系统：Windows 10 64 位
处理器：双核 2.0 GHz
内存：4 GB
显卡：支持 DirectX 9 / OpenGL 2.1
存储空间：300 MB 可用空间
附注：1280×720 以上分辨率，键盘 + 鼠标
```

推荐配置：

```
操作系统：Windows 10 / 11 64 位
处理器：四核 2.5 GHz
内存：8 GB
显卡：集成显卡即可
存储空间：300 MB 可用空间
附注：1920×1080 显示更清晰
```

> 实测：PyInstaller 单文件 exe 约 25 MB，解包后占用不到 100 MB；
> 首次启动会比后续慢 1–3 秒（单文件解包），这是正常现象，无需在商店页解释。

## 5. 定价建议

| 项目 | 建议值 |
| --- | --- |
| 基准价（USD） | **9.99** |
| 中国区（CNY） | **32**（可在 Steam 建议价基础上手动改） |
| 首发折扣 | 首周 −10%（Steamworks → 促销 → 发行折扣） |
| 折扣节奏 | 首发 10%，之后参加夏季/冬季特卖 20–30% |

理由：单机、10 回合、2–4 小时通关的独立小体量，$9.99 是这类作品的心理价位；
高于 $12.99 需要更多内容或预告片支撑。低价 + 高完成度更容易换到好评。

## 6. 内容调查（成人内容问卷）答案

| 问题 | 回答 |
| --- | --- |
| 是否含成人内容（裸露/性） | 否 |
| 是否含频繁暴力或血腥 | 否（攻击是数值推演，无画面表现） |
| 是否含赌博 | 否 |
| 是否含毒品/酒精 | 否 |
| 是否含脏话 | 否 |
| 是否收集用户数据 | 不收集（完全离线） |

题材属于「虚构网络安全事件模拟」，问卷里若问主题，可选「Simulation / Strategy」，
不要选「Hacking simulator」以外的敏感项。

## 7. Steam 云存档（Auto-Cloud，不需要改代码）

后台：**Steamworks → 你的 App → Steam Cloud → 启用 Steam Cloud → 添加 Auto-Cloud 路径**

| 字段 | 值 |
| --- | --- |
| 根目录（Root） | Game Install Directory |
| 子目录（Subdirectory） | `saves` |
| 文件名通配（Pattern） | `*.json` |
| 操作系统 | Windows |

游戏把 `savegame.json` 和 `history.json` 写在 exe 同级的 `saves/` 里
（见 `settings.py` 的 `SAVE_FILE` / `HISTORY_FILE`），正好落在上面这条规则内。
所以云存档是纯配置，不需要动一行代码。

> 已知取舍：存档放在安装目录，同一台机器上的多个 Windows 用户会共用存档。
> 如果要彻底隔离，需要把路径改到 `%APPDATA%`，再同步调整云存档规则（二期可做）。

## 8. 商店页其它勾选项

| 选项 | 值 | 说明 |
| --- | --- | --- |
| 单人 | ✔ | 无多人、无联机 |
| Steam 成就 | 二期 | 见 `../achievements.md` |
| Steam 排行榜 | ✘ | 游戏内自带本地排行榜 |
| Steam 创意工坊 | ✘ | 无 Mod 计划 |
| 远程同乐 / 远程一起玩 | ✘ | — |
| 手柄支持 | ✘ | 键鼠操作；Steam Deck 暂标未验证 |
| HDR / 光线追踪等 | ✘ | 2D 像素风 |

## 9. 需要上传到后台的文件清单

| 后台位置 | 用哪个文件 |
| --- | --- |
| 商店页 → 胶囊图（各尺寸） | `capsules/` 下 6 张（除 logo） |
| 商店页 → Logo | `capsules/logo_1280x720.png` |
| 商店页 → 截图（≥5 张） | `assets/screenshots/*.png`，顺序见 `screenshots.md` |
| 商店页 → 预告片 | 暂无（建议 D-7 前补一个 30–60 秒的） |
| SteamPipe → 构建 | `steam/content/`（由 `scripts/prepare_content.ps1` 生成） |
