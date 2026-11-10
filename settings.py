# -*- coding: utf-8 -*-
"""全局配置与工具函数。

本项目只做课程演示：所有数据均为虚构，IP 使用文档保留地址段，
不扫描真实网络、不连接真实服务器、不执行任何系统命令。
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# 路径
# ---------------------------------------------------------------------------
def _is_frozen() -> bool:
    """是否运行在 PyInstaller 打包后的环境中。"""
    return bool(getattr(sys, "frozen", False))


def _bundle_dir() -> Path:
    """只读资源目录：源码运行时是项目目录，打包后是解包目录。"""
    if _is_frozen():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parent


def _app_dir() -> Path:
    """可写目录：源码运行时是项目目录，打包后是 exe 所在目录。"""
    if _is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


BASE_DIR = _bundle_dir()
APP_DIR = _app_dir()
DATA_DIR = BASE_DIR / "data"
SAVE_DIR = APP_DIR / "saves"
ASSET_DIR = BASE_DIR / "assets"
EVENTS_FILE = DATA_DIR / "events.json"
DEVICES_FILE = DATA_DIR / "devices.json"
UPGRADES_FILE = DATA_DIR / "upgrades.json"
DECISIONS_FILE = DATA_DIR / "decisions.json"
SAVE_FILE = SAVE_DIR / "savegame.json"
HISTORY_FILE = SAVE_DIR / "history.json"

# ---------------------------------------------------------------------------
# 基本信息
# ---------------------------------------------------------------------------
GAME_TITLE = "零日值班：网络安全防御模拟器"
GAME_VERSION = "v1.0.1"
COMPANY_NAME = "云栖示例科技（虚构）"

SCREEN_WIDTH = 1280
SCREEN_HEIGHT = 720
SCREEN_SIZE = (SCREEN_WIDTH, SCREEN_HEIGHT)
FPS = 60

# ---------------------------------------------------------------------------
# 回合与资源
# ---------------------------------------------------------------------------
TOTAL_TURNS = 10            # 一局持续的小时数（回合数）
START_HOUR = 22             # 夜班从 22:00 开始，每回合推进 1 小时
ACTION_POINTS_PER_TURN = 6  # 每回合行动点（第二阶段起提高到 6）
TURN_INCOME = 120           # 每回合到账的服务合同收入
TURN_UPKEEP = 40            # 每回合的值班运维成本

INITIAL_SECURITY = 74
INITIAL_FUNDS = 1200
INITIAL_REPUTATION = 78
INITIAL_AVAILABILITY = 100
INITIAL_INTEGRITY = 100

SECURITY_FAIL = 0           # 安全度 <= 0 判负
INTEGRITY_FAIL = 20         # 数据完整度 <= 20 判负
AVAILABILITY_FAIL = 40      # 可用性低于该值并持续若干回合判负
AVAILABILITY_FAIL_TURNS = 3
FUNDS_WARN = 120            # 资金低于该值时给出提示（第一阶段不做资金判负）

# ---------------------------------------------------------------------------
# 风险估计
# ---------------------------------------------------------------------------
RISK_MARGIN_MAX = 28        # 完全无证据时的估计半宽
RISK_MARGIN_MIN = 4         # 证据充分时的估计半宽
CONFIDENCE_BASE = 0.08
CONFIDENCE_PER_CLUE = 0.16
CONFIDENCE_PER_INVESTIGATION = 0.18
CONFIDENCE_MAX = 0.95

# ---------------------------------------------------------------------------
# 操作消耗（行动点 / 资金）
# ---------------------------------------------------------------------------
COST_INVESTIGATE = (1, 20)
COST_ISOLATE = (2, 30)
COST_UNISOLATE = (1, 0)
COST_DELETE_MAIL = (1, 10)
COST_RESET_PASSWORD = (1, 35)
COST_BLOCK_SOURCE = (1, 25)
COST_PATCH = (1, 45)
COST_SHUTDOWN = (2, 0)
COST_STARTUP = (1, 0)
COST_RESTORE = (2, 90)
COST_PROTECT_BACKUP = (1, 70)

# ---------------------------------------------------------------------------
# 颜色（深色安全监控中心风格）
# ---------------------------------------------------------------------------
BG = (9, 13, 20)
BG_GRID = (17, 24, 35)
PANEL_BG = (16, 23, 34)
PANEL_BG_ALT = (21, 31, 45)
PANEL_HEADER = (23, 34, 49)
PANEL_BORDER = (38, 54, 74)
PANEL_BORDER_LIGHT = (56, 78, 104)
TEXT = (226, 235, 244)
TEXT_DIM = (137, 156, 178)
TEXT_FAINT = (88, 104, 124)
ACCENT = (0, 224, 255)
ACCENT_DARK = (0, 110, 132)
GREEN = (64, 208, 130)
YELLOW = (240, 196, 60)
ORANGE = (240, 140, 50)
RED = (236, 88, 84)
PURPLE = (168, 120, 230)
BLUE = (84, 160, 240)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

STATUS_COLORS = {
    "正常": GREEN,
    "可疑": YELLOW,
    "感染": RED,
    "隔离": PURPLE,
    "离线": TEXT_FAINT,
}

STATUS_GLYPHS = {
    "正常": "●",
    "可疑": "▲",
    "感染": "×",
    "隔离": "■",
    "离线": "○",
}

ALERT_LEVEL_COLORS = {
    "极危": (255, 64, 96),
    "高危": RED,
    "中危": ORANGE,
    "低危": YELLOW,
    "信息": BLUE,
}

METRIC_COLORS = {
    "security": ACCENT,
    "funds": YELLOW,
    "reputation": PURPLE,
    "availability": GREEN,
    "integrity": BLUE,
}

# ---------------------------------------------------------------------------
# 字体
# ---------------------------------------------------------------------------
FONT_TITLE = 26
FONT_H2 = 18
FONT_BODY = 15
FONT_SMALL = 13
FONT_TINY = 11
FONT_HUGE = 46

FONT_FILE_CANDIDATES = (
    "msyh.ttc",
    "msyhbd.ttc",
    "msyhl.ttc",
    "simhei.ttf",
    "simsun.ttc",
    "simsunb.ttf",
    "Deng.ttf",
    "Dengb.ttf",
    "STZHONGS.TTF",
    "STXIHEI.TTF",
)
FONT_KEYWORDS = ("msyh", "simhei", "simsun", "deng", "noto", "sourcehan", "wqy", "yahei")
FONT_FAMILY_CANDIDATES = (
    "microsoftyahei",
    "microsoftyaheiui",
    "simhei",
    "simsun",
    "dengxian",
    "notosanscjksc",
    "notosansmonocjksc",
    "wenquanyimicrohei",
    "sourcehansanssc",
)


class DataError(Exception):
    """数据文件缺失、为空或 JSON 格式错误时抛出。"""


def load_json(path: Path | str) -> Any:
    """读取 UTF-8 JSON 文件，并把常见错误转换成可读的中文异常。"""
    path = Path(path)
    if not path.exists():
        raise DataError(f"缺少数据文件：{path}\n请确认 data 目录完整，且与 settings.py 位于同一项目目录。")
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise DataError(f"无法读取数据文件：{path}\n{exc}") from exc
    if not text.strip():
        raise DataError(f"数据文件为空：{path.name}")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise DataError(
            f"数据文件 {path.name} 不是合法的 JSON：第 {exc.lineno} 行第 {exc.colno} 列，{exc.msg}"
        ) from exc


def _font_dirs() -> list[Path]:
    """返回可能的字体目录，优先使用系统字体目录。"""
    dirs: list[Path] = []
    windir = os.environ.get("WINDIR") or os.environ.get("SystemRoot")
    if windir:
        dirs.append(Path(windir) / "Fonts")
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        dirs.append(Path(local_appdata) / "Microsoft" / "Windows" / "Fonts")
    dirs.append(Path("C:/Windows/Fonts"))
    # 去重且只保留真实存在的目录
    result: list[Path] = []
    seen: set[str] = set()
    for directory in dirs:
        key = str(directory).lower()
        if key in seen:
            continue
        seen.add(key)
        try:
            if directory.is_dir():
                result.append(directory)
        except OSError:
            continue
    return result


def find_chinese_font() -> Path | None:
    """在 Windows 常见字体中寻找可用中文字体，找不到返回 None。"""
    dirs = _font_dirs()

    # 1. 直接匹配常见字体文件名
    for directory in dirs:
        for filename in FONT_FILE_CANDIDATES:
            candidate = directory / filename
            try:
                if candidate.is_file():
                    return candidate
            except OSError:
                continue

    # 2. 扫描字体目录，按关键字匹配
    for directory in dirs:
        try:
            files = sorted(directory.glob("*.tt*"))
        except OSError:
            continue
        for candidate in files:
            if any(keyword in candidate.name.lower() for keyword in FONT_KEYWORDS):
                return candidate

    # 3. 交给 pygame 的字体匹配器兜底
    try:
        import pygame

        if not pygame.font.get_init():
            pygame.font.init()
        for family in FONT_FAMILY_CANDIDATES:
            path = pygame.font.match_font(family)
            if path:
                return Path(path)
    except Exception:  # pygame 未安装或初始化失败时忽略
        pass
    return None


def clock_text(turn: int) -> str:
    """把回合号换算成夜班时间，例如第 1 回合 -> 22:00。"""
    hour = (START_HOUR + max(0, turn - 1)) % 24
    return f"{hour:02d}:00"


def format_money(value: int) -> str:
    return f"¥{value}"


# ---------------------------------------------------------------------------
# 界面布局（矩形用 (x, y, w, h) 表示，UI 层再转成 pygame.Rect）
# ---------------------------------------------------------------------------
LAYOUT = {
    "top_bar": (0, 0, 1280, 56),
    "network": (8, 62, 600, 324),
    "device": (8, 392, 600, 166),
    "bottom": (8, 564, 600, 148),
    "alerts": (616, 62, 656, 236),
    "log": (616, 304, 656, 206),
    "actions": (616, 516, 656, 196),
}
