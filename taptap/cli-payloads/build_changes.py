# -*- coding: utf-8 -*-
"""根据已上传素材的 asset-map.json 拼出 app save-changes 的 payload。

只填「文案 + 图片」这类客观字段：
  description / promotion_material_type / promotion_text / developer_message
  banner_4 / screenshots / logo / cover / cover_vertical / library_hero / icon
不碰防沉迷声明、适龄分级、资质材料（这些要开发者本人决定）。

用法：
    python build_changes.py            # 生成 changes.json
    python build_changes.py --check     # 只打印将被写入的字段
"""

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
MAP_FILE = os.path.join(HERE, "asset-map.json")
BASIC = os.path.join(HERE, "module-basic-info-out.json")
OUT = os.path.join(HERE, "changes.json")

DESCRIPTION = """你是深夜唯一的安全值班员。10 个回合、6 条攻击链，每回合只有 6 点行动点。

调查、控制、清除、恢复，四步缺一不可：只隔离不清除会扣分，清除后不恢复业务，收入继续掉。
下手太重也不行——把业务全关停，同样判负。

回合制安全运营，支持鼠标、命令行、自动化脚本三种操作方式。所有公司、IP、数据均为虚构。"""

DEVELOPER_MESSAGE = """一个人做完的小项目。最初只想讲清一件事：为什么安全处置有先后顺序。

先控制再清除、清除完要恢复，少一步都不算解决——这句话做成游戏以后，比讲十遍 PPT 都直观。
现在还在打磨，欢迎在评论区告诉我你想要什么玩法。"""

PROMOTION_TEXT = "10 小时掐断六条攻击链"

# 文件名 -> 字段
IMAGE_FIELDS = {
    "logo": "logo_1280x720.png",
    "cover": "cover_460x215.png",
    "cover_vertical": "cover_600x900.png",
    "library_hero": "library_hero_3840x1240.png",
    "banner_4": "banner_4_1920x1080.png",
}

SCREENSHOTS = [
    "shot_01_gameplay.png",
    "shot_02_tutorial.png",
    "shot_04_decision.png",
    "shot_05_result.png",
]


def image_value(entry):
    """save-changes 要求 {url, info}，info 五个字段都要有。"""
    info = entry["info"]
    return {
        "url": entry["url"],
        "info": {
            "format": info["format"],
            "size": info["size"],
            "width": info["width"],
            "height": info["height"],
            "image_ave": info["image_ave"],
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    with open(MAP_FILE, encoding="utf-8") as fh:
        assets = json.load(fh)
    with open(BASIC, encoding="utf-8") as fh:
        basic = json.load(fh)
    icon_current = basic["data"]["result"]["fields"]["icon"]["current_value"]

    missing = [n for n in list(IMAGE_FIELDS.values()) + SCREENSHOTS if n not in assets]
    if missing:
        raise SystemExit("asset-map.json 缺少：%s" % ", ".join(missing))

    changes = [
        {"field_id": "description", "expected": None, "value": DESCRIPTION},
        {"field_id": "promotion_material_type", "expected": None, "value": "BANNER_4"},
        {"field_id": "promotion_text", "expected": None, "value": PROMOTION_TEXT},
        {"field_id": "developer_message", "expected": None, "value": DEVELOPER_MESSAGE},
    ]

    for field_id, name in IMAGE_FIELDS.items():
        changes.append({
            "field_id": field_id,
            "expected": None,
            "value": image_value(assets[name]),
        })

    changes.append({
        "field_id": "screenshots",
        "expected": None,
        "op": "replace",
        "value": [image_value(assets[name]) for name in SCREENSHOTS],
    })

    # 图标当前是默认图，替换成我们自己的（带 expected 防漂移）
    changes.append({
        "field_id": "icon",
        "expected": icon_current,
        "value": image_value(assets["icon_512x512.png"]),
    })

    payload = {"changes": changes}
    with open(OUT, "w", encoding="utf-8", newline="") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)

    print("字段 %d 个 → %s" % (len(changes), OUT))
    for change in changes:
        value = change.get("value")
        summary = "图片" if isinstance(value, dict) and "url" in value else (
            "%d 张图" % len(value) if isinstance(value, list) else
            (value[:24] + "…" if isinstance(value, str) and len(value) > 24 else value))
        print("  %-24s %s" % (change["field_id"], summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
