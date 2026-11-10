# -*- coding: utf-8 -*-
"""生成应用图标：assets/icon.png 与 assets/icon.ico。

仅使用 Pillow 绘制几何图形，不依赖外部素材。
运行：py -3.10 packaging/make_icon.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

SCALE = 1024
SIZE = 256


def load_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = (
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/msyhbd.ttc",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_base() -> Image.Image:
    image = Image.new("RGBA", (SCALE, SCALE), (0, 0, 0, 0))
    # 圆角深色底
    background = Image.new("RGBA", (SCALE, SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(background)
    draw.rounded_rectangle((16, 16, SCALE - 16, SCALE - 16), radius=200, fill=(9, 14, 23, 255))
    draw.rounded_rectangle(
        (16, 16, SCALE - 16, SCALE - 16), radius=200, outline=(36, 62, 82, 255), width=8
    )
    # 顶部青色光晕
    glow = Image.new("RGBA", (SCALE, SCALE), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for radius, alpha in ((400, 18), (300, 26), (200, 34)):
        glow_draw.ellipse(
            (SCALE // 2 - radius, -radius // 2, SCALE // 2 + radius, radius),
            fill=(0, 224, 255, alpha),
        )
    background.alpha_composite(glow)
    image.alpha_composite(background)
    return image


def draw_shield(image: Image.Image) -> None:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # 外层盾牌
    outer = [
        (SCALE // 2, 120),
        (SCALE - 190, 235),
        (SCALE - 205, 505),
        (SCALE // 2, 720),
        (205, 505),
        (190, 235),
    ]
    draw.polygon(outer, fill=(0, 224, 255, 255))

    # 内层盾牌
    inner = [
        (SCALE // 2, 190),
        (SCALE - 255, 285),
        (SCALE - 268, 500),
        (SCALE // 2, 660),
        (268, 500),
        (255, 285),
    ]
    draw.polygon(inner, fill=(10, 18, 28, 255))

    # 中心 “0”：零日值班的“零”
    font = load_font(300)
    text = "0"
    box = draw.textbbox((0, 0), text, font=font)
    text_width = box[2] - box[0]
    draw.text(
        (SCALE // 2 - text_width / 2 - box[0], 250 - box[1]),
        text,
        font=font,
        fill=(0, 224, 255, 255),
    )

    # “0”下方的一条短横线，形成“零日”的切割感
    draw.rounded_rectangle(
        (SCALE // 2 - 92, 545, SCALE // 2 + 92, 561),
        radius=8,
        fill=(240, 196, 60, 255),
    )

    # 四个角的电路点
    for x, y in ((150, 150), (SCALE - 150, 150), (150, SCALE - 150), (SCALE - 150, SCALE - 150)):
        draw.ellipse((x - 10, y - 10, x + 10, y + 10), fill=(0, 224, 255, 180))
        draw.line((x, y, x + (30 if x < SCALE // 2 else -30), y), fill=(0, 224, 255, 150), width=5)

    image.alpha_composite(overlay)


def main() -> None:
    image = make_base()
    draw_shield(image)
    icon_256 = image.resize((SIZE, SIZE), Image.LANCZOS)
    icon_256.save(ASSETS / "icon.png", "PNG", optimize=True)
    icon_256.save(
        ASSETS / "icon.ico",
        "ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"[图标] 已生成：{ASSETS / 'icon.png'}")
    print(f"[图标] 已生成：{ASSETS / 'icon.ico'}")


if __name__ == "__main__":
    main()
