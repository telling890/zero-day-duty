#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按 TapTap 隐私政策模板的结构，生成《零日值班》的隐私政策（HTML + DOCX）。

模板假设的是「账号 + 实名 + 内购 + 设备权限 + 第三方 SDK」的移动游戏；
本作是纯离线单机，这十节全部要写「不收集 / 不适用」，但结构必须齐全——
TapTap 的驳回原因就是「内容过于简短无法提供有效信息」。

用法：
    python taptap/scripts/make_privacy_policy.py

产物：
    docs/privacy.html                          ← 给 TapTap 填的隐私政策链接用
    taptap/store/privacy-policy.docx           ← 存档/平台要求文件时用
"""

import html
import os

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HTML_OUT = os.path.join(ROOT, "docs", "privacy.html")
DOCX_OUT = os.path.join(ROOT, "taptap", "store", "privacy-policy.docx")

GAME = "零日值班"
GAME_EN = "Zero-Day Duty"
OPERATOR = "telling工作室（个人开发者）"
UPDATED = "2026年11月15日"

INTRO = [
    f"欢迎您使用【{GAME}】！我们非常重视保护您的个人信息和隐私。您可以通过《{GAME}隐私政策》"
    "了解我们收集、使用、存储用户个人信息的情况，以及您所享有的相关权利。请您仔细阅读并充分理解相关内容：",
    f"为向您提供游戏服务，我们将依据《{GAME}隐私政策》收集、使用、存储必要的信息。本作为纯离线单机游戏，"
    "实际上不收集任何个人信息；下文逐项说明。",
    "基于您的明示授权，我们可能会申请开启您的设备权限，您有权拒绝或取消授权。本作不申请任何设备权限，详见第二节。",
    "您可以访问、更正、删除您的个人信息，还可以撤回授权同意、注销账号、投诉举报以及调整其他隐私设置。"
    "由于本作无账号体系、不收集个人信息，您的相关权利通过删除本机存档文件即可实现。",
    "我们已采取符合业界标准的安全防护措施保护您的个人信息。本作不传输数据，因此不存在传输环节的个人信息风险。",
    "如您是未成年人，请您和您的监护人仔细阅读本隐私政策，并在征得您的监护人授权同意的前提下使用我们的服务。"
    "本作适龄提示为 12 周岁以上，不收集任何个人信息，无内购与广告。",
    "请您阅读完整版《【零日值班隐私政策】》了解详细信息。",
]

SECTIONS = [
    (
        "一、我们如何收集和使用您的个人信息",
        [
            "（一）我们如何收集您的个人信息",
            f"在使用{GAME}的过程中，我们不会收集您的任何个人信息。本作没有账号系统，不需要手机号码、邮箱、密码、"
            "身份证件信息，不进行实名认证，不读取设备标识（设备 ID / IMEI / OAID / IDFA / MAC / 广告 ID）、"
            "设备名称与型号、IP 地址、地理位置、通讯录、短信、相册、已安装应用列表或任何行为数据。",
            "（二）收集场景说明（逐项对照常见游戏场景）",
            "1. 完成注册：不适用。本作无注册流程。",
            "2. 游戏服务：不适用。本作不采集设备信息；游戏所需的回合、指标、设备状态等数据仅存在于运行内存与本机存档。",
            "3. 实名认证：不适用。本作单机离线，不提供联网服务与充值，未接入实名认证系统。平台侧如按法规实施实名与防沉迷，"
            "由平台按其隐私政策处理，本作不接收也不留存任何身份信息。",
            "4. 保障网络和服务的安全：不适用。本作不联网，不采集 IP 地址、访问时间等日志。",
            "5. 充值消费：不适用。本作无内购、无广告、无虚拟货币。",
            "6. 统计分析：不适用。本作不集成任何统计分析或埋点 SDK。",
            "（三）我们如何使用您的个人信息",
            "我们不使用您的个人信息，因为我们不收集个人信息。游戏内的随机种子、指标计算、结算评分全部基于本机运行过程中的数值运算。",
            "（四）其他规则",
            "当我们要将信息用于本政策未载明的其它用途时，会事先征求您的同意；由于本作不收集信息，此情形在本作中不会发生。",
        ],
    ),
    (
        "二、设备权限调用情况",
        [
            "本作不申请任何设备权限。",
            "Windows 版本仅需要读取自身游戏目录、写入 saves 子目录这两项常规文件访问能力，用于加载游戏数据与保存进度；"
            "这属于操作系统对普通桌面程序的基础能力，不构成对个人信息的采集。本作不请求管理员权限，不安装驱动，"
            "不注册开机启动项，不修改系统设置，不访问摄像头、麦克风、定位、剪贴板或通讯录。",
            "网页版仅在您主动游玩时使用浏览器本地存储（localStorage）保存进度与命令历史，不申请任何浏览器权限"
            "（不使用摄像头、麦克风、定位、通知或剪贴板读取接口）。",
        ],
    ),
    (
        "三、我们如何保存您的个人信息",
        [
            "（一）保存地点与期限",
            "我们不保存您的个人信息。游戏进度以明文 JSON 形式保存在您本机的游戏目录：",
            "1. saves/savegame.json：当前这一局的回合数、指标数值、设备状态、已购加固与随机种子；",
            "2. saves/history.json：历史各局的得分、结局与时间线摘要，用于本机排行榜；",
            "3. 网页版：上述数据保存在您浏览器的 localStorage 中。",
            "上述文件不包含可识别个人身份的信息，仅包含游戏状态数值，且不会上传至任何服务器。保存期限由您决定："
            "删除 saves 文件夹（或清除浏览器站点数据）即彻底删除。",
            "（二）保存地域",
            "数据不发生跨境传输，因为它从未离开您的设备。",
            "（三）停止运营时的处理",
            "本作为单机软件，不存在「服务器停止运营」导致用户数据无法处理的情形；卸载游戏或删除存档目录即完成数据清除。",
        ],
    ),
    (
        "四、我们如何使用 Cookies 及同类技术",
        [
            "本作的 Windows 版本不使用 Cookies、Web Beacon、像素标签、SDK 埋点或任何同类跟踪技术。",
            "网页版不使用 Cookies 做跟踪或广告投放；仅使用浏览器 localStorage 保存游戏进度与命令历史，"
            "其用途限定为「继续上次游戏」与「查看命令历史」，不用于身份识别、画像或跨站追踪。您可以通过浏览器设置清除这些数据。",
        ],
    ),
    (
        "五、我们如何共享、转让、公开披露您的个人信息",
        [
            "（一）共享",
            "我们不会与任何第三方共享您的个人信息，因为我们不收集个人信息。",
            "（二）转让",
            "我们不会转让您的个人信息。如发生合并、收购或破产清算等情形，由于本作不持有个人信息，不涉及个人信息转让。",
            "（三）公开披露",
            "我们不会公开披露您的个人信息。",
            "（四）依法豁免",
            "根据法律法规、诉讼争议解决需要，或行政、司法机关依法提出要求时，我们可能依法提供必要信息；"
            "但由于本作不收集个人信息，我们无此类信息可供提供。",
        ],
    ),
    (
        "六、第三方产品或服务如何获得您的个人信息",
        [
            "本作不集成任何第三方 SDK，包括但不限于广告 SDK、统计分析 SDK、推送 SDK、支付 SDK、社交分享 SDK、"
            "崩溃上报 SDK 与热更新 SDK。本作不发起任何网络请求，不向任何第三方服务器传输数据。",
            "通过平台（如 Steam、TapTap）下载、安装、启动本作时，平台自身可能按其隐私政策处理账号信息、下载记录、"
            "运行环境信息。这属于平台的独立处理行为，我们无法控制也不获取这些数据。若平台提供成就、云存档、"
            "防沉迷等能力，本作仅调用平台公开接口写入成就状态与存档，不接收个人信息。",
        ],
    ),
    (
        "七、我们如何保护您的个人信息",
        [
            "（一）安全措施",
            "本作不收集、不传输个人信息，因此不存在网络传输与服务器存储环节的泄露风险。本地存档为明文 JSON，"
            "不含敏感信息；程序不请求管理员权限，不写入系统目录，不修改注册表关键项。",
            "（二）安全提示",
            "如您与他人共用同一台电脑，请注意存档文件可被同机其他系统用户读取。若需保护本机存档，"
            "请使用操作系统的用户账户与磁盘权限功能。",
            "（三）安全事件处置",
            "由于本作不持有个人信息，不存在需要向您告知的个人信息安全事件场景。若未来版本引入联网功能，"
            "我们会同步更新本政策并建立相应的安全事件响应机制。",
        ],
    ),
    (
        "八、您如何管理您的个人信息",
        [
            "（一）访问与更正",
            "本作无账号体系，我们无法也无需向您提供账号内的个人信息访问入口。本地存档为明文 JSON，"
            "您可以用文本编辑器直接查看与修改。",
            "（二）删除",
            "删除游戏目录下的 saves 文件夹即删除全部本地数据；网页版请清除浏览器站点数据。删除后游戏回到初始状态，"
            "不影响后续游玩。",
            "（三）撤回同意",
            "本作不提供需要「同意」才能进行的信息收集项，因此不存在撤回同意的流程。",
            "（四）注销账号",
            "本作无账号，无需注销。",
            "（五）投诉举报",
            "如您认为本作存在与本政策不一致的信息处理行为，可通过第九节的方式联系我们，我们会在 7 个工作日内答复。",
        ],
    ),
    (
        "九、我们如何处理未成年人的个人信息",
        [
            "本作内容为虚构的网络安全事件模拟，不含暴力、血腥、赌博、色情内容，适龄提示为 12 周岁以上。",
            "本作不收集任何个人信息，无账号体系，无内购与广告，因此不存在针对未成年人的信息收集场景，"
            "也不存在诱导消费的情形。",
            "通过平台分发的版本，平台可能按其规则对未成年人账号启用防沉迷限制（例如游玩时长与时段限制）。"
            "该限制由平台实施，本作不采集身份证件信息，也不接收平台回传的身份数据。",
            "若监护人认为本作不适合未成年人游玩，删除游戏目录或卸载即可结束使用。",
        ],
    ),
    (
        "十、本隐私政策如何更新",
        [
            "本政策可能随功能变化而更新。若未来版本新增联网功能、账号系统、内购或统计分析，我们会在功能上线前更新本政策，"
            "并在本页面标注新的更新日期；涉及个人信息处理范围变化的，会在游戏内与商店页同时说明。",
            "对于重大变更，我们会以显著方式（页面公告、游戏内提示）告知您。继续使用新版本即视为接受更新后的政策。",
        ],
    ),
    (
        "十一、如何联系我们",
        [
            f"本作的运营者为 {OPERATOR}。如您对本政策有任何疑问、意见或投诉，可通过以下方式联系我们：",
            "1. TapTap 游戏页「开发者的话」或论坛留言；",
            "2. GitHub 仓库 Issue：https://github.com/telling890/zero-day-duty/issues",
            "我们会在收到反馈后 7 个工作日内答复。",
        ],
    ),
]

TOC = [
    "一、我们如何收集和使用您的个人信息",
    "二、设备权限调用情况",
    "三、我们如何保存您的个人信息",
    "四、我们如何使用 Cookies 及同类技术",
    "五、我们如何共享、转让、公开披露您的个人信息",
    "六、第三方产品或服务如何获得您的个人信息",
    "七、我们如何保护您的个人信息",
    "八、您如何管理您的个人信息",
    "九、我们如何处理未成年人的个人信息",
    "十、本隐私政策如何更新",
    "十一、如何联系我们",
]


def build_docx():
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Microsoft YaHei"
    style.font.size = Pt(10.5)
    style.element.rPr.rFonts.set(
        "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}eastAsia", "Microsoft YaHei"
    )

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run(f"《{GAME}》隐私政策")
    run.bold = True
    run.font.size = Pt(18)

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta.add_run(f"{GAME_EN} Privacy Policy　｜　运营者：{OPERATOR}　｜　更新日期：{UPDATED}")

    doc.add_paragraph("温馨提示")
    for line in INTRO:
        doc.add_paragraph(line, style="List Bullet")

    doc.add_paragraph(f"更新日期：{UPDATED}　　生效日期：{UPDATED}")
    doc.add_paragraph(f"运营者：{OPERATOR}")

    doc.add_paragraph("本政策将帮助您了解以下内容：")
    for item in TOC:
        doc.add_paragraph(item, style="List Number")

    for heading, paragraphs in SECTIONS:
        doc.add_heading(heading, level=1)
        for text in paragraphs:
            doc.add_paragraph(text)

    doc.add_paragraph()
    doc.add_paragraph(f"（本政策适用于 {GAME} {GAME_EN} 全部版本，含 Windows 桌面版与网页版。）")

    doc.save(DOCX_OUT)
    return DOCX_OUT


def build_html():
    def esc(text):
        return html.escape(text)

    parts = []
    for heading, paragraphs in SECTIONS:
        parts.append(f"    <h2>{esc(heading)}</h2>")
        for text in paragraphs:
            if text.startswith("（") or text.startswith("1. ") or text.startswith("2. ") or text.startswith("3. "):
                parts.append(f"    <p><strong>{esc(text[:text.find('：') + 1])}</strong>{esc(text[text.find('：') + 1:])}</p>"
                             if "：" in text[:14] else f"    <p>{esc(text)}</p>")
            else:
                parts.append(f"    <p>{esc(text)}</p>")
    body = "\n".join(parts)
    intro = "\n".join(f"      <li>{esc(line)}</li>" for line in INTRO)
    toc = "\n".join(f"      <li>{esc(item)}</li>" for item in TOC)

    page = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>隐私政策 · {GAME}</title>
  <meta name="description" content="《{GAME}》隐私政策：本作不收集、不上传任何个人信息，完全离线运行，仅在本机写入存档文件。">
  <meta name="theme-color" content="#070b11">
  <link rel="icon" href="assets/icon.png">
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="soc-theme.css">
  <style>
    .policy {{ max-width: 880px; margin: 0 auto; padding: 96px 22px 120px; position: relative; z-index: 2; }}
    .policy h1 {{ font-size: clamp(26px, 4vw, 38px); margin-bottom: 8px; }}
    .policy .meta {{ color: #8aa0b8; font-size: 13px; line-height: 1.9; margin-bottom: 26px; }}
    .policy h2 {{ font-size: 18px; margin: 34px 0 10px; padding-left: 12px; border-left: 3px solid #00e0ff; }}
    .policy p, .policy li {{ font-size: 14.5px; line-height: 1.85; color: #c6d4e2; }}
    .policy ul, .policy ol {{ margin: 10px 0 10px 22px; }}
    .policy li {{ margin: 4px 0; }}
    .policy .box {{ margin: 22px 0; padding: 14px 16px; border-left: 3px solid #00e0ff;
      background: rgba(0,224,255,.06); border-radius: 0 8px 8px 0; }}
    .policy .box strong {{ color: #eaf6ff; }}
    .policy .back {{ display: inline-block; margin-top: 40px; font-size: 13px; }}
    .policy a {{ color: #00e0ff; }}
  </style>
</head>
<body>
  <div class="bg" aria-hidden="true">
    <span class="aurora aurora-cyan"></span>
    <span class="aurora aurora-violet"></span>
    <span class="bg-grid"></span>
    <span class="bg-vignette"></span>
  </div>

  <main class="policy">
    <h1>《{GAME}》隐私政策</h1>
    <p class="meta">{GAME_EN} Privacy Policy<br>
      运营者：{OPERATOR}　·　更新日期：{UPDATED}　·　生效日期：{UPDATED}</p>

    <div class="box">
      <strong>一句话结论：</strong>本作不收集、不存储、不传输任何个人信息；无账号系统、无设备权限申请、
      无第三方 SDK、无广告、无内购；所有游戏数据只写在本机的 saves 目录（网页版为浏览器 localStorage）。
    </div>

    <h2>温馨提示</h2>
    <ul>
{intro}
    </ul>

    <h2>本政策将帮助您了解以下内容</h2>
    <ol>
{toc}
    </ol>

{body}

    <p class="back"><a href="./index.html">← 返回《{GAME}》主页</a></p>
  </main>
</body>
</html>
"""
    with open(HTML_OUT, "w", encoding="utf-8", newline="") as fh:
        fh.write(page)
    return HTML_OUT


def main():
    html_path = build_html()
    docx_path = build_docx()
    html_size = os.path.getsize(html_path) / 1024
    docx_size = os.path.getsize(docx_path) / 1024
    text_len = sum(len(p) for _, ps in SECTIONS for p in ps)
    print("HTML: %s (%.1f KB)" % (html_path, html_size))
    print("DOCX: %s (%.1f KB)" % (docx_path, docx_size))
    print("正文字数：约 %d 字（%d 节）" % (text_len, len(SECTIONS)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
