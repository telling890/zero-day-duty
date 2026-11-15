#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TapTap 物料自检：尺寸、比例、大小上限、是否带文字（靠文件名约定）。

用法：python taptap/scripts/check_materials.py
退出码 0 = 素材齐了；1 = 有阻塞项。
"""

import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MAT = os.path.join(ROOT, "taptap", "materials")
SHOTS = os.path.join(ROOT, "steam", "store", "screenshots")

# name: (宽, 高, 是否要求精确尺寸, 大小上限 MB)
RULES = [
    ("icon_512x512.png", 512, 512, True, 4),
    ("logo_1280x720.png", 1280, 720, False, 4),
    ("cover_460x215.png", 460, 215, True, 3),
    ("cover_600x900.png", 600, 900, True, 3),
    ("wallpaper_3840x1240.png", 3840, 1240, True, 10),
    ("promo_16x9_1920x1080.png", 1920, 1080, False, 4),
    ("promo_1x1_1440x1440.png", 1440, 1440, False, 4),
    ("promo_nologo_1920x1080.png", 1920, 1080, False, 6),
    ("promo_nologo_720x1080.png", 720, 1080, False, 6),
]

OK = "  OK  "
BAD = " FAIL "


def main():
    problems = []
    print()
    for name, w, h, exact, cap in RULES:
        path = os.path.join(MAT, name)
        if not os.path.exists(path):
            print("%s %-30s 缺失" % (BAD, name))
            problems.append(name)
            continue
        with Image.open(path) as im:
            iw, ih = im.size
        mb = os.path.getsize(path) / 1024 / 1024
        size_ok = (iw == w and ih == h) if exact else (iw >= w and ih >= h)
        cap_ok = mb <= cap
        ok = size_ok and cap_ok
        note = "%dx%d (要求 %s%d×%d)" % (iw, ih, "=" if exact else "≥", w, h)
        print("%s %-30s %-34s %.2f MB%s" % (OK if ok else BAD, name, note, mb,
                                            "" if cap_ok else " 超 %.0fMB" % cap))
        if not ok:
            problems.append(name)

    # 截图：≥3 张、横图比例 8:3~8:5、单张 <4MB
    shots = sorted(f for f in os.listdir(SHOTS) if f.endswith(".png")) if os.path.isdir(SHOTS) else []
    good = 0
    for name in shots:
        path = os.path.join(SHOTS, name)
        with Image.open(path) as im:
            iw, ih = im.size
        ratio = iw / ih
        mb = os.path.getsize(path) / 1024 / 1024
        if 8 / 5 <= ratio <= 8 / 3 and iw >= 1280 and ih >= 720 and mb <= 4:
            good += 1
    if good >= 3:
        print("%s %-30s 可用 %d 张（要求 ≥3，比例 8:3~8:5，<4MB）" % (OK, "游戏截图", good))
    else:
        print("%s %-30s 只有 %d 张合规（要求 ≥3）" % (BAD, "游戏截图", good))
        problems.append("screenshots")

    # 录屏：必填但需要人工录
    videos = []
    for folder in (MAT, os.path.join(ROOT, "taptap")):
        if os.path.isdir(folder):
            videos += [f for f in os.listdir(folder) if f.lower().endswith((".mp4", ".mov"))]
    if videos:
        print("%s %-30s %s" % (OK, "实机录屏", ", ".join(videos)))
    else:
        print("%s %-30s 还没有实机录屏（下载/试玩必填，>15 秒，前 5 秒要有核心玩法）" % (BAD, "实机录屏"))

    print()
    if problems:
        print("阻塞项 %d 个：%s" % (len(problems), ", ".join(problems)))
        return 1
    if not videos:
        print("素材齐了；录屏仍需人工录（唯一缺口）。")
        return 1
    print("物料全部就绪。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
