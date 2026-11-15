#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 Steam 成就图标（解锁 / 未解锁两版）。

Steamworks 要求每个成就一张 64x64（列表）和一张 184x184（库内大图），
这里用深底 + 青色描边 + 简单几何符号来画，不依赖额外字体。

用法：
    python steam/scripts/make_achievement_icons.py
    python steam/scripts/make_achievement_icons.py --size 184

输出：steam/store/achievements/ach_<api>_<size>.png 与 *_locked.png
"""

import argparse
import math
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "steam", "store", "achievements")

BG = (10, 14, 24)
ACCENT = (0, 224, 255)
GOLD = (240, 196, 60)
LOCKED = (96, 108, 126)
DIM_BG = (14, 17, 24)

# api_name -> 符号
ICONS = {
    "ACH_PERFECT": "shield",
    "ACH_ZERO_FALSE": "crosshair",
    "ACH_INTEL_LOOP": "ring",
    "ACH_COMBO": "chevrons",
    "ACH_FAST_RESPONSE": "bolt",
    "ACH_BUDGET": "coin",
    "ACH_FIRST_SHIFT": "moon",
    "ACH_ALL_CHAINS": "chain",
    "ACH_TERMINAL": "prompt",
    "ACH_SCRIPT": "braces",
    "ACH_SURVIVE_OVERDEFENSE": "warning",
    "ACH_HISTORY": "clock",
}


def draw_symbol(draw, kind, size, color, width):
    s = size
    c = s / 2
    r = s * 0.26

    if kind == "shield":
        pts = [(c, c - r), (c + r * 0.85, c - r * 0.55), (c + r * 0.6, c + r * 0.75),
               (c, c + r * 1.05), (c - r * 0.6, c + r * 0.75), (c - r * 0.85, c - r * 0.55)]
        draw.polygon(pts, outline=color, width=width)
        draw.line([(c - r * 0.45, c + r * 0.05), (c - r * 0.05, c + r * 0.45),
                   (c + r * 0.5, c - r * 0.35)], fill=color, width=width, joint="curve")

    elif kind == "crosshair":
        draw.ellipse([c - r, c - r, c + r, c + r], outline=color, width=width)
        draw.line([(c - r * 1.3, c), (c - r * 0.55, c)], fill=color, width=width)
        draw.line([(c + r * 0.55, c), (c + r * 1.3, c)], fill=color, width=width)
        draw.line([(c, c - r * 1.3), (c, c - r * 0.55)], fill=color, width=width)
        draw.line([(c, c + r * 0.55), (c, c + r * 1.3)], fill=color, width=width)
        draw.ellipse([c - width, c - width, c + width, c + width], fill=color)

    elif kind == "ring":
        draw.ellipse([c - r, c - r, c + r, c + r], outline=color, width=width)
        draw.ellipse([c - r * 0.5, c - r * 0.5, c + r * 0.5, c + r * 0.5], outline=color, width=width)
        draw.line([(c + r * 0.35, c - r * 0.35), (c + r * 1.15, c - r * 1.15)], fill=color, width=width)

    elif kind == "chevrons":
        for i, dy in enumerate((-r * 0.5, r * 0.15, r * 0.8)):
            draw.line([(c - r * 0.7, c + dy - r * 0.35), (c, c + dy), (c + r * 0.7, c + dy - r * 0.35)],
                      fill=color, width=width, joint="curve")

    elif kind == "bolt":
        pts = [(c + r * 0.25, c - r * 1.1), (c - r * 0.62, c + r * 0.08),
               (c - r * 0.02, c + r * 0.08), (c - r * 0.25, c + r * 1.1),
               (c + r * 0.62, c - r * 0.12), (c + r * 0.02, c - r * 0.12)]
        draw.polygon(pts, fill=color)

    elif kind == "coin":
        draw.ellipse([c - r, c - r, c + r, c + r], outline=color, width=width)
        draw.line([(c - r * 0.32, c - r * 0.45), (c - r * 0.32, c + r * 0.45)], fill=color, width=width)
        draw.line([(c - r * 0.55, c - r * 0.45), (c + r * 0.15, c - r * 0.45)], fill=color, width=width)
        draw.line([(c - r * 0.55, c + r * 0.05), (c + r * 0.2, c + r * 0.05)], fill=color, width=width)
        draw.line([(c - r * 0.55, c + r * 0.45), (c + r * 0.25, c + r * 0.45)], fill=color, width=width)

    elif kind == "moon":
        draw.ellipse([c - r, c - r, c + r, c + r], outline=color, width=width)
        draw.ellipse([c - r * 0.35, c - r * 1.15, c + r * 1.35, c + r * 0.55], fill=BG)

    elif kind == "chain":
        draw.ellipse([c - r * 1.25, c - r * 0.55, c - r * 0.05, c + r * 0.55], outline=color, width=width)
        draw.ellipse([c + r * 0.05, c - r * 0.55, c + r * 1.25, c + r * 0.55], outline=color, width=width)

    elif kind == "prompt":
        draw.line([(c - r * 0.9, c - r * 0.5), (c - r * 0.2, c), (c - r * 0.9, c + r * 0.5)],
                  fill=color, width=width, joint="curve")
        draw.line([(c + r * 0.05, c + r * 0.6), (c + r * 0.9, c + r * 0.6)], fill=color, width=width)

    elif kind == "braces":
        for sign in (-1, 1):
            x = c + sign * r * 0.75
            draw.arc([x - r * 0.55, c - r, x + r * 0.55, c + r], 90 if sign > 0 else -90,
                     270 if sign > 0 else 90, fill=color, width=width)
        draw.line([(c - r * 0.25, c + r * 0.35), (c + r * 0.05, c - r * 0.35)],
                  fill=color, width=width, joint="curve")

    elif kind == "warning":
        pts = [(c, c - r * 1.05), (c + r * 1.05, c + r * 0.85), (c - r * 1.05, c + r * 0.85)]
        draw.polygon(pts, outline=color, width=width)
        draw.line([(c, c - r * 0.35), (c, c + r * 0.25)], fill=color, width=width)
        draw.ellipse([c - width, c + r * 0.42 - width, c + width, c + r * 0.42 + width], fill=color)

    elif kind == "clock":
        draw.ellipse([c - r, c - r, c + r, c + r], outline=color, width=width)
        draw.line([(c, c), (c, c - r * 0.6)], fill=color, width=width)
        draw.line([(c, c), (c + r * 0.45, c + r * 0.2)], fill=color, width=width)


def make_icon(api, size, unlocked):
    img = Image.new("RGBA", (size, size), DIM_BG + (255,) if not unlocked else BG + (255,))
    draw = ImageDraw.Draw(img)

    inset = max(2, size // 32)
    color = ACCENT if unlocked else LOCKED
    draw.rectangle([inset, inset, size - inset - 1, size - inset - 1],
                   outline=color + (110 if not unlocked else 70,), width=max(1, size // 64))

    if unlocked:
        # 顶部一道青色细带，表示已解锁
        draw.line([(inset, inset + size // 12), (size - inset, inset + size // 12)],
                  fill=ACCENT + (150,), width=max(1, size // 48))

    kind = ICONS.get(api, "shield")
    symbol_color = GOLD if (unlocked and api in ("ACH_PERFECT", "ACH_COMBO")) else color
    draw_symbol(draw, kind, size, symbol_color + (255,), max(2, size // 26))

    if not unlocked:
        # 灰色斜杠表示未解锁
        draw.line([(size * 0.18, size * 0.82), (size * 0.82, size * 0.18)],
                  fill=LOCKED + (150,), width=max(2, size // 40))
    return img


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=0, help="只生成指定尺寸（默认 64 与 184 都生成）")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    sizes = [args.size] if args.size else [64, 184]

    made = 0
    for api in ICONS:
        for size in sizes:
            for unlocked, suffix in ((True, ""), (False, "_locked")):
                img = make_icon(api, size, unlocked)
                name = "ach_%s_%d%s.png" % (api.lower().replace("ach_", ""), size, suffix)
                img.save(os.path.join(OUT_DIR, name), "PNG", optimize=True)
                made += 1
        print("%-26s ok" % api)

    print("\n共 %d 张 → %s" % (made, OUT_DIR))
    print("注意：Steamworks 后台每个成就需要 64x64（未解锁/已解锁）与 184x184 大图。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
