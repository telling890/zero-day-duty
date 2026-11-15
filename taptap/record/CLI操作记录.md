# TapTap 上传实操记录（已执行）

> 执行人：AI（用你的账号经 `taptap-cli auth login` 设备码授权，凭据存在你本机 `C:\Users\lenovo\.taptap-cli\taptap.json`）
> 执行时间：2026-11-14
> 撤销登录态：`taptap-cli auth logout`

## 一、身份与环境

| 项 | 值 |
| --- | --- |
| CLI | `@taptap/cli 2026.11.13`（pnpm 全局安装到 `C:\Users\lenovo\AppData\Local\pnpm\bin\taptap-cli.CMD`） |
| 厂商 | `telling工作室`，developerId **531375** |
| 应用 | `零日值班`，appId **1064137**（状态：未发布） |
| 服务器 | https://developer.taptap.cn |

## 二、做过的事（按顺序，全部成功）

| # | 操作 | 命令要点 | 结果 |
| --- | --- | --- | --- |
| 1 | 声明 PC 包体类型 | `qualification save-draft` + `{"app_features":{"package_types":["windows"]}}` | `available_package_types: ["windows"]` |
| 2 | 上传 Windows 包 | `upload-pc-package 零日值班_测试版_v1.6.0.zip --launch-exe 零日值班.exe --version v1.6.0` | **packageId 25601**，status ready |
| 3 | 绑定到资料槽位 | `app select-package` + `{"expected":{"kind":"none"},"package":{"id":"25601","type":"windows"},"slot":"windows"}` | 绑定成功，revision 1276668 |
| 4 | 上传 10 张素材 | `upload <file>` ×10（受「每 App 每分钟 10 次 / 每秒 1 次」限流，需 1.6s 间隔） | 全部入库，url+info 记在 `cli-payloads/asset-map.json` |
| 5 | 写资料 11 个字段 | `app save-changes` + `cli-payloads/changes.json` | `updated_fields` 11 项，`stale: []` |
| 6 | 声明 PC 防沉迷状态 | `app save-changes` + `{"field_id":"pc_game_anti_addiction_status","value":1}` | 已保存 |

### 第 5 步写入的字段

```
description                  游戏简介
promotion_material_type      BANNER_4（首页推荐素材用宣传图 16:9）
promotion_text               10 小时掐断六条攻击链（≤25 字）
developer_message            开发者的话
logo / cover / cover_vertical / library_hero / banner_4   五张图
screenshots                  4 张实机截图
icon                         替换掉默认图标
```

### 第 6 步为什么选 1

`PC 防沉迷状态` 只有两个选项：

| 值 | 文案 |
| --- | --- |
| **1** | 未接入防沉迷能力，**审核通过后自动应用 TapTap 平台通用防沉迷系统** |
| 2 | 已接入防沉迷能力 |

我们是 Python + Pygame，接不了官方 Unity/C++ 的 SDK，所以选 **1** 是唯一如实的答案，
而且它意味着**平台会替我们兜防沉迷**——这正好解掉了之前担心「必须接 SDK」的死结。
以后如果真接了自研防沉迷，再改成 2。


## 三之二、补充执行（系统配置 / 资质事实 / 适龄）

| # | 操作 | 结果 |
| --- | --- | --- |
| 7 | 写 Windows 最低配置 8 项 + 推荐配置 8 项（`min_*` / `rec_*`） | 15 个字段写入，`min_os` 原本已正确故跳过；`min_processor` 从「无」改为「双核 2.0 GHz（Intel / AMD）」 |
| 8 | 资质事实（`app_features`）：不联网 / 无内购 / 无 AI 生成 / 无 IP 授权 / 非文字剧情 | 保存成功，`QUALIFICATION_FACTS_UNCONFIRMED` 警告消失 |
| 9 | 适龄分级 = **12 周岁+**（枚举只有 8/12/16） | 保存成功（需先取 `qualification get-status` 的 `snapshot` 作为 `expected_snapshot`） |

