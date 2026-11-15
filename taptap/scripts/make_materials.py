#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 TapTap 商店物料（要求和 Steam 不同，不能直接复用）。

依据 TapTap 官方《游戏物料要求》：
  https://developer.taptap.cn/docs/store/release/publish/material/

关键差异：
- 图标 512x512 直角方图，不能用白底 / 黑底 / 透明底
- 横版封面 460x215、竖版封面 600x900：只能有游戏名，不能有其它宣传文字
- 游戏库壁纸 3840x1240：不得出现任何文字 / LOGO
- 宣传图 16:9 ≥1920x1080：必须有清晰游戏名，且除游戏名外不得有其它文字，
  不得直接用游戏截图或简单拼贴 → 这里画程序化拓扑图当主视觉
- 无 Logo 宣传图：横 ≥1920x1080、竖 ≥720x1080，完全不能有文字

输出：taptap/materials/
"""

import argparse
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "taptap", "materials")

TITLE = "零日值班"
SUBTITLE = "ZERO-DAY DUTY"

BG = (10, 15, 26)
ACCENT = (0, 224, 255)
PURPLE = (174, 142, 255)
GOLD = (240, 196, 60)
SOFT = (196, 214, 232)
NODE = (18, 26, 40)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
]

_MEASURE = ImageDraw.Draw(Image.new("L", (4, 4)))


def font(size):
    size = max(8, int(size))
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    raise SystemExit("找不到中文字体，请安装 msyhbd.ttc")


def fit_font(text, max_width, start, minimum=10):
    size = int(start)
    while size > minimum:
        f = font(size)
        if _MEASURE.textlength(text, f) <= max_width:
            return f, size
        size -= max(1, size // 22)
    return font(minimum), minimum


def text_height(f):
    box = f.getbbox("零日Ag")
    return box[3] - box[1]


def grid(size, step, alpha=16, color=ACCENT):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x in range(0, size[0], step):
        d.line([(x, 0), (x, size[1])], fill=color + (alpha,), width=1)
    for y in range(0, size[1], step):
        d.line([(0, y), (size[0], y)], fill=color + (alpha,), width=1)
    return layer


def radial_dark(size, cx=0.5, cy=0.5, strength=200):
    """中心亮、四周暗的底，避免纯色被审核说"白底/黑底"感。"""
    w, h = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    maxd = math.hypot(w / 2, h / 2)
    for y in range(h):
        for x in range(0, w, max(1, w // 160)):
            ratio = min(1.0, math.hypot(x - w * cx, y - h * cy) / maxd)
            d.line([(x, y), (min(w, x + max(1, w // 160)), y)],
                   fill=BG + (int(strength * ratio ** 1.6),))
    return layer


def topology_art(size, seed=7, nodes=14, with_title=False, title_alpha=235):
    """程序化画一张“网络拓扑”主视觉，避免直接搬游戏截图。"""
    w, h = size
    rng = random.Random(seed)

    base = Image.new("RGBA", size, BG + (255,))
    # 背景：深蓝渐变 + 网格 + 四周压暗
    glow = Image.new("RGBA", size, (14, 32, 52, 255))
    mask = Image.new("L", size, 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([w * 0.05, h * 0.0, w * 0.85, h * 1.0], fill=190)
    base = Image.composite(glow, base, mask.filter(ImageFilter.GaussianBlur(w // 24)))
    base = Image.alpha_composite(base, grid(size, max(18, w // 90), 20))
    base = Image.alpha_composite(base, radial_dark(size, 0.45, 0.5, 190))

    draw = ImageDraw.Draw(base)

    # 节点：随机分布但避开标题区（左侧 45%）
    pts = []
    tries = 0
    while len(pts) < nodes and tries < nodes * 40:
        tries += 1
        x = rng.uniform(0.42 if with_title else 0.06, 0.94) * w
        y = rng.uniform(0.10, 0.90) * h
        if all(math.hypot(x - px, y - py) > min(w, h) * 0.13 for px, py in pts):
            pts.append((x, y))

    # 连线
    for i, (x1, y1) in enumerate(pts):
        links = rng.sample(pts, k=min(2, len(pts) - 1))
        for (x2, y2) in links:
            if (x2, y2) == (x1, y1):
                continue
            draw.line([(x1, y1), (x2, y2)], fill=ACCENT + (34,), width=max(1, w // 900))

    # 节点方块 + 状态点
    box = max(10, w // 70)
    for i, (x, y) in enumerate(pts):
        color = ACCENT if i % 4 else PURPLE
        draw.rectangle([x - box, y - box * 0.62, x + box, y + box * 0.62],
                       fill=NODE + (255,), outline=color + (120,), width=max(1, w // 1200))
        draw.ellipse([x - box * 0.18, y - box * 0.62 - box * 0.3,
                      x + box * 0.18, y - box * 0.62 + box * 0.06], fill=color + (220,))

    # 一条“攻击链”高亮：用细折线穿过几个节点
    if len(pts) >= 4:
        chain = rng.sample(pts, k=min(4, len(pts)))
        for a, b in zip(chain, chain[1:]):
            draw.line([a, b], fill=(236, 88, 84, 150), width=max(2, w // 700))

    if with_title:
        pad = int(w * 0.055)
        # TapTap 规定：封面/宣传图「除游戏名外不得出现其它文字」，
        # 所以这里只画中文名，英文名留给 LOGO 素材。
        f_title, size = fit_font(TITLE, int(w * 0.46), int(h * 0.20))
        y = (h - text_height(f_title)) // 2
        draw.text((pad, y), TITLE, font=f_title, fill=(255, 255, 255, title_alpha))

    return base.convert("RGB")


def make_icon(size=512):
    """直角方图，深蓝底 + 零 字 + 状态点，不用白/黑/透明底。"""
    img = Image.new("RGBA", (size, size), BG + (255,))
    img = Image.alpha_composite(img, grid((size, size), max(16, size // 12), 22))
    img = Image.alpha_composite(img, radial_dark((size, size), 0.5, 0.45, 150))
    d = ImageDraw.Draw(img)

    inset = max(4, size // 26)
    d.rectangle([inset, inset, size - inset - 1, size - inset - 1],
                outline=ACCENT + (90,), width=max(2, size // 90))

    f, fs = fit_font("零", int(size * 0.62), int(size * 0.62))
    box = d.textbbox((0, 0), "零", font=f)
    tw, th = box[2] - box[0], box[3] - box[1]
    d.text(((size - tw) / 2 - box[0], (size - th) / 2 - box[1] - size * 0.03),
           "零", font=f, fill=(255, 255, 255))

    # 右下角状态灯 + 一条红色攻击链示意
    dot = max(3, size // 34)
    d.ellipse([size * 0.70, size * 0.70, size * 0.70 + dot, size * 0.70 + dot], fill=(64, 208, 130))
    d.line([(size * 0.22, size * 0.80), (size * 0.44, size * 0.74), (size * 0.62, size * 0.82)],
           fill=(236, 88, 84, 180), width=max(2, size // 140))
    return img.convert("RGB")


def save(image, name):
    path = os.path.join(OUT_DIR, name)
    image.save(path, "PNG", optimize=True)
    print("%-34s %7.1f KB" % (name, os.path.getsize(path) / 1024))


def cover(size, seed):
    """封面：只放游戏名（TapTap 要求不得有其它宣传文字）。"""
    img = topology_art(size, seed=seed, nodes=10, with_title=True)
    return img


def make_logo(size, with_subtitle=False):
    """透明底 LOGO：只放游戏名（+ 可选英文副标题），带深色描边。"""
    w, h = size
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = int(w * 0.05)
    f_title, title_size = fit_font(TITLE, w - pad * 2, int(h * 0.62))
    stroke = max(2, int(title_size * 0.022))

    if not with_subtitle:
        # 单行居中
        inner = text_height(f_title)
        y = (h - inner) // 2
        d.text((pad, y), TITLE, font=f_title, fill=(255, 255, 255),
               stroke_width=stroke, stroke_fill=(8, 12, 22, 200))
        return img

    f_sub, sub_size = fit_font(" ".join(SUBTITLE), w - pad * 2, int(title_size * 0.22), 10)
    gap = max(8, int(title_size * 0.20))
    total = text_height(f_title) + gap + int(sub_size * 1.35)
    y = (h - total) // 2
    d.text((pad, y), TITLE, font=f_title, fill=(255, 255, 255),
           stroke_width=stroke, stroke_fill=(8, 12, 22, 200))
    y += text_height(f_title) + gap

    x = pad + 1
    step = max(1, int(sub_size * 0.26))
    for ch in SUBTITLE:
        d.text((x, y), ch, font=f_sub, fill=ACCENT,
               stroke_width=max(1, stroke // 2), stroke_fill=(8, 12, 22, 170))
        x += d.textlength(ch, f_sub) + step
    return img


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)

    # 1. 图标（必填）
    save(make_icon(512), "icon_512x512.png")

    # 2. 游戏 LOGO（必填，透明，1280 宽）
    #    TapTap 规则：LOGO「只能包含游戏名」→ 默认出纯中文名版本；
    #    带英文副标题的版本也留一份，审核宽松时可以用。
    logo_src = os.path.join(ROOT, "steam", "store", "capsules", "logo_1280x720.png")
    save(make_logo((1280, 720), with_subtitle=False), "logo_1280x720.png")
    if os.path.exists(logo_src):
        save(Image.open(logo_src).convert("RGBA"), "logo_1280x720_with_en.png")

    # 3. 横版封面 460x215（必填）
    save(cover((460, 215), args.seed + 1), "cover_460x215.png")

    # 4. 竖版封面 600x900（必填）
    save(cover((600, 900), args.seed + 2), "cover_600x900.png")

    # 5. 游戏库壁纸 3840x1240（不得有任何文字）
    save(topology_art((3840, 1240), seed=args.seed + 3, nodes=22), "wallpaper_3840x1240.png")

    # 6. 宣传图 16:9（必须清晰展示游戏名，除游戏名外不得有其它文字）
    save(cover((1920, 1080), args.seed + 4), "promo_16x9_1920x1080.png")

    # 7. 宣传图 1:1（竖版录屏封面用，可选）
    save(cover((1440, 1440), args.seed + 5), "promo_1x1_1440x1440.png")

    # 8. 无 Logo 宣传图（Windows 首页推荐位，完全无文字）
    save(topology_art((1920, 1080), seed=args.seed + 6, nodes=16), "promo_nologo_1920x1080.png")
    save(topology_art((720, 1080), seed=args.seed + 6, nodes=12), "promo_nologo_720x1080.png")

    print("\n输出目录：%s" % OUT_DIR)
    print("截图可直接复用 steam/store/screenshots/（1920x1080，比例 16:9 在 8:3~8:5 之间，符合要求）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
