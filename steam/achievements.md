# 成就方案

> **现状：代码骨架已经落地**（`steam_bridge.py`，已挂在结算与启动/退出处，10 个单测覆盖）。
> 还差三件外部的事：放 `steam_api64.dll`、在后台建成就、把图标传上去。

游戏里**已经有 6 个内部成就**（`systems/score_system.py` 的 `_achievements`），
结算时会算出来。Steam 成就就是把这个列表接到 Steamworks API 上，条件完全复用。

## 一、成就表

| # | API Name | 显示名 | 描述 | 解锁条件 | 现状 |
| --- | --- | --- | --- | --- | --- |
| 1 | `ACH_PERFECT` | 完美防守 | 08:00 前清除全部攻击链，且业务保持在线 | 结算 `ending_key == "perfect"` | 已有判定 |
| 2 | `ACH_ZERO_FALSE` | 零误封 | 整局没有误封任何设备 | `false_isolations == 0` | 已有判定 |
| 3 | `ACH_INTEL_LOOP` | 情报闭环 | 把全部攻击链的来源都摸清楚 | `identified >= total_events` | 已有判定 |
| 4 | `ACH_COMBO` | 连击大师 | 连续 3 次正确处置 | `best_combo >= 3` | 已有判定 |
| 5 | `ACH_FAST_RESPONSE` | 闪电响应 | 平均响应时间 ≤ 1 回合 | `0 < average_response <= 1` | 已有判定 |
| 6 | `ACH_BUDGET` | 预算管家 | 交班时账上还剩 1000 以上 | `funds >= 1000` | 已有判定 |
| 7 | `ACH_FIRST_SHIFT` | 第一个夜班 | 完成第一局值班 | 首次进结算 | 需新增计数 |
| 8 | `ACH_ALL_CHAINS` | 六条全断 | 单局清除全部 6 条攻击链 | `resolved >= 6` | 需新增判定 |
| 9 | `ACH_TERMINAL` | 命令行派 | 用处置终端完成 20 次操作 | 累计 terminal 操作 ≥ 20 | 需新增计数（与教程的 `terminalActions` 复用） |
| 10 | `ACH_SCRIPT` | 自动化派 | 用剧本完成一条完整的 调查→控制→清除→恢复 | 脚本执行计数 + 该事件 `eradicated` | 需新增判定 |
| 11 | `ACH_SURVIVE_OVERDEFENSE` | 差点把自己关停 | 以「过度防御」结局收场 | `ending_key == "over_defense"` | 已有判定 |
| 12 | `ACH_HISTORY` | 复盘者 | 在历史榜单里查看过 10 局记录 | 历史读取次数 | 需新增计数 |

首发建议先上 **1–7**（都是现成的或在结算处能拿到的），8–12 放后续更新。

## 二、接入步骤

### 0. 已经做好的部分（不用重复写）

| 文件 | 作用 |
| --- | --- |
| `steam_bridge.py` | 成就桥接层：`init / unlock / unlock_from_report / shutdown`，没有 Steam 时全部空操作 |
| `game.py` `finish()` | 结算后调 `_report_steam_achievements(summary)`；教程局不上报 |
| `main.py` | 进游戏前 `steam_bridge.init()`，退出时 `shutdown()`；`--selftest` 不初始化 |
| `tests/test_steam_bridge.py` | 10 个单测：判定逻辑 + 无 Steam 降级 + 去重 |
| `build_exe.ps1` | `--hidden-import steam_bridge`；检测到 `steam/redist/steam_api64.dll` 时自动 `--add-binary` |
| `steam/store/achievements/` | 12 个成就的 64/184 图标（含未解锁版） |

### 1. 放 DLL

从 Steamworks SDK 拿 `steam_api64.dll`（`sdk/redistributable_bin/win64/`），
放到打包入口目录，并在 PyInstaller 里作为 data 带上：

```python
# build 时（build_exe.ps1 里加一行）
--add-binary "steam\redist\steam_api64.dll;."
```

`steam_appid.txt`（内容就是 AppID）只在**本地调试**时放到 exe 同级目录；
正式 depot 不要带（`steam/build/depot_build.vdf` 已经排除了它）。

### 2. 装库

```powershell
py -3.10 -m pip install steamworks
```

`steamworks`（steamworks-py）是 ctypes 封装，不需要编译。

### 3. 已实现的调用约定

`steam_bridge.py` 对外只有 5 个函数，宿主已经接好，不需要你改代码：

```python
import steam_bridge

steam_bridge.init()                                  # 读 STEAM_APP_ID / steam_appid.txt
steam_bridge.is_ready()                              # -> bool
steam_bridge.unlock("ACH_PERFECT")                   # 单个，重复调用不会重复上报
steam_bridge.unlock_from_report(report, summary)     # 结算后批量：推导 + 上报
steam_bridge.shutdown()                              # 退出时调
```

判定逻辑是纯函数 `derive_achievements(report, summary)`，单测在
`tests/test_steam_bridge.py`，跑：

```powershell
py -3.10 -m pytest tests/test_steam_bridge.py -q
```

真正的 SDK 调用集中在 `SteamworksBackend` 里，按候选函数名探测
（`init` / `steamworks_init`、`set_achievement` / `setAchievement`…），
所以你换 `steamworks-py` 版本或自己包一层 ctypes 时，**只需要改这个类**。
探测失败 = 不可用 = 全部空操作，不会影响游戏。

内部成就名 → API Name 的映射：

```python
ACHIEVEMENT_MAP = {
    "完美防守": "ACH_PERFECT",
    "零误封": "ACH_ZERO_FALSE",
    "情报闭环": "ACH_INTEL_LOOP",
    "连击大师": "ACH_COMBO",
    "闪电响应": "ACH_FAST_RESPONSE",
    "预算管家": "ACH_BUDGET",
}
```

### 4. 后台配置

Steamworks → 你的 App → **Stats & Achievements** → 逐个新建成就：

- API Name 必须和代码里完全一致（大写 + 下划线）
- 显示名 / 描述用上表（中文即可，做完英文版再加英文）
- **隐藏成就**（Hidden）：建议 8、10、11、12 设为隐藏
- 图标：已生成好放在 `steam/store/achievements/`
  - `ach_<api>_64.png`：64×64（未解锁）
  - `ach_<api>_64_locked.png`：64×64 灰色版本
  - 后台还要求 184×184 的库内图标，同一个脚本可以再导出（`--size 184`）

## 三、图标

```powershell
python steam\scripts\make_achievement_icons.py
```

生成 12 个成就 × 2 尺寸，风格和胶囊图一致（深底 + 青色描边 + 几何符号）。
图标里的符号用简单图形（盾、锁、闪电、终端提示符等）避免再引入字体文件。

## 四、测试清单

- [ ] 未登录 Steam 启动：不崩、成就静默跳过（`_ready == False`）
- [ ] 登录 Steam 启动：`--selftest` 模式下不触发成就解锁
- [ ] 打一局 perfect：`ACH_PERFECT` 在客户端弹出
- [ ] 断网启动：Steam 会缓存，重新联网后补发
- [ ] 走一遍 Steam 客户端「验证文件完整性」，确认 dll 还在
