#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""上架前自检：素材尺寸、截数量、构建目录、SteamPipe 配置是否就绪。

用法：
    python steam/scripts/check_assets.py
    python steam/scripts/check_assets.py --strict   # 占位符没换也算失败

退出码 0 = 可以上传；1 = 有阻塞项。
"""

import argparse
import os
import re
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
STEAM = os.path.join(ROOT, "steam")

CAPSULES = {
    "main_capsule_1232x706.png": (1232, 706),
    "small_capsule_231x87.png": (231, 87),
    "header_capsule_460x215.png": (460, 215),
    "vertical_capsule_748x896.png": (748, 896),
    "library_capsule_600x900.png": (600, 900),
    "library_hero_3840x1240.png": (3840, 1240),
    "logo_1280x720.png": (1280, 720),
}

OK = "  OK  "
BAD = " FAIL "


def check_file(path, label, results):
    if os.path.exists(path):
        results.append((True, label, "%d KB" % round(os.path.getsize(path) / 1024)))
        return True
    results.append((False, label, "缺失：%s" % os.path.relpath(path, ROOT)))
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="占位符未替换即视为失败")
    args = parser.parse_args()

    results = []
    blocking = []

    # 1. 胶囊图
    cap_dir = os.path.join(STEAM, "store", "capsules")
    for name, size in CAPSULES.items():
        path = os.path.join(cap_dir, name)
        if not os.path.exists(path):
            results.append((False, name, "缺失"))
            blocking.append(name)
            continue
        with Image.open(path) as im:
            w, h = im.size
            ok = (w, h) == size
            results.append((ok, name, "%dx%d%s" % (w, h, "" if ok else "（应为 %dx%d）" % size)))
            if not ok:
                blocking.append(name)

    # 2. 商店截图
    shot_dir = os.path.join(STEAM, "store", "screenshots")
    shots = sorted(f for f in os.listdir(shot_dir) if f.endswith(".png")) if os.path.isdir(shot_dir) else []
    if len(shots) < 5:
        results.append((False, "商店截图", "只有 %d 张（Steam 要求 ≥5）" % len(shots)))
        blocking.append("screenshots")
    else:
        results.append((True, "商店截图", "%d 张" % len(shots)))
    bad_size = []
    for name in shots:
        with Image.open(os.path.join(shot_dir, name)) as im:
            if im.size != (1920, 1080):
                bad_size.append(name)
    if bad_size:
        results.append((False, "截图分辨率", "非 1920x1080：%s" % ", ".join(bad_size[:3])))
        blocking.append("screenshot-size")
    else:
        results.append((True, "截图分辨率", "全部 1920x1080"))

    # 3. 待上传内容
    content = os.path.join(STEAM, "content")
    exe = os.path.join(content, "零日值班.exe")
    if check_file(exe, "steam/content/零日值班.exe", results):
        stale = []
        results.append((True, "content 大小", "%.1f MB" % (sum(
            os.path.getsize(os.path.join(dp, f))
            for dp, _, fs in os.walk(content) for f in fs
        ) / 1024 / 1024)))
        if os.path.exists(os.path.join(content, "steam_appid.txt")):
            results.append((False, "content/steam_appid.txt", "正式 depot 里不该带这个文件"))
            blocking.append("steam_appid.txt")
    else:
        blocking.append("content")

    # 4. SteamPipe 配置
    for name in ("app_build.vdf", "depot_build.vdf"):
        path = os.path.join(STEAM, "build", name)
        if not os.path.exists(path):
            results.append((False, name, "缺失"))
            blocking.append(name)
            continue
        text = open(path, encoding="utf-8-sig").read()
        placeholders = sorted(set(re.findall(r"[A-Z_]+PLACEHOLDER", text)))
        if placeholders:
            results.append((False, name, "仍是占位符：%s（建好 App 后填真实 ID）" % ", ".join(placeholders)))
            blocking.append(name)
        else:
            results.append((True, name, "已填 AppID / DepotID"))

    # 5. 文案
    docs = ("description.zh.md", "metadata.md", "screenshots.md")
    for name in docs:
        ok = os.path.exists(os.path.join(STEAM, "store", name))
        check_file(os.path.join(STEAM, "store", name), "store/" + name, results)
        if not ok and args.strict:
            blocking.append(name)

    width = max(len(label) for _, label, _ in results)
    print()
    for ok, label, detail in results:
        print("%s %s  %s" % (OK if ok else BAD, label.ljust(width), detail))
    print()
    if blocking:
        print("阻塞项 %d 个：%s" % (len(blocking), ", ".join(blocking)))
        print("素材和内容都齐了，剩下的就是：建 App → 填 AppID/DepotID → 跑 upload.ps1。")
        return 1
    print("全部就绪，可以跑 scripts/upload.ps1 了。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