### 关键发现：软著和版号都是 optional

`qualification get-status` 返回的资质要求里：

| 资质 | 是否 required |
| --- | --- |
| privacy-compliance（隐私合规） | **required** |
| anti-addiction（防沉迷） | **required** |
| ai-declaration（AI 接入声明） | **required** |
| age_grade（适龄分级） | **required**（已存 12+） |
| game-license（版号） | optional |
| software-copyright（软著） | **optional** |
| icp-filing / authorization-letters / security-assessment | optional |

也就是说：**不做软著、不办版号，也能把这个 PC 单机走完资质**——只剩三项声明类材料要补。

## 三、当前状态

```
blockers : []      ← 0 个必填项缺口（原来 9 个）
warnings :
  - 资质判断事实未确认（is_internet_required / has_in_app_purchase / has_text_story_simulation / has_ai_content / has_ip_authorization）
  - 资质未完成：AI 接入声明、隐私合规、防沉迷合规材料
  - 适龄分级待补齐（age_grade）
```

也就是说：**资料层面已经可以提审了，但提审大概会被资质打回**——需要先把上面三类补齐。

## 四、剩下要你做的（按顺序）

### 1. 资质事实（我可以代填，是客观事实）

```powershell
# 无联网、无内购、无 AI 生成、无 IP 授权、非文字剧情
taptap-cli qualification save-draft --dev-id 531375 --app-id 1064137 --data "@app-features-full.json" --yes
```

`app-features-full.json`：

```json
{"app_features":{"package_types":["windows"],"is_internet_required":false,
 "has_in_app_purchase":false,"has_text_story_simulation":false,
 "has_ai_content":false,"has_ip_authorization":false}}
```

### 2. 适龄分级

```powershell
taptap-cli qualification save-age-grade --dev-id 531375 --app-id 1064137 --data "@age-grade.json" --dry-run
```

建议 **12 周岁+**（无血腥、无赌博、无成人内容，但有网络攻击题材）。

### 3. 资质材料

| 材料 | 你要提供 |
| --- | --- |
| 隐私合规 | TapTap 后台按问卷勾选（本作不收集数据、完全离线） |
| AI 接入声明 | 选「不提供 AI 生成内容」 |
| 防沉迷合规材料 | 选 1 之后，按平台要求提交说明即可 |

### 4. 提审（我不代做，需你确认）

```powershell
taptap-cli app precheck-review --dev-id 531375 --app-id 1064137 --data @review-precheck.json
taptap-cli app submit-review  --dev-id 531375 --app-id 1064137 --data @review-submit.json --idempotency-key submit-1 --yes
```

提审前建议先在后台页面肉眼过一遍资料页（图有没有歪、简介有没有串行）。

## 五、内部测试怎么做（不用等审核）

审核针对的是**商店页**；包体和内部测试是另一套：

1. 后台 → 你的游戏 → **版本发布 → 测试 → 内部测试** → 创建计划（≤100 人，不对外曝光）
2. 添加测试用户 → 平台选 PC → 导入 TapTap ID
3. 测试者装 TapTap PC 版登录 → 游戏页「立即自测」

⚠️ **不要用 CLI 建 CBT/OBT**：策略接口显示 `每 90 天最多开 1 次测试计划，当前剩余配额 1`，
建一个就烧掉本季度唯一一次。内部测试在网页端建，不走这个配额。

## 六、可复现的 payload 目录

`taptap/cli-payloads/`（脚本与关键 payload 入库，图片副本和接口返回不入库）：

```
build_changes.py          根据 asset-map.json 生成 changes.json
app-features.json         只声明 windows 包体类型
changes.json              11 个字段的变更集（第 5 步实际使用的）
anti-addiction.json       防沉迷状态=1
select-windows-slot.json  绑定 windows 槽位
```
