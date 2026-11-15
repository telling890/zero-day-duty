#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 Steam 商店需要的胶囊图 / 主图 / Logo。

用游戏自带截图当底图，叠加暗化渐变与网格，再把标题排版上去；
尺寸取 Steamworks 当前商店素材清单。

用法：
    python steam/scripts/make_capsules.py
    python steam/scripts/make_capsules.py --source assets/screenshots/gameplay.png

输出：steam/store/capsules/*.png
"""

import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "steam", "store", "capsules")

TITLE = "零日值班"
SUBTITLE = "ZERO-DAY DUTY"
TAGLINE = "10 个小时，6 条攻击链，1 个夜班"

SIZES = {
    "header_capsule": (460, 215),
    "small_capsule": (231, 87),
    "main_capsule": (1232, 706),
    "vertical_capsule": (748, 896),
    "library_capsule": (600, 900),
    "library_hero": (3840, 1240),
    "logo": (1280, 720),
}

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
]

BG = (7, 11, 20)
ACCENT = (0, 224, 255)
TEXT_SOFT = (198, 216, 234)

_MEASURE = ImageDraw.Draw(Image.new("L", (4, 4)))


def pick_font(size):
    size = max(8, int(size))
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    raise SystemExit("找不到可用的中文字体，请安装 msyhbd.ttc 或修改 FONT_CANDIDATES")


def fit_font(text, max_width, start_size, min_size=9):
    """按实测宽度收敛字号，保证文字不会出血。"""
    size = int(start_size)
    while size > min_size:
        font = pick_font(size)
        if _MEASURE.textlength(text, font=font) <= max_width:
            return font, size
        size -= max(1, size // 24)
    return pick_font(min_size), min_size


def line_height(font):
    box = font.getbbox("零日Ag")
    return box[3] - box[1]


def draw_spaced(draw, xy, text, font, fill, spacing):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + spacing
    return x


def spaced_width(text, font, spacing):
    return sum(_MEASURE.textlength(ch, font=font) + spacing for ch in text) - spacing


def cover(path, size):
    src = Image.open(path).convert("RGB")
    return ImageOps.fit(src, size, method=Image.LANCZOS, centering=(0.5, 0.45))


def build_background(source, size, mode="wide"):
    base = cover(source, size)
    base = base.filter(ImageFilter.GaussianBlur(radius=max(1, int(min(size) * 0.006))))
    black = Image.new("RGB", size, (0, 0, 0))
    base = Image.blend(base, black, 0.5 if mode == "tall" else 0.66)

    image = base.convert("RGBA")
    w, h = size

    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    if mode == "tall":
        # 竖图：顶部压暗放标题，下半部露出游戏画面
        for y in range(h):
            ratio = 1.0 - min(1.0, y / max(1, h * 0.62))
            ld.line([(0, y), (w, y)], fill=BG + (int(240 * ratio ** 1.05),))
    else:
        # 宽图：左侧渐隐，保证标题区对比度
        for x in range(w):
            ratio = 1.0 - min(1.0, (x / max(1, w * 0.62)))
            ld.line([(x, 0), (x, h)], fill=BG + (int(228 * ratio ** 1.15),))
    image = Image.alpha_composite(image, layer)

    # 底部压暗
    foot = Image.new("RGBA", size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(foot)
    for y in range(h):
        ratio = (y / max(1, h)) ** 2.4
        fd.line([(0, y), (w, y)], fill=BG + (int(140 * ratio),))
    image = Image.alpha_composite(image, foot)

    # 细网格
    grid = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    step = max(16, int(min(size) * 0.06))
    for x in range(0, w, step):
        gd.line([(x, 0), (x, h)], fill=ACCENT + (14,), width=1)
    for y in range(0, h, step):
        gd.line([(0, y), (w, y)], fill=ACCENT + (14,), width=1)
    image = Image.alpha_composite(image, grid)

    # 内描边
    edge = Image.new("RGBA", size, (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    inset = max(2, min(size) // 100)
    ed.rectangle([inset, inset, w - inset - 1, h - inset - 1],
                 outline=ACCENT + (34,), width=max(1, min(size) // 240))
    return Image.alpha_composite(image, edge)


def compose_compact(size, source):
    """小尺寸（231x87）：只留标题与副标题，字要大。"""
    w, h = size
    image = build_background(source, size, "wide")
    draw = ImageDraw.Draw(image)

    pad = int(w * 0.07)
    avail = w - pad * 2

    font_title, title_size = fit_font(TITLE, avail, int(h * 0.58))
    sub_size = max(7, int(title_size * 0.30))
    font_sub, sub_size = fit_font(
        " ".join(SUBTITLE), avail, sub_size, max(7, int(h * 0.11)),
    )

    gap = max(2, int(title_size * 0.16))
    total = line_height(font_title) + gap + int(sub_size * 1.25)
    y = (h - total) // 2
    draw.text((pad, y), TITLE, font=font_title, fill=(255, 255, 255))
    y += line_height(font_title) + gap
    draw_spaced(draw, (pad + 1, y), SUBTITLE, font_sub, ACCENT, max(1, int(sub_size * 0.3)))
    return image


def compose_wide(size, source):
    """宽图：左侧文字块，右侧留游戏画面。"""
    w, h = size
    image = build_background(source, size)
    draw = ImageDraw.Draw(image)

    pad = int(w * 0.055)
    avail = w - pad * 2
    unit = min(w, h)

    font_title, title_size = fit_font(TITLE, avail * 0.86, int(unit * 0.34))
    sub_size = max(8, int(title_size * 0.22))
    font_sub, sub_size = fit_font(
        " ".join(SUBTITLE), avail * 0.95, sub_size, max(8, int(unit * 0.03)),
    )
    tag_size = max(9, int(title_size * 0.175))
    font_tag, tag_size = fit_font(TAGLINE, avail * 0.95, tag_size, max(9, int(unit * 0.028)))

    gap = max(6, int(title_size * 0.26))
    bar_h = max(2, int(title_size * 0.045))
    block = line_height(font_title) + gap + int(sub_size * 1.25) + int(title_size * 0.16) \
        + bar_h + int(title_size * 0.18) + line_height(font_tag)

    y = max(int(h * 0.06), (h - block) // 2)
    draw.text((pad, y), TITLE, font=font_title, fill=(255, 255, 255))
    y += line_height(font_title) + gap

    spacing = max(1, int(sub_size * 0.26))
    draw_spaced(draw, (pad + max(1, pad // 40), y), SUBTITLE, font_sub, ACCENT, spacing)
    y += int(sub_size * 1.25) + int(title_size * 0.14)

    draw.rectangle([pad, y, pad + int(avail * 0.18), y + bar_h], fill=ACCENT)
    y += bar_h + int(title_size * 0.18)

    draw.text((pad, y), TAGLINE, font=font_tag, fill=TEXT_SOFT)
    return image


def compose_tall(size, source):
    """竖图：上方文字块，下方露出游戏画面。"""
    w, h = size
    image = build_background(source, size, "tall")
    draw = ImageDraw.Draw(image)

    pad = int(w * 0.085)
    avail = w - pad * 2

    font_title, title_size = fit_font(TITLE, avail, int(w * 0.20))
    sub_size = max(8, int(title_size * 0.24))
    font_sub, sub_size = fit_font(" ".join(SUBTITLE), avail, sub_size, max(8, int(w * 0.028)))
    tag_size = max(9, int(title_size * 0.24))
    font_tag, tag_size = fit_font(TAGLINE, avail * 0.95, tag_size, max(9, int(w * 0.03)))

    gap = max(6, int(title_size * 0.24))
    bar_h = max(2, int(title_size * 0.05))

    y = int(h * 0.10)
    draw.text((pad, y), TITLE, font=font_title, fill=(255, 255, 255))
    y += line_height(font_title) + gap

    spacing = max(1, int(sub_size * 0.24))
    draw_spaced(draw, (pad + 1, y), SUBTITLE, font_sub, ACCENT, spacing)
    y += int(sub_size * 1.4) + int(title_size * 0.16)

    draw.rectangle([pad, y, pad + int(avail * 0.24), y + bar_h], fill=ACCENT)
    y += bar_h + int(title_size * 0.20)

    for line in (TAGLINE.split("，")[0], "、".join(TAGLINE.split("，")[1:])):
        if not line:
            continue
        draw.text((pad, y), line, font=font_tag, fill=TEXT_SOFT)
        y += int(tag_size * 1.5)
    return image


def compose_logo(size):
    """透明 Logo：只有标题与副标题。"""
    w, h = size
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    pad = int(w * 0.05)
    # 先给一个偏大的起始字号，让 fit_font 收到「撑满可用宽度」，标题才会够大
    font_title, title_size = fit_font(TITLE, w - pad * 2, int(h * 0.62))
    sub_size = max(10, int(title_size * 0.22))
    font_sub, sub_size = fit_font(" ".join(SUBTITLE), w - pad * 2, sub_size, 10)

    gap = max(8, int(title_size * 0.20))
    total = line_height(font_title) + gap + int(sub_size * 1.35)
    y = (h - total) // 2
    stroke = max(2, int(title_size * 0.022))
    draw.text((pad, y), TITLE, font=font_title, fill=(255, 255, 255),
              stroke_width=stroke, stroke_fill=(6, 10, 18, 190))
    y += line_height(font_title) + gap

    # 逐字描边，保证在浅色库背景上也有轮廓
    x = pad + 1
    step = max(1, int(sub_size * 0.28))
    for ch in SUBTITLE:
        draw.text((x, y), ch, font=font_sub, fill=ACCENT,
                  stroke_width=max(1, stroke // 2), stroke_fill=(6, 10, 18, 160))
        x += draw.textlength(ch, font=font_sub) + step
    return image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=os.path.join(ROOT, "assets", "screenshots", "gameplay.png"))
    args = parser.parse_args()

    if not os.path.exists(args.source):
        raise SystemExit("找不到底图：%s" % args.source)

    os.makedirs(OUT_DIR, exist_ok=True)
    for name, size in SIZES.items():
        if name == "logo":
            image = compose_logo(size)
        elif name == "small_capsule":
            image = compose_compact(size, args.source)
        elif name in ("vertical_capsule", "library_capsule"):
            image = compose_tall(size, args.source)
        else:
            image = compose_wide(size, args.source)
        path = os.path.join(OUT_DIR, "%s_%dx%d.png" % (name, size[0], size[1]))
        image.save(path, "PNG", optimize=True)
        print("%-18s %4dx%-5d %7.1f KB" % (name, size[0], size[1], os.path.getsize(path) / 1024))

    print("\n共 %d 张，输出目录：%s" % (len(SIZES), OUT_DIR))
    return 0


if __name__ == "__main__":
    sys.exit(main())
