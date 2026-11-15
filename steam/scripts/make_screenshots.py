#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 games 的 1280x720 截图整理成 Steam 商店页要用的 1920x1080。

Steam 的最低要求是 1280x720，但 1920x1080 在商店页里更清晰；
这里用两遍 LANCZOS 上采样，界面文字边缘不会糊成块。

用法：
    python steam/scripts/make_screenshots.py

输出：steam/store/screenshots/NN_name_1920x1080.png
"""

import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_DIR = os.path.join(ROOT, "assets", "screenshots")
OUT_DIR = os.path.join(ROOT, "steam", "store", "screenshots")

# 顺序就是商店页里展示的顺序：第一张决定点击率
ORDER = [
    ("gameplay", "01_gameplay", "告警、拓扑、操作面板与日志同屏"),
    ("tutorial_guide", "02_tutorial_guide", "聚光灯带练：只圈出这一步要点的位置"),
    ("upgrades", "03_hardening", "三线两层加固树"),
    ("decision", "04_decision", "剧情决策：只写直接成本，后果延后显现"),
    ("result", "05_result", "结算：时间线复盘找出最大失误"),
    ("services", "06_services", "业务可用性与 SLA"),
    ("briefing", "07_briefing", "夜班交接简报"),
    ("tutorial", "08_tutorial", "15 页图文教程"),
    ("feedback", "09_feedback", "处置成功/失败的即时反馈"),
    ("menu", "10_menu", "主菜单与难度选择"),
]

TARGET = (1920, 1080)


def upscale(path, target):
    src = Image.open(path).convert("RGB")
    # 两遍缩放，避免一次性大幅放大的锯齿
    mid = (int(target[0] * 0.75), int(target[1] * 0.75))
    step = src.resize(mid, Image.LANCZOS)
    return step.resize(target, Image.LANCZOS)


def main():
    if not os.path.isdir(SRC_DIR):
        raise SystemExit("找不到截图目录：%s" % SRC_DIR)
    os.makedirs(OUT_DIR, exist_ok=True)

    made = 0
    for key, name, caption in ORDER:
        src = os.path.join(SRC_DIR, "%s.png" % key)
        if not os.path.exists(src):
            print("跳过（缺文件）：%s" % key)
            continue
        image = upscale(src, TARGET)
        out = os.path.join(OUT_DIR, "%s_%dx%d.png" % (name, TARGET[0], TARGET[1]))
        image.save(out, "PNG", optimize=True)
        print("%-34s %6.1f KB  %s" % (os.path.basename(out), os.path.getsize(out) / 1024, caption))
        made += 1

    print("\n共 %d 张 → %s" % (made, OUT_DIR))
    if made < 5:
        print("注意：Steam 要求至少 5 张截图。", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
